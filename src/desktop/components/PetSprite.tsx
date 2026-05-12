import type { PetId, SvgPetId } from '../../shared/types'
import { isSvgPetId } from '../../shared/petCatalog'
import LottiePet from './LottiePet'
import Pico from './Pico'
import Mofu from './Mofu'
import Sprout from './Sprout'
import Nova from './Nova'
import Mochi from './Mochi'
import type { PetCharacterAction } from './petFaces'
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

const CHARACTER_FALLBACK: Record<PetAction, PetCharacterAction> = {
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
  peek: 'idle',
  stretch: 'smile',
  jump: 'smile',
  tumble: 'cry',
}

const SVG_COMPONENT: Record<SvgPetId, typeof Pico> = {
  pico: Pico,
  mofu: Mofu,
  sprout: Sprout,
  nova: Nova,
  mochi: Mochi,
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
    const charAction: PetCharacterAction = action
      ? CHARACTER_FALLBACK[action]
      : paused
        ? 'sleep'
        : walking
          ? 'walking'
          : 'idle'
    const Component = SVG_COMPONENT[kind]
    return <Component action={charAction} direction={direction} size={size} />
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
