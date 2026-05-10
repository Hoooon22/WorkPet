import { motion } from 'framer-motion'
import './pico.css'

export type PicoAction =
  | 'idle'
  | 'walking'
  | 'smile'
  | 'cry'
  | 'sleep'
  | 'wave'
  | 'love'
  | 'dance'
  | 'alert'
  | 'think'
  | 'surprise'
  | 'angry'

const FACES: Record<PicoAction, JSX.Element> = {
  idle: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="6" className="eye eye-left" />
      <circle cx="140" cy="98" r="6" className="eye eye-right" />
      <rect x="112" y="112" width="16" height="3" rx="1.5" className="mouth" />
    </g>
  ),
  walking: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="6" className="eye" />
      <circle cx="140" cy="98" r="6" className="eye" />
      <rect x="112" y="112" width="16" height="3" rx="1.5" className="mouth" />
    </g>
  ),
  smile: (
    <g className="face-eyes">
      <path d="M94 100 Q100 92 106 100" className="eye-arc" />
      <path d="M134 100 Q140 92 146 100" className="eye-arc" />
      <path d="M104 112 Q120 122 136 112" className="mouth-arc" />
      <circle cx="86" cy="110" r="4" className="blush" />
      <circle cx="154" cy="110" r="4" className="blush" />
    </g>
  ),
  cry: (
    <g className="face-eyes">
      <path d="M94 100 Q100 108 106 100" className="eye-arc cry-arc" />
      <path d="M134 100 Q140 108 146 100" className="eye-arc cry-arc" />
      <path d="M108 116 Q120 108 132 116" className="mouth-arc cry-mouth" />
      <path className="tear tear-1" d="M98 104 Q95 112 98 118 Q101 112 98 104 Z" />
      <path className="tear tear-2" d="M142 104 Q139 112 142 118 Q145 112 142 104 Z" />
    </g>
  ),
  sleep: (
    <g className="face-eyes">
      <rect x="92" y="98" width="16" height="3" rx="1.5" className="eye-line" />
      <rect x="132" y="98" width="16" height="3" rx="1.5" className="eye-line" />
      <text className="zzz zzz-1" x="158" y="76">z</text>
      <text className="zzz zzz-2" x="170" y="62">Z</text>
      <text className="zzz zzz-3" x="184" y="48">Z</text>
    </g>
  ),
  wave: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="6" className="eye" />
      <circle cx="140" cy="98" r="6" className="eye" />
      <path d="M104 112 Q120 120 136 112" className="mouth-arc" />
    </g>
  ),
  love: (
    <g className="face-eyes">
      <path className="heart-eye" d="M100 92 c -6 -7 -16 1 -10 8 c 2 3 7 7 10 10 c 3 -3 8 -7 10 -10 c 6 -7 -4 -15 -10 -8 z" transform="translate(-8 0) scale(0.7) translate(38 38)" />
      <path className="heart-eye" d="M140 92 c -6 -7 -16 1 -10 8 c 2 3 7 7 10 10 c 3 -3 8 -7 10 -10 c 6 -7 -4 -15 -10 -8 z" transform="translate(32 0) scale(0.7) translate(38 38)" />
      <path d="M104 116 Q120 124 136 116" className="mouth-arc" />
    </g>
  ),
  dance: (
    <g className="face-eyes">
      <path d="M94 100 Q100 92 106 100" className="eye-arc" />
      <path d="M134 100 Q140 92 146 100" className="eye-arc" />
      <ellipse cx="120" cy="116" rx="9" ry="5" className="mouth-open" />
    </g>
  ),
  alert: (
    <g className="face-eyes">
      <rect x="98" y="86" width="4" height="14" rx="1.5" className="excl" />
      <rect x="98" y="104" width="4" height="4" rx="1.5" className="excl" />
      <rect x="138" y="86" width="4" height="14" rx="1.5" className="excl" />
      <rect x="138" y="104" width="4" height="4" rx="1.5" className="excl" />
    </g>
  ),
  think: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="6" className="eye" />
      <path d="M132 96 q 0 -8 8 -8 q 8 0 8 8 q 0 5 -8 8 v 4" className="qmark" />
      <circle cx="140" cy="116" r="2" className="qmark-dot" />
    </g>
  ),
  surprise: (
    <g className="face-eyes">
      <circle cx="100" cy="98" r="8" className="eye eye-big" />
      <circle cx="140" cy="98" r="8" className="eye eye-big" />
      <circle cx="120" cy="116" r="4" className="mouth-o" />
    </g>
  ),
  angry: (
    <g className="face-eyes">
      <rect x="91" y="89" width="14" height="3" rx="1.5" className="brow brow-l" />
      <rect x="135" y="89" width="14" height="3" rx="1.5" className="brow brow-r" />
      <circle cx="100" cy="100" r="5" className="eye" />
      <circle cx="140" cy="100" r="5" className="eye" />
      <path d="M108 118 Q120 110 132 118" className="mouth-arc mouth-frown" />
    </g>
  ),
}

interface PicoProps {
  action?: PicoAction
  direction?: 'left' | 'right'
  size?: number
}

