/**
 * background.ts — Work-Pet: Orbit Service Worker
 *
 * 역할:
 * 1. Chrome Alarms API로 주기적 브리핑 스케줄 관리
 * 2. Google Calendar / Gmail API 데이터 수집
 * 3. Content Script로 브리핑 메시지 전송
 */

import type { ExtMessage, BriefingPayload, GeminiResponse } from '../types/messages'
import { translateText, summarizePage, askQuestion } from './api/gemini'
import { isSignedIn, removeCachedToken, getAuthToken, fetchWithAuth } from './api/auth'
import { fetchTodayEvents, fetchRecentlyUpdatedEvents } from './api/googleCalendar'
import { fetchUnreadEmails, fetchNewEmailsViaHistory, storeCurrentHistoryId } from './api/gmail'
import { registerFcmToken } from './fcm'
import { setupGmailWatch, setupCalendarWatch } from './watchSetup'
import { CONFIG } from './config'

const ALARM_NAME = 'orbit-briefing'
const ALARM_PERIOD_MINUTES = 1  // 1분마다 체크

// Storage 키
const STORAGE_KEY_NOTIFIED_EMAILS    = 'notifiedEmailIds'
const STORAGE_KEY_EVENT_ALERTS       = 'notifiedEventAlerts'
const STORAGE_KEY_NOTIFIED_NEW_EVENTS = 'notifiedNewEventIds'

// 캘린더 알림 윈도우 (ms) — 알람 주기 1분 기준, 각 윈도우 폭 ≥ 2분
const ALERT_10MIN_MIN =  8 * 60 * 1000   //  8분 전
const ALERT_10MIN_MAX = 12 * 60 * 1000   // 12분 전
const ALERT_5MIN_MIN  =  3 * 60 * 1000   //  3분 전
const ALERT_5MIN_MAX  =  7 * 60 * 1000   //  7분 전
const ALERT_1MIN_MIN  =         0        //  0초 ~ 2분 전
const ALERT_1MIN_MAX  =  2 * 60 * 1000   //  2분 전
const ON_TIME_WINDOW  = 90 * 1000        // 시작 후 ±90초

interface EventAlertState {
  tenMin?:   boolean
  fiveMin?:  boolean
  oneMin?:   boolean
  onTime?:   boolean
  startTime?: string  // 변경 감지용: 시간이 바뀌면 플래그 리셋
}

// ---- Push & Watch 설정 ----
async function getUserEmail(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' as any }, async (userInfo) => {
      if (userInfo && userInfo.email) {
        return resolve(userInfo.email)
      }
      
      // Fallback: API를 통해 이메일 주소를 직접 가져옵니다.
      const res = await fetchWithAuth('https://gmail.googleapis.com/gmail/v1/users/me/profile')
      if (res && res.ok) {
        const data = await res.json()
        if (data.emailAddress) return resolve(data.emailAddress)
      }
      
      resolve(null)
    })
  })
}

async function initializeExternalPush() {
  const signedIn = await isSignedIn()
  if (!signedIn) return

  const email = await getUserEmail()
  if (!email) {
    console.warn('[Orbit] No email found for push registration.')
    return
  }

  const token = await registerFcmToken(email)
  if (token) {
    // Gmail Watch / Calendar Watch 성공 여부를 확인 후에만 lastWatchSetupTime 저장
    // 실패 시 저장하면 6일간 재시도가 막힘
    let watchOk = false
    try {
      await setupGmailWatch()
      await setupCalendarWatch(email, token)
      watchOk = true
    } catch (err) {
      console.warn('[Orbit] Watch setup threw unexpectedly:', err)
    }

    if (watchOk) {
      await chrome.storage.local.set({ lastWatchSetupTime: Date.now() })
      console.log('[Orbit] Push watches configured and tracking time saved.')
    } else {
      console.warn('[Orbit] Watch setup failed — skipping lastWatchSetupTime update so it retries next cycle.')
    }
  }
}

