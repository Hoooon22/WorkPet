import { forwardRef, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface PetQuestionInputProps {
  value: string
  onChange: (value: string) => void
  onAsk: () => void
  onCancel: () => void
}

const PetQuestionInput = forwardRef<HTMLDivElement, PetQuestionInputProps>(
  function PetQuestionInput({ value, onChange, onAsk, onCancel }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)

    useEffect(() => {
      textareaRef.current?.focus()
    }, [])

    const canAsk = value.trim().length > 0

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.85, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 6, transition: { duration: 0.15 } }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        style={{
          position: 'relative',
          width: 220,
          padding: '8px 10px 10px',
          background: '#ffffff',
          borderRadius: 14,
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          border: '1px solid #ddd6fe',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          pointerEvents: 'auto',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canAsk) onAsk()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
          placeholder="무엇이든 물어보세요…"
          rows={2}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '1px solid #ddd6fe',
            borderRadius: 8,
            padding: '6px 8px',
            fontSize: 11,
            color: '#3b0764',
            background: '#faf5ff',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.4,
          }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={onCancel}
            style={{
              all: 'unset',
              flex: '0 0 auto',
              cursor: 'pointer',
              padding: '4px 10px',
              fontSize: 10,
              fontWeight: 600,
              color: '#6b7280',
              background: '#f3f4f6',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            취소
          </button>
          <motion.button
            whileHover={{ scale: canAsk ? 1.02 : 1 }}
            whileTap={{ scale: canAsk ? 0.96 : 1 }}
            onClick={() => canAsk && onAsk()}
            disabled={!canAsk}
            style={{
              all: 'unset',
              flex: 1,
              cursor: canAsk ? 'pointer' : 'default',
              padding: '4px 0',
              fontSize: 10,
              fontWeight: 700,
              color: canAsk ? '#fff' : '#c4b5fd',
              background: canAsk ? '#7c3aed' : '#ede9fe',
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            물어보기 (Enter)
          </motion.button>
        </div>
      </motion.div>
    )
  },
)

export default PetQuestionInput
