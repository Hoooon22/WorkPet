import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { listen, emit } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { invoke } from '@tauri-apps/api/core'
import type {
  BriefingPayload,
  FocusTimerState,
} from '../../shared/types'
import { EMPTY_BRIEFING, IDLE_FOCUS_TIMER } from '../../shared/types'
import {
  getValue,
  KEYS,
  subscribeStorage,
} from '../../shared/storage'
import { fetchFullBriefing } from '../../shared/scheduler'
import { getSignedInEmail } from '../../shared/auth'
import AlertsTab from './tabs/AlertsTab'
import BriefingTab from './tabs/BriefingTab'
import ToolsTab from './tabs/ToolsTab'
import SettingsTab from './tabs/SettingsTab'

type TabId = 'alerts' | 'briefing' | 'tools' | 'settings'

const PANEL_WIDTH = 380
const PANEL_HEIGHT = 540

const appWindow = getCurrentWebviewWindow()

export default function Panel() {
  const [tab, setTab] = useState<TabId>('alerts')
  const [briefing, setBriefing] = useState<BriefingPayload>(EMPTY_BRIEFING)
  const [fullBriefing, setFullBriefing] = useState<BriefingPayload | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [focusTimer, setFocusTimer] = useState<FocusTimerState>(IDLE_FOCUS_TIMER)
  const [detached, setDetached] = useState(false)
  const [focusGeminiSignal, setFocusGeminiSignal] = useState(0)

  // Initial load
  useEffect(() => {
    ;(async () => {
      const b = await getValue<BriefingPayload>(KEYS.PET_BRIEFING)
      if (b) setBriefing(b)
      const tok = await getValue<string>(KEYS.AUTH_TOKEN)
      setSignedIn(!!tok)
      setEmail(await getSignedInEmail())
    })()
  }, [])

  // Listen for events from pet
  useEffect(() => {
    const offs: Array<() => void> = []
    let cancelled = false
    ;(async () => {
      const off1 = await listen<BriefingPayload>('orbit:briefing-alert', (e) => {
        if (cancelled) return
        setBriefing(e.payload)
      })
      const off2 = await listen<FocusTimerState>('orbit:focus-timer', (e) => {
        if (cancelled) return
        setFocusTimer(e.payload)
      })
      const off3 = await listen<{ signedIn: boolean; email: string | null }>(
        'orbit:auth-changed',
        (e) => {
          if (cancelled) return
          setSignedIn(e.payload.signedIn)
          setEmail(e.payload.email)
        },
      )
      const off4 = await listen<{ x: number; y: number }>('orbit:pet-moved', async (e) => {
        if (cancelled || detached) return
        await reposition(e.payload.x, e.payload.y)
      })
      const off5 = await subscribeStorage<BriefingPayload>(KEYS.PET_BRIEFING, (val) => {
        if (cancelled) return
        if (val) setBriefing(val)
      })
      const off6 = await listen('orbit:focus-settings-gemini', () => {
        if (cancelled) return
        setTab('settings')
        setFocusGeminiSignal((s) => s + 1)
      })
      offs.push(off1, off2, off3, off4, off5, off6)
    })()
    return () => {
      cancelled = true
      offs.forEach((off) => off())
    }
  }, [detached])

  // Track manual drag → detach
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let initialized = false
    ;(async () => {
      unlisten = await appWindow.onMoved(() => {
        if (!initialized) {
          initialized = true
          return
        }
        setDetached(true)
      })
    })()
    return () => unlisten?.()
  }, [])

  // Auto-close on focus loss (click outside)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let hasBeenFocused = false
    ;(async () => {
      unlisten = await appWindow.onFocusChanged(async ({ payload: focused }) => {
        if (focused) {
          hasBeenFocused = true
          return
        }
        if (!hasBeenFocused) return
        hasBeenFocused = false
        await emit('orbit:panel-closed')
        await invoke('close_panel').catch(() => {})
      })
    })()
    return () => unlisten?.()
  }, [])

  async function reposition(petX: number, petY: number) {
    const monitorWidth =
      typeof window !== 'undefined' ? window.screen.availWidth : 1920
    const petWindowW = 240
    const petWindowH = 320
    const petVisualPadX = 60
    const gap = 8
    const petVisualLeft = petX + petVisualPadX
    const petVisualRight = petX + petWindowW - petVisualPadX
    const wantRight = petVisualRight + gap
    const x =
      wantRight + PANEL_WIDTH > monitorWidth
        ? petVisualLeft - PANEL_WIDTH - gap
        : wantRight
    const y = Math.max(0, petY + petWindowH - PANEL_HEIGHT)
    try {
      await appWindow.setPosition(new PhysicalPosition(Math.max(0, x), y))
    } catch {
      /* noop */
    }
  }

  async function handleFetchFull() {
    setLoadingFull(true)
    try {
      const result = await fetchFullBriefing()
      setFullBriefing(result)
    } finally {
      setLoadingFull(false)
    }
  }

  function action(type: string, payload?: unknown) {
    void emit('orbit:panel-action', { type, payload })
  }

  const alarmCount = briefing.tasks.length + briefing.events.length + briefing.emails.length

  const tabs: { id: TabId; label: string }[] = [
    { id: 'alerts', label: `🔔 알람${alarmCount > 0 ? ` (${alarmCount})` : ''}` },
    { id: 'briefing', label: '📊 브리핑' },
    { id: 'tools', label: '🛠️ 도구' },
    { id: 'settings', label: '⚙️ 설정' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(14px)',
        borderRadius: 16,
        boxShadow: '0 12px 36px rgba(0,0,0,0.2)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <div
        data-tauri-drag-region
        style={{
          background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#fff',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'move',
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 64 64"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <ellipse
            cx="32"
            cy="34"
            rx="24"
            ry="12"
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="2.5"
            transform="rotate(-18 32 34)"
          />
          <circle cx="53" cy="22" r="3.5" fill="#fff" />
          <path d="M26 38 Q22 30 25 23 Q29 24 30 32 Q30 37 28 38 Z" fill="#fff" />
          <path d="M38 38 Q42 30 39 23 Q35 24 34 32 Q34 37 36 38 Z" fill="#fff" />
          <ellipse cx="32" cy="44" rx="10" ry="8" fill="#fff" />
          <circle cx="28" cy="43" r="1.4" fill="#1d4ed8" />
          <circle cx="36" cy="43" r="1.4" fill="#1d4ed8" />
          <ellipse cx="32" cy="46" rx="1.2" ry="0.8" fill="#fb7185" />
        </svg>
        <span>Work-Pet Orbit</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => action('open-gacha')}
          disabled={!signedIn}
          style={{
            all: 'unset',
            padding: '4px 10px',
            borderRadius: 8,
            background: signedIn ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
            color: signedIn ? '#fff' : 'rgba(255,255,255,0.4)',
            cursor: signedIn ? 'pointer' : 'default',
            fontSize: 11,
          }}
        >
          🎰 가챠
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '0 8px' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flex: 1,
              padding: '10px 4px',
              fontSize: 11,
              fontWeight: 700,
              textAlign: 'center',
              color: tab === t.id ? '#2563eb' : '#9ca3af',
              borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {tab === 'alerts' && <AlertsTab briefing={briefing} action={action} />}
        {tab === 'briefing' && (
          <BriefingTab
            full={fullBriefing}
            loading={loadingFull}
            onFetch={handleFetchFull}
          />
        )}
        {tab === 'tools' && <ToolsTab focusTimer={focusTimer} action={action} />}
        {tab === 'settings' && (
          <SettingsTab
            signedIn={signedIn}
            email={email}
            action={action}
            focusGeminiSignal={focusGeminiSignal}
          />
        )}
      </div>
    </motion.div>
  )
}
