import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { currentMonitor, primaryMonitor } from '@tauri-apps/api/window'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import { listen, emit } from '@tauri-apps/api/event'
import LottiePet from './components/LottiePet'
import PetSpeechBubble from './components/PetSpeechBubble'
import type { PetAction } from './components/petActions'
import type {
  BriefingPayload,
  GachaResult,
  LottiePetId,
  PetId,
  PetSize,
  PetState,
  FocusTimerState,
} from '../shared/types'
import { EMPTY_BRIEFING, IDLE_FOCUS_TIMER } from '../shared/types'
import { isLottiePetId, isPetId } from '../shared/petCatalog'
import { getValue, setValue, subscribeStorage, KEYS } from '../shared/storage'
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
const DRAG_END_DEBOUNCE_MS = 300
const GROUND_MARGIN_PX = 80
const COMFORTABLE_INNER_MARGIN_PX = 200
const DRAG_MOVE_THRESHOLD_PX = 4
const ONESHOT_ACTION_DURATION_MS = 1200
const FALL_ANIMATION_MS = 500
const SLEEPY_TIMEOUT_MS = 120_000
const GREETING_DURATION_MS = 3000

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

const ONESHOT_ACTIONS: PetAction[] = ['jump', 'love', 'wave', 'dance', 'stretch', 'peek']

const PET_SIZE_DIMS: Record<PetSize, { hit: number; sprite: number }> = {
  small: { hit: 120, sprite: 80 },
  medium: { hit: 160, sprite: 120 },
  large: { hit: 200, sprite: 160 },
}

const isPetSize = (s: unknown): s is PetSize =>
  s === 'small' || s === 'medium' || s === 'large'

// Lottie frame ranges where the pet is visually standing still (window must not step here).
// Other Lottie pets loop a continuous walking gait, so they need no entry.
const LOTTIE_REST_RANGES: Partial<Record<LottiePetId, [number, number]>> = {
  raccoon: [84, 180],
}

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min
const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

