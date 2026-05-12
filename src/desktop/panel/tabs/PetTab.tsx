import { useEffect, useState } from 'react'
import { emit } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getValue, setValue, KEYS, subscribeStorage } from '../../../shared/storage'
import { ALL_PET_IDS } from '../../../shared/petCatalog'
import type { PetId, PetSize, WanderFrequency } from '../../../shared/types'

interface Props {
  signedIn: boolean
  action: (type: string, payload?: unknown) => void
}

const PET_META: Record<PetId, { emoji: string; label: string }> = {
  pico: { emoji: '🤖', label: '피코' },
  mofu: { emoji: '🧡', label: '모푸' },
  sprout: { emoji: '🌱', label: '새싹' },
  nova: { emoji: '🛰️', label: '노바' },
  mochi: { emoji: '🍡', label: '모치' },
  rabbit: { emoji: '🐰', label: '토끼' },
  hedgehog: { emoji: '🦔', label: '고슴도치' },
  raccoon: { emoji: '🦝', label: '너구리' },
  unicorn: { emoji: '🦄', label: '유니콘' },
  // cat: { emoji: '🐱', label: '고양이' },
  // dog: { emoji: '🐕', label: '강아지' },
  // panda: { emoji: '🐼', label: '판다' },
  // lion: { emoji: '🦁', label: '사자' },
  // dragon: { emoji: '🐉', label: '드래곤' },
}

const SIZE_LABELS: Record<PetSize, string> = {
  small: '작게',
  medium: '보통',
  large: '크게',
}

const FREQ_LABELS: Record<WanderFrequency, string> = {
  low: '낮음',
  normal: '보통',
  high: '높음',
}

function isPetSize(v: unknown): v is PetSize {
  return v === 'small' || v === 'medium' || v === 'large'
}

function isWanderFrequency(v: unknown): v is WanderFrequency {
  return v === 'low' || v === 'normal' || v === 'high'
}

