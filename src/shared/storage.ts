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
  AUTH_ID_TOKEN: 'auth:id_token',
  FOCUS_TIMER_PHASE: 'focus:phase',
  TEAM_ROOM_CODE: 'teamroom:code',
  // 단일 활성 LLM 공급자. 'gemini' | 'openai' | 'anthropic' | 'grok' | 'compat'.
  LLM_PROVIDER: 'llm:provider',
  // 현재 활성 공급자의 API 키. 공급자를 바꿀 때마다 덮어쓴다(활성 키만 보관).
  LLM_API_KEY: 'llm:api_key',
  // 'compat' 공급자 전용. 다른 공급자 사용 시에는 비어 있다.
  LLM_COMPAT_BASE_URL: 'llm:compat_base_url',
  LLM_COMPAT_MODEL: 'llm:compat_model',
  // 구버전(0.1.x) 호환용. 다중 공급자 도입 전엔 Gemini 전용 키였고,
  // 마이그레이션 후엔 삭제된다. 신규 코드에서는 LLM_API_KEY를 사용한다.
  GEMINI_API_KEY: 'gemini:api_key',
  PET_KIND: 'pet:kind',
  PET_SIZE: 'pet:size',
  WANDER_PAUSED: 'wander:paused',
  WANDER_FREQUENCY: 'wander:frequency',
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
  BREAK_REMINDER: 'break:settings',
  BREAK_REMINDER_LAST_FIRED: 'break:last_fired',
  CLIPBOARD_HISTORY: 'clipboard:history',
  TODO_LIST: 'todo:list',
  USAGE_TODAY: 'usage:today',
  USAGE_HISTORY: 'usage:history',
  USAGE_SUMMARY_LAST_FIRED: 'usage:summary_last_fired',
  PANEL_FOCUS_INTENT: 'panel:focus_intent',
  USER_PROFILE: 'user:profile',
  PET_MEMORY: 'pet:memory',
} as const

export type UserProfile = {
  text: string
  updatedAt: number
}

export type PetMemoryEntry = {
  text: string
  savedAt: number
}
