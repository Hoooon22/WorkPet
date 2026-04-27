/**
 * SvgPet.tsx — Work-Pet 디자인 시스템의 8종 SVG 펫 캐릭터
 *
 * 캐릭터: fox · frog · penguin · turtle · owl · octopus · chick · bear
 * 액션:   petActions.ts 의 12 종 vocabulary 공유
 *
 * Lottie 펫과 시각적 grammar(squash-stretch, direction flip via rotateY,
 * Zzz/Hearts/Sparkles overlay)를 동일하게 맞춰 OrbitCharacter에서 호환된다.
 */

import { motion } from 'framer-motion'
import type { SvgPetId } from '../../types/messages'
import { getPetActionMotion, type PetAction } from './petActions'

type Mood = 'happy' | 'sleepy' | 'sleep' | 'yawn' | 'love' | 'wink' | 'idle'
type Direction = 'left' | 'right'

interface SvgPetProps {
  kind: SvgPetId
  action?: PetAction
  direction?: Direction
  mood?: Mood
  size?: number
}

// ── 공통 sub-components ────────────────────────────────────────────

function Eyes({
  mood, x1 = 34, x2 = 66, y = 44, r = 4, color = '#1f2937',
}: { mood: Mood; x1?: number; x2?: number; y?: number; r?: number; color?: string }) {
  const shape =
    mood === 'sleepy' || mood === 'sleep' ? 'closed' :
    mood === 'happy'  || mood === 'love'  ? 'smile'  :
    mood === 'wink'                       ? 'wink'   : 'dot'

  const renderEye = (cx: number, isLeft: boolean) => {
    if (shape === 'closed')
      return <path d={`M${cx - 6} ${y + 2} Q${cx} ${y - 4} ${cx + 6} ${y + 2}`} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    if (shape === 'smile')
      return <path d={`M${cx - 6} ${y - 2} Q${cx} ${y + 4} ${cx + 6} ${y - 2}`} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    if (shape === 'wink' && isLeft)
      return <path d={`M${cx - 5} ${y + 1} Q${cx} ${y - 3} ${cx + 5} ${y + 1}`} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    return <circle cx={cx} cy={y} r={r} fill={color} />
  }
  return (
    <>
      {renderEye(x1, true)}
      {renderEye(x2, false)}
    </>
  )
}

function Mouth({
  mood, x = 50, y = 62, w = 8,
}: { mood: Mood; x?: number; y?: number; w?: number }) {
  if (mood === 'yawn')
    return <ellipse cx={x} cy={y + 3} rx={w * 0.6} ry={w * 0.9} fill="#1f2937" />
  if (mood === 'sleep')
    return <path d={`M${x - w / 2} ${y} Q${x} ${y + 2} ${x + w / 2} ${y}`} stroke="#1f2937" strokeWidth="1.6" fill="none" />
  if (mood === 'happy')
    return <path d={`M${x - w / 2} ${y} Q${x} ${y + 5} ${x + w / 2} ${y}`} stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
  if (mood === 'love')
    return <path d={`M${x - w / 2} ${y - 1} Q${x} ${y + 6} ${x + w / 2} ${y - 1}`} stroke="#db2777" strokeWidth="2.2" fill="#fecdd3" strokeLinecap="round" />
  return <path d={`M${x - w / 2.5} ${y + 1} Q${x} ${y + 3} ${x + w / 2.5} ${y + 1}`} stroke="#1f2937" strokeWidth="1.8" fill="none" strokeLinecap="round" />
}

// ── Particle overlays (액션별 효과) ────────────────────────────────

function ZzzOverlay() {
  return (
    <>
      {[0, 0.6, 1.2].map((delay, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, x: i * 3, y: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [0, -14, -28, -42],
            x: [i * 3, i * 3 + 5, i * 3 + 8, i * 3 + 12],
          }}
          transition={{ duration: 2.4, delay, repeat: Infinity, ease: 'easeOut' }}
          style={{
            position: 'absolute', top: -8, left: '62%',
            fontSize: 10 + i * 3, color: '#93c5fd',
            fontWeight: 800, userSelect: 'none', pointerEvents: 'none',
            fontFamily: 'sans-serif',
          }}
        >
          {i === 2 ? 'Z' : 'z'}
        </motion.span>
      ))}
    </>
  )
}

