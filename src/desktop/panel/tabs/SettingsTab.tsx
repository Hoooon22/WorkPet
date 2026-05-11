import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { getValue, setValue, deleteValue, KEYS } from '../../../shared/storage'
import { LLM_PROVIDER_LABELS, type LLMProvider } from '../../../shared/api/llm'

interface Props {
  signedIn: boolean
  email: string | null
  action: (type: string, payload?: unknown) => void
  focusKeySignal?: number
}

const PROVIDER_OPTIONS: LLMProvider[] = ['gemini', 'openai', 'anthropic', 'grok', 'compat']

const PROVIDER_HINT: Record<LLMProvider, string> = {
  gemini: 'Google AI Studio에서 발급 (aistudio.google.com/app/apikey)',
  openai: 'platform.openai.com/api-keys',
  anthropic: 'console.anthropic.com/settings/keys',
  grok: 'console.x.ai',
  compat: 'OpenAI Chat Completions 호환 엔드포인트 (Ollama, LM Studio 등)',
}

export default function SettingsTab({ signedIn, email, action, focusKeySignal }: Props) {
  const [provider, setProvider] = useState<LLMProvider>('gemini')
  const [apiKey, setApiKey] = useState('')
  const [compatBaseUrl, setCompatBaseUrl] = useState('')
  const [compatModel, setCompatModel] = useState('')
  const [keyExists, setKeyExists] = useState(false)
  const [saved, setSaved] = useState(false)
  const keyInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!focusKeySignal) return
    const el = keyInputRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus()
  }, [focusKeySignal])

  useEffect(() => {
    ;(async () => {
      const savedProvider = await getValue<string>(KEYS.LLM_PROVIDER)
      if (savedProvider && (PROVIDER_OPTIONS as string[]).includes(savedProvider)) {
        setProvider(savedProvider as LLMProvider)
      }
      const savedKey = await getValue<string>(KEYS.LLM_API_KEY)
      setKeyExists(!!savedKey)
      if (savedProvider === 'compat') {
        setCompatBaseUrl((await getValue<string>(KEYS.LLM_COMPAT_BASE_URL)) ?? '')
        setCompatModel((await getValue<string>(KEYS.LLM_COMPAT_MODEL)) ?? '')
      }
    })()
  }, [])

  // 공급자 전환 시: 입력 폼은 비우되, 저장은 사용자가 저장 버튼을 누를 때만 한다.
  // 활성화된 공급자가 실제로 바뀌는 것은 저장 시점.
  const handleProviderChange = (next: LLMProvider) => {
    setProvider(next)
    setApiKey('')
    setSaved(false)
    if (next !== 'compat') {
      setCompatBaseUrl('')
      setCompatModel('')
    }
  }

  const canSave = (() => {
    if (!apiKey.trim()) return false
    if (provider === 'compat') {
      return !!compatBaseUrl.trim() && !!compatModel.trim()
    }
    return true
  })()

  // "활성화 키만 보관" — 새 공급자 키를 저장할 때 이전 compat 부가 필드까지 깨끗이 정리한다.
  const saveConfig = async () => {
    if (!canSave) return
    await setValue(KEYS.LLM_PROVIDER, provider)
    await setValue(KEYS.LLM_API_KEY, apiKey.trim())
    if (provider === 'compat') {
      await setValue(KEYS.LLM_COMPAT_BASE_URL, compatBaseUrl.trim())
      await setValue(KEYS.LLM_COMPAT_MODEL, compatModel.trim())
    } else {
      await deleteValue(KEYS.LLM_COMPAT_BASE_URL)
      await deleteValue(KEYS.LLM_COMPAT_MODEL)
    }
    setKeyExists(true)
    setApiKey('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const removeConfig = async () => {
    await deleteValue(KEYS.LLM_PROVIDER)
    await deleteValue(KEYS.LLM_API_KEY)
    await deleteValue(KEYS.LLM_COMPAT_BASE_URL)
    await deleteValue(KEYS.LLM_COMPAT_MODEL)
    setKeyExists(false)
    setCompatBaseUrl('')
    setCompatModel('')
  }

  return (
    <div style={{ padding: 14 }}>
      {/* Auth */}
      <div
        style={{
          background: signedIn ? '#f0fdf4' : '#fff7ed',
          border: signedIn ? '1px solid #bbf7d0' : '1px solid #fed7aa',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 12,
        }}
      >
        {signedIn ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#166534' }}>
                ✅ Google 연결됨
              </p>
              {email && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: '#16a34a',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {email}
                </p>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => action('sign-out')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: 6,
                background: '#fee2e2',
                color: '#b91c1c',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              로그아웃
            </motion.button>
          </div>
        ) : (
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#92400e' }}>
              Google 계정을 연결하면 Gmail과 캘린더 알림을 받을 수 있어요.
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => action('sign-in')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 0',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #4285f4, #1a73e8)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              Google 계정으로 로그인
            </motion.button>
          </div>
        )}
      </div>

      {/* AI provider */}
      <div
        style={{
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5b21b6' }}>
            ✨ AI 공급자 설정
          </p>
          {keyExists && (
            <button
              onClick={removeConfig}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '2px 8px',
                borderRadius: 5,
                background: '#fee2e2',
                color: '#b91c1c',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              삭제
            </button>
          )}
        </div>

        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            border: '1px solid #ddd6fe',
            borderRadius: 7,
            padding: '6px 9px',
            fontSize: 11,
            color: '#3b0764',
            background: '#fff',
            outline: 'none',
            marginBottom: 6,
            cursor: 'pointer',
          }}
        >
          {PROVIDER_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {LLM_PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>

        <p style={{ margin: '0 0 8px', fontSize: 10, color: '#7c3aed' }}>
          {PROVIDER_HINT[provider]}
        </p>

        {provider === 'compat' && (
          <>
            <input
              type="text"
              value={compatBaseUrl}
              onChange={(e) => setCompatBaseUrl(e.target.value)}
              placeholder="Base URL (예: http://localhost:11434/v1)"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #ddd6fe',
                borderRadius: 7,
                padding: '6px 9px',
                fontSize: 11,
                color: '#3b0764',
                background: '#fff',
                outline: 'none',
                marginBottom: 6,
              }}
            />
            <input
              type="text"
              value={compatModel}
              onChange={(e) => setCompatModel(e.target.value)}
              placeholder="모델명 (예: llama3.2, qwen2.5-coder)"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #ddd6fe',
                borderRadius: 7,
                padding: '6px 9px',
                fontSize: 11,
                color: '#3b0764',
                background: '#fff',
                outline: 'none',
                marginBottom: 6,
              }}
            />
          </>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <input
            ref={keyInputRef}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveConfig()}
            placeholder={keyExists ? '새 API 키로 교체…' : 'API 키…'}
            style={{
              flex: 1,
              border: '1px solid #ddd6fe',
              borderRadius: 7,
              padding: '6px 9px',
              fontSize: 11,
              color: '#3b0764',
              background: '#fff',
              outline: 'none',
              minWidth: 0,
            }}
          />
          <button
            onClick={saveConfig}
            disabled={!canSave}
            style={{
              all: 'unset',
              cursor: canSave ? 'pointer' : 'default',
              background: canSave ? '#7c3aed' : '#ede9fe',
              color: canSave ? '#fff' : '#a78bfa',
              fontSize: 11,
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 7,
            }}
          >
            저장
          </button>
        </div>
        {saved && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
            저장됐어요!
          </p>
        )}
      </div>

      {/* Pet controls */}
      {signedIn && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => action('show-pet')}
            style={{
              all: 'unset',
              flex: 1,
              cursor: 'pointer',
              padding: '9px 0',
              borderRadius: 10,
              background: '#eff6ff',
              color: '#2563eb',
              fontWeight: 600,
              fontSize: 12,
              textAlign: 'center',
              border: '1px solid #bfdbfe',
            }}
          >
            👋 펫 소환
          </button>
          <button
            onClick={() => action('dismiss-pet')}
            style={{
              all: 'unset',
              flex: 1,
              cursor: 'pointer',
              padding: '9px 0',
              borderRadius: 10,
              background: '#f3f4f6',
              color: '#6b7280',
              fontWeight: 600,
              fontSize: 12,
              textAlign: 'center',
              border: '1px solid #e5e7eb',
            }}
          >
            💤 펫 퇴장
          </button>
        </div>
      )}
    </div>
  )
}