chrome.gcm.onMessage.addListener((message) => {
  console.log('[Orbit] FCM Message received:', message)
  const data = message.data as Record<string, string>
  const msgType = data?.type

  if (msgType === 'NEW_EMAIL') {
    // Gmail Push → History API로 새 메일만 즉시 가져와 알림
    handleNewEmailPush().catch((err) => console.error('[Orbit] handleNewEmailPush 실패:', err))
  } else if (msgType === 'CALENDAR_CHANGE') {
    // Calendar Push → 새 이벤트 확인 후 알림
    sendBriefingToActiveTab()
  } else {
    // 타입 없는 레거시 메시지 → 풀 브리핑
    sendBriefingToActiveTab()
  }
})

// ---- Alarm 설정 ----
// Push 초기화는 알람 핸들러에서 단일 경로로 처리한다.
// onInstalled/onStartup 양쪽에서 동시 호출하면 GCM "pending" 에러 발생.
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Orbit] Extension installed. Setting up alarm...')
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 0.1,
    periodInMinutes: ALARM_PERIOD_MINUTES,
  })
  // Gmail History API 기준점 설정 (설치 시점 이후 새 메일만 알림 대상)
  const signedIn = await isSignedIn()
  if (signedIn) storeCurrentHistoryId().catch(() => {})
})

chrome.runtime.onStartup.addListener(async () => {
  console.log('[Orbit] Browser started. Ensuring alarm exists...')
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 0.5,
        periodInMinutes: ALARM_PERIOD_MINUTES,
      })
    }
  })
  // 재시작 시 historyId 없으면 초기화
  const { gmailHistoryId } = await chrome.storage.local.get(['gmailHistoryId'])
  if (!gmailHistoryId) {
    const signedIn = await isSignedIn()
    if (signedIn) storeCurrentHistoryId().catch(() => {})
  }

  // 브라우저 재시작 시: 기존 briefing이 있으면 복원된 모든 탭에 즉시 브로드캐스트
  // (content script가 아직 마운트 안 된 탭은 자체적으로 storage에서 복원)
  await broadcastStoredBriefingToAllTabs()
})

// ---- Alarm 핸들러 ----
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return
  console.log('[Orbit] Alarm fired.')

  // 1. 실시간 메일 체크 (History API)
  handleNewEmailPush().catch(() => {})

  // 2. 새 일정 체크 (당일 외 미래 일정 포함)
  checkForNewCalendarEvents().catch(() => {})

  // 3. 기존 브리핑 (오늘 일정 알림 + 읽지 않은 메일 폴백)
  await sendBriefingToActiveTab()

  // 4. Push 초기화 (백그라운드 — 브리핑 차단 안 함)
  const { lastWatchSetupTime } = await chrome.storage.local.get(['lastWatchSetupTime'])
  if (!lastWatchSetupTime || Date.now() - lastWatchSetupTime >= CONFIG.WATCH_RENEW_INTERVAL_MS) {
    console.log('[Orbit] Push setup needed. Initializing in background...')
    initializeExternalPush().catch((err) =>
      console.warn('[Orbit] Push setup failed:', err)
    )
  }
})

