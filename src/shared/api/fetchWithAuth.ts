import { getAccessToken, refreshAccessToken } from '../auth'

export async function fetchWithAuth(
  url: string,
  options?: RequestInit,
): Promise<Response | null> {
  let token = await getAccessToken()
  if (!token) return null

  let res = await fetch(url, {
    ...options,
    headers: { ...options?.headers, Authorization: `Bearer ${token}` },
  })

  if (res.status === 401) {
    const refreshed = await refreshAccessToken()
    if (!refreshed) return null
    token = refreshed
    res = await fetch(url, {
      ...options,
      headers: { ...options?.headers, Authorization: `Bearer ${token}` },
    })
  }

  return res
}
