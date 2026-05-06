import { useState } from 'react'
import { motion } from 'framer-motion'
import { askQuestion } from '../../../shared/api/gemini'
import { getGeminiKey, geminiErrorMessage } from './geminiHelpers'

export default function GeminiAskPanel() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleAsk = async () => {
    if (!question.trim() || loading) return
    setLoading(true)
    setAnswer(null)
    setError(null)
    const key = await getGeminiKey()
    if (!key) {
      setError('NO_API_KEY')
      setLoading(false)
      return
    }
    try {
      const out = await askQuestion(question, key)
      setAnswer(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        background: '#f5f3ff',
        border: '1px solid #ddd6fe',
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAsk()
        }}
        placeholder="궁금한 것을 물어보세요… (Ctrl+Enter)"
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid #ddd6fe',
          borderRadius: 7,
          padding: '7px 9px',
          fontSize: 11,
          color: '#3b0764',
          background: '#fff',
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <motion.button
        whileHover={{ scale: loading || !question.trim() ? 1 : 1.02 }}
        whileTap={{ scale: loading || !question.trim() ? 1 : 0.97 }}
        onClick={handleAsk}
        disabled={loading || !question.trim()}
        style={{
          all: 'unset',
          cursor: loading || !question.trim() ? 'default' : 'pointer',
          background: loading || !question.trim() ? '#ede9fe' : '#7c3aed',
          color: loading || !question.trim() ? '#c4b5fd' : '#fff',
          fontSize: 12,
          fontWeight: 700,
          padding: '7px 0',
          borderRadius: 7,
          textAlign: 'center',
        }}
      >
        {loading ? '답변 중…' : '🤔 질문하기'}
      </motion.button>
      {answer && (
        <div style={{ background: '#fff', border: '1px solid #ddd6fe', borderRadius: 7, padding: '8px 10px' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#3b0764', whiteSpace: 'pre-wrap' }}>{answer}</p>
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
          {geminiErrorMessage(error, 0)}
        </p>
      )}
    </div>
  )
}
