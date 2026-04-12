/**
 * fcm.ts — Chrome GCM(FCM) 등록 및 토큰 관리
 *
 * chrome.gcm.register() 로 FCM 등록 토큰을 발급받고,
 * Cloud Function에 (이메일, 토큰) 쌍을 저장한다.
 *
 * Cloud Function이 이 토큰으로 FCM 메시지를 보내면
 * chrome.gcm.onMessage 리스너에서 수신한다.
 */

import { CONFIG } from '../config'
import { getAuthToken } from './auth'

/** Google 계정 이메일 조회 */
export async function getUserEmail(): Promise<string | null> {
  const token = await getAuthToken(false)
  if (!token) return null

  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null

  const data = await res.json() as { email?: string }
  return data.email ?? null
}

/** chrome.gcm 에 등록하여 FCM 토큰을 반환한다. */
function registerGcm(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.gcm.register([CONFIG.FCM_SENDER_ID], (registrationId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(registrationId)
      }
    })
  })
}

/**
 * FCM 토큰을 발급받아 Cloud Function에 등록한다.
 * 성공 시 토큰을 chrome.storage.local에 캐시한다.
 */
export async function registerAndUploadFcmToken(): Promise<void> {
  const email = await getUserEmail()
  if (!email) {
    console.warn('[Orbit] FCM 등록 실패: 로그인 필요')
    return
  }

  let gcmToken: string
  try {
    gcmToken = await registerGcm()
  } catch (err) {
    console.error('[Orbit] chrome.gcm.register 실패:', err)
    return
  }

  // 이전과 동일한 토큰이면 재업로드 생략
  const stored = await chrome.storage.local.get(['gcmToken', 'gcmEmail'])
  if (stored.gcmToken === gcmToken && stored.gcmEmail === email) return

  try {
    const res = await fetch(`${CONFIG.FUNCTIONS_BASE_URL}/registerToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token: gcmToken }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    console.error('[Orbit] FCM 토큰 업로드 실패:', err)
    return
  }

  await chrome.storage.local.set({ gcmToken, gcmEmail: email })
  console.log('[Orbit] FCM 토큰 등록 완료:', email)
}

/** FCM 메시지 수신 리스너 등록. 메시지 수신 시 콜백을 호출한다. */
export function onFcmMessage(
  handler: (type: 'NEW_EMAIL' | 'CALENDAR_CHANGE', data: Record<string, string>) => void
): void {
  chrome.gcm.onMessage.addListener((message) => {
    const data = message.data as Record<string, string>
    const type = data.type as 'NEW_EMAIL' | 'CALENDAR_CHANGE'
    if (type === 'NEW_EMAIL' || type === 'CALENDAR_CHANGE') {
      handler(type, data)
    }
  })
}
