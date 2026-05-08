import { emit, listen } from '@tauri-apps/api/event'
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

function scheduleNextReminderTick(): void {
  const now = Date.now()
  // Aim ~50ms past the next minute boundary so we are safely inside the new minute.
  const delay = 60_000 - (now % 60_000) + 50
  setTimeout(() => {
    void tickReminders().catch(() => {})
    scheduleNextReminderTick()
  }, delay)
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
    // Reminders: align to minute boundary; also accept Rust-emitted ticks
    // so background/throttled webview state cannot delay firing.
    void tickReminders().catch(() => {})
    scheduleNextReminderTick()
    void listen('orbit:reminder-tick', () => {
      void tickReminders().catch(() => {})
    })
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
