import { emit } from '@tauri-apps/api/event'
import { getValue, setValue, KEYS } from './storage'
import { showNotification } from './notifications'
import type { ReminderRule } from './types'

function fireKey(rule: ReminderRule, now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(rule.hour).padStart(2, '0')
  const mm = String(rule.minute).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}`
}

// Catch-up window: if a tick is delayed (webview throttled, brief sleep, etc.),
// still fire the reminder when the scheduled time has just passed today.
const CATCHUP_WINDOW_MS = 5 * 60 * 1000

function shouldFire(rule: ReminderRule, now: Date): boolean {
  if (!rule.enabled) return false
  if (rule.weekdaysOnly) {
    const day = now.getDay()
    if (day === 0 || day === 6) return false
  }
  const scheduled = new Date(now)
  scheduled.setHours(rule.hour, rule.minute, 0, 0)
  const diff = now.getTime() - scheduled.getTime()
  return diff >= 0 && diff <= CATCHUP_WINDOW_MS
}

export async function tickReminders(): Promise<void> {
  const rules = (await getValue<ReminderRule[]>(KEYS.REMINDER_RULES)) ?? []
  if (rules.length === 0) return

  const now = new Date()
  const lastFired = (await getValue<Record<string, string>>(KEYS.REMINDER_LAST_FIRED)) ?? {}
  let dirty = false

  for (const rule of rules) {
    if (!shouldFire(rule, now)) continue
    const key = fireKey(rule, now)
    if (lastFired[rule.id] === key) continue

    const message = rule.message?.trim() || `${rule.label}이에요! ⏰`
    void emit('orbit:reminder-fire', { id: rule.id, label: rule.label, message })
    void showNotification(`⏰ ${rule.label}`, message)

    lastFired[rule.id] = key
    dirty = true
  }

  if (dirty) {
    const validIds = new Set(rules.map((r) => r.id))
    for (const id of Object.keys(lastFired)) {
      if (!validIds.has(id)) delete lastFired[id]
    }
    await setValue(KEYS.REMINDER_LAST_FIRED, lastFired)
  }
}

export function makeReminderId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
