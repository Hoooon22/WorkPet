import { fetchWithAuth } from './fetchWithAuth'
import { getSignedInEmail } from '../auth'
import type { CalendarEvent } from '../types'

const BASE_URL = 'https://www.googleapis.com/calendar/v3'

interface CalendarListEntry {
  id: string
  primary?: boolean
  selected?: boolean
  deleted?: boolean
}

// 사용자의 Google 캘린더 UI에서 켜져 있는(=selected) 캘린더 id 목록을 가져온다.
// 보조·공유 캘린더의 일정도 알람/브리핑에 모두 잡히도록, primary만 보지 않고 전부 순회한다.
async function fetchActiveCalendarIds(): Promise<string[]> {
  const res = await fetchWithAuth(
    `${BASE_URL}/users/me/calendarList?minAccessRole=reader&fields=items(id,primary,selected,deleted)`,
  )
  if (!res || !res.ok) {
    console.warn('[Orbit] calendarList API failed:', res?.status)
    return ['primary']
  }
  const data = await res.json()
  const items: CalendarListEntry[] = data.items ?? []
  const ids = items
    .filter((it) => !it.deleted)
    .filter((it) => it.selected === true || it.primary === true)
    .map((it) => it.id)
    .filter(Boolean)
  return ids.length > 0 ? ids : ['primary']
}

// 일정이 사용자와 관련 있는지 판단한다. 보조·공유 캘린더에는 내가 무관한
// 타인의 일정도 섞여 들어오므로, 알람/브리핑에서는 다음 중 하나여야 포함한다:
//   1) organizer 이메일이 내 이메일과 일치 (내가 만든 일정)
//   2) attendees에 내 이메일이 있고, 거절(declined)하지 않음
//
// 주의: Google API의 attendees[].self / organizer.self는 "쿼리한 캘린더의
// 소유자"를 가리키므로, 공유 캘린더에서는 본인이 아닌 캘린더 주인을 의미한다.
// 따라서 self 플래그가 아닌 실제 이메일로 비교해야 한다. userEmail이 없으면
// 폴백으로 self 플래그를 본다.
function isUserRelevantEvent(
  item: GoogleCalendarEvent,
  userEmail: string | null,
): boolean {
  const me = userEmail ? userEmail.toLowerCase() : ''
  const matches = (email?: string): boolean =>
    me !== '' && !!email && email.toLowerCase() === me

  if (matches(item.organizer?.email)) return true
  if (!me && item.organizer?.self === true) return true

  const attendees = item.attendees ?? []
  if (attendees.length === 0) return false

  const meAttendee =
    attendees.find((a) => matches(a.email)) ??
    (!me ? attendees.find((a) => a.self === true) : undefined)
  if (!meAttendee) return false
  return meAttendee.responseStatus !== 'declined'
}

async function fetchEventsFromCalendar(
  calendarId: string,
  params: URLSearchParams,
  userEmail: string | null,
): Promise<CalendarEvent[]> {
  const url = `${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  const res = await fetchWithAuth(url)
  if (!res || !res.ok) {
    console.warn('[Orbit] Calendar API failed for', calendarId, res?.status)
    return []
  }
  const data = await res.json()
  const items: GoogleCalendarEvent[] = data.items ?? []
  return items
    .filter((item) => item.start && item.end && item.status !== 'cancelled')
    .filter((item) => isUserRelevantEvent(item, userEmail))
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

function mergeUniqueById(lists: CalendarEvent[][]): CalendarEvent[] {
  const seen = new Set<string>()
  const merged: CalendarEvent[] = []
  for (const list of lists) {
    for (const evt of list) {
      if (seen.has(evt.id)) continue
      seen.add(evt.id)
      merged.push(evt)
    }
  }
  return merged
}

export async function fetchTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
  })

  const [calendarIds, userEmail] = await Promise.all([
    fetchActiveCalendarIds(),
    getSignedInEmail(),
  ])
  const results = await Promise.all(
    calendarIds.map((id) => fetchEventsFromCalendar(id, params, userEmail)),
  )
  const merged = mergeUniqueById(results)
  merged.sort((a, b) => a.startTime.localeCompare(b.startTime))
  return merged
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
  const [calendarIds, userEmail] = await Promise.all([
    fetchActiveCalendarIds(),
    getSignedInEmail(),
  ])
  const results = await Promise.all(
    calendarIds.map((id) => fetchEventsFromCalendar(id, params, userEmail)),
  )
  const merged = mergeUniqueById(results)
  merged.sort((a, b) =>
    (a.updated ?? a.startTime).localeCompare(b.updated ?? b.startTime),
  )
  return merged
}

interface GoogleCalendarAttendee {
  email?: string
  self?: boolean
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted'
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
  organizer?: { self?: boolean; email?: string }
  attendees?: GoogleCalendarAttendee[]
}
