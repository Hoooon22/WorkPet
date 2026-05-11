import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Lottie from 'lottie-react'
import type { LottieRefCurrentProps } from 'lottie-react'
import type { BMEnterFrameEvent } from 'lottie-web'
import type { LottiePetId } from '../../shared/types'

import catLottie from '../../assets/lottie/idle.json'
import rabbitLottie from '../../assets/lottie/pets/rabbit.json'
import hedgehogLottie from '../../assets/lottie/pets/hedgehog.json'
import raccoonLottie from '../../assets/lottie/pets/raccoon.json'
import unicornLottie from '../../assets/lottie/pets/unicorn.json'
import dogLottie from '../../assets/lottie/pets/dog.json'
import pandaLottie from '../../assets/lottie/pets/panda.json'
import lionLottie from '../../assets/lottie/pets/lion.json'
import dragonLottie from '../../assets/lottie/pets/dragon.json'

const LOTTIE_MAP: Record<LottiePetId, object> = {
  cat: catLottie,
  rabbit: rabbitLottie,
  hedgehog: hedgehogLottie,
  raccoon: raccoonLottie,
  unicorn: unicornLottie,
  dog: dogLottie,
  panda: pandaLottie,
  lion: lionLottie,
  dragon: dragonLottie,
}

// Walking variants are auto-discovered: drop `<petId>.json` into
// `src/assets/lottie/pets/walking/` and it'll be picked up here.
const WALKING_MODULES = import.meta.glob<{ default: object }>(
  '../../assets/lottie/pets/walking/*.json',
  { eager: true },
)
const WALKING_LOTTIE_MAP: Partial<Record<LottiePetId, object>> = (() => {
  const map: Partial<Record<LottiePetId, object>> = {}
  for (const [path, mod] of Object.entries(WALKING_MODULES)) {
    const id = path.split('/').pop()?.replace(/\.json$/, '') as LottiePetId | undefined
    if (id) map[id] = mod.default
  }
  return map
})()

// Frame to freeze on when paused — should map to a standing/rest pose for
// each pet so the pet doesn't appear caught mid-stride. Defaults to 0.
const LOTTIE_REST_FRAME: Partial<Record<LottiePetId, number>> = {
  raccoon: 84,
}

export const LOTTIE_PET_IDS: LottiePetId[] = [
  'cat',
  'rabbit',
  'hedgehog',
  'raccoon',
  'unicorn',
  'dog',
  'panda',
  'lion',
  'dragon',
]

export function isLottiePetId(s: unknown): s is LottiePetId {
  return typeof s === 'string' && (LOTTIE_PET_IDS as readonly string[]).includes(s)
}

interface LottiePetProps {
  kind: LottiePetId
  direction?: 'left' | 'right'
  size?: number
  walking?: boolean
  paused?: boolean
  onFrame?: (frame: number) => void
}

export default function LottiePet({
  kind,
  direction = 'left',
  size = 120,
  walking = false,
  paused = false,
  onFrame,
}: LottiePetProps) {
  const lottieRef = useRef<LottieRefCurrentProps>(null)
  const animationData =
    (walking ? WALKING_LOTTIE_MAP[kind] : undefined) ?? LOTTIE_MAP[kind]

  useEffect(() => {
    const r = lottieRef.current
    if (!r) return
    if (paused) r.goToAndStop(LOTTIE_REST_FRAME[kind] ?? 0, true)
    else r.play()
  }, [paused, animationData, kind])

  return (
    <motion.div
      animate={{
        rotateY: direction === 'right' ? 180 : 0,
        scaleY: paused ? [1, 0.98, 1] : 1,
      }}
      transition={{
        rotateY: { duration: 0.22 },
        scaleY: paused
          ? { duration: 3.9, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.2 },
      }}
      style={{
        width: size,
        height: size,
        filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.22))',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transformOrigin: 'bottom center',
      }}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop
        autoplay
        onEnterFrame={
          onFrame ? (e) => onFrame((e as BMEnterFrameEvent).currentTime) : undefined
        }
        style={{ width: '100%', height: '100%' }}
      />
    </motion.div>
  )
}