// ---- 실제 API에서 브리핑 데이터 수집 ----
async function fetchBriefingData(): Promise<BriefingPayload | null> {
  const signedIn = await isSignedIn()
  if (!signedIn) {
    console.warn('[Orbit] Not signed in — skipping briefing.')
    return null
  }

  const [events, emails] = await Promise.all([
    fetchTodayEvents(),
    fetchUnreadEmails(),
  ])

  console.log(`[Orbit] Fetched ${events.length} events, ${emails.length} emails`)

  // ---- 알림 상태 로드 ----
  const stored = await chrome.storage.local.get([STORAGE_KEY_NOTIFIED_EMAILS, STORAGE_KEY_EVENT_ALERTS])
  const notifiedEmailIds: string[]                        = stored[STORAGE_KEY_NOTIFIED_EMAILS] ?? []
  const eventAlerts: Record<string, EventAlertState>      = stored[STORAGE_KEY_EVENT_ALERTS]    ?? {}

  const now = Date.now()
  const updatedEventAlerts = { ...eventAlerts }

  // ---- 시간 변경 감지: startTime이 달라진 이벤트는 플래그 리셋 ----
  for (const evt of events) {
    const state = updatedEventAlerts[evt.id]
    if (state && state.startTime !== evt.startTime) {
      updatedEventAlerts[evt.id] = { startTime: evt.startTime }
    }
  }

  // ---- 캘린더: 10분 전 / 5분 전 / 1분 전 / 정시 알림 필터 ----
  const eventsToNotify = events.filter((evt) => {
    const startMs    = new Date(evt.startTime).getTime()
    const msTilStart = startMs - now
    const state      = updatedEventAlerts[evt.id] ?? {}

    let shouldNotify = false

    if (msTilStart >= ALERT_10MIN_MIN && msTilStart <= ALERT_10MIN_MAX && !state.tenMin) {
      state.tenMin  = true
      shouldNotify  = true
    } else if (msTilStart >= ALERT_5MIN_MIN && msTilStart <= ALERT_5MIN_MAX && !state.fiveMin) {
      state.fiveMin = true
      shouldNotify  = true
    } else if (msTilStart >= ALERT_1MIN_MIN && msTilStart <= ALERT_1MIN_MAX && !state.oneMin) {
      state.oneMin  = true
      shouldNotify  = true
    } else if (Math.abs(msTilStart) <= ON_TIME_WINDOW && !state.onTime) {
      state.onTime  = true
      shouldNotify  = true
    }

    state.startTime = evt.startTime
    updatedEventAlerts[evt.id] = state
    return shouldNotify
  })

  // ---- Gmail: 새로 도착한 메일만 필터 ----
  const newEmails = emails.filter((e) => !notifiedEmailIds.includes(e.id))
  const allNotifiedIds = [...new Set([...notifiedEmailIds, ...emails.map((e) => e.id)])].slice(-500)

  // ---- 알림 상태 저장 ----
  // 종료된 이벤트 정리 (당일 내 처리)
  const validEventIds = new Set(events.map((e) => e.id))
  for (const id of Object.keys(updatedEventAlerts)) {
    if (!validEventIds.has(id)) delete updatedEventAlerts[id]
  }

  await chrome.storage.local.set({
    [STORAGE_KEY_NOTIFIED_EMAILS]: allNotifiedIds,
    [STORAGE_KEY_EVENT_ALERTS]:    updatedEventAlerts,
  })

  if (eventsToNotify.length === 0 && newEmails.length === 0) {
    console.log('[Orbit] 새 알림 없음 — 건너뜀.')
    return null
  }

  // ---- 요약 메시지 생성 ----
  let summary = ''

  if (eventsToNotify.length > 0 && newEmails.length > 0) {
    summary = `일정 알림 ${eventsToNotify.length}개, 새 메일 ${newEmails.length}개`
  } else if (eventsToNotify.length > 0) {
    const evt        = eventsToNotify[0]
    const startMs    = new Date(evt.startTime).getTime()
    const msTilStart = startMs - now
    if (msTilStart > ALERT_5MIN_MAX) {
      summary = `"${evt.title}" 10분 후 시작해요!`
    } else if (msTilStart > ALERT_1MIN_MAX) {
      summary = `"${evt.title}" 5분 후 시작해요!`
    } else if (msTilStart > 0) {
      summary = `"${evt.title}" 곧 시작해요! (1분 이내)`
    } else {
      summary = `"${evt.title}" 지금 시작됐어요!`
    }
  } else {
    summary = newEmails.length === 1
      ? `"${newEmails[0].subject}" 새 메일이 도착했어요`
      : `새 메일 ${newEmails.length}개가 도착했어요`
  }

  return {
    urgent: true,
    summary,
    tasks:  [],
    events: eventsToNotify,
    emails: newEmails,
    timestamp: now,
  }
}

