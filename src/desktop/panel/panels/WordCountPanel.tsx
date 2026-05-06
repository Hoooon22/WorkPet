import { useState } from 'react'

export default function WordCountPanel() {
  const [text, setText] = useState('')

  const chars = text.length
  const charsNoSpace = text.replace(/\s+/g, '').length
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length
  const lines = text === '' ? 0 : text.split('\n').length
  const sentences =
    text.trim() === ''
      ? 0
      : text
          .split(/[.!?。！？]+/)
          .map((s) => s.trim())
          .filter(Boolean).length

  return (
    <div
      style={{
        background: '#f3f4f6',
        border: '1px solid #d1d5db',
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
        placeholder="글자수를 셀 텍스트…"
        rows={5}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid #d1d5db',
          borderRadius: 7,
          padding: '7px 9px',
          fontSize: 11,
          color: '#1f2937',
          background: '#fff',
          outline: 'none',
          resize: 'vertical',
        }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Stat label="글자 (공백포함)" value={chars} />
        <Stat label="글자 (공백제외)" value={charsNoSpace} />
        <Stat label="단어" value={words} />
        <Stat label="줄" value={lines} />
        <Stat label="문장" value={sentences} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #d1d5db',
        borderRadius: 7,
        padding: '6px 10px',
      }}
    >
      <p style={{ margin: 0, fontSize: 10, color: '#6b7280' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{value}</p>
    </div>
  )
}
