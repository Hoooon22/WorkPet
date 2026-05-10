import { useEffect, useState } from 'react'
import { isFirebaseConfigured } from '../../shared/firebaseConfig'
import { ensureFirebaseAuth } from '../../shared/firebase'
import { getValue, setValue, KEYS } from '../../shared/storage'
import type { PetId } from '../../shared/types'
import Lobby from './Lobby'
import WalkBoard from './WalkBoard'

type Mode = 'loading' | 'config-missing' | 'lobby' | 'room' | 'error'

const COLOR_BG = '#f5f5f7'
const COLOR_FG = '#1f2937'

export default function TeamRoom() {
  const [mode, setMode] = useState<Mode>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [petId, setPetId] = useState<PetId>('pico')
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setMode('config-missing')
      return
    }
    ;(async () => {
      try {
        const user = await ensureFirebaseAuth()
        setDisplayName(user.displayName ?? user.email)
        const savedKind = (await getValue<PetId>(KEYS.PET_KIND)) ?? 'pico'
        setPetId(savedKind)
        const savedCode = await getValue<string>(KEYS.TEAM_ROOM_CODE)
        if (savedCode) {
          setRoomCode(savedCode)
          setMode('room')
        } else {
          setMode('lobby')
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setMode('error')
      }
    })()
  }, [])

  const handleEnter = (code: string) => {
    void setValue(KEYS.TEAM_ROOM_CODE, code)
    setRoomCode(code)
    setMode('room')
  }

  const handleLeave = () => {
    void setValue(KEYS.TEAM_ROOM_CODE, '')
    setRoomCode(null)
    setMode('lobby')
  }

  if (mode === 'loading') {
    return (
      <Shell>
        <div style={centeredText}>로그인 확인 중…</div>
      </Shell>
    )
  }

  if (mode === 'config-missing') {
    return (
      <Shell>
        <div style={{ padding: 24, color: COLOR_FG, lineHeight: 1.6 }}>
          <h2 style={{ margin: '0 0 12px' }}>Firebase 설정이 필요해요</h2>
          <p style={{ margin: 0, fontSize: 13 }}>
            프로젝트 루트에 <code>.env.local</code> 파일을 만들고 아래 값을 채워주세요.
            그런 다음 앱을 다시 실행해주세요.
          </p>
          <pre
            style={{
              marginTop: 12,
              background: '#1f2937',
              color: '#f9fafb',
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              overflow: 'auto',
            }}
          >{`VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=`}</pre>
        </div>
      </Shell>
    )
  }

  if (mode === 'error') {
    return (
      <Shell>
        <div style={{ padding: 24, color: '#b91c1c' }}>
          <h2 style={{ margin: '0 0 8px' }}>문제가 생겼어요</h2>
          <p style={{ margin: 0, fontSize: 13 }}>{errorMessage}</p>
        </div>
      </Shell>
    )
  }

  if (mode === 'lobby') {
    return (
      <Shell>
        <Lobby petId={petId} displayName={displayName} onEnter={handleEnter} />
      </Shell>
    )
  }

  return (
    <Shell>
      <WalkBoard
        roomCode={roomCode!}
        petId={petId}
        displayName={displayName}
        onLeave={handleLeave}
      />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        background: COLOR_BG,
        color: COLOR_FG,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

const centeredText: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  fontSize: 14,
  color: COLOR_FG,
}
