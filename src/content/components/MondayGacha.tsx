/**
 * MondayGacha.tsx
 * 매주 월요일 아침에 나타나는 전체화면 펫 뽑기 모달
 *
 * Phase 흐름:
 *   intro → selecting → [buildup] → cracking → revealed → summoning
 *
 * buildup: RARE 이상 등급 시 점층적 등급 연출 — 메트로놈 같은 셰이크 대신
 *          심장박동 리듬(쿵—쉬—쿵쿵—쉬—쿵)으로 긴장 누적
 *   RARE:      커먼연출 → 레어연출 → cracking
 *   EPIC:      커먼연출 → 레어연출 → 유니크연출 → cracking
 *   LEGENDARY: 커먼연출 → 레어연출 → 레전더리연출 → cracking
 *
 * cracking: 4막 구조로 긴장감 극대화
 *   act 0 — 준비 (안쪽으로 움츠러들며 에너지 응축, 미세 떨림)
 *   act 1 — 첫 균열 (날카로운 잭트, 첫 금이 빛과 함께)
 *   act 2 — 확장 (격렬한 흔들림, 색수차, 금이 넓어짐)
 *   act 3 — 정적 (모든 흔들림이 멎고 알만 빛나며 정지 — 터지기 직전의 침묵)
 *   act 4 — 폭발 (시간 정지 링 → 백색 섬광 → 충격파)
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Lottie from 'lottie-react'
import type { GachaResult } from '../../types/messages'

import catLottie      from '../../assets/lottie/idle.json'
import rabbitLottie   from '../../assets/lottie/pets/rabbit.json'
import hedgehogLottie from '../../assets/lottie/pets/hedgehog.json'
import raccoonLottie  from '../../assets/lottie/pets/raccoon.json'
import unicornLottie  from '../../assets/lottie/pets/unicorn.json'
import SvgPet from './SvgPet'
import type { LottiePetId, SvgPetId } from '../../types/messages'

// SVG 펫은 Lottie가 없으므로 PET_LOTTIE_MAP에서는 LottiePetId만 다룬다.
export const PET_LOTTIE_MAP: Record<LottiePetId, object> = {
  cat:      catLottie,
  rabbit:   rabbitLottie,
  hedgehog: hedgehogLottie,
  raccoon:  raccoonLottie,
  unicorn:  unicornLottie,
}

function isLottiePetId(id: string): id is LottiePetId {
  return id in PET_LOTTIE_MAP
}

// ─── Types ─────────────────────────────────────────────────────────────────

type GachaPhase = 'intro' | 'selecting' | 'buildup' | 'cracking' | 'revealed' | 'summoning'
type BuildupTierName = 'common' | 'rare' | 'epic' | 'legendary'

interface PetResult extends GachaResult {
  particleColors: string[]
}

interface ParticleData {
  x: number
  y: number
  size: number
  delay: number
  duration: number
  colorIndex: number
}

interface BuildupTierConfig {
  glowColor: string
  particleColors: string[]
  badgeGradient: string
  particleCount: number
  duration: number   // ms — 각 단계 체류 시간
  vibX: number       // 흔들림 x 최대 진폭(px)
  vibRotate: number  // 흔들림 rotate 최대 진폭(deg)
  vibDelay: number   // 흔들림 시작 시점 (duration 비율 0~1)
}

// ─── Pet roster (13 마리) ──────────────────────────────────────────────────
//
//   COMMON   (55%) — 신규 SVG 4 종: chick / frog / turtle / bear
//   RARE     (25%) — 기존 Lottie 3 종: cat / rabbit / hedgehog
//   EPIC     (15%) — 신규 SVG 4 종: fox / penguin / owl / octopus
//   LEGENDARY (5%) — 기존 Lottie 2 종: raccoon / unicorn

const COMMON_PARTICLES = ['#9ca3af', '#d1d5db', '#f3f4f6']
const RARE_PARTICLES   = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe']
const EPIC_PARTICLES   = ['#7c3aed', '#a78bfa', '#c4b5fd', '#f0abfc', '#e879f9']
const LEGEND_PARTICLES = ['#fbbf24', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#fff', '#fde68a']

const COMMON_BADGE = 'linear-gradient(135deg, #4b5563 0%, #9ca3af 100%)'
const RARE_BADGE   = 'linear-gradient(135deg, #1d4ed8 0%, #60a5fa 50%, #bfdbfe 100%)'
const EPIC_BADGE   = 'linear-gradient(135deg, #6d28d9 0%, #a78bfa 50%, #ddd6fe 100%)'
const LEGEND_BADGE = 'linear-gradient(135deg, #f59e0b 0%, #ef4444 30%, #ec4899 65%, #8b5cf6 100%)'

const PET_RESULTS: PetResult[] = [
  // ── COMMON (신규 SVG) ─────────────────────────────────────────────
  { grade: 'COMMON', petId: 'chick',  name: '의욕 가득 병아리', glowColor: '#eab308', badgeGradient: COMMON_BADGE, particleColors: COMMON_PARTICLES },
  { grade: 'COMMON', petId: 'frog',   name: '통통 튀는 개구리', glowColor: '#16a34a', badgeGradient: COMMON_BADGE, particleColors: COMMON_PARTICLES },
  { grade: 'COMMON', petId: 'turtle', name: '꾸준한 거북이',    glowColor: '#4d7c0f', badgeGradient: COMMON_BADGE, particleColors: COMMON_PARTICLES },
  { grade: 'COMMON', petId: 'bear',   name: '느긋한 곰',        glowColor: '#a16207', badgeGradient: COMMON_BADGE, particleColors: COMMON_PARTICLES },

  // ── RARE / 유니크 (기존 Lottie) ───────────────────────────────────
  { grade: 'RARE', petId: 'cat',      name: '동네 고양이',      glowColor: '#f97316', badgeGradient: RARE_BADGE, particleColors: RARE_PARTICLES },
  { grade: 'RARE', petId: 'rabbit',   name: '수습 토끼',        glowColor: '#9ca3af', badgeGradient: RARE_BADGE, particleColors: RARE_PARTICLES },
  { grade: 'RARE', petId: 'hedgehog', name: '성실한 고슴도치',  glowColor: '#60a5fa', badgeGradient: RARE_BADGE, particleColors: RARE_PARTICLES },

  // ── EPIC (신규 SVG) ───────────────────────────────────────────────
  { grade: 'EPIC', petId: 'fox',     name: '재빠른 여우',     glowColor: '#f97316', badgeGradient: EPIC_BADGE, particleColors: EPIC_PARTICLES },
  { grade: 'EPIC', petId: 'penguin', name: '격식 있는 펭귄',  glowColor: '#1f2937', badgeGradient: EPIC_BADGE, particleColors: EPIC_PARTICLES },
  { grade: 'EPIC', petId: 'owl',     name: '야근 버디 부엉이', glowColor: '#78350f', badgeGradient: EPIC_BADGE, particleColors: EPIC_PARTICLES },
  { grade: 'EPIC', petId: 'octopus', name: '멀티태스커 문어', glowColor: '#a855f7', badgeGradient: EPIC_BADGE, particleColors: EPIC_PARTICLES },

  // ── LEGENDARY (기존 Lottie) ───────────────────────────────────────
  { grade: 'LEGENDARY', petId: 'raccoon', name: '전략가 너구리', glowColor: '#a78bfa', badgeGradient: LEGEND_BADGE, particleColors: LEGEND_PARTICLES },
  { grade: 'LEGENDARY', petId: 'unicorn', name: 'CEO 유니콘',    glowColor: '#fbbf24', badgeGradient: LEGEND_BADGE, particleColors: LEGEND_PARTICLES },
]

function pickByGrade(grade: PetResult['grade']): PetResult {
  const candidates = PET_RESULTS.filter(p => p.grade === grade)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

function pickRandomResult(): PetResult {
  const roll = Math.random() * 100
  if (roll < 5)  return pickByGrade('LEGENDARY') //  5%
  if (roll < 20) return pickByGrade('EPIC')      // 15%
  if (roll < 45) return pickByGrade('RARE')      // 25%
  return pickByGrade('COMMON')                   // 55%
}

// ─── 카메라 셰이크 / 색수차 keyframes ─────────────────────────────────────
//
// Shadow DOM 안에서만 유효하도록 wp- 접두사로 네임스페이스.
// 셰이크는 메트로놈처럼 일정하지 않게 — 비균일 진폭/타이밍의 유기적 진동.

const SHAKE_CSS = `
@keyframes wp-shake-sm {
  0%   { transform: translate(0,0); }
  13%  { transform: translate(-0.6px, 0.9px); }
  27%  { transform: translate(1.1px, -0.4px); }
  41%  { transform: translate(-1.4px, 0.7px); }
  58%  { transform: translate(0.8px, -1.2px); }
  74%  { transform: translate(-0.9px, 0.5px); }
  89%  { transform: translate(0.6px, -0.8px); }
  100% { transform: translate(0,0); }
}
@keyframes wp-shake-md {
  0%   { transform: translate(0,0); }
  9%   { transform: translate(-2px, 1.4px); }
  21%  { transform: translate(3px, -2.1px); }
  34%  { transform: translate(-3.6px, 2.4px); }
  47%  { transform: translate(2.7px, -3.2px); }
  63%  { transform: translate(-3.9px, 2.8px); }
  78%  { transform: translate(3.3px, -2.4px); }
  92%  { transform: translate(-1.7px, 1.5px); }
  100% { transform: translate(0,0); }
}
@keyframes wp-shake-lg {
  0%   { transform: translate(0,0); }
  7%   { transform: translate(-5px, 4px); }
  16%  { transform: translate(8px, -6px); }
  28%  { transform: translate(-10px, 7px); }
  39%  { transform: translate(11px, -9px); }
  52%  { transform: translate(-12px, 8px); }
  64%  { transform: translate(9px, -10px); }
  77%  { transform: translate(-7px, 6px); }
  88%  { transform: translate(5px, -4px); }
  100% { transform: translate(0,0); }
}
@keyframes wp-chroma-shake {
  0%,100% { filter: none; }
  20%     { filter: drop-shadow(1px 0 0 #ef4444) drop-shadow(-1px 0 0 #3b82f6); }
  50%     { filter: drop-shadow(3px 0 0 #ef4444) drop-shadow(-3px 0 0 #3b82f6); }
  80%     { filter: drop-shadow(1.5px 0 0 #ef4444) drop-shadow(-1.5px 0 0 #3b82f6); }
}
`

// ─── Buildup tier configs ────────────────────────────────────────────────────

const BUILDUP_TIER_CONFIGS: Record<BuildupTierName, BuildupTierConfig> = {
  common: {
    glowColor:      '#f97316',
    particleColors: ['#f97316', '#fb923c', '#fed7aa'],
    badgeGradient:  'linear-gradient(135deg, #431407 0%, #f97316 100%)',
    particleCount:  10,
    duration:       1400,  // 커먼도 충분한 긴장감
    vibX:           4,
    vibRotate:      2,
    vibDelay:       0.38,  // 38% 지점부터 흔들림 시작
  },
  rare: {
    glowColor:      '#60a5fa',
    particleColors: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'],
    badgeGradient:  'linear-gradient(135deg, #1e3a8a 0%, #60a5fa 100%)',
    particleCount:  18,
    duration:       1900,
    vibX:           8,
    vibRotate:      4,
    vibDelay:       0.32,
  },
  epic: {
    glowColor:      '#a78bfa',
    particleColors: ['#7c3aed', '#a78bfa', '#c4b5fd', '#f0abfc', '#e879f9'],
    badgeGradient:  'linear-gradient(135deg, #3b0764 0%, #a78bfa 50%, #f0abfc 100%)',
    particleCount:  24,
    duration:       2200,
    vibX:           13,
    vibRotate:      6,
    vibDelay:       0.28,
  },
  legendary: {
    glowColor:      '#fbbf24',
    particleColors: ['#fbbf24', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#fff'],
    badgeGradient:  'linear-gradient(135deg, #78350f 0%, #fbbf24 30%, #ef4444 65%, #a855f7 100%)',
    particleCount:  30,
    duration:       2600,
    vibX:           18,
    vibRotate:      8,
    vibDelay:       0.25,  // 일찍 시작해서 더 오래 흔들림
  },
}

const BUILDUP_LABELS: Record<BuildupTierName, string> = {
  common:    'COMMON',
  rare:      '★  R A R E  ★',
  epic:      '✦  E P I C  ✦',
  legendary: '★  L E G E N D A R Y  ★',
}

function getBuildupSequence(grade: string): BuildupTierName[] {
  if (grade === 'LEGENDARY') return ['common', 'rare', 'epic', 'legendary']
  if (grade === 'EPIC')      return ['common', 'rare', 'epic']
  if (grade === 'RARE')      return ['common', 'rare']
  return ['common']  // COMMON도 커먼 연출 0.9s 후 cracking
}

// ─── Egg visuals ────────────────────────────────────────────────────────────

const EGG_DESIGNS = [
  {
    id: 'gold',
    topColor:  '#fffbeb',
    midColor:  '#fde68a',
    botColor:  '#f59e0b',
    glow:      '#f59e0b',
    gradId:    'egg-g0',
  },
  {
    id: 'blue',
    topColor:  '#eff6ff',
    midColor:  '#bfdbfe',
    botColor:  '#3b82f6',
    glow:      '#3b82f6',
    gradId:    'egg-g1',
  },
  {
    id: 'pink',
    topColor:  '#fdf2f8',
    midColor:  '#f9a8d4',
    botColor:  '#ec4899',
    glow:      '#ec4899',
    gradId:    'egg-g2',
  },
]

// ─── Particle generator ─────────────────────────────────────────────────────

function genParticles(count: number): ParticleData[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + (Math.random() - 0.5) * (360 / count)
    const dist  = 90 + Math.random() * 160
    return {
      x:          Math.cos((angle * Math.PI) / 180) * dist,
      y:          Math.sin((angle * Math.PI) / 180) * dist,
      size:       4 + Math.random() * 11,
      delay:      Math.random() * 0.25,
      duration:   0.5 + Math.random() * 0.55,
      colorIndex: Math.floor(Math.random() * 7),
    }
  })
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EggSvg({ design, size = 120 }: { design: typeof EGG_DESIGNS[0]; size?: number }) {
  const h = size * 1.22
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 100 122"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={design.gradId} x1="30%" y1="5%" x2="70%" y2="95%">
          <stop offset="0%"   stopColor={design.topColor} />
          <stop offset="48%"  stopColor={design.midColor} />
          <stop offset="100%" stopColor={design.botColor} />
        </linearGradient>
        <filter id={`${design.gradId}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {/* Glow shadow */}
      <ellipse
        cx="50" cy="66" rx="38" ry="50"
        fill={design.glow}
        opacity="0.25"
        filter={`url(#${design.gradId}-blur)`}
      />
      {/* Egg body */}
      <ellipse cx="50" cy="66" rx="38" ry="50" fill={`url(#${design.gradId})`} />
      {/* Shine highlights */}
      <ellipse cx="37" cy="46" rx="9"  ry="13" fill="rgba(255,255,255,0.38)" transform="rotate(-22 37 46)" />
      <ellipse cx="44" cy="38" rx="4"  ry="6"  fill="rgba(255,255,255,0.55)" transform="rotate(-18 44 38)" />
    </svg>
  )
}