export default function Pico({ action = 'idle', direction = 'left', size = 120 }: PicoProps) {
  return (
    <motion.div
      animate={{ rotateY: direction === 'right' ? 180 : 0 }}
      transition={{ duration: 0.22 }}
      style={{
        width: size,
        height: size,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transformOrigin: 'bottom center',
      }}
    >
      <svg
        className="pico"
        data-action={action}
        viewBox="0 0 240 340"
        style={{ width: '100%', height: '100%', filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.22))' }}
      >
        <defs>
          <linearGradient id="pico-shell" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#e8edf5" />
          </linearGradient>
          <linearGradient id="pico-shell-deep" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f3f4f6" />
            <stop offset="100%" stopColor="#cfd6e2" />
          </linearGradient>
          <linearGradient id="pico-screen" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0b1220" />
            <stop offset="100%" stopColor="#1a2542" />
          </linearGradient>
          <radialGradient id="pico-core" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="60%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </radialGradient>
          <linearGradient id="pico-foot" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1f2937" />
          </linearGradient>
        </defs>

        <ellipse className="ground-shadow" cx="120" cy="322" rx="70" ry="6" />

        <g className="body-wrap">
          <g className="leg leg-left">
            <rect x="93" y="232" width="18" height="42" rx="8" fill="url(#pico-shell-deep)" />
            <rect x="93" y="232" width="18" height="6" rx="3" fill="#cbd5e1" />
            <ellipse cx="102" cy="280" rx="16" ry="9" fill="url(#pico-foot)" />
          </g>
          <g className="leg leg-right">
            <rect x="129" y="232" width="18" height="42" rx="8" fill="url(#pico-shell-deep)" />
            <rect x="129" y="232" width="18" height="6" rx="3" fill="#cbd5e1" />
            <ellipse cx="138" cy="280" rx="16" ry="9" fill="url(#pico-foot)" />
          </g>

          <g className="arm arm-left">
            <circle cx="78" cy="170" r="9" fill="url(#pico-shell-deep)" />
            <rect x="70" y="172" width="16" height="34" rx="8" fill="url(#pico-shell)" />
            <circle cx="78" cy="212" r="10" fill="#e8edf5" stroke="#cbd5e1" strokeWidth="1" />
            <circle cx="78" cy="212" r="4" fill="#94a3b8" opacity="0.4" />
          </g>
          <g className="arm arm-right">
            <circle cx="162" cy="170" r="9" fill="url(#pico-shell-deep)" />
            <rect x="154" y="172" width="16" height="34" rx="8" fill="url(#pico-shell)" />
            <circle cx="162" cy="212" r="10" fill="#e8edf5" stroke="#cbd5e1" strokeWidth="1" />
            <circle cx="162" cy="212" r="4" fill="#94a3b8" opacity="0.4" />
          </g>

          <g className="torso">
            <rect x="76" y="148" width="88" height="92" rx="22" fill="url(#pico-shell)" stroke="#dbeafe" strokeWidth="1.2" />
            <rect x="86" y="158" width="68" height="72" rx="14" fill="#f8faff" stroke="#dbeafe" strokeWidth="1" />
            <line x1="120" y1="158" x2="120" y2="230" stroke="#e5e7eb" strokeWidth="1" />
            <circle cx="120" cy="194" r="13" fill="url(#pico-core)" />
            <circle cx="120" cy="194" r="13" fill="none" stroke="#1d4ed8" strokeWidth="1" opacity="0.6" />
            <circle className="core-pulse" cx="120" cy="194" r="6" fill="#bfdbfe" opacity="0.85" />
            <circle cx="98" cy="222" r="2" fill="#22c55e" />
            <circle cx="106" cy="222" r="2" fill="#f59e0b" />
            <circle cx="114" cy="222" r="2" fill="#94a3b8" />
          </g>

          <g className="head">
            <g className="antenna">
              <line x1="120" y1="48" x2="120" y2="22" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
              <circle className="antenna-bulb" cx="120" cy="18" r="6" fill="#3b82f6" />
              <circle className="antenna-glow" cx="120" cy="18" r="11" fill="#3b82f6" opacity="0.25" />
            </g>
            <rect x="58" y="50" width="124" height="98" rx="28" fill="url(#pico-shell)" stroke="#dbeafe" strokeWidth="1.2" />
            <path d="M70 62 q 0 -10 10 -10 h 30" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.9" />
            <circle cx="55" cy="100" r="8" fill="url(#pico-shell-deep)" />
            <circle cx="55" cy="100" r="4" fill="#64748b" />
            <circle cx="185" cy="100" r="8" fill="url(#pico-shell-deep)" />
            <circle cx="185" cy="100" r="4" fill="#64748b" />
            <rect x="72" y="74" width="96" height="56" rx="14" fill="url(#pico-screen)" />
            <rect x="72" y="74" width="96" height="56" rx="14" fill="none" stroke="#0a0e1a" strokeWidth="1" />
            <path d="M78 80 L96 80 L78 92 Z" fill="#ffffff" opacity="0.06" />
            <g className="face">{FACES[action]}</g>
          </g>
        </g>
      </svg>
    </motion.div>
  )
}
