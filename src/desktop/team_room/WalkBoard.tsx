import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import PetSprite from '../components/PetSprite'
import { KEYS, subscribeStorage } from '../../shared/storage'
import { ensureFirebaseAuth } from '../../shared/firebase'
import {
  isStale,
  leaveRoom,
  publishMemberState,
  subscribeMembers,
  TeamMember,
  MemberStatus,
} from '../../shared/teamRoom'
import type { PetId } from '../../shared/types'

interface WalkBoardProps {
  roomCode: string
  petId: PetId
  displayName: string | null
  onLeave: () => void
}

const CANVAS_HEIGHT = 280
const PET_SIZE = 96
const STATUS_HEARTBEAT_MS = 10_000
const POSITION_PUBLISH_MS = 3_000
const IDLE_POLL_MS = 15_000
const IDLE_THRESHOLD_S = 300

export default function WalkBoard({ roomCode, petId, displayName, onLeave }: WalkBoardProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [myUid, setMyUid] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState(false)

  const xRef = useRef<number>(Math.random())
  const dirRef = useRef<1 | -1>(Math.random() > 0.5 ? 1 : -1)
  const statusRef = useRef<MemberStatus>('walking')
  const lastPublishedStatusRef = useRef<MemberStatus | null>(null)
  const lastPublishedXRef = useRef<number>(-1)
  const focusPhaseRef = useRef<string>('idle')
  const idleSecondsRef = useRef<number>(0)

  // Initial auth + member subscription
  useEffect(() => {
    let unsub: (() => void) | null = null
    ;(async () => {
      const user = await ensureFirebaseAuth()
      setMyUid(user.uid)
      unsub = subscribeMembers(roomCode, setMembers)
    })()
    return () => {
      if (unsub) unsub()
    }
  }, [roomCode])

  // Compute & publish status (focus > sleeping > walking)
  function computeStatus(): MemberStatus {
    if (focusPhaseRef.current === 'running') return 'focus'
    if (idleSecondsRef.current > IDLE_THRESHOLD_S) return 'sleeping'
    return 'walking'
  }

  async function publishStatusIfChanged() {
    const next = computeStatus()
    statusRef.current = next
    if (lastPublishedStatusRef.current !== next) {
      lastPublishedStatusRef.current = next
      try {
        await publishMemberState(roomCode, { status: next, petId })
      } catch (err) {
        console.warn('[teamroom] publish status failed', err)
      }
    }
  }

  // Subscribe to focus phase (mirrored by main pet window)
  useEffect(() => {
    let unsub: (() => void) | null = null
    ;(async () => {
      unsub = await subscribeStorage<string>(KEYS.FOCUS_TIMER_PHASE, (val) => {
        focusPhaseRef.current = val ?? 'idle'
        void publishStatusIfChanged()
      })
    })()
    return () => {
      if (unsub) unsub()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, petId])

  // Idle polling
  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const sec = await invoke<number>('get_idle_seconds')
        if (cancelled) return
        idleSecondsRef.current = sec
        void publishStatusIfChanged()
      } catch {
        // noop
      }
    }
    void tick()
    const t = setInterval(tick, IDLE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, petId])

  // Heartbeat (force publish even if status unchanged, to keep lastSeenAt fresh)
  useEffect(() => {
    const t = setInterval(() => {
      void publishMemberState(roomCode, {
        status: statusRef.current,
        petId,
        x: xRef.current,
      }).catch(() => {})
    }, STATUS_HEARTBEAT_MS)
    return () => clearInterval(t)
  }, [roomCode, petId])

  // Wander: move x slowly, publish at most every 3s
  useEffect(() => {
    const t = setInterval(() => {
      // Only wander when actively walking
      if (statusRef.current !== 'walking') return
      const step = 0.02 + Math.random() * 0.03
      let next = xRef.current + dirRef.current * step
      if (next < 0.04) {
        next = 0.04
        dirRef.current = 1
      } else if (next > 0.96) {
        next = 0.96
        dirRef.current = -1
      } else if (Math.random() < 0.05) {
        dirRef.current = (dirRef.current === 1 ? -1 : 1) as 1 | -1
      }
      xRef.current = next
    }, 1500)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      if (Math.abs(xRef.current - lastPublishedXRef.current) < 0.02) return
      lastPublishedXRef.current = xRef.current
      void publishMemberState(roomCode, { x: xRef.current }).catch(() => {})
    }, POSITION_PUBLISH_MS)
    return () => clearInterval(t)
  }, [roomCode])

  // Leave on close (fire-and-forget so the close doesn't get blocked)
  useEffect(() => {
    let unlisten: (() => void) | null = null
    ;(async () => {
      const win = getCurrentWebviewWindow()
      const off = await win.onCloseRequested(() => {
        void leaveRoom(roomCode).catch(() => {})
      })
      unlisten = off
    })()
    return () => {
      if (unlisten) unlisten()
    }
  }, [roomCode])

  async function handleLeaveClick() {
    try {
      await leaveRoom(roomCode)
    } catch {
      // noop
    }
    onLeave()
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopyHint(true)
      setTimeout(() => setCopyHint(false), 1500)
    } catch {
      // noop
    }
  }

  const visibleMembers = members.filter((m) => !isStale(m))
  const me = visibleMembers.find((m) => m.uid === myUid)
  const others = visibleMembers.filter((m) => m.uid !== myUid)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>룸 코드</span>
          <button
            onClick={handleCopyCode}
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: 4,
              padding: '4px 10px',
              borderRadius: 6,
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              cursor: 'pointer',
              color: '#1f2937',
            }}
            title="클릭하여 복사"
          >
            {roomCode}
          </button>
          {copyHint && <span style={{ fontSize: 12, color: '#16a34a' }}>복사됨!</span>}
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            · {visibleMembers.length}명
          </span>
        </div>
        <button
          onClick={handleLeaveClick}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            background: '#fff',
            border: '1px solid #d1d5db',
            cursor: 'pointer',
            fontSize: 13,
            color: '#1f2937',
          }}
        >
          나가기
        </button>
      </div>

      {/* Walking canvas */}
      <div
        style={{
          flex: 1,
          background:
            'linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 50%, #fef3c7 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: CANVAS_HEIGHT,
            background: 'linear-gradient(180deg, transparent 0%, #fef3c7 60%, #fde68a 100%)',
          }}
        />
        {/* Ground line */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 60,
            height: 2,
            background: '#d97706',
            opacity: 0.2,
          }}
        />

        {visibleMembers.map((m) => (
          <PetSlot key={m.uid} member={m} isMe={m.uid === myUid} />
        ))}

        {visibleMembers.length === 0 && (
          <div
            style={{
              position: 'absolute',
              top: '40%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: 14,
              color: '#6b7280',
            }}
          >
            펫을 불러오는 중…
          </div>
        )}
      </div>

      {/* Footer / member list */}
      <div
        style={{
          padding: '8px 16px',
          background: '#fff',
          borderTop: '1px solid #e5e7eb',
          fontSize: 12,
          color: '#6b7280',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {me && <MemberBadge member={me} you />}
        {others.map((m) => (
          <MemberBadge key={m.uid} member={m} />
        ))}
      </div>
    </div>
  )
}

