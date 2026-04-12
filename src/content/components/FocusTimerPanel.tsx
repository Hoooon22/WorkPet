/**
 * FocusTimerPanel.tsx
 * 집중 타이머 패널 — 제어 컴포넌트 (상태는 PetOverlay가 소유)
 */

import { motion, AnimatePresence } from 'framer-motion'

export type TimerPhase = 'idle' | 'running' | 'paused' | 'done'

export interface FocusTimerState {
  phase: TimerPhase
  total: number     // 선택한 전체 초
  remaining: number // 남은 초
}

interface Props {
  timer: FocusTimerState
  onStart: (seconds: number) => void
  onTogglePause: () => void
  onReset: () => void
}

const PRESETS = [
  { label: '5분',   seconds: 5 * 60 },
  { label: '10분',  seconds: 10 * 60 },
  { label: '30분',  seconds: 30 * 60 },
  { label: '1시간', seconds: 60 * 60 },
] as const

export function formatTimerTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function FocusTimerPanel({ timer, onStart, onTogglePause, onReset }: Props) {
  const { phase, total, remaining } = timer
  const progress = total > 0 ? (total - remaining) / total : 0
  const circumference = 2 * Math.PI * 28 // r=28

  return (
    <motion.div
      key="timer-panel"
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{ overflow: 'hidden' }}
    >
      <div style={{
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '10px',
        padding: '12px',
      }}>

        <AnimatePresence mode="wait">
          {/* 프리셋 선택 (idle / done) */}
          {(phase === 'idle' || phase === 'done') && (
            <motion.div
              key="presets"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {phase === 'done' && (
                <p style={{
                  margin: '0 0 10px',
                  textAlign: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#dc2626',
                  fontFamily: 'sans-serif',
                }}>
                  🎉 집중 완료!
                </p>
              )}
              <p style={{
                margin: '0 0 8px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#9ca3af',
                textAlign: 'center',
                fontFamily: 'sans-serif',
              }}>
                시간을 선택하세요
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
              }}>
                {PRESETS.map((preset) => (
                  <motion.button
                    key={preset.label}
                    whileHover={{ scale: 1.04, y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onStart(preset.seconds)}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      padding: '10px 6px',
                      borderRadius: '8px',
                      background: '#fff',
                      border: '1.5px solid #fecaca',
                      textAlign: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <p style={{
                      margin: 0,
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#dc2626',
                      fontFamily: 'sans-serif',
                      lineHeight: 1,
                    }}>
                      {preset.label}
                    </p>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* 카운트다운 (running / paused) */}
          {(phase === 'running' || phase === 'paused') && (
            <motion.div
              key="countdown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}
            >
              {/* 원형 프로그레스 */}
              <div style={{ position: 'relative', width: 72, height: 72 }}>
                <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="36" cy="36" r="28" fill="none" stroke="#fecaca" strokeWidth="5" />
                  <circle
                    cx="36" cy="36" r="28"
                    fill="none"
                    stroke={phase === 'paused' ? '#f87171' : '#dc2626'}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - progress)}
                    style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.2s' }}
                  />
                </svg>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <span style={{
                    fontSize: remaining >= 3600 ? '11px' : '13px',
                    fontWeight: 800,
                    color: '#dc2626',
                    fontFamily: 'monospace',
                    letterSpacing: '-0.5px',
                  }}>
                    {formatTimerTime(remaining)}
                  </span>
                </div>
              </div>

              {/* 컨트롤 */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <motion.button
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onTogglePause}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '7px 16px',
                    borderRadius: '8px',
                    background: phase === 'paused' ? '#dc2626' : '#fff',
                    border: '1.5px solid #dc2626',
                    color: phase === 'paused' ? '#fff' : '#dc2626',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: 'sans-serif',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
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
                    borderRadius: '8px',
                    background: '#fff',
                    border: '1.5px solid #e5e7eb',
                    color: '#9ca3af',
                    fontSize: '12px',
                    fontWeight: 700,
                    fontFamily: 'sans-serif',
                  }}
                >
                  ✕
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