// ---- 수동 브리핑: 오늘 남은 전체 일정 + 최근 메일 (필터 없음) ----
async function fetchFullBriefing(): Promise<BriefingPayload | null> {
  const signedIn = await isSignedIn()
  if (!signedIn) {
    console.warn('[Orbit] Not signed in — skipping full briefing.')
    return null
  }

  const [allEvents, emails] = await Promise.all([
    fetchTodayEvents(),
    fetchUnreadEmails(),
  ])

  const now = Date.now()

  // 이미 끝난 일정은 제외, 남은 일정만 표시
  const remainingEvents = allEvents.filter(
    (evt) => new Date(evt.endTime).getTime() > now
  )

  console.log(`[Orbit] Full briefing: ${remainingEvents.length} events, ${emails.length} emails`)

  // 내용이 없어도 빈 브리핑으로 반환 (말풍선에 "오늘 일정 없음" 표시)
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

// ---- 스토리지의 기존 briefing을 모든 탭에 브로드캐스트 (새 fetch 없이) ----
async function broadcastStoredBriefingToAllTabs(): Promise<void> {
  const { petBriefing, petDismissed } = await chrome.storage.local.get(['petBriefing', 'petDismissed'])
  if (!petBriefing || petDismissed) return

  const message: ExtMessage = { type: 'BRIEFING_ALERT', payload: petBriefing }
  const allTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
  for (const tab of allTabs) {
    if (!tab.id) continue
    chrome.tabs.sendMessage(tab.id, message).catch(() => {
      // content script 미준비 탭 — document_start로 곧 마운트되면 storage에서 자동 복원
    })
  }
  console.log(`[Orbit] Broadcast stored briefing to ${allTabs.length} tabs on startup.`)
}

// ---- 네이티브 Chrome 알림 표시 ----
// Chrome notifications API는 iconUrl이 필수. 아이콘이 없을 경우 data URI로 빈 이미지를 사용한다.
const NOTIFICATION_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAb0lEQVR4nO3PwQkAIAxD0e5/dHcQHEFBPHhp3iGQ8BIAAAAAAAAAAAAAAOBvmqSqdjezR2ZmZmZmZmZmZmZmZmZmZmZmZm' +
  'ZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmAAAAAAAAAAAAAAAAAAAA4A8uBQAA//9HVRwJAAAAAElFTkSuQmCC'

function showNativeNotification(id: string, title: string, message: string): void {
  chrome.notifications.create(`orbit-${id}-${Date.now()}`, {
    type:     'basic',
    iconUrl:  NOTIFICATION_ICON,
    title,
    message,
    priority: 2,
  })
}

// ---- FCM NEW_EMAIL: History API로 새 메일 즉시 처리 ----
async function handleNewEmailPush(): Promise<void> {
  const signedIn = await isSignedIn()
  if (!signedIn) return

  const newEmails = await fetchNewEmailsViaHistory()
  if (newEmails.length === 0) {
    console.log('[Orbit] History API: 새 메일 없음')
    return
  }

  console.log(`[Orbit] History API: 새 메일 ${newEmails.length}개 감지`)

  // 네이티브 알림 (브라우저 포커스 여부 무관)
  for (const email of newEmails) {
    showNativeNotification(
      email.id,
      '새 메일이 도착했어요!',
      `${email.from}: ${email.subject}`
    )
  }

  // 말풍선 알림용 payload
  const summary = newEmails.length === 1
    ? `"${newEmails[0].subject}" 새 메일이 도착했어요`
    : `새 메일 ${newEmails.length}개가 도착했어요`

  const payload: BriefingPayload = {
    urgent:    true,
    summary,
    tasks:     [],
    events:    [],
    emails:    newEmails,
    timestamp: Date.now(),
  }

  await chrome.storage.local.set({
    petBriefing:  payload,
    petDismissed: false,
    petState:     'alert',
  })

  const message: ExtMessage = { type: 'BRIEFING_ALERT', payload }
  const allTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
  for (const tab of allTabs) {
    if (!tab.id) continue
    chrome.tabs.sendMessage(tab.id, message).catch(() => {})
  }
}

// ---- 새 일정 감지 (당일 외 미래 일정도 포함) ----
async function checkForNewCalendarEvents(): Promise<void> {
  const signedIn = await isSignedIn()
  if (!signedIn) return

  const now = Date.now()
  const { calendarLastChecked, [STORAGE_KEY_NOTIFIED_NEW_EVENTS]: storedIds } =
    await chrome.storage.local.get(['calendarLastChecked', STORAGE_KEY_NOTIFIED_NEW_EVENTS])

  // 마지막 체크 시점 (없으면 5분 전으로 설정해 초기 알림 방지)
  const lastChecked: number = calendarLastChecked ?? now - 5 * 60 * 1000
  const notifiedIds: string[] = storedIds ?? []

  // 마지막 체크 이후 업데이트된 이벤트 조회
  const updatedMin = new Date(lastChecked)
  const recentEvents = await fetchRecentlyUpdatedEvents(updatedMin)

  await chrome.storage.local.set({ calendarLastChecked: now })

  if (recentEvents.length === 0) return

  // 새로 생성된 이벤트만 필터 (이미 알린 것 제외)
  const newEvents = recentEvents.filter((evt) => {
    if (notifiedIds.includes(evt.id)) return false
    // created가 마지막 체크 이후인 경우만 "새 일정"으로 처리
    if (!evt.created) return false
    return new Date(evt.created).getTime() > lastChecked
  })

  if (newEvents.length === 0) return

  console.log(`[Orbit] 새 일정 ${newEvents.length}개 감지`)

  const allNotifiedIds = [...new Set([...notifiedIds, ...newEvents.map((e) => e.id)])].slice(-200)
  await chrome.storage.local.set({ [STORAGE_KEY_NOTIFIED_NEW_EVENTS]: allNotifiedIds })

  // 네이티브 알림
  for (const evt of newEvents) {
    const startDate = new Date(evt.startTime)
    const dateStr   = `${startDate.getMonth() + 1}/${startDate.getDate()} ${startDate.getHours()}:${String(startDate.getMinutes()).padStart(2, '0')}`
    showNativeNotification(evt.id, '새 일정이 추가됐어요!', `"${evt.title}" — ${dateStr}`)
  }

  // 말풍선 payload
  const summary = newEvents.length === 1
    ? `"${newEvents[0].title}" 새 일정이 추가됐어요`
    : `새 일정 ${newEvents.length}개가 추가됐어요`

  const payload: BriefingPayload = {
    urgent:    true,
    summary,
    tasks:     [],
    events:    newEvents,
    emails:    [],
    timestamp: now,
  }

  await chrome.storage.local.set({
    petBriefing:  payload,
    petDismissed: false,
    petState:     'alert',
  })

  const message: ExtMessage = { type: 'BRIEFING_ALERT', payload }
  const allTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
  for (const tab of allTabs) {
    if (!tab.id) continue
    chrome.tabs.sendMessage(tab.id, message).catch(() => {})
  }
}

// ---- 활성 탭에 브리핑 전송 + 탭 간 공유 상태 저장 ----
async function sendBriefingToActiveTab(): Promise<void> {
  const payload = await fetchBriefingData()
  if (!payload) {
    console.log('[Orbit] No briefing payload — nothing to send.')
    return
  }

  // 캘린더 알림 네이티브 알림
  for (const evt of payload.events) {
    const startMs    = new Date(evt.startTime).getTime()
    const msTilStart = startMs - Date.now()
    let notifMsg = ''
    if (msTilStart > ALERT_5MIN_MAX)       notifMsg = `10분 후 시작해요!`
    else if (msTilStart > ALERT_1MIN_MAX)  notifMsg = `5분 후 시작해요!`
    else if (msTilStart > 0)               notifMsg = `곧 시작해요! (1분 이내)`
    else                                   notifMsg = `지금 시작됐어요!`
    showNativeNotification(evt.id, evt.title, notifMsg)
  }

  // 탭 간 공유 상태 저장: 새 탭 / 탭 전환 시 복원에 사용
  await chrome.storage.local.set({
    petBriefing:  payload,
    petDismissed: false,
    petState:     'alert',  // 새 브리핑 = 항상 alert 상태로 초기화
  })
  console.log('[Orbit] Briefing saved to storage for cross-tab persistence.')

  const message: ExtMessage = { type: 'BRIEFING_ALERT', payload }

  // 모든 http/https 탭에 브리핑 전송 (탭 전환 후에도 즉시 표시)
  const allTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
  let sent = 0
  for (const tab of allTabs) {
    if (!tab.id) continue
    try {
      await chrome.tabs.sendMessage(tab.id, message)
      sent++
    } catch {
      // Content script 미주입 탭 — storage로 복원됨
    }
  }
  console.log(`[Orbit] Briefing sent to ${sent}/${allTabs.length} tabs.`)
}

// ---- 팝업 / 기타 컴포넌트 메시지 처리 ----
chrome.runtime.onMessage.addListener((message: ExtMessage, _sender, sendResponse) => {
  if (message.type === 'PING') {
    isSignedIn().then((signedIn) => {
      sendResponse({ status: 'ok', version: '0.1.0', signedIn })
    })
    return true
  }

  if (message.type === 'FETCH_NOW') {
    ;(async () => {
      const payload = await fetchFullBriefing()
      if (payload) {
        await chrome.storage.local.set({
          petBriefing:  payload,
          petDismissed: false,
          petState:     'alert',
        })
        const msg: ExtMessage = { type: 'BRIEFING_ALERT', payload }
        const allTabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] })
        for (const tab of allTabs) {
          if (!tab.id) continue
          chrome.tabs.sendMessage(tab.id, msg).catch(() => {})
        }
      }
      sendResponse({ ok: true })
    })()
    return true
  }

  // 브리핑 탭 전용: 사이드 이펙트 없이 현재 탭에만 결과 반환
  if (message.type === 'FETCH_FULL_BRIEFING') {
    fetchFullBriefing().then((payload) => sendResponse({ payload }))
    return true
  }

  if (message.type === 'INIT_PUSH') {
    initializeExternalPush().then(() => sendResponse({ ok: true }))
    return true
  }

  if (message.type === 'SIGN_OUT') {
    getAuthToken(false).then(async (token) => {
      if (token) await removeCachedToken(token)
      sendResponse({ ok: true })
    })
    return true
  }

  if (message.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null as unknown as number, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch(() => sendResponse({ dataUrl: null }))
    return true
  }

  if (message.type === 'TRANSLATE_TEXT') {
    chrome.storage.local.get(['geminiApiKey'], async ({ geminiApiKey }) => {
      if (!geminiApiKey) {
        const res: GeminiResponse = { result: null, error: 'NO_API_KEY' }
        sendResponse(res)
        return
      }
      try {
        const result = await translateText(message.text, message.sourceLang, message.targetLang, geminiApiKey)
        const res: GeminiResponse = { result }
        sendResponse(res)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        const res: GeminiResponse = { result: null, error }
        sendResponse(res)
      }
    })
    return true
  }

  if (message.type === 'SUMMARIZE_PAGE') {
    chrome.storage.local.get(['geminiApiKey'], async ({ geminiApiKey }) => {
      if (!geminiApiKey) {
        const res: GeminiResponse = { result: null, error: 'NO_API_KEY' }
        sendResponse(res)
        return
      }
      try {
        const result = await summarizePage(message.pageText, geminiApiKey)
        const res: GeminiResponse = { result }
        sendResponse(res)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        const res: GeminiResponse = { result: null, error }
        sendResponse(res)
      }
    })
    return true
  }

  if (message.type === 'ASK_GEMINI') {
    chrome.storage.local.get(['geminiApiKey'], async ({ geminiApiKey }) => {
      if (!geminiApiKey) {
        const res: GeminiResponse = { result: null, error: 'NO_API_KEY' }
        sendResponse(res)
        return
      }
      try {
        const result = await askQuestion(message.question, geminiApiKey)
        const res: GeminiResponse = { result }
        sendResponse(res)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        const res: GeminiResponse = { result: null, error }
        sendResponse(res)
      }
    })
    return true
  }

  return true
})
