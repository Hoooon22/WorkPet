/**
 * BrowserToolsPanel.tsx
 * 브라우저 경험 향상 도구 모음
 */

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { CaptureScreenshotResponse } from '../../types/messages'
import FocusTimerPanel, { type FocusTimerState } from './FocusTimerPanel'
import QuickMemoPanel from './QuickMemoPanel'
import TranslatePanel from './TranslatePanel'
import SummarizePanel from './SummarizePanel'
import GeminiAskPanel from './GeminiAskPanel'
import WordCountPanel from './WordCountPanel'
import ColorPickerPanel from './ColorPickerPanel'

interface BrowserTool {
  id: string
  icon: string
  label: string
  description: string
  color: string
  bgColor: string
  borderColor: string
  available: boolean
}

const TOOLS: BrowserTool[] = [
  {
    id: 'translate',
    icon: '🌐',
    label: '번역',
    description: '선택 텍스트 또는 페이지 번역',
    color: '#1d4ed8',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe',
    available: true,
  },
  {
    id: 'summarize',
    icon: '📝',
    label: '페이지 요약',
    description: '현재 페이지 내용을 AI로 요약',
    color: '#7c3aed',
    bgColor: '#f5f3ff',
    borderColor: '#ddd6fe',
    available: true,
  },
  {
    id: 'search',
    icon: '🔍',
    label: '빠른 검색',
    description: '구글로 새 탭에서 검색',
    color: '#0f766e',
    bgColor: '#f0fdfa',
    borderColor: '#99f6e4',
    available: true,
  },
  {
    id: 'screenshot',
    icon: '📸',
    label: '스크린샷',
    description: '전체 또는 영역 선택 캡처',
    color: '#b45309',
    bgColor: '#fffbeb',
    borderColor: '#fde68a',
    available: true,
  },
  {
    id: 'timer',
    icon: '⏱️',
    label: '집중 타이머',
    description: '5분 · 10분 · 30분 · 1시간',
    color: '#dc2626',
    bgColor: '#fef2f2',
    borderColor: '#fecaca',
    available: true,
  },
  {
    id: 'memo',
    icon: '📌',
    label: '빠른 메모',
    description: '창 닫아도 기억되는 메모',
    color: '#15803d',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    available: true,
  },
  {
    id: 'gemini-ask',
    icon: '✨',
    label: 'Gemini 질문',
    description: 'AI에게 간단한 질문하기',
    color: '#7e22ce',
    bgColor: '#fdf4ff',
    borderColor: '#e9d5ff',
    available: true,
  },
  {
    id: 'password',
    icon: '🔐',
    label: '비밀번호 생성',
    description: '안전한 랜덤 비밀번호',
    color: '#64748b',
    bgColor: '#f8fafc',
    borderColor: '#e2e8f0',
    available: false,
  },
  {
    id: 'color-picker',
    icon: '🎨',
    label: '색상 추출',
    description: '스포이드 · 페이지 팔레트',
    color: '#7c3aed',
    bgColor: '#fdf4ff',
    borderColor: '#e9d5ff',
    available: true,
  },
  {
    id: 'json-format',
    icon: '🗂️',
    label: 'JSON 포맷',
    description: 'JSON 정리 및 보기 좋게',
    color: '#64748b',
    bgColor: '#f8fafc',
    borderColor: '#e2e8f0',
    available: false,
  },
  {
    id: 'word-count',
    icon: '📊',
    label: '글자 수 세기',
    description: '한국어·영어 글자·단어 수',
    color: '#0369a1',
    bgColor: '#f0f9ff',
    borderColor: '#bae6fd',
    available: true,
  },
  {
    id: 'reading-time',
    icon: '📖',
    label: '읽기 시간',
    description: '페이지 예상 읽기 시간',
    color: '#64748b',
    bgColor: '#f8fafc',
    borderColor: '#e2e8f0',
    available: false,
  },
  {
    id: 'url-shorten',
    icon: '🔗',
    label: 'URL 단축',
    description: '긴 URL을 짧게 줄이기',
    color: '#64748b',
    bgColor: '#f8fafc',
    borderColor: '#e2e8f0',
    available: false,
  },
]

