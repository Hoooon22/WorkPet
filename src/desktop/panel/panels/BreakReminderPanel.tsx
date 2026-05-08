import { useEffect, useState } from 'react'
import { getValue, setValue, KEYS, subscribeStorage } from '../../../shared/storage'
import { DEFAULT_BREAK_MESSAGE } from '../../../shared/breakReminders'
import type { BreakReminderSettings } from '../../../shared/types'

const COLOR_BG = '#ecfdf5'
const COLOR_BORDER = '#a7f3d0'
const COLOR_FG = '#047857'

const DEFAULT_SETTINGS: BreakReminderSettings = {
  enabled: false,
  intervalMin: 20,
  message: '',
  weekdaysOnly: false,
}

const MIN_INTERVAL = 1
const MAX_INTERVAL = 240

export default function BreakReminderPanel() {
  const [settings, setSettings] = useState<BreakReminderSettings>(DEFAULT_SETTINGS)
  const [intervalDraft, setIntervalDraft] = useState('20')
  const [messageDraft, setMessageDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    ;(async () => {
      const saved = (await getValue<BreakReminderSettings>(KEYS.BREAK_REMINDER)) ?? DEFAULT_SETTINGS
      if (cancelled) return
      setSettings(saved)
      setIntervalDraft(String(saved.intervalMin))
      setMessageDraft(saved.message ?? '')
      unsub = await subscribeStorage<BreakReminderSettings>(KEYS.BREAK_REMINDER, (val) => {
        if (cancelled || !val) return
        setSettings(val)
      })
    })()
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  const persist = async (next: BreakReminderSettings, resetTimer = false) => {
    setSettings(next)
    await setValue(KEYS.BREAK_REMINDER, next)
    if (resetTimer) {
      await setValue(KEYS.BREAK_REMINDER_LAST_FIRED, Date.now())
    }
  }

  const toggleEnabled = async () => {
    const next = { ...settings, enabled: !settings.enabled }
    await persist(next, next.enabled)
  }

  const commitInterval = async () => {
    const n = Number(intervalDraft)
    if (!Number.isFinite(n)) {
      setIntervalDraft(String(settings.intervalMin))
      return
    }
    const clamped = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.floor(n)))
    setIntervalDraft(String(clamped))
    if (clamped === settings.intervalMin) return
    await persist({ ...settings, intervalMin: clamped }, settings.enabled)
  }

  const commitMessage = async () => {
    const trimmed = messageDraft.trim()
    if ((settings.message ?? '') === trimmed) return
    await persist({ ...settings, message: trimmed })
  }

  const toggleWeekdays = async () => {
    await persist({ ...settings, weekdaysOnly: !settings.weekdaysOnly })
  }

  return (
    <div
      style={{
        background: COLOR_BG,
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <p style={{ margin: 0, fontSize: 11, color: '#065f46', textAlign: 'center', padding: '2px 0' }}>
        20-20-20: 20분마다 20초 먼 곳 보기 👀
      </p>

      <div
        style={{
          background: '#fff',
          border: `1px solid ${COLOR_BORDER}`,
          borderRadius: 8,
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: COLOR_FG }}>
          {settings.enabled ? '켜짐' : '꺼짐'}
        </div>
        <button
          onClick={toggleEnabled}
          aria-label={settings.enabled ? '비활성화' : '활성화'}
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 32,
            height: 18,
            borderRadius: 9,
            background: settings.enabled ? COLOR_FG : '#d1d5db',
            position: 'relative',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: settings.enabled ? 16 : 2,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s',
            }}
          />
        </button>
      </div>

      <div
        style={{
          background: '#fff',
          border: `1px solid ${COLOR_BORDER}`,
          borderRadius: 8,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: COLOR_FG,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          간격 (분)
        </label>
        <input
          type="number"
          min={MIN_INTERVAL}
          max={MAX_INTERVAL}
          value={intervalDraft}
          onChange={(e) => setIntervalDraft(e.target.value)}
          onBlur={commitInterval}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{
            border: `1px solid ${COLOR_BORDER}`,
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 11,
            color: '#1f2937',
            outline: 'none',
            fontVariantNumeric: 'tabular-nums',
          }}
        />

        <label
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: COLOR_FG,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginTop: 4,
          }}
        >
          메시지 (선택)
        </label>
        <input
          value={messageDraft}
          onChange={(e) => setMessageDraft(e.target.value)}
          onBlur={commitMessage}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          placeholder={DEFAULT_BREAK_MESSAGE}
          style={{
            border: `1px solid ${COLOR_BORDER}`,
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 11,
            color: '#1f2937',
            outline: 'none',
          }}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: '#6b7280',
            cursor: 'pointer',
            marginTop: 2,
          }}
        >
          <input
            type="checkbox"
            checked={settings.weekdaysOnly}
            onChange={toggleWeekdays}
            style={{ margin: 0 }}
          />
          평일(월~금)에만 알림
        </label>
      </div>
    </div>
  )
}
