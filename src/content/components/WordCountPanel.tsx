/**
 * WordCountPanel.tsx
 * 글자 수 세기 패널 — 한국어 / 영어 모드 지원
 *
 * 한국어 모드: 전체 글자, 공백 제외, 한글/영문/숫자/특수문자, 단어·문장·문단·바이트 수
 * 영어 모드: Total chars, chars w/o spaces, words, sentences, paragraphs, syllables, reading time
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Lang = 'ko' | 'en'

// ── 한국어 글자 수 계산 ──────────────────────────────────────────────

function countKorean(text: string) {
  const total           = text.length
  const noSpaces        = text.replace(/\s/g, '').length
  const koreanChars     = (text.match(/[\uAC00-\uD7A3]/g) ?? []).length
  const englishChars    = (text.match(/[A-Za-z]/g) ?? []).length
  const digits          = (text.match(/[0-9]/g) ?? []).length
  const specialChars    = (text.match(/[^A-Za-z0-9\uAC00-\uD7A3\s]/g) ?? []).length

  // 단어: 공백 기준 분리 (빈 문자열 제거)
  const words           = text.trim() === '' ? 0 : text.trim().split(/\s+/).length

  // 문장: 마침표·물음표·느낌표 기준 (한/영 공통)
  const sentences       = text.trim() === '' ? 0
    : (text.match(/[.!?。？！]+(\s|$)/g) ?? []).length || (text.trim().length > 0 ? 1 : 0)

  // 문단: 두 개 이상 연속 줄바꿈 기준
  const paragraphs      = text.trim() === '' ? 0
    : text.trim().split(/\n\s*\n/).filter((p) => p.trim().length > 0).length

  // 바이트 수 (UTF-8 기준: 한글 3바이트, ASCII 1바이트, 나머지 2바이트)
  let bytes = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x7f)         bytes += 1
    else if (code <= 0x7ff)   bytes += 2
    else if (code <= 0xffff)  bytes += 3
    else                      bytes += 4
  }

  return { total, noSpaces, koreanChars, englishChars, digits, specialChars, words, sentences, paragraphs, bytes }
}

// ── 영어 글자 수 계산 ────────────────────────────────────────────────

function countEnglish(text: string) {
  const total        = text.length
  const noSpaces     = text.replace(/\s/g, '').length
  const words        = text.trim() === '' ? 0 : text.trim().split(/\s+/).length

  const sentences    = text.trim() === '' ? 0
    : (text.match(/[.!?]+(\s|$)/g) ?? []).length || (text.trim().length > 0 ? 1 : 0)

  const paragraphs   = text.trim() === '' ? 0
    : text.trim().split(/\n\s*\n/).filter((p) => p.trim().length > 0).length

  // 음절 수 추정 (모음 기준 — 영어 평균 근사)
  const syllables    = text.trim() === '' ? 0
    : Math.max(1, (text.toLowerCase().match(/[aeiouy]+/g) ?? []).length)

  // 고유 단어 수
  const uniqueWords  = text.trim() === '' ? 0
    : new Set(text.toLowerCase().match(/\b[a-z]+\b/g) ?? []).size

  // 독서 시간 (평균 250 wpm)
  const readingSecRaw = Math.round((words / 250) * 60)
  const readingMin   = Math.floor(readingSecRaw / 60)
  const readingSec   = readingSecRaw % 60
  const readingTime  = words === 0 ? '—'
    : readingMin > 0 ? `${readingMin}분 ${readingSec}초` : `${readingSec}초`

  return { total, noSpaces, words, sentences, paragraphs, syllables, uniqueWords, readingTime }
}

// ── 서브컴포넌트: 통계 항목 ──────────────────────────────────────────

interface StatRowProps {
  label: string
  value: string | number
  highlight?: boolean
  subLabel?: string
}

function StatRow({ label, value, highlight = false, subLabel }: StatRowProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: '4px 0',
      borderBottom: '1px dashed #e5e7eb',
    }}>
      <span style={{
        fontSize: '11px',
        color: '#6b7280',
        fontFamily: 'sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
      }}>
        {label}
        {subLabel && (
          <span style={{ fontSize: '9px', color: '#9ca3af', fontFamily: 'sans-serif' }}>
            ({subLabel})
          </span>
        )}
      </span>
      <span style={{
        fontSize: highlight ? '14px' : '12px',
        fontWeight: highlight ? 800 : 600,
        color: highlight ? '#1e3a5f' : '#374151',
        fontFamily: 'monospace',
        letterSpacing: '-0.02em',
      }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

export default function WordCountPanel() {
  const [lang, setLang]   = useState<Lang>('ko')
  const [text, setText]   = useState(() => window.getSelection()?.toString() ?? '')
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 60)
  }, [])

  const handleClear = useCallback(() => {
    setText('')
    textareaRef.current?.focus()
  }, [])

  const handleCopyStats = useCallback(() => {
    const stats = lang === 'ko' ? countKorean(text) : countEnglish(text)
    const lines = lang === 'ko'
      ? [
          `[한국어 글자 수 통계]`,
          `전체 글자 수: ${stats.total.toLocaleString()}`,
          `공백 제외: ${(stats as ReturnType<typeof countKorean>).noSpaces.toLocaleString()}`,
          `한글: ${(stats as ReturnType<typeof countKorean>).koreanChars.toLocaleString()}`,
          `영문: ${(stats as ReturnType<typeof countKorean>).englishChars.toLocaleString()}`,
          `숫자: ${(stats as ReturnType<typeof countKorean>).digits.toLocaleString()}`,
          `특수문자: ${(stats as ReturnType<typeof countKorean>).specialChars.toLocaleString()}`,
          `단어 수: ${(stats as ReturnType<typeof countKorean>).words.toLocaleString()}`,
          `문장 수: ${(stats as ReturnType<typeof countKorean>).sentences.toLocaleString()}`,
          `문단 수: ${(stats as ReturnType<typeof countKorean>).paragraphs.toLocaleString()}`,
          `바이트 수: ${(stats as ReturnType<typeof countKorean>).bytes.toLocaleString()}B`,
        ]
      : [
          `[English Word Count Stats]`,
          `Total characters: ${stats.total.toLocaleString()}`,
          `Characters (no spaces): ${(stats as ReturnType<typeof countEnglish>).noSpaces.toLocaleString()}`,
          `Words: ${(stats as ReturnType<typeof countEnglish>).words.toLocaleString()}`,
          `Sentences: ${(stats as ReturnType<typeof countEnglish>).sentences.toLocaleString()}`,
          `Paragraphs: ${(stats as ReturnType<typeof countEnglish>).paragraphs.toLocaleString()}`,
          `Syllables: ${(stats as ReturnType<typeof countEnglish>).syllables.toLocaleString()}`,
          `Unique words: ${(stats as ReturnType<typeof countEnglish>).uniqueWords.toLocaleString()}`,
          `Reading time: ${(stats as ReturnType<typeof countEnglish>).readingTime}`,
        ]
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
    setCopied(true)
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1800)
  }, [lang, text])

  const koStats = lang === 'ko' ? countKorean(text) : null
  const enStats = lang === 'en' ? countEnglish(text) : null

  const isEmpty = text.trim().length === 0

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        background: '#fafafa',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>

        {/* 언어 탭 */}
        <div style={{
          display: 'flex',
          gap: '6px',
          background: '#f3f4f6',
          borderRadius: '8px',
          padding: '3px',
        }}>
          {(['ko', 'en'] as const).map((l) => (
            <motion.button
              key={l}
              whileTap={{ scale: 0.96 }}
              onClick={() => setLang(l)}
              style={{
                all: 'unset',
                flex: 1,
                cursor: 'pointer',
                textAlign: 'center',
                padding: '5px 0',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 700,
                fontFamily: 'sans-serif',
                background: lang === l ? '#fff' : 'transparent',
                color: lang === l ? '#1e3a5f' : '#9ca3af',
                boxShadow: lang === l ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {l === 'ko' ? '🇰🇷 한국어' : '🇺🇸 English'}
            </motion.button>
          ))}
        </div>

        {/* 입력 영역 */}
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={lang === 'ko'
              ? '텍스트를 입력하거나 붙여넣기 하세요…'
              : 'Type or paste your text here…'}
            rows={4}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              minHeight: '80px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 10px',
              paddingRight: text.length > 0 ? '30px' : '10px',
              fontSize: '12px',
              fontFamily: 'sans-serif',
              color: '#1f2937',
              background: '#fff',
              outline: 'none',
              lineHeight: 1.6,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#93c5fd'
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(147,197,253,0.3)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e5e7eb'
              e.currentTarget.style.boxShadow = 'none'
            }}
          />
          {text.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleClear}
              title={lang === 'ko' ? '지우기' : 'Clear'}
              style={{
                all: 'unset',
                cursor: 'pointer',
                position: 'absolute',
                top: '7px',
                right: '8px',
                fontSize: '13px',
                lineHeight: 1,
                color: '#9ca3af',
              }}
            >
              ✕
            </motion.button>
          )}
        </div>

        {/* 통계 */}
        <AnimatePresence mode="wait">
          {!isEmpty && (
            <motion.div
              key={lang}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
              }}
            >
              {lang === 'ko' && koStats && (
                <>
                  <StatRow label="전체 글자 수" value={koStats.total} highlight subLabel="공백 포함" />
                  <StatRow label="공백 제외 글자 수" value={koStats.noSpaces} />
                  <StatRow label="한글" value={koStats.koreanChars} />
                  <StatRow label="영문" value={koStats.englishChars} />
                  <StatRow label="숫자" value={koStats.digits} />
                  <StatRow label="특수문자" value={koStats.specialChars} />
                  <StatRow label="단어 수" value={koStats.words} />
                  <StatRow label="문장 수" value={koStats.sentences} />
                  <StatRow label="문단 수" value={koStats.paragraphs} />
                  <div style={{ paddingTop: '2px' }}>
                    <StatRow label="바이트 수" value={`${koStats.bytes.toLocaleString()} B`} subLabel="UTF-8" />
                  </div>
                </>
              )}
              {lang === 'en' && enStats && (
                <>
                  <StatRow label="Total characters" value={enStats.total} highlight subLabel="incl. spaces" />
                  <StatRow label="Characters" value={enStats.noSpaces} subLabel="no spaces" />
                  <StatRow label="Words" value={enStats.words} />
                  <StatRow label="Sentences" value={enStats.sentences} />
                  <StatRow label="Paragraphs" value={enStats.paragraphs} />
                  <StatRow label="Syllables" value={enStats.syllables} subLabel="approx." />
                  <StatRow label="Unique words" value={enStats.uniqueWords} />
                  <div style={{ paddingTop: '2px' }}>
                    <StatRow label="Reading time" value={enStats.readingTime} subLabel="@250 wpm" />
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 빈 상태 힌트 */}
        {isEmpty && (
          <p style={{
            margin: 0,
            fontSize: '11px',
            color: '#9ca3af',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            padding: '4px 0',
          }}>
            {lang === 'ko' ? '텍스트를 입력하면 통계가 표시돼요' : 'Start typing to see statistics'}
          </p>
        )}

        {/* 통계 복사 버튼 */}
        {!isEmpty && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopyStats}
            style={{
              all: 'unset',
              cursor: 'pointer',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'sans-serif',
              color: copied ? '#16a34a' : '#6b7280',
              padding: '5px 0',
              borderRadius: '6px',
              background: copied ? '#dcfce7' : '#f3f4f6',
              border: `1px solid ${copied ? '#86efac' : '#e5e7eb'}`,
              transition: 'all 0.15s',
            }}
          >
            {copied
              ? '✓ 통계 복사됨'
              : (lang === 'ko' ? '📋 통계 복사' : '📋 Copy stats')}
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
