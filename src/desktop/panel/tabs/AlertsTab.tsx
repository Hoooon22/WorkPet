import { motion } from 'framer-motion'
import { open as openExternal } from '@tauri-apps/plugin-shell'
import type { BriefingPayload } from '../../../shared/types'

interface Props {
  briefing: BriefingPayload
  action: (type: string, payload?: unknown) => void
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function AlertsTab({ briefing, action }: Props) {
  const hasAny =
    briefing.events.length > 0 ||
    briefing.emails.length > 0 ||
    briefing.tasks.length > 0

  if (!hasAny) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: '32px 16px',
          color: '#9ca3af',
        }}
      >
        <span style={{ fontSize: 36 }}>🔕</span>
        <p style={{ margin: 0, fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
          새 알람이 없어요
          <br />
          <span style={{ fontSize: 11 }}>
            일정 10분 전 · 새 메일 도착 시 알려드려요
          </span>
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: 14 }}>
      {briefing.events.length > 0 && (
        <Section title="일정 알람">
          {briefing.events.map((e) => (
            <Card
              key={e.id}
              accent="#bfdbfe"
              bg="#eff6ff"
              titleColor="#1e40af"
              onClick={() => {
                if (e.link) openExternal(e.link)
                action('event-read', e.id)
              }}
              onClose={() => action('event-read', e.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>📅</span>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#1e40af' }}>
                    {e.title}
                  </p>
                  {e.location && (
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: '#3b82f6' }}>
                      {e.location}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#2563eb', fontWeight: 600 }}>
                    {formatTime(e.startTime)}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: '#93c5fd' }}>
                    ~{formatTime(e.endTime)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </Section>
      )}

      {briefing.emails.length > 0 && (
        <Section title="새 메일">
          {briefing.emails.map((e) => (
            <Card
              key={e.id}
              accent={e.isMondayEmail ? '#f59e0b' : '#bbf7d0'}
              bg={e.isMondayEmail ? '#fef9ee' : '#f0fdf4'}
              titleColor={e.isMondayEmail ? '#92400e' : '#166534'}
              onClick={() => {
                if (e.link) openExternal(e.link)
                action('email-read', e.id)
              }}
              onClose={() => action('email-read', e.id)}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 13 }}>{e.isMondayEmail ? '📋' : '✉️'}</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: e.isMondayEmail ? 700 : 600,
                      color: e.isMondayEmail ? '#92400e' : '#166534',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {e.subject}
                  </p>
                  <p
                    style={{
                      margin: '1px 0 0',
                      fontSize: 11,
                      color: e.isMondayEmail ? '#b45309' : '#16a34a',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {e.from}
                  </p>
                  {e.snippet && (
                    <p
                      style={{
                        margin: '2px 0 0',
                        fontSize: 11,
                        color: '#4b5563',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {e.snippet}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </Section>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={() => action('dismiss-pet')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 14px',
            borderRadius: 8,
            background: '#f3f4f6',
            color: '#6b7280',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          들어가
        </button>
        <button
          onClick={() => action('toggle-wander')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 14px',
            borderRadius: 8,
            background: '#eff6ff',
            color: '#2563eb',
            fontSize: 12,
            fontWeight: 600,
            border: '1px solid #bfdbfe',
          }}
        >
          💤 재우기 / 깨우기
        </button>
        <button
          onClick={() => action('return-home')}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 14px',
            borderRadius: 8,
            background: '#f3f4f6',
            color: '#6b7280',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          🏠 원위치
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p
        style={{
          margin: '0 0 8px',
          fontSize: 11,
          fontWeight: 700,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  )
}

function Card({
  children,
  bg,
  accent,
  titleColor: _titleColor,
  onClick,
  onClose,
}: {
  children: React.ReactNode
  bg: string
  accent: string
  titleColor: string
  onClick?: () => void
  onClose?: () => void
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      style={{
        position: 'relative',
        padding: '8px 32px 8px 10px',
        borderRadius: 8,
        background: bg,
        border: `1px solid ${accent}`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {children}
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          style={{
            all: 'unset',
            position: 'absolute',
            top: '50%',
            right: 6,
            transform: 'translateY(-50%)',
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.06)',
            color: '#374151',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      )}
    </motion.div>
  )
}
