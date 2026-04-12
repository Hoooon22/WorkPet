/**
 * SummarizePanel.tsx
 * 현재 페이지 본문을 Gemini AI로 요약하는 패널
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { GeminiResponse } from '../../types/messages'

// 페이지 본문 텍스트 추출 (광고·네비게이션 제외, 최대 8000자)
function extractPageText(): string {
  const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'NAV', 'HEADER', 'FOOTER', 'ASIDE'])
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (skipTags.has(el.tagName)) return ''
      return Array.from(node.childNodes).map(walk).join(' ')
    }
    return ''
  }
  const raw = walk(document.body)
  return raw.replace(/\s+/g, ' ').trim().slice(0, 8000)
}

const COOLDOWN_SEC = 60


export default function SummarizePanel() {
  const [result, setResult]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [charCount] = useState(() => extractPageText().length)
  const cooldownRef = useRef<ReturnType<typeof setInterval>>()

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

  const handleSummarize = async () => {
    if (loading || cooldown > 0) return
    const pageText = extractPageText()
    if (!pageText) {
      setError('페이지에서 읽을 수 있는 텍스트가 없어요.')
      return
    }
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'SUMMARIZE_PAGE',
        pageText,
      }) as GeminiResponse
      if (res.error) {
        setError(res.error)
        if (res.error === 'RATE_LIMIT') startCooldown()
      } else {
        setResult(res.result)
      }
    } catch {
      setError('요약 요청에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (result) navigator.clipboard.writeText(result).catch(() => {})
  }

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
          background: '#f5f3ff',
          border: '1px solid #ddd6fe',
          borderRadius: '10px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* 페이지 정보 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 600,
                color: '#5b21b6',
                fontFamily: 'sans-serif',
              }}
            >
              현재 페이지 요약
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: '10px',
                color: '#7c3aed',
                fontFamily: 'sans-serif',
              }}
            >
              {charCount.toLocaleString()}자 감지됨
            </p>
          </div>
          <motion.button
            whileHover={{ scale: (loading || cooldown > 0) ? 1 : 1.04 }}
            whileTap={{ scale: (loading || cooldown > 0) ? 1 : 0.96 }}
            onClick={handleSummarize}
            disabled={loading || cooldown > 0}
            style={{
              all: 'unset',
              cursor: (loading || cooldown > 0) ? 'default' : 'pointer',
              background: (loading || cooldown > 0) ? '#ede9fe' : '#7c3aed',
              color: (loading || cooldown > 0) ? '#a78bfa' : '#fff',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'sans-serif',
              padding: '6px 14px',
              borderRadius: '7px',
              transition: 'background 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '요약 중…' : cooldown > 0 ? `⏳ ${cooldown}초` : '📝 요약하기'}
          </motion.button>
        </div>

        {/* 로딩 인디케이터 */}
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              background: '#fff',
              border: '1px solid #ddd6fe',
              borderRadius: '7px',
            }}
          >
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-block', fontSize: '14px' }}
            >
              ✨
            </motion.span>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                color: '#7c3aed',
                fontFamily: 'sans-serif',
              }}
            >
              Gemini AI가 페이지를 읽고 있어요…
            </p>
          </div>
        )}

        {/* 결과 */}
        {result && !loading && (
          <div
            style={{
              background: '#fff',
              border: '1px solid #ddd6fe',
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
                color: '#7c3aed',
                fontFamily: 'sans-serif',
              }}
            >
              AI 요약 결과
            </p>
            <p
              style={{
                margin: 0,
                fontSize: '11px',
                color: '#3b0764',
                fontFamily: 'sans-serif',
                lineHeight: 1.7,
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
           : error === 'INVALID_REQUEST' ? '요청 형식 오류 (400).'
           : `오류: ${error}`}
          </p>
        )}
      </div>
    </motion.div>
  )
}
