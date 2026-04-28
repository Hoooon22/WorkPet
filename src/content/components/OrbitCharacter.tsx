import { motion, AnimatePresence, type DragControls } from 'framer-motion'
import Lottie from 'lottie-react'
import type { LottieRefCurrentProps } from 'lottie-react'
import { useRef, useCallback, useEffect } from 'react'
import type { PetState, GachaResult, LottiePetId, SvgPetId } from '../../types/messages'
import { PET_LOTTIE_MAP } from './MondayGacha'
import SvgPet, { isSvgPetId } from './SvgPet'

interface OrbitCharacterProps {
  state: PetState
  onClick: () => void
  direction?: 'left' | 'right'
  isWalking?: boolean
  activePet?: GachaResult
  isFreshSummon?: boolean
  isSleepy?: boolean
  isMorningGreeting?: boolean
  wanderEnabled?: boolean
  dragControls?: DragControls
  isDragging?: boolean
}

// Lottie JSON 임포트
import petIdle from '../../assets/lottie/idle.json'
import petAlert from '../../assets/lottie/alert.json'

// ZZZ 떠오르는 파티클
function ZzzParticles() {
  return (
    <>
      {[
        { char: 'z', size: 9,  delay: 0,    dx: 0 },
        { char: 'z', size: 11, delay: 0.8,  dx: 7 },
        { char: 'Z', size: 14, delay: 1.6,  dx: 15 },
      ].map(({ char, size, delay, dx }, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, x: dx, y: 0 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [0, -13, -26, -38],
            x: [dx, dx + 3, dx + 5, dx + 7],
          }}
          transition={{ duration: 2.5, delay, repeat: Infinity, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            fontSize: `${size}px`,
            color: '#93c5fd',
            fontWeight: 800,
            fontFamily: 'sans-serif',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {char}
        </motion.span>
      ))}
    </>
  )
}

