/**
 * petActions.ts
 * Work-Pet: Orbit 디자인 시스템의 12종 행동 vocabulary.
 * SVG 펫과 Lottie 펫이 동일한 squash-and-stretch 문법을 공유한다.
 *
 * 우선순위: morningGreeting > sleepy > walking > one-shot 액션 > idle breath
 */

import type { Transition, TargetAndTransition } from 'framer-motion'

export type PetAction =
  | 'idle'
  | 'walk'
  | 'sleep'
  | 'yawn'
  | 'peek'
  | 'wave'
  | 'dance'
  | 'stretch'
  | 'alert'
  | 'love'
  | 'jump'
  | 'tumble'

export interface PetActionMotion {
  animate: TargetAndTransition
  transition: Transition
}

const SPRING_SOFT: Transition = { type: 'spring', stiffness: 280, damping: 22 }

export function getPetActionMotion(action: PetAction): PetActionMotion {
  switch (action) {
    case 'walk':
      return {
        animate: { scaleY: [1, 0.86, 1], scaleX: [1, 1.12, 1], y: [0, -8, 0] },
        transition: { duration: 0.36, repeat: Infinity, ease: 'easeInOut' },
      }
    case 'sleep':
      return {
        animate: { scaleY: 0.9, scaleX: 1.05, y: 2, rotate: 0 },
        transition: { type: 'spring', stiffness: 160, damping: 20 },
      }
    case 'yawn':
      return {
        animate: { scaleY: [1, 1.08, 0.92, 1], scaleX: [1, 0.95, 1.06, 1], y: [0, -4, 2, 0] },
        transition: { duration: 2, times: [0, 0.3, 0.7, 1], ease: 'easeInOut' },
      }
    case 'peek':
      return {
        animate: { y: [30, -2, -2, 30], rotate: [0, -3, 3, 0] },
        transition: { duration: 2.6, repeat: Infinity, times: [0, 0.2, 0.75, 1], ease: 'easeInOut' },
      }
    case 'wave':
      return {
        animate: { rotate: [0, -16, 16, -10, 10, -4, 4, 0] },
        transition: { duration: 1.1, ease: 'easeInOut' },
      }
    case 'dance':
      return {
        animate: { y: [0, -6, 0, -3, 0], rotate: [0, -8, 8, -6, 6, 0], scaleX: [1, 0.96, 1.04, 0.98, 1] },
        transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' },
      }
    case 'stretch':
      return {
        animate: { scaleY: [1, 1.25, 1], scaleX: [1, 0.8, 1], y: [0, -6, 0] },
        transition: { duration: 1.4, ease: 'easeInOut' },
      }
    case 'alert':
      return {
        animate: { y: [0, -5, 0, -5, 0], scale: [1, 1.08, 1, 1.08, 1] },
        transition: { duration: 0.45, repeat: Infinity, ease: 'easeInOut' },
      }
    case 'love':
      return {
        animate: { y: [0, -3, 0], rotate: [0, -2, 2, 0] },
        transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
      }
    case 'jump':
      return {
        animate: { y: [0, -60, 0], scaleY: [1, 0.95, 1.1, 1], scaleX: [1, 1.05, 0.9, 1] },
        transition: { duration: 0.8, times: [0, 0.45, 0.85, 1], ease: [0.2, 0.8, 0.2, 1] },
      }
    case 'tumble':
      return {
        animate: { rotate: [0, -25, 25, -15, 15, 0], y: [0, -6, 4, -3, 0] },
        transition: { duration: 1.2, ease: 'easeInOut' },
      }
    case 'idle':
    default:
      return {
        animate: { scaleY: [1, 0.96, 1], scaleX: [1, 1.02, 1], y: [0, -3, 0] },
        transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
      }
  }
}
