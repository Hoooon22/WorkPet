/**
 * PetOverlay.tsx
 * Content Script의 최상위 컨테이너 컴포넌트
 *
 * 철학 — 비침해적 UX:
 * - 전체 오버레이: pointer-events: none (호스트 페이지 인터랙션 보호)
 * - 펫 + 말풍선 영역만: pointer-events: auto
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import OrbitCharacter from './OrbitCharacter'
import MorningBriefingDashboard from './MorningBriefingDashboard'
import PetSpeechBubble from './PetSpeechBubble'
import WanderingPetContainer from './WanderingPetContainer'
import MondayGacha from './MondayGacha'
import ScreenshotSelector from './ScreenshotSelector'
import { ORBIT_MSG_EVENT } from '../index'
import type { PetState, ExtMessage, BriefingPayload, GachaResult } from '../../types/messages'
import { formatTimerTime, type FocusTimerState } from './FocusTimerPanel'

const IDLE_FOCUS_TIMER: FocusTimerState = { phase: 'idle', total: 0, remaining: 0 }

const EMPTY_BRIEFING: BriefingPayload = {
  urgent: false,
  summary: '',
  tasks: [],
  events: [],
  emails: [],
  timestamp: 0,
}

const DEV_MOCK_BRIEFING: BriefingPayload = {
  urgent: true,
  summary: '오늘 할 일이 있어요!',
  tasks: [
    { id: 't1', title: '디자인 리뷰 완료하기', dueDate: new Date(Date.now() + 3600000).toISOString(), project: 'WorkPet', urgent: true },
    { id: 't2', title: '주간 보고서 작성', dueDate: new Date(Date.now() + 7200000).toISOString(), project: 'WorkPet', urgent: false },
  ],
  events: [
    { id: 'e1', title: '팀 스탠드업 미팅', startTime: new Date(Date.now() + 1800000).toISOString(), endTime: new Date(Date.now() + 5400000).toISOString() },
  ],
  emails: [],
  timestamp: Date.now(),
}

// 현재 남은 항목 기준으로 동적으로 메시지 생성 (briefing.summary는 최초 수신 시 고정값이라 사용 안 함)
function computeLiveSummary(briefing: BriefingPayload): string {
  const { tasks, events, emails } = briefing
  if (tasks.length === 0 && events.length === 0 && emails.length === 0) return '모든 알림을 확인했어요 😊'
  const parts: string[] = []
  if (events.length > 0) parts.push(`일정 ${events.length}개`)
  if (emails.length > 0) parts.push(`메일 ${emails.length}개`)
  if (tasks.length > 0)  parts.push(`태스크 ${tasks.length}개`)
  return parts.join(', ') + ' 남아있어요'
}

export default function PetOverlay() {
  const [isSignedIn, setIsSignedIn] = useState(import.meta.env.DEV ? true : false)
  const [petState, setPetState]     = useState<PetState>(import.meta.env.DEV ? 'alert' : 'idle')
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [briefing, setBriefing]     = useState<BriefingPayload>(import.meta.env.DEV ? DEV_MOCK_BRIEFING : EMPTY_BRIEFING)
  const [isVisible, setIsVisible]   = useState(import.meta.env.DEV ? true : false)
  const [initialX, setInitialX]     = useState<number | undefined>(undefined)
  const [gachaOpen, setGachaOpen]       = useState(false)
  const [activePet, setActivePet]       = useState<GachaResult | null>(null)
  const [isFreshSummon, setIsFreshSummon] = useState(false)
  const [wanderEnabled, setWanderEnabled] = useState(true)
  const [resetTrigger, setResetTrigger] = useState(0)
  const [forcedX, setForcedX] = useState<number | undefined>(undefined)
  const [showAreaSelector, setShowAreaSelector] = useState(false)

  // ---- 브리핑 탭 전용: 수동 전체 브리핑 (알람 시스템과 독립) ----
  const [fullBriefing, setFullBriefing] = useState<BriefingPayload | null>(null)
  const [isLoadingFullBriefing, setIsLoadingFullBriefing] = useState(false)

  const dismissTimerRef  = useRef<ReturnType<typeof setTimeout>>()
  // storage.onChanged 중복 처리 방지 (메시지 수신과 동시 발생 가능)
  const lastTimestampRef = useRef<number>(0)

  // ---- 집중 타이머 (말풍선이 닫혀도 유지) ----
  const [focusTimer, setFocusTimer] = useState<FocusTimerState>(IDLE_FOCUS_TIMER)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval>>()

  // 졸음 상태 (idle + 말풍선 닫힘 2분 경과 시 진입)
  const [isSleepy, setIsSleepy] = useState(false)
  const sleepyTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // 아침 인사 (첫 등장 시 오전 6~11시)
  const [isMorningGreeting, setIsMorningGreeting] = useState(false)
  const morningGreetingShownRef = useRef(false)

  // 로그인/로그아웃 인사 말풍선
  const [greetingMsg, setGreetingMsg] = useState<string | null>(null)
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // ---- 탭 전환/새 탭: storage에서 펫 상태 복원 ----
  useEffect(() => {
    chrome.storage.local.get(['petBriefing', 'petDismissed', 'petState', 'petX', 'activePet', 'orbitSignedIn', 'wanderEnabled'], (result) => {
      // 로그아웃 상태면 펫 미등장
      if (!result.orbitSignedIn) return
      setIsSignedIn(true)
      // 가챠 펫 복원
      if (result.activePet) setActivePet(result.activePet as GachaResult)
      // 위치 복원
      if (result.petX !== undefined) setInitialX(result.petX as number)
      // 돌아다니기 상태 복원
      if (result.wanderEnabled !== undefined) setWanderEnabled(result.wanderEnabled as boolean)
      // petDismissed가 명시적으로 true가 아닌 한 펫 표시 (소환 상태 유지)
      if (!result.petDismissed) {
        setIsVisible(true)
        if (result.petBriefing) {
          clearTimeout(dismissTimerRef.current)
          lastTimestampRef.current = result.petBriefing.timestamp
          setBriefing(result.petBriefing)
          setPetState((result.petState as PetState) ?? 'alert')
        }
      }
    })
  }, [])

  // ---- storage.onChanged: 다른 탭에서 새 briefing 발생 시 수신 ----
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      // 다른 탭/팝업에서 로그아웃 → 이 탭도 즉시 펫 퇴장
      if (changes.orbitSignedIn?.newValue === false) {
        setIsSignedIn(false)
        setGreetingMsg(null)
        clearTimeout(greetingTimerRef.current)
        setBubbleOpen(false)
        setPetState('dismissed')
        dismissTimerRef.current = setTimeout(() => setIsVisible(false), 600)
        return
      }
      // 다른 탭/팝업에서 로그인 → isSignedIn 동기화 (펫 등장은 LOGIN_GREETING 메시지가 담당)
      if (changes.orbitSignedIn?.newValue === true) {
        setIsSignedIn(true)
        return
      }
      if (changes.petBriefing?.newValue) {
        const newBriefing: BriefingPayload = changes.petBriefing.newValue
        // 이미 이 탭에서 메시지로 받은 것과 중복이면 건너뜀
        if (newBriefing.timestamp === lastTimestampRef.current) return
        lastTimestampRef.current = newBriefing.timestamp
        clearTimeout(dismissTimerRef.current)
        setBriefing(newBriefing)
        setPetState('alert')
        setIsVisible(true)
        // petState: 'alert' 는 background.ts에서 petBriefing과 함께 저장됨
      }
      if (changes.petDismissed?.newValue === true) {
        // 다른 탭에서 dismiss된 경우 이 탭도 퇴장
        setBubbleOpen(false)
        setPetState('dismissed')
        dismissTimerRef.current = setTimeout(() => setIsVisible(false), 600)
      }
      if (changes.petState?.newValue === 'idle') {
        // 다른 탭에서 브리핑 확인한 경우 이 탭도 idle로 동기화
        setPetState('idle')
        setBubbleOpen(false)
      }
      // 다른 탭에서 돌아다니기 토글 → 이 탭도 동기화
      if (changes.wanderEnabled?.newValue !== undefined) {
        setWanderEnabled(changes.wanderEnabled.newValue as boolean)
      }
      // 다른 탭에서 원위치 명령 → 이 탭도 강제 이동
      if (changes.petReturnHome?.newValue !== undefined) {
        const homeX = window.innerWidth - 88
        setForcedX(homeX)
      }
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [])

  // ---- endTime 지난 이벤트 자동 제거 (30초 간격) ----
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setBriefing((prev) => {
        const filtered = prev.events.filter(
          (evt) => new Date(evt.endTime).getTime() > now
        )
        if (filtered.length === prev.events.length) return prev
        return { ...prev, events: filtered }
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  // ---- "들어가" 버튼: 펫 퇴장 (전 탭 동기화) ----
  const handleDismiss = useCallback(() => {
    chrome.storage.local.set({ petDismissed: true })
    setBubbleOpen(false)
    setPetState('dismissed')
    dismissTimerRef.current = setTimeout(() => setIsVisible(false), 600)
  }, [])

  // ---- window CustomEvent 수신 (index.tsx의 리스너가 dispatch) ----
  useEffect(() => {
    const handler = (e: Event) => {
      const message = (e as CustomEvent<ExtMessage>).detail

      if (message.type === 'BRIEFING_ALERT') {
        // 로그아웃 상태면 브리핑 무시
        if (!isSignedIn) return
        clearTimeout(dismissTimerRef.current)
        lastTimestampRef.current = message.payload.timestamp  // 중복 방지
        setBriefing(message.payload)
        setPetState('alert')
        setIsVisible(true)
        // petState: 'alert' 는 background.ts에서 이미 저장됨

      } else if (message.type === 'DISMISS_PET') {
        handleDismiss()

      } else if (message.type === 'SHOW_GACHA') {
        // 로그인 상태에서만 가챠 가능
        if (!isSignedIn) return
        setGachaOpen(true)

      } else if (message.type === 'SHOW_PET') {
        // 로그인 상태에서만 펫 소환 가능
        if (!isSignedIn) return
        clearTimeout(dismissTimerRef.current)
        // 새로고침 후에도 소환 상태가 유지되도록 storage에 반영
        chrome.storage.local.set({ petDismissed: false })
        setIsVisible(true)
        setPetState('idle')
        setBubbleOpen(false)

      } else if (message.type === 'LOGIN_GREETING') {
        clearTimeout(dismissTimerRef.current)
        clearTimeout(greetingTimerRef.current)
        setIsSignedIn(true)
        setIsVisible(true)
        setPetState('idle')
        setBubbleOpen(false)
        // 파트너가 없으면 가챠 자동 오픈, 있으면 인사 말풍선 표시
        setActivePet((currentPet) => {
          if (!currentPet) {
            greetingTimerRef.current = setTimeout(() => setGachaOpen(true), 600)
          } else {
            greetingTimerRef.current = setTimeout(() => {
              const hour = new Date().getHours()
              const timeGreet = hour < 12 ? '좋은 아침이에요' : hour < 18 ? '안녕하세요' : '안녕하세요'
              setGreetingMsg(`${timeGreet}! 오늘도 함께해요 😊`)
              greetingTimerRef.current = setTimeout(() => setGreetingMsg(null), 3000)
            }, 900)
          }
          return currentPet
        })

      } else if (message.type === 'LOGOUT_FAREWELL') {
        setIsSignedIn(false)
        clearTimeout(greetingTimerRef.current)
        // 펫이 화면에 있을 때만 작별 인사, 없으면 그냥 조용히 종료
        if (!isVisible) return
        setBubbleOpen(false)
        setGreetingMsg('잘 있어요! 또 봐요 👋')
        greetingTimerRef.current = setTimeout(() => {
          setGreetingMsg(null)
          handleDismiss()
        }, 2000)
      }
    }

    window.addEventListener(ORBIT_MSG_EVENT, handler)
    return () => window.removeEventListener(ORBIT_MSG_EVENT, handler)
  }, [handleDismiss, isSignedIn, isVisible])

  // ---- 펫 클릭: 말풍선 토글 ----
  const handlePetClick = useCallback(() => {
    setBubbleOpen((prev) => {
      const next = !prev
      if (!next && petState === 'alert') setPetState('idle')
      return next
    })
  }, [petState])

  // ---- "확인하기" 버튼: 말풍선 닫고 idle ----
  const handleConfirm = useCallback(() => {
    setBubbleOpen(false)
    setPetState('idle')
    chrome.storage.local.set({ petState: 'idle' })
  }, [])

  // ---- 읽음 처리 후 storage 동기화 (새 탭이 열릴 때 올바른 카운트 복원) ----
  const persistBriefing = useCallback((updated: BriefingPayload) => {
    chrome.storage.local.set({ petBriefing: updated })
  }, [])

  // ---- 일정 읽음 처리: 해당 이벤트 제거 ----
  const handleEventRead = useCallback((id: string) => {
    setBriefing((prev) => {
      const updated = { ...prev, events: prev.events.filter((evt) => evt.id !== id) }
      persistBriefing(updated)
      return updated
    })
  }, [persistBriefing])

  // ---- 메일 읽음 처리: 해당 메일 제거 ----
  const handleEmailRead = useCallback((id: string) => {
    setBriefing((prev) => {
      const updated = { ...prev, emails: prev.emails.filter((email) => email.id !== id) }
      persistBriefing(updated)
      return updated
    })
  }, [persistBriefing])

  // ---- alert 말풍선 5초 자동 소멸 ----
  const [showAlertBubble, setShowAlertBubble] = useState(false)
  const alertBubbleTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(alertBubbleTimerRef.current)
    if (petState === 'alert' && !bubbleOpen) {
      setShowAlertBubble(true)
      alertBubbleTimerRef.current = setTimeout(() => setShowAlertBubble(false), 5000)
    } else {
      setShowAlertBubble(false)
    }
    return () => clearTimeout(alertBubbleTimerRef.current)
  }, [petState, bubbleOpen])

  // ---- "모든 알림 확인" 말풍선 자동 소멸용 상태 ----
  const [showIdleBubble, setShowIdleBubble] = useState(false)

  // ---- 모든 항목 읽음 → 자동 idle 전환 + showIdleBubble 활성화 ----
  useEffect(() => {
    if (petState !== 'alert') return
    const allRead = briefing.tasks.length === 0 && briefing.events.length === 0 && briefing.emails.length === 0
    if (!allRead) return
    handleConfirm()
    setShowIdleBubble(true)
  }, [briefing, petState, handleConfirm])

  // ---- showIdleBubble 활성화 → 5초 후 자동 소멸 (petState 변경에 영향받지 않음) ----
  useEffect(() => {
    if (!showIdleBubble) return
    const t = setTimeout(() => setShowIdleBubble(false), 5000)
    return () => clearTimeout(t)
  }, [showIdleBubble])


  // ---- 가챠 펫 선택: storage에 저장 후 메인 펫으로 적용 ----
  const handlePetSelected = useCallback((pet: GachaResult) => {
    chrome.storage.local.set({ activePet: pet })
    setActivePet(pet)
    setIsVisible(true)
    setIsFreshSummon(true)
    // 소환 애니메이션 완료 후 펫 인사
    clearTimeout(greetingTimerRef.current)
    greetingTimerRef.current = setTimeout(() => {
      setGreetingMsg(`안녕! 나는 ${pet.name}이야 🎉`)
      greetingTimerRef.current = setTimeout(() => setGreetingMsg(null), 4000)
    }, 1500)
  }, [])

  // ---- 소환 애니메이션 완료 후 isFreshSummon 리셋 ----
  useEffect(() => {
    if (!isFreshSummon) return
    const t = setTimeout(() => setIsFreshSummon(false), 1200)
    return () => clearTimeout(t)
  }, [isFreshSummon])

  // ---- 졸음: idle + 말풍선 닫힘 상태로 2분 경과 시 졸음 진입 ----
  useEffect(() => {
    clearTimeout(sleepyTimerRef.current)
    setIsSleepy(false)
    if (petState === 'idle' && !bubbleOpen) {
      sleepyTimerRef.current = setTimeout(() => setIsSleepy(true), 120_000)
    }
    return () => clearTimeout(sleepyTimerRef.current)
  }, [petState, bubbleOpen])

  // ---- 아침 인사: 첫 등장 시 오전 6~11시면 흔들기 ----
  useEffect(() => {
    if (!isVisible || morningGreetingShownRef.current) return
    morningGreetingShownRef.current = true
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 11) {
      setIsMorningGreeting(true)
      const t = setTimeout(() => setIsMorningGreeting(false), 3000)
      return () => clearTimeout(t)
    }
  }, [isVisible])

  // ---- 집중 타이머 tick ----
  useEffect(() => {
    clearInterval(timerIntervalRef.current)
    if (focusTimer.phase !== 'running') return
    timerIntervalRef.current = setInterval(() => {
      setFocusTimer((prev) => {
        if (prev.remaining <= 1) {
          clearInterval(timerIntervalRef.current)
          return { ...prev, phase: 'done', remaining: 0 }
        }
        return { ...prev, remaining: prev.remaining - 1 }
      })
    }, 1000)
    return () => clearInterval(timerIntervalRef.current)
  }, [focusTimer.phase])

  const handleTimerStart = useCallback((seconds: number) => {
    clearInterval(timerIntervalRef.current)
    setFocusTimer({ phase: 'running', total: seconds, remaining: seconds })
  }, [])

  const handleTimerTogglePause = useCallback(() => {
    setFocusTimer((prev) =>
      prev.phase === 'running'
        ? { ...prev, phase: 'paused' }
        : { ...prev, phase: 'running' }
    )
  }, [])

  const handleTimerReset = useCallback(() => {
    clearInterval(timerIntervalRef.current)
    setFocusTimer(IDLE_FOCUS_TIMER)
  }, [])

  // ---- 브리핑 탭: 수동 전체 브리핑 fetch ----
  const handleFetchFullBriefing = useCallback(() => {
    setIsLoadingFullBriefing(true)
    chrome.runtime.sendMessage({ type: 'FETCH_FULL_BRIEFING' }, (response) => {
      setIsLoadingFullBriefing(false)
      if (response?.payload) setFullBriefing(response.payload)
    })
  }, [])

  // ---- 영역 선택 스크린샷 시작 ----
  // BrowserToolsPanel이 언마운트되기 전에 호출되므로 상태는 여기서 관리한다.
  const handleStartAreaCapture = useCallback(() => {
    setBubbleOpen(false)
    // 패널 닫힘 애니메이션(~300ms) 후 선택기 표시
    setTimeout(() => setShowAreaSelector(true), 320)
  }, [])

  // ---- 원위치 이동: 돌아다니기 비활성화 + 우측 하단으로 복귀 (전 탭 동기화) ----
  const handleReturnHome = useCallback(() => {
    setWanderEnabled(false)
    setResetTrigger((prev) => prev + 1)
    const defaultX = window.innerWidth - 88
    chrome.storage.local.set({ petX: defaultX, wanderEnabled: false, petReturnHome: Date.now() })
  }, [])

  // ---- wanderEnabled 변경 시 storage에 저장 (전 탭 동기화) ----
  const prevWanderEnabledRef = useRef(wanderEnabled)
  useEffect(() => {
    if (prevWanderEnabledRef.current === wanderEnabled) return
    prevWanderEnabledRef.current = wanderEnabled
    chrome.storage.local.set({ wanderEnabled })
  }, [wanderEnabled])

  // ---- 펫 위치 변경 시 storage에 저장 ----
  const handleXChange = useCallback((x: number) => {
    chrome.storage.local.set({ petX: x })
  }, [])

  // ---- 외부 클릭 시 패널 닫기 ----
  const overlayRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!bubbleOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      // Shadow DOM 환경: composedPath()로 실제 클릭 경로 확인
      if (overlayRef.current && !e.composedPath().includes(overlayRef.current)) {
        setBubbleOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick, true)
    return () => document.removeEventListener('mousedown', handleOutsideClick, true)
  }, [bubbleOpen])

  if (gachaOpen) {
    return <MondayGacha onClose={() => setGachaOpen(false)} onPetSelected={handlePetSelected} />
  }

  // 영역 선택 중에는 펫 UI를 숨기고 선택기만 표시
  if (showAreaSelector) {
    return (
      <ScreenshotSelector onDone={() => setShowAreaSelector(false)} />
    )
  }

  if (!isVisible) return null

  return (
    /*
     * 전체 화면 투명 오버레이
     * pointer-events: none → 호스트 페이지 클릭/스크롤 완전 보호
     */
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        bottom: 0,
        right: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 2147483647,
        pointerEvents: 'none',
      }}
    >
      <WanderingPetContainer isActive={petState === 'idle' && !bubbleOpen && wanderEnabled} initialX={initialX} onXChange={handleXChange} resetTrigger={resetTrigger} forcedX={forcedX}>
        {({ isWalking, direction, x }) => {
          // 말풍선(maxWidth 220px)이 오른쪽에서 잘릴 것 같으면 왼쪽으로 뒤집기
          // 펫 위치(x) + 펫 너비(64) + 말풍선 오프셋(~51) + 말풍선 최대 너비(220) > 화면 너비
          const bubbleAlign = x + 64 + 51 + 220 > window.innerWidth ? 'left' : 'right'
          return (
          <>
            <MorningBriefingDashboard
              visible={bubbleOpen}
              briefing={briefing}
              onConfirm={handleConfirm}
              onDismiss={handleDismiss}
              onEventRead={handleEventRead}
              onEmailRead={handleEmailRead}
              wanderEnabled={wanderEnabled}
              onToggleWander={() => setWanderEnabled((prev) => !prev)}
              onReturnHome={handleReturnHome}
              onCloseBubble={() => setBubbleOpen(false)}
              onStartAreaCapture={handleStartAreaCapture}
              focusTimer={focusTimer}
              onTimerStart={handleTimerStart}
              onTimerTogglePause={handleTimerTogglePause}
              onTimerReset={handleTimerReset}
              fullBriefing={fullBriefing}
              isLoadingFullBriefing={isLoadingFullBriefing}
              onFetchFullBriefing={handleFetchFullBriefing}
            />

            <AnimatePresence>
              {/* 집중 타이머 말풍선 — 말풍선 닫힘 + 타이머 실행/일시정지 중 */}
              {!bubbleOpen && (focusTimer.phase === 'running' || focusTimer.phase === 'paused') && (
                <PetSpeechBubble
                  key="timer-bubble"
                  message={
                    focusTimer.phase === 'paused'
                      ? `⏸ ${formatTimerTime(focusTimer.remaining)}`
                      : `⏱️ ${formatTimerTime(focusTimer.remaining)}`
                  }
                  align={bubbleAlign}
                />
              )}
              {/* alert 말풍선(5초 후 자동 소멸) 또는 "모든 알림 확인" 메시지(5초 후 자동 소멸) */}
              {(focusTimer.phase === 'idle' || focusTimer.phase === 'done') && (showAlertBubble || showIdleBubble) && (
                <PetSpeechBubble key="alert-bubble" message={computeLiveSummary(briefing)} align={bubbleAlign} />
              )}
              {/* 로그인/로그아웃 인사 말풍선 */}
              {greetingMsg && !bubbleOpen && focusTimer.phase === 'idle' && !showAlertBubble && !showIdleBubble && (
                <PetSpeechBubble key="greeting-bubble" message={greetingMsg} align={bubbleAlign} />
              )}
            </AnimatePresence>

            <OrbitCharacter
              state={petState}
              onClick={handlePetClick}
              direction={direction}
              isWalking={wanderEnabled && isWalking}
              activePet={activePet ?? undefined}
              isFreshSummon={isFreshSummon}
              isSleepy={isSleepy}
              isMorningGreeting={isMorningGreeting}
              wanderEnabled={wanderEnabled}
            />

            {import.meta.env.DEV && (
              <div style={{
                position: 'absolute',
                bottom: '-20px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '10px',
                color: '#9ca3af',
                textAlign: 'center',
                fontFamily: 'monospace',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}>
                [{petState}] {isWalking ? `walking ${direction}` : ''}
              </div>
            )}
          </>
          )
        }}
      </WanderingPetContainer>
    </div>
  )
}
