/**
 * popup/App.tsx
 * 익스텐션 팝업 UI — Google 계정 연결 + 펫 컨트롤
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'

type AuthStatus = 'checking' | 'signed-in' | 'signed-out'

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')
  const [loading, setLoading]       = useState(false)

  // Gemini API 키 설정
  const [geminiKey, setGeminiKey]       = useState('')
  const [geminiSaved, setGeminiSaved]   = useState(false)
  const [geminiExists, setGeminiExists] = useState(false)
  const geminiInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chrome.storage.local.get(['geminiApiKey'], ({ geminiApiKey }) => {
      if (geminiApiKey) {
        setGeminiExists(true)
        // 실제 키 값은 표시하지 않음 — 마스킹
        setGeminiKey('')
      }
    })
  }, [])

  const handleGeminiSave = useCallback(() => {
    const key = geminiKey.trim()
    if (!key) return
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      setGeminiExists(true)
      setGeminiKey('')
      setGeminiSaved(true)
      setTimeout(() => setGeminiSaved(false), 2500)
    })
  }, [geminiKey])

  const handleGeminiRemove = useCallback(() => {
    chrome.storage.local.remove('geminiApiKey', () => {
      setGeminiExists(false)
      setGeminiKey('')
    })
  }, [])

  // ---- 마운트: 인증 상태 확인 (storage 기반 — 캐시 오감지 방지) ----
  useEffect(() => {
    chrome.storage.local.get(['orbitSignedIn'], ({ orbitSignedIn }) => {
      if (orbitSignedIn === true) {
        setAuthStatus('signed-in')
      } else if (orbitSignedIn === false) {
        setAuthStatus('signed-out')
      } else {
        // 최초 설치 등 storage에 값이 없는 경우 — identity API로 초기화
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError || !token) {
            chrome.storage.local.set({ orbitSignedIn: false })
            setAuthStatus('signed-out')
          } else {
            chrome.storage.local.set({ orbitSignedIn: true })
            setAuthStatus('signed-in')
          }
        })
      }
    })
  }, [])

  // ---- 로그인 ----
  const handleSignIn = useCallback(() => {
    setLoading(true)
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      setLoading(false)
      if (chrome.runtime.lastError || !token) {
        console.warn('[Orbit] 로그인 실패:', chrome.runtime.lastError?.message)
        return
      }
      chrome.storage.local.set({ orbitSignedIn: true })
      setAuthStatus('signed-in')
      // 로그인 직후 즉시 Push 초기화 + 브리핑 요청
      chrome.runtime.sendMessage({ type: 'INIT_PUSH' }).catch(() => {})
      chrome.runtime.sendMessage({ type: 'FETCH_NOW' }).catch(() => {})
      // 펫 등장 + 인사 말풍선
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'LOGIN_GREETING' }).catch(() => {})
      })
    })
  }, [])

  // ---- 로그아웃 ----
  const handleSignOut = useCallback(() => {
    setLoading(true)
    chrome.storage.local.set({ orbitSignedIn: false })
    // 펫 작별 인사 후 퇴장 (탭에 직접 전송)
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'LOGOUT_FAREWELL' }).catch(() => {})
    })
    chrome.runtime.sendMessage({ type: 'SIGN_OUT' }, () => {
      setLoading(false)
      setAuthStatus('signed-out')
    })
  }, [])

  // ---- 펫 소환 / 퇴장 ----
  const handleShowPet = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PET' }).catch(() => {})
  }, [])

  const handleDismissPet = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'DISMISS_PET' }).catch(() => {})
  }, [])

  // ---- 뽑기 화면 ----
  const handleShowGacha = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'SHOW_GACHA' }).catch(() => {})
    window.close()
  }, [])

  return (
    <div style={{ padding: '16px', fontFamily: 'sans-serif', minWidth: '240px' }}>

      {/* ---- 헤더 ---- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #60a5fa, #2563eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px',
        }}>
          🤖
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#111827' }}>Work-Pet: Orbit</h1>
          <p style={{ margin: 0, fontSize: '11px', color: '#6b7280' }}>AI 펫 비서 v0.1.0</p>
        </div>
      </div>

      {/* ---- 뽑기 버튼 (로그인 상태에서만 표시) ---- */}
      {authStatus === 'signed-in' && (
        <motion.button
          onClick={handleShowGacha}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{
            all: 'unset',
            cursor: 'pointer',
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 0',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #f59e0b 100%)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '14px',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(124,58,237,0.45)',
            marginBottom: '14px',
            letterSpacing: '0.2px',
          }}
        >
          🎰 이번 주 파트너 뽑기!
        </motion.button>
      )}

      {/* ---- Google 계정 연결 ---- */}
      {authStatus === 'checking' && (
        <div style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '12px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#9ca3af',
        }}>
          확인 중…
        </div>
      )}

      {authStatus === 'signed-out' && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: '12px',
            padding: '12px 14px',
            marginBottom: '8px',
            fontSize: '12px',
            color: '#92400e',
          }}>
            Google 계정을 연결하면 Gmail과 캘린더 알림을 받을 수 있어요.
          </div>
          <motion.button
            onClick={handleSignIn}
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.02 }}
            whileTap={{ scale: loading ? 1 : 0.98 }}
            style={{
              all: 'unset', cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '8px', width: '100%', boxSizing: 'border-box',
              padding: '11px 0', borderRadius: '10px',
              background: loading ? '#e5e7eb' : 'linear-gradient(135deg, #4285f4, #1a73e8)',
              color: loading ? '#9ca3af' : '#fff',
              fontWeight: 700, fontSize: '13px',
              boxShadow: loading ? 'none' : '0 2px 8px rgba(66,133,244,0.35)',
            }}
          >
            {loading ? '연결 중…' : (
              <>
                <GoogleIcon />
                Google 계정으로 로그인
              </>
            )}
          </motion.button>
        </div>
      )}

      {authStatus === 'signed-in' && (
        <div style={{ marginBottom: '12px' }}>
          {/* 연결 상태 */}
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '10px 14px',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>✅</span>
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#166534' }}>Google 연결됨</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#16a34a' }}>Gmail · Calendar</p>
              </div>
            </div>
            <motion.button
              onClick={handleSignOut}
              disabled={loading}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              style={{
                all: 'unset', cursor: 'pointer',
                padding: '5px 12px', borderRadius: '6px',
                background: '#fee2e2', color: '#b91c1c',
                fontSize: '11px', fontWeight: 600,
              }}
            >
              로그아웃
            </motion.button>
          </div>


          {/* Monday 연동 — 준비 중 */}
          <div style={{
            background: '#f8faff',
            border: '1px solid #e0e7ff',
            borderRadius: '10px',
            padding: '10px 14px',
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>📋</span>
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#3730a3' }}>Monday.com 연동</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#6366f1' }}>태스크 · 마감일 알림</p>
              </div>
            </div>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: '#6366f1',
              background: '#e0e7ff',
              padding: '3px 8px',
              borderRadius: '999px',
            }}>
              준비 중
            </span>
          </div>
        </div>
      )}

      {/* ---- 펫 컨트롤 (로그인 상태에서만 표시) ---- */}
      {authStatus === 'signed-in' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <motion.button
            onClick={handleShowPet}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            style={{
              all: 'unset', cursor: 'pointer', flex: 1,
              padding: '9px 0', borderRadius: '10px',
              background: '#eff6ff', color: '#2563eb',
              fontWeight: 600, fontSize: '12px', textAlign: 'center',
              border: '1px solid #bfdbfe',
            }}
          >
            👋 펫 소환
          </motion.button>
          <motion.button
            onClick={handleDismissPet}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            style={{
              all: 'unset', cursor: 'pointer', flex: 1,
              padding: '9px 0', borderRadius: '10px',
              background: '#f3f4f6', color: '#6b7280',
              fontWeight: 600, fontSize: '12px', textAlign: 'center',
              border: '1px solid #e5e7eb',
            }}
          >
            💤 펫 퇴장
          </motion.button>
        </div>
      )}

      {/* ---- Gemini API 키 설정 (로그인 상태에서만 표시) ---- */}
      {authStatus === 'signed-in' && <div
        style={{
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
          borderRadius: '12px',
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>✨</span>
            <div>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#5b21b6' }}>Gemini AI 설정</p>
              <p style={{ margin: 0, fontSize: '10px', color: '#7c3aed' }}>번역 · 페이지 요약에 사용</p>
            </div>
          </div>
          {geminiExists && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>✅ 설정됨</span>
              <motion.button
                onClick={handleGeminiRemove}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '2px 8px', borderRadius: '5px',
                  background: '#fee2e2', color: '#b91c1c',
                  fontSize: '10px', fontWeight: 600,
                }}
              >
                삭제
              </motion.button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            ref={geminiInputRef}
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGeminiSave()}
            placeholder={geminiExists ? '새 API 키로 교체하려면 입력…' : 'AI Studio API 키 입력…'}
            style={{
              flex: 1,
              border: '1px solid #ddd6fe',
              borderRadius: '7px',
              padding: '7px 9px',
              fontSize: '11px',
              fontFamily: 'sans-serif',
              color: '#3b0764',
              background: '#fff',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <motion.button
            onClick={handleGeminiSave}
            disabled={!geminiKey.trim()}
            whileHover={{ scale: geminiKey.trim() ? 1.04 : 1 }}
            whileTap={{ scale: geminiKey.trim() ? 0.96 : 1 }}
            style={{
              all: 'unset',
              cursor: geminiKey.trim() ? 'pointer' : 'default',
              background: geminiKey.trim() ? '#7c3aed' : '#ede9fe',
              color: geminiKey.trim() ? '#fff' : '#a78bfa',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'sans-serif',
              padding: '7px 12px',
              borderRadius: '7px',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
          >
            저장
          </motion.button>
        </div>

        {geminiSaved && (
          <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
            API 키가 저장됐어요! 번역·요약 기능을 사용할 수 있어요.
          </p>
        )}

        {!geminiExists && !geminiSaved && (
          <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#9ca3af', lineHeight: 1.5 }}>
            Google AI Studio에서 무료 API 키를 발급받을 수 있어요.
          </p>
        )}
      </div>}

    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#fff" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" />
    </svg>
  )
}
