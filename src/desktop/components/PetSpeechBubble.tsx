import { motion } from 'framer-motion'

interface SpeechBubbleProps {
  message: string
  onDismiss?: () => void
}

export default function PetSpeechBubble({ message, onDismiss }: SpeechBubbleProps) {
  const dismissible = !!onDismiss

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0, y: 8, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 250, damping: 15, bounce: 0.5 }}
      whileHover={dismissible ? { scale: 1.03 } : undefined}
      whileTap={dismissible ? { scale: 0.97 } : undefined}
      onClick={onDismiss}
      style={{
        position: 'relative',
        padding: '10px 14px',
        background: '#ffffff',
        color: '#1f2937',
        borderRadius: '14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        border: '1px solid #f3f4f6',
        minWidth: '120px',
        maxWidth: '210px',
        textAlign: 'center',
        pointerEvents: dismissible ? 'auto' : 'none',
        userSelect: 'none',
        cursor: dismissible ? 'pointer' : 'default',
      }}
    >
      {dismissible && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 4,
            right: 6,
            fontSize: 9,
            color: '#9ca3af',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          ✕
        </span>
      )}
      <p
        style={{
          margin: 0,
          fontSize: '12px',
          fontWeight: 600,
          lineHeight: 1.4,
          fontFamily: 'sans-serif',
        }}
      >
        {message}
      </p>
    </motion.div>
  )
}
