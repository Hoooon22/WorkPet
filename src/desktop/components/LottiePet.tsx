import { motion } from 'framer-motion'
import Lottie from 'lottie-react'
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
  onFrame?: (frame: number) => void
}

export default function LottiePet({
  kind,
  direction = 'left',
  size = 120,
  walking = false,
  onFrame,
}: LottiePetProps) {
  const animationData =
    (walking ? WALKING_LOTTIE_MAP[kind] : undefined) ?? LOTTIE_MAP[kind]
  return (
    <motion.div
      animate={{ rotateY: direction === 'right' ? 180 : 0 }}
      transition={{ duration: 0.22 }}
      style={{
        width: size,
        height: size,
        filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.22))',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <Lottie
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
