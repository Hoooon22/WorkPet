/**
 * googleCalendar.ts — Google Calendar API 연동
 * 오늘 날짜의 캘린더 이벤트를 조회한다.
 */

import { fetchWithAuth } from './auth'
import type { CalendarEvent } from '../../types/messages'

const BASE_URL = 'https://www.googleapis.com/calendar/v3'

/** 오늘 하루의 이벤트 목록을 반환한다. */
export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const params = new URLSearchParams({
    timeMin:      startOfDay.toISOString(),
    timeMax:      endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '10',
  })

  const res = await fetchWithAuth(`${BASE_URL}/calendars/primary/events?${params}`)
  if (!res || !res.ok) {
    console.warn('[Orbit] Calendar API 실패:', res?.status)
    return []
  }

  const data = await res.json()
  const items: GoogleCalendarEvent[] = data.items ?? []

  return items
    .filter((item) => item.start && item.end)
    .map((item) => {
      const startTime = item.start.dateTime ?? `${item.start.date}T00:00:00`
      const endTime   = item.end.dateTime   ?? `${item.end.date}T23:59:59`
      return {
        id:        item.id,
        title:     item.summary ?? '(제목 없음)',
        startTime,
        endTime,
        location:  item.location,
        link:      item.htmlLink,
      }
    })
}

// ---- Google API 응답 타입 (내부용) ----
interface GoogleCalendarEvent {
  id: string
  summary?: string
  location?: string
  htmlLink?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
}