function HeartsOverlay() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [0, -50, -80, -110],
            x: [(i - 1.5) * 8, (i - 1.5) * 14, (i - 1.5) * 20, (i - 1.5) * 26],
            scale: [0.5, 1.1, 1, 0.7],
          }}
          transition={{ duration: 2, delay: i * 0.35, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' }}
          style={{
            position: 'absolute', top: -6, left: '50%', marginLeft: -7,
            pointerEvents: 'none', fontSize: 14,
          }}
        >
          💗
        </motion.div>
      ))}
    </>
  )
}

function SparklesOverlay({ color = '#fde047' }: { color?: string }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            x: Math.cos((i / 6) * Math.PI * 2) * 40,
            y: Math.sin((i / 6) * Math.PI * 2) * 40 - 10,
            scale: [0, 1.2, 0],
          }}
          transition={{ duration: 1.2, delay: i * 0.1, repeat: Infinity, repeatDelay: 0.4 }}
          style={{
            position: 'absolute', top: '45%', left: '50%',
            width: 6, height: 6, marginLeft: -3, marginTop: -3,
            background: color,
            clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  )
}

function AlertBadgeOverlay() {
  return (
    <motion.div
      animate={{ scale: [1, 1.25, 1] }}
      transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        position: 'absolute', top: -14, left: '50%',
        transform: 'translateX(-50%)',
        width: 22, height: 22,
        background: '#ef4444', color: '#fff', borderRadius: '50%',
        fontWeight: 800, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.55)',
        zIndex: 10, fontFamily: 'sans-serif',
      }}
    >
      !
    </motion.div>
  )
}

// ── 8종 SVG 캐릭터 ───────────────────────────────────────────────────

interface BodyProps { mood: Mood; direction: Direction }

