import { emit } from '@tauri-apps/api/event'
import { getValue, setValue, KEYS } from './storage'
import { showNotification } from './notifications'
import type { BreakReminderSettings } from './types'

export const DEFAULT_BREAK_MESSAGE = '20초만 먼 곳을 봐주세요 👀'

export async function tickBreakReminder(): Promise<void> {
  if (await getValue<boolean>(KEYS.PET_DISMISSED)) return
  const settings = await getValue<BreakReminderSettings>(KEYS.BREAK_REMINDER)
  if (!settings || !settings.enabled) return
  if (!Number.isFinite(settings.intervalMin) || settings.intervalMin < 1) return

  if (settings.weekdaysOnly) {
    const day = new Date().getDay()
    if (day === 0 || day === 6) return
  }

  const now = Date.now()
  const lastFiredAt = (await getValue<number>(KEYS.BREAK_REMINDER_LAST_FIRED)) ?? 0
  const intervalMs = settings.intervalMin * 60 * 1000
  if (now - lastFiredAt < intervalMs) return

  const message = settings.message?.trim() || DEFAULT_BREAK_MESSAGE
  void emit('orbit:reminder-fire', { id: 'break', label: '휴식', message })
  void showNotification('👀 휴식 시간', message)

  await setValue(KEYS.BREAK_REMINDER_LAST_FIRED, now)
}
