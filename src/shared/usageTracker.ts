import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getValue, setValue, KEYS } from './storage'
import { showNotification } from './notifications'
import type { UsageRecord } from './types'

const SAMPLE_INTERVAL_MS = 15_000
const PERSIST_INTERVAL_MS = 60_000
const MAX_GAP_MS = SAMPLE_INTERVAL_MS * 3
const HISTORY_KEEP_DAYS = 30
const SELF_APP_NAMES = new Set(['Work-Pet Orbit', 'work-pet-orbit'])
const SUMMARY_HOUR = 18

let runtimeRecord: UsageRecord | null = null
let lastPersistedAt = 0

function todayStr(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

async function archiveDay(record: UsageRecord): Promise<void> {
  if (Object.keys(record.apps).length === 0) return
  const history = (await getValue<UsageRecord[]>(KEYS.USAGE_HISTORY)) ?? []
  const filtered = history.filter((r) => r.date !== record.date)
  filtered.push(record)
  while (filtered.length > HISTORY_KEEP_DAYS) filtered.shift()
  await setValue(KEYS.USAGE_HISTORY, filtered)
}

async function loadRecord(): Promise<UsageRecord> {
  if (runtimeRecord) return runtimeRecord
  const today = todayStr()
  const stored = await getValue<UsageRecord>(KEYS.USAGE_TODAY)
  if (stored && stored.date === today) {
    runtimeRecord = stored
  } else {
    if (stored) await archiveDay(stored)
    runtimeRecord = { date: today, apps: {}, lastSampledAt: Date.now() }
  }
  return runtimeRecord
}

export async function tickUsage(): Promise<void> {
  const appName = await invoke<string | null>('get_frontmost_app').catch(() => null)
  const now = Date.now()
  const today = todayStr()

  let record = await loadRecord()
  if (record.date !== today) {
    await archiveDay(record)
    record = { date: today, apps: {}, lastSampledAt: now }
    runtimeRecord = record
    lastPersistedAt = 0
  }

  if (appName && !SELF_APP_NAMES.has(appName)) {
    const elapsedMs = Math.min(Math.max(0, now - record.lastSampledAt), MAX_GAP_MS)
    const elapsedSec = elapsedMs / 1000
    if (elapsedSec > 0) {
      record.apps[appName] = (record.apps[appName] ?? 0) + elapsedSec
    }
  }
  record.lastSampledAt = now

  if (now - lastPersistedAt >= PERSIST_INTERVAL_MS) {
    lastPersistedAt = now
    await setValue(KEYS.USAGE_TODAY, record)
  }
}

async function flushUsage(): Promise<void> {
  if (!runtimeRecord) return
  lastPersistedAt = Date.now()
  await setValue(KEYS.USAGE_TODAY, runtimeRecord)
}

export async function maybeFireEveningSummary(): Promise<void> {
  if (await getValue<boolean>(KEYS.PET_DISMISSED)) return
  const now = new Date()
  if (now.getHours() < SUMMARY_HOUR) return

  const today = todayStr(now)
  const lastFired = await getValue<string>(KEYS.USAGE_SUMMARY_LAST_FIRED)
  if (lastFired === today) return

  await flushUsage()
  const record = await getValue<UsageRecord>(KEYS.USAGE_TODAY)
  if (!record || record.date !== today) return

  const entries = Object.entries(record.apps).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return
  const [topApp, topSec] = entries[0]
  if (topSec < 60) return

  const message = `오늘 ${topApp}에서 ${formatDuration(topSec)} 보냈네요! ✨`
  void emit('orbit:reminder-fire', {
    id: 'usage-summary',
    label: '작업 리포트',
    message,
  })
  void showNotification('📊 오늘의 작업 리포트', message)

  await setValue(KEYS.USAGE_SUMMARY_LAST_FIRED, today)
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total}초`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}분`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return remMin > 0 ? `${hours}시간 ${remMin}분` : `${hours}시간`
}

export function startUsageTracker(): void {
  void tickUsage().catch(() => {})
  setInterval(() => {
    void tickUsage().catch(() => {})
  }, SAMPLE_INTERVAL_MS)
}
