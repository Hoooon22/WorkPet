/**
 * watchSetup.ts — Gmail / Calendar Push 알림 구독 설정
 *
 * Gmail watch():
 *   - Gmail 메일박스 변경 시 Pub/Sub 토픽으로 신호를 보낸다.
 *   - 최대 7일 유효 → 6일마다 갱신
 *
 * Calendar events.watch():
 *   - 캘린더 이벤트 변경 시 Cloud Function URL(Webhook)로 POST한다.
 *   - 최대 7일 유효 → 6일마다 갱신
 */

import { CONFIG } from '../config'
import { fetchWithAuth } from './auth'
import { getUserEmail } from './fcm'

const GMAIL_WATCH_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/watch'
const CALENDAR_WATCH_URL =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch'

interface WatchState {
  gmailExpiry: number       // expiration timestamp (ms)
  calendarChannelId: string
  calendarExpiry: number
}

// ---- Gmail Watch ----

export async function setupGmailWatch(): Promise<void> {
  const res = await fetchWithAuth(GMAIL_WATCH_URL, {
    method: 'POST',
    body: JSON.stringify({
      topicName: CONFIG.PUBSUB_TOPIC,
      labelIds: ['INBOX'],
    }),
  })

  if (!res || !res.ok) {
    console.error('[Orbit] Gmail watch 설정 실패:', res?.status)
    return
  }

  const data = await res.json() as { expiration?: string }
  const expiry = data.expiration ? Number(data.expiration) : Date.now() + CONFIG.WATCH_RENEW_INTERVAL_MS

  await chrome.storage.local.set({ gmailExpiry: expiry })
  console.log('[Orbit] Gmail watch 설정 완료. 만료:', new Date(expiry).toLocaleString())
}

// ---- Calendar Watch ----

export async function setupCalendarWatch(gcmToken: string): Promise<void> {
  const channelId = crypto.randomUUID()

  const res = await fetchWithAuth(CALENDAR_WATCH_URL, {
    method: 'POST',
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: `${CONFIG.FUNCTIONS_BASE_URL}/onCalendarPush`,
    }),
  })

  if (!res || !res.ok) {
    console.error('[Orbit] Calendar watch 설정 실패:', res?.status)
    return
  }

  const data = await res.json() as { expiration?: string }
  const expiry = data.expiration ? Number(data.expiration) : Date.now() + CONFIG.WATCH_RENEW_INTERVAL_MS

  // Cloud Function에 channelId ↔ gcmToken 매핑 저장
  const email = await getUserEmail()
  if (email) {
    try {
      await fetch(`${CONFIG.FUNCTIONS_BASE_URL}/registerCalendarChannel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, email, token: gcmToken }),
      })
    } catch (err) {
      console.error('[Orbit] Calendar 채널 등록 실패:', err)
    }
  }

  await chrome.storage.local.set({ calendarChannelId: channelId, calendarExpiry: expiry })
  console.log('[Orbit] Calendar watch 설정 완료. channelId:', channelId)
}

// ---- 만료 체크 및 갱신 ----

export async function renewWatchesIfNeeded(): Promise<void> {
  const now = Date.now()
  const stored = await chrome.storage.local.get([
    'gmailExpiry',
    'calendarExpiry',
    'gcmToken',
  ]) as Partial<WatchState & { gcmToken: string }>

  const needsGmailRenew =
    !stored.gmailExpiry || now > stored.gmailExpiry - 60 * 60 * 1000  // 1시간 전 갱신

  const needsCalendarRenew =
    !stored.calendarExpiry || now > stored.calendarExpiry - 60 * 60 * 1000

  if (needsGmailRenew) {
    console.log('[Orbit] Gmail watch 갱신 중...')
    await setupGmailWatch()
  }

  if (needsCalendarRenew && stored.gcmToken) {
    console.log('[Orbit] Calendar watch 갱신 중...')
    await setupCalendarWatch(stored.gcmToken)
  }
}
