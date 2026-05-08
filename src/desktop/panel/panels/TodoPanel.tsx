import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getValue, setValue, KEYS, subscribeStorage } from '../../../shared/storage'
import type { TodoEntry } from '../../../shared/types'

const COLOR_BG = '#fefce8'
const COLOR_BORDER = '#fde68a'
const COLOR_FG = '#a16207'

const TODO_MAX = 50

function makeId(): string {
  return `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export default function TodoPanel() {
  const [todos, setTodos] = useState<TodoEntry[]>([])
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  useEffect(() => {
    let cancelled = false
    let unsub: (() => void) | undefined
    ;(async () => {
      const saved = (await getValue<TodoEntry[]>(KEYS.TODO_LIST)) ?? []
      if (!cancelled) setTodos(saved)
      unsub = await subscribeStorage<TodoEntry[]>(KEYS.TODO_LIST, (val) => {
        if (cancelled) return
        setTodos(val ?? [])
      })
    })()
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [])

  const persist = async (next: TodoEntry[]) => {
    setTodos(next)
    await setValue(KEYS.TODO_LIST, next)
  }

  const handleAdd = async () => {
    const text = draft.trim()
    if (!text) return
    const entry: TodoEntry = {
      id: makeId(),
      text,
      done: false,
      createdAt: Date.now(),
    }
    const next = [entry, ...todos].slice(0, TODO_MAX)
    setDraft('')
    await persist(next)
  }

  const handleToggle = async (id: string) => {
    const next = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    await persist(next)
  }

  const handleDelete = async (id: string) => {
    await persist(todos.filter((t) => t.id !== id))
  }

  const handleClearDone = async () => {
    await persist(todos.filter((t) => !t.done))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleAdd()
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'active') return todos.filter((t) => !t.done)
    if (filter === 'done') return todos.filter((t) => t.done)
    return todos
  }, [todos, filter])

  const activeCount = todos.filter((t) => !t.done).length
  const doneCount = todos.length - activeCount

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
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="할 일을 입력하고 Enter…"
          maxLength={200}
          style={{
            flex: 1,
            minWidth: 0,
            boxSizing: 'border-box',
            border: `1px solid ${COLOR_BORDER}`,
            borderRadius: 7,
            padding: '7px 9px',
            fontSize: 11,
            color: '#713f12',
            background: '#fff',
            outline: 'none',
          }}
        />
        <motion.button
          whileHover={{ scale: draft.trim() ? 1.04 : 1 }}
          whileTap={{ scale: draft.trim() ? 0.96 : 1 }}
          onClick={handleAdd}
          disabled={!draft.trim()}
          style={{
            all: 'unset',
            cursor: draft.trim() ? 'pointer' : 'default',
            background: draft.trim() ? COLOR_FG : '#fef3c7',
            color: draft.trim() ? '#fff' : '#fcd34d',
            fontSize: 12,
            fontWeight: 700,
            padding: '7px 12px',
            borderRadius: 7,
          }}
        >
          추가
        </motion.button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 10,
          color: COLOR_FG,
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'active', 'done'] as const).map((key) => {
            const isActive = filter === key
            const label = key === 'all' ? '전체' : key === 'active' ? '진행' : '완료'
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 5,
                  background: isActive ? COLOR_FG : 'transparent',
                  color: isActive ? '#fff' : COLOR_FG,
                  border: `1px solid ${isActive ? COLOR_FG : COLOR_BORDER}`,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <span style={{ opacity: 0.75 }}>
          {activeCount}개 진행 · {doneCount}개 완료
        </span>
      </div>

      {todos.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: '#713f12',
            textAlign: 'center',
            padding: '14px 0',
            lineHeight: 1.5,
          }}
        >
          할 일을 추가해 보세요.
          <br />
          체크박스로 완료 표시할 수 있어요.
        </p>
      ) : (
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
            {filtered.map((todo) => (
              <motion.div
                key={todo.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.15 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#fff',
                  border: `1px solid ${COLOR_BORDER}`,
                  borderRadius: 7,
                  padding: '7px 8px',
                }}
              >
                <button
                  onClick={() => handleToggle(todo.id)}
                  aria-label={todo.done ? '완료 취소' : '완료 표시'}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    border: `1.5px solid ${todo.done ? COLOR_FG : '#d6d3d1'}`,
                    background: todo.done ? COLOR_FG : '#fff',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    flexShrink: 0,
                    fontWeight: 900,
                  }}
                >
                  {todo.done ? '✓' : ''}
                </button>
                <span
                  onClick={() => handleToggle(todo.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11,
                    color: todo.done ? '#9ca3af' : '#1f2937',
                    textDecoration: todo.done ? 'line-through' : 'none',
                    cursor: 'pointer',
                    wordBreak: 'break-word',
                    lineHeight: 1.4,
                  }}
                >
                  {todo.text}
                </span>
                <button
                  onClick={() => handleDelete(todo.id)}
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
            ))}
          </AnimatePresence>
        </div>
      )}

      {doneCount > 0 && (
        <button
          onClick={handleClearDone}
          style={{
            all: 'unset',
            alignSelf: 'flex-end',
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 600,
            color: COLOR_FG,
            padding: '2px 6px',
            borderRadius: 4,
          }}
        >
          완료 항목 지우기
        </button>
      )}
    </div>
  )
}
