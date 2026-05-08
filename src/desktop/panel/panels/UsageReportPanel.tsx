import { useEffect, useMemo, useState } from 'react'
import { getValue, KEYS, subscribeStorage } from '../../../shared/storage'
import { formatDuration } from '../../../shared/usageTracker'
import type { UsageRecord } from '../../../shared/types'

const COLOR_BG = '#eef2ff'
const COLOR_BORDER = '#c7d2fe'
const COLOR_FG = '#4338ca'
const BAR_COLOR = '#6366f1'

const TOP_N = 8

type Mode = 'today' | 'history'

export default function UsageReportPanel() {
  const [today, setToday] = useState<UsageRecord | null>(null)
  const [history, setHistory] = useState<UsageRecord[]>([])
  const [mode, setMode] = useState<Mode>('today')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const unsubs: Array<() => void> = []
    ;(async () => {
      const t = (await getValue<UsageRecord>(KEYS.USAGE_TODAY)) ?? null
      const h = (await getValue<UsageRecord[]>(KEYS.USAGE_HISTORY)) ?? []
      if (cancelled) return
      setToday(t)
      setHistory(h)
      unsubs.push(
        await subscribeStorage<UsageRecord>(KEYS.USAGE_TODAY, (val) => {
          if (!cancelled) setToday(val)
        }),
      )
      unsubs.push(
        await subscribeStorage<UsageRecord[]>(KEYS.USAGE_HISTORY, (val) => {
          if (!cancelled) setHistory(val ?? [])
        }),
      )
    })()
    return () => {
      cancelled = true
      unsubs.forEach((off) => off())
    }
  }, [])

  const visibleRecord = useMemo<UsageRecord | null>(() => {
    if (mode === 'today') return today
    if (!selectedDate) return null
    return history.find((r) => r.date === selectedDate) ?? null
  }, [mode, selectedDate, today, history])

  const ranked = useMemo(() => {
    if (!visibleRecord) return [] as Array<[string, number]>
    return Object.entries(visibleRecord.apps).sort((a, b) => b[1] - a[1])
  }, [visibleRecord])

  const totalSec = ranked.reduce((sum, [, s]) => sum + s, 0)
  const topSec = ranked[0]?.[1] ?? 0

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
      <div style={{ display: 'flex', gap: 4 }}>
        {(['today', 'history'] as const).map((key) => {
          const isActive = mode === key
          return (
            <button
              key={key}
              onClick={() => {
                setMode(key)
                if (key === 'history' && !selectedDate && history.length > 0) {
                  setSelectedDate(history[history.length - 1].date)
                }
              }}
              style={{
                all: 'unset',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 5,
                background: isActive ? COLOR_FG : 'transparent',
                color: isActive ? '#fff' : COLOR_FG,
                border: `1px solid ${isActive ? COLOR_FG : COLOR_BORDER}`,
              }}
            >
              {key === 'today' ? '오늘' : '지난 기록'}
            </button>
          )
        })}
      </div>

      {mode === 'history' && (
        <select
          value={selectedDate ?? ''}
          onChange={(e) => setSelectedDate(e.target.value || null)}
          style={{
            border: `1px solid ${COLOR_BORDER}`,
            borderRadius: 6,
            padding: '5px 8px',
            fontSize: 11,
            background: '#fff',
            color: '#1f2937',
            outline: 'none',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {history.length === 0 && <option value="">기록이 없어요</option>}
          {[...history].reverse().map((r) => (
            <option key={r.date} value={r.date}>
              {r.date}
            </option>
          ))}
        </select>
      )}

      {!visibleRecord || ranked.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: '#3730a3',
            textAlign: 'center',
            padding: '14px 4px',
            lineHeight: 1.5,
          }}
        >
          아직 기록이 없어요.
          <br />
          잠시 후 다시 열어 보세요. ⏳
        </p>
      ) : (
        <>
          <div
            style={{
              background: '#fff',
              border: `1px solid ${COLOR_BORDER}`,
              borderRadius: 8,
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div style={{ fontSize: 10, color: COLOR_FG, fontWeight: 700, letterSpacing: 0.4 }}>
              총 사용 시간
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: '#1f2937',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatDuration(totalSec)}
            </div>
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
            {ranked.slice(0, TOP_N).map(([app, sec], idx) => {
              const pct = topSec > 0 ? Math.min(100, (sec / topSec) * 100) : 0
              return (
                <div
                  key={app}
                  style={{
                    background: '#fff',
                    border: `1px solid ${COLOR_BORDER}`,
                    borderRadius: 7,
                    padding: '7px 9px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#1f2937',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={app}
                    >
                      <span style={{ color: COLOR_FG, marginRight: 5 }}>{idx + 1}.</span>
                      {app}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: '#374151',
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {formatDuration(sec)}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 2,
                      background: COLOR_BORDER,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background: BAR_COLOR,
                        transition: 'width 0.2s',
                      }}
                    />
                  </div>
                </div>
              )
            })}
            {ranked.length > TOP_N && (
              <p
                style={{
                  margin: 0,
                  fontSize: 10,
                  color: '#6b7280',
                  textAlign: 'center',
                  padding: '4px 0',
                }}
              >
                + {ranked.length - TOP_N}개 더 있어요
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
