/**
 * gmail.ts — Gmail API 연동
 * 읽지 않은 메일 목록을 조회한다.
 */

import { fetchWithAuth } from './auth'
import type { EmailItem } from '../../types/messages'

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'

// ---- Gmail History API (실시간 메일 감지) ----

/**
 * 현재 Gmail historyId를 Storage에 저장한다.
 * 최초 초기화 시 호출하여 "이 시점 이후의 새 메일"만 알림 대상으로 삼는다.
 */
export async function storeCurrentHistoryId(): Promise<void> {
  const res = await fetchWithAuth(`${BASE_URL}/profile`)
  if (!res || !res.ok) return
  const data = await res.json() as { historyId?: string }
  if (data.historyId) {
    await chrome.storage.local.set({ gmailHistoryId: data.historyId })
    console.log('[Orbit] Gmail historyId 초기화:', data.historyId)
  }
}

/**
 * Gmail History API로 마지막 확인 이후 새로 받은 INBOX 메일만 반환한다.
 * historyId가 없으면 현재 historyId를 저장하고 빈 배열을 반환한다.
 */
export async function fetchNewEmailsViaHistory(): Promise<EmailItem[]> {
  const { gmailHistoryId } = await chrome.storage.local.get(['gmailHistoryId'])

  if (!gmailHistoryId) {
    // 처음 실행 — 기준점만 설정, 알림 없음
    await storeCurrentHistoryId()
    return []
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/history?startHistoryId=${gmailHistoryId}` +
    `&historyTypes=messageAdded&labelId=INBOX&maxResults=20`
  )

  if (!res || !res.ok) {
    if (res?.status === 404) {
      // historyId 만료 → 재초기화
      console.warn('[Orbit] Gmail historyId 만료 — 재초기화')
      await storeCurrentHistoryId()
    } else {
      console.warn('[Orbit] Gmail History API 실패:', res?.status)
    }
    return []
  }

  const data = await res.json() as GmailHistoryResponse

  // 새 historyId 저장
  if (data.historyId) {
    await chrome.storage.local.set({ gmailHistoryId: data.historyId })
  }

  if (!data.history || data.history.length === 0) return []

  // 새로 추가된 메시지 ID 수집 (중복 제거)
  const newMessageIds = new Set<string>()
  for (const item of data.history) {
    for (const added of item.messagesAdded ?? []) {
      const labels = added.message.labelIds ?? []
      if (labels.includes('INBOX') && !labels.includes('SENT')) {
        newMessageIds.add(added.message.id)
      }
    }
  }

  if (newMessageIds.size === 0) return []

  // 메시지 상세 조회
  const details = await Promise.all(
    [...newMessageIds].map(async (id) => {
      const r = await fetchWithAuth(
        `${BASE_URL}/messages/${id}?format=metadata` +
        `&metadataHeaders=Subject&metadataHeaders=From`
      )
      if (!r || !r.ok) return null
      return r.json() as Promise<GmailMessage>
    })
  )

  return details
    .filter((msg): msg is GmailMessage => msg !== null)
    .map((msg) => {
      const headers  = msg.payload?.headers ?? []
      const subject  = getHeader(headers, 'Subject') ?? '(제목 없음)'
      const fromRaw  = getHeader(headers, 'From') ?? ''
      const fromName = fromRaw.replace(/<[^>]+>/, '').trim() || fromRaw
      return {
        id:             msg.id,
        subject,
        from:           fromName,
        snippet:        msg.snippet ?? '',
        receivedAt:     new Date(Number(msg.internalDate)).toISOString(),
        link:           `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
        isMondayEmail:  detectMondayEmail(fromRaw, subject),
      }
    })
}

// ---- 기존 읽지 않은 메일 목록 (폴백용) ----

/** 읽지 않은 메일 최대 5개를 반환한다. */
export async function fetchUnreadEmails(): Promise<EmailItem[]> {
  // 1. 읽지 않은 메시지 ID 목록 조회
  const listRes = await fetchWithAuth(
    `${BASE_URL}/messages?q=is%3Aunread&maxResults=5`
  )
  if (!listRes || !listRes.ok) {
    console.warn('[Orbit] Gmail list API 실패:', listRes?.status)
    return []
  }

  const listData = await listRes.json()
  const messages: { id: string }[] = listData.messages ?? []
  if (messages.length === 0) return []

  // 2. 각 메시지 상세 조회 (메타데이터만)
  const details = await Promise.all(
    messages.map(async ({ id }) => {
      const res = await fetchWithAuth(
        `${BASE_URL}/messages/${id}?format=metadata` +
        `&metadataHeaders=Subject&metadataHeaders=From`
      )
      if (!res || !res.ok) return null
      return res.json() as Promise<GmailMessage>
    })
  )

  return details
    .filter((msg): msg is GmailMessage => msg !== null)
    .map((msg) => {
      const headers = msg.payload?.headers ?? []
      const subject = getHeader(headers, 'Subject') ?? '(제목 없음)'
      const fromRaw = getHeader(headers, 'From') ?? ''

      // "이름 <email>" → "이름" 또는 "email"만 추출
      const fromName = fromRaw.replace(/<[^>]+>/, '').trim() || fromRaw

      return {
        id:            msg.id,
        subject,
        from:          fromName,
        snippet:       msg.snippet ?? '',
        receivedAt:    new Date(Number(msg.internalDate)).toISOString(),
        link:          `https://mail.google.com/mail/u/0/#all/${msg.id}`,
        isMondayEmail: detectMondayEmail(fromRaw, subject),
      }
    })
}

// ---- Gmail API 응답 타입 (내부용) ----
interface GmailHeader { name: string; value: string }
interface GmailMessage {
  id: string
  snippet?: string
  internalDate?: string
  payload?: { headers?: GmailHeader[] }
}

interface GmailHistoryAddedMessage {
  message: { id: string; threadId: string; labelIds?: string[] }
}
interface GmailHistoryItem {
  id: string
  messagesAdded?: GmailHistoryAddedMessage[]
}
interface GmailHistoryResponse {
  history?: GmailHistoryItem[]
  nextPageToken?: string
  historyId: string
}

function getHeader(headers: GmailHeader[], name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
}

/** monday.com 발신 여부 판별 */
function detectMondayEmail(from: string, subject: string): boolean {
  const fromLower    = from.toLowerCase()
  const subjectLower = subject.toLowerCase()
  return (
    fromLower.includes('@monday.com') ||
    fromLower.includes('monday.com') ||
    subjectLower.includes('monday.com') ||
    // monday.com 알람 메일 제목 패턴
    subjectLower.includes('on monday') ||
    subjectLower.includes('in monday')
  )
}
