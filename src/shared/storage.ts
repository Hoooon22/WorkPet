import { Store } from '@tauri-apps/plugin-store'
import { emit, listen, UnlistenFn } from '@tauri-apps/api/event'

const STORE_FILE = 'settings.json'
let storePromise: Promise<Store> | null = null

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE)
  }
  return storePromise
}

export async function getValue<T>(key: string): Promise<T | undefined> {
  const store = await getStore()
  return (await store.get<T>(key)) ?? undefined
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  const store = await getStore()
  await store.set(key, value)
  await store.save()
  await emit(`orbit:storage:${key}`, value)
}

export async function deleteValue(key: string): Promise<void> {
  const store = await getStore()
  await store.delete(key)
  await store.save()
  await emit(`orbit:storage:${key}`, null)
}

export async function subscribeStorage<T>(
  key: string,
  handler: (value: T | null) => void,
): Promise<UnlistenFn> {
  return listen<T | null>(`orbit:storage:${key}`, (event) => {
    handler(event.payload as T | null)
  })
}

export const KEYS = {
  AUTH_TOKEN: 'auth:access_token',
  AUTH_REFRESH: 'auth:refresh_token',
  AUTH_EXPIRES: 'auth:expires_at',
  AUTH_EMAIL: 'auth:email',
  GEMINI_API_KEY: 'gemini:api_key',
  PET_KIND: 'pet:kind',
  PET_SIZE: 'pet:size',
  WANDER_PAUSED: 'wander:paused',
  WINDOW_POSITION: 'window:position',
  ACTIVE_PET: 'pet:active',
  PET_DISMISSED: 'pet:dismissed',
  PET_BRIEFING: 'pet:briefing',
  PET_STATE: 'pet:state',
  GMAIL_HISTORY_ID: 'gmail:history_id',
  NOTIFIED_EMAIL_IDS: 'notified:email_ids',
  NOTIFIED_EVENT_ALERTS: 'notified:event_alerts',
  NOTIFIED_NEW_EVENT_IDS: 'notified:new_event_ids',
  CALENDAR_LAST_CHECKED: 'calendar:last_checked',
  REMINDER_RULES: 'reminders:rules',
  REMINDER_LAST_FIRED: 'reminders:last_fired',
} as const
