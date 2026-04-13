/**
 * ColorPickerPanel.tsx
 * 색상 추출 패널
 *
 * 기능
 * 1. 스포이드 (EyeDropper API) — 화면 어디서나 색상 추출
 * 2. 페이지 스캔 — 현재 페이지 CSS에서 주요 색상 팔레트 추출
 * 3. 색상 클릭 → HEX / RGB / HSL 복사
 */

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── 타입 ─────────────────────────────────────────────────────────────

interface ColorInfo {
  hex: string   // '#rrggbb'
  r: number
  g: number
  b: number
}

// EyeDropper API 타입 선언 (Chrome 95+, 전역 타입이 없는 환경 대비)
interface EyeDropperResult { sRGBHex: string }
interface EyeDropperInstance { open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult> }
interface EyeDropperConstructor { new(): EyeDropperInstance }

// ── 색상 변환 유틸 ────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break
      case gn: h = ((bn - rn) / d + 2) / 6; break
      case bn: h = ((rn - gn) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/** CSS color string → hex (#rrggbb) | null */
function cssColorToHex(color: string): string | null {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null
  // rgb(r, g, b) 또는 rgba(r, g, b, a)
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return null
  const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3])
  // 완전 흰색·검정 제외 여부는 스캔 단계에서 처리
  return rgbToHex(r, g, b)
}

/** 두 색상이 충분히 비슷한지 판별 (유클리드 거리 기반) */
function isSimilar(a: ColorInfo, b: ColorInfo, threshold = 30): boolean {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2) < threshold
}

/** 페이지 CSS에서 주요 색상 추출 */
function extractPageColors(maxColors = 16): ColorInfo[] {
  const freq = new Map<string, number>()

  const elements = document.querySelectorAll('*')
  const sampleSize = Math.min(elements.length, 800)
  const step = Math.max(1, Math.floor(elements.length / sampleSize))

  for (let i = 0; i < elements.length; i += step) {
    const el = elements[i] as HTMLElement
    const style = window.getComputedStyle(el)
    const props = [style.color, style.backgroundColor, style.borderTopColor]
    for (const c of props) {
      const hex = cssColorToHex(c)
      if (!hex) continue
      // 거의 흰색(#f8f8f8 이상) 또는 거의 검정(#080808 이하) 제외
      const rgb = hexToRgb(hex)
      if (!rgb) continue
      const brightness = (rgb.r + rgb.g + rgb.b) / 3
      if (brightness > 245 || brightness < 15) continue
      freq.set(hex, (freq.get(hex) ?? 0) + 1)
    }
  }

  // 빈도순 정렬
  const sorted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => {
      const rgb = hexToRgb(hex)!
      return { hex, ...rgb }
    })

  // 비슷한 색상 병합 (첫 번째 색상 대표)
  const result: ColorInfo[] = []
  for (const color of sorted) {
    if (result.length >= maxColors) break
    if (!result.some((c) => isSimilar(c, color))) {
      result.push(color)
    }
  }
  return result
}

// ── 서브컴포넌트: 색상 상세 팝오버 ──────────────────────────────────

interface ColorDetailProps {
  color: ColorInfo
  onClose: () => void
}

