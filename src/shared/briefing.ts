import { getValue, setValue, KEYS } from './storage'
import { isSignedIn } from './auth'
import { fetchTodayEvents, fetchRecentlyUpdatedEvents } from './api/googleCalendar'
import {
  fetchUnreadEmails,
  fetchNewEmailsViaHistory,
  storeCurrentHistoryId,
} from './api/gmail'
import { showNotification } from './notifications'
import type { BriefingPayload, CalendarEvent, EmailItem } from './types'

const ALERT_10MIN_MIN = 8 * 60 * 1000
const ALERT_10MIN_MAX = 12 * 60 * 1000
const ALERT_5MIN_MIN = 3 * 60 * 1000
const ALERT_5MIN_MAX = 7 * 60 * 1000
const ALERT_1MIN_MIN = 0
const ALERT_1MIN_MAX = 2 * 60 * 1000
const ON_TIME_WINDOW = 90 * 1000

interface EventAlertState {
  tenMin?: boolean
  fiveMin?: boolean
  oneMin?: boolean
  onTime?: boolean
  startTime?: string
}

export interface PolledAlert {
  payload: BriefingPayload
  newEmails: EmailItem[]
  alertEvents: CalendarEvent[]
}

export async function fetchBriefingData(): Promise<PolledAlert | null> {
  if (!(await isSignedIn())) return null

  const [events, emails] = await Promise.all([fetchTodayEvents(), fetchUnreadEmails()])

  const notifiedEmailIds = (await getValue<string[]>(KEYS.NOTIFIED_EMAIL_IDS)) ?? []
  const eventAlerts =
    (await getValue<Record<string, EventAlertState>>(KEYS.NOTIFIED_EVENT_ALERTS)) ?? {}

  const now = Date.now()
  const updatedEventAlerts: Record<string, EventAlertState> = { ...eventAlerts }

  for (const evt of events) {
    const state = updatedEventAlerts[evt.id]
    if (state && state.startTime !== evt.startTime) {
      updatedEventAlerts[evt.id] = { startTime: evt.startTime }
    }
  }

  const eventsToNotify = events.filter((evt) => {
    const startMs = new Date(evt.startTime).getTime()
    const msTilStart = startMs - now
    const state = updatedEventAlerts[evt.id] ?? {}
    let shouldNotify = false
    if (msTilStart >= ALERT_10MIN_MIN && msTilStart <= ALERT_10MIN_MAX && !state.tenMin) {
      state.tenMin = true
      shouldNotify = true
    } else if (msTilStart >= ALERT_5MIN_MIN && msTilStart <= ALERT_5MIN_MAX && !state.fiveMin) {
      state.fiveMin = true
      shouldNotify = true
    } else if (msTilStart >= ALERT_1MIN_MIN && msTilStart <= ALERT_1MIN_MAX && !state.oneMin) {
      state.oneMin = true
      shouldNotify = true
    } else if (Math.abs(msTilStart) <= ON_TIME_WINDOW && !state.onTime) {
      state.onTime = true
      shouldNotify = true
    }
    state.startTime = evt.startTime
    updatedEventAlerts[evt.id] = state
    return shouldNotify
  })

  const newEmails = emails.filter((e) => !notifiedEmailIds.includes(e.id))
  const allNotifiedIds = [
    ...new Set([...notifiedEmailIds, ...emails.map((e) => e.id)]),
  ].slice(-500)

  const validEventIds = new Set(events.map((e) => e.id))
  for (const id of Object.keys(updatedEventAlerts)) {
    if (!validEventIds.has(id)) delete updatedEventAlerts[id]
  }

  await setValue(KEYS.NOTIFIED_EMAIL_IDS, allNotifiedIds)
  await setValue(KEYS.NOTIFIED_EVENT_ALERTS, updatedEventAlerts)

  if (eventsToNotify.length === 0 && newEmails.length === 0) return null

  let summary = ''
  if (eventsToNotify.length > 0 && newEmails.length > 0) {
    summary = `일정 알림 ${eventsToNotify.length}개, 새 메일 ${newEmails.length}개`
  } else if (eventsToNotify.length > 0) {
    const evt = eventsToNotify[0]
    const startMs = new Date(evt.startTime).getTime()
    const msTilStart = startMs - now
    if (msTilStart > ALERT_5MIN_MAX) summary = `"${evt.title}" 10분 후 시작해요!`
    else if (msTilStart > ALERT_1MIN_MAX) summary = `"${evt.title}" 5분 후 시작해요!`
    else if (msTilStart > 0) summary = `"${evt.title}" 곧 시작해요! (1분 이내)`
    else summary = `"${evt.title}" 지금 시작됐어요!`
  } else {
    summary =
      newEmails.length === 1
        ? `"${newEmails[0].subject}" 새 메일이 도착했어요`
        : `새 메일 ${newEmails.length}개가 도착했어요`
  }

  return {
    payload: {
      urgent: true,
      summary,
      tasks: [],
      events: eventsToNotify,
      emails: newEmails,
      timestamp: now,
    },
    newEmails,
    alertEvents: eventsToNotify,
  }
}