const PET_BODIES: Record<SvgPetId, (p: BodyProps) => JSX.Element> = {
  /* 🦊 Fox — clever, winks */
  fox: ({ mood }) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <radialGradient id="fox-g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </radialGradient>
      </defs>
      <motion.path
        d="M 76 60 Q 92 54 90 72 Q 82 78 72 70 Z"
        fill="#f97316" stroke="#c2410c" strokeWidth="1.5"
        animate={{ rotate: [-8, 8, -8] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '76px', originY: '60px' }}
      />
      <path d="M 86 68 Q 92 62 92 72" fill="#fff" stroke="#c2410c" strokeWidth="1" />
      <path d="M 28 32 L 22 18 L 36 28 Z" fill="url(#fox-g)" stroke="#c2410c" strokeWidth="1.5" />
      <path d="M 72 32 L 78 18 L 64 28 Z" fill="url(#fox-g)" stroke="#c2410c" strokeWidth="1.5" />
      <path d="M 28 30 L 26 24 L 34 28 Z" fill="#fef3c7" />
      <path d="M 72 30 L 74 24 L 66 28 Z" fill="#fef3c7" />
      <ellipse cx="50" cy="62" rx="26" ry="22" fill="url(#fox-g)" stroke="#c2410c" strokeWidth="1.5" />
      <ellipse cx="50" cy="45" rx="26" ry="22" fill="url(#fox-g)" stroke="#c2410c" strokeWidth="1.5" />
      <path d="M 36 52 Q 50 62 64 52 Q 50 68 36 52 Z" fill="#fef3c7" />
      <Eyes mood={mood === 'happy' ? 'wink' : mood} x1={38} x2={62} y={43} r={3.5} />
      <ellipse cx="50" cy="58" rx="2" ry="1.5" fill="#1f2937" />
      <Mouth mood={mood} x={50} y={63} w={6} />
    </svg>
  ),

  /* 🐸 Frog — bouncy */
  frog: ({ mood }) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <radialGradient id="frog-g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#86efac" />
          <stop offset="100%" stopColor="#16a34a" />
        </radialGradient>
      </defs>
      <ellipse cx="20" cy="78" rx="10" ry="6" fill="#16a34a" />
      <ellipse cx="80" cy="78" rx="10" ry="6" fill="#16a34a" />
      <ellipse cx="50" cy="58" rx="32" ry="26" fill="url(#frog-g)" stroke="#166534" strokeWidth="1.5" />
      <path d="M 24 54 Q 50 80 76 54" stroke="#166534" strokeWidth="1" fill="none" />
      <circle cx="32" cy="30" r="12" fill="url(#frog-g)" stroke="#166534" strokeWidth="1.5" />
      <circle cx="68" cy="30" r="12" fill="url(#frog-g)" stroke="#166534" strokeWidth="1.5" />
      <circle cx="32" cy="30" r="8" fill="#fff" />
      <circle cx="68" cy="30" r="8" fill="#fff" />
      <circle cx="32" cy="30" r={mood === 'happy' ? 3.5 : 5} fill="#1f2937" />
      <circle cx="68" cy="30" r={mood === 'happy' ? 3.5 : 5} fill="#1f2937" />
      <Mouth mood={mood} x={50} y={62} w={16} />
    </svg>
  ),

  /* 🐧 Penguin — formal waddle */
  penguin: ({ mood }) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <ellipse cx="50" cy="55" rx="30" ry="36" fill="#1f2937" stroke="#0f172a" strokeWidth="1.5" />
      <ellipse cx="50" cy="62" rx="22" ry="28" fill="#fff" />
      <ellipse cx="38" cy="92" rx="9" ry="4" fill="#f97316" />
      <ellipse cx="62" cy="92" rx="9" ry="4" fill="#f97316" />
      <motion.path
        d="M 20 50 Q 10 62 18 78 Q 26 70 26 54 Z" fill="#0f172a"
        animate={{ rotate: [-3, 8, -3] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '20px', originY: '55px' }}
      />
      <motion.path
        d="M 80 50 Q 90 62 82 78 Q 74 70 74 54 Z" fill="#0f172a"
        animate={{ rotate: [3, -8, 3] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ originX: '80px', originY: '55px' }}
      />
      <path d="M 46 42 L 54 42 L 50 48 Z" fill="#f97316" />
      <Eyes mood={mood} x1={42} x2={58} y={36} r={2.5} color="#fff" />
    </svg>
  ),

  /* 🐢 Turtle — retreats to shell */
  turtle: ({ mood }) => {
    const retreated = mood === 'sleep' || mood === 'sleepy'
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <defs>
          <radialGradient id="turtle-shell" cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#a3e635" />
            <stop offset="100%" stopColor="#4d7c0f" />
          </radialGradient>
        </defs>
        <ellipse cx="24" cy="72" rx="8" ry="5" fill="#86efac" />
        <ellipse cx="76" cy="72" rx="8" ry="5" fill="#86efac" />
        <ellipse cx="28" cy="82" rx="7" ry="4" fill="#86efac" />
        <ellipse cx="72" cy="82" rx="7" ry="4" fill="#86efac" />
        <motion.g
          animate={retreated ? { y: 16, scale: 0.7 } : { y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        >
          <ellipse cx="50" cy="30" rx="15" ry="13" fill="#86efac" stroke="#4d7c0f" strokeWidth="1.3" />
          <Eyes mood={mood} x1={44} x2={56} y={28} r={2.5} />
          <path d="M 46 34 Q 50 36 54 34" stroke="#4d7c0f" strokeWidth="1.2" fill="none" />
        </motion.g>
        <ellipse cx="50" cy="62" rx="36" ry="26" fill="url(#turtle-shell)" stroke="#365314" strokeWidth="1.5" />
        <path d="M 30 62 L 50 50 L 70 62 L 60 78 L 40 78 Z" fill="none" stroke="#365314" strokeWidth="1.2" />
        <circle cx="50" cy="64" r="5" fill="none" stroke="#365314" strokeWidth="1.2" />
      </svg>
    )
  },

  /* 🦉 Owl — head swivels with direction */
  owl: ({ mood, direction }) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <radialGradient id="owl-g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#c4a888" />
          <stop offset="100%" stopColor="#78350f" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="64" rx="30" ry="30" fill="url(#owl-g)" stroke="#451a03" strokeWidth="1.5" />
      <ellipse cx="50" cy="70" rx="20" ry="18" fill="#fef3c7" opacity="0.7" />
      <path d="M 40 92 L 38 96 M 42 92 L 42 96 M 44 92 L 46 96" stroke="#f97316" strokeWidth="2" />
      <path d="M 56 92 L 54 96 M 58 92 L 58 96 M 60 92 L 62 96" stroke="#f97316" strokeWidth="2" />
      <motion.g
        animate={{ rotate: direction === 'right' ? 15 : -15 }}
        transition={{ type: 'spring', stiffness: 150, damping: 15 }}
        style={{ originX: '50px', originY: '45px' }}
      >
        <ellipse cx="50" cy="40" rx="26" ry="24" fill="url(#owl-g)" stroke="#451a03" strokeWidth="1.5" />
        <path d="M 30 22 L 36 10 L 40 24 Z" fill="#78350f" />
        <path d="M 70 22 L 64 10 L 60 24 Z" fill="#78350f" />
        <circle cx="38" cy="40" r="10" fill="#fef3c7" stroke="#451a03" strokeWidth="1" />
        <circle cx="62" cy="40" r="10" fill="#fef3c7" stroke="#451a03" strokeWidth="1" />
        {mood === 'sleep' || mood === 'sleepy' || mood === 'yawn' ? (
          <>
            <path d="M 32 40 Q 38 36 44 40" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 56 40 Q 62 36 68 40" stroke="#1f2937" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="38" cy="40" r="5" fill="#1f2937" />
            <circle cx="62" cy="40" r="5" fill="#1f2937" />
            <circle cx="39" cy="38" r="1.6" fill="#fff" />
            <circle cx="63" cy="38" r="1.6" fill="#fff" />
          </>
        )}
        <path d="M 46 50 L 54 50 L 50 56 Z" fill="#f97316" stroke="#c2410c" strokeWidth="0.8" />
      </motion.g>
    </svg>
  ),

  /* 🐙 Octopus — tentacle waves */
  octopus: ({ mood }) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <radialGradient id="oct-g" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f0abfc" />
          <stop offset="100%" stopColor="#a855f7" />
        </radialGradient>
      </defs>
      {[...Array(8)].map((_, i) => {
        const angle = -100 + i * 28
        const rad = (angle * Math.PI) / 180
        const x1 = 50 + Math.cos(rad) * 28
        const y1 = 60 + Math.sin(rad) * 18
        const x2 = 50 + Math.cos(rad) * 36
        const y2 = 80 + Math.sin(rad) * 10
        return (
          <motion.path
            key={i}
            d={`M 50 58 Q ${x1} ${y1 - 6} ${x2} ${y2}`}
            stroke="#a855f7" strokeWidth="6" fill="none" strokeLinecap="round"
            animate={{
              d: [
                `M 50 58 Q ${x1} ${y1 - 6} ${x2} ${y2}`,
                `M 50 58 Q ${x1 + 3} ${y1 - 2} ${x2 - 2} ${y2 + 4}`,
                `M 50 58 Q ${x1} ${y1 - 6} ${x2} ${y2}`,
              ],
            }}
            transition={{ duration: 1.4 + i * 0.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.05 }}
          />
        )
      })}
      <ellipse cx="50" cy="42" rx="26" ry="24" fill="url(#oct-g)" stroke="#7e22ce" strokeWidth="1.5" />
      <path d="M 30 30 Q 50 20 70 30" stroke="#7e22ce" strokeWidth="1" fill="none" opacity="0.5" />
      <Eyes mood={mood} x1={40} x2={60} y={42} r={3} />
      <circle cx="40" cy="40.5" r="1" fill="#fff" />
      <circle cx="60" cy="40.5" r="1" fill="#fff" />
      <Mouth mood={mood} x={50} y={52} w={6} />
    </svg>
  ),

  /* 🐥 Chick — tiny, always bouncing */
  chick: ({ mood }) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <radialGradient id="chick-g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#eab308" />
        </radialGradient>
      </defs>
      <motion.path
        d="M 40 86 L 36 92 M 40 86 L 40 92 M 40 86 L 44 92"
        stroke="#f97316" strokeWidth="2" strokeLinecap="round"
        animate={{ y: [0, -2, 0] }} transition={{ duration: 0.4, repeat: Infinity }}
      />
      <motion.path
        d="M 60 86 L 56 92 M 60 86 L 60 92 M 60 86 L 64 92"
        stroke="#f97316" strokeWidth="2" strokeLinecap="round"
        animate={{ y: [0, -2, 0] }} transition={{ duration: 0.4, repeat: Infinity, delay: 0.2 }}
      />
      <ellipse cx="50" cy="60" rx="26" ry="26" fill="url(#chick-g)" stroke="#a16207" strokeWidth="1.5" />
      <motion.path
        d="M 26 60 Q 20 68 28 72 Z" fill="#facc15"
        animate={{ rotate: [-5, 10, -5] }} transition={{ duration: 0.8, repeat: Infinity }}
        style={{ originX: '26px', originY: '60px' }}
      />
      <motion.path
        d="M 74 60 Q 80 68 72 72 Z" fill="#facc15"
        animate={{ rotate: [5, -10, 5] }} transition={{ duration: 0.8, repeat: Infinity }}
        style={{ originX: '74px', originY: '60px' }}
      />
      <Eyes mood={mood} x1={42} x2={58} y={52} r={3} />
      <path d="M 44 62 L 56 62 L 50 68 Z" fill="#f97316" />
      <path d="M 44 36 Q 50 32 56 36" stroke="#a16207" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  ),

  /* 🐻 Bear — big and chill */
  bear: ({ mood }) => (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <defs>
        <radialGradient id="bear-g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#c4a484" />
          <stop offset="100%" stopColor="#78350f" />
        </radialGradient>
      </defs>
      <circle cx="28" cy="28" r="10" fill="url(#bear-g)" stroke="#451a03" strokeWidth="1.3" />
      <circle cx="72" cy="28" r="10" fill="url(#bear-g)" stroke="#451a03" strokeWidth="1.3" />
      <circle cx="28" cy="28" r="5" fill="#fbbf24" />
      <circle cx="72" cy="28" r="5" fill="#fbbf24" />
      <ellipse cx="50" cy="66" rx="32" ry="26" fill="url(#bear-g)" stroke="#451a03" strokeWidth="1.5" />
      <circle cx="50" cy="46" r="24" fill="url(#bear-g)" stroke="#451a03" strokeWidth="1.5" />
      <ellipse cx="50" cy="55" rx="12" ry="8" fill="#fef3c7" />
      <Eyes mood={mood} x1={41} x2={59} y={44} r={2.5} />
      <ellipse cx="50" cy="52" rx="3" ry="2" fill="#1f2937" />
      <Mouth mood={mood} x={50} y={60} w={8} />
    </svg>
  ),
}

