import { fetchWithAuth } from './fetchWithAuth'
import type { CalendarEvent } from '../types'

const BASE_URL = 'https://www.googleapis.com/calendar/v3'

export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '10',
  })

  const res = await fetchWithAuth(`${BASE_URL}/calendars/primary/events?${params}`)
  if (!res || !res.ok) {
    console.warn('[Orbit] Calendar API failed:', res?.status)
    return []
  }

  const data = await res.json()
  const items: GoogleCalendarEvent[] = data.items ?? []

  return items
    .filter((item) => item.start && item.end)
    .map((item) => {
      const startTime = item.start.dateTime ?? `${item.start.date}T00:00:00`
      const endTime = item.end.dateTime ?? `${item.end.date}T23:59:59`
      return {
        id: item.id,
        title: item.summary ?? '(제목 없음)',
        startTime,
        endTime,
        location: item.location,
        link: item.htmlLink,
      }
    })
}

export async function fetchRecentlyUpdatedEvents(
  updatedMin: Date,
): Promise<CalendarEvent[]> {
  const now = new Date()
  const params = new URLSearchParams({
    updatedMin: updatedMin.toISOString(),
    timeMin: now.toISOString(),
    singleEvents: 'true',
    orderBy: 'updated',
    maxResults: '20',
  })
  const res = await fetchWithAuth(`${BASE_URL}/calendars/primary/events?${params}`)
  if (!res || !res.ok) {
    console.warn('[Orbit] Calendar updated query failed:', res?.status)
    return []
  }
  const data = await res.json()
  const items: GoogleCalendarEvent[] = data.items ?? []
  return items
    .filter((item) => item.start && item.end && item.status !== 'cancelled')
    .map((item) => {
      const startTime = item.start.dateTime ?? `${item.start.date}T00:00:00`
      const endTime = item.end.dateTime ?? `${item.end.date}T23:59:59`
      return {
        id: item.id,
        title: item.summary ?? '(제목 없음)',
        startTime,
        endTime,
        location: item.location,
        link: item.htmlLink,
        created: item.created,
        updated: item.updated,
      }
    })
}

interface GoogleCalendarEvent {
  id: string
  summary?: string
  location?: string
  htmlLink?: string
  status?: string
  created?: string
  updated?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}
