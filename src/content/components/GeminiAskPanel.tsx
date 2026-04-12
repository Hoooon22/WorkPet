/**
 * GeminiAskPanel.tsx
 * Gemini AI에게 간단한 질문을 하고 짧은 답변을 받는 패널
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { GeminiResponse } from '../../types/messages'

const COOLDOWN_SEC = 30

export default function GeminiAskPanel() {
  const [question, setQuestion]   = useState('')
  const [result, setResult]       = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [cooldown, setCooldown]   = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cooldownRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 60)
  }, [])

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

  const handleAsk = async () => {
    const q = question.trim()
    if (!q || loading || cooldown > 0) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'ASK_GEMINI',
        question: q,
      }) as GeminiResponse
      if (res.error) {
        setError(res.error)
        if (res.error === 'RATE_LIMIT') startCooldown()
      } else {
        setResult(res.result)
      }
    } catch {
      setError('요청에 실패했어요.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (result) navigator.clipboard.writeText(result).catch(() => {})
  }

  const isDisabled = loading || cooldown > 0 || !question.trim()

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
          background: '#fdf4ff',
          border: '1px solid #e9d5ff',
          borderRadius: '10px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {/* 헤더 */}
        <p style={{
          margin: 0,
          fontSize: '11px',
          fontWeight: 600,
          color: '#7e22ce',
          fontFamily: 'sans-serif',
        }}>
          ✨ Gemini에게 질문하기
        </p>

        {/* 입력 영역 */}
        <textarea
          ref={textareaRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAsk()
          }}
          placeholder="궁금한 것을 물어보세요… (Ctrl+Enter로 전송)"
          rows={3}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            border: '1px solid #e9d5ff',
            borderRadius: '7px',
            padding: '7px 9px',
            fontSize: '11px',
            fontFamily: 'sans-serif',
            color: '#3b0764',
            background: '#fff',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />

        {/* 전송 버튼 */}
        <motion.button
          whileHover={{ scale: isDisabled ? 1 : 1.02 }}
          whileTap={{ scale: isDisabled ? 1 : 0.97 }}
          onClick={handleAsk}
          disabled={isDisabled}
          style={{
            all: 'unset',
            cursor: isDisabled ? 'default' : 'pointer',
            background: isDisabled ? '#ede9fe' : 'linear-gradient(135deg, #9333ea 0%, #7e22ce 100%)',
            color: isDisabled ? '#a78bfa' : '#fff',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: 'sans-serif',
            padding: '7px 0',
            borderRadius: '7px',
            textAlign: 'center',
            transition: 'background 0.15s',
            boxShadow: isDisabled ? 'none' : '0 2px 8px rgba(147,51,234,0.3)',
          }}
        >
          {loading
            ? '생각 중…'
            : cooldown > 0
              ? `⏳ ${cooldown}초 후 재시도 가능`
              : '✨ 질문하기'}
        </motion.button>

        {/* 로딩 인디케이터 */}
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 10px',
            background: '#fff',
            border: '1px solid #e9d5ff',
            borderRadius: '7px',
          }}>
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'inline-block', fontSize: '14px' }}
            >
              ✨
            </motion.span>
            <p style={{ margin: 0, fontSize: '11px', color: '#9333ea', fontFamily: 'sans-serif' }}>
              Gemini AI가 답변을 준비 중이에요…
            </p>
          </div>
        )}

        {/* 결과 */}
        {result && !loading && (
          <div style={{
            background: '#fff',
            border: '1px solid #e9d5ff',
            borderRadius: '7px',
            padding: '8px 10px',
            position: 'relative',
          }}>
            <p style={{
              margin: '0 0 4px',
              fontSize: '10px',
              fontWeight: 600,
              color: '#9333ea',
              fontFamily: 'sans-serif',
            }}>
              ✨ Gemini 답변
            </p>
            <p style={{
              margin: 0,
              fontSize: '11px',
              color: '#3b0764',
              fontFamily: 'sans-serif',
              lineHeight: 1.7,
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              paddingRight: '28px',
            }}>
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
          <p style={{
            margin: 0,
            fontSize: '10px',
            color: '#dc2626',
            fontFamily: 'sans-serif',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            padding: '6px 8px',
            lineHeight: 1.5,
          }}>
            {error === 'NO_API_KEY'      ? 'Gemini API 키가 설정되지 않았어요. 팝업에서 API 키를 입력해 주세요.'
           : error === 'RATE_LIMIT'      ? `요청 한도 초과 (429). ${cooldown > 0 ? `${cooldown}초 후 자동 해제돼요.` : '잠시 후 다시 시도해 주세요.'}`
           : error === 'INVALID_API_KEY' ? 'API 키가 올바르지 않아요 (403). 팝업에서 키를 다시 확인해 주세요.'
           : error === 'MODEL_NOT_FOUND' ? '모델을 찾을 수 없어요 (404).'
           : error === 'INVALID_REQUEST' ? '요청 형식 오류 (400). 질문을 확인해 주세요.'
           : `오류: ${error}`}
          </p>
        )}
      </div>
    </motion.div>
  )
}
