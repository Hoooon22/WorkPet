/**
 * TranslatePanel.tsx
 * 선택 텍스트 또는 직접 입력 텍스트를 Gemini AI로 번역하는 패널
 * UI: 소스 언어 → 타깃 언어 방향 선택
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { GeminiResponse } from '../../types/messages'

const LANGUAGES = [
  { code: '한국어',   flag: '🇰🇷', label: '한국어' },
  { code: 'English',  flag: '🇺🇸', label: 'English' },
  { code: '日本語',   flag: '🇯🇵', label: '日本語' },
  { code: '中文',     flag: '🇨🇳', label: '中文' },
  { code: 'Español',  flag: '🇪🇸', label: 'Español' },
  { code: 'Français', flag: '🇫🇷', label: 'Français' },
  { code: 'Deutsch',  flag: '🇩🇪', label: 'Deutsch' },
]

const COOLDOWN_SEC = 60

const selectStyle: React.CSSProperties = {
  flex: 1,
  border: '1px solid #bfdbfe',
  borderRadius: '7px',
  padding: '6px 8px',
  fontSize: '12px',
  fontFamily: 'sans-serif',
  color: '#1d4ed8',
  background: '#fff',
  outline: 'none',
  cursor: 'pointer',
  minWidth: 0,
}

export default function TranslatePanel() {
  const [inputText, setInputText]   = useState(() => window.getSelection()?.toString().trim() ?? '')
  const [sourceLang, setSourceLang] = useState('한국어')
  const [targetLang, setTargetLang] = useState('English')
  const [result, setResult]         = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const [cooldown, setCooldown]     = useState(0)  // 남은 쿨다운 초
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const cooldownRef  = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 60)
  }, [])

  // 쿨다운 카운터
  const startCooldown = useCallback(() => {
    setCooldown(COOLDOWN_SEC)
    clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => () => clearInterval(cooldownRef.current), [])

  const handleSwap = () => {
    setSourceLang(targetLang)
    setTargetLang(sourceLang)
    setResult(null)
    setError(null)
  }

  const handleTranslate = async () => {
    const text = inputText.trim()
    if (!text || loading || cooldown > 0) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_TEXT',
        text,
        sourceLang,
        targetLang,
      }) as GeminiResponse
      if (res.error) {
        setError(res.error)
        if (res.error === 'RATE_LIMIT') startCooldown()
      } else {
        setResult(res.result)
      }
    } catch {
      setError('번역 요청에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (result) navigator.clipboard.writeText(result).catch(() => {})
  }

  const isDisabled = loading || cooldown > 0 || !inputText.trim()

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{ overflow: 'hidden' }}
    >
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '10px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* 언어 방향 선택 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select
            value={sourceLang}
            onChange={(e) => { setSourceLang(e.target.value); setResult(null); setError(null) }}
            style={selectStyle}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
            ))}
          </select>

          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9, rotate: 180 }}
            onClick={handleSwap}
            title="언어 교환"
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontSize: '16px',
              flexShrink: 0,
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            ⇄
          </motion.button>

          <select
            value={targetLang}
            onChange={(e) => { setTargetLang(e.target.value); setResult(null); setError(null) }}
            style={selectStyle}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
            ))}
          </select>
        </div>

        {/* 입력 영역 */}
        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleTranslate()
          }}
          placeholder="번역할 텍스트를 입력하세요… (Ctrl+Enter로 번역)"
          rows={3}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            border: '1px solid #bfdbfe',
            borderRadius: '7px',
            padding: '7px 9px',
            fontSize: '11px',
            fontFamily: 'sans-serif',
            color: '#1e3a5f',
            background: '#fff',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />

        {/* 번역 버튼 */}
        <motion.button
          whileHover={{ scale: isDisabled ? 1 : 1.02 }}
          whileTap={{ scale: isDisabled ? 1 : 0.97 }}
          onClick={handleTranslate}
          disabled={isDisabled}
          style={{
            all: 'unset',
            cursor: isDisabled ? 'default' : 'pointer',
            background: isDisabled ? '#e0e7ff' : '#1d4ed8',
            color: isDisabled ? '#93c5fd' : '#fff',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'sans-serif',
            padding: '7px 0',
            borderRadius: '7px',
            textAlign: 'center',
            transition: 'background 0.15s',
          }}
        >
          {loading
            ? '번역 중…'
            : cooldown > 0
              ? `⏳ ${cooldown}초 후 재시도 가능`
              : '🌐 번역하기'}
        </motion.button>

        {/* 결과 */}
        {result && (
          <div
            style={{
              background: '#fff',
              border: '1px solid #bfdbfe',
              borderRadius: '7px',
              padding: '8px 10px',
              position: 'relative',
            }}
          >
            <p
              style={{
                margin: '0 0 4px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#3b82f6',
                fontFamily: 'sans-serif',
              }}
            >
              {LANGUAGES.find(l => l.code === sourceLang)?.flag} {sourceLang} → {LANGUAGES.find(l => l.code === targetLang)?.flag} {targetLang}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                color: '#1e3a5f',
                fontFamily: 'sans-serif',
                lineHeight: 1.6,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                paddingRight: '28px',
              }}
            >
              {result}
            </p>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleCopy}
              title="복사"
              style={{
                all: 'unset',
                cursor: 'pointer',
                position: 'absolute',
                top: '8px',
                right: '8px',
                fontSize: '14px',
              }}
            >
              📋
            </motion.button>
          </div>
        )}

        {/* 오류 */}
        {error && (
          <p
            style={{
              margin: 0,
              fontSize: '10px',
              color: '#dc2626',
              fontFamily: 'sans-serif',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '6px 8px',
              lineHeight: 1.5,
            }}
          >
            {error === 'NO_API_KEY'      ? 'Gemini API 키가 설정되지 않았어요. 팝업에서 API 키를 입력해 주세요.'
           : error === 'RATE_LIMIT'      ? `요청 한도 초과 (429). ${cooldown > 0 ? `${cooldown}초 후 자동 해제돼요.` : '잠시 후 다시 시도해 주세요.'}`
           : error === 'INVALID_API_KEY' ? 'API 키가 올바르지 않아요 (403). 팝업에서 키를 다시 확인해 주세요.'
           : error === 'MODEL_NOT_FOUND' ? '모델을 찾을 수 없어요 (404). API 키가 해당 모델을 지원하는지 확인해 주세요.'
           : error === 'INVALID_REQUEST' ? '요청 형식 오류 (400). 텍스트를 확인해 주세요.'
           : `오류: ${error}`}
          </p>
        )}
      </div>
    </motion.div>
  )
}
