export interface TaskItem {
  id: string
  title: string
  dueDate: string
  project: string
  urgent: boolean
}

export interface CalendarEvent {
  id: string
  title: string
  startTime: string
  endTime: string
  location?: string
  link?: string
  created?: string
  updated?: string
}

export interface EmailItem {
  id: string
  subject: string
  from: string
  snippet: string
  receivedAt: string
  link?: string
  isMondayEmail?: boolean
}

export interface BriefingPayload {
  urgent: boolean
  summary: string
  tasks: TaskItem[]
  events: CalendarEvent[]
  emails: EmailItem[]
  timestamp: number
}

export interface GeminiResponse {
  result: string | null
  error?: string
}

export type PetState = 'idle' | 'alert' | 'dismissed'

export type LottiePetId =
  | 'cat'
  | 'rabbit'
  | 'hedgehog'
  | 'raccoon'
  | 'unicorn'
  | 'dog'
  | 'panda'
  | 'lion'
  | 'dragon'
export type PetId = LottiePetId

export type PetSize = 'small' | 'medium' | 'large'

export interface GachaResult {
  grade: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
  petId: PetId
  name: string
  glowColor: string
  badgeGradient: string
}

export interface FocusTimerState {
  phase: 'idle' | 'running' | 'paused' | 'done'
  total: number
  remaining: number
}

export const IDLE_FOCUS_TIMER: FocusTimerState = {
  phase: 'idle',
  total: 0,
  remaining: 0,
}

export const EMPTY_BRIEFING: BriefingPayload = {
  urgent: false,
  summary: '',
  tasks: [],
  events: [],
  emails: [],
  timestamp: 0,
}

export interface ReminderRule {
  id: string
  label: string
  hour: number
  minute: number
  enabled: boolean
  weekdaysOnly: boolean
  message?: string
}

export interface BreakReminderSettings {
  enabled: boolean
  intervalMin: number
  message?: string
  weekdaysOnly: boolean
}

export interface ClipboardEntry {
  id: string
  text: string
  createdAt: number
}

export interface TodoEntry {
  id: string
  text: string
  done: boolean
  createdAt: number
}