// ─── Buildup stage view ──────────────────────────────────────────────────────

function BuildupStageView({
  tier,
  egg,
  isLastTier,
}: {
  tier: BuildupTierName
  egg: typeof EGG_DESIGNS[0]
  isLastTier: boolean
}) {
  const cfg       = BUILDUP_TIER_CONFIGS[tier]
  const isUpgrade = tier !== 'common'
  const sec       = cfg.duration / 1000

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const miniParticles = useMemo(() => genParticles(cfg.particleCount), [])

  // 심장박동 리듬 — 정착 → 들숨 → 첫 박동 → 두번째 박동 → 마지막 강한 박동.
  // 시점 배열은 0..1로 정규화되어 stage 전체에 걸쳐 펴짐.
  // 메트로놈처럼 일정하지 않은 — *불규칙* 한 비트 사이의 정적이 긴장을 만든다.
  const beatTimes  = [0, 0.18, 0.32, 0.40, 0.55, 0.62, 0.78, 0.86, 1.0]
  const beatScale  = [1, 1.015, 1.04, 1.01, 1.06, 1.005, 1.09, 0.99, 1.02]
  // 방향 미세 흔들림은 등급별로 진폭 차등
  const swayUnit   = isUpgrade ? (tier === 'legendary' ? 4 : tier === 'epic' ? 3 : 2.2) : 1.2
  const beatRotate = [0, swayUnit*0.6, -swayUnit*0.4, swayUnit*0.8, -swayUnit*0.6, swayUnit, -swayUnit*0.8, swayUnit*1.2, 0]
  const beatY      = [0, -1, 1, -2, 2, -3, 3, -2, 0]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      // 마지막 단계: 아주 빠르게 fade → cracking이 즉시 이어받음
      // 중간 단계: 살짝 축소+fade → 다음 tier 플래시가 덮어씀
      exit={isLastTier
        ? { opacity: 0, transition: { duration: 0.08 } }
        : { opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: 'easeIn' } }
      }
      transition={{ duration: 0.35, ease: [0.22, 0.9, 0.3, 1] }}
      style={{
        position:       'relative',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '24px',
        zIndex:         1,
      }}
    >
      {/* 업그레이드 순간 전체 화면 티어 플래시 — 부드럽고 느린 페이드 */}
      {isUpgrade && (
        <motion.div
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.95, ease: [0.2, 0.65, 0.3, 1] }}
          style={{
            position:      'fixed',
            inset:         0,
            background:    `radial-gradient(ellipse at center, ${cfg.glowColor}55 0%, ${cfg.glowColor}22 40%, transparent 75%)`,
            pointerEvents: 'none',
            mixBlendMode:  'screen',
            zIndex:        0,
          }}
        />
      )}

      {/* 긴장 비네트 — 화면 가장자리가 천천히 닫혀오며 시선 집중 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: tier === 'common' ? 0.25 : tier === 'rare' ? 0.45 : 0.7 }}
        transition={{ duration: sec * 0.85, ease: 'easeIn' }}
        style={{
          position:      'fixed',
          inset:         0,
          background:    'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.85) 90%)',
          pointerEvents: 'none',
          zIndex:        0,
        }}
      />

      {/* 뒤에서 솟아오르는 빛 기둥 */}
      <motion.div
        initial={{ opacity: 0, scaleY: 0 }}
        animate={{ opacity: [0, 0.85, 0.6], scaleY: [0, 1, 1] }}
        transition={{ duration: 0.6, ease: 'easeOut', times: [0, 0.55, 1] }}
        style={{
          position:        'absolute',
          left:            '50%',
          bottom:          '50%',
          width:           160,
          height:          900,
          marginLeft:      -80,
          transform:       'rotateX(72deg)',
          transformOrigin: 'bottom center',
          background:      `linear-gradient(to top, ${cfg.glowColor}ee 0%, ${cfg.glowColor}55 35%, transparent 100%)`,
          filter:          'blur(8px)',
          mixBlendMode:    'screen',
          pointerEvents:   'none',
          zIndex:          0,
        }}
      />

      {/* 중앙에서 방사되는 빛 폭발 */}
      <motion.div
        initial={{ scale: 0.25, opacity: isUpgrade ? 1.0 : 0.55 }}
        animate={{ scale: 4, opacity: 0 }}
        transition={{ duration: 0.65, ease: 'easeOut' }}
        style={{
          position:      'absolute',
          width:         160,
          height:        160,
          borderRadius:  '50%',
          background:    `radial-gradient(circle, ${cfg.glowColor}cc 0%, transparent 65%)`,
          pointerEvents: 'none',
          zIndex:        0,
        }}
      />

      {/* 파티클 버스트 */}
      <div style={{ position: 'absolute', pointerEvents: 'none', zIndex: 0 }}>
        {miniParticles.map((p, i) => (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.x * 0.55, y: p.y * 0.55, opacity: 0, scale: 0 }}
            transition={{
              duration: p.duration * 0.65,
              delay:    p.delay * 0.4,
              ease:     [0.2, 0.85, 0.35, 1],
            }}
            style={{
              position:     'absolute',
              width:        p.size * 0.7,
              height:       p.size * 0.7,
              borderRadius: '50%',
              background:   cfg.particleColors[p.colorIndex % cfg.particleColors.length],
              boxShadow:    `0 0 ${p.size}px ${cfg.particleColors[p.colorIndex % cfg.particleColors.length]}`,
              transform:    'translate(-50%, -50%)',
            }}
          />
        ))}
      </div>

      {/* 알 + 심장박동 리듬 (정적-쿵-쉬-쿵쿵-쉬-쿵) */}
      <motion.div
        animate={{
          scale:  beatScale,
          rotate: beatRotate,
          y:      beatY,
        }}
        transition={{
          duration: sec,
          times:    beatTimes,
          ease:     'easeInOut',
        }}
        style={{
          filter:        `drop-shadow(0 0 ${isUpgrade ? 44 : 26}px ${cfg.glowColor}cc) drop-shadow(0 0 ${isUpgrade ? 88 : 52}px ${cfg.glowColor}55)`,
          position:      'relative',
          transformStyle:'preserve-3d',
          zIndex:        1,
        }}
      >
        <EggSvg design={egg} size={148} />

        {/* 색조 후광 펄스 */}
        <motion.div
          animate={{ opacity: [0.4, 0.85, 0.4] }}
          transition={{ duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position:     'absolute',
            inset:        '-20px',
            borderRadius: '60% 60% 52% 52%',
            background:   `radial-gradient(ellipse at center, ${cfg.glowColor}44 0%, transparent 68%)`,
            pointerEvents: 'none',
          }}
        />
      </motion.div>

      {/* 등급 뱃지 */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0, y: isUpgrade ? 60 : 12, filter: 'blur(8px)' }}
        animate={{ scale: 1, opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{
          type:      'spring',
          stiffness: isUpgrade ? 320 : 380,
          damping:   isUpgrade ? 22  : 22,
          mass:      0.8,
          delay:     0.25,
        }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <motion.div
          animate={{
            scale:     [1, 1.04, 1, 1.06, 1],
            boxShadow: [
              `0 4px 30px ${cfg.glowColor}55`,
              `0 6px 50px ${cfg.glowColor}99`,
              `0 4px 30px ${cfg.glowColor}55`,
              `0 8px 60px ${cfg.glowColor}cc`,
              `0 4px 30px ${cfg.glowColor}55`,
            ],
          }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            padding:      '12px 40px',
            borderRadius: '999px',
            background:   cfg.badgeGradient,
            border:       `2px solid ${cfg.glowColor}`,
          }}
        >
          <span
            style={{
              fontSize:      tier === 'legendary' ? '15px' : '17px',
              fontWeight:    900,
              letterSpacing: tier === 'legendary' ? '3px' : '4px',
              color:         '#fff',
              textShadow:    `0 0 20px ${cfg.glowColor}, 0 2px 4px rgba(0,0,0,0.4)`,
              whiteSpace:    'nowrap',
            }}
          >
            {BUILDUP_LABELS[tier]}
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function BackgroundStars() {
  const stars = useMemo(
    () =>
      Array.from({ length: 45 }, () => ({
        x:        Math.random() * 100,
        y:        Math.random() * 100,
        size:     0.8 + Math.random() * 2.5,
        delay:    Math.random() * 4,
        duration: 2 + Math.random() * 2.5,
      })),
    [],
  )

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {stars.map((s, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.15, 0.85, 0.15], scale: [0.7, 1.4, 0.7] }}
          transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position:     'absolute',
            left:         `${s.x}%`,
            top:          `${s.y}%`,
            width:        s.size,
            height:       s.size,
            borderRadius: '50%',
            background:   '#fff',
            boxShadow:    `0 0 ${s.size * 3}px rgba(255,255,255,0.85)`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Cracking 4막 구조 ──────────────────────────────────────────────────────
//
// act 0 — 안쪽으로 움츠러들며 에너지를 모음 (미세한 떨림)
// act 1 — 첫 균열, 날카로운 잭트
// act 2 — 더 격렬한 흔들림, 금이 넓어지고 색수차 효과
// act 3 — 모든 흔들림이 멎고 알만 빛나며 정지 — *터지기 직전의 침묵*
// act 4 — 시간 정지 링 → 백색 섬광 → 충격파

// 점진적으로 그려지는 균열 SVG (pathLength 애니메이션)
function CrackPaths({ progress, size = 148 }: { progress: number; size?: number }) {
  const h = size * 1.22
  const paths = [
    'M50 22 L42 40 L52 52 L38 74 L48 88 L40 108',
    'M58 18 L66 38 L58 52 L70 68 L62 86',
    'M38 32 L30 54 L44 62 L34 82',
    'M50 24 L60 48 L46 64 L58 82',
  ]
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 100 122"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      {paths.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          stroke="#fff"
          fill="none"
          strokeWidth={1 + i * 0.3}
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 6px #fff) drop-shadow(0 0 12px #fde68a)' }}
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: progress, opacity: progress > 0 ? 1 : 0 }}
          transition={{ duration: 0.4, delay: i * 0.1 }}
        />
      ))}
    </svg>
  )
}

