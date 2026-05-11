import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { currentMonitor, primaryMonitor } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'
import PetSprite from './components/PetSprite'
import PetSpeechBubble from './components/PetSpeechBubble'
import PetQuestionInput from './components/PetQuestionInput'
import type { PetAction } from './components/petActions'
import { askQuestion, extractMemory } from '../shared/api/llm'
import { getLLMConfig, llmErrorMessage } from './panel/panels/llmHelpers'
import type {
  BriefingPayload,
  CalendarEvent,
  GachaResult,
  LottiePetId,
  PetId,
  PetSize,
  PetState,
  FocusTimerState,
} from '../shared/types'
import { EMPTY_BRIEFING, IDLE_FOCUS_TIMER } from '../shared/types'
import { isLottiePetId, isPetId } from '../shared/petCatalog'
import {
  getValue,
  setValue,
  subscribeStorage,
  KEYS,
  type UserProfile,
  type PetMemoryEntry,
} from '../shared/storage'
import {
  signIn,
  signOut,
  isSignedIn as checkSignedIn,
  getSignedInEmail,
} from '../shared/auth'
import { startBriefingScheduler, fetchNow } from '../shared/scheduler'

const appWindow = getCurrentWebviewWindow()

// ── Tunables ───────────────────────────────────────────────────
const DIRECTION_DEADZONE_PX = 30
const CURSOR_POLL_MS = 150
const WANDER_TICK_MS = 50
const WANDER_SPEED_PX_PER_SEC = 80
const USER_ACTION_COOLDOWN_MS = 1500
const PROGRAMMATIC_MOVE_FLAG_MS = 120
const DRAG_END_DEBOUNCE_MS = 80
const DRAG_MOVE_THRESHOLD_PX = 4
const FALL_ANIMATION_MS = 500
// Throw physics ─ velocity captured from real cursor samples taken during the
// drag, then a bouncy projectile arc instead of the straight-down fall.
// Window-onMoved events are coalesced by the OS during native drags, so we
// poll `get_cursor_position` to get high-fidelity samples of what the user's
// hand is actually doing.
const DRAG_CURSOR_POLL_MS = 16
const THROW_VELOCITY_WINDOW_MS = 70
const THROW_MIN_LAUNCH_PX_PER_SEC = 260
const THROW_MAX_LAUNCH_PX_PER_SEC = 3200
const THROW_GRAVITY_PX_PER_SEC2 = 2600
const THROW_WALL_RESTITUTION = 0.55
const THROW_GROUND_RESTITUTION = 0.32
const THROW_GROUND_FRICTION = 0.82
const THROW_REST_VY_PX_PER_SEC = 70
const THROW_REST_VX_PX_PER_SEC = 35
const THROW_TUMBLE_MS = 1500
const SLEEPY_TIMEOUT_MS = 300_000
const GREETING_DURATION_MS = 3000
const AWAY_THRESHOLD_SEC = 300
const AWAY_POLL_MS = 10_000
const AWAY_GREET_DURATION_MS = 4500
const FAREWELL_HOLD_MS = 1500
const WELCOME_GREET_RENDER_DELAY_MS = 250
const WELCOME_GREET_DURATION_MS = 2800

const log = (...args: unknown[]) => console.log('[orbit]', ...args)

const moveTracker = { lastProgrammaticAt: 0 }

// JS-side mirror of window position so hot loops avoid IPC reads.
const posCache = { x: 0, y: 0 }
const sizeCache = { w: 240, h: 320 }

async function setWindowPosition(x: number, y: number) {
  moveTracker.lastProgrammaticAt = Date.now()
  posCache.x = x
  posCache.y = y
  try {
    await appWindow.setPosition(new PhysicalPosition(x, y))
  } catch (e) {
    console.error('[orbit] setPosition failed', e)
  }
}

const isRecentProgrammatic = () =>
  Date.now() - moveTracker.lastProgrammaticAt < PROGRAMMATIC_MOVE_FLAG_MS

function animateFall(x: number, fromY: number, toY: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(toY - fromY) < 1) {
      resolve()
      return
    }
    const startAt = performance.now()
    let lastY = fromY
    const step = () => {
      const elapsed = performance.now() - startAt
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const y = Math.round(fromY + (toY - fromY) * eased)
      if (y !== lastY) {
        setWindowPosition(x, y)
        lastY = y
      }
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}

interface DragSample {
  t: number
  x: number
  y: number
}

interface ThrowVelocity {
  vx: number
  vy: number
  speed: number
}

function computeThrowVelocity(samples: DragSample[]): ThrowVelocity {
  if (samples.length < 2) return { vx: 0, vy: 0, speed: 0 }
  const last = samples[samples.length - 1]
  let earliest = samples[samples.length - 2]
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > THROW_VELOCITY_WINDOW_MS) break
    earliest = samples[i]
  }
  const dtSec = (last.t - earliest.t) / 1000
  if (dtSec < 0.012) return { vx: 0, vy: 0, speed: 0 }
  let vx = (last.x - earliest.x) / dtSec
  let vy = (last.y - earliest.y) / dtSec
  const speed = Math.hypot(vx, vy)
  if (speed > THROW_MAX_LAUNCH_PX_PER_SEC) {
    const k = THROW_MAX_LAUNCH_PX_PER_SEC / speed
    vx *= k
    vy *= k
    return { vx, vy, speed: THROW_MAX_LAUNCH_PX_PER_SEC }
  }
  return { vx, vy, speed }
}