const listItemVariants = {
  hidden: { y: 12, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 20 },
  },
}

interface ToastState {
  toolId: string
  label: string
}

interface Props {
  onCloseBubble?: () => void
  onStartAreaCapture?: () => void
  focusTimer: FocusTimerState
  onTimerStart: (seconds: number) => void
  onTimerTogglePause: () => void
  onTimerReset: () => void
}

export default function BrowserToolsPanel({ onCloseBubble, onStartAreaCapture, focusTimer, onTimerStart, onTimerTogglePause, onTimerReset }: Props) {
  const [toast, setToast] = useState<ToastState | null>(null)

  // 검색
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 스크린샷
  const [screenshotMenuOpen, setScreenshotMenuOpen] = useState(false)

  // 집중 타이머 — 타이머 실행/일시정지 중이면 패널 자동 오픈
  const [timerOpen, setTimerOpen] = useState(
    focusTimer.phase === 'running' || focusTimer.phase === 'paused'
  )

  // 빠른 메모
  const [memoOpen, setMemoOpen] = useState(false)

  // 번역
  const [translateOpen, setTranslateOpen] = useState(false)

  // 페이지 요약
  const [summarizeOpen, setSummarizeOpen] = useState(false)

  // Gemini 질문
  const [geminiAskOpen, setGeminiAskOpen] = useState(false)

  // 글자 수 세기
  const [wordCountOpen, setWordCountOpen] = useState(false)

  // 색상 추출
  const [colorPickerOpen, setColorPickerOpen] = useState(false)

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [searchOpen])

  const handleSearch = () => {
    const q = searchQuery.trim()
    if (!q) return
    window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank')
    setSearchQuery('')
    setSearchOpen(false)
  }

  // 전체 스크린샷
  const handleFullScreenshot = async () => {
    setScreenshotMenuOpen(false)
    // 패널 닫기 → 애니메이션 대기 → 캡처
    onCloseBubble?.()
    await new Promise<void>((resolve) => setTimeout(resolve, 350))
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }) as CaptureScreenshotResponse
      if (response?.dataUrl) {
        const a = document.createElement('a')
        a.href = response.dataUrl
        a.download = `orbit-screenshot-${Date.now()}.png`
        a.click()
      }
    } catch (err) {
      console.error('[Orbit] Full screenshot failed:', err)
    }
  }

  // 영역 선택 스크린샷 — 패널 닫기 + 선택기 시작을 상위(PetOverlay)에 위임
  const handleAreaScreenshot = () => {
    setScreenshotMenuOpen(false)
    onStartAreaCapture?.()
  }

  const closeAllPanels = () => {
    setSearchOpen(false)
    setScreenshotMenuOpen(false)
    setTimerOpen(false)
    setMemoOpen(false)
    setTranslateOpen(false)
    setSummarizeOpen(false)
    setGeminiAskOpen(false)
    setWordCountOpen(false)
    setColorPickerOpen(false)
  }

  const handleToolClick = (tool: BrowserTool) => {
    if (tool.id === 'translate') {
      const next = !translateOpen
      closeAllPanels()
      setTranslateOpen(next)
      return
    }
    if (tool.id === 'summarize') {
      const next = !summarizeOpen
      closeAllPanels()
      setSummarizeOpen(next)
      return
    }
    if (tool.id === 'gemini-ask') {
      const next = !geminiAskOpen
      closeAllPanels()
      setGeminiAskOpen(next)
      return
    }
    if (tool.id === 'search') {
      const next = !searchOpen
      closeAllPanels()
      setSearchOpen(next)
      return
    }
    if (tool.id === 'screenshot') {
      const next = !screenshotMenuOpen
      closeAllPanels()
      setScreenshotMenuOpen(next)
      return
    }
    if (tool.id === 'timer') {
      const next = !timerOpen
      closeAllPanels()
      setTimerOpen(next)
      return
    }
    if (tool.id === 'memo') {
      const next = !memoOpen
      closeAllPanels()
      setMemoOpen(next)
      return
    }
    if (tool.id === 'word-count') {
      const next = !wordCountOpen
      closeAllPanels()
      setWordCountOpen(next)
      return
    }
    if (tool.id === 'color-picker') {
      const next = !colorPickerOpen
      closeAllPanels()
      setColorPickerOpen(next)
      return
    }
    if (!tool.available) {
      closeAllPanels()
      setToast({ toolId: tool.id, label: tool.label })
      setTimeout(() => setToast(null), 2000)
    }
  }

  const isToolActive = (id: string) =>
    (id === 'translate' && translateOpen) ||
    (id === 'summarize' && summarizeOpen) ||
    (id === 'search' && searchOpen) ||
    (id === 'screenshot' && screenshotMenuOpen) ||
    (id === 'timer' && timerOpen) ||
    (id === 'memo' && memoOpen) ||
    (id === 'gemini-ask' && geminiAskOpen) ||
    (id === 'word-count' && wordCountOpen) ||
    (id === 'color-picker' && colorPickerOpen)

  const anyPanelOpen = translateOpen || summarizeOpen || searchOpen || screenshotMenuOpen || timerOpen || memoOpen || geminiAskOpen || wordCountOpen || colorPickerOpen

  const activeTool = TOOLS.find((t) => isToolActive(t.id))

  return (
    <>
      {/* ── 활성 패널 영역 (그리드 위) ── */}
      <AnimatePresence>
        {anyPanelOpen && (
          <motion.div
            key="panel-area"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '12px 16px 0' }}>

              {/* 현재 도구 제목 */}
              {activeTool && (
                <p style={{
                  margin: '0 0 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: activeTool.color,
                  fontFamily: 'sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}>
                  <span>{activeTool.icon}</span>
                  {activeTool.label}
                </p>
              )}

              {/* 번역 패널 */}
              <AnimatePresence>
                {translateOpen && <TranslatePanel key="translate-panel" />}
              </AnimatePresence>

              {/* 페이지 요약 패널 */}
              <AnimatePresence>
                {summarizeOpen && <SummarizePanel key="summarize-panel" />}
              </AnimatePresence>

              {/* Gemini 질문 패널 */}
              <AnimatePresence>
                {geminiAskOpen && <GeminiAskPanel key="gemini-ask-panel" />}
              </AnimatePresence>

              {/* 검색 입력 패널 */}
              <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    key="search-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <form
                      onSubmit={(e) => { e.preventDefault(); handleSearch() }}
                      style={{
                        display: 'flex',
                        gap: '6px',
                        alignItems: 'center',
                        background: '#f0fdfa',
                        border: '1px solid #99f6e4',
                        borderRadius: '10px',
                        padding: '7px 10px',
                      }}
                    >
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>🔍</span>
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="검색어를 입력하세요..."
                        style={{
                          flex: 1,
                          border: 'none',
                          outline: 'none',
                          background: 'transparent',
                          fontSize: '12px',
                          color: '#134e4a',
                          fontFamily: 'sans-serif',
                          minWidth: 0,
                        }}
                      />
                      <motion.button
                        type="submit"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          background: '#0f766e',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 700,
                          fontFamily: 'sans-serif',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          flexShrink: 0,
                        }}
                      >
                        검색
                      </motion.button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 스크린샷 모드 선택 패널 */}
              <AnimatePresence>
                {screenshotMenuOpen && (
                  <motion.div
                    key="screenshot-menu"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div
                      style={{
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '10px',
                        padding: '8px',
                        display: 'flex',
                        gap: '7px',
                      }}
                    >
                      <motion.button
                        whileHover={{ scale: 1.04, y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={handleFullScreenshot}
                        style={{
                          all: 'unset',
                          flex: 1,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '10px 6px',
                          borderRadius: '8px',
                          background: '#fff',
                          border: '1px solid #fde68a',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        }}
                      >
                        <span style={{ fontSize: '22px', lineHeight: 1 }}>🖥️</span>
                        <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#92400e', fontFamily: 'sans-serif', textAlign: 'center' }}>전체 화면</p>
                        <p style={{ margin: 0, fontSize: '9px', color: '#a16207', fontFamily: 'sans-serif', textAlign: 'center', lineHeight: 1.3 }}>현재 뷰포트 전체</p>
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.04, y: -1 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={handleAreaScreenshot}
                        style={{
                          all: 'unset',
                          flex: 1,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '10px 6px',
                          borderRadius: '8px',
                          background: '#b45309',
                          border: '1px solid #92400e',
                          boxShadow: '0 1px 4px rgba(180,83,9,0.25)',
                        }}
                      >
                        <span style={{ fontSize: '22px', lineHeight: 1 }}>✂️</span>
                        <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, color: '#fff', fontFamily: 'sans-serif', textAlign: 'center' }}>영역 선택</p>
                        <p style={{ margin: 0, fontSize: '9px', color: 'rgba(255,255,255,0.75)', fontFamily: 'sans-serif', textAlign: 'center', lineHeight: 1.3 }}>드래그로 직접 선택</p>
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 집중 타이머 패널 */}
              <AnimatePresence>
                {timerOpen && (
                  <FocusTimerPanel
                    key="focus-timer"
                    timer={focusTimer}
                    onStart={onTimerStart}
                    onTogglePause={onTimerTogglePause}
                    onReset={onTimerReset}
                  />
                )}
              </AnimatePresence>

              {/* 빠른 메모 패널 */}
              <AnimatePresence>
                {memoOpen && <QuickMemoPanel key="quick-memo" />}
              </AnimatePresence>

              {/* 글자 수 세기 패널 */}
              <AnimatePresence>
                {wordCountOpen && <WordCountPanel key="word-count" />}
              </AnimatePresence>

              {/* 색상 추출 패널 */}
              <AnimatePresence>
                {colorPickerOpen && <ColorPickerPanel key="color-picker" />}
              </AnimatePresence>
            </div>

            {/* 구분선 */}
            <div style={{ margin: '12px 16px 0', borderTop: '1px solid #f3f4f6' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 도구 그리드 영역 ── */}
      <div style={{ padding: '12px 16px 8px', position: 'relative' }}>
        <p
          style={{
            margin: '0 0 10px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontFamily: 'sans-serif',
          }}
        >
          브라우저 도구
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '7px',
          }}
        >
          {TOOLS.map((tool) => (
            <motion.button
              key={tool.id}
              variants={listItemVariants}
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleToolClick(tool)}
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 10px',
                borderRadius: '10px',
                background: isToolActive(tool.id) ? tool.borderColor : tool.bgColor,
                border: `1px solid ${isToolActive(tool.id) ? tool.color : tool.borderColor}`,
                position: 'relative',
              }}
            >
              <span style={{ fontSize: '18px', lineHeight: 1 }}>{tool.icon}</span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    fontWeight: 700,
                    color: tool.color,
                    fontFamily: 'sans-serif',
                  }}
                >
                  {tool.label}
                </p>
                <p
                  style={{
                    margin: '1px 0 0',
                    fontSize: '10px',
                    color: '#9ca3af',
                    fontFamily: 'sans-serif',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tool.description}
                </p>
              </div>
              {!tool.available && (
                <span
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '6px',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: '#9ca3af',
                    background: '#f3f4f6',
                    borderRadius: '4px',
                    padding: '1px 4px',
                    fontFamily: 'sans-serif',
                    letterSpacing: '0.02em',
                  }}
                >
                  준비중
                </span>
              )}
            </motion.button>
          ))}
        </div>

        {/* 토스트 메시지 */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.toolId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4, transition: { duration: 0.15 } }}
              style={{
                position: 'absolute',
                bottom: '-8px',
                left: '16px',
                right: '16px',
                background: '#1f2937',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: 'sans-serif',
                textAlign: 'center',
                padding: '6px 10px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              {toast.label} 기능은 곧 출시 예정이에요 🐾
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
