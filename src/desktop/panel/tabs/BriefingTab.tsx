import { motion } from 'framer-motion'
import { open as openExternal } from '@tauri-apps/plugin-shell'
import type { BriefingPayload } from '../../../shared/types'

interface Props {
  full: BriefingPayload | null
  loading: boolean
  onFetch: () => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function fetchedAgo(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  return `${Math.floor(min / 60)}시간 전`
}

export default function BriefingTab({ full, loading, onFetch }: Props) {
  return (
    <div style={{ padding: 14 }}>
      <motion.button
        whileHover={{ scale: loading ? 1 : 1.02 }}
        whileTap={{ scale: loading ? 1 : 0.97 }}
        onClick={onFetch}
        disabled={loading}
        style={{
          all: 'unset',
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          padding: '11px 0',
          borderRadius: 10,
          background: loading
            ? '#e5e7eb'
            : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          color: loading ? '#9ca3af' : '#fff',
          fontWeight: 700,
          fontSize: 13,
          textAlign: 'center',
          cursor: loading ? 'default' : 'pointer',
          marginBottom: 14,
        }}
      >
        {loading ? '🔄 가져오는 중...' : '📅 오늘 브리핑 받기'}
      </motion.button>

      {!full && !loading && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '20px 0',
            color: '#9ca3af',
          }}
        >
          <span style={{ fontSize: 36 }}>🗓️</span>
          <p style={{ margin: 0, fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
            버튼을 눌러 오늘의 일정과
            <br />
            최근 메일을 한눈에 확인하세요
          </p>
        </div>
      )}

      {full && (
        <>
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 10,
              color: '#9ca3af',
              textAlign: 'right',
            }}
          >
            {fetchedAgo(full.timestamp)} 업데이트
          </p>

          <SectionLabel>📅 오늘 일정 ({full.events.length})</SectionLabel>
          {full.events.length === 0 ? (
            <Empty text="오늘 남은 일정이 없어요 😌" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
              {full.events.map((evt) => {
                const now = Date.now()
                const startMs = new Date(evt.startTime).getTime()
                const ongoing = startMs <= now && new Date(evt.endTime).getTime() > now
                return (
                  <motion.div
                    key={evt.id}
                    whileHover={{ scale: evt.link ? 1.01 : 1 }}
                    onClick={() => evt.link && openExternal(evt.link)}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: 9,
                      borderRadius: 9,
                      background: ongoing ? '#eff6ff' : '#f8faff',
                      border: `1px solid ${ongoing ? '#93c5fd' : '#dbeafe'}`,
                      cursor: evt.link ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ minWidth: 40, flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#2563eb' }}>
                        {formatTime(evt.startTime)}
                      </p>
                      <p style={{ margin: 0, fontSize: 10, color: '#93c5fd' }}>
                        ~{formatTime(evt.endTime)}
                      </p>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#1e3a8a' }}>
                        {ongoing && (
                          <span style={{ color: '#ef4444', marginRight: 3 }}>● </span>
                        )}
                        {evt.title}
                      </p>
                      {evt.location && (
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#3b82f6' }}>
                          📍 {evt.location}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}

          <SectionLabel>✉️ 읽지 않은 메일 ({full.emails.length})</SectionLabel>
          {full.emails.length === 0 ? (
            <Empty text="읽지 않은 메일이 없어요 ✅" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {full.emails.map((email) => (
                <motion.div
                  key={email.id}
                  whileHover={{ scale: email.link ? 1.01 : 1 }}
                  onClick={() => email.link && openExternal(email.link)}
                  style={{
                    padding: 9,
                    borderRadius: 9,
                    background: email.isMondayEmail ? '#fef9ee' : '#f0fdf4',
                    border: email.isMondayEmail ? '1px solid #f59e0b' : '1px solid #bbf7d0',
                    cursor: email.link ? 'pointer' : 'default',
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 600,
                      color: email.isMondayEmail ? '#92400e' : '#14532d',
                    }}
                  >
                    {email.subject}
                  </p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: 11,
                      color: email.isMondayEmail ? '#b45309' : '#16a34a',
                    }}
                  >
                    {email.from}
                  </p>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: '0 0 7px',
        fontSize: 11,
        fontWeight: 700,
        color: '#374151',
      }}
    >
      {children}
    </p>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: '#f9fafb',
        border: '1px dashed #e5e7eb',
        marginBottom: 12,
      }}
    >
      <p style={{ margin: 0, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>{text}</p>
    </div>
  )
}