export async function fetchFullBriefing(): Promise<BriefingPayload | null> {
  if (!(await isSignedIn())) return null
  const [allEvents, emails] = await Promise.all([fetchTodayEvents(), fetchUnreadEmails()])
  const now = Date.now()
  const remainingEvents = allEvents.filter(
    (evt) => new Date(evt.endTime).getTime() > now,
  )
  let summary = ''
  if (remainingEvents.length === 0 && emails.length === 0) {
    summary = '오늘 남은 일정과 새 메일이 없어요 😊'
  } else {
    const parts: string[] = []
    if (remainingEvents.length > 0) parts.push(`오늘 일정 ${remainingEvents.length}개`)
    if (emails.length > 0) parts.push(`읽지 않은 메일 ${emails.length}개`)
    summary = parts.join(', ')
  }
  return {
    urgent: false,
    summary,
    tasks: [],
    events: remainingEvents,
    emails,
    timestamp: now,
  }
}

export async function handleNewEmailViaHistory(): Promise<BriefingPayload | null> {
  if (!(await isSignedIn())) return null
  const newEmails = await fetchNewEmailsViaHistory()
  if (newEmails.length === 0) return null

  for (const email of newEmails) {
    await showNotification('새 메일이 도착했어요!', `${email.from}: ${email.subject}`)
  }

  const summary =
    newEmails.length === 1
      ? `"${newEmails[0].subject}" 새 메일이 도착했어요`
      : `새 메일 ${newEmails.length}개가 도착했어요`

  return {
    urgent: true,
    summary,
    tasks: [],
    events: [],
    emails: newEmails,
    timestamp: Date.now(),
  }
}

export async function checkForNewCalendarEvents(): Promise<BriefingPayload | null> {
  if (!(await isSignedIn())) return null
  const now = Date.now()
  const lastChecked = (await getValue<number>(KEYS.CALENDAR_LAST_CHECKED)) ?? now - 5 * 60 * 1000
  const notifiedIds = (await getValue<string[]>(KEYS.NOTIFIED_NEW_EVENT_IDS)) ?? []

  const recentEvents = await fetchRecentlyUpdatedEvents(new Date(lastChecked))
  await setValue(KEYS.CALENDAR_LAST_CHECKED, now)

  if (recentEvents.length === 0) return null
  const newEvents = recentEvents.filter((evt) => {
    if (notifiedIds.includes(evt.id)) return false
    if (!evt.created) return false
    return new Date(evt.created).getTime() > lastChecked
  })
  if (newEvents.length === 0) return null

  const allNotifiedIds = [...new Set([...notifiedIds, ...newEvents.map((e) => e.id)])].slice(
    -200,
  )
  await setValue(KEYS.NOTIFIED_NEW_EVENT_IDS, allNotifiedIds)

  for (const evt of newEvents) {
    const d = new Date(evt.startTime)
    const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(
      d.getMinutes(),
    ).padStart(2, '0')}`
    await showNotification('새 일정이 추가됐어요!', `"${evt.title}" — ${dateStr}`)
  }

  const summary =
    newEvents.length === 1
      ? `"${newEvents[0].title}" 새 일정이 추가됐어요`
      : `새 일정 ${newEvents.length}개가 추가됐어요`

  return {
    urgent: true,
    summary,
    tasks: [],
    events: newEvents,
    emails: [],
    timestamp: now,
  }
}

export async function notifyForAlerts(payload: BriefingPayload): Promise<void> {
  for (const evt of payload.events) {
    const startMs = new Date(evt.startTime).getTime()
    const msTil = startMs - Date.now()
    let msg = ''
    if (msTil > ALERT_5MIN_MAX) msg = '10분 후 시작해요!'
    else if (msTil > ALERT_1MIN_MAX) msg = '5분 후 시작해요!'
    else if (msTil > 0) msg = '곧 시작해요! (1분 이내)'
    else msg = '지금 시작됐어요!'
    await showNotification(evt.title, msg)
  }
}

export { storeCurrentHistoryId }
