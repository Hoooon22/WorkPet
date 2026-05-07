import type { LottiePetId, PetId } from './types'

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

export const ALL_PET_IDS: PetId[] = [...LOTTIE_PET_IDS]

export function isLottiePetId(s: unknown): s is LottiePetId {
  return typeof s === 'string' && (LOTTIE_PET_IDS as readonly string[]).includes(s)
}

export function isPetId(s: unknown): s is PetId {
  return typeof s === 'string' && (ALL_PET_IDS as readonly string[]).includes(s)
}
