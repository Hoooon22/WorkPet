// Chrome Extension 메시지 타입 정의
// background.ts ↔ content script 통신 시 반드시 이 타입을 사용한다 (any 금지)

export interface TaskItem {
  id: string
  title: string
  dueDate: string       // ISO 8601
  project: string
  urgent: boolean
}

export interface CalendarEvent {
  id: string
  title: string
  startTime: string     // ISO 8601
  endTime: string       // ISO 8601 — endTime 경과 시 자동 제거
  location?: string
  link?: string         // Google Calendar 이벤트 URL
  created?: string      // ISO 8601 — 이벤트 생성 시각
  updated?: string      // ISO 8601 — 이벤트 최종 수정 시각
}

export interface EmailItem {
  id: string
  subject: string
  from: string
  snippet: string
  receivedAt: string    // ISO 8601
  link?: string         // Gmail 메시지 URL
  isMondayEmail?: boolean  // monday.com 발신 메일 여부
}

export interface BriefingPayload {
  urgent: boolean
  summary: string       // 한 줄 요약 텍스트 (말풍선에 표시)
  tasks: TaskItem[]
  events: CalendarEvent[]
  emails: EmailItem[]
  timestamp: number
}

// ---- 메시지 유니온 타입 ----
export type ExtMessage =
  | { type: 'BRIEFING_ALERT'; payload: BriefingPayload }
  | { type: 'DISMISS_PET' }
  | { type: 'SHOW_PET' }
  | { type: 'SHOW_GACHA' }
  | { type: 'PING' }
  | { type: 'FETCH_NOW' }
  | { type: 'FETCH_FULL_BRIEFING' }
  | { type: 'INIT_PUSH' }
  | { type: 'SIGN_OUT' }
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'TRANSLATE_TEXT'; text: string; sourceLang: string; targetLang: string }
  | { type: 'SUMMARIZE_PAGE'; pageText: string }
  | { type: 'ASK_GEMINI'; question: string }
  | { type: 'LOGIN_GREETING' }
  | { type: 'LOGOUT_FAREWELL' }

export interface CaptureScreenshotResponse {
  dataUrl: string
}

// Gemini API 응답 공통 타입
export interface GeminiResponse {
  result: string | null
  error?: string   // 'NO_API_KEY' | 'GEMINI_API_NOT_CONNECTED' | 기타 오류 메시지
}

// 펫 상태 타입 (Content Script 내부 상태 머신)
export type PetState = 'idle' | 'alert' | 'dismissed'

// 가챠로 뽑은 펫 정보 (chrome.storage.local에 저장)
// petId: Lottie 펫 5종 + SVG 펫 8종 = 총 13종
// (hamster/beaver Lottie 자산은 디자인 번들에서 깨진 상태로 와서 제외됨)
export type LottiePetId = 'cat' | 'rabbit' | 'hedgehog' | 'raccoon' | 'unicorn'
export type SvgPetId    = 'fox' | 'frog' | 'penguin' | 'turtle' | 'owl' | 'octopus' | 'chick' | 'bear'
export type PetId       = LottiePetId | SvgPetId

export interface GachaResult {
  grade: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
  petId: PetId
  name: string
  glowColor: string
  badgeGradient: string
}
