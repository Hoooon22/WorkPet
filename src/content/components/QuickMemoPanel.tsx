/**
 * QuickMemoPanel.tsx
 * 빠른 메모 패널 — chrome.storage.local에 자동저장
 * 창을 닫아도 내용이 유지된다.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STORAGE_KEY = 'quickMemo'
const MAX_CHARS = 500
const DEBOUNCE_MS = 500

export default function QuickMemoPanel() {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>()

  // 마운트 시 storage에서 복원
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY]
      if (typeof stored === 'string') setText(stored)
      setLoaded(true)
    })
  }, [])

  // 저장 함수 (디바운스)
  const scheduleSave = useCallback((value: string) => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      chrome.storage.local.set({ [STORAGE_KEY]: value })
      setSaved(true)
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaved(false), 1500)
    }, DEBOUNCE_MS)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    if (value.length > MAX_CHARS) return
    setText(value)
    scheduleSave(value)
  }

  const handleClear = () => {
    clearTimeout(debounceRef.current)
    setText('')
    chrome.storage.local.set({ [STORAGE_KEY]: '' })
    setSaved(true)
    clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), 1500)
  }

  if (!loaded) return null

  return (
    <motion.div
      key="memo-panel"
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '10px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
      }}>
        {/* 제목 + 상태 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#15803d',
            fontFamily: 'sans-serif',
          }}>
            📌 빠른 메모
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AnimatePresence>
              {saved && (
                <motion.span
                  key="saved-badge"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#16a34a',
                    fontFamily: 'sans-serif',
                  }}
                >
                  ✓ 저장됨
                </motion.span>
              )}
            </AnimatePresence>
            <span style={{
              fontSize: '10px',
              color: text.length >= MAX_CHARS * 0.9 ? '#ef4444' : '#9ca3af',
              fontFamily: 'sans-serif',
            }}>
              {text.length}/{MAX_CHARS}
            </span>
          </div>
        </div>

        {/* 텍스트 영역 */}
        <textarea
          value={text}
          onChange={handleChange}
          placeholder="여기에 메모를 입력하세요..."
          rows={4}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'none',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
            padding: '8px 10px',
            fontSize: '12px',
            fontFamily: 'sans-serif',
            lineHeight: 1.5,
            color: '#166534',
            background: '#ffffff',
            outline: 'none',
            overflowY: 'auto',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#4ade80'
            e.currentTarget.style.boxShadow = '0 0 0 2px rgba(74,222,128,0.2)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#bbf7d0'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />

        {/* 지우기 버튼 */}
        {text.length > 0 && (
          <motion.button
            onClick={handleClear}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'sans-serif',
              color: '#6b7280',
              padding: '4px 0',
              borderRadius: '6px',
              background: '#e5e7eb',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#d1d5db' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#e5e7eb' }}
          >
            🗑️ 메모 지우기
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