// 충격파 링 — 폭발 시점에 외곽으로 퍼지는 동심원
function ShockwaveRings({ color, count = 3 }: { color: string; count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 3 + i * 0.7, opacity: 0 }}
          transition={{ duration: 1 + i * 0.25, delay: i * 0.12, ease: 'easeOut' }}
          style={{
            position:     'absolute',
            left:         '50%',
            top:          '50%',
            width:        240,
            height:       240,
            marginLeft:   -120,
            marginTop:    -120,
            border:       `3px solid ${color}`,
            borderRadius: '50%',
            boxShadow:    `0 0 40px ${color}, inset 0 0 20px ${color}77`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}

interface CrackingStageViewProps {
  egg:       typeof EGG_DESIGNS[0]
  glowColor: string
  accent:    string
  onDone:    () => void
}

function CrackingStageView({ egg, glowColor, accent, onDone }: CrackingStageViewProps) {
  const [act, setAct] = useState(0)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    // 0 → 1: 준비(긴장 응축, 작은 떨림) — 길게 끌어 두려움 누적
    timers.push(setTimeout(() => setAct(1),  650))
    // 1 → 2: 첫 균열 후 두번째 잭트, 셰이크 강화
    timers.push(setTimeout(() => setAct(2), 1250))
    // 2 → 3: 정적 — 모든 것이 얼어붙는 그 한 박자
    timers.push(setTimeout(() => setAct(3), 1900))
    // 3 → 4: 폭발
    timers.push(setTimeout(() => setAct(4), 2200))
    // 종료
    timers.push(setTimeout(onDone,           2750))
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  // 균열 진행도 — act 단위로 단계적으로 그어짐
  const crackProgress = act >= 4 ? 1 : act >= 2 ? 0.85 : act >= 1 ? 0.45 : 0

  // 카메라 셰이크 — act 3 (정적)에서는 완전 정지
  const cameraShake =
    act === 0 ? 'wp-shake-sm 0.55s ease-in-out infinite' :
    act === 1 ? 'wp-shake-md 0.32s ease-in-out infinite' :
    act === 2 ? 'wp-shake-lg 0.18s ease-in-out infinite' :
    'none'

  // 알의 phase별 모션
  const eggAnimate =
    act === 0 ? {
      scale:   [1, 0.93, 0.92, 0.95],
      rotate:  [0, -4, 5, -2],
      y:       [0, 4, 2, 0],
    } :
    act === 1 ? {
      scale:   [0.95, 1.18, 1.05, 1.10],
      rotate:  [0, 14, -10, 6],
      x:       [0, -12, 8, 0],
    } :
    act === 2 ? {
      scale:   [1.10, 1.22, 1.12, 1.25],
      rotate:  [0, -16, 18, -12],
      x:       [0, 14, -16, 10],
      y:       [0, -3, 4, -2],
    } :
    act === 3 ? {
      // 정적 — 살짝 부풀어 죽은 듯 멈춤
      scale:   1.32,
      rotate:  0,
      x:       0,
      y:       0,
    } : {
      // 폭발 — 알이 펑 튀고 사라짐
      scale:   [1.32, 1.45, 0.05],
      opacity: [1, 1, 0],
    }

  const eggTransition =
    act === 0 ? { duration: 0.65, ease: [0.45, 0.05, 0.55, 0.95] as [number,number,number,number] } :
    act === 1 ? { duration: 0.6,  ease: [0.16, 0.78, 0.32, 1]   as [number,number,number,number] } :
    act === 2 ? { duration: 0.65, ease: [0.45, 0.05, 0.55, 0.95] as [number,number,number,number] } :
    act === 3 ? { duration: 0.3,  ease: [0.16, 0.78, 0.32, 1]   as [number,number,number,number] } :
                { duration: 0.45, ease: [0.16, 0.84, 0.44, 1]   as [number,number,number,number], times: [0, 0.18, 1] }

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22, ease: 'easeOut' } }}
      style={{
        position:       'absolute',
        inset:          0,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        zIndex:         1,
        animation:      cameraShake,
        perspective:    900,
      }}
    >
      {/* 비네트 — 정적 순간에 가장 깊게 닫힘 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: act >= 3 ? 0.88 : act >= 1 ? 0.6 : 0.35 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          position:      'absolute',
          inset:         0,
          background:    'radial-gradient(ellipse at center, transparent 18%, #000 78%)',
          pointerEvents: 'none',
        }}
      />

      {/* 시간 정지 링 — act 3 (정적) 순간에 한 번 번쩍임 */}
      {act === 3 && (
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: [0.4, 1.4, 1.6], opacity: [0, 0.9, 0] }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={{
            position:     'absolute',
            left:         '50%',
            top:          '50%',
            width:        340,
            height:       340,
            marginLeft:   -170,
            marginTop:    -170,
            border:       `2px solid ${glowColor}`,
            borderRadius: '50%',
            boxShadow:    `0 0 60px ${glowColor}, inset 0 0 30px ${glowColor}55`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* 폭발광 — act 4에서만 트리거 */}
      {act >= 4 && (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 1, 0], scale: [0.3, 6, 14] }}
            transition={{ duration: 0.55, ease: [0.16, 0.78, 0.32, 1] }}
            style={{
              position:     'absolute',
              left:         '50%',
              top:          '50%',
              width:        240,
              height:       240,
              marginLeft:   -120,
              marginTop:    -120,
              borderRadius: '50%',
              pointerEvents: 'none',
              background:   `radial-gradient(circle at center, #fff 0%, ${glowColor} 25%, ${accent}aa 55%, transparent 80%)`,
              mixBlendMode: 'screen',
              filter:       'blur(2px)',
            }}
          />
          {/* 백색 섬광 */}
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{
              position:     'absolute',
              inset:        0,
              background:   '#fff',
              mixBlendMode: 'screen',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
            <ShockwaveRings color={glowColor} count={3} />
          </div>
        </>
      )}

      {/* 알 — act에 따른 3 종류 모션 */}
      <motion.div
        animate={eggAnimate}
        transition={eggTransition}
        style={{
          position:        'relative',
          transformStyle:  'preserve-3d',
          filter:          `drop-shadow(0 0 ${40 + act * 20}px ${glowColor})`,
          animation:       act >= 1 && act <= 2 ? 'wp-chroma-shake 0.18s infinite' : 'none',
        }}
      >
        <EggSvg design={egg} size={148} />
        <CrackPaths progress={crackProgress} size={148} />

        {/* 균열에서 새어나오는 내부 빛 — 폭발까지 점점 커짐 */}
        <motion.div
          animate={{
            opacity: act === 0 ? 0.2 : act === 1 ? 0.45 : act === 2 ? 0.7 : act === 3 ? 0.95 : 0,
            scale:   act === 0 ? 0.6 : act === 1 ? 0.85 : act === 2 ? 1.1 : act === 3 ? 1.3 : 2,
          }}
          transition={{ duration: act === 3 ? 0.25 : 0.5, ease: 'easeOut' }}
          style={{
            position:     'absolute',
            inset:        0,
            borderRadius: '50%',
            pointerEvents: 'none',
            background:   `radial-gradient(circle at center, #fff 0%, ${glowColor} 35%, ${accent}88 65%, transparent 85%)`,
            mixBlendMode: 'screen',
            filter:       'blur(6px)',
          }}
        />
      </motion.div>
    </motion.div>
  )
}

