import { motion } from 'framer-motion'

interface SpeechBubbleProps {
  message: string
  align?: 'right' | 'left'  // right: 말풍선이 펫 오른쪽(기본), left: 말풍선이 펫 왼쪽
}

export default function SpeechBubble({ message, align = 'right' }: SpeechBubbleProps) {
  const isLeft = align === 'left'

  return (
    <motion.div
      initial={{
        opacity: 0, scale: 0, y: 15,
        x: isLeft ? 20 : -20,
        transformOrigin: isLeft ? 'bottom right' : 'bottom left',
      }}
      animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
      exit={{
        opacity: 0, scale: 0, y: 10,
        x: isLeft ? 10 : -10,
        transition: { duration: 0.2 },
      }}
      transition={{ type: 'spring', stiffness: 250, damping: 15, bounce: 0.5 }}
      style={{
        position: 'absolute',
        bottom: '90%',
        // 오른쪽 정렬: 펫 왼쪽 80%에서 오른쪽으로 확장
        // 왼쪽 정렬: 펫 오른쪽 80%에서 왼쪽으로 확장
        ...(isLeft
          ? { right: '80%', marginBottom: '8px', marginRight: '4px' }
          : { left: '80%',  marginBottom: '8px', marginLeft:  '4px' }
        ),
        padding: '12px 16px',
        background: '#ffffff',
        color: '#1f2937',
        borderRadius: '16px',
        // 꼬리 방향: 오른쪽 정렬이면 왼쪽 하단, 왼쪽 정렬이면 오른쪽 하단
        ...(isLeft
          ? { borderBottomRightRadius: '0px' }
          : { borderBottomLeftRadius:  '0px' }
        ),
        boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
        border: '1px solid #f3f4f6',
        zIndex: 10,
        minWidth: '120px',
        maxWidth: '220px',
        pointerEvents: 'none',
      }}
    >
      <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, lineHeight: 1.4, fontFamily: 'sans-serif' }}>
        {message}
      </p>
    </motion.div>
  )
}
