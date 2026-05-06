import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { getValue, setValue, deleteValue, KEYS } from '../../../shared/storage'

interface Props {
  signedIn: boolean
  email: string | null
  action: (type: string, payload?: unknown) => void
}

export default function SettingsTab({ signedIn, email, action }: Props) {
  const [geminiKey, setGeminiKey] = useState('')
  const [geminiExists, setGeminiExists] = useState(false)
  const [geminiSaved, setGeminiSaved] = useState(false)

  useEffect(() => {
    ;(async () => {
      const k = await getValue<string>(KEYS.GEMINI_API_KEY)
      setGeminiExists(!!k)
    })()
  }, [])

  const saveGemini = async () => {
    const trimmed = geminiKey.trim()
    if (!trimmed) return
    await setValue(KEYS.GEMINI_API_KEY, trimmed)
    setGeminiExists(true)
    setGeminiKey('')
    setGeminiSaved(true)
    setTimeout(() => setGeminiSaved(false), 2500)
  }

  const removeGemini = async () => {
    await deleteValue(KEYS.GEMINI_API_KEY)
    setGeminiExists(false)
  }

  return (
    <div style={{ padding: 14 }}>
      {/* Auth */}
      <div
        style={{
          background: signedIn ? '#f0fdf4' : '#fff7ed',
          border: signedIn ? '1px solid #bbf7d0' : '1px solid #fed7aa',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 12,
        }}
      >
        {signedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#166534' }}>
                ✅ Google 연결됨
              </p>
              {email && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: '#16a34a',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {email}
                </p>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => action('sign-out')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 6,
                background: '#fee2e2',
                color: '#b91c1c',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              로그아웃
            </motion.button>
          </div>
        ) : (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#92400e' }}>
              Google 계정을 연결하면 Gmail과 캘린더 알림을 받을 수 있어요.
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => action('sign-in')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 0',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #4285f4, #1a73e8)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              Google 계정으로 로그인
            </motion.button>
          </div>
        )}
      </div>

      {/* Gemini */}
      <div
        style={{
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>
            ✨ Gemini AI 설정
          </p>
          {geminiExists && (
            <button
              onClick={removeGemini}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '2px 8px',
                borderRadius: 5,
                background: '#fee2e2',
                color: '#b91c1c',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              삭제
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveGemini()}
            placeholder={geminiExists ? '새 API 키로 교체…' : 'AI Studio API 키…'}
            style={{
              flex: 1,
              border: '1px solid #ddd6fe',
              borderRadius: 7,
              padding: '6px 9px',
              fontSize: 11,
              color: '#3b0764',
              background: '#fff',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button
            onClick={saveGemini}
            disabled={!geminiKey.trim()}
            style={{
              all: 'unset',
              cursor: geminiKey.trim() ? 'pointer' : 'default',
              background: geminiKey.trim() ? '#7c3aed' : '#ede9fe',
              color: geminiKey.trim() ? '#fff' : '#a78bfa',
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 7,
            }}
          >
            저장
          </button>
        </div>
        {geminiSaved && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
            저장됐어요!
          </p>
        )}
      </div>

      {/* Pet controls */}
      {signedIn && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => action('show-pet')}
            style={{
              all: 'unset',
              flex: 1,
              cursor: 'pointer',
              padding: '9px 0',
              borderRadius: 10,
              background: '#eff6ff',
              color: '#2563eb',
              fontWeight: 600,
              fontSize: 12,
              textAlign: 'center',
              border: '1px solid #bfdbfe',
            }}
          >
            👋 펫 소환
          </button>
          <button
            onClick={() => action('dismiss-pet')}
            style={{
              all: 'unset',
              flex: 1,
              cursor: 'pointer',
              padding: '9px 0',
              borderRadius: 10,
              background: '#f3f4f6',
              color: '#6b7280',
              fontWeight: 600,
              fontSize: 12,
              textAlign: 'center',
              border: '1px solid #e5e7eb',
            }}
          >
            💤 펫 퇴장
          </button>
        </div>
      )}
    </div>
  )
}