function PetSlot({ member, isMe }: { member: TeamMember; isMe: boolean }) {
  const left = `calc(${member.x * 100}% - ${PET_SIZE / 2}px)`
  const focusAura = member.status === 'focus'
  const sleeping = member.status === 'sleeping'

  return (
    <div
      style={{
        position: 'absolute',
        left,
        bottom: 40,
        transition: 'left 1.4s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <div style={{ fontSize: 11, color: '#1f2937', fontWeight: isMe ? 700 : 500 }}>
        {member.displayName ?? member.email ?? '익명'}
        {isMe && ' (나)'}
      </div>
      <div
        style={{
          position: 'relative',
          borderRadius: '50%',
          boxShadow: focusAura
            ? '0 0 0 4px rgba(239,68,68,0.55), 0 0 24px rgba(239,68,68,0.4)'
            : 'none',
        }}
      >
        <PetSprite
          kind={member.petId}
          size={PET_SIZE}
          walking={member.status === 'walking'}
          paused={sleeping}
        />
        {sleeping && (
          <div
            style={{
              position: 'absolute',
              top: -6,
              right: -4,
              fontSize: 18,
              fontWeight: 700,
              color: '#6366f1',
              textShadow: '0 1px 2px rgba(255,255,255,0.9)',
            }}
          >
            Z
          </div>
        )}
      </div>
    </div>
  )
}

function MemberBadge({ member, you = false }: { member: TeamMember; you?: boolean }) {
  const label =
    member.status === 'focus' ? '🔴 집중' : member.status === 'sleeping' ? '💤 자리비움' : '🚶 산책'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <strong style={{ color: '#1f2937', fontWeight: you ? 700 : 500 }}>
        {member.displayName ?? member.email ?? '익명'}
      </strong>
      <span>· {label}</span>
    </span>
  )
}
