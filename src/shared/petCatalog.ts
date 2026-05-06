import type { LottiePetId, PetId, SvgPetId } from './types'

export const SVG_PET_IDS: SvgPetId[] = [
  'fox',
  'frog',
  'penguin',
  'turtle',
  'owl',
  'octopus',
  'chick',
  'bear',
]

export const LOTTIE_PET_IDS: LottiePetId[] = [
  'cat',
  'rabbit',
  'hedgehog',
  'raccoon',
  'unicorn',
]

export const ALL_PET_IDS: PetId[] = [...SVG_PET_IDS, ...LOTTIE_PET_IDS]

export function isSvgPetId(s: unknown): s is SvgPetId {
  return typeof s === 'string' && (SVG_PET_IDS as readonly string[]).includes(s)
}

export function isLottiePetId(s: unknown): s is LottiePetId {
  return typeof s === 'string' && (LOTTIE_PET_IDS as readonly string[]).includes(s)
}

export function isPetId(s: unknown): s is PetId {
  return typeof s === 'string' && (ALL_PET_IDS as readonly string[]).includes(s)
}
