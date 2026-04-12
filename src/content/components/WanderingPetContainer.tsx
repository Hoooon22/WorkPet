import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface WanderingPetContainerProps {
  children: (props: { isWalking: boolean; direction: 'left' | 'right'; x: number }) => React.ReactNode
  isActive: boolean
  initialX?: number
  onXChange?: (x: number) => void
}

export default function WanderingPetContainer({ children, isActive, initialX, onXChange }: WanderingPetContainerProps) {
  const [x, setX] = useState(0)
  const [initialized, setInitialized] = useState(false)
  const [isWalking, setIsWalking] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('left')

  const xRef = useRef(0)
  const onXChangeRef = useRef(onXChange)
  onXChangeRef.current = onXChange

  useEffect(() => {
    // 저장된 위치 또는 우측 하단에 배치
    const defaultX = window.innerWidth - 88 // 64(캐릭터 너비) + 24(우측 여백)
    const startX = initialX !== undefined ? Math.min(initialX, defaultX) : defaultX
    setX(startX)
    xRef.current = startX
    setInitialized(true)
  }, []) // initialX는 최초 1회만 사용

  useEffect(() => {
    xRef.current = x
    if (initialized) {
      onXChangeRef.current?.(x)
    }
  }, [x, initialized])

  // 창 크기가 변경될 때 위치 조정
  useEffect(() => {
    const handleResize = () => {
      const maxX = window.innerWidth - 88
      if (xRef.current > maxX) {
        setX(maxX)
        xRef.current = maxX
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 사용자 활동 감지 — 활동 중엔 걷기 건너뜀
  const userActiveRef = useRef(false)
  const userActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const markActive = () => {
      userActiveRef.current = true
      if (userActiveTimerRef.current) clearTimeout(userActiveTimerRef.current)
      userActiveTimerRef.current = setTimeout(() => {
        userActiveRef.current = false
      }, 3000)
    }
    window.addEventListener('mousemove', markActive)
    window.addEventListener('mousedown', markActive)
    window.addEventListener('keydown', markActive)
    window.addEventListener('scroll', markActive, true)
    return () => {
      window.removeEventListener('mousemove', markActive)
      window.removeEventListener('mousedown', markActive)
      window.removeEventListener('keydown', markActive)
      window.removeEventListener('scroll', markActive, true)
      if (userActiveTimerRef.current) clearTimeout(userActiveTimerRef.current)
    }
  }, [])

  const triggerWalk = (force = false) => {
    if (!force && userActiveRef.current) return // 사용자 활동 중엔 걷기 생략
    const currentX = xRef.current
    const minX = 260
    const maxX = window.innerWidth - 88
    if (maxX <= minX) return

    const newX = minX + Math.random() * (maxX - minX)
    const distance = Math.abs(newX - currentX)
    const walkDuration = distance / 140 // 달리기 속도: 초당 140px

    // 걷기 애니메이션을 먼저 시작, 방향 전환
    setDirection(newX > currentX ? 'right' : 'left')
    setIsWalking(true)

    // 300ms 후 실제 이동 시작 (걷기 애니메이션이 준비된 뒤 움직임)
    if (walkTimerRef.current) clearTimeout(walkTimerRef.current)
    walkTimerRef.current = setTimeout(() => {
      setX(newX)
      walkTimerRef.current = setTimeout(() => {
        setIsWalking(false)
        walkTimerRef.current = null
      }, walkDuration * 1000)
    }, 300)
  }

  // isActive가 true로 바뀌면 2초 후 즉시 첫 걷기 시작
  const immediateWalkRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (immediateWalkRef.current) {
      clearTimeout(immediateWalkRef.current)
      immediateWalkRef.current = null
    }
    if (isActive && initialized) {
      immediateWalkRef.current = setTimeout(() => {
        triggerWalk(true) // 패널 닫힘 직후엔 userActive 무시하고 바로 걷기
        immediateWalkRef.current = null
      }, 2000)
    }
    return () => {
      if (immediateWalkRef.current) {
        clearTimeout(immediateWalkRef.current)
        immediateWalkRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, initialized])

  useEffect(() => {
    if (!isActive || !initialized) {
      if (walkTimerRef.current) {
        clearTimeout(walkTimerRef.current)
        walkTimerRef.current = null
      }
      setIsWalking(false)
      return
    }

    const interval = setInterval(() => {
      // 35% 확률로 걷기 시작
      const shouldWalk = Math.random() < 0.35
      if (shouldWalk) {
        triggerWalk()
      } else {
        setIsWalking(false)
      }
    }, 15000) // 15초마다 새로운 행동 결정

    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, initialized])

  if (!initialized) return null

  const currentDistance = Math.abs(x - xRef.current)
  const duration = currentDistance > 0 ? (currentDistance / 140) : 0

  return (
    <motion.div
      style={{
        position: 'absolute',
        bottom: '24px',
        left: 0,
        pointerEvents: 'none', // 컨테이너 자체는 클릭 무시
      }}
      initial={false}
      animate={{ x }}
      transition={{ duration, ease: 'easeInOut' }}
    >
      {/* 이 내부에서 캐릭터와 말풍선을 배치. 캐릭터 너비 64px 유지. */}
      <div style={{ position: 'relative', width: '64px', pointerEvents: 'none' }}>
        {children({ isWalking, direction, x })}
      </div>
    </motion.div>
  )
}
