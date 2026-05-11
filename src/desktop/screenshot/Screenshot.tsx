import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'

const appWindow = getCurrentWebviewWindow()
const isColorMode = appWindow.label === 'color-picker'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface PickerCapture {
  img: HTMLImageElement
  physicalWidth: number
  physicalHeight: number
}

const LOUPE_SIZE = 144
const LOUPE_ZOOM = 10
const LOUPE_OFFSET = 28

function rgbToHex(r: number, g: number, b: number) {
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('')
  )
}

export default function Screenshot() {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [picker, setPicker] = useState<PickerCapture | null>(null)
  const [hex, setHex] = useState<string>('')
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sampleRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    void appWindow.setFocus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!isColorMode) return
    let cancelled = false
    invoke<{ dataUrl: string; physicalWidth: number; physicalHeight: number } | null>(
      'take_color_picker_capture',
    )
      .then((res) => {
        if (cancelled || !res) return
        const img = new Image()
        img.onload = () => {
          if (!cancelled) {
            setPicker({
              img,
              physicalWidth: res.physicalWidth,
              physicalHeight: res.physicalHeight,
            })
          }
        }
        img.src = res.dataUrl
      })
      .catch((err) => console.warn('[orbit] take_color_picker_capture failed', err))
    return () => {
      cancelled = true
    }
  }, [])

  // Re-render the magnifier loupe whenever cursor or capture changes.
  useEffect(() => {
    if (!isColorMode || !picker || !cursor) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const sx = (cursor.x / window.innerWidth) * picker.physicalWidth
    const sy = (cursor.y / window.innerHeight) * picker.physicalHeight
    const srcSize = LOUPE_SIZE / LOUPE_ZOOM
    const srcX = Math.round(sx - srcSize / 2)
    const srcY = Math.round(sy - srcSize / 2)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE)
    ctx.drawImage(
      picker.img,
      srcX,
      srcY,
      srcSize,
      srcSize,
      0,
      0,
      LOUPE_SIZE,
      LOUPE_SIZE,
    )
    // Sample the exact center pixel for the live hex readout.
    let sample = sampleRef.current
    if (!sample) {
      sample = document.createElement('canvas')
      sample.width = 1
      sample.height = 1
      sampleRef.current = sample
    }
    const sctx = sample.getContext('2d')
    if (sctx) {
      sctx.imageSmoothingEnabled = false
      sctx.clearRect(0, 0, 1, 1)
      sctx.drawImage(picker.img, Math.round(sx), Math.round(sy), 1, 1, 0, 0, 1, 1)
      const [r, g, b] = sctx.getImageData(0, 0, 1, 1).data
      setHex(rgbToHex(r, g, b))
    }
  }, [cursor, picker])

  function cancel() {
    if (isColorMode) return appWindow.close()
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

  async function handleColorPick(e: React.MouseEvent) {
    const cx = e.clientX
    const cy = e.clientY
    try {
      let result: string | null = null
      if (picker) {
        const sx = Math.round((cx / window.innerWidth) * picker.physicalWidth)
        const sy = Math.round((cy / window.innerHeight) * picker.physicalHeight)
        const sample = document.createElement('canvas')
        sample.width = 1
        sample.height = 1
        const sctx = sample.getContext('2d')
        if (sctx) {
          sctx.imageSmoothingEnabled = false
          sctx.drawImage(picker.img, sx, sy, 1, 1, 0, 0, 1, 1)
          const [r, g, b] = sctx.getImageData(0, 0, 1, 1).data
          result = rgbToHex(r, g, b)
        }
      }
      if (!result) {
        // Fallback: live sample via Rust if the cached capture is unavailable.
        const winPos = await appWindow.outerPosition()
        await appWindow.hide()
        await new Promise((r) => setTimeout(r, 50))
        result = await invoke<string>('pick_pixel', {
          x: winPos.x + cx,
          y: winPos.y + cy,
        })
      }
      await emit('orbit:color-result', result)
    } catch (err) {
      console.warn('[orbit] pick failed', err)
    } finally {
      await appWindow.close()
    }
  }

  if (isColorMode) {
    // Position the loupe relative to the cursor, flipping near edges so it
    // never gets clipped by the screen bounds.
    let loupeLeft = 0
    let loupeTop = 0
    if (cursor) {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const FOOTER = 22
      loupeLeft =
        cursor.x + LOUPE_OFFSET + LOUPE_SIZE > vw - 8
          ? cursor.x - LOUPE_OFFSET - LOUPE_SIZE
          : cursor.x + LOUPE_OFFSET
      loupeTop =
        cursor.y + LOUPE_OFFSET + LOUPE_SIZE + FOOTER > vh - 8
          ? cursor.y - LOUPE_OFFSET - LOUPE_SIZE - FOOTER
          : cursor.y + LOUPE_OFFSET
    }
    return (
      <div
        ref={containerRef}
        onMouseDown={handleColorPick}
        onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          cursor: 'crosshair',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {cursor && (
          <div
            style={{
              position: 'absolute',
              left: loupeLeft,
              top: loupeTop,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: LOUPE_SIZE,
                height: LOUPE_SIZE,
                borderRadius: '50%',
                overflow: 'hidden',
                boxShadow:
                  '0 0 0 2px #fff, 0 0 0 4px rgba(0,0,0,0.55), 0 6px 18px rgba(0,0,0,0.5)',
                background: '#000',
              }}
            >
              <canvas
                ref={canvasRef}
                width={LOUPE_SIZE}
                height={LOUPE_SIZE}
                style={{ display: 'block', width: LOUPE_SIZE, height: LOUPE_SIZE }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: LOUPE_SIZE / 2 - LOUPE_ZOOM / 2,
                  top: LOUPE_SIZE / 2 - LOUPE_ZOOM / 2,
                  width: LOUPE_ZOOM,
                  height: LOUPE_ZOOM,
                  border: '1px solid #fff',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.85)',
                }}
              />
            </div>
            {hex && (
              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  background: 'rgba(0,0,0,0.75)',
                  color: '#fff',
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  letterSpacing: 0.5,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: hex,
                    border: '1px solid rgba(255,255,255,0.6)',
                  }}
                />
                {hex}
              </div>
            )}
          </div>
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
            pointerEvents: 'none',
          }}
        >
          🎯 클릭해서 색상 추출 · ESC로 취소
        </div>
      </div>
    )
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
          pointerEvents: 'none',
        }}
      >
        영역을 드래그해서 캡처 · ESC로 취소
      </div>
    </div>
  )
}
