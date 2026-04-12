/**
 * content/index.tsx — Content Script 진입점
 *
 * Shadow DOM을 사용해 호스트 페이지와 CSS를 완전히 격리한다.
 * - 외부 CSS → Shadow DOM 내부에 침투 불가
 * - 익스텐션 CSS → 호스트 페이지로 누출 불가
 *
 * chrome.runtime.onMessage 리스너를 React 바깥의 모듈 최상위 스코프에 등록한다.
 * React 컴포넌트와는 window CustomEvent('orbit:msg')로 통신한다.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import PetOverlay from './components/PetOverlay'
import type { ExtMessage } from '../types/messages'

export const ORBIT_MSG_EVENT = 'orbit:msg'

// ── 메시지 리스너를 모듈 최상위에 등록 ──────────────────────────────
chrome.runtime.onMessage.addListener((message: ExtMessage) => {
  window.dispatchEvent(
    new CustomEvent<ExtMessage>(ORBIT_MSG_EVENT, { detail: message })
  )
  return false
})

// ── Shadow DOM 마운트 ────────────────────────────────────────────────
const ROOT_ID = 'work-pet-orbit-root'

function mountOrbit() {
  if (document.getElementById(ROOT_ID)) return

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', mountOrbit, { once: true })
    return
  }

  // Shadow Host — 호스트 페이지에 삽입되는 빈 앵커 엘리먼트
  const host = document.createElement('div')
  host.id = ROOT_ID
  // all: initial로 호스트 페이지 inherited 스타일 차단 후 직접 포지셔닝
  host.style.cssText = [
    'all: initial',
    'position: fixed',
    'bottom: 0',
    'right: 0',
    'width: 0',
    'height: 0',
    'overflow: visible',
    'z-index: 2147483647',
    'pointer-events: none',
    'display: block',
  ].join('; ')

  // Shadow DOM 생성 — 이 경계 안팎으로 CSS가 절대 넘나들지 않음
  const shadow = host.attachShadow({ mode: 'open' })

  // Shadow 내부 최소 기반 스타일 (전역 누출 없음)
  const style = document.createElement('style')
  style.textContent = `
    *, *::before, *::after {
      box-sizing: border-box;
    }
  `
  shadow.appendChild(style)

  // React 마운트 포인트 (Shadow DOM 내부)
  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)

  document.body.appendChild(host)

  ReactDOM.createRoot(mountPoint).render(
    <React.StrictMode>
      <PetOverlay />
    </React.StrictMode>
  )
}

mountOrbit()
