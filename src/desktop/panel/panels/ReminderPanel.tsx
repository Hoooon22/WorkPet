import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getValue, setValue, KEYS, subscribeStorage } from '../../../shared/storage'
import { makeReminderId } from '../../../shared/reminders'
import type { ReminderRule } from '../../../shared/types'

const COLOR_BG = '#fff7ed'
const COLOR_BORDER = '#fed7aa'
const COLOR_FG = '#c2410c'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTime(rule: ReminderRule): string {
  return `${pad2(rule.hour)}:${pad2(rule.minute)}`
}

export default function ReminderPanel() {
  const [rules, setRules] = useState<ReminderRule[]>([])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftTime, setDraftTime] = useState('12:30')
  const [draftMessage, setDraftMessage] = useState('')
  const [draftWeekdays, setDraftWeekdays] = useState(false)

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    ;(async () => {
      const saved = (await getValue<ReminderRule[]>(KEYS.REMINDER_RULES)) ?? []
      if (!cancelled) setRules(saved)
      unsub = await subscribeStorage<ReminderRule[]>(KEYS.REMINDER_RULES, (val) => {
        if (cancelled) return
        setRules(val ?? [])
      })
    })()
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  const persist = async (next: ReminderRule[]) => {
    setRules(next)
    await setValue(KEYS.REMINDER_RULES, next)
  }

  const resetDraft = () => {
    setDraftLabel('')
    setDraftTime('12:30')
    setDraftMessage('')
    setDraftWeekdays(false)
    setAdding(false)
    setEditingId(null)
  }

  const submitDraft = async () => {
    const label = draftLabel.trim()
    if (!label) return
    const [hStr, mStr] = draftTime.split(':')
    const hour = Number(hStr)
    const minute = Number(mStr)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return

    const message = draftMessage.trim() || undefined

    if (editingId) {
      await persist(
        rules.map((r) =>
          r.id === editingId
            ? { ...r, label, hour, minute, weekdaysOnly: draftWeekdays, message }
            : r,
        ),
      )
    } else {
      const rule: ReminderRule = {
        id: makeReminderId(),
        label,
        hour,
        minute,
        enabled: true,
        weekdaysOnly: draftWeekdays,
        message,
      }
      await persist([...rules, rule])
    }
    resetDraft()
  }

  const startEdit = (rule: ReminderRule) => {
    setEditingId(rule.id)
    setDraftLabel(rule.label)
    setDraftTime(`${pad2(rule.hour)}:${pad2(rule.minute)}`)
    setDraftMessage(rule.message ?? '')
    setDraftWeekdays(rule.weekdaysOnly)
    setAdding(true)
  }

  const toggleEnabled = async (id: string) => {
    await persist(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  const removeRule = async (id: string) => {
    if (editingId === id) resetDraft()
    await persist(rules.filter((r) => r.id !== id))
  }

  const submitDisabled = !draftLabel.trim()

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
      {rules.length === 0 && !adding && (
        <p style={{ margin: 0, fontSize: 11, color: '#9a3412', textAlign: 'center', padding: '6px 0' }}>
          정해진 시간에 펫이 알려줘요. 아래 버튼으로 추가해보세요.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <AnimatePresence initial={false}>
          {rules.map((rule) => {
            const isEditing = editingId === rule.id
            return (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: isEditing ? COLOR_BG : '#fff',
                  border: `1px solid ${isEditing ? COLOR_FG : COLOR_BORDER}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  opacity: rule.enabled ? 1 : 0.55,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: COLOR_FG,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatTime(rule)}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#1f2937',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rule.label}
                    </span>
                    {rule.weekdaysOnly && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: '#9a3412',
                          background: COLOR_BG,
                          border: `1px solid ${COLOR_BORDER}`,
                          borderRadius: 4,
                          padding: '1px 5px',
                        }}
                      >
                        평일
                      </span>
                    )}
                  </div>
                  {rule.message && (
                    <div
                      style={{
                        fontSize: 10,
                        color: '#6b7280',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {rule.message}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => toggleEnabled(rule.id)}
                  aria-label={rule.enabled ? '비활성화' : '활성화'}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    width: 32,
                    height: 18,
                    borderRadius: 9,
                    background: rule.enabled ? COLOR_FG : '#d1d5db',
                    position: 'relative',
                    transition: 'background 0.15s',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: rule.enabled ? 16 : 2,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.15s',
                    }}
                  />
                </button>
                <button
                  onClick={() => (isEditing ? resetDraft() : startEdit(rule))}
                  aria-label={isEditing ? '편집 취소' : '편집'}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isEditing ? COLOR_FG : '#9ca3af',
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => removeRule(rule.id)}
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
                    fontSize: 14,
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

      {adding ? (
        <div
          style={{
            background: '#fff',
            border: `1px solid ${COLOR_BORDER}`,
            borderRadius: 8,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: COLOR_FG,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {editingId ? '✏️ 알림 수정' : '＋ 새 알림'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitDraft()}
              placeholder="이름 (예: 점심시간)"
              style={{
                flex: 1,
                minWidth: 0,
                border: `1px solid ${COLOR_BORDER}`,
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 11,
                color: '#1f2937',
                outline: 'none',
              }}
            />
            <input
              type="time"
              value={draftTime}
              onChange={(e) => setDraftTime(e.target.value)}
              style={{
                border: `1px solid ${COLOR_BORDER}`,
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 11,
                color: '#1f2937',
                outline: 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>
          <input
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitDraft()}
            placeholder="펫이 띄울 말 (선택)"
            style={{
              border: `1px solid ${COLOR_BORDER}`,
              borderRadius: 6,
              padding: '6px 8px',
              fontSize: 11,
              color: '#1f2937',
              outline: 'none',
            }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#6b7280',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={draftWeekdays}
              onChange={(e) => setDraftWeekdays(e.target.checked)}
              style={{ margin: 0 }}
            />
            평일(월~금)에만 알림
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <motion.button
              whileHover={{ scale: submitDisabled ? 1 : 1.02 }}
              whileTap={{ scale: submitDisabled ? 1 : 0.97 }}
              onClick={submitDraft}
              disabled={submitDisabled}
              style={{
                all: 'unset',
                flex: 1,
                cursor: submitDisabled ? 'default' : 'pointer',
                background: submitDisabled ? '#fed7aa' : COLOR_FG,
                color: submitDisabled ? '#fdba74' : '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '7px 0',
                borderRadius: 6,
                textAlign: 'center',
              }}
            >
              {editingId ? '저장' : '추가'}
            </motion.button>
            <button
              onClick={resetDraft}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '7px 14px',
                borderRadius: 6,
                background: '#fff',
                border: `1px solid ${COLOR_BORDER}`,
                color: COLOR_FG,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setAdding(true)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            background: COLOR_FG,
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            padding: '8px 0',
            borderRadius: 7,
            textAlign: 'center',
          }}
        >
          ＋ 알림 추가
        </motion.button>
      )}
    </div>
  )
}
