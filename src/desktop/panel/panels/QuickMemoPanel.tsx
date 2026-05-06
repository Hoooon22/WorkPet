import { useState } from 'react'
import { motion } from 'framer-motion'

export default function QuickMemoPanel() {
  const [memo, setMemo] = useState('')
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!memo.trim()) return
    try {
      await navigator.clipboard.writeText(memo)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* noop */
    }
  }

  return (
    <div
      style={{
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <textarea
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="빠른 메모… 클립보드에 복사할 수 있어요"
        rows={4}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid #bbf7d0',
          borderRadius: 7,
          padding: '7px 9px',
          fontSize: 11,
          color: '#14532d',
          background: '#fff',
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <motion.button
          whileHover={{ scale: memo.trim() ? 1.02 : 1 }}
          whileTap={{ scale: memo.trim() ? 0.97 : 1 }}
          onClick={handleCopy}
          disabled={!memo.trim()}
          style={{
            all: 'unset',
            flex: 1,
            cursor: memo.trim() ? 'pointer' : 'default',
            background: memo.trim() ? '#16a34a' : '#dcfce7',
            color: memo.trim() ? '#fff' : '#86efac',
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 0',
            borderRadius: 7,
            textAlign: 'center',
          }}
        >
          {copied ? '✅ 복사됨' : '📋 클립보드에 복사'}
        </motion.button>
        <button
          onClick={() => setMemo('')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '7px 14px',
            borderRadius: 7,
            background: '#fff',
            border: '1px solid #bbf7d0',
            color: '#16a34a',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          지우기
        </button>
      </div>
    </div>
  )
}
