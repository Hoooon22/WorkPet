import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

const appWindow = getCurrentWebviewWindow()

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export default function Screenshot() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function cancel() {
    return invoke('close_screenshot_overlay')
  }

  function rect(): Rect | null {
    if (!start || !current) return null
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const w = Math.abs(current.x - start.x)
    const h = Math.abs(current.y - start.y)
    return { x, y, w, h }
  }

  function handleMouseDown(e: React.MouseEvent) {
    setStart({ x: e.clientX, y: e.clientY })
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!start) return
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  async function handleMouseUp() {
    const r = rect()
    if (!r || r.w < 4 || r.h < 4) {
      setStart(null)
      setCurrent(null)
      return
    }
    try {
      const winPos = await appWindow.outerPosition()
      const screenX = winPos.x + r.x
      const screenY = winPos.y + r.y
      const data = await invoke<string>('capture_region', {
        x: screenX,
        y: screenY,
        w: r.w,
        h: r.h,
      })
      await emit('orbit:screenshot-result', data)
    } catch (err) {
      console.warn('[orbit] capture_region failed', err)
    } finally {
      await invoke('close_screenshot_overlay')
    }
  }

  const r = rect()

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        cursor: 'crosshair',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {r && (
        <div
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            background: 'rgba(255,255,255,0.05)',
            border: '2px dashed #60a5fa',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '6px 14px',
          background: 'rgba(0,0,0,0.7)',
          color: '#fff',
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'sans-serif',
          pointerEvents: 'none',
        }}
      >
        영역을 드래그해서 캡처 · ESC로 취소
      </div>
    </div>
  )
}
