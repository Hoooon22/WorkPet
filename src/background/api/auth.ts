/**
 * auth.ts — Google OAuth2 토큰 관리
 * chrome.identity API를 사용하여 토큰을 발급·캐시·폐기한다.
 */

/** 토큰 발급. interactive=true 이면 로그인 팝업을 띄운다. */
export function getAuthToken(interactive: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.warn('[Orbit] getAuthToken failed:', chrome.runtime.lastError?.message, '| interactive:', interactive)
        resolve(null)
        return
      }
      resolve(token as string)
    })
  })
}

/** 캐시된 토큰 제거 및 구글 계정에서 완전 로그아웃(토큰 해지) 처리 */
export function removeCachedToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      // 1. Chrome 캐시에서 제거
      // 2. Google 서버에서 토큰 권한 완전히 해지 (이후 다시 로그인 시도 시 계정 선택창 노출)
      fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      .catch((err) => console.warn('[Orbit] Token revoke failed:', err))
      .finally(() => resolve())
    })
  })
}

/** 로그인 여부 확인 (팝업 미표시) */
export async function isSignedIn(): Promise<boolean> {
  const token = await getAuthToken(false)
  return token !== null
}

/**
 * 401 응답 시 캐시 토큰을 제거하고 새 토큰으로 재시도한다.
 * 재시도에도 실패하면 null을 반환한다.
 */
export async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response | null> {
  const token = await getAuthToken(false)
  if (!token) return null

  const res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) {
    await removeCachedToken(token)
    const newToken = await getAuthToken(false)
    if (!newToken) return null
    return fetch(url, {
      ...options,
      headers: { ...options?.headers, Authorization: `Bearer ${newToken}` },
    })
  }

  return res
}
