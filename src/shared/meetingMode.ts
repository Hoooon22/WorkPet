import { emit } from '@tauri-apps/api/event'
import { getValue, setValue, KEYS } from './storage'
import { isSignedIn } from './auth'
import { fetchTodayEvents } from './api/googleCalendar'
import type { CalendarEvent } from './types'

// 종일 일정은 회의로 보지 않는다 — 종일 일정에 하루 종일 펫이 자버리는 걸 막기 위함.
const ALL_DAY_THRESHOLD_MS = 23 * 60 * 60 * 1000

export interface MeetingState {
  eventId: string
  title: string
  startTime: string
  endTime: string
  // 회의 진입 직전의 wanderPaused 값을 보관해 회의 종료 시 그대로 복원한다.
  prevWanderPaused: boolean
}

function findOngoing(events: CalendarEvent[], now: number): CalendarEvent | undefined {
  return events.find((evt) => {
    const start = new Date(evt.startTime).getTime()
    const end = new Date(evt.endTime).getTime()
    if (Number.isNaN(start) || Number.isNaN(end)) return false
    if (end - start >= ALL_DAY_THRESHOLD_MS) return false
    return start <= now && now < end
  })
}

export async function tickMeetingMode(): Promise<void> {
  const enabled = await getValue<boolean>(KEYS.MEETING_MODE_ENABLED)
  if (!enabled) return
  if (!(await isSignedIn())) return

  let events: CalendarEvent[]
  try {
    events = await fetchTodayEvents()
  } catch {
    return
  }

  const ongoing = findOngoing(events, Date.now())
  const active = (await getValue<MeetingState>(KEYS.MEETING_ACTIVE)) ?? null

  if (ongoing && active?.eventId !== ongoing.id) {
    const prevWanderPaused = (await getValue<boolean>(KEYS.WANDER_PAUSED)) ?? false
    const next: MeetingState = {
      eventId: ongoing.id,
      title: ongoing.title,
      startTime: ongoing.startTime,
      endTime: ongoing.endTime,
      prevWanderPaused,
    }
    await setValue(KEYS.MEETING_ACTIVE, next)
    await emit('orbit:meeting-enter', next)
  } else if (!ongoing && active) {
    await setValue(KEYS.MEETING_ACTIVE, null)
    await emit('orbit:meeting-exit', active)
  }
}
