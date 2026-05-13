import { fetchWithAuth } from './fetchWithAuth'
import { getValue, setValue, KEYS } from '../storage'
import type { EmailItem } from '../types'

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export async function storeCurrentHistoryId(): Promise<void> {
  const res = await fetchWithAuth(`${BASE_URL}/profile`)
  if (!res || !res.ok) return
  const data = (await res.json()) as { historyId?: string }
  if (data.historyId) {
    await setValue(KEYS.GMAIL_HISTORY_ID, data.historyId)
  }
}

export async function fetchNewEmailsViaHistory(): Promise<EmailItem[]> {
  const historyId = await getValue<string>(KEYS.GMAIL_HISTORY_ID)
  if (!historyId) {
    await storeCurrentHistoryId()
    return []
  }

  const res = await fetchWithAuth(
    `${BASE_URL}/history?startHistoryId=${historyId}` +
      `&historyTypes=messageAdded&labelId=INBOX&maxResults=20`,
  )
  if (!res || !res.ok) {
    if (res?.status === 404) {
      console.warn('[Orbit] Gmail historyId expired — re-init')
      await storeCurrentHistoryId()
    } else {
      console.warn('[Orbit] Gmail History API failed:', res?.status)
    }
    return []
  }

  const data = (await res.json()) as GmailHistoryResponse
  if (data.historyId) await setValue(KEYS.GMAIL_HISTORY_ID, data.historyId)
  if (!data.history || data.history.length === 0) return []

  const newMessageIds = new Set<string>()
  for (const item of data.history) {
    for (const added of item.messagesAdded ?? []) {
      const labels = added.message.labelIds ?? []
      if (!labels.includes('INBOX') || labels.includes('SENT')) continue
      // 프로모션/소셜/포럼 카테고리는 사용자와 직접 관련 없는 자동 발송 메일로 간주해 제외한다.
      if (
        labels.includes('CATEGORY_PROMOTIONS') ||
        labels.includes('CATEGORY_SOCIAL') ||
        labels.includes('CATEGORY_FORUMS')
      ) {
        continue
      }
      newMessageIds.add(added.message.id)
    }
  }
  if (newMessageIds.size === 0) return []

  const details = await Promise.all(
    [...newMessageIds].map(async (id) => {
      const r = await fetchWithAuth(
        `${BASE_URL}/messages/${id}?format=metadata` +
          `&metadataHeaders=Subject&metadataHeaders=From`,
      )
      if (!r || !r.ok) return null
      try {
        return (await r.json()) as GmailMessage
      } catch {
        return null
      }
    }),
  )

  return details
    .filter((msg): msg is GmailMessage => msg !== null)
    .map((msg) => normalizeMessage(msg, 'inbox'))
}

export async function fetchUnreadEmails(): Promise<EmailItem[]> {
  // 프로모션/소셜/포럼 카테고리는 사용자와 직접 관련 없는 자동 발송 메일로 간주해 쿼리에서 제외한다.
  const query = 'is:unread -category:promotions -category:social -category:forums'
  const listRes = await fetchWithAuth(
    `${BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=5`,
  )
  if (!listRes || !listRes.ok) {
    console.warn('[Orbit] Gmail list API failed:', listRes?.status)
    return []
  }
  const listData = await listRes.json()
  const messages: { id: string }[] = listData.messages ?? []
  if (messages.length === 0) return []

  const details = await Promise.all(
    messages.map(async ({ id }) => {
      const res = await fetchWithAuth(
        `${BASE_URL}/messages/${id}?format=metadata` +
          `&metadataHeaders=Subject&metadataHeaders=From`,
      )
      if (!res || !res.ok) return null
      try {
        return (await res.json()) as GmailMessage
      } catch {
        return null
      }
    }),
  )

  return details
    .filter((msg): msg is GmailMessage => msg !== null)
    .map((msg) => normalizeMessage(msg, 'all'))
}

function normalizeMessage(
  msg: GmailMessage,
  linkPrefix: 'inbox' | 'all',
): EmailItem {
  const headers = msg.payload?.headers ?? []
  const subject = getHeader(headers, 'Subject') ?? '(제목 없음)'
  const fromRaw = getHeader(headers, 'From') ?? ''
  const fromName = fromRaw.replace(/<[^>]+>/, '').trim() || fromRaw
  return {
    id: msg.id,
    subject,
    from: fromName,
    snippet: msg.snippet ?? '',
    receivedAt: new Date(Number(msg.internalDate ?? 0)).toISOString(),
    link: `https://mail.google.com/mail/u/0/#${linkPrefix}/${msg.id}`,
    isMondayEmail: detectMondayEmail(fromRaw, subject),
  }
}

interface GmailHeader {
  name: string
  value: string
}
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

function detectMondayEmail(from: string, subject: string): boolean {
  const fromLower = from.toLowerCase()
  const subjectLower = subject.toLowerCase()
  return (
    fromLower.includes('@monday.com') ||
    fromLower.includes('monday.com') ||
    subjectLower.includes('monday.com') ||
    subjectLower.includes('on monday') ||
    subjectLower.includes('in monday')
  )
}