async function loadScreenBounds(): Promise<ScreenBounds | null> {
  let monitor = await currentMonitor()
  if (!monitor) monitor = await primaryMonitor()
  if (!monitor) return null
  const winSize = await appWindow.outerSize()
  sizeCache.w = winSize.width
  sizeCache.h = winSize.height
  return {
    minX: monitor.position.x,
    maxX: monitor.position.x + monitor.size.width - winSize.width,
    groundY: monitor.position.y + monitor.size.height - winSize.height - GROUND_MARGIN_PX,
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

export default function App() {
  // Pet visual / wander state (existing)
  const [direction, setDirection] = useState<Direction>('left')
  const [wanderAction, setWanderAction] = useState<WanderPhase>('idle')
  const [oneShotAction, setOneShotAction] = useState<PetAction | null>(null)
  const [petKind, setPetKind] = useState<PetId>('cat')
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
  const [panelOpen, setPanelOpen] = useState(false)

  const wanderActionRef = useRef<WanderPhase>('idle')
  const wanderPausedRef = useRef(false)
  const panelOpenRef = useRef(false)
  const petStateRef = useRef<PetState>('idle')
  const petKindRef = useRef<PetId>('cat')
  const currentLottieFrameRef = useRef(0)
  const oneShotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const boundsRef = useRef<ScreenBounds | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastUserActionAtRef = useRef(0)
  const sleepyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alertBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const morningGreetingShownRef = useRef(false)

  const mouseDownAtRef = useRef<{ x: number; y: number } | null>(null)
  const dragStartedRef = useRef(false)
  const lastPanelClosedAtRef = useRef(0)

  const petHitRef = useRef<HTMLDivElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)

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

  // ── Setup: bounds, store, persisted state, onMoved, scheduler ─
  useEffect(() => {
    let unlistenMoved: (() => void) | undefined
    let cancelled = false

    ;(async () => {
      const bounds = await loadScreenBounds()
      if (cancelled) return
      boundsRef.current = bounds
      log('bounds loaded', bounds)

      const savedKind = await getValue<string>(KEYS.PET_KIND)
      if (isPetId(savedKind)) setPetKind(savedKind)

      const savedSize = await getValue<string>(KEYS.PET_SIZE)
      if (isPetSize(savedSize)) setPetSize(savedSize)

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
        const innerMin = bounds.minX + COMFORTABLE_INNER_MARGIN_PX
        const innerMax = bounds.maxX - COMFORTABLE_INNER_MARGIN_PX
        const x =
          innerMin <= innerMax
            ? Math.max(innerMin, Math.min(innerMax, savedPos.x))
            : Math.max(bounds.minX, Math.min(bounds.maxX, savedPos.x))
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
        lastUserActionAtRef.current = Date.now()

        // Notify panel for anchor sync
        void emit('orbit:pet-moved', { x: payload.x, y: payload.y })

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(async () => {
          const b = boundsRef.current
          if (!b) return
          const currentPos = await appWindow.outerPosition()
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
          setWanderPaused((prev) => {
            const next = !prev
            void setValue(KEYS.WANDER_PAUSED, next)
            return next
          })
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
          } catch (err) {
            console.warn('[orbit] screenshot copy failed', err)
            showBubble('😢 캡처 복사에 실패했어요', 2500)
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
        await listen('orbit:auth-toggle', async () => {
          try {
            if (await checkSignedIn()) {
              await signOut()
              setSignedIn(false)
              showBubble('잘 있어요! 또 봐요 👋', 2500)
            } else {
              const { email } = await signIn()
              setSignedIn(true)
              const hour = new Date().getHours()
              const greet = hour < 12 ? '좋은 아침이에요' : '안녕하세요'
              showBubble(`${greet}${email ? `, ${email}` : ''}! 😊`, 3500)
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
        }),
      )
      register(
        await listen<{ id: string; label: string; message: string }>(
          'orbit:reminder-fire',
          (e) => {
            if (cancelled) return
            setStickyBubble(e.payload.message)
          },
        ),
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
  // behind the window.
  useEffect(() => {
    let cancelled = false
    let inFlight = false
    let currentlyIgnoring: boolean | null = null
    const dpr = window.devicePixelRatio || 1

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
        const winRelX = (cursor[0] - posCache.x) / dpr
        const winRelY = (cursor[1] - posCache.y) / dpr

        const hitRect = petHitRef.current?.getBoundingClientRect()
        const inPet =
          !!hitRect &&
          winRelX >= hitRect.left &&
          winRelX < hitRect.right &&
          winRelY >= hitRect.top &&
          winRelY < hitRect.bottom

        let inBubble = false
        if (!inPet && bubbleRef.current) {
          const r = bubbleRef.current.getBoundingClientRect()
          inBubble =
            winRelX >= r.left && winRelX < r.right && winRelY >= r.top && winRelY < r.bottom
        }

        await setIgnore(!(inPet || inBubble))
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
      if (wanderPausedRef.current || panelOpenRef.current || petState === 'dismissed' || !signedIn) {
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
  useEffect(() => {
    if (sleepyTimerRef.current) clearTimeout(sleepyTimerRef.current)
    setIsSleepy(false)
    if (petState === 'idle' && !panelOpen && !bubbleMessage) {
      sleepyTimerRef.current = setTimeout(() => setIsSleepy(true), SLEEPY_TIMEOUT_MS)
    }
    return () => {
      if (sleepyTimerRef.current) clearTimeout(sleepyTimerRef.current)
    }
  }, [petState, panelOpen, bubbleMessage])

  // ── Morning greeting ──
  useEffect(() => {
    if (petState === 'dismissed' || morningGreetingShownRef.current) return
    morningGreetingShownRef.current = true
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 11 && signedIn) {
      const t = setTimeout(() => showBubble('좋은 아침이에요! ☀️', 2500), 800)
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
  }, [briefing, petState])

  // ── Alert bubble auto-show 5s ──
  useEffect(() => {
    if (alertBubbleTimerRef.current) clearTimeout(alertBubbleTimerRef.current)
    if (petState === 'alert' && !panelOpen) {
      const summary = liveSummary(briefing)
      setBubbleMessage(summary)
      alertBubbleTimerRef.current = setTimeout(() => {
        setBubbleMessage((prev) => (prev === summary ? null : prev))
      }, 5000)
    }
    return () => {
      if (alertBubbleTimerRef.current) clearTimeout(alertBubbleTimerRef.current)
    }
  }, [petState, panelOpen, briefing])

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
        void setValue(KEYS.PET_DISMISSED, true)
        setPetState('dismissed')
        void closePanel()
        break
      case 'show-pet':
        void setValue(KEYS.PET_DISMISSED, false)
        setPetState('idle')
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
        setWanderPaused((prev) => {
          const next = !prev
          void setValue(KEYS.WANDER_PAUSED, next)
          return next
        })
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
          showBubble('잘 있어요! 또 봐요 👋', 2500)
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
      try {
        await appWindow.startDragging()
      } catch (err) {
        console.error('[orbit] startDragging failed', err)
      }
    }
  }

  const triggerClickAction = () => {
    const action = pickRandom(ONESHOT_ACTIONS)
    setOneShotAction(action)
    if (oneShotTimerRef.current) clearTimeout(oneShotTimerRef.current)
    oneShotTimerRef.current = setTimeout(() => {
      setOneShotAction(null)
    }, ONESHOT_ACTION_DURATION_MS)
  }

  const handleMouseUp = () => {
    const wasClick = mouseDownAtRef.current && !dragStartedRef.current
    mouseDownAtRef.current = null
    if (!wasClick) return
    const justClosedByBlur = Date.now() - lastPanelClosedAtRef.current < 250
    if (panelOpen || justClosedByBlur) {
      void closePanel()
    } else {
      void openPanel()
    }
  }

  const handleMouseLeave = () => {
    mouseDownAtRef.current = null
  }

  const handleDoubleClick = () => {
    triggerClickAction()
  }

  const effectiveAction: PetAction =
    oneShotAction ??
    (isSleepy ? 'sleep' : wanderPaused ? 'sleep' : wanderAction)

  // Pet hidden when dismissed or signed out (no signed-in account → no briefing → no reason to show)
  const showPet = signedIn && petState !== 'dismissed'

  // Live focus timer bubble (overrides default bubble)
  const timerBubble =
    !panelOpen && (focusTimer.phase === 'running' || focusTimer.phase === 'paused')
      ? `${focusTimer.phase === 'paused' ? '⏸' : '⏱️'} ${formatTimer(focusTimer.remaining)}`
      : null

  const visibleBubble = stickyBubble ?? timerBubble ?? bubbleMessage

  const { hit: hitSize, sprite: spriteSize } = PET_SIZE_DIMS[petSize]

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
          pointerEvents: stickyBubble ? 'auto' : 'none',
        }}
      >
        <AnimatePresence>
          {visibleBubble && (
            <PetSpeechBubble
              key={visibleBubble}
              ref={bubbleRef}
              message={visibleBubble}
              onDismiss={
                stickyBubble && visibleBubble === stickyBubble
                  ? () => setStickyBubble(null)
                  : undefined
              }
            />
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
            width: hitSize,
            height: hitSize,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            cursor: 'grab',
            pointerEvents: 'auto',
          }}
        >
          {isLottiePetId(petKind) ? (
            <LottiePet
              kind={petKind}
              size={spriteSize}
              direction={direction}
              walking={effectiveAction === 'walk'}
              paused={wanderPaused}
              onFrame={(f) => {
                currentLottieFrameRef.current = f
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
