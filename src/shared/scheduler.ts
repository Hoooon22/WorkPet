import { emit } from '@tauri-apps/api/event'
import {
  fetchBriefingData,
  fetchFullBriefing,
  handleNewEmailViaHistory,
  checkForNewCalendarEvents,
  notifyForAlerts,
  storeCurrentHistoryId,
} from './briefing'
import { isSignedIn } from './auth'
import { getValue, setValue, KEYS } from './storage'
import { tickReminders } from './reminders'
import { tickClipboard } from './clipboardHistory'
import type { BriefingPayload } from './types'

const ALARM_PERIOD_MS = 60_000
const REMINDER_PERIOD_MS = 30_000
const CLIPBOARD_PERIOD_MS = 1_500

let started = false

async function persistAndEmit(payload: BriefingPayload): Promise<void> {
  await setValue(KEYS.PET_BRIEFING, payload)
  // When the pet is dismissed, keep briefing data fresh but suppress alert state
  // and bubble emit so the user's "퇴장" choice isn't overridden.
  if (await getValue<boolean>(KEYS.PET_DISMISSED)) return
  await setValue(KEYS.PET_STATE, 'alert')
  await emit('orbit:briefing-alert', payload)
}

async function tick(): Promise<void> {
  try {
    const emailPayload = await handleNewEmailViaHistory()
    if (emailPayload) await persistAndEmit(emailPayload)

    const newCalPayload = await checkForNewCalendarEvents()
    if (newCalPayload) await persistAndEmit(newCalPayload)

    const polled = await fetchBriefingData()
    if (polled) {
      await notifyForAlerts(polled.payload)
      await persistAndEmit(polled.payload)
    }
  } catch (err) {
    console.warn('[orbit] scheduler tick failed', err)
  }
}

export function startBriefingScheduler(): void {
  if (started) return
  started = true
  ;(async () => {
    if (await isSignedIn()) {
      void storeCurrentHistoryId().catch(() => {})
    }
    setTimeout(() => {
      void tick()
      setInterval(() => void tick(), ALARM_PERIOD_MS)
    }, 5_000)
    void tickReminders().catch(() => {})
    setInterval(() => void tickReminders().catch(() => {}), REMINDER_PERIOD_MS)
    void tickClipboard().catch(() => {})
    setInterval(() => void tickClipboard().catch(() => {}), CLIPBOARD_PERIOD_MS)
  })()
}

export async function fetchNow(): Promise<void> {
  const polled = await fetchBriefingData()
  if (polled) {
    await notifyForAlerts(polled.payload)
    await persistAndEmit(polled.payload)
  } else {
    const full = await fetchFullBriefing()
    if (full) await persistAndEmit(full)
  }
}

export { fetchFullBriefing }
