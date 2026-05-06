import { useState } from 'react'

export default function ColorPickerPanel() {
  const [color, setColor] = useState('#3b82f6')
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
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
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        style={{ width: 56, height: 56, cursor: 'pointer', border: 'none', background: 'transparent' }}
      />
      <div style={{ flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'monospace',
            fontSize: 16,
            fontWeight: 700,
            color: '#831843',
          }}
        >
          {color.toUpperCase()}
        </p>
        <button
          onClick={handleCopy}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: 6,
            background: '#db2777',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          {copied ? '✅ 복사됨' : '📋 헥스 복사'}
        </button>
      </div>
    </div>
  )
}
