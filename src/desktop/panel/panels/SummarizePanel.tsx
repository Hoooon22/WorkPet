import { useState } from 'react'
import { motion } from 'framer-motion'
import { summarizePage } from '../../../shared/api/llm'
import { getLLMConfig, llmErrorMessage } from './llmHelpers'

export default function SummarizePanel() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSummarize = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    setResult(null)
    setError(null)
    const cfg = await getLLMConfig()
    if (!cfg) {
      setError('NO_API_KEY')
      setLoading(false)
      return
    }
    try {
      const out = await summarizePage(text, cfg)
      setResult(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="요약할 페이지 텍스트를 붙여넣으세요…"
        rows={5}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid #fde68a',
          borderRadius: 7,
          padding: '7px 9px',
          fontSize: 11,
          color: '#78350f',
          background: '#fff',
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <motion.button
        whileHover={{ scale: loading || !text.trim() ? 1 : 1.02 }}
        whileTap={{ scale: loading || !text.trim() ? 1 : 0.97 }}
        onClick={handleSummarize}
        disabled={loading || !text.trim()}
        style={{
          all: 'unset',
          cursor: loading || !text.trim() ? 'default' : 'pointer',
          background: loading || !text.trim() ? '#fef3c7' : '#d97706',
          color: loading || !text.trim() ? '#fcd34d' : '#fff',
          fontSize: 12,
          fontWeight: 700,
          padding: '7px 0',
          borderRadius: 7,
          textAlign: 'center',
        }}
      >
        {loading ? '요약 중…' : '📝 요약하기'}
      </motion.button>
      {result && (
        <div style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 10px' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#78350f', whiteSpace: 'pre-wrap' }}>{result}</p>
        </div>
      )}
      {error && (
        <p
          style={{
            margin: 0,
            fontSize: 10,
            color: '#dc2626',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '6px 8px',
          }}
        >
          {llmErrorMessage(error, 0)}
        </p>
      )}
    </div>
  )
}
