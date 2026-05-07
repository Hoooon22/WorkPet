import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { getValue, setValue, KEYS, subscribeStorage } from '../../../shared/storage'
import {
  CLIPBOARD_HISTORY_MAX,
  noteClipboardWrite,
} from '../../../shared/clipboardHistory'
import type { ClipboardEntry } from '../../../shared/types'

const COLOR_BG = '#f0f9ff'
const COLOR_BORDER = '#bae6fd'
const COLOR_FG = '#0369a1'

function formatRelative(ts: number, now: number): string {
  const diff = Math.max(0, Math.floor((now - ts) / 1000))
  if (diff < 5) return '방금'
  if (diff < 60) return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

function preview(text: string): { line: string; multiline: boolean } {
  const trimmed = text.trim()
  const lines = trimmed.split('\n')
  const first = lines[0] ?? ''
  const head = first.length > 80 ? first.slice(0, 80) + '…' : first
  return { line: head || '(공백)', multiline: lines.length > 1 }
}

export default function ClipboardHistoryPanel() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    ;(async () => {
      const saved = (await getValue<ClipboardEntry[]>(KEYS.CLIPBOARD_HISTORY)) ?? []
      if (!cancelled) setEntries(saved)
      unsub = await subscribeStorage<ClipboardEntry[]>(KEYS.CLIPBOARD_HISTORY, (val) => {
        if (cancelled) return
        setEntries(val ?? [])
      })
    })()
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const handleCopy = async (entry: ClipboardEntry) => {
    try {
      await writeText(entry.text)
      noteClipboardWrite(entry.text)
      setCopiedId(entry.id)
      setTimeout(() => setCopiedId((c) => (c === entry.id ? null : c)), 1200)
    } catch {
      /* noop */
    }
  }

  const handleDelete = async (id: string) => {
    const next = entries.filter((e) => e.id !== id)
    setEntries(next)
    await setValue(KEYS.CLIPBOARD_HISTORY, next)
  }

  const handleClear = async () => {
    setEntries([])
    await setValue(KEYS.CLIPBOARD_HISTORY, [])
  }

  return (
    <div
      style={{
        background: COLOR_BG,
        border: `1px solid ${COLOR_BORDER}`,
        borderRadius: 10,
        padding: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {entries.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: '#0c4a6e',
            textAlign: 'center',
            padding: '14px 0',
            lineHeight: 1.5,
          }}
        >
          텍스트를 복사하면 여기에 자동으로 쌓여요.
          <br />
          항목을 클릭하면 다시 복사됩니다.
        </p>
      ) : (
        <>
          <div
            style={{
              fontSize: 10,
              color: '#0c4a6e',
              opacity: 0.7,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>최근 {entries.length}개 / 최대 {CLIPBOARD_HISTORY_MAX}개</span>
            <button
              onClick={handleClear}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
                color: COLOR_FG,
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              전체 지우기
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              maxHeight: 320,
              overflowY: 'auto',
              paddingRight: 2,
            }}
          >
            <AnimatePresence initial={false}>
              {entries.map((entry) => {
                const { line, multiline } = preview(entry.text)
                const isCopied = copiedId === entry.id
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      background: '#fff',
                      border: `1px solid ${isCopied ? COLOR_FG : COLOR_BORDER}`,
                      borderRadius: 7,
                      padding: '7px 8px',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <button
                      onClick={() => handleCopy(entry)}
                      title={entry.text}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: '#1f2937',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {line}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: '#6b7280',
                          display: 'flex',
                          gap: 6,
                        }}
                      >
                        <span>{formatRelative(entry.createdAt, now)}</span>
                        {multiline && <span>· 여러 줄</span>}
                        {isCopied && (
                          <span style={{ color: COLOR_FG, fontWeight: 700 }}>✓ 복사됨</span>
                        )}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      aria-label="삭제"
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9ca3af',
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}
