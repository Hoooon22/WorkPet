import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import type { FocusTimerState } from '../../../shared/types'
import FocusTimerPanel from '../panels/FocusTimerPanel'
import TranslatePanel from '../panels/TranslatePanel'
import SummarizePanel from '../panels/SummarizePanel'
import GeminiAskPanel from '../panels/GeminiAskPanel'
import QuickMemoPanel from '../panels/QuickMemoPanel'
import TodoPanel from '../panels/TodoPanel'
import ColorPickerPanel from '../panels/ColorPickerPanel'
import WordCountPanel from '../panels/WordCountPanel'
import ScreenshotPanel from '../panels/ScreenshotPanel'
import ReminderPanel from '../panels/ReminderPanel'
import BreakReminderPanel from '../panels/BreakReminderPanel'
import ClipboardHistoryPanel from '../panels/ClipboardHistoryPanel'

interface Props {
  focusTimer: FocusTimerState
  action: (type: string, payload?: unknown) => void
}

type ToolId =
  | 'focus'
  | 'reminder'
  | 'break'
  | 'translate'
  | 'summarize'
  | 'ask'
  | 'memo'
  | 'todo'
  | 'clipboard'
  | 'color'
  | 'wordcount'
  | 'screenshot'
  | 'teamroom'

interface ToolMeta {
  id: ToolId
  label: string
  emoji: string
  bg: string
  border: string
  fg: string
  kind?: 'window'
}

const TOOLS: ToolMeta[] = [
  { id: 'focus',      label: '집중 타이머', emoji: '⏱️', bg: '#fef2f2', border: '#fecaca', fg: '#dc2626' },
  { id: 'reminder',   label: '정기 알림',   emoji: '⏰', bg: '#fff7ed', border: '#fed7aa', fg: '#c2410c' },
  { id: 'break',      label: '휴식 알림',   emoji: '👀', bg: '#ecfdf5', border: '#a7f3d0', fg: '#047857' },
  { id: 'translate',  label: '번역',       emoji: '🌐', bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8' },
  { id: 'summarize',  label: '요약',       emoji: '📝', bg: '#fffbeb', border: '#fde68a', fg: '#d97706' },
  { id: 'ask',        label: '질문',       emoji: '🤔', bg: '#f5f3ff', border: '#ddd6fe', fg: '#7c3aed' },
  { id: 'memo',       label: '빠른 메모',   emoji: '📋', bg: '#f0fdf4', border: '#bbf7d0', fg: '#16a34a' },
  { id: 'todo',       label: '할 일',      emoji: '✅', bg: '#fefce8', border: '#fde68a', fg: '#a16207' },
  { id: 'clipboard',  label: '클립보드',   emoji: '📎', bg: '#f0f9ff', border: '#bae6fd', fg: '#0369a1' },
  { id: 'color',      label: '색상 추출',   emoji: '🎨', bg: '#fdf2f8', border: '#fbcfe8', fg: '#db2777' },
  { id: 'wordcount',  label: '글자수',     emoji: '🔢', bg: '#f3f4f6', border: '#d1d5db', fg: '#4b5563' },
  { id: 'screenshot', label: '영역 캡처',   emoji: '📸', bg: '#ecfeff', border: '#a5f3fc', fg: '#0891b2' },
  { id: 'teamroom',   label: '팀 펫 룸',   emoji: '🏠', bg: '#f5f3ff', border: '#ddd6fe', fg: '#7c3aed', kind: 'window' },
]

export default function ToolsTab({ focusTimer, action }: Props) {
  const [active, setActive] = useState<ToolId | null>(null)
  const [hovered, setHovered] = useState<ToolId | null>(null)
  const activeTool = active ? TOOLS.find((t) => t.id === active) ?? null : null

  const handleSelect = (t: ToolMeta) => {
    if (t.kind === 'window') {
      void invoke(`open_${t.id === 'teamroom' ? 'team_room' : t.id}`).catch((err) => {
        console.warn('[orbit] open window failed', err)
      })
      setActive(null)
      return
    }
    setActive(active === t.id ? null : t.id)
  }

  return (
    <div style={{ padding: 14 }}>
      {!activeTool && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '10px 8px',
                borderRadius: 8,
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                textAlign: 'center',
                fontSize: 12,
                fontWeight: 600,
                color: '#374151',
              }}
            >
              <span style={{ fontSize: 18, display: 'block', marginBottom: 2 }}>{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {activeTool && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 10,
            paddingBottom: 2,
          }}
        >
          {TOOLS.map((t) => {
            const isActive = active === t.id
            const isHovered = hovered === t.id
            return (
              <button
                key={t.id}
                onClick={() => handleSelect(t)}
                onMouseEnter={() => setHovered(t.id)}
                onMouseLeave={() => setHovered((h) => (h === t.id ? null : h))}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: isHovered ? 30 : undefined,
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 17,
                  borderRadius: 8,
                  background: isActive ? t.bg : '#f9fafb',
                  border: `1px solid ${isActive ? t.fg : '#e5e7eb'}`,
                  opacity: isActive ? 1 : 0.6,
                  transition: 'opacity 0.15s, background 0.15s, border-color 0.15s',
                }}
              >
                {t.emoji}
                {isHovered && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#1f2937',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '3px 7px',
                      borderRadius: 4,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      zIndex: 20,
                    }}
                  >
                    {t.label}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTool && (
          <motion.section
            key={activeTool.id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            style={{
              borderRadius: 12,
              background: '#fff',
              border: `1px solid ${activeTool.border}`,
              boxShadow: '0 6px 18px rgba(15,23,42,0.08)',
              overflow: 'hidden',
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: activeTool.bg,
                borderBottom: `1px solid ${activeTool.border}`,
                fontSize: 12,
                fontWeight: 700,
                color: activeTool.fg,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>{activeTool.emoji}</span>
                {activeTool.label}
              </span>
              <button
                onClick={() => setActive(null)}
                aria-label="닫기"
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: activeTool.fg,
                  fontSize: 13,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </header>
            <div style={{ padding: 10 }}>
              {active === 'focus' && (
                <FocusTimerPanel
                  timer={focusTimer}
                  onStart={(s) => action('timer-start', s)}
                  onTogglePause={() => action('timer-toggle-pause')}
                  onReset={() => action('timer-reset')}
                />
              )}
              {active === 'reminder' && <ReminderPanel />}
              {active === 'break' && <BreakReminderPanel />}
              {active === 'translate' && <TranslatePanel />}
              {active === 'summarize' && <SummarizePanel />}
              {active === 'ask' && <GeminiAskPanel />}
              {active === 'memo' && <QuickMemoPanel />}
              {active === 'todo' && <TodoPanel />}
              {active === 'clipboard' && <ClipboardHistoryPanel />}
              {active === 'color' && <ColorPickerPanel />}
              {active === 'wordcount' && <WordCountPanel />}
              {active === 'screenshot' && <ScreenshotPanel />}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
