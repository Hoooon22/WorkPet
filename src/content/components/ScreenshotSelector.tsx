/**
 * ScreenshotSelector.tsx
 * 영역 선택 스크린샷 오버레이
 *
 * Shadow DOM 내부 React 트리에서 사용되므로 합성 이벤트를 쓰지 않는다.
 * useEffect 안에서 document.body에 순수 DOM 엘리먼트를 직접 생성하고
 * 네이티브 이벤트 리스너를 등록한다.
 * → React portal / Shadow DOM 이벤트 버블링 문제를 완전히 우회.
 */

import { useEffect } from 'react'
import type { CaptureScreenshotResponse } from '../../types/messages'

interface Props {
  onDone: () => void
}

function downloadImage(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

export default function ScreenshotSelector({ onDone }: Props) {
  useEffect(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight

    // ── 루트 오버레이 ────────────────────────────────────
    const overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'cursor:crosshair', 'user-select:none', '-webkit-user-select:none',
    ].join(';')
    document.body.appendChild(overlay)

    // 전체 반투명 배경 (선택 전)
    const fullBg = document.createElement('div')
    fullBg.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);'
    overlay.appendChild(fullBg)

    // 안내 텍스트
    const hint = document.createElement('div')
    hint.style.cssText = [
      'position:absolute', 'top:50%', 'left:50%',
      'transform:translate(-50%,-50%)',
      'background:rgba(0,0,0,0.72)', 'border-radius:14px',
      'padding:16px 28px', 'text-align:center', 'pointer-events:none',
      'border:1px solid rgba(255,255,255,0.15)',
    ].join(';')
    hint.innerHTML = `
      <p style="margin:0 0 6px;color:#fff;font-size:16px;font-weight:700;font-family:sans-serif;">
        📸 영역을 드래그해서 선택하세요
      </p>
      <p style="margin:0;color:rgba(255,255,255,0.6);font-size:12px;font-family:sans-serif;">
        ESC 키로 취소
      </p>`
    overlay.appendChild(hint)

    // 선택 영역 테두리
    const selBorder = document.createElement('div')
    selBorder.style.cssText = [
      'position:absolute', 'box-sizing:border-box',
      'border:2px solid rgba(255,255,255,0.9)',
      'pointer-events:none', 'display:none',
    ].join(';')
    overlay.appendChild(selBorder)

    // 크기 레이블
    const sizeLabel = document.createElement('div')
    sizeLabel.style.cssText = [
      'position:absolute', 'background:rgba(0,0,0,0.65)', 'color:#fff',
      'font-size:11px', 'font-weight:600', 'font-family:sans-serif',
      'padding:3px 8px', 'border-radius:5px', 'pointer-events:none',
      'display:none', 'white-space:nowrap', 'letter-spacing:0.02em',
      'transform:translate(-50%,-50%)',
    ].join(';')
    overlay.appendChild(sizeLabel)

    // 4분할 어두운 영역
    const mkDark = () => {
      const d = document.createElement('div')
      d.style.cssText = 'position:absolute;background:rgba(0,0,0,0.55);pointer-events:none;display:none;'
      overlay.appendChild(d)
      return d
    }
    const [dTop, dBottom, dLeft, dRight] = [mkDark(), mkDark(), mkDark(), mkDark()]

    // ── 상태 ────────────────────────────────────────────
    let startX = 0, startY = 0, dragging = false

    function showSelection(ex: number, ey: number) {
      const x = Math.min(startX, ex), y = Math.min(startY, ey)
      const w = Math.abs(ex - startX), h = Math.abs(ey - startY)

      fullBg.style.display = 'none'
      hint.style.display = 'none'
      ;[dTop, dBottom, dLeft, dRight].forEach((d) => (d.style.display = 'block'))
      selBorder.style.display = 'block'

      dTop.style.cssText    = `position:absolute;background:rgba(0,0,0,0.55);left:0;top:0;width:${vw}px;height:${y}px;`
      dBottom.style.cssText = `position:absolute;background:rgba(0,0,0,0.55);left:0;top:${y+h}px;width:${vw}px;height:${vh-y-h}px;`
      dLeft.style.cssText   = `position:absolute;background:rgba(0,0,0,0.55);left:0;top:${y}px;width:${x}px;height:${h}px;`
      dRight.style.cssText  = `position:absolute;background:rgba(0,0,0,0.55);left:${x+w}px;top:${y}px;width:${vw-x-w}px;height:${h}px;`

      selBorder.style.left   = `${x}px`
      selBorder.style.top    = `${y}px`
      selBorder.style.width  = `${w}px`
      selBorder.style.height = `${h}px`

      if (w > 60 && h > 20) {
        sizeLabel.style.display = 'block'
        sizeLabel.style.left    = `${x + w / 2}px`
        sizeLabel.style.top     = `${y + h / 2}px`
        sizeLabel.textContent   = `${w} × ${h}`
      } else {
        sizeLabel.style.display = 'none'
      }
    }

    function resetToIdle() {
      dragging = false
      fullBg.style.display = 'block'
      hint.style.display = 'block'
      selBorder.style.display = 'none'
      sizeLabel.style.display = 'none'
      ;[dTop, dBottom, dLeft, dRight].forEach((d) => (d.style.display = 'none'))
    }

    // ── 이벤트 핸들러 ────────────────────────────────────
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault()
      dragging = true
      startX = e.clientX
      startY = e.clientY
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return
      showSelection(e.clientX, e.clientY)
    }

    const onMouseUp = async (e: MouseEvent) => {
      if (!dragging) return
      dragging = false

      const x = Math.min(startX, e.clientX)
      const y = Math.min(startY, e.clientY)
      const w = Math.abs(e.clientX - startX)
      const h = Math.abs(e.clientY - startY)

      if (w < 10 || h < 10) { resetToIdle(); return }

      // 오버레이 숨김 → 캡처
      overlay.style.transition = 'opacity 0.05s'
      overlay.style.opacity = '0'
      await new Promise<void>((r) => setTimeout(r, 120))

      try {
        const res = await chrome.runtime.sendMessage(
          { type: 'CAPTURE_SCREENSHOT' }
        ) as CaptureScreenshotResponse

        if (res?.dataUrl) {
          const dpr = window.devicePixelRatio || 1
          const img = new Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width  = w
            canvas.height = h
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(img, x * dpr, y * dpr, w * dpr, h * dpr, 0, 0, w, h)
            downloadImage(canvas.toDataURL('image/png'), `orbit-screenshot-${Date.now()}.png`)
          }
          img.src = res.dataUrl
        }
      } catch (err) {
        console.error('[Orbit] Screenshot failed:', err)
      }

      cleanup()
      onDone()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cleanup(); onDone() }
    }

    overlay.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('keydown', onKeyDown, true)

    // ── 정리 ─────────────────────────────────────────────
    function cleanup() {
      overlay.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown, true)
      if (document.body.contains(overlay)) document.body.removeChild(overlay)
    }

    return cleanup
  // onDone은 안정된 참조만 사용 (PetOverlay에서 useCallback으로 생성됨)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
