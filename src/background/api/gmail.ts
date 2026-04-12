/**
 * gmail.ts — Gmail API 연동
 * 읽지 않은 메일 목록을 조회한다.
 */

import { fetchWithAuth } from './auth'
import type { EmailItem } from '../../types/messages'

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'

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
        id:         msg.id,
        subject,
        from:       fromName,
        snippet:    msg.snippet ?? '',
        receivedAt: new Date(Number(msg.internalDate)).toISOString(),
        link:       `https://mail.google.com/mail/u/0/#all/${msg.id}`,
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

function getHeader(headers: GmailHeader[], name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
}
