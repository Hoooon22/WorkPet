import { motion } from 'framer-motion'
import Lottie from 'lottie-react'
import type { LottiePetId } from '../../shared/types'

import catLottie from '../../assets/lottie/idle.json'
import rabbitLottie from '../../assets/lottie/pets/rabbit.json'
import hedgehogLottie from '../../assets/lottie/pets/hedgehog.json'
import raccoonLottie from '../../assets/lottie/pets/raccoon.json'
import unicornLottie from '../../assets/lottie/pets/unicorn.json'

const LOTTIE_MAP: Record<LottiePetId, object> = {
  cat: catLottie,
  rabbit: rabbitLottie,
  hedgehog: hedgehogLottie,
  raccoon: raccoonLottie,
  unicorn: unicornLottie,
}

export const LOTTIE_PET_IDS: LottiePetId[] = ['cat', 'rabbit', 'hedgehog', 'raccoon', 'unicorn']

export function isLottiePetId(s: unknown): s is LottiePetId {
  return typeof s === 'string' && (LOTTIE_PET_IDS as readonly string[]).includes(s)
}

interface LottiePetProps {
  kind: LottiePetId
  direction?: 'left' | 'right'
  size?: number
}

export default function LottiePet({ kind, direction = 'left', size = 120 }: LottiePetProps) {
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
        animationData={LOTTIE_MAP[kind]}
        loop
        autoplay
        style={{ width: '100%', height: '100%' }}
      />
    </motion.div>
  )
}
