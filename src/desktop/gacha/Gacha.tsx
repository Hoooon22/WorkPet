import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { GachaResult, PetId } from '../../shared/types'
import LottiePet from '../components/LottiePet'
import { isLottiePetId } from '../../shared/petCatalog'

type Grade = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
type Phase = 'intro' | 'rolling' | 'revealed'

const ROSTER: { petId: PetId; name: string; grade: Grade }[] = [
  { petId: 'rabbit', name: '토끼', grade: 'COMMON' },
  { petId: 'dog', name: '강아지', grade: 'COMMON' },
  { petId: 'hedgehog', name: '고슴도치', grade: 'RARE' },
  { petId: 'panda', name: '판다', grade: 'RARE' },
  { petId: 'raccoon', name: '너구리', grade: 'EPIC' },
  { petId: 'lion', name: '사자', grade: 'EPIC' },
  { petId: 'unicorn', name: '유니콘', grade: 'LEGENDARY' },
  { petId: 'dragon', name: '드래곤', grade: 'LEGENDARY' },
]

const GRADE_WEIGHTS: Record<Grade, number> = {
  COMMON: 55,
  RARE: 25,
  EPIC: 15,
  LEGENDARY: 5,
}

const GRADE_THEME: Record<Grade, { glow: string; gradient: string; label: string }> = {
  COMMON: {
    glow: '#9ca3af',
    gradient: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
    label: 'COMMON',
  },
  RARE: {
    glow: '#3b82f6',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    label: 'RARE',
  },
  EPIC: {
    glow: '#a855f7',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)',
    label: 'EPIC',
  },
  LEGENDARY: {
    glow: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #7c3aed 100%)',
    label: 'LEGENDARY',
  },
}

function pickGrade(): Grade {
  const total = Object.values(GRADE_WEIGHTS).reduce((a, b) => a + b, 0)
  let n = Math.random() * total
  for (const [g, w] of Object.entries(GRADE_WEIGHTS) as [Grade, number][]) {
    if (n < w) return g
    n -= w
  }
  return 'COMMON'
}

function rollPet(): GachaResult {
  const grade = pickGrade()
  const candidates = ROSTER.filter((r) => r.grade === grade)
  const pick = candidates[Math.floor(Math.random() * candidates.length)] ?? ROSTER[0]
  const theme = GRADE_THEME[grade]
  return {
    grade,
    petId: pick.petId,
    name: pick.name,
    glowColor: theme.glow,
    badgeGradient: theme.gradient,
  }
}

const appWindow = getCurrentWebviewWindow()

export default function Gacha() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [result, setResult] = useState<GachaResult | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setPhase('intro'), 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let hasBeenFocused = false
    ;(async () => {
      unlisten = await appWindow.onFocusChanged(async ({ payload: focused }) => {
        if (focused) {
          hasBeenFocused = true
          return
        }
        if (!hasBeenFocused) return
        await invoke('close_gacha').catch(() => {})
      })
    })()
    return () => unlisten?.()
  }, [])

  function startRoll() {
    setPhase('rolling')
    const picked = rollPet()
    setTimeout(() => {
      setResult(picked)
      setPhase('revealed')
    }, 2200)
  }

  async function confirm() {
    if (!result) return
    await emit('orbit:gacha-result', result)
    await invoke('close_gacha')
  }

  async function cancel() {
    await invoke('close_gacha')
  }

  return (
    <div
      data-tauri-drag-region
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.92)',
        borderRadius: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'sans-serif',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={cancel}
        style={{
          all: 'unset',
          position: 'absolute',
          top: 12,
          right: 12,
          width: 28,
          height: 28,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.12)',
          color: '#fff',
          fontSize: 14,
          cursor: 'pointer',
          textAlign: 'center',
          lineHeight: '28px',
        }}
      >
        ✕
      </button>

      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ textAlign: 'center', color: '#fff' }}
          >
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>
              🎰 이번 주 파트너 뽑기!
            </h1>
            <p style={{ fontSize: 16, color: '#cbd5e1', marginBottom: 32 }}>
              9종 펫 중 한 마리가 당신의 파트너가 돼요.
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={startRoll}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '14px 36px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #7c3aed 100%)',
                color: '#fff',
                fontWeight: 800,
                fontSize: 18,
                boxShadow: '0 8px 28px rgba(124,58,237,0.5)',
              }}
            >
              뽑기 시작!
            </motion.button>
          </motion.div>
        )}

        {phase === 'rolling' && (
          <motion.div
            key="rolling"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.2, opacity: 0 }}
            style={{ textAlign: 'center' }}
          >
            <motion.div
              animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.1, 0.9, 1] }}
              transition={{ duration: 0.5, repeat: Infinity }}
              style={{
                width: 220,
                height: 220,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(245,158,11,0.4) 0%, rgba(124,58,237,0.2) 60%, transparent 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 90,
              }}
            >
              ✨
            </motion.div>
            <p
              style={{
                marginTop: 24,
                color: '#fff',
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}
            >
              운명의 파트너를 찾는 중...
            </p>
          </motion.div>
        )}

        {phase === 'revealed' && result && (
          <RevealCard result={result} onConfirm={confirm} onReroll={startRoll} />
        )}
      </AnimatePresence>
    </div>
  )
}

function RevealCard({
  result,
  onConfirm,
  onReroll,
}: {
  result: GachaResult
  onConfirm: () => void
  onReroll: () => void
}) {
  const theme = GRADE_THEME[result.grade]
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      style={{
        textAlign: 'center',
        background: 'rgba(255,255,255,0.97)',
        borderRadius: 24,
        padding: 36,
        boxShadow: `0 0 64px ${theme.glow}, 0 24px 64px rgba(0,0,0,0.4)`,
        minWidth: 320,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: 999,
          background: theme.gradient,
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.1em',
          marginBottom: 16,
        }}
      >
        {theme.label}
      </div>
      <div
        style={{
          width: 180,
          height: 180,
          margin: '0 auto 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.glow}30 0%, transparent 70%)`,
        }}
      >
        {isLottiePetId(result.petId) ? (
          <LottiePet kind={result.petId} size={140} direction="left" />
        ) : null}
      </div>
      <h2 style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 }}>
        {result.name}
      </h2>
      <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4, marginBottom: 24 }}>
        {result.grade === 'LEGENDARY'
          ? '레전더리 파트너에 만난 행운!'
          : result.grade === 'EPIC'
            ? '에픽 파트너 등장!'
            : result.grade === 'RARE'
              ? '레어 파트너입니다.'
              : '이번 주 함께해요.'}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={onReroll}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '10px 20px',
            borderRadius: 10,
            background: '#f3f4f6',
            color: '#6b7280',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          🔄 다시 뽑기
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={onConfirm}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '10px 24px',
            borderRadius: 10,
            background: theme.gradient,
            color: '#fff',
            fontWeight: 800,
            fontSize: 13,
            boxShadow: `0 4px 16px ${theme.glow}80`,
          }}
        >
          ✨ 소환하기
        </motion.button>
      </div>
    </motion.div>
  )
}
