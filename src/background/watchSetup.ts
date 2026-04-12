import { CONFIG } from './config'
import { getAuthToken } from './api/auth'

/** Gmail Watch 등록. 실패 시 throw하여 호출 측에서 성공 여부를 판단할 수 있게 한다. */
export async function setupGmailWatch(): Promise<void> {
  const token = await getAuthToken(false)
  if (!token) throw new Error('No auth token available')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName: CONFIG.PUBSUB_TOPIC,
      labelIds: ['INBOX'],
      labelFilterAction: 'include',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Gmail watch setup failed: ${res.status} ${text}`)
  }

  console.log('[Orbit] Gmail watch setup successfully')
}

/** Calendar Watch 등록. 실패 시 throw하여 호출 측에서 성공 여부를 판단할 수 있게 한다. */
export async function setupCalendarWatch(email: string, fcmToken: string): Promise<void> {
  const token = await getAuthToken(false)
  if (!token) throw new Error('No auth token available')

  const channelId = `orbit-calendar-${Date.now()}`

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/watch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: `${CONFIG.FUNCTIONS_BASE_URL}/onCalendarPush`,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Calendar watch setup failed: ${res.status} - ${text}`)
  }

  console.log('[Orbit] Calendar watch setup successfully, channelId:', channelId)

  // Save channel mapping to Cloud Function
  const saveRes = await fetch(`${CONFIG.FUNCTIONS_BASE_URL}/registerCalendarChannel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId, email, token: fcmToken }),
  })

  if (!saveRes.ok) {
    throw new Error(`Failed to map Calendar channel: ${saveRes.statusText}`)
  }

  console.log('[Orbit] Calendar channel registered with Cloud Function')
}
