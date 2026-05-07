import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

export default function ColorPickerPanel() {
  const [color, setColor] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    const unlisten = listen<string>('orbit:color-result', async (e) => {
      const hex = e.payload
      setColor(hex)
      setPicking(false)
      try {
        await writeText(hex)
      } catch (err) {
        console.warn('[orbit] auto-copy failed', err)
      }
    })
    return () => {
      void unlisten.then((u) => u())
    }
  }, [])

  const handlePick = async () => {
    setPicking(true)
    try {
      await invoke('open_color_picker_overlay')
    } catch (err) {
      console.warn('[orbit] open_color_picker_overlay failed', err)
      setPicking(false)
    }
  }

  const handleCopy = async () => {
    if (!color) return
    try {
      await navigator.clipboard.writeText(color)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* noop */
    }
  }

  return (
    <div
      style={{
        background: '#fdf2f8',
        border: '1px solid #fbcfe8',
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 10,
          background: color ?? 'repeating-conic-gradient(#fbcfe8 0% 25%, #fff 0% 50%) 50% / 14px 14px',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px #fbcfe8',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'monospace',
            fontSize: 16,
            fontWeight: 700,
            color: color ? '#831843' : '#9ca3af',
          }}
        >
          {color ? color.toUpperCase() : '색상 없음'}
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            onClick={handlePick}
            disabled={picking}
            style={{
              all: 'unset',
              cursor: picking ? 'default' : 'pointer',
              padding: '4px 10px',
              borderRadius: 6,
              background: picking ? '#9ca3af' : '#db2777',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {picking ? '🎯 추출 중…' : '🎯 화면에서 추출'}
          </button>
          <button
            onClick={handleCopy}
            disabled={!color}
            style={{
              all: 'unset',
              cursor: color ? 'pointer' : 'default',
              padding: '4px 10px',
              borderRadius: 6,
              background: color ? '#fff' : '#f3f4f6',
              color: color ? '#831843' : '#9ca3af',
              fontSize: 11,
              fontWeight: 600,
              border: `1px solid ${color ? '#fbcfe8' : '#e5e7eb'}`,
            }}
          >
            {copied ? '✅ 복사됨' : '📋 복사'}
          </button>
        </div>
      </div>
    </div>
  )
}