// ─── Revealed result section ────────────────────────────────────────────────

interface RevealedContentProps {
  result:    PetResult
  particles: ParticleData[]
  onSummon:  () => void
}

function RevealedContent({ result, particles, onSummon }: RevealedContentProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: 0.15 }}
      style={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        gap:            '20px',
        position:       'relative',
        zIndex:         1,
      }}
    >
      {/* ── Particle explosion ── */}
      <div
        style={{
          position:  'absolute',
          top:       '80px',
          left:      '50%',
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          zIndex:    0,
        }}
      >
        {particles.map((p, i) => (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
            transition={{ duration: p.duration, delay: p.delay, ease: [0.2, 0.85, 0.35, 1] }}
            style={{
              position:     'absolute',
              width:        p.size,
              height:       p.size,
              borderRadius: '50%',
              background:   result.particleColors[p.colorIndex % result.particleColors.length],
              boxShadow:    `0 0 ${p.size * 2}px ${result.particleColors[p.colorIndex % result.particleColors.length]}`,
              transform:    'translate(-50%, -50%)',
            }}
          />
        ))}
      </div>

      {/* ── Halo rings burst ── */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`halo-${i}`}
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 2.8 + i * 0.6, opacity: 0 }}
          transition={{ duration: 0.75 + i * 0.2, delay: i * 0.14, ease: 'easeOut' }}
          style={{
            position:     'absolute',
            top:          '80px',
            left:         '50%',
            transform:    'translate(-50%, -50%)',
            width:        '130px',
            height:       '130px',
            borderRadius: '50%',
            border:       `3px solid ${result.glowColor}`,
            boxShadow:    `0 0 24px ${result.glowColor}, inset 0 0 12px ${result.glowColor}44`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* ── 뽑힌 펫 (Lottie 애니메이션) ── */}
      <motion.div
        initial={{ scale: 0, opacity: 0, rotate: -15 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 15, delay: 0.25 }}
        style={{
          position:     'relative',
          width:        '164px',
          height:       '164px',
          borderRadius: '50%',
          background:   `radial-gradient(ellipse at 35% 35%, ${result.glowColor}44 0%, ${result.glowColor}0a 70%)`,
          border:       `2px solid ${result.glowColor}55`,
          boxShadow:    `0 0 50px ${result.glowColor}77, 0 0 100px ${result.glowColor}33`,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          zIndex:       1,
        }}
      >
        {isLottiePetId(result.petId) ? (
          <Lottie
            animationData={PET_LOTTIE_MAP[result.petId]}
            loop={true}
            autoplay={true}
            style={{ width: '120px', height: '120px' }}
          />
        ) : (
          <SvgPet kind={result.petId as SvgPetId} action="dance" size={120} />
        )}

        {/* 회전 링 장식 */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
          style={{
            position:     'absolute',
            inset:        '-10px',
            borderRadius: '50%',
            background:   `conic-gradient(from 0deg, ${result.glowColor}, transparent 40%, ${result.glowColor}88 60%, transparent 80%, ${result.glowColor})`,
            WebkitMask:   'radial-gradient(farthest-side, transparent calc(100% - 3px), white calc(100% - 3px))',
            mask:         'radial-gradient(farthest-side, transparent calc(100% - 3px), white calc(100% - 3px))',
          }}
        />
        {/* 반대 방향 내부 링 */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 11, repeat: Infinity, ease: 'linear' }}
          style={{
            position:     'absolute',
            inset:        '-20px',
            borderRadius: '50%',
            background:   `conic-gradient(from 90deg, transparent 60%, ${result.glowColor}55 70%, transparent 80%)`,
            WebkitMask:   'radial-gradient(farthest-side, transparent calc(100% - 2px), white calc(100% - 2px))',
            mask:         'radial-gradient(farthest-side, transparent calc(100% - 2px), white calc(100% - 2px))',
          }}
        />
      </motion.div>

      {/* ── Grade badge ── */}
      <motion.div
        initial={{ scale: 0, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 440, damping: 18, delay: 0.5 }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            padding:      '6px 22px',
            borderRadius: '999px',
            background:   result.badgeGradient,
            boxShadow:    `0 4px 24px ${result.glowColor}99`,
          }}
        >
          <span
            style={{
              fontSize:      '12px',
              fontWeight:    900,
              letterSpacing: '3px',
              color:         '#fff',
              textShadow:    '0 1px 6px rgba(0,0,0,0.5)',
            }}
          >
            {result.grade}
          </span>
        </motion.div>
      </motion.div>

      {/* ── Pet name (gradient text) ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.68 }}
        style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}
      >
        <span
          style={{
            fontSize:               '22px',
            fontWeight:             900,
            background:             result.badgeGradient,
            WebkitBackgroundClip:   'text',
            WebkitTextFillColor:    'transparent',
            backgroundClip:         'text',
            letterSpacing:          '-0.3px',
          }}
        >
          {result.name}
        </span>
      </motion.div>

      {/* ── Message + CTA ── */}
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.88 }}
        style={{
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          gap:            '18px',
          position:       'relative',
          zIndex:         1,
          textAlign:      'center',
        }}
      >
        <div
          style={{
            fontSize:   '15px',
            color:      'rgba(255, 255, 255, 0.75)',
            maxWidth:   '270px',
            lineHeight: '1.65',
          }}
        >
          이번 주 월요일도 힘차게 시작해 볼까요? 🚀
        </div>

        <motion.button
          whileHover={{ scale: 1.07, boxShadow: `0 10px 36px ${result.glowColor}99` }}
          whileTap={{ scale: 0.96 }}
          onClick={() => onSummon()}
          style={{
            padding:      '13px 36px',
            borderRadius: '999px',
            background:   result.badgeGradient,
            border:       'none',
            color:        '#fff',
            fontSize:     '15px',
            fontWeight:   700,
            cursor:       'pointer',
            boxShadow:    `0 6px 24px ${result.glowColor}66`,
            letterSpacing: '0.3px',
            outline:      'none',
          }}
        >
          업무 시작하기 →
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