function animateThrow(
  fromX: number,
  fromY: number,
  vx0: number,
  vy0: number,
  bounds: ScreenBounds,
  onTick?: (vxNow: number, vyNow: number) => void,
): Promise<{ x: number; y: number }> {
  return new Promise((resolve) => {
    let x = fromX
    let y = fromY
    let vx = vx0
    let vy = vy0
    let lastT = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.045, (now - lastT) / 1000)
      lastT = now
      vy += THROW_GRAVITY_PX_PER_SEC2 * dt
      x += vx * dt
      y += vy * dt
      if (x < bounds.minX) {
        x = bounds.minX
        vx = -vx * THROW_WALL_RESTITUTION
      } else if (x > bounds.maxX) {
        x = bounds.maxX
        vx = -vx * THROW_WALL_RESTITUTION
      }
      if (y >= bounds.groundY) {
        y = bounds.groundY
        if (Math.abs(vy) < THROW_REST_VY_PX_PER_SEC && Math.abs(vx) < THROW_REST_VX_PX_PER_SEC) {
          void setWindowPosition(Math.round(x), Math.round(y))
          onTick?.(0, 0)
          resolve({ x: Math.round(x), y: Math.round(y) })
          return
        }
        vy = -vy * THROW_GROUND_RESTITUTION
        vx *= THROW_GROUND_FRICTION
      }
      void setWindowPosition(Math.round(x), Math.round(y))
      onTick?.(vx, vy)
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

interface SavedPosition {
  x: number
  y: number
}

interface ScreenBounds {
  minX: number
  maxX: number
  groundY: number
}

type CursorTuple = [number, number] | null
type Direction = 'left' | 'right'
type WanderPhase = 'idle' | 'walk'

const PET_SIZE_DIMS: Record<PetSize, { sprite: number }> = {
  small: { sprite: 80 },
  medium: { sprite: 120 },
  large: { sprite: 160 },
}

const isPetSize = (s: unknown): s is PetSize =>
  s === 'small' || s === 'medium' || s === 'large'

// Lottie frame ranges where the pet is visually standing still (window must not step here).
// Other Lottie pets loop a continuous walking gait, so they need no entry.
const LOTTIE_REST_RANGES: Partial<Record<LottiePetId, [number, number]>> = {
  raccoon: [84, 180],
}

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min

interface WalkArea {
  x: number
  y: number
  width: number
  height: number
}

async function loadScreenBounds(spriteSize: number): Promise<ScreenBounds | null> {
  let monitor = await currentMonitor()
  if (!monitor) monitor = await primaryMonitor()
  if (!monitor) return null
  const winSize = await appWindow.outerSize()
  sizeCache.w = winSize.width
  sizeCache.h = winSize.height

  // Walk area: full monitor on macOS (very bottom), work area on Windows (above taskbar).
  let walk: WalkArea
  try {
    walk = await invoke<WalkArea>('get_walk_area')
  } catch {
    walk = {
      x: monitor.position.x,
      y: monitor.position.y,
      width: monitor.size.width,
      height: monitor.size.height,
    }
  }

  // Sprite is centered in a wider transparent window. Extend X bounds by the
  // empty padding so the visible sprite can reach the screen edge.
  const spritePhysical = Math.round(spriteSize * monitor.scaleFactor)
  const sideMargin = Math.max(0, Math.floor((winSize.width - spritePhysical) / 2))

  return {
    minX: walk.x - sideMargin,
    maxX: walk.x + walk.width - winSize.width + sideMargin,
    groundY: walk.y + walk.height - winSize.height,
  }
}

function liveSummary(briefing: BriefingPayload): string {
  const { tasks, events, emails } = briefing
  if (tasks.length === 0 && events.length === 0 && emails.length === 0)
    return '모든 알림을 확인했어요 😊'
  const parts: string[] = []
  if (events.length > 0) parts.push(`일정 ${events.length}개`)
  if (emails.length > 0) parts.push(`메일 ${emails.length}개`)
  if (tasks.length > 0) parts.push(`태스크 ${tasks.length}개`)
  return parts.join(', ') + ' 남아있어요'
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

type AwayReason = 'lunch' | 'meeting' | null

function classifyAwayReason(
  start: Date,
  end: Date,
  events: CalendarEvent[],
): AwayReason {
  const startMs = start.getTime()
  const endMs = end.getTime()
  for (const ev of events) {
    const evStart = new Date(ev.startTime).getTime()
    const evEnd = new Date(ev.endTime).getTime()
    if (Number.isFinite(evStart) && Number.isFinite(evEnd) && startMs < evEnd && endMs > evStart) {
      return 'meeting'
    }
  }
  const minOfDay = start.getHours() * 60 + start.getMinutes()
  if (minOfDay >= 11 * 60 + 30 && minOfDay <= 13 * 60 + 30) return 'lunch'
  return null
}

function greetingForAway(reason: AwayReason, awayMs: number): string {
  if (reason === 'lunch') return '맛있는 점심 드셨어요? 🍱'
  if (reason === 'meeting') return '회의 잘 마치셨어요? 📋'
  const min = Math.round(awayMs / 60_000)
  if (min >= 120) return `오랜만이에요! ${Math.round(min / 60)}시간 만이네요 ✨`
  if (min >= 60) return `오랜만이에요! ${min}분 만이네요 ✨`
  return '어디 갔다 왔어요? 👋'
}

export default function App() {
  // Pet visual / wander state (existing)
  const [direction, setDirection] = useState<Direction>('left')
  const [wanderAction, setWanderAction] = useState<WanderPhase>('idle')
  const [oneShotAction, setOneShotAction] = useState<PetAction | null>(null)
  const [petKind, setPetKind] = useState<PetId>('pico')
  const [petSize, setPetSize] = useState<PetSize>('medium')
  const [wanderPaused, setWanderPaused] = useState(false)

  // Orchestrator state
  const [petState, setPetState] = useState<PetState>('idle')
  const [briefing, setBriefing] = useState<BriefingPayload>(EMPTY_BRIEFING)
  const [activePet, setActivePet] = useState<GachaResult | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [bubbleMessage, setBubbleMessage] = useState<string | null>(null)
  const [stickyBubble, setStickyBubble] = useState<string | null>(null)
  const [focusTimer, setFocusTimer] = useState<FocusTimerState>(IDLE_FOCUS_TIMER)
  const [isSleepy, setIsSleepy] = useState(false)
  const [isAway, setIsAway] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const [questionDraft, setQuestionDraft] = useState('')
  const [askLoading, setAskLoading] = useState(false)

  const wanderActionRef = useRef<WanderPhase>('idle')
  const wanderPausedRef = useRef(false)
  const interactingRef = useRef(false)
  const panelOpenRef = useRef(false)
  const petStateRef = useRef<PetState>('idle')
  const petKindRef = useRef<PetId>('pico')
  const petSizeRef = useRef<PetSize>('medium')
  const currentLottieFrameRef = useRef(0)
  const oneShotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const boundsRef = useRef<ScreenBounds | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastUserActionAtRef = useRef(0)
  const sleepyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loginHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The alert bubble (mail / calendar / task) is shown as a sticky bubble so
  // it only goes away on user dismissal. These refs let us tell our own sticky
  // alert apart from other sticky bubbles (e.g. LLM key prompt) so we don't
  // clobber them, and let us suppress immediate re-show after user dismisses.
  const alertStickyRef = useRef<string | null>(null)
  const dismissedAlertRef = useRef<string | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const morningGreetingShownRef = useRef(false)
  const updateInFlightRef = useRef(false)

  const mouseDownAtRef = useRef<{ x: number; y: number } | null>(null)
  const dragStartedRef = useRef(false)
  const dragSamplesRef = useRef<DragSample[]>([])
  // Cursor-position samples taken at ~60Hz during a drag. These reflect the
  // user's actual hand movement, independent of how often the OS reports
  // window-onMoved during a native drag.
  const cursorSamplesRef = useRef<DragSample[]>([])
  const cursorPollHandleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isThrowingRef = useRef(false)
  const lastPanelClosedAtRef = useRef(0)

  const isAwayRef = useRef(false)
  const isSleepyRef = useRef(false)
  const awayStartedAtRef = useRef<number | null>(null)
  const briefingRef = useRef<BriefingPayload>(EMPTY_BRIEFING)

  const petHitRef = useRef<HTMLDivElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const askInputRef = useRef<HTMLDivElement | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const askingRef = useRef(false)
  const stickyActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    wanderActionRef.current = wanderAction
  }, [wanderAction])
  useEffect(() => {
    wanderPausedRef.current = wanderPaused
    void invoke('set_wander_paused_state', { paused: wanderPaused }).catch(() => {})
  }, [wanderPaused])
  useEffect(() => {
    panelOpenRef.current = panelOpen
  }, [panelOpen])
  useEffect(() => {
    petStateRef.current = petState
    void invoke('set_dismissed_state', { dismissed: petState === 'dismissed' }).catch(() => {})
  }, [petState])
  useEffect(() => {
    petKindRef.current = petKind
    currentLottieFrameRef.current = 0
  }, [petKind])
  useEffect(() => {
    void invoke('set_pet_size_state', { size: petSize }).catch(() => {})
  }, [petSize])
  // Sprite-to-window padding shrinks with larger sprites, so X bounds depend on petSize.
  useEffect(() => {
    petSizeRef.current = petSize
    let cancelled = false
    ;(async () => {
      const newBounds = await loadScreenBounds(PET_SIZE_DIMS[petSize].sprite)
      if (cancelled || !newBounds) return
      boundsRef.current = newBounds
      // If shrinking margins put the pet past the new bound, snap it back.
      const pos = await appWindow.outerPosition()
      const x = Math.max(newBounds.minX, Math.min(newBounds.maxX, pos.x))
      if (x !== pos.x || pos.y !== newBounds.groundY) {
        await setWindowPosition(x, newBounds.groundY)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [petSize])
  useEffect(() => {
    isAwayRef.current = isAway
  }, [isAway])
  useEffect(() => {
    isSleepyRef.current = isSleepy
  }, [isSleepy])
  useEffect(() => {
    interactingRef.current = !!bubbleMessage || !!stickyBubble || asking
  }, [bubbleMessage, stickyBubble, asking])
  useEffect(() => {
    askingRef.current = asking
  }, [asking])
  useEffect(() => {
    if (petState === 'dismissed' || !signedIn) {
      setAsking(false)
      setQuestionDraft('')
    }
  }, [petState, signedIn])
  useEffect(() => {
    briefingRef.current = briefing
  }, [briefing])

  // ── Global ESC: dismiss bubble → ask input → panel, in that order ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (stickyBubble) {
        stickyActionRef.current = null
        if (alertStickyRef.current && alertStickyRef.current === stickyBubble) {
          dismissedAlertRef.current = alertStickyRef.current
          alertStickyRef.current = null
        }
        setStickyBubble(null)
        return
      }
      if (bubbleMessage) {
        if (greetingTimerRef.current) {
          clearTimeout(greetingTimerRef.current)
          greetingTimerRef.current = null
        }
        setBubbleMessage(null)
        return
      }
      if (asking) {
        cancelAsk()
        return
      }
      if (panelOpen) {
        void closePanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stickyBubble, bubbleMessage, asking, panelOpen])

  // ── Auto-dismiss on focus loss to an external app ──
  // Pet window focus is gained only on direct interaction (cursor pass-through
  // makes it click-through otherwise). When focus is lost AND the panel webview
  // didn't pick it up, assume the user moved to another app and dismiss the
  // bubble / question input / panel together.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let pending: ReturnType<typeof setTimeout> | null = null
    ;(async () => {
      unlisten = await appWindow.onFocusChanged(async ({ payload: focused }) => {
        if (focused) {
          if (pending) {
            clearTimeout(pending)
            pending = null
          }
          return
        }
        if (pending) clearTimeout(pending)
        pending = setTimeout(() => {
          pending = null
          void (async () => {
            const panelWin = await WebviewWindow.getByLabel('panel')
            const panelFocused = panelWin
              ? await panelWin.isFocused().catch(() => false)
              : false
            if (panelFocused) return
            dismissTransientUI()
          })()
        }, 120)
      })
    })()
    return () => {
      if (pending) clearTimeout(pending)
      unlisten?.()
    }
  }, [])

  // ── Setup: bounds, store, persisted state, onMoved, scheduler ─
  useEffect(() => {
    let unlistenMoved: (() => void) | undefined
    let cancelled = false

    ;(async () => {
      // Load saved pet size first so initial bounds use the correct sprite-to-window padding.
      const savedSize = await getValue<string>(KEYS.PET_SIZE)
      const initialPetSize: PetSize = isPetSize(savedSize) ? savedSize : 'medium'
      if (isPetSize(savedSize)) setPetSize(savedSize)

      const bounds = await loadScreenBounds(PET_SIZE_DIMS[initialPetSize].sprite)
      if (cancelled) return
      boundsRef.current = bounds
      log('bounds loaded', bounds)

      const savedKind = await getValue<string>(KEYS.PET_KIND)
      if (isPetId(savedKind)) setPetKind(savedKind)

      const savedPaused = await getValue<boolean>(KEYS.WANDER_PAUSED)
      if (typeof savedPaused === 'boolean') setWanderPaused(savedPaused)

      const savedActive = await getValue<GachaResult>(KEYS.ACTIVE_PET)
      if (savedActive) setActivePet(savedActive)

      const savedBriefing = await getValue<BriefingPayload>(KEYS.PET_BRIEFING)
      if (savedBriefing) setBriefing(savedBriefing)
      const savedDismissed = await getValue<boolean>(KEYS.PET_DISMISSED)
      const savedState = await getValue<PetState>(KEYS.PET_STATE)
      if (savedDismissed) setPetState('dismissed')
      else if (savedState) setPetState(savedState)

      const savedPos = await getValue<SavedPosition>(KEYS.WINDOW_POSITION)
      if (savedPos && Number.isFinite(savedPos.x) && Number.isFinite(savedPos.y) && bounds) {
        const x = Math.max(bounds.minX, Math.min(bounds.maxX, savedPos.x))
        await setWindowPosition(x, bounds.groundY)
      } else if (bounds) {
        const pos = await appWindow.outerPosition()
        posCache.x = pos.x
        posCache.y = pos.y
        const x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x))
        await setWindowPosition(x, bounds.groundY)
      }

      // Auth + tray sync
      const initialSignedIn = await checkSignedIn()
      setSignedIn(initialSignedIn)
      const email = await getSignedInEmail()
      void invoke('set_auth_state', { signedIn: initialSignedIn, email })

      // Briefing scheduler
      startBriefingScheduler()

      const off = await appWindow.onMoved(async ({ payload }) => {
        // Always sync cache, even for programmatic moves (cheap and keeps cache true).
        posCache.x = payload.x
        posCache.y = payload.y

        if (isRecentProgrammatic()) return
        if (isThrowingRef.current) return
        lastUserActionAtRef.current = Date.now()

        // Collect a short trailing buffer of drag samples so we can read the
        // release velocity when the debounce fires. Old samples are dropped to
        // keep the window tight (last ~250ms).
        const tNow = Date.now()
        dragSamplesRef.current.push({ t: tNow, x: payload.x, y: payload.y })
        if (dragSamplesRef.current.length > 24) {
          dragSamplesRef.current.splice(0, dragSamplesRef.current.length - 24)
        }
        while (
          dragSamplesRef.current.length > 2 &&
          tNow - dragSamplesRef.current[0].t > 260
        ) {
          dragSamplesRef.current.shift()
        }

        // Notify panel for anchor sync
        void emit('orbit:pet-moved', { x: payload.x, y: payload.y })

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
          // Drag may have crossed monitors — recompute bounds against the
          // monitor the pet is on now so it adopts that screen as its new home.
          const fresh = await loadScreenBounds(PET_SIZE_DIMS[petSizeRef.current].sprite)
          const b = fresh ?? boundsRef.current
          if (!b) return
          if (fresh) boundsRef.current = fresh

          const currentPos = await appWindow.outerPosition()
          // Prefer the cursor samples (real hand motion at 60Hz); fall back to
          // window-onMoved samples if cursor polling produced too few entries
          // (e.g. drag was shorter than one poll tick). The poll keeps running
          // during the post-onMoved debounce wait, so we drop any samples that
          // landed AFTER the user actually released (≈ the last onMoved time).
          stopDragCursorPoll()
          const cursorSamplesAll = cursorSamplesRef.current
          cursorSamplesRef.current = []
          const windowSamples = dragSamplesRef.current
          dragSamplesRef.current = []
          const releaseAt = Date.now() - DRAG_END_DEBOUNCE_MS + 24
          const cursorSamples = cursorSamplesAll.filter((s) => s.t <= releaseAt)
          const samples =
            cursorSamples.length >= 2 ? cursorSamples : windowSamples
          const launch = computeThrowVelocity(samples)

          if (launch.speed >= THROW_MIN_LAUNCH_PX_PER_SEC) {
            // Throw: physics arc with wall + ground bounces, surprised face
            // while airborne, dizzy tumble after landing.
            isThrowingRef.current = true
            lastUserActionAtRef.current = Date.now()
            setDirection(launch.vx >= 0 ? 'right' : 'left')
            setOneShotAction('surprise')
            if (oneShotTimerRef.current) {
              clearTimeout(oneShotTimerRef.current)
              oneShotTimerRef.current = null
            }
            const finalPos = await animateThrow(
              currentPos.x,
              currentPos.y,
              launch.vx,
              launch.vy,
              b,
              (vxNow) => {
                // Face the direction of horizontal travel, including after
                // wall bounces (where vx flips sign).
                if (Math.abs(vxNow) > 60) {
                  setDirection(vxNow >= 0 ? 'right' : 'left')
                }
                lastUserActionAtRef.current = Date.now()
              },
            )
            isThrowingRef.current = false
            lastUserActionAtRef.current = Date.now()
            playAction('tumble', THROW_TUMBLE_MS)

            await setValue(KEYS.WINDOW_POSITION, { x: finalPos.x, y: finalPos.y })
            void emit('orbit:pet-moved', { x: finalPos.x, y: finalPos.y })
            return
          }

          const targetX = Math.max(b.minX, Math.min(b.maxX, currentPos.x))

          if (currentPos.y < b.groundY) {
            await animateFall(targetX, currentPos.y, b.groundY, FALL_ANIMATION_MS)
          } else if (currentPos.y !== b.groundY || targetX !== currentPos.x) {
            await setWindowPosition(targetX, b.groundY)
          }

          await setValue(KEYS.WINDOW_POSITION, { x: targetX, y: b.groundY })
          void emit('orbit:pet-moved', { x: targetX, y: b.groundY })
        }, DRAG_END_DEBOUNCE_MS)
      })
      // If cleanup already ran (StrictMode double-mount), unregister immediately
      // — otherwise the leaked listener fires twice for every drag.
      if (cancelled) off()
      else unlistenMoved = off
    })()

    return () => {
      cancelled = true
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (oneShotTimerRef.current) clearTimeout(oneShotTimerRef.current)
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      if (loginHintTimerRef.current) clearTimeout(loginHintTimerRef.current)
      if (cursorPollHandleRef.current !== null) {
        clearInterval(cursorPollHandleRef.current)
        cursorPollHandleRef.current = null
      }
      unlistenMoved?.()
    }
  }, [])

  // ── Listen: tray pet kind, wander toggle, panel/gacha/auth/fetch ──
  useEffect(() => {
    const offs: Array<() => void> = []
    let cancelled = false
    // Push the off-fn into offs as soon as listen() resolves. If cleanup already
    // ran (cancelled=true), unregister immediately — otherwise StrictMode's
    // double-mount leaks the first round of listeners (cleanup runs before the
    // async IIFE has populated offs).
    const register = (off: () => void) => {
      if (cancelled) off()
      else offs.push(off)
    }
    ;(async () => {
      register(
        await listen<string>('orbit:pet-kind', async (e) => {
          if (cancelled) return
          const kind = e.payload
          if (!isPetId(kind)) return
          setPetKind(kind)
          await setValue(KEYS.PET_KIND, kind)
        }),
      )
      register(
        await listen<string>('orbit:pet-size', async (e) => {
          if (cancelled) return
          const size = e.payload
          if (!isPetSize(size)) return
          setPetSize(size)
          await setValue(KEYS.PET_SIZE, size)
        }),
      )
      register(
        await listen('orbit:toggle-wander', () => {
          if (cancelled) return
          toggleWanderPaused()
        }),
      )
      register(
        await listen<BriefingPayload>('orbit:briefing-alert', (e) => {
          setBriefing(e.payload)
          setPetState('alert')
        }),
      )
      register(
        await listen<GachaResult>('orbit:gacha-result', async (e) => {
          const pet = e.payload
          await setValue(KEYS.ACTIVE_PET, pet)
          setActivePet(pet)
          if (isPetId(pet.petId)) {
            setPetKind(pet.petId)
            await setValue(KEYS.PET_KIND, pet.petId)
          }
          showBubble(`안녕! 나는 ${pet.name}이야 🎉`, 4000)
          playAction('dance', 4000)
        }),
      )
      register(
        await listen('orbit:open-panel', async () => {
          await openPanel()
        }),
      )
      register(
        await listen<string>('orbit:color-result', (e) => {
          showBubble(`📋 색상코드 ${e.payload.toUpperCase()} 가 복사되었습니다`, 2500)
          playAction('smile', 2500)
        }),
      )
      register(
        await listen<string>('orbit:screenshot-result', async (e) => {
          try {
            await appWindow.show()
            const { Image } = await import('@tauri-apps/api/image')
            const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager')
            const base64 = e.payload.replace(/^data:image\/png;base64,/, '')
            const binary = atob(base64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            const image = await Image.fromBytes(bytes)
            await writeImage(image)
            showBubble('📷 화면 캡처가 클립보드에 복사되었습니다', 2500)
            playAction('jump', 2500)
          } catch (err) {
            console.warn('[orbit] screenshot copy failed', err)
            showBubble('😢 캡처 복사에 실패했어요', 2500)
            playAction('cry', 2500)
          }
        }),
      )
      register(
        await listen('orbit:open-gacha', async () => {
          if (!signedIn) return
          void invoke('open_gacha').catch(() => {})
        }),
      )
      register(
        await listen('orbit:fetch-now', async () => {
          void fetchNow().catch(() => {})
        }),
      )
      register(
        await listen('orbit:open-profile', async () => {
          void invoke('open_profile').catch(() => {})
        }),
      )
      register(
        await listen('orbit:clear-memory', async () => {
          try {
            await setValue<PetMemoryEntry[]>(KEYS.PET_MEMORY, [])
            showBubble('🧠 메모리를 비웠어요', 2200)
          } catch (err) {
            console.warn('[orbit] clear memory failed', err)
          }
        }),
      )
      register(
        await listen('orbit:auth-toggle', async () => {
          try {
            if (await checkSignedIn()) {
              await signOut()
              setSignedIn(false)
              if (loginHintTimerRef.current) clearTimeout(loginHintTimerRef.current)
              showBubble('잘 있어요! 또 봐요 👋', 2500)
              playAction('wave', 2500)
            } else {
              const { email } = await signIn()
              setSignedIn(true)
              const hour = new Date().getHours()
              const greet = hour < 12 ? '좋은 아침이에요' : '안녕하세요'
              showBubble(`${greet}${email ? `, ${email}` : ''}! 😊`, 3500)
              playAction('love', 3500)
              scheduleLoginHint(3700)
              void fetchNow().catch(() => {})
            }
          } catch (err) {
            console.warn('[orbit] auth toggle failed', err)
          }
        }),
      )
      register(
        await listen<{ type: string; payload?: unknown }>('orbit:panel-action', (e) => {
          handlePanelAction(e.payload.type, e.payload.payload)
        }),
      )
      register(
        await listen('orbit:toggle-dismiss', () => {
          if (cancelled) return
          if (petStateRef.current === 'dismissed') handlePanelAction('show-pet')
          else handlePanelAction('dismiss-pet')
        }),
      )
      register(
        await listen('orbit:panel-closed', () => {
          if (cancelled) return
          lastPanelClosedAtRef.current = Date.now()
          setPanelOpen(false)
          // If pet window doesn't pick up focus shortly after panel closed, the
          // user clicked an external app — also clear any visible bubbles /
          // asking. Delay so focus has time to settle on pet if that's the
          // click target.
          setTimeout(() => {
            void (async () => {
              if (cancelled) return
              const petFocused = await appWindow.isFocused().catch(() => false)
              if (!petFocused) dismissTransientUI()
            })()
          }, 120)
        }),
      )
      register(
        await listen<{ id: string; label: string; message: string }>(
          'orbit:reminder-fire',
          (e) => {
            if (cancelled) return
            stickyActionRef.current = null
            setStickyBubble(e.payload.message)
            playAction('peek', 2500)
          },
        ),
      )
      register(
        await listen('orbit:check-update', () => {
          if (cancelled) return
          void runUpdateFlow()
        }),
      )
    })()
    return () => {
      cancelled = true
      offs.forEach((off) => off())
    }
  }, [signedIn])

  // ── Cross-window storage subscription (briefing/dismissed) ──
  useEffect(() => {
    const offs: Array<() => void> = []
    let cancelled = false
    ;(async () => {
      const off1 = await subscribeStorage<BriefingPayload>(KEYS.PET_BRIEFING, (val) => {
        if (cancelled) return
        if (val) {
          setBriefing(val)
          setPetState('alert')
        } else {
          setBriefing(EMPTY_BRIEFING)
        }
      })
      const off2 = await subscribeStorage<boolean>(KEYS.PET_DISMISSED, (val) => {
        if (cancelled) return
        if (val) setPetState('dismissed')
      })
      const off3 = await subscribeStorage<PetState>(KEYS.PET_STATE, (val) => {
        if (cancelled) return
        if (val) setPetState(val)
      })
      offs.push(off1, off2, off3)
    })()
    return () => {
      cancelled = true
      offs.forEach((off) => off())
    }
  }, [])

  // ── Click pass-through: ignore cursor events outside pet/bubble bounds ──
  // The pet window is larger than the visible sprite, and a transparent Tauri
  // window still captures mouse events at the OS level. Poll the cursor and
  // toggle setIgnoreCursorEvents so clicks pass through dead space to apps
  // behind the window. Hit test is alpha-aware: only painted SVG shapes
  // inside the pet count as "in pet"; transparent space within the sprite
  // bounding box (returned as the <svg> root) falls through to other apps.
  useEffect(() => {
    let cancelled = false
    let inFlight = false
    let currentlyIgnoring: boolean | null = null
    // devicePixelRatio can change when the window moves to a monitor with a
    // different scale factor, so read it per-tick instead of caching once.
    const PAINTED_SVG_TAGS = new Set([
      'path',
      'circle',
      'rect',
      'ellipse',
      'line',
      'polygon',
      'polyline',
      'text',
      'tspan',
      'image',
    ])

    const setIgnore = async (ignore: boolean) => {
      if (currentlyIgnoring === ignore) return
      try {
        await appWindow.setIgnoreCursorEvents(ignore)
        currentlyIgnoring = ignore
      } catch (e) {
        console.error('[orbit] setIgnoreCursorEvents failed', e)
      }
    }

    const tick = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        const cursor = await invoke<CursorTuple>('get_cursor_position')
        if (!cursor) return
        const dpr = window.devicePixelRatio || 1
        const winRelX = (cursor[0] - posCache.x) / dpr
        const winRelY = (cursor[1] - posCache.y) / dpr

        const el = document.elementFromPoint(winRelX, winRelY)
        const inPet =
          !!el &&
          !!petHitRef.current?.contains(el) &&
          PAINTED_SVG_TAGS.has(el.tagName.toLowerCase())

        let inBubble = false
        if (!inPet && bubbleRef.current) {
          const r = bubbleRef.current.getBoundingClientRect()
          inBubble =
            winRelX >= r.left && winRelX < r.right && winRelY >= r.top && winRelY < r.bottom
        }

        let inAsk = false
        if (!inPet && !inBubble && askInputRef.current) {
          const r = askInputRef.current.getBoundingClientRect()
          inAsk =
            winRelX >= r.left && winRelX < r.right && winRelY >= r.top && winRelY < r.bottom
        }

        await setIgnore(!(inPet || inBubble || inAsk))
      } catch {
        /* noop */
      } finally {
        inFlight = false
      }
    }

    void setIgnore(true)
    const id = setInterval(tick, 40)
    return () => {
      cancelled = true
      clearInterval(id)
      void appWindow.setIgnoreCursorEvents(false).catch(() => {})
    }
  }, [])

  // ── Mouse direction tracking ──
  useEffect(() => {
    let cancelled = false
    let inFlight = false
    let currentDirection: Direction = 'left'
    const tick = async () => {
      if (cancelled || inFlight) return
      if (oneShotAction) return
      if (wanderPausedRef.current) return
      if (isSleepyRef.current || isAwayRef.current) return
      if (wanderActionRef.current !== 'idle') return
      inFlight = true
      try {
        const cursor = await invoke<CursorTuple>('get_cursor_position')
        if (!cursor) return
        const centerX = posCache.x + sizeCache.w / 2
        const dx = cursor[0] - centerX
        if (Math.abs(dx) < DIRECTION_DEADZONE_PX) return
        const next: Direction = dx > 0 ? 'right' : 'left'
        if (next !== currentDirection) {
          currentDirection = next
          setDirection(next)
        }
      } catch {
        /* noop */
      } finally {
        inFlight = false
      }
    }
    const id = setInterval(tick, CURSOR_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [oneShotAction])

  // ── Auto wandering ──
  useEffect(() => {
    let cancelled = false
    let inFlight = false
    let walkDir: 1 | -1 = -1
    let phase: WanderPhase = 'idle'
    let phaseEndAt = Date.now() + randomBetween(2000, 4000)
    const STEP_PX = Math.max(1, Math.round((WANDER_SPEED_PX_PER_SEC * WANDER_TICK_MS) / 1000))

    const enterIdle = (now: number) => {
      phase = 'idle'
      phaseEndAt = now + randomBetween(2500, 5500)
      setWanderAction('idle')
    }
    const enterWalk = (now: number) => {
      phase = 'walk'
      walkDir = Math.random() < 0.5 ? -1 : 1
      phaseEndAt = now + randomBetween(3500, 8000)
      setWanderAction('walk')
      setDirection(walkDir === 1 ? 'right' : 'left')
    }

    const tick = async () => {
      if (cancelled || inFlight) return
      const bounds = boundsRef.current
      if (!bounds) return
      if (
        wanderPausedRef.current ||
        panelOpenRef.current ||
        petState === 'dismissed' ||
        !signedIn ||
        isAwayRef.current ||
        isSleepyRef.current ||
        interactingRef.current
      ) {
        if (phase === 'walk') enterIdle(Date.now())
        return
      }
      const now = Date.now()
      const sinceUser = now - lastUserActionAtRef.current
      if (sinceUser < USER_ACTION_COOLDOWN_MS) {
        if (phase === 'walk') enterIdle(now)
        return
      }
      if (now >= phaseEndAt) {
        if (phase === 'idle') enterWalk(now)
        else enterIdle(now)
      }
      if (phase !== 'walk') return
      // If the active Lottie pet is currently in a standing-pose frame range,
      // hold position so the window does not slide while the legs are still.
      const kind = petKindRef.current
      const restRange = isLottiePetId(kind) ? LOTTIE_REST_RANGES[kind] : undefined
      if (restRange) {
        const f = currentLottieFrameRef.current
        if (f >= restRange[0] && f < restRange[1]) return
      }
      const curX = posCache.x
      const curY = posCache.y
      let nextX = curX + walkDir * STEP_PX
      if (nextX <= bounds.minX) {
        nextX = bounds.minX
        walkDir = 1
        setDirection('right')
      } else if (nextX >= bounds.maxX) {
        nextX = bounds.maxX
        walkDir = -1
        setDirection('left')
      }
      if (nextX === curX && curY === bounds.groundY) return
      inFlight = true
      try {
        await setWindowPosition(nextX, bounds.groundY)
      } catch (e) {
        log('wander tick error', e)
      } finally {
        inFlight = false
      }
    }
    const id = setInterval(tick, WANDER_TICK_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [petState, signedIn])

  // ── Sleepy state ──
  // Poll system idle so real user activity (mouse/keyboard) wakes the pet.
  // A plain setTimeout fires after 5 minutes of wall-clock time regardless
  // of whether the user is actively working, so the pet would nap on top of
  // an actively-used screen and never wake on mouse-move.
  useEffect(() => {
    if (sleepyTimerRef.current) clearInterval(sleepyTimerRef.current)
    if (petState !== 'idle' || panelOpen || bubbleMessage) {
      if (isSleepyRef.current) setIsSleepy(false)
      return
    }
    let cancelled = false
    const check = async () => {
      if (cancelled) return
      let idle = 0
      try {
        idle = await invoke<number>('get_idle_seconds')
      } catch {
        return
      }
      const shouldSleep = idle * 1000 >= SLEEPY_TIMEOUT_MS
      if (shouldSleep !== isSleepyRef.current) setIsSleepy(shouldSleep)
    }
    void check()
    sleepyTimerRef.current = setInterval(check, AWAY_POLL_MS)
    return () => {
      cancelled = true
      if (sleepyTimerRef.current) clearInterval(sleepyTimerRef.current)
    }
  }, [petState, panelOpen, bubbleMessage])

  // ── Away detection: poll system idle, classify lunch/meeting, greet on return ──
  useEffect(() => {
    if (petState === 'dismissed' || !signedIn) {
      if (isAwayRef.current) setIsAway(false)
      awayStartedAtRef.current = null
      return
    }
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      let idle = 0
      try {
        idle = await invoke<number>('get_idle_seconds')
      } catch {
        return
      }
      if (!isAwayRef.current && idle >= AWAY_THRESHOLD_SEC) {
        awayStartedAtRef.current = Date.now() - idle * 1000
        setIsAway(true)
      } else if (isAwayRef.current && idle < AWAY_THRESHOLD_SEC) {
        const startedAt = awayStartedAtRef.current
        awayStartedAtRef.current = null
        setIsAway(false)
        if (startedAt) {
          const awayMs = Date.now() - startedAt
          const reason = classifyAwayReason(
            new Date(startedAt),
            new Date(),
            briefingRef.current.events,
          )
          showBubble(greetingForAway(reason, awayMs), AWAY_GREET_DURATION_MS)
          playAction('wave', AWAY_GREET_DURATION_MS)
        }
      }
    }
    void tick()
    const id = setInterval(tick, AWAY_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [petState, signedIn])

  // ── Morning greeting ──
  useEffect(() => {
    if (petState === 'dismissed' || morningGreetingShownRef.current) return
    morningGreetingShownRef.current = true
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 11 && signedIn) {
      const t = setTimeout(() => {
        showBubble('좋은 아침이에요! ☀️', 2500)
        playAction('stretch', 2500)
      }, 800)
      return () => clearTimeout(t)
    }
  }, [petState, signedIn])

  // ── Auto-cleanup expired events (30s) ──
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setBriefing((prev) => {
        const filtered = prev.events.filter((evt) => new Date(evt.endTime).getTime() > now)
        if (filtered.length === prev.events.length) return prev
        const updated = { ...prev, events: filtered }
        void setValue(KEYS.PET_BRIEFING, updated)
        return updated
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  // ── All-cleared → idle + announcement ──
  useEffect(() => {
    if (petState !== 'alert') return
    const allRead =
      briefing.tasks.length === 0 &&
      briefing.events.length === 0 &&
      briefing.emails.length === 0
    if (!allRead) return
    setPetState('idle')
    void setValue(KEYS.PET_STATE, 'idle')
    showBubble('모든 알림을 확인했어요 😊', 3000)
    playAction('dance', 3000)
  }, [briefing, petState])

  // ── Alert bubble: sticky, click-only dismissal ──
  // The mail / calendar / task alert stays visible until the user actively
  // clicks it (or another sticky / focus loss / ESC takes it away). Auto-hide
  // timer is intentionally absent so the user can't miss a notification.
  useEffect(() => {
    if (petState === 'alert' && !panelOpen) {
      // urgent 알림은 briefing.summary에 발신자·제목·일정 시간이 담겨 있어 그대로 보여준다.
      // 수동 새로고침으로 인한 비-urgent 상태는 집계 요약을 사용한다.
      const detailed = briefing.urgent && briefing.summary
      const summary = detailed ? briefing.summary : liveSummary(briefing)
      if (alertStickyRef.current === summary) return
      if (dismissedAlertRef.current === summary) return
      alertStickyRef.current = summary
      stickyActionRef.current = null
      setStickyBubble(summary)
      playAction('alert', detailed ? 6500 : 5000)
      return
    }
    // Out of alert state OR panel opened → drop our sticky alert if it's still
    // showing. Other sticky bubbles (LLM key prompt etc.) are left untouched.
    if (alertStickyRef.current) {
      const ours = alertStickyRef.current
      alertStickyRef.current = null
      setStickyBubble((prev) => (prev === ours ? null : prev))
    }
  }, [petState, panelOpen, briefing])

  // Forget the user-dismissed summary once we leave alert state, so the next
  // round of alerts can pop up cleanly without being suppressed by stale text.
  useEffect(() => {
    if (petState !== 'alert') dismissedAlertRef.current = null
  }, [petState])

  // ── Focus phase mirror to storage (for team room window) ──
  useEffect(() => {
    void setValue(KEYS.FOCUS_TIMER_PHASE, focusTimer.phase)
  }, [focusTimer.phase])

  // ── Focus timer tick ──
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    if (focusTimer.phase !== 'running') return
    timerIntervalRef.current = setInterval(() => {
      setFocusTimer((prev) => {
        if (prev.remaining <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
          void emit('orbit:focus-timer', { phase: 'done', total: prev.total, remaining: 0 })
          return { ...prev, phase: 'done', remaining: 0 }
        }
        const next = { ...prev, remaining: prev.remaining - 1 }
        void emit('orbit:focus-timer', next)
        return next
      })
    }, 1000)
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [focusTimer.phase])

  // ── Helper actions ──
  function showBubble(message: string, durationMs: number) {
    if (greetingTimerRef.current) clearTimeout(greetingTimerRef.current)
    setBubbleMessage(message)
    greetingTimerRef.current = setTimeout(() => setBubbleMessage(null), durationMs)
  }

  function playAction(action: PetAction, durationMs: number) {
    setOneShotAction(action)
    if (oneShotTimerRef.current) clearTimeout(oneShotTimerRef.current)
    oneShotTimerRef.current = setTimeout(() => setOneShotAction(null), durationMs)
  }

  function dismissTransientUI() {
    if (greetingTimerRef.current) {
      clearTimeout(greetingTimerRef.current)
      greetingTimerRef.current = null
    }
    stickyActionRef.current = null
    if (alertStickyRef.current) {
      dismissedAlertRef.current = alertStickyRef.current
      alertStickyRef.current = null
    }
    setStickyBubble(null)
    setBubbleMessage(null)
    if (askingRef.current) {
      setAsking(false)
      setQuestionDraft('')
    }
  }

  async function runUpdateFlow() {
    if (updateInFlightRef.current) return
    updateInFlightRef.current = true
    try {
      showBubble('업데이트 확인 중... 🔍', 2500)
      playAction('think', 2500)
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) {
        showBubble('최신 버전이에요 ✅', 2500)
        playAction('smile', 2500)
        return
      }
      showBubble(`새 버전 v${update.version} 설치 중... ⬇️`, 60_000)
      playAction('dance', 4000)
      await update.downloadAndInstall()
      showBubble('설치 완료! 재시작합니다 ✨', 2000)
      playAction('jump', 2000)
      const { relaunch } = await import('@tauri-apps/plugin-process')
      setTimeout(() => { void relaunch() }, 1500)
    } catch (err) {
      console.warn('[orbit] update flow failed', err)
      showBubble('업데이트에 실패했어요 😢', 3000)
      playAction('cry', 3000)
    } finally {
      updateInFlightRef.current = false
    }
  }

  function scheduleLoginHint(afterMs: number) {
    if (loginHintTimerRef.current) clearTimeout(loginHintTimerRef.current)
    loginHintTimerRef.current = setTimeout(() => {
      showBubble('💬 더블클릭하면 뭐든 물어볼 수 있어요', 3500)
      playAction('peek', 3500)
    }, afterMs)
  }

  function toggleWanderPaused() {
    setWanderPaused((prev) => {
      const next = !prev
      void setValue(KEYS.WANDER_PAUSED, next)
      if (next) {
        showBubble('잘자요... 💤Zzz', 3000)
        playAction('yawn', 2000)
      }
      return next
    })
  }

  async function openPanel() {
    const pos = await appWindow.outerPosition()
    await invoke('open_panel', { anchorX: pos.x, anchorY: pos.y })
    setPanelOpen(true)
    void emit('orbit:panel-data', {
      briefing,
      activePet,
      signedIn,
      focusTimer,
      wanderPaused,
    })
  }

  async function closePanel() {
    await invoke('close_panel')
    setPanelOpen(false)
  }

  function handlePanelAction(type: string, payload?: unknown) {
    switch (type) {
      case 'dismiss-pet':
        void closePanel()
        showBubble('다음에 또 봐요! 👋', FAREWELL_HOLD_MS)
        setOneShotAction('wave')
        if (oneShotTimerRef.current) clearTimeout(oneShotTimerRef.current)
        oneShotTimerRef.current = setTimeout(() => {
          setOneShotAction(null)
          void setValue(KEYS.PET_DISMISSED, true)
          setPetState('dismissed')
        }, FAREWELL_HOLD_MS)
        break
      case 'show-pet':
        void setValue(KEYS.PET_DISMISSED, false)
        setPetState('idle')
        // Pet must mount before the wave/bubble play, otherwise the first frame
        // is missed and only the bubble animates over an empty window.
        setTimeout(() => {
          showBubble('다시 만나서 반가워요! ✨', WELCOME_GREET_DURATION_MS)
          setOneShotAction('wave')
          if (oneShotTimerRef.current) clearTimeout(oneShotTimerRef.current)
          oneShotTimerRef.current = setTimeout(() => {
            setOneShotAction(null)
          }, FAREWELL_HOLD_MS)
        }, WELCOME_GREET_RENDER_DELAY_MS)
        break
      case 'mark-read':
        // ignore — driven via storage updates
        break
      case 'event-read': {
        const id = payload as string
        setBriefing((prev) => {
          const updated = { ...prev, events: prev.events.filter((e) => e.id !== id) }
          void setValue(KEYS.PET_BRIEFING, updated)
          return updated
        })
        break
      }
      case 'email-read': {
        const id = payload as string
        setBriefing((prev) => {
          const updated = { ...prev, emails: prev.emails.filter((e) => e.id !== id) }
          void setValue(KEYS.PET_BRIEFING, updated)
          return updated
        })
        break
      }
      case 'toggle-wander':
        toggleWanderPaused()
        break
      case 'return-home':
        ;(async () => {
          const b = boundsRef.current
          if (!b) return
          const targetX = b.maxX - 24
          await setWindowPosition(targetX, b.groundY)
          await setValue(KEYS.WINDOW_POSITION, { x: targetX, y: b.groundY })
          setWanderPaused(true)
          await setValue(KEYS.WANDER_PAUSED, true)
        })().catch(() => {})
        break
      case 'open-gacha':
        if (signedIn) void invoke('open_gacha').catch(() => {})
        break
      case 'timer-start':
        setFocusTimer({
          phase: 'running',
          total: payload as number,
          remaining: payload as number,
        })
        break
      case 'timer-toggle-pause':
        setFocusTimer((prev) =>
          prev.phase === 'running'
            ? { ...prev, phase: 'paused' }
            : prev.phase === 'paused'
              ? { ...prev, phase: 'running' }
              : prev,
        )
        break
      case 'timer-reset':
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
        setFocusTimer(IDLE_FOCUS_TIMER)
        void emit('orbit:focus-timer', IDLE_FOCUS_TIMER)
        break
      case 'sign-in':
        ;(async () => {
          try {
            const { email } = await signIn()
            setSignedIn(true)
            showBubble(`반가워요${email ? `, ${email}` : ''}!`, 3000)
            playAction('love', 3000)
            scheduleLoginHint(3200)
            void fetchNow().catch(() => {})
          } catch (err) {
            console.warn('sign-in failed', err)
          }
        })()
        break
      case 'sign-out':
        ;(async () => {
          await signOut()
          setSignedIn(false)
          if (loginHintTimerRef.current) clearTimeout(loginHintTimerRef.current)
          showBubble('잘 있어요! 또 봐요 👋', 2500)
          playAction('wave', 2500)
        })()
        break
      case 'fetch-full':
        void fetchNow().catch(() => {})
        break
      case 'open-screenshot':
        void invoke('open_screenshot_overlay').catch(() => {})
        break
      default:
        log('unhandled panel action', type)
    }
  }

  // Stops the per-frame cursor sampler that runs during a drag. Safe to call
  // even when the poll isn't active.
  function stopDragCursorPoll() {
    if (cursorPollHandleRef.current !== null) {
      clearInterval(cursorPollHandleRef.current)
      cursorPollHandleRef.current = null
    }
  }

  // Samples real cursor position at ~60Hz while the user is dragging the pet.
  // The OS coalesces window-onMoved events during a native drag, so we read
  // the actual cursor (what the user's hand is doing) to compute an accurate
  // release velocity. Samples older than ~260ms are dropped.
  function startDragCursorPoll() {
    stopDragCursorPoll()
    cursorSamplesRef.current = []
    let inFlight = false
    const tick = async () => {
      if (inFlight) return
      inFlight = true
      try {
        const cursor = await invoke<CursorTuple>('get_cursor_position')
        if (cursor) {
          const t = Date.now()
          cursorSamplesRef.current.push({ t, x: cursor[0], y: cursor[1] })
          if (cursorSamplesRef.current.length > 40) {
            cursorSamplesRef.current.splice(0, cursorSamplesRef.current.length - 40)
          }
          while (
            cursorSamplesRef.current.length > 2 &&
            t - cursorSamplesRef.current[0].t > 260
          ) {
            cursorSamplesRef.current.shift()
          }
        }
      } catch {
        // get_cursor_position can fail transiently between monitors; skip.
      } finally {
        inFlight = false
      }
    }
    cursorPollHandleRef.current = setInterval(tick, DRAG_CURSOR_POLL_MS)
    void tick()
  }

  // ── Pet click vs drag ──
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    mouseDownAtRef.current = { x: e.clientX, y: e.clientY }
    dragStartedRef.current = false
  }

  const handleMouseMove = async (e: React.MouseEvent) => {
    const down = mouseDownAtRef.current
    if (!down || dragStartedRef.current) return
    const dx = e.clientX - down.x
    const dy = e.clientY - down.y
    if (Math.abs(dx) > DRAG_MOVE_THRESHOLD_PX || Math.abs(dy) > DRAG_MOVE_THRESHOLD_PX) {
      dragStartedRef.current = true
      lastUserActionAtRef.current = Date.now()
      startDragCursorPoll()
      try {
        await appWindow.startDragging()
      } catch (err) {
        console.error('[orbit] startDragging failed', err)
      }
    }
  }

  // Single click toggles the panel; we delay the toggle so a quick second click
  // can override and open the question input instead. The trade-off is a small
  // latency on every panel open/close, which is invisible in practice.
  const CLICK_DELAY_MS = 230
  const WAKE_ANIMATION_MS = 1400

  const wakePet = () => {
    setIsSleepy(false)
    setIsAway(false)
    awayStartedAtRef.current = null
    lastUserActionAtRef.current = Date.now()
    // The sleepy effect's polling interval re-evaluates idle every tick, so
    // no manual re-arm is needed here — the click resets system idle to ~0
    // and the next poll naturally keeps isSleepy false until idle climbs again.
    // Explicit "재우기" must also clear here, otherwise every click stays
    // trapped in this wake branch and the next click never opens the panel.
    if (wanderPausedRef.current) {
      setWanderPaused(false)
      void setValue(KEYS.WANDER_PAUSED, false)
    }
    playAction('stretch', WAKE_ANIMATION_MS)
  }

  const handleMouseUp = () => {
    const wasClick = mouseDownAtRef.current && !dragStartedRef.current
    mouseDownAtRef.current = null
    if (!wasClick) return
    if (askingRef.current || askLoading) return

    // If the pet is in a passive state (sleeping/away/wander-paused), the click
    // is consumed as a wake-up gesture instead of opening the panel.
    if (isSleepy || isAway || wanderPaused) {
      wakePet()
      return
    }

    const justClosedByBlur = Date.now() - lastPanelClosedAtRef.current < 250
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      if (panelOpen || justClosedByBlur) {
        void closePanel()
      } else {
        void openPanel()
      }
    }, CLICK_DELAY_MS)
  }

  const handleMouseLeave = () => {
    mouseDownAtRef.current = null
  }

  const handleDoubleClick = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    if (askLoading) return
    if (panelOpen) void closePanel()
    setQuestionDraft('')
    setAsking(true)
  }

  const cancelAsk = () => {
    setAsking(false)
    setQuestionDraft('')
  }

  const submitAsk = async () => {
    const q = questionDraft.trim()
    if (!q || askLoading) return
    setAsking(false)
    setAskLoading(true)
    stickyActionRef.current = null
    setStickyBubble(null)
    showBubble('🤔 생각 중…', 60_000)
    setOneShotAction('think')
    if (oneShotTimerRef.current) clearTimeout(oneShotTimerRef.current)

    try {
      const cfg = await getLLMConfig()
      if (!cfg) {
        setBubbleMessage(null)
        setStickyBubble('🔑 AI API 키가 필요해요. 클릭하면 설정 화면으로 이동해요.')
        stickyActionRef.current = () => {
          void (async () => {
            // Write the intent BEFORE opening panel so a fresh panel reads it
            // on mount; Tauri events emitted before the panel's listener is
            // registered get dropped silently.
            await setValue(KEYS.PANEL_FOCUS_INTENT, 'llm-key')
            await openPanel()
          })()
        }
        playAction('surprise', 2500)
        return
      }
      const profile = await getValue<UserProfile>(KEYS.USER_PROFILE)
      const memoryEntries = (await getValue<PetMemoryEntry[]>(KEYS.PET_MEMORY)) ?? []
      const recentMemories = memoryEntries.slice(-20).map((m) => m.text)

      // 트레이로 펫 종족을 바꾸면 petKind는 갱신되지만 activePet은 이전 가챠
      // 결과(예: 토끼)로 남아 있다. 종족이 일치할 때만 이름을 넘겨, 다른 종족
      // 이름이 프롬프트에 새는 걸 막는다.
      const petName = activePet?.petId === petKind ? activePet?.name : undefined
      const answer = await askQuestion(q, cfg, {
        petKind,
        petName,
        userProfile: profile?.text,
        memories: recentMemories,
      })
      setBubbleMessage(null)
      setStickyBubble(answer.trim() || '음… 답을 찾지 못했어요.')
      setQuestionDraft('')
      playAction('smile', 2500)

      // Fire-and-forget memory extraction so the answer shows immediately.
      // We re-read the current list inside to avoid clobbering concurrent edits.
      void (async () => {
        try {
          const memo = await extractMemory(q, answer, cfg)
          if (!memo) return
          const current = (await getValue<PetMemoryEntry[]>(KEYS.PET_MEMORY)) ?? []
          const next: PetMemoryEntry[] = [...current, { text: memo, savedAt: Date.now() }]
          // Cap at 100 entries to keep prompt size + storage bounded.
          const trimmed = next.length > 100 ? next.slice(next.length - 100) : next
          await setValue(KEYS.PET_MEMORY, trimmed)
        } catch {
          // Memory extraction is best-effort; swallow errors silently.
        }
      })()
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err)
      setBubbleMessage(null)
      setStickyBubble(llmErrorMessage(code, 0))
      playAction('cry', 2500)
    } finally {
      setAskLoading(false)
      // Clear lingering 'think' only — don't overwrite the reaction (smile/surprise/cry)
      // queued by playAction above. React processes setState in order, so the
      // functional updater sees the most recently queued value.
      setOneShotAction((prev) => (prev === 'think' ? null : prev))
    }
  }

  const effectiveAction: PetAction =
    oneShotAction ??
    (wanderAction === 'walk'
      ? 'walk'
      : isAway || isSleepy || wanderPaused
        ? 'sleep'
        : wanderAction)

  // Pet hidden when dismissed or signed out (no signed-in account → no briefing → no reason to show)
  const showPet = signedIn && petState !== 'dismissed'

  // Live focus timer bubble (overrides default bubble)
  const timerBubble =
    !panelOpen && (focusTimer.phase === 'running' || focusTimer.phase === 'paused')
      ? `${focusTimer.phase === 'paused' ? '⏸' : '⏱️'} ${formatTimer(focusTimer.remaining)}`
      : null

  const visibleBubble = stickyBubble ?? timerBubble ?? bubbleMessage

  const { sprite: spriteSize } = PET_SIZE_DIMS[petSize]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        background: 'transparent',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          flex: 1,
          width: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 4,
          pointerEvents: stickyBubble || (asking && showPet) ? 'auto' : 'none',
        }}
      >
        <AnimatePresence>
          {asking && showPet ? (
            <PetQuestionInput
              key="ask-input"
              ref={askInputRef}
              value={questionDraft}
              onChange={setQuestionDraft}
              onAsk={() => void submitAsk()}
              onCancel={cancelAsk}
            />
          ) : (
            visibleBubble && (
              // Stable key: changing the key on every message swap remounts the
              // bubble inside AnimatePresence, and the exiting old bubble's ref
              // callback fires with null ~180ms AFTER the new bubble mounted,
              // wiping out bubbleRef. The cursor pass-through poll then can't
              // hit-test the bubble and the click passes through the window.
              <PetSpeechBubble
                key="pet-speech-bubble"
                ref={bubbleRef}
                message={visibleBubble}
                actionable={
                  !!stickyBubble &&
                  visibleBubble === stickyBubble &&
                  stickyActionRef.current !== null
                }
                onDismiss={
                  stickyBubble && visibleBubble === stickyBubble
                    ? () => {
                        const action = stickyActionRef.current
                        stickyActionRef.current = null
                        if (
                          alertStickyRef.current &&
                          alertStickyRef.current === stickyBubble
                        ) {
                          // User chose to dismiss the alert — remember it so
                          // the next briefing tick with the same summary
                          // doesn't immediately pop it back up.
                          dismissedAlertRef.current = alertStickyRef.current
                          alertStickyRef.current = null
                        }
                        setStickyBubble(null)
                        if (action) action()
                      }
                    : undefined
                }
              />
            )
          )}
        </AnimatePresence>
      </div>

      {showPet && (
        <div
          ref={petHitRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleDoubleClick}
          style={{
            width: spriteSize,
            height: spriteSize,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            cursor: 'grab',
            pointerEvents: 'auto',
          }}
        >
          <PetSprite
            kind={petKind}
            action={effectiveAction}
            size={spriteSize}
            direction={direction}
            walking={effectiveAction === 'walk'}
            paused={wanderPaused}
            onFrame={(f) => {
              currentLottieFrameRef.current = f
            }}
          />
        </div>
      )}
    </div>
  )
}
