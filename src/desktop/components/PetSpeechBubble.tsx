import { motion } from 'framer-motion'

interface SpeechBubbleProps {
  message: string
}

export default function PetSpeechBubble({ message }: SpeechBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0, y: 8, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 250, damping: 15, bounce: 0.5 }}
      style={{
        padding: '10px 14px',
        background: '#ffffff',
        color: '#1f2937',
        borderRadius: '14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
        border: '1px solid #f3f4f6',
        minWidth: '120px',
        maxWidth: '210px',
        textAlign: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
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
