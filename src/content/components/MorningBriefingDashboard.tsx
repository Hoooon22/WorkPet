/**
 * MorningBriefingDashboard.tsx
 * 펫 클릭 시 나타나는 말풍선 UI
 *
 * 탭 구조:
 *  📊 브리핑 — 수동 브리핑 받기 + 오늘 전체 일정/최근 메일
 *  🔔 알람   — push 알람으로 수신된 캘린더/메일 알림
 *  🛠️ 도구   — 집중 타이머, 번역, 캡처 등
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { BriefingPayload } from '../../types/messages'
import BrowserToolsPanel from './BrowserToolsPanel'
import type { FocusTimerState } from './FocusTimerPanel'

interface SpeechBubbleProps {
  visible: boolean
  briefing: BriefingPayload           // 알람 탭용 (push 알람 수신 데이터)
  onConfirm: () => void
  onDismiss: () => void
  onEventRead: (id: string) => void
  onEmailRead: (id: string) => void
  wanderEnabled: boolean
  onToggleWander: () => void
  onReturnHome: () => void
  onCloseBubble: () => void
  onStartAreaCapture: () => void
  focusTimer: FocusTimerState
  onTimerStart: (seconds: number) => void
  onTimerTogglePause: () => void
  onTimerReset: () => void
  fullBriefing: BriefingPayload | null  // 브리핑 탭용 (수동 fetch 데이터)
  isLoadingFullBriefing: boolean
  onFetchFullBriefing: () => void
}

// ---- 시간 포맷 헬퍼 ----
function formatRelativeTime(isoString: string): string {
  const diffMs = new Date(isoString).getTime() - Date.now()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 0)    return '기한 초과'
  if (diffMin < 60)   return `${diffMin}분 후`
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}시간 후`
  return `${Math.floor(diffMin / 1440)}일 후`
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatFetchedAgo(timestamp: number): string {
  const diffMin = Math.round((Date.now() - timestamp) / 60000)
  if (diffMin < 1)  return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  return `${Math.floor(diffMin / 60)}시간 전`
}

function todayLabel(): string {
  return new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

// ---- 대시보드 Variants ----
const dashboardVariants = {
  hidden: {
    opacity: 0,
    y: 16,
    scale: 0.92,
    transformOrigin: 'bottom right',
    transition: { duration: 0.18, ease: 'easeIn' },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 380, damping: 28, staggerChildren: 0.07 },
  },
}

const listItemVariants = {
  hidden: { y: 16, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 22 } },
}

function computeAlarmSummary(briefing: BriefingPayload): string {
  const { tasks, events, emails, urgent, summary } = briefing
  const hasContent = tasks.length > 0 || events.length > 0 || emails.length > 0
  if (!hasContent) return summary || '새 알람이 없어요'

  const now = Date.now()
  const urgentEvent = events.find((evt) => {
    const ms = new Date(evt.startTime).getTime() - now
    return ms > 0 && ms <= 15 * 60 * 1000
  })
  if (urgent && urgentEvent) return `"${urgentEvent.title}" 곧 시작돼요!`

  const parts: string[] = []
  if (events.length > 0) parts.push(`일정 ${events.length}개`)
  if (emails.length > 0) parts.push(`메일 ${emails.length}개`)
  if (tasks.length > 0)  parts.push(`태스크 ${tasks.length}개`)
  return parts.join(', ')
}

type TabId = 'briefing' | 'alarm' | 'tools'

export default function MorningBriefingDashboard({
  visible, briefing, onConfirm, onDismiss, onEventRead, onEmailRead,
  wanderEnabled, onToggleWander, onReturnHome, onCloseBubble, onStartAreaCapture,
  focusTimer, onTimerStart, onTimerTogglePause, onTimerReset,
  fullBriefing, isLoadingFullBriefing, onFetchFullBriefing,
}: SpeechBubbleProps) {
  const [activeTab, setActiveTab] = useState<TabId>('alarm')

  const alarmCount = briefing.tasks.length + briefing.events.length + briefing.emails.length
  const hasAlarms  = alarmCount > 0

  const tabs: { id: TabId; label: string }[] = [
    { id: 'alarm',    label: `🔔 알람${alarmCount > 0 ? ` (${alarmCount})` : ''}` },
    { id: 'briefing', label: '📊 브리핑' },
    { id: 'tools',    label: '🛠️ 도구' },
  ]

  return (
    <motion.div
      key="morning-dashboard"
      variants={dashboardVariants}
      initial="hidden"
      animate={visible ? 'visible' : 'hidden'}
      style={{
        position: 'absolute',
        bottom: '80px',
        right: '0px',
        width: '400px',
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(12px)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      role="dialog"
      aria-label="Work-Pet 브리핑"
    >
      {/* ---- 헤더 ---- */}
      <div style={{
        background: hasAlarms && briefing.urgent
          ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
          : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '18px' }}>{hasAlarms && briefing.urgent ? '🚨' : '🤖'}</span>
        <p style={{
          margin: 0,
          color: '#fff',
          fontWeight: 700,
          fontSize: '13px',
          lineHeight: 1.4,
          fontFamily: 'sans-serif',
        }}>
          {activeTab === 'briefing'
            ? `${todayLabel()} 브리핑`
            : activeTab === 'alarm'
            ? computeAlarmSummary(briefing)
            : '도구함'}
        </p>
      </div>

      {/* ---- 탭 전환 ---- */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #f3f4f6',
        padding: '0 8px',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flex: 1,
              padding: '8px 4px',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'sans-serif',
              textAlign: 'center',
              color: activeTab === tab.id ? '#2563eb' : '#9ca3af',
              borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'color 0.15s, border-color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ---- 탭 콘텐츠 (세로 스크롤만 허용) ---- */}
      <div style={{ maxHeight: '380px', overflowY: 'auto', overflowX: 'hidden' }}>

        {/* ════════ 브리핑 탭 ════════ */}
        {activeTab === 'briefing' && (
          <div style={{ padding: '12px 14px 14px' }}>

            {/* 브리핑 받기 버튼 */}
            <motion.button
              onClick={onFetchFullBriefing}
              disabled={isLoadingFullBriefing}
              whileHover={{ scale: isLoadingFullBriefing ? 1 : 1.02 }}
              whileTap={{ scale: isLoadingFullBriefing ? 1 : 0.97 }}
              style={{
                all: 'unset',
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                padding: '11px 0',
                borderRadius: '10px',
                background: isLoadingFullBriefing
                  ? '#e5e7eb'
                  : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: isLoadingFullBriefing ? '#9ca3af' : '#fff',
                fontWeight: 700,
                fontSize: '13px',
                textAlign: 'center',
                cursor: isLoadingFullBriefing ? 'default' : 'pointer',
                boxShadow: isLoadingFullBriefing ? 'none' : '0 2px 10px rgba(37,99,235,0.35)',
                fontFamily: 'sans-serif',
                letterSpacing: '0.2px',
                marginBottom: '14px',
              }}
            >
              {isLoadingFullBriefing
                ? '🔄 가져오는 중...'
                : '📅 오늘 브리핑 받기'}
            </motion.button>

            {/* 초기 안내 (아직 fetch 안 한 경우) */}
            {!fullBriefing && !isLoadingFullBriefing && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '20px 0 8px',
                color: '#9ca3af',
              }}>
                <span style={{ fontSize: '36px' }}>🗓️</span>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  fontFamily: 'sans-serif',
                  textAlign: 'center',
                  lineHeight: 1.6,
                  color: '#6b7280',
                }}>
                  버튼을 눌러 오늘의 일정과<br />최근 메일을 한눈에 확인하세요
                </p>
              </div>
            )}

            {/* 브리핑 결과 */}
            {fullBriefing && (
              <>
                {/* 마지막 업데이트 시각 */}
                <p style={{
                  margin: '0 0 10px',
                  fontSize: '10px',
                  color: '#9ca3af',
                  fontFamily: 'sans-serif',
                  textAlign: 'right',
                }}>
                  {formatFetchedAgo(fullBriefing.timestamp)} 업데이트
                </p>

                {/* 오늘 일정 */}
                <p style={{
                  margin: '0 0 7px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#374151',
                  fontFamily: 'sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  📅 오늘 일정
                  <span style={{
                    background: '#eff6ff',
                    color: '#2563eb',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontFamily: 'sans-serif',
                  }}>
                    {fullBriefing.events.length}
                  </span>
                </p>

                {fullBriefing.events.length === 0 ? (
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#f9fafb',
                    border: '1px dashed #e5e7eb',
                    marginBottom: '12px',
                  }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af', fontFamily: 'sans-serif', textAlign: 'center' }}>
                      오늘 남은 일정이 없어요 😌
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
                    {fullBriefing.events.map((event) => {
                      const nowMs  = Date.now()
                      const startMs = new Date(event.startTime).getTime()
                      const isOngoing = startMs <= nowMs && new Date(event.endTime).getTime() > nowMs
                      return (
                        <motion.div
                          key={event.id}
                          variants={listItemVariants}
                          whileHover={{ scale: event.link ? 1.01 : 1 }}
                          whileTap={{ scale: event.link ? 0.98 : 1 }}
                          onClick={() => event.link && window.open(event.link, '_blank', 'noopener,noreferrer')}
                          style={{
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'stretch',
                            padding: '9px 10px',
                            borderRadius: '9px',
                            background: isOngoing ? '#eff6ff' : '#f8faff',
                            border: `1px solid ${isOngoing ? '#93c5fd' : '#dbeafe'}`,
                            cursor: event.link ? 'pointer' : 'default',
                            position: 'relative',
                          }}
                          title={event.link ? 'Google Calendar에서 열기' : ''}
                        >
                          {/* 시간 컬럼 */}
                          <div style={{ minWidth: '40px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: isOngoing ? '#1d4ed8' : '#2563eb', fontFamily: 'sans-serif', lineHeight: 1.2 }}>
                              {formatTime(event.startTime)}
                            </p>
                            <p style={{ margin: 0, fontSize: '10px', color: '#93c5fd', fontFamily: 'sans-serif', lineHeight: 1.2 }}>
                              ~{formatTime(event.endTime)}
                            </p>
                          </div>
                          {/* 구분선 */}
                          <div style={{
                            width: '2px',
                            borderRadius: '2px',
                            background: isOngoing ? '#3b82f6' : '#bfdbfe',
                            flexShrink: 0,
                          }} />
                          {/* 내용 컬럼 */}
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#1e3a8a', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {isOngoing && <span style={{ color: '#ef4444', marginRight: '3px', fontSize: '10px' }}>● </span>}
                              {event.title}
                            </p>
                            {event.location && (
                              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#3b82f6', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                📍 {event.location}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}

                {/* 최근 메일 */}
                <p style={{
                  margin: '0 0 7px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#374151',
                  fontFamily: 'sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  ✉️ 읽지 않은 메일
                  <span style={{
                    background: '#f0fdf4',
                    color: '#16a34a',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '999px',
                    fontFamily: 'sans-serif',
                  }}>
                    {fullBriefing.emails.length}
                  </span>
                </p>

                {fullBriefing.emails.length === 0 ? (
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: '#f9fafb',
                    border: '1px dashed #e5e7eb',
                  }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af', fontFamily: 'sans-serif', textAlign: 'center' }}>
                      읽지 않은 메일이 없어요 ✅
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {fullBriefing.emails.map((email) => (
                      <motion.div
                        key={email.id}
                        variants={listItemVariants}
                        whileHover={{ scale: email.link ? 1.01 : 1 }}
                        whileTap={{ scale: email.link ? 0.98 : 1 }}
                        onClick={() => email.link && window.open(email.link, '_blank', 'noopener,noreferrer')}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '9px',
                          background: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          cursor: email.link ? 'pointer' : 'default',
                        }}
                        title={email.link ? 'Gmail에서 열기' : ''}
                      >
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#14532d', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {email.subject}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#16a34a', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {email.from}
                        </p>
                        {email.snippet && (
                          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#6b7280', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {email.snippet}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════ 알람 탭 ════════ */}
        {activeTab === 'alarm' && (
          <div>
            {/* 알람 없음 */}
            {!hasAlarms && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '24px 16px',
                color: '#9ca3af',
              }}>
                <span style={{ fontSize: '32px' }}>🔕</span>
                <p style={{ margin: 0, fontSize: '12px', fontFamily: 'sans-serif', color: '#6b7280', textAlign: 'center', lineHeight: 1.6 }}>
                  새 알람이 없어요<br />
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>일정 10분 전·새 메일 도착 시 알려드려요</span>
                </p>
              </div>
            )}

            {/* 태스크 목록 */}
            {briefing.tasks.length > 0 && (
              <div style={{ padding: '12px 14px 8px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'sans-serif' }}>
                  Monday 태스크
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {briefing.tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      variants={listItemVariants}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: task.urgent ? '#fef2f2' : '#f9fafb',
                        border: `1px solid ${task.urgent ? '#fecaca' : '#e5e7eb'}`,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#111827', fontFamily: 'sans-serif' }}>
                          {task.urgent && <span style={{ color: '#ef4444', marginRight: '4px' }}>●</span>}
                          {task.title}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#6b7280', fontFamily: 'sans-serif' }}>{task.project}</p>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: task.urgent ? '#ef4444' : '#6b7280', whiteSpace: 'nowrap', marginLeft: '8px', fontFamily: 'sans-serif' }}>
                        {formatRelativeTime(task.dueDate)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* 캘린더 이벤트 알람 */}
            {briefing.events.length > 0 && (
              <div style={{ padding: '8px 14px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'sans-serif' }}>
                  일정 알람
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {briefing.events.map((event) => (
                    <motion.div
                      key={event.id}
                      variants={listItemVariants}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => event.link && window.open(event.link, '_blank', 'noopener,noreferrer')}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 28px 7px 10px',
                        borderRadius: '8px',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        cursor: event.link ? 'pointer' : 'default',
                      }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); onEventRead(event.id) }}
                        title="읽음 처리"
                        style={{
                          all: 'unset', position: 'absolute', top: '5px', right: '6px',
                          width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '50%', background: 'rgba(147,197,253,0.4)', color: '#1e40af',
                          fontSize: '10px', fontWeight: 700, cursor: 'pointer', lineHeight: 1, fontFamily: 'sans-serif',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#bfdbfe' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(147,197,253,0.4)' }}
                      >✕</button>
                      <span style={{ fontSize: '13px' }}>📅</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#1e40af', fontFamily: 'sans-serif' }}>{event.title}</p>
                        {event.location && <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#3b82f6', fontFamily: 'sans-serif' }}>{event.location}</p>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ margin: 0, fontSize: '11px', color: '#2563eb', fontWeight: 600, fontFamily: 'sans-serif', whiteSpace: 'nowrap' }}>
                          {formatTime(event.startTime)}
                        </p>
                        <p style={{ margin: 0, fontSize: '10px', color: '#93c5fd', fontFamily: 'sans-serif', whiteSpace: 'nowrap' }}>
                          ~{formatTime(event.endTime)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* 메일 알람 */}
            {briefing.emails.length > 0 && (
              <div style={{ padding: '8px 14px 12px' }}>
                <p style={{ margin: '0 0 8px', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'sans-serif' }}>
                  새 메일
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {briefing.emails.map((email) => (
                    <motion.div
                      key={email.id}
                      variants={listItemVariants}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => email.link && window.open(email.link, '_blank', 'noopener,noreferrer')}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '7px 28px 7px 10px',
                        borderRadius: '8px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        cursor: email.link ? 'pointer' : 'default',
                      }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); onEmailRead(email.id) }}
                        title="읽음 처리"
                        style={{
                          all: 'unset', position: 'absolute', top: '5px', right: '6px',
                          width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '50%', background: 'rgba(134,239,172,0.4)', color: '#166534',
                          fontSize: '10px', fontWeight: 700, cursor: 'pointer', lineHeight: 1, fontFamily: 'sans-serif',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#bbf7d0' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(134,239,172,0.4)' }}
                      >✕</button>
                      <span style={{ fontSize: '13px', marginTop: '1px' }}>✉️</span>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#166534', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {email.subject}
                        </p>
                        <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#16a34a', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {email.from}
                        </p>
                        {email.snippet && (
                          <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#4b5563', fontFamily: 'sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {email.snippet}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════ 도구 탭 ════════ */}
        {activeTab === 'tools' && (
          <BrowserToolsPanel
            onCloseBubble={onCloseBubble}
            onStartAreaCapture={onStartAreaCapture}
            focusTimer={focusTimer}
            onTimerStart={onTimerStart}
            onTimerTogglePause={onTimerTogglePause}
            onTimerReset={onTimerReset}
          />
        )}
      </div>

      {/* ---- 꼬리 말풍선 화살표 ---- */}
      <div style={{
        position: 'absolute', bottom: '-9px', right: '26px',
        width: 0, height: 0,
        borderLeft: '9px solid transparent', borderRight: '9px solid transparent',
        borderTop: '10px solid #e5e7eb',
      }} />
      <div style={{
        position: 'absolute', bottom: '-7px', right: '27px',
        width: 0, height: 0,
        borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
        borderTop: '9px solid #ffffff',
      }} />

      {/* ---- 이동 토글 ---- */}
      <div style={{ padding: '8px 14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'sans-serif', fontWeight: 600 }}>
          🐾 돌아다니기
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <motion.button
            onClick={onReturnHome}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            aria-label="원래 위치로 돌아가기"
            style={{
              all: 'unset', cursor: 'pointer',
              fontSize: '11px', fontWeight: 600, fontFamily: 'sans-serif',
              color: '#6b7280', background: '#f3f4f6',
              padding: '3px 8px', borderRadius: '6px',
              border: '1px solid #e5e7eb',
              lineHeight: 1.4,
            }}
          >
            🏠 원위치
          </motion.button>
          <motion.button
            onClick={onToggleWander}
            whileTap={{ scale: 0.93 }}
            aria-label={wanderEnabled ? '이동 끄기' : '이동 켜기'}
            style={{
              all: 'unset', cursor: 'pointer',
              width: '40px', height: '22px', borderRadius: '11px',
              background: wanderEnabled ? '#2563eb' : '#d1d5db',
              position: 'relative', transition: 'background 0.2s ease', flexShrink: 0,
            }}
          >
            <motion.span
              animate={{ x: wanderEnabled ? 19 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              style={{
                display: 'block', width: '18px', height: '18px', borderRadius: '50%',
                background: '#ffffff', position: 'absolute', top: '2px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }}
            />
          </motion.button>
        </div>
      </div>

      {/* ---- 액션 버튼 ---- */}
      <div style={{ padding: '10px 14px 14px', display: 'flex', gap: '8px' }}>
        <motion.button
          onClick={onConfirm}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{
            all: 'unset', flex: 1, cursor: 'pointer',
            padding: '9px 0', borderRadius: '10px',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#fff', fontWeight: 700, fontSize: '13px', textAlign: 'center',
            boxShadow: '0 2px 8px rgba(37,99,235,0.35)', fontFamily: 'sans-serif',
          }}
        >
          ✅ 확인하기
        </motion.button>
        <motion.button
          onClick={onDismiss}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{
            all: 'unset', cursor: 'pointer',
            padding: '9px 14px', borderRadius: '10px',
            background: '#f3f4f6', color: '#6b7280',
            fontWeight: 600, fontSize: '12px', fontFamily: 'sans-serif',
          }}
        >
          들어가
        </motion.button>
      </div>
    </motion.div>
  )
}
