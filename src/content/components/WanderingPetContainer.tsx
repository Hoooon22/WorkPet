import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  motion,
  useMotionValue,
  useDragControls,
  useMotionValueEvent,
  animate,
  type AnimationPlaybackControls,
  type DragControls,
  type PanInfo,
} from 'framer-motion'

interface WanderingPetContainerProps {
  children: (props: {
    isWalking: boolean
    direction: 'left' | 'right'
    x: number
    dragControls: DragControls
    isDragging: boolean
  }) => React.ReactNode
  isActive: boolean
  initialX?: number
  onXChange?: (x: number) => void
  resetTrigger?: number
  forcedX?: number  // 다른 탭에서 원위치 명령 시 강제 이동
}

const MIN_X = 260
const getMaxX = () => window.innerWidth - 88 // 64(캐릭터 너비) + 24(우측 여백)

export default function WanderingPetContainer({ children, isActive, initialX, onXChange, resetTrigger, forcedX }: WanderingPetContainerProps) {
  // 위치는 motion value로 관리 — drag와 walking 트윈이 같은 값을 공유
  const xMotion = useMotionValue(0)
  // 외부 콜백/말풍선 정렬 계산용으로 React state에 미러링
  const [xState, setXState] = useState(0)
  useMotionValueEvent(xMotion, 'change', (v) => setXState(v))

  const [initialized, setInitialized] = useState(false)
  const [isWalking, setIsWalking] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [direction, setDirection] = useState<'left' | 'right'>('left')

  const dragControls = useDragControls()
  const onXChangeRef = useRef(onXChange)
  onXChangeRef.current = onXChange

  // walking 중인 imperative animate 제어
  const walkAnimRef = useRef<AnimationPlaybackControls | null>(null)
  const walkPhaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopWalkAnim = () => {
    if (walkAnimRef.current) {
      walkAnimRef.current.stop()
      walkAnimRef.current = null
    }
    if (walkPhaseTimerRef.current) {
      clearTimeout(walkPhaseTimerRef.current)
      walkPhaseTimerRef.current = null
    }
  }

  useEffect(() => {
    // 저장된 위치 또는 우측 하단에 배치
    const defaultX = getMaxX()
    const startX = initialX !== undefined ? Math.min(initialX, defaultX) : defaultX
    xMotion.set(startX)
    setInitialized(true)
  }, []) // initialX는 최초 1회만 사용

  // forcedX가 변경되면 해당 위치로 즉시 이동 (다른 탭의 원위치 명령 동기화)
  const forcedXRef = useRef(forcedX)
  useEffect(() => {
    if (forcedX === undefined || forcedX === forcedXRef.current) return
    forcedXRef.current = forcedX
    if (!initialized) return
    stopWalkAnim()
    setIsWalking(false)
    xMotion.set(forcedX)
  }, [forcedX, initialized])

  // resetTrigger가 변경되면 기본 우측 위치로 이동
  const resetTriggerRef = useRef(resetTrigger)
  useEffect(() => {
    if (resetTrigger === undefined || resetTrigger === resetTriggerRef.current) return
    resetTriggerRef.current = resetTrigger
    if (!initialized) return
    stopWalkAnim()
    setIsWalking(false)
    setDirection('left')
    xMotion.set(getMaxX())
  }, [resetTrigger, initialized])

  // 창 크기가 변경될 때 위치 + 드래그 경계 조정
  const dragConstraints = useMemo(() => ({ left: MIN_X, right: getMaxX() }), [])
  useEffect(() => {
    const handleResize = () => {
      const maxX = getMaxX()
      dragConstraints.right = maxX
      if (xMotion.get() > maxX) {
        xMotion.set(maxX)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [dragConstraints, xMotion])

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
    const currentX = xMotion.get()
    const maxX = getMaxX()
    if (maxX <= MIN_X) return

    const newX = MIN_X + Math.random() * (maxX - MIN_X)
    const distance = Math.abs(newX - currentX)
    const walkDuration = distance / 140 // 달리기 속도: 초당 140px

    // 걷기 애니메이션을 먼저 시작, 방향 전환
    setDirection(newX > currentX ? 'right' : 'left')
    setIsWalking(true)

    // 300ms 후 실제 이동 시작 (걷기 애니메이션이 준비된 뒤 움직임)
    stopWalkAnim()
    walkPhaseTimerRef.current = setTimeout(() => {
      walkPhaseTimerRef.current = null
      walkAnimRef.current = animate(xMotion, newX, {
        duration: walkDuration,
        ease: 'easeInOut',
        onComplete: () => {
          setIsWalking(false)
          walkAnimRef.current = null
          // 걷기로 위치가 바뀌었으니 storage에 반영
          onXChangeRef.current?.(xMotion.get())
        },
      })
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
      stopWalkAnim()
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

  // ---- 드래그 핸들러 ----
  const handleDragStart = () => {
    stopWalkAnim()
    setIsWalking(false)
    setIsDragging(true)
  }

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    setIsDragging(false)
    // 드래그 종료 위치를 경계 안으로 클램프 후 storage 저장
    const maxX = getMaxX()
    const finalX = Math.max(MIN_X, Math.min(maxX, xMotion.get()))
    if (finalX !== xMotion.get()) xMotion.set(finalX)
    onXChangeRef.current?.(finalX)
    // 드래그 방향에 맞춰 펫 시선 갱신 (작은 움직임은 무시)
    if (info.offset.x > 8) setDirection('right')
    else if (info.offset.x < -8) setDirection('left')
  }

  if (!initialized) return null

  return (
    <motion.div
      style={{
        position: 'absolute',
        bottom: '24px',
        left: 0,
        x: xMotion,
        pointerEvents: 'none', // 컨테이너 자체는 클릭 무시 (펫 영역만 auto)
        touchAction: 'none',
      }}
      drag="x"
      dragControls={dragControls}
      dragListener={false}        // OrbitCharacter onPointerDown에서만 시작
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={dragConstraints}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* 이 내부에서 캐릭터와 말풍선을 배치. 캐릭터 너비 64px 유지. */}
      <div style={{ position: 'relative', width: '64px', pointerEvents: 'none' }}>
        {children({ isWalking, direction, x: xState, dragControls, isDragging })}
      </div>
    </motion.div>
  )
}
