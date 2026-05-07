import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export default function ScreenshotPanel() {
  const [image, setImage] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unlisten = listen<string>('orbit:screenshot-result', (e) => {
      setImage(e.payload)
      setCapturing(false)
      setCopied(false)
      setError(null)
    })
    return () => {
      void unlisten.then((u) => u())
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleCapture = async () => {
    if (capturing) return
    setError(null)
    setCapturing(true)
    try {
      await invoke('open_screenshot_overlay')
    } catch (err) {
      console.warn('[orbit] open_screenshot_overlay failed', err)
      setCapturing(false)
      setError('캡처 창을 열 수 없어요')
    }
  }

  const handleCopy = async () => {
    if (!image) return
    try {
      const { Image } = await import('@tauri-apps/api/image')
      const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager')
      const base64 = image.replace(/^data:image\/png;base64,/, '')
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const tauriImage = await Image.fromBytes(bytes)
      await writeImage(tauriImage)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1800)
    } catch (err) {
      console.warn('[orbit] copy image failed', err)
      setError('복사에 실패했어요')
    }
  }

  const handleClear = () => {
    setImage(null)
    setCopied(false)
    setError(null)
  }

  const captureLabel = capturing ? '캡처 중…' : image ? '🔁 다시 캡처' : '📸 캡처'

  return (
    <div
      style={{
        background: '#ecfeff',
        border: '1px solid #a5f3fc',
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <motion.button
          whileHover={{ scale: capturing ? 1 : 1.02 }}
          whileTap={{ scale: capturing ? 1 : 0.97 }}
          onClick={handleCapture}
          disabled={capturing}
          style={{
            all: 'unset',
            flex: 1,
            cursor: capturing ? 'default' : 'pointer',
            background: capturing ? '#cffafe' : '#0891b2',
            color: capturing ? '#67e8f9' : '#fff',
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 0',
            borderRadius: 7,
            textAlign: 'center',
          }}
        >
          {captureLabel}
        </motion.button>
        <motion.button
          whileHover={{ scale: image ? 1.02 : 1 }}
          whileTap={{ scale: image ? 0.97 : 1 }}
          onClick={handleCopy}
          disabled={!image}
          style={{
            all: 'unset',
            flex: 1,
            cursor: image ? 'pointer' : 'default',
            background: !image ? '#cffafe' : copied ? '#0e7490' : '#0891b2',
            color: !image ? '#67e8f9' : '#fff',
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 0',
            borderRadius: 7,
            textAlign: 'center',
          }}
        >
          {copied ? '✅ 복사됨' : '📋 이미지 복사'}
        </motion.button>
      </div>

      {image && (
        <div
          style={{
            background: '#fff',
            border: '1px solid #a5f3fc',
            borderRadius: 7,
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <img
            src={image}
            alt="캡처 미리보기"
            style={{
              maxWidth: '100%',
              maxHeight: 240,
              objectFit: 'contain',
              borderRadius: 4,
              display: 'block',
            }}
          />
          <button
            onClick={handleClear}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontSize: 10,
              color: '#0e7490',
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            지우기
          </button>
        </div>
      )}

      {!image && !capturing && (
        <p style={{ margin: 0, fontSize: 11, color: '#0e7490', textAlign: 'center', lineHeight: 1.5 }}>
          캡처 버튼을 눌러 화면 영역을 드래그하세요
        </p>
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
          {error}
        </p>
      )}
    </div>
  )
}
