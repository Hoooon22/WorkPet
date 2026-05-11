import { useEffect, useMemo, useState } from 'react'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import {
  KEYS,
  getValue,
  setValue,
  subscribeStorage,
  type PetMemoryEntry,
  type UserProfile,
} from '../../shared/storage'

const PROFILE_PLACEHOLDER =
  '여기에 펫이 알아두면 좋을 본인 정보를 자유롭게 적어주세요.\n\n' +
  '예시)\n' +
  '- 이름: 홍길동\n' +
  '- 직업: 백엔드 개발자\n' +
  '- 좋아하는 것: 커피, 산책\n' +
  '- 펫에게 바라는 점: 짧고 다정하게 답해줘'

export default function Profile() {
  const [profileText, setProfileText] = useState('')
  const [originalProfile, setOriginalProfile] = useState('')
  const [memories, setMemories] = useState<PetMemoryEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    let unsub: (() => void) | null = null
    void (async () => {
      const profile = await getValue<UserProfile>(KEYS.USER_PROFILE)
      const initial = profile?.text ?? ''
      setProfileText(initial)
      setOriginalProfile(initial)

      const mem = (await getValue<PetMemoryEntry[]>(KEYS.PET_MEMORY)) ?? []
      setMemories(mem)

      unsub = await subscribeStorage<PetMemoryEntry[]>(KEYS.PET_MEMORY, (val) => {
        setMemories(val ?? [])
      })
    })()
    return () => {
      if (unsub) unsub()
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      void getCurrentWebviewWindow().close().catch(() => {})
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dirty = profileText !== originalProfile

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const next: UserProfile = { text: profileText, updatedAt: Date.now() }
      await setValue(KEYS.USER_PROFILE, next)
      setOriginalProfile(profileText)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  async function handleClearMemory() {
    const ok = window.confirm('펫의 메모리를 모두 비울까요?\n(유저 프로필은 유지됩니다)')
    if (!ok) return
    await setValue<PetMemoryEntry[]>(KEYS.PET_MEMORY, [])
  }

  async function handleDeleteMemory(idx: number) {
    const next = memories.filter((_, i) => i !== idx)
    await setValue<PetMemoryEntry[]>(KEYS.PET_MEMORY, next)
  }

  async function handleClose() {
    try {
      await getCurrentWebviewWindow().close()
    } catch {
      // noop
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#f5f5f7',
      }}
    >
      <TitleBar onClose={handleClose} />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          padding: 14,
          boxSizing: 'border-box',
        }}
      >
        <Section title="유저 프로필" subtitle="내가 펫에게 직접 알려주는 정보">
          <textarea
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            placeholder={PROFILE_PLACEHOLDER}
            style={{
              flex: 1,
              minHeight: 0,
              width: '100%',
              boxSizing: 'border-box',
              padding: 12,
              fontSize: 13,
              lineHeight: 1.55,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#fff',
              resize: 'none',
              outline: 'none',
              color: '#1f2937',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 8,
            }}
          >
            {savedFlash && (
              <span style={{ fontSize: 12, color: '#16a34a' }}>저장됨</span>
            )}
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              style={{
                all: 'unset',
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 6,
                background: dirty ? '#2563eb' : '#cbd5e1',
                color: '#fff',
                cursor: dirty ? 'pointer' : 'default',
              }}
            >
              저장
            </button>
          </div>
        </Section>

        <Section
          title="펫이 적은 메모리"
          subtitle="대화에서 펫이 자동으로 기억한 정보"
          headerRight={
            <button
              onClick={handleClearMemory}
              disabled={memories.length === 0}
              style={{
                all: 'unset',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 500,
                borderRadius: 5,
                background: memories.length === 0 ? '#f1f5f9' : '#fff',
                color: memories.length === 0 ? '#94a3b8' : '#dc2626',
                border: '1px solid #e5e7eb',
                cursor: memories.length === 0 ? 'default' : 'pointer',
              }}
            >
              모두 비우기
            </button>
          }
        >
          <MemoryList memories={memories} onDelete={handleDeleteMemory} />
        </Section>
      </div>
    </div>
  )
}

function Section(props: {
  title: string
  subtitle?: string
  headerRight?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 8,
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
            {props.title}
          </div>
          {props.subtitle && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {props.subtitle}
            </div>
          )}
        </div>
        {props.headerRight}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {props.children}
      </div>
    </div>
  )
}

function MemoryList(props: {
  memories: PetMemoryEntry[]
  onDelete: (idx: number) => void
}) {
  const reversed = useMemo(
    () => props.memories.map((m, i) => ({ ...m, originalIdx: i })).reverse(),
    [props.memories],
  )

  if (reversed.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: 12,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        아직 펫이 기억한 내용이 없어요.
        <br />
        펫과 대화하면 여기에 쌓여요.
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        paddingRight: 4,
      }}
    >
      {reversed.map((m) => (
        <div
          key={`${m.originalIdx}-${m.savedAt}`}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '8px 10px',
            background: '#f8fafc',
            border: '1px solid #eef2f7',
            borderRadius: 8,
          }}
        >
          <div style={{ flex: 1, fontSize: 12.5, color: '#1f2937', lineHeight: 1.5 }}>
            {m.text}
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
              {formatDate(m.savedAt)}
            </div>
          </div>
          <button
            onClick={() => props.onDelete(m.originalIdx)}
            aria-label="삭제"
            style={{
              all: 'unset',
              padding: '2px 6px',
              fontSize: 11,
              color: '#94a3b8',
              cursor: 'pointer',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#ef4444'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TitleBar(props: { onClose: () => void }) {
  return (
    <div
      data-tauri-drag-region
      style={{
        height: 32,
        flex: '0 0 32px',
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px 0 12px',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <span
        data-tauri-drag-region
        style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}
      >
        프로필 & 메모리
      </span>
      <button
        onClick={props.onClose}
        aria-label="닫기"
        style={{
          all: 'unset',
          width: 22,
          height: 22,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          color: '#6b7280',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = '#ef4444'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#fff'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#6b7280'
        }}
      >
        ×
      </button>
    </div>
  )
}
