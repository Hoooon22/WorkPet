import { useState } from 'react'
import { createRoom, isValidRoomCode, joinRoom, roomExists } from '../../shared/teamRoom'
import type { PetId } from '../../shared/types'

interface LobbyProps {
  petId: PetId
  displayName: string | null
  onEnter: (code: string) => void
}

export default function Lobby({ petId, displayName, onEnter }: LobbyProps) {
  const [codeInput, setCodeInput] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (busy) return
    setBusy('create')
    setError(null)
    try {
      const code = await createRoom()
      await joinRoom(code, petId, displayName)
      onEnter(code)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  async function handleJoin() {
    if (busy) return
    const code = codeInput.trim().toUpperCase()
    if (!isValidRoomCode(code)) {
      setError('코드는 6자리 영문/숫자입니다')
      return
    }
    setBusy('join')
    setError(null)
    try {
      const exists = await roomExists(code)
      if (!exists) {
        setError('해당 코드의 룸이 없어요')
        setBusy(null)
        return
      }
      await joinRoom(code, petId, displayName)
      onEnter(code)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 32,
        gap: 24,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>팀 펫 룸</h1>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6b7280' }}>
          팀원들의 펫과 함께 한 화면에서 산책해요
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, width: '100%', maxWidth: 520 }}>
        <Card>
          <h3 style={cardTitle}>새 룸 만들기</h3>
          <p style={cardDesc}>6자리 코드를 만들어 팀에 공유하세요</p>
          <button
            onClick={handleCreate}
            disabled={busy !== null}
            style={primaryButton(busy === 'create')}
          >
            {busy === 'create' ? '만드는 중…' : '코드 만들기'}
          </button>
        </Card>

        <Card>
          <h3 style={cardTitle}>코드로 입장</h3>
          <p style={cardDesc}>팀원이 공유한 코드를 입력하세요</p>
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABCD23"
            maxLength={6}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 16,
              letterSpacing: 4,
              textAlign: 'center',
              marginBottom: 8,
              boxSizing: 'border-box',
            }}
          />
          <button
            onClick={handleJoin}
            disabled={busy !== null || codeInput.length !== 6}
            style={primaryButton(busy === 'join', codeInput.length !== 6)}
          >
            {busy === 'join' ? '입장 중…' : '입장하기'}
          </button>
        </Card>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: '#b91c1c' }}>{error}</div>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        background: '#fff',
        borderRadius: 12,
        padding: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {children}
    </div>
  )
}

const cardTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
}
const cardDesc: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 12,
  color: '#6b7280',
  lineHeight: 1.5,
}
function primaryButton(loading: boolean, disabled = false): React.CSSProperties {
  return {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: loading || disabled ? '#9ca3af' : '#2563eb',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: loading || disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
  }
}
