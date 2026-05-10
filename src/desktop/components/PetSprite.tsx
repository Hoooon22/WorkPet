import type { PetId } from '../../shared/types'
import { isSvgPetId } from '../../shared/petCatalog'
import LottiePet from './LottiePet'
import Pico from './Pico'

interface PetSpriteProps {
  kind: PetId
  direction?: 'left' | 'right'
  size?: number
  walking?: boolean
  paused?: boolean
  onFrame?: (frame: number) => void
}

export default function PetSprite({
  kind,
  direction = 'left',
  size = 120,
  walking = false,
  paused = false,
  onFrame,
}: PetSpriteProps) {
  if (isSvgPetId(kind)) {
    const action = paused ? 'sleep' : walking ? 'walking' : 'idle'
    return <Pico action={action} direction={direction} size={size} />
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
