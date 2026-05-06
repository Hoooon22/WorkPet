import { useState } from 'react'
import type { FocusTimerState } from '../../../shared/types'
import FocusTimerPanel from '../panels/FocusTimerPanel'
import TranslatePanel from '../panels/TranslatePanel'
import SummarizePanel from '../panels/SummarizePanel'
import GeminiAskPanel from '../panels/GeminiAskPanel'
import QuickMemoPanel from '../panels/QuickMemoPanel'
import ColorPickerPanel from '../panels/ColorPickerPanel'
import WordCountPanel from '../panels/WordCountPanel'

interface Props {
  focusTimer: FocusTimerState
  action: (type: string, payload?: unknown) => void
}

type ToolId =
  | 'focus'
  | 'translate'
  | 'summarize'
  | 'ask'
  | 'memo'
  | 'color'
  | 'wordcount'
  | 'screenshot'

const TOOLS: { id: ToolId; label: string; emoji: string }[] = [
  { id: 'focus', label: '집중 타이머', emoji: '⏱️' },
  { id: 'translate', label: '번역', emoji: '🌐' },
  { id: 'summarize', label: '요약', emoji: '📝' },
  { id: 'ask', label: '질문', emoji: '🤔' },
  { id: 'memo', label: '빠른 메모', emoji: '📋' },
  { id: 'color', label: '색상 픽커', emoji: '🎨' },
  { id: 'wordcount', label: '글자수', emoji: '🔢' },
  { id: 'screenshot', label: '영역 캡처', emoji: '📸' },
]

export default function ToolsTab({ focusTimer, action }: Props) {
  const [active, setActive] = useState<ToolId | null>(null)

  return (
    <div style={{ padding: 14 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 12,
        }}
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'screenshot') {
                action('open-screenshot')
                return
              }
              setActive(active === t.id ? null : t.id)
            }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '10px 8px',
              borderRadius: 8,
              background: active === t.id ? '#dbeafe' : '#f9fafb',
              border: `1px solid ${active === t.id ? '#93c5fd' : '#e5e7eb'}`,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: active === t.id ? '#1d4ed8' : '#374151',
            }}
          >
            <span style={{ fontSize: 18, display: 'block', marginBottom: 2 }}>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {active === 'focus' && (
        <FocusTimerPanel
          timer={focusTimer}
          onStart={(s) => action('timer-start', s)}
          onTogglePause={() => action('timer-toggle-pause')}
          onReset={() => action('timer-reset')}
        />
      )}
      {active === 'translate' && <TranslatePanel />}
      {active === 'summarize' && <SummarizePanel />}
      {active === 'ask' && <GeminiAskPanel />}
      {active === 'memo' && <QuickMemoPanel />}
      {active === 'color' && <ColorPickerPanel />}
      {active === 'wordcount' && <WordCountPanel />}
    </div>
  )
}