export default function OrbitCharacter({
  state, onClick, direction = 'left', isWalking = false,
  activePet, isFreshSummon, isSleepy, isMorningGreeting, wanderEnabled = true,
  dragControls, isDragging = false,
}: OrbitCharacterProps) {
  // 마운트 시점의 값을 캡처 — 소환 직후 등장 애니메이션에만 사용
  const wasFreshSummon = useRef(isFreshSummon ?? false)

  // 활성 가챠 펫이 SVG 종이면 SvgPet으로 렌더, 아니면 Lottie로 렌더
  const isSvgActivePet = !!activePet && isSvgPetId(activePet.petId)

  const getLottieAnimation = () => {
    // 가챠 펫(Lottie 종)이 선택된 경우: 해당 펫의 Lottie 사용
    if (activePet && !isSvgActivePet) return PET_LOTTIE_MAP[activePet.petId as LottiePetId]
    // 기본 캐릭터: 상태별 Lottie (walking.json은 다른 캐릭터 전용이므로 사용 안 함)
    switch (state) {
      case 'alert': return petAlert
      case 'idle':
      default: return petIdle
    }
  }

  // 가챠 펫: play-pause 사이클 (한번 재생 → 3~8초 쉬다가 → 재생 반복)
  const lottieRef = useRef<LottieRefCurrentProps>(null)
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    return () => clearTimeout(pauseTimerRef.current)
  }, [])

  const handleAnimationComplete = useCallback(() => {
    if (!activePet) return
    clearTimeout(pauseTimerRef.current)
    // 3~8초 랜덤 대기 후 다시 재생
    pauseTimerRef.current = setTimeout(() => {
      lottieRef.current?.play()
    }, 3000 + Math.random() * 5000)
  }, [activePet])

  // 퇴장 상태일 때 애니메이션
  const petVariants = {
    hidden: wasFreshSummon.current
      ? { scale: 2.2, opacity: 0, y: 0 }
      : { y: '150%', opacity: 0 },
    visible: wasFreshSummon.current
      ? {
          scale: 1,
          opacity: 1,
          y: 0,
          transition: { type: 'spring', stiffness: 380, damping: 22 },
        }
      : {
          y: 0,
          scale: 1,
          opacity: 1,
          transition: {
            delay: 0.35,
            y: { type: 'spring', stiffness: 220, damping: 18, bounce: 0.5 },
          },
        },
    dismissed: {
      y: '150%',
      opacity: 0,
      transition: {
        type: 'spring', stiffness: 300, damping: 25,
      },
    },
  }

  const alertBadgeVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
      scale: [1, 1.25, 1],
      opacity: 1,
      transition: {
        scale: { duration: 0.5, repeat: Infinity, ease: 'easeInOut' },
        opacity: { duration: 0.2 },
      },
    },
  }

  // 바디 상태별 animate / transition
  // 우선순위: 아침 인사 > 졸음 > 드래그 중 > 이동 중 > idle 바운스(돌아다니기 ON) > 완전 정지
  const bodyAnimate = isMorningGreeting
    ? { rotate: [0, -22, 22, -14, 14, -6, 6, 0], scaleY: 1,           scaleX: 1,    y: 0 }
    : isSleepy
    ? { rotate: 0,                                scaleY: 0.90,         scaleX: 1.05, y: 2 }
    : isDragging
    ? { rotate: 0,                                scaleY: 1.06,         scaleX: 0.94, y: -4 }
    : isWalking
    ? { rotate: 0,                                scaleY: [1, 0.86, 1], scaleX: [1, 1.12, 1], y: [0, -8, 0] }
    : wanderEnabled
    ? { rotate: 0,                                scaleY: [1, 0.96, 1], scaleX: [1, 1.02, 1], y: [0, -3, 0] }
    : { rotate: 0,                                scaleY: 1,            scaleX: 1,    y: 0 }

  const bodyTransition = isMorningGreeting
    ? { duration: 1.1, ease: 'easeInOut' as const }
    : isDragging
    ? { type: 'spring' as const, stiffness: 380, damping: 22 }
    : isWalking
    ? { duration: 0.36, repeat: Infinity, ease: 'easeInOut' as const }
    : wanderEnabled && !isSleepy
    ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const }
    : { type: 'spring' as const, stiffness: 280, damping: 22 }

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      id="orbit-pet-btn"
    >
      {/* ---- "!" 알림 뱃지 ---- */}
      <AnimatePresence>
        {state === 'alert' && (
          <motion.div
            key="alert-badge"
            variants={alertBadgeVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            style={{
              position: 'absolute',
              top: '-10px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              background: '#ef4444',
              color: '#fff',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(239,68,68,0.5)',
              fontFamily: 'sans-serif',
            }}
          >
            !
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- ZZZ 파티클 (졸음) ---- */}
      <AnimatePresence>
        {isSleepy && (
          <motion.div
            key="zzz"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              position: 'absolute',
              bottom: '72px',
              left: '44px',
              pointerEvents: 'none',
              zIndex: 15,
            }}
          >
            <ZzzParticles />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- 펫 본체 영역 ---- */}
      <motion.div
        variants={petVariants}
        initial="hidden"
        animate={state === 'dismissed' ? 'dismissed' : 'visible'}
        style={{ originX: 0.5 }}
      >
        {/* 앉기 / 졸음 / 아침 인사 body 애니메이션 */}
        <motion.div
          animate={bodyAnimate}
          transition={bodyTransition}
          style={{ originY: 1, originX: 0.5 }}
        >
          {/* 방향 전환 */}
          <motion.div
            animate={{ rotateY: direction === 'right' ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              onClick={onClick}
              onPointerDown={(e) => {
                // 펫을 잡으면 드래그 컨트롤러에 위임 — 임계값 미만 이동 시 onClick 정상 발화
                dragControls?.start(e)
              }}
              aria-label="Work-Pet Lottie Character"
              style={{
                cursor: isDragging ? 'grabbing' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '80px',
                height: '80px',
                position: 'relative',
                pointerEvents: 'auto',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                touchAction: 'none',
              }}
            >
              {isSvgActivePet ? (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    width: '100%',
                    height: '100%',
                    filter: `drop-shadow(0px 6px 12px ${activePet!.glowColor}88) drop-shadow(0px 10px 8px rgba(0,0,0,0.2))`,
                  }}
                >
                  {/* 외곽 motion.div가 walk/idle/sleepy/morning을 책임지므로
                      SvgPet 자체 액션은 비활성('idle')으로 둔다. */}
                  <SvgPet
                    kind={activePet!.petId as SvgPetId}
                    action="idle"
                    direction={direction}
                    mood={isSleepy ? 'sleepy' : 'happy'}
                    size={64}
                  />
                </motion.div>
              ) : Object.keys(getLottieAnimation()).length === 0 ? (
                <motion.div
                  whileHover={{ scale: 1.12 }}
                  whileTap={{ scale: 0.92 }}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
                    boxShadow: state === 'alert'
                      ? '0 0 0 4px rgba(96,165,250,0.4), 0 8px 24px rgba(37,99,235,0.45)'
                      : '0 4px 16px rgba(37,99,235,0.35)',
                  }}
                />
              ) : (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    width: '100%',
                    height: '100%',
                    filter: activePet
                      ? `drop-shadow(0px 6px 12px ${activePet.glowColor}88) drop-shadow(0px 10px 8px rgba(0,0,0,0.2))`
                      : 'drop-shadow(0px 10px 8px rgba(0,0,0,0.2))',
                  }}
                >
                  <Lottie
                    key={activePet ? `gacha-${activePet.petId}` : state}
                    lottieRef={activePet ? lottieRef : undefined}
                    animationData={getLottieAnimation()}
                    loop={activePet ? false : true}
                    autoplay={true}
                    onComplete={activePet ? handleAnimationComplete : undefined}
                    style={{ width: '100%', height: '100%' }}
                  />
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  )
}
