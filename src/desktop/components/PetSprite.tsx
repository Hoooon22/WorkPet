import type { PetId } from '../../shared/types'
import { isSvgPetId } from '../../shared/petCatalog'
import LottiePet from './LottiePet'
import Pico, { type PicoAction } from './Pico'
import type { PetAction } from './petActions'

interface PetSpriteProps {
  kind: PetId
  action?: PetAction
  direction?: 'left' | 'right'
  size?: number
  walking?: boolean
  paused?: boolean
  onFrame?: (frame: number) => void
}

const PICO_FALLBACK: Record<PetAction, PicoAction> = {
  idle: 'idle',
  walk: 'walking',
  sleep: 'sleep',
  alert: 'alert',
  wave: 'wave',
  love: 'love',
  dance: 'dance',
  smile: 'smile',
  cry: 'cry',
  think: 'think',
  surprise: 'surprise',
  angry: 'angry',
  yawn: 'sleep',
  peek: 'surprise',
  stretch: 'idle',
  jump: 'surprise',
  tumble: 'cry',
}

export default function PetSprite({
  kind,
  action,
  direction = 'left',
  size = 120,
  walking = false,
  paused = false,
  onFrame,
}: PetSpriteProps) {
  if (isSvgPetId(kind)) {
    const picoAction: PicoAction = action
      ? PICO_FALLBACK[action]
      : paused
        ? 'sleep'
        : walking
          ? 'walking'
          : 'idle'
    return <Pico action={picoAction} direction={direction} size={size} />
  }
  return (
    <LottiePet
      kind={kind}
      direction={direction}
      size={size}
      walking={walking}
      paused={paused}
      onFrame={onFrame}
    />
  )
}