function ColorDetail({ color, onClose }: ColorDetailProps) {
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b)
  const [copied, setCopied] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(null), 1500)
  }, [])

  const formats = [
    { key: 'hex',  label: 'HEX',  value: color.hex.toUpperCase() },
    { key: 'rgb',  label: 'RGB',  value: `rgb(${color.r}, ${color.g}, ${color.b})` },
    { key: 'hsl',  label: 'HSL',  value: `hsl(${h}, ${s}%, ${l}%)` },
  ]

  // 텍스트 대비 색상
  const { l: lum } = rgbToHsl(color.r, color.g, color.b)
  const textColor = lum < 50 ? '#ffffff' : '#1f2937'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 4 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '0',
        right: '0',
        zIndex: 10,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
        overflow: 'hidden',
      }}
    >
      {/* 색상 프리뷰 바 */}
      <div style={{
        height: '44px',
        background: color.hex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
      }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: textColor, fontFamily: 'monospace' }}>
          {color.hex.toUpperCase()}
        </span>
        <motion.button
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontSize: '12px',
            color: textColor,
            opacity: 0.7,
            lineHeight: 1,
          }}
        >
          ✕
        </motion.button>
      </div>

      {/* 포맷 목록 */}
      <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {formats.map(({ key, label, value }) => (
          <motion.button
            key={key}
            whileHover={{ scale: 1.01, x: 1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => copy(value, key)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: copied === key ? '#f0fdf4' : '#f9fafb',
              border: `1px solid ${copied === key ? '#86efac' : '#e5e7eb'}`,
              borderRadius: '6px',
              padding: '5px 8px',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#9ca3af', fontFamily: 'sans-serif', width: '28px', flexShrink: 0 }}>
              {label}
            </span>
            <span style={{ fontSize: '11px', color: '#1f2937', fontFamily: 'monospace', flex: 1, textAlign: 'left' }}>
              {value}
            </span>
            <span style={{ fontSize: '11px', flexShrink: 0 }}>
              {copied === key ? '✓' : '📋'}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

// ── 서브컴포넌트: 색상 스와치 ─────────────────────────────────────────

interface SwatchProps {
  color: ColorInfo
  size?: number
  isCopied?: boolean
  onClick: () => void
}

function Swatch({ color, size = 28, isCopied = false, onClick }: SwatchProps) {
  const { l: lum } = rgbToHsl(color.r, color.g, color.b)
  const checkColor = lum < 50 ? '#ffffff' : '#1f2937'

  return (
    <motion.button
      whileHover={{ scale: 1.15, y: -2 }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      title={`클릭해서 복사 — ${color.hex.toUpperCase()}`}
      style={{
        all: 'unset',
        cursor: 'pointer',
        width: size,
        height: size,
        borderRadius: '6px',
        background: color.hex,
        border: isCopied
          ? '2px solid #16a34a'
          : '2px solid rgba(0,0,0,0.12)',
        boxShadow: isCopied
          ? `0 0 0 2px #fff, 0 0 0 4px #16a34a`
          : '0 1px 3px rgba(0,0,0,0.15)',
        flexShrink: 0,
        transition: 'box-shadow 0.15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '13px',
        color: checkColor,
      }}
    >
      <AnimatePresence>
        {isCopied && (
          <motion.span
            key="check"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            ✓
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────

export default function ColorPickerPanel() {
  const [pickedColors, setPickedColors]   = useState<ColorInfo[]>([])
  const [pageColors, setPageColors]       = useState<ColorInfo[]>([])
  const [selectedColor, setSelectedColor] = useState<ColorInfo | null>(null)
  const [copiedHex, setCopiedHex]         = useState<string | null>(null)
  const [scanning, setScanning]           = useState(false)
  const [picking, setPicking]             = useState(false)
  const [scanDone, setScanDone]           = useState(false)
  const containerRef  = useRef<HTMLDivElement>(null)
  const copyTimerRef  = useRef<ReturnType<typeof setTimeout>>()

  const eyeDropperSupported = 'EyeDropper' in window

  // ── 스포이드 ────────────────────────────────────────────────────────
  const handleEyeDropper = useCallback(async () => {
    if (!eyeDropperSupported || picking) return
    setPicking(true)
    setSelectedColor(null)
    try {
      const EyeDropperCtor = (window as unknown as { EyeDropper: EyeDropperConstructor }).EyeDropper
      const dropper = new EyeDropperCtor()
      const result  = await dropper.open()
      const hex     = result.sRGBHex.toLowerCase()
      const rgb     = hexToRgb(hex)
      if (!rgb) return
      const colorInfo: ColorInfo = { hex, ...rgb }
      setPickedColors((prev) => {
        // 중복 제거 후 앞에 추가, 최대 12개
        const deduped = prev.filter((c) => c.hex !== hex)
        return [colorInfo, ...deduped].slice(0, 12)
      })
      setSelectedColor(colorInfo)
    } catch {
      // 사용자가 취소한 경우 — 무시
    } finally {
      setPicking(false)
    }
  }, [eyeDropperSupported, picking])

  // ── 페이지 스캔 ─────────────────────────────────────────────────────
  const handleScan = useCallback(() => {
    if (scanning) return
    setScanning(true)
    setSelectedColor(null)
    // requestAnimationFrame으로 렌더 후 실행 (UI 블로킹 방지)
    requestAnimationFrame(() => {
      setTimeout(() => {
        const colors = extractPageColors(16)
        setPageColors(colors)
        setScanDone(true)
        setScanning(false)
      }, 20)
    })
  }, [scanning])

  // ── 색상 클릭 → HEX 복사 ────────────────────────────────────────────
  const handleSwatchClick = useCallback((color: ColorInfo) => {
    navigator.clipboard.writeText(color.hex.toUpperCase()).catch(() => {})
    setCopiedHex(color.hex)
    clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopiedHex(null), 1500)
    // 상세 팝오버는 다른 색상 선택 시 갱신
    setSelectedColor((prev) => (prev?.hex === color.hex ? null : color))
  }, [])

  const hasPickedColors = pickedColors.length > 0
  const hasPageColors   = pageColors.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      style={{ overflow: 'hidden' }}
    >
      <div
        ref={containerRef}
        style={{
          background: '#fdf4ff',
          border: '1px solid #e9d5ff',
          borderRadius: '10px',
          padding: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          position: 'relative',
        }}
      >
        {/* ── 액션 버튼 ── */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {/* 스포이드 */}
          <motion.button
            whileHover={{ scale: eyeDropperSupported ? 1.03 : 1 }}
            whileTap={{ scale: eyeDropperSupported ? 0.96 : 1 }}
            onClick={handleEyeDropper}
            disabled={!eyeDropperSupported || picking}
            title={eyeDropperSupported ? '화면에서 색상 추출' : '이 브라우저는 EyeDropper를 지원하지 않아요'}
            style={{
              all: 'unset',
              flex: 1,
              cursor: eyeDropperSupported && !picking ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '8px 6px',
              borderRadius: '8px',
              background: picking ? '#ede9fe' : (eyeDropperSupported ? '#7c3aed' : '#e5e7eb'),
              border: `1px solid ${picking ? '#a78bfa' : (eyeDropperSupported ? '#6d28d9' : '#d1d5db')}`,
              boxShadow: picking ? 'none' : (eyeDropperSupported ? '0 1px 3px rgba(109,40,217,0.3)' : 'none'),
            }}
          >
            <span style={{ fontSize: '15px', lineHeight: 1 }}>
              {picking ? '⌛' : '💉'}
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'sans-serif',
              color: eyeDropperSupported ? (picking ? '#7c3aed' : '#fff') : '#9ca3af',
              whiteSpace: 'nowrap',
            }}>
              {picking ? '추출 중…' : '스포이드'}
            </span>
          </motion.button>

          {/* 페이지 스캔 */}
          <motion.button
            whileHover={{ scale: scanning ? 1 : 1.03 }}
            whileTap={{ scale: scanning ? 1 : 0.96 }}
            onClick={handleScan}
            disabled={scanning}
            style={{
              all: 'unset',
              flex: 1,
              cursor: scanning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '8px 6px',
              borderRadius: '8px',
              background: scanning ? '#fdf4ff' : '#fff',
              border: '1px solid #e9d5ff',
            }}
          >
            <span style={{ fontSize: '15px', lineHeight: 1 }}>
              {scanning ? '⌛' : '🔍'}
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'sans-serif',
              color: scanning ? '#a78bfa' : '#7c3aed',
              whiteSpace: 'nowrap',
            }}>
              {scanning ? '스캔 중…' : '페이지 스캔'}
            </span>
          </motion.button>
        </div>

        {/* EyeDropper 미지원 안내 */}
        {!eyeDropperSupported && (
          <p style={{
            margin: 0,
            fontSize: '10px',
            color: '#9ca3af',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            lineHeight: 1.4,
          }}>
            스포이드는 Chrome 95+ 에서 지원돼요
          </p>
        )}

        {/* ── 스포이드로 추출한 색상 ── */}
        <AnimatePresence>
          {hasPickedColors && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <p style={{
                margin: '0 0 6px',
                fontSize: '10px',
                fontWeight: 700,
                color: '#7c3aed',
                fontFamily: 'sans-serif',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                추출한 색상
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', position: 'relative' }}>
                {pickedColors.map((color) => (
                  <div key={color.hex} style={{ position: 'relative' }}>
                    <Swatch
                      color={color}
                      isCopied={copiedHex === color.hex}
                      onClick={() => handleSwatchClick(color)}
                    />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 페이지 팔레트 ── */}
        <AnimatePresence>
          {hasPageColors && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <p style={{
                  margin: 0,
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#7c3aed',
                  fontFamily: 'sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  페이지 팔레트
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleScan}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    fontSize: '9px',
                    fontWeight: 600,
                    fontFamily: 'sans-serif',
                    color: '#a78bfa',
                    padding: '2px 6px',
                    background: '#f5f3ff',
                    borderRadius: '4px',
                    border: '1px solid #ddd6fe',
                  }}
                >
                  새로고침
                </motion.button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {pageColors.map((color) => (
                  <Swatch
                    key={color.hex}
                    color={color}
                    isCopied={copiedHex === color.hex}
                    onClick={() => handleSwatchClick(color)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 빈 상태 힌트 ── */}
        {!hasPickedColors && !hasPageColors && !scanning && (
          <p style={{
            margin: 0,
            fontSize: '11px',
            color: '#9ca3af',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            lineHeight: 1.6,
            padding: '4px 0',
          }}>
            스포이드로 화면에서 직접 추출하거나
            <br />페이지 스캔으로 팔레트를 추출해요
          </p>
        )}

        {/* ── 색상 상세 팝오버 ── */}
        <AnimatePresence>
          {selectedColor && (
            <ColorDetail
              color={selectedColor}
              onClose={() => setSelectedColor(null)}
            />
          )}
        </AnimatePresence>

        {/* 스캔 완료 뱃지 */}
        <AnimatePresence>
          {scanDone && hasPageColors && !scanning && (
            <motion.p
              key="scan-done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                margin: 0,
                fontSize: '10px',
                color: '#a78bfa',
                fontFamily: 'sans-serif',
                textAlign: 'center',
              }}
            >
              {pageColors.length}가지 색상을 찾았어요
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
