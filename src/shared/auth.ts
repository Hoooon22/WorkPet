import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getValue, setValue, deleteValue, KEYS } from './storage'
import {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_SCOPES,
} from './oauthConfig'

interface OauthResult {
  access_token: string
  refresh_token: string | null
  expires_at_ms: number
  email: string | null
}

const REFRESH_BUFFER_MS = 60_000

export async function signIn(): Promise<{ email: string | null }> {
  const result = await invoke<OauthResult>('oauth_google_signin', {
    clientId: OAUTH_CLIENT_ID,
    clientSecret: OAUTH_CLIENT_SECRET,
    scopes: OAUTH_SCOPES,
  })
  await setValue(KEYS.AUTH_TOKEN, result.access_token)
  await setValue(KEYS.AUTH_EXPIRES, result.expires_at_ms)
  if (result.refresh_token) await setValue(KEYS.AUTH_REFRESH, result.refresh_token)
  if (result.email) await setValue(KEYS.AUTH_EMAIL, result.email)
  await invoke('set_auth_state', { signedIn: true, email: result.email })
  await emit('orbit:auth-changed', { signedIn: true, email: result.email })
  return { email: result.email }
}

export async function signOut(): Promise<void> {
  const token = await getValue<string>(KEYS.AUTH_TOKEN)
  if (token) {
    try {
      await invoke('oauth_google_revoke', { token })
    } catch {
      /* noop */
    }
  }
  await deleteValue(KEYS.AUTH_TOKEN)
  await deleteValue(KEYS.AUTH_REFRESH)
  await deleteValue(KEYS.AUTH_EXPIRES)
  await deleteValue(KEYS.AUTH_EMAIL)
  await invoke('set_auth_state', { signedIn: false, email: null })
  await emit('orbit:auth-changed', { signedIn: false, email: null })
}

export async function getAccessToken(): Promise<string | null> {
  const token = await getValue<string>(KEYS.AUTH_TOKEN)
  if (!token) return null
  const expires = (await getValue<number>(KEYS.AUTH_EXPIRES)) ?? 0
  if (Date.now() < expires - REFRESH_BUFFER_MS) return token
  return refreshAccessToken()
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getValue<string>(KEYS.AUTH_REFRESH)
  if (!refreshToken) return null
  try {
    const result = await invoke<OauthResult>('oauth_google_refresh', {
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_CLIENT_SECRET,
      refreshToken,
    })
    await setValue(KEYS.AUTH_TOKEN, result.access_token)
    await setValue(KEYS.AUTH_EXPIRES, result.expires_at_ms)
    return result.access_token
  } catch (err) {
    console.warn('[orbit] refresh failed, signing out', err)
    await signOut()
    return null
  }
}

export async function isSignedIn(): Promise<boolean> {
  return (await getAccessToken()) !== null
}

export async function getSignedInEmail(): Promise<string | null> {
  return (await getValue<string>(KEYS.AUTH_EMAIL)) ?? null
}