// ── Public component ────────────────────────────────────────────────

export const SVG_PET_IDS: SvgPetId[] = ['fox', 'frog', 'penguin', 'turtle', 'owl', 'octopus', 'chick', 'bear']

export function isSvgPetId(id: string): id is SvgPetId {
  return (SVG_PET_IDS as string[]).includes(id)
}

export default function SvgPet({
  kind, action = 'idle', direction = 'left', mood = 'happy', size = 64,
}: SvgPetProps) {
  const Body = PET_BODIES[kind]
  if (!Body) return <div style={{ width: size, height: size }} />

  const { animate, transition } = getPetActionMotion(action)

  // 액션이 캐릭터 표정을 덮어씀 (sleep → 눈 감음 등)
  const effectiveMood: Mood =
    action === 'sleep' ? 'sleep' :
    action === 'yawn'  ? 'yawn'  :
    action === 'love'  ? 'love'  :
    mood

  return (
    <div
      style={{
        position: 'relative', width: size, height: size,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {action === 'sleep' && <ZzzOverlay />}
      {action === 'love'  && <HeartsOverlay />}
      {action === 'dance' && <SparklesOverlay color="#fde047" />}
      {action === 'alert' && <AlertBadgeOverlay />}

      <motion.div
        animate={animate}
        transition={transition}
        style={{ originY: 1, originX: 0.5, width: '100%', height: '100%' }}
      >
        <motion.div
          animate={{ rotateY: direction === 'right' ? 180 : 0 }}
          transition={{ duration: 0.22 }}
          style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.22))' }}
        >
          <Body mood={effectiveMood} direction={direction} />
        </motion.div>
      </motion.div>
    </div>
  )
}
