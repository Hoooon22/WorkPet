import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { translateText } from '../../../shared/api/gemini'
import { getGeminiKey, geminiErrorMessage } from './geminiHelpers'

const LANGUAGES = [
  { code: '한국어', flag: '🇰🇷' },
  { code: 'English', flag: '🇺🇸' },
  { code: '日本語', flag: '🇯🇵' },
  { code: '中文', flag: '🇨🇳' },
  { code: 'Español', flag: '🇪🇸' },
  { code: 'Français', flag: '🇫🇷' },
  { code: 'Deutsch', flag: '🇩🇪' },
]

const COOLDOWN_SEC = 60

const selectStyle: React.CSSProperties = {
  flex: 1,
  border: '1px solid #bfdbfe',
  borderRadius: 7,
  padding: '6px 8px',
  fontSize: 12,
  color: '#1d4ed8',
  background: '#fff',
  outline: 'none',
  cursor: 'pointer',
  minWidth: 0,
}

export default function TranslatePanel() {
  const [text, setText] = useState('')
  const [sourceLang, setSourceLang] = useState('한국어')
  const [targetLang, setTargetLang] = useState('English')
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current) }, [])

  const startCooldown = () => {
    setCooldown(COOLDOWN_SEC)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldown((p) => {
        if (p <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          return 0
        }
        return p - 1
      })
    }, 1000)
  }

  const handleSwap = () => {
    setSourceLang(targetLang)
    setTargetLang(sourceLang)
    setResult(null)
    setError(null)
  }

  const handleTranslate = async () => {
    const trimmed = text.trim()
    if (!trimmed || loading || cooldown > 0) return
    setLoading(true)
    setResult(null)
    setError(null)
    const key = await getGeminiKey()
    if (!key) {
      setError('NO_API_KEY')
      setLoading(false)
      return
    }
    try {
      const out = await translateText(trimmed, sourceLang, targetLang, key)
      setResult(out)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      if (msg === 'RATE_LIMIT') startCooldown()
    } finally {
      setLoading(false)
    }
  }

  const isDisabled = loading || cooldown > 0 || !text.trim()

  return (
    <div
      style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} style={selectStyle}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.code}
            </option>
          ))}
        </select>
        <button onClick={handleSwap} title="교환" style={{ all: 'unset', cursor: 'pointer', fontSize: 16 }}>
          ⇄
        </button>
        <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} style={selectStyle}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.code}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleTranslate()
        }}
        placeholder="번역할 텍스트… (Ctrl+Enter)"
        rows={3}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid #bfdbfe',
          borderRadius: 7,
          padding: '7px 9px',
          fontSize: 11,
          color: '#1e3a5f',
          background: '#fff',
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <motion.button
        whileHover={{ scale: isDisabled ? 1 : 1.02 }}
        whileTap={{ scale: isDisabled ? 1 : 0.97 }}
        onClick={handleTranslate}
        disabled={isDisabled}
        style={{
          all: 'unset',
          cursor: isDisabled ? 'default' : 'pointer',
          background: isDisabled ? '#e0e7ff' : '#1d4ed8',
          color: isDisabled ? '#93c5fd' : '#fff',
          fontSize: 12,
          fontWeight: 700,
          padding: '7px 0',
          borderRadius: 7,
          textAlign: 'center',
        }}
      >
        {loading ? '번역 중…' : cooldown > 0 ? `⏳ ${cooldown}초` : '🌐 번역하기'}
      </motion.button>
      {result && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #bfdbfe',
            borderRadius: 7,
            padding: '8px 10px',
            position: 'relative',
          }}
        >
          <p style={{ margin: 0, fontSize: 11, color: '#1e3a5f', whiteSpace: 'pre-wrap', paddingRight: 28 }}>
            {result}
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(result).catch(() => {})}
            title="복사"
            style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 8, right: 8, fontSize: 14 }}
          >
            📋
          </button>
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
            lineHeight: 1.5,
          }}
        >
          {geminiErrorMessage(error, cooldown)}
        </p>
      )}
    </div>
  )
}