export default function PetTab({ signedIn, action }: Props) {
  const [petKind, setPetKind] = useState<PetId>('pico')
  const [petSize, setPetSize] = useState<PetSize>('medium')
  const [wanderPaused, setWanderPaused] = useState(false)
  const [wanderFreq, setWanderFreq] = useState<WanderFrequency>('normal')
  const [dismissed, setDismissed] = useState(false)
  const [meetingMode, setMeetingMode] = useState(false)

  useEffect(() => {
    let cancelled = false
    const offs: Array<() => void> = []
    ;(async () => {
      const k = await getValue<string>(KEYS.PET_KIND)
      if (!cancelled && k && (k as string) in PET_META) setPetKind(k as PetId)
      const s = await getValue<string>(KEYS.PET_SIZE)
      if (!cancelled && isPetSize(s)) setPetSize(s)
      const p = await getValue<boolean>(KEYS.WANDER_PAUSED)
      if (!cancelled && typeof p === 'boolean') setWanderPaused(p)
      const f = await getValue<string>(KEYS.WANDER_FREQUENCY)
      if (!cancelled && isWanderFrequency(f)) setWanderFreq(f)
      const d = await getValue<boolean>(KEYS.PET_DISMISSED)
      if (!cancelled && typeof d === 'boolean') setDismissed(d)
      const mm = await getValue<boolean>(KEYS.MEETING_MODE_ENABLED)
      if (!cancelled && typeof mm === 'boolean') setMeetingMode(mm)
      offs.push(
        await subscribeStorage<string>(KEYS.PET_KIND, (v) => {
          if (!cancelled && v && (v as string) in PET_META) setPetKind(v as PetId)
        }),
        await subscribeStorage<string>(KEYS.PET_SIZE, (v) => {
          if (!cancelled && isPetSize(v)) setPetSize(v)
        }),
        await subscribeStorage<boolean>(KEYS.WANDER_PAUSED, (v) => {
          if (!cancelled) setWanderPaused(!!v)
        }),
        await subscribeStorage<string>(KEYS.WANDER_FREQUENCY, (v) => {
          if (!cancelled && isWanderFrequency(v)) setWanderFreq(v)
        }),
        await subscribeStorage<boolean>(KEYS.PET_DISMISSED, (v) => {
          if (!cancelled) setDismissed(!!v)
        }),
        await subscribeStorage<boolean>(KEYS.MEETING_MODE_ENABLED, (v) => {
          if (!cancelled) setMeetingMode(!!v)
        }),
      )
    })()
    return () => {
      cancelled = true
      offs.forEach((off) => off())
    }
  }, [])

  const handleKindChange = (k: PetId) => {
    void emit('orbit:pet-kind', k)
  }
  const handleSizeChange = (s: PetSize) => {
    void emit('orbit:pet-size', s)
  }
  const handleSleepToggle = () => {
    void emit('orbit:toggle-wander')
  }
  const handleFreqChange = (f: WanderFrequency) => {
    void emit('orbit:wander-freq', f)
  }
  const handleOpenProfile = () => {
    void invoke('open_profile').catch(() => {})
  }
  const handleClearMemory = () => {
    if (!window.confirm('펫의 메모리를 모두 비울까요?\n(유저 프로필은 그대로 유지돼요)')) return
    void emit('orbit:clear-memory')
  }
  const handleMeetingToggle = () => {
    const next = !meetingMode
    setMeetingMode(next)
    void setValue(KEYS.MEETING_MODE_ENABLED, next)
  }

  const current = PET_META[petKind] ?? PET_META.pico
  const statusLabel = dismissed
    ? '💤 자리 비움'
    : wanderPaused
      ? '😴 잠자는 중'
      : '✨ 활동 중'

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          background: '#f5f3ff',
          border: '1px solid #ddd6fe',
          borderRadius: 12,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 32, lineHeight: 1 }}>{current.emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#5b21b6' }}>
            {current.label}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#7c3aed' }}>
            {statusLabel}
            {' · '}
            크기 {SIZE_LABELS[petSize]}
          </p>
        </div>
      </div>

      <Section title="펫 종류">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 6,
          }}
        >
          {ALL_PET_IDS.map((id) => {
            const meta = PET_META[id]
            const active = id === petKind
            return (
              <button
                key={id}
                onClick={() => handleKindChange(id)}
                title={meta.label}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '8px 0',
                  borderRadius: 8,
                  textAlign: 'center',
                  background: active ? '#ede9fe' : '#f9fafb',
                  border: `1px solid ${active ? '#a78bfa' : '#e5e7eb'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 20 }}>{meta.emoji}</span>
                <span
                  style={{
                    fontSize: 9,
                    color: active ? '#5b21b6' : '#6b7280',
                    fontWeight: 600,
                  }}
                >
                  {meta.label}
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="펫 크기">
        <div style={{ display: 'flex', gap: 6 }}>
          {(['small', 'medium', 'large'] as PetSize[]).map((s) => {
            const active = s === petSize
            return (
              <button
                key={s}
                onClick={() => handleSizeChange(s)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  textAlign: 'center',
                  background: active ? '#ede9fe' : '#f9fafb',
                  border: `1px solid ${active ? '#a78bfa' : '#e5e7eb'}`,
                  color: active ? '#5b21b6' : '#6b7280',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {SIZE_LABELS[s]}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="걷는 빈도">
        <div style={{ display: 'flex', gap: 6 }}>
          {(['low', 'normal', 'high'] as WanderFrequency[]).map((f) => {
            const active = f === wanderFreq
            return (
              <button
                key={f}
                onClick={() => handleFreqChange(f)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 8,
                  textAlign: 'center',
                  background: active ? '#ede9fe' : '#f9fafb',
                  border: `1px solid ${active ? '#a78bfa' : '#e5e7eb'}`,
                  color: active ? '#5b21b6' : '#6b7280',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {FREQ_LABELS[f]}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="회의 모드">
        <button
          onClick={handleMeetingToggle}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 9,
            background: meetingMode ? '#ede9fe' : '#f9fafb',
            border: `1px solid ${meetingMode ? '#a78bfa' : '#e5e7eb'}`,
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: meetingMode ? '#5b21b6' : '#374151',
              }}
            >
              📞 캘린더 일정 시간엔 자동 비키기
            </span>
            <span style={{ fontSize: 10, color: meetingMode ? '#7c3aed' : '#9ca3af' }}>
              일정 시작 시 우하단으로 이동 후 sleep, 끝나면 원래대로 복귀
            </span>
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 999,
              background: meetingMode ? '#7c3aed' : '#e5e7eb',
              color: meetingMode ? '#fff' : '#6b7280',
            }}
          >
            {meetingMode ? 'ON' : 'OFF'}
          </span>
        </button>
      </Section>

      <Section title="조작">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ActionButton onClick={handleSleepToggle}>
            {wanderPaused ? '☀️ 깨우기' : '💤 재우기'}
          </ActionButton>
          <ActionButton onClick={() => action(dismissed ? 'show-pet' : 'dismiss-pet')}>
            {dismissed ? '👋 펫 소환' : '🚪 펫 퇴장'}
          </ActionButton>
          <ActionButton onClick={() => action('return-home')}>🏠 우하단으로</ActionButton>
          <ActionButton onClick={() => action('open-gacha')} disabled={!signedIn}>
            🎰 가챠 열기
          </ActionButton>
          <ActionButton onClick={handleOpenProfile}>📓 프로필 / 메모리</ActionButton>
          <ActionButton onClick={handleClearMemory} kind="warn">
            🧠 메모리 비우기
          </ActionButton>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          margin: '0 0 6px',
          fontSize: 11,
          fontWeight: 700,
          color: '#6b7280',
          letterSpacing: 0.2,
        }}
      >
        {title}
      </p>
      {children}
    </div>
  )
}

function ActionButton({
  onClick,
  disabled,
  kind = 'default',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  kind?: 'default' | 'warn'
  children: React.ReactNode
}) {
  const palette =
    kind === 'warn'
      ? { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' }
      : { bg: '#f9fafb', fg: '#374151', border: '#e5e7eb' }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        all: 'unset',
        cursor: disabled ? 'default' : 'pointer',
        padding: '9px 0',
        borderRadius: 9,
        background: disabled ? '#f3f4f6' : palette.bg,
        color: disabled ? '#9ca3af' : palette.fg,
        border: `1px solid ${disabled ? '#e5e7eb' : palette.border}`,
        fontWeight: 700,
        fontSize: 11,
        textAlign: 'center',
      }}
    >
      {children}
    </button>
  )
}
