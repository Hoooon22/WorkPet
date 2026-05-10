import { motion, AnimatePresence } from 'framer-motion'
import type { FocusTimerState } from '../../../shared/types'

interface Props {
  timer: FocusTimerState
  onStart: (seconds: number) => void
  onTogglePause: () => void
  onReset: () => void
}

const PRESETS = [
  { label: '5분', seconds: 5 * 60 },
  { label: '10분', seconds: 10 * 60 },
  { label: '30분', seconds: 30 * 60 },
  { label: '1시간', seconds: 60 * 60 },
] as const

export function formatTimerTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function FocusTimerPanel({ timer, onStart, onTogglePause, onReset }: Props) {
  const { phase, total, remaining } = timer
  const progress = total > 0 ? (total - remaining) / total : 0
  const circumference = 2 * Math.PI * 28

  return (
    <div
      style={{
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: 10,
        padding: 12,
      }}
    >
      <AnimatePresence mode="wait">
        {(phase === 'idle' || phase === 'done') && (
          <motion.div key="presets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {phase === 'done' && (
              <p
                style={{
                  margin: '0 0 10px',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#dc2626',
                }}
              >
                🎉 집중 완료!
              </p>
            )}
            <p
              style={{
                margin: '0 0 8px',
                fontSize: 11,
                fontWeight: 600,
                color: '#9ca3af',
                textAlign: 'center',
              }}
            >
              시간을 선택하세요
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PRESETS.map((p) => (
                <motion.button
                  key={p.label}
                  whileHover={{ scale: 1.04, y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onStart(p.seconds)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '10px 6px',
                    borderRadius: 8,
                    background: '#fff',
                    border: '1.5px solid #fecaca',
                    textAlign: 'center',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#dc2626' }}>
                    {p.label}
                  </p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {(phase === 'running' || phase === 'paused') && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
          >
            <div style={{ position: 'relative', width: 72, height: 72 }}>
              <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="36" cy="36" r="28" fill="none" stroke="#fecaca" strokeWidth="5" />
                <circle
                  cx="36"
                  cy="36"
                  r="28"
                  fill="none"
                  stroke={phase === 'paused' ? '#f87171' : '#dc2626'}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.2s' }}
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: remaining >= 3600 ? 11 : 13,
                    fontWeight: 800,
                    color: '#dc2626',
                  }}
                >
                  {formatTimerTime(remaining)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={onTogglePause}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '7px 16px',
                  borderRadius: 8,
                  background: phase === 'paused' ? '#dc2626' : '#fff',
                  border: '1.5px solid #dc2626',
                  color: phase === 'paused' ? '#fff' : '#dc2626',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {phase === 'paused' ? '▶ 재개' : '⏸ 일시정지'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={onReset}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '7px 12px',
                  borderRadius: 8,
                  background: '#fff',
                  border: '1.5px solid #e5e7eb',
                  color: '#9ca3af',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                ✕
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