// ─── Summoning flight animation ─────────────────────────────────────────────

function SummoningPet({ result, onComplete }: { result: PetResult; onComplete: () => void }) {
  // 펫이 화면 중앙에서 우하단 코너(OrbitCharacter 위치)로 날아감
  // WanderingPetContainer default x = window.innerWidth - 88, bottom = 24px
  // 펫 중심점: (innerWidth - 56, innerHeight - 56)
  // 현재 중심점: (innerWidth/2, innerHeight/2)
  const dx = window.innerWidth  / 2 - 56
  const dy = window.innerHeight / 2 - 56

  return (
    <motion.div
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{ x: dx, y: dy, scale: 0.48, opacity: 0 }}
      transition={{
        x:       { duration: 0.65, ease: [0.4, 0, 0.2, 1] },
        y:       { duration: 0.65, ease: [0.4, 0, 0.2, 1] },
        scale:   { duration: 0.65, ease: [0.4, 0, 0.2, 1] },
        opacity: { delay: 0.45, duration: 0.2, ease: 'easeOut' },
      }}
      onAnimationComplete={onComplete}
      style={{
        position:       'absolute',
        left:           '50%',
        top:            '50%',
        marginLeft:     '-82px',
        marginTop:      '-82px',
        width:          '164px',
        height:         '164px',
        borderRadius:   '50%',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     `radial-gradient(ellipse at 35% 35%, ${result.glowColor}44 0%, ${result.glowColor}0a 70%)`,
        boxShadow:      `0 0 50px ${result.glowColor}77`,
        zIndex:         10,
        pointerEvents:  'none',
      }}
    >
      {isLottiePetId(result.petId) ? (
        <Lottie
          animationData={PET_LOTTIE_MAP[result.petId]}
          loop={true}
          autoplay={true}
          style={{ width: '120px', height: '120px' }}
        />
      ) : (
        <SvgPet kind={result.petId as SvgPetId} action="idle" size={120} />
      )}
    </motion.div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface MondayGachaProps {
  onClose?: () => void
  onPetSelected?: (pet: GachaResult) => void
}

export default function MondayGacha({ onClose, onPetSelected }: MondayGachaProps) {
  const [phase, setPhase]                 = useState<GachaPhase>('intro')
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [result, setResult]               = useState<PetResult | null>(null)
  const [buildupTiers, setBuildupTiers]   = useState<BuildupTierName[]>([])
  const [buildupIndex, setBuildupIndex]   = useState(0)

  // 파티클은 컴포넌트 수명 동안 고정 (리렌더 시 위치 변경 방지)
  const particles = useMemo(() => genParticles(30), [])

  // intro → selecting: 짧은 딜레이 후 자동 전환
  useEffect(() => {
    if (phase !== 'intro') return
    const t = setTimeout(() => setPhase('selecting'), 500)
    return () => clearTimeout(t)
  }, [phase])

  // buildup: 각 단계 타이머로 순차 진행 → 마지막 단계에서 직접 cracking 전환 (빈 프레임 방지)
  useEffect(() => {
    if (phase !== 'buildup') return
    const currentTier = buildupTiers[buildupIndex]
    if (!currentTier) { setPhase('cracking'); return }
    const isLast = buildupIndex === buildupTiers.length - 1
    const t = setTimeout(
      () => { if (isLast) setPhase('cracking'); else setBuildupIndex(i => i + 1) },
      BUILDUP_TIER_CONFIGS[currentTier].duration,
    )
    return () => clearTimeout(t)
  }, [phase, buildupIndex, buildupTiers])

  // cracking 단계의 페이즈 전환은 CrackingStageView가 onDone으로 트리거.
  // (예외 안전망: 컴포넌트가 마운트 안 된 경우 대비 백업 타이머)
  useEffect(() => {
    if (phase !== 'cracking') return
    const t = setTimeout(() => setPhase('revealed'), 3000)
    return () => clearTimeout(t)
  }, [phase])

  const handleEggClick = useCallback((index: number) => {
    if (phase !== 'selecting') return
    const picked   = pickRandomResult()
    const sequence = getBuildupSequence(picked.grade)
    setSelectedIndex(index)
    setResult(picked)
    setBuildupTiers(sequence)
    setBuildupIndex(0)
    setPhase('buildup')
  }, [phase])

  // 업무 시작하기 클릭 → 펫 소환 애니메이션 시작
  const handleSummon = useCallback(() => {
    if (!result) return
    onPetSelected?.({
      grade: result.grade,
      petId: result.petId,
      name: result.name,
      glowColor: result.glowColor,
      badgeGradient: result.badgeGradient,
    })
    setPhase('summoning')
  }, [result, onPetSelected])

  // summoning 애니메이션 완료 후 가챠 닫기 (SummoningPet.onAnimationComplete 에서도 호출하므로 백업 타이머)
  useEffect(() => {
    if (phase !== 'summoning') return
    const t = setTimeout(() => onClose?.(), 800)
    return () => clearTimeout(t)
  }, [phase, onClose])

  const selectedEgg = selectedIndex !== null ? EGG_DESIGNS[selectedIndex] : null
  const isSummoning = phase === 'summoning'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="이번 주 파트너 뽑기"
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         2147483647,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        backdropFilter: 'blur(16px)',
        pointerEvents:  'auto',
        fontFamily:     '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
        overflow:       'hidden',
        userSelect:     'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Shadow DOM 안에서만 유효한 셰이크/색수차 keyframes */}
      <style>{SHAKE_CSS}</style>

      {/* 배경 그라데이션 — 소환 시 페이드아웃 */}
      <motion.div
        animate={{ opacity: isSummoning ? 0 : 1 }}
        transition={{ duration: 0.45, delay: isSummoning ? 0.1 : 0 }}
        style={{
          position:   'absolute',
          inset:      0,
          background: 'radial-gradient(ellipse at 50% 38%, #1a0535 0%, #0c0020 55%, #000 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* 배경 별빛 — 소환 시 빠르게 페이드아웃 */}
      <motion.div
        animate={{ opacity: isSummoning ? 0 : 1 }}
        transition={{ duration: 0.25 }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        <BackgroundStars />
      </motion.div>

      {/* ── 타이틀: intro / selecting 에서만 표시 ── */}
      <AnimatePresence>
        {(phase === 'intro' || phase === 'selecting') && (
          <motion.div
            key="gacha-title"
            initial={{ y: -72, opacity: 0, scale: 0.88 }}
            animate={{ y: 0,   opacity: 1, scale: 1 }}
            exit={{
              y: -36, opacity: 0, scale: 0.88,
              transition: { duration: 0.22, ease: 'easeIn' },
            }}
            transition={{ type: 'spring', stiffness: 270, damping: 22, delay: 0.08 }}
            style={{
              marginBottom: '60px',
              textAlign:    'center',
              position:     'relative',
              zIndex:       1,
            }}
          >
            <motion.div
              animate={{ scale: [1, 1.025, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                fontSize:   '27px',
                fontWeight: 900,
                color:      '#fff',
                letterSpacing: '-0.4px',
                textShadow: '0 0 32px rgba(167,139,250,0.75), 0 2px 14px rgba(0,0,0,0.55)',
              }}
            >
              ✨ 이번 주의 파트너를 선택하세요! ✨
            </motion.div>
            <motion.div
              animate={{ opacity: [0.45, 0.85, 0.45] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              style={{
                marginTop:  '10px',
                fontSize:   '14px',
                color:      'rgba(255,255,255,0.58)',
                letterSpacing: '0.25px',
              }}
            >
              3개의 미스터리 알 중 하나를 선택하세요
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 알 선택 화면 (selecting) ── */}
      <AnimatePresence>
        {(phase === 'intro' || phase === 'selecting') && (
          <motion.div
            key="eggs-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.1 } }}
            exit={{ opacity: 0, transition: { duration: 0.18 } }}
            style={{
              display:        'flex',
              gap:            '44px',
              alignItems:     'center',
              justifyContent: 'center',
              position:       'relative',
              zIndex:         1,
            }}
          >
            {EGG_DESIGNS.map((egg, index) => (
              <motion.div
                key={egg.id}
                initial={{ y: 56, opacity: 0, scale: 0.75 }}
                animate={{ y: 0,  opacity: 1, scale: 1 }}
                transition={{
                  type: 'spring', stiffness: 340, damping: 22,
                  delay: 0.22 + index * 0.13,
                }}
                whileHover={{ y: -14, scale: 1.07 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => handleEggClick(index)}
                style={{
                  cursor:   'pointer',
                  position: 'relative',
                  filter:   `drop-shadow(0 10px 28px ${egg.glow}66)`,
                }}
              >
                <EggSvg design={egg} />

                {/* 맥동 후광 */}
                <motion.div
                  animate={{ scale: [1, 1.22, 1], opacity: [0.25, 0.55, 0.25] }}
                  transition={{
                    duration: 2 + index * 0.35,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: index * 0.45,
                  }}
                  style={{
                    position:     'absolute',
                    inset:        '-10px',
                    borderRadius: '60% 60% 52% 52%',
                    background:   `radial-gradient(ellipse at center, ${egg.glow}33, transparent 68%)`,
                    pointerEvents: 'none',
                  }}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Buildup 연출 (buildup) ── */}
      <AnimatePresence mode="wait">
        {phase === 'buildup' && selectedEgg && buildupTiers[buildupIndex] && (
          <BuildupStageView
            key={buildupTiers[buildupIndex]}
            tier={buildupTiers[buildupIndex]}
            egg={selectedEgg}
            isLastTier={buildupIndex === buildupTiers.length - 1}
          />
        )}
      </AnimatePresence>

      {/* ── 선택 후 흔들림 (cracking) — 4막 구조 ── */}
      <AnimatePresence>
        {phase === 'cracking' && selectedEgg && result && (
          <CrackingStageView
            key="cracking"
            egg={selectedEgg}
            glowColor={result.glowColor}
            accent={result.particleColors[0] ?? result.glowColor}
            onDone={() => setPhase('revealed')}
          />
        )}
      </AnimatePresence>

      {/* ── 결과 공개 (revealed) — summoning 시작 시 exit ── */}
      <AnimatePresence>
        {phase === 'revealed' && result && (
          <RevealedContent
            key="revealed"
            result={result}
            particles={particles}
            onSummon={handleSummon}
          />
        )}
      </AnimatePresence>

      {/* ── 소환 비행 애니메이션 (summoning) ── */}
      <AnimatePresence>
        {phase === 'summoning' && result && (
          <SummoningPet
            key="summoning"
            result={result}
            onComplete={() => onClose?.()}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
