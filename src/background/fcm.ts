import { CONFIG } from './config'

const FCM_LOCK_KEY = 'fcmRegistrationLock'
const LOCK_TIMEOUT_MS = 30_000 // 30초 후 락 자동 만료

/**
 * Storage 기반 락으로 서비스 워커 재시작에도 중복 GCM 등록을 방지한다.
 */
async function acquireLock(): Promise<boolean> {
  const { [FCM_LOCK_KEY]: lock } = await chrome.storage.local.get([FCM_LOCK_KEY])
  if (lock && Date.now() - lock < LOCK_TIMEOUT_MS) {
    return false // 이미 다른 호출이 진행 중
  }
  await chrome.storage.local.set({ [FCM_LOCK_KEY]: Date.now() })
  return true
}

async function releaseLock(): Promise<void> {
  await chrome.storage.local.remove(FCM_LOCK_KEY)
}

export async function registerFcmToken(email: string): Promise<string | null> {
  // 1. 캐시된 토큰이 있으면 즉시 반환
  const { cachedFcmToken } = await chrome.storage.local.get(['cachedFcmToken'])
  if (cachedFcmToken) {
    console.log('[Orbit] Using cached FCM token')
    return cachedFcmToken
  }

  // 2. Storage 기반 락 획득 시도
  const locked = await acquireLock()
  if (!locked) {
    console.log('[Orbit] FCM registration already in progress (storage lock), skipping.')
    return null
  }

  try {
    const maxRetries = 5
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(3000 * Math.pow(2, attempt - 1), 15_000) // 3s, 6s, 12s, 15s
        console.log(`[Orbit] FCM retry in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise((r) => setTimeout(r, delay))

        // 재시도 전 캐시 재확인 (다른 경로에서 성공했을 수 있음)
        const { cachedFcmToken: recheckToken } = await chrome.storage.local.get(['cachedFcmToken'])
        if (recheckToken) {
          console.log('[Orbit] FCM token appeared in cache during retry')
          return recheckToken
        }
      }

      const result = await new Promise<{ id: string | null; retryable: boolean }>((resolve) => {
        try {
          chrome.gcm.register([CONFIG.FCM_SENDER_ID], (registrationId) => {
            if (chrome.runtime.lastError) {
              const errMsg = chrome.runtime.lastError?.message || String(chrome.runtime.lastError)
              const retryable = errMsg.includes('Asynchronous operation is pending')

              if (!retryable) {
                console.error('[Orbit] FCM Registration failed (non-retryable):', errMsg)
              }

              return resolve({ id: null, retryable })
            }
            resolve({ id: registrationId, retryable: false })
          })
        } catch (err) {
          console.error('[Orbit] chrome.gcm.register threw:', err)
          resolve({ id: null, retryable: false })
        }
      })

      if (result.id) {
        console.log('[Orbit] FCM Token received:', result.id)

        // 서버에 토큰 저장
        try {
          const response = await fetch(`${CONFIG.FUNCTIONS_BASE_URL}/registerToken`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token: result.id })
          })
          if (!response.ok) {
            throw new Error(`Failed to save FCM token: ${response.statusText}`)
          }
          console.log('[Orbit] FCM Token saved to Firestore')
        } catch (err) {
          console.error('[Orbit] Error saving FCM token:', err)
        }

        await chrome.storage.local.set({ cachedFcmToken: result.id })
        return result.id
      }

      if (!result.retryable) {
        break // 재시도 불가 에러면 즉시 중단
      }
    }

    console.error('[Orbit] FCM Registration failed after all retries')
    return null
  } finally {
    await releaseLock()
  }
}
