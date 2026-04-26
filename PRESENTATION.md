# Work-Pet: Orbit — 프로젝트 발표 자료

> "화면을 방해하지 않는 AI 펫 비서" — Chrome Extension

---

## 1. 프로젝트 개요

**Work-Pet: Orbit**은 Google Workspace(Gmail, Google Calendar)와 연동되는  
**비침해적(Non-Intrusive) AI 펫 비서 Chrome Extension**이다.

사용자의 작업 흐름을 전혀 방해하지 않으면서, 화면 하단 우측 구석에 귀여운 펫 캐릭터가 등장해  
마감 임박 일정, 새 메일, 미완료 태스크 등을 **조용하고 친근하게** 알려준다.

### 핵심 가치 한 줄 요약
> **"알아서 챙겨주는 조용한 비서"** — 클릭 한 번 없이도 중요한 것은 놓치지 않는다.

---

## 2. 핵심 철학 — 비침해적 UX (Non-Intrusive UX)

| 원칙 | 설명 |
|------|------|
| 위치 고정 | 펫은 항상 화면 **우측 하단**에만 존재 |
| 이벤트 차단 없음 | 오버레이 전체에 `pointer-events: none` 적용 → 호스트 페이지 클릭/스크롤 완전 보호 |
| 화면 점유 금지 | 모달·풀스크린·중앙 토스트 팝업 절대 사용하지 않음 |
| 말풍선 방향 | 펫 위쪽으로만 펼쳐지며, 화면 경계를 자동 감지해 잘리지 않도록 좌우 전환 |
| 퇴장 기능 | "들어가" 버튼으로 펫이 화면 아래로 슬라이드 퇴장, 완전히 숨음 |

---

## 3. 기술 스택

### 프론트엔드
| 기술 | 버전 | 역할 |
|------|------|------|
| **React** | 18.3 | UI 컴포넌트, 상태 관리 |
| **TypeScript** | 5.5 | 타입 안전성 (any 사용 금지) |
| **Framer Motion** | 11 | 물리 기반 스프링 애니메이션, 페이드/슬라이드 전환 |
| **Lottie React** | 2.4 | 펫 캐릭터 벡터 애니메이션 (JSON 기반) |
| **Tailwind CSS** | 3.4 | 스타일링 (`wp-` prefix로 호스트 CSS 충돌 방지) |

### 빌드 & 확장 프로그램
| 기술 | 역할 |
|------|------|
| **Vite 5** | 번들러 |
| **@crxjs/vite-plugin** | Chrome Extension MV3 HMR 지원, 진입점 자동 관리 |
| **Chrome Extension Manifest V3** | Service Worker 기반 백그라운드 처리 |

### 외부 API
| API | 역할 |
|-----|------|
| **Google Calendar API** | 오늘 일정 조회, 새 일정 변경 감지 (Watch API) |
| **Gmail API** | 읽지 않은 메일 조회, History API로 실시간 새 메일 감지 |
| **Google Identity API** | OAuth2 인증 토큰 관리 |
| **Firebase Cloud Messaging (FCM)** | 서버 Push → 브라우저 실시간 알림 |
| **Gemini API** (google-ai-studio) | 번역, 페이지 요약, AI 질문 기능 |

---

## 4. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                        │
│                                                             │
│  ┌──────────────────┐     메시지 전송     ┌──────────────┐  │
│  │  background.ts   │ ──────────────────► │ content/     │  │
│  │  (Service Worker)│                     │ index.tsx    │  │
│  │                  │ ◄────────────────── │              │  │
│  │ • Chrome Alarms  │   chrome.runtime    │ • PetOverlay │  │
│  │ • Google APIs    │   .onMessage        │ • 말풍선 UI  │  │
│  │ • FCM Push       │                     │ • 도구 패널  │  │
│  │ • Gemini AI      │                     └──────────────┘  │
│  └──────────────────┘                                       │
│                                                             │
│  ┌──────────────────┐                                       │
│  │  popup/App.tsx   │  Google 로그인, Gemini API 키 설정   │
│  └──────────────────┘                                       │
│                                                             │
│  공유 상태: chrome.storage.local (탭 간 동기화)              │
└─────────────────────────────────────────────────────────────┘
         ▲                        ▲
         │                        │
   Google APIs              FCM Server
  (Calendar, Gmail)        (실시간 Push)
```

### 탭 간 상태 동기화
- `chrome.storage.local`로 브리핑 데이터, 펫 상태, 위치, 로그인 여부 저장
- `chrome.storage.onChanged` 리스너로 다른 탭에서 로그인/로그아웃/브리핑 발생 시 **즉시 반영**

---

## 5. 주요 기능

### 5-1. 실시간 알림 시스템 (자동 브리핑)

**Chrome Alarms API + Google APIs 조합**으로 1분마다 자동 체크.

| 알림 종류 | 타이밍 |
|----------|--------|
| 일정 10분 전 | 8~12분 전 윈도우 |
| 일정 5분 전 | 3~7분 전 윈도우 |
| 일정 1분 전 | 0~2분 전 윈도우 |
| 일정 정시 | 시작 ±90초 이내 |
| 새 메일 | FCM Push → History API로 즉시 처리 |
| 새 일정 추가 | Google Calendar Watch API → 즉시 알림 |

- 알림은 **중복 방지** (이미 알린 이벤트/메일은 `storage`로 추적)
- Chrome 네이티브 알림(`chrome.notifications`) + 펫 말풍선 **동시** 표시

---

### 5-2. 브리핑 대시보드 (3탭 UI)

펫 클릭 시 400px 너비의 카드형 대시보드가 펫 위로 슬라이드업.

#### 🔔 알람 탭
- Push 알람으로 수신된 실시간 알림 표시
- Monday.com 태스크 (마감 임박, 긴급 표시)
- Google Calendar 일정 알람 (읽음 처리 버튼)
- Gmail 새 메일 알람 (읽음 처리 버튼)

#### 📊 브리핑 탭
- "오늘 브리핑 받기" 버튼으로 수동 전체 조회
- 오늘 남은 전체 일정 (진행 중 이벤트 실시간 강조)
- 읽지 않은 메일 목록
- Google Calendar / Gmail 링크 클릭 시 해당 페이지로 직접 이동

#### 🛠️ 도구 탭
> 브라우저 경험을 향상시키는 미니 도구 모음

| 도구 | 설명 |
|------|------|
| 🌐 번역 | 텍스트 번역 (Gemini AI) |
| 📝 페이지 요약 | 현재 페이지 전체 AI 요약 (Gemini AI) |
| ✨ Gemini 질문 | AI에게 자유로운 질문 |
| 🔍 빠른 검색 | 구글 새 탭 검색 |
| 📸 스크린샷 | 전체 화면 / 영역 선택 드래그 캡처 |
| ⏱️ 집중 타이머 | 5분·10분·30분·1시간 타이머 (말풍선 카운트다운 표시) |
| 📌 빠른 메모 | 브라우저 닫아도 저장되는 메모 |
| 🎨 색상 추출 | 스포이드 + 페이지 색상 팔레트 |
| 📊 글자 수 세기 | 한국어·영어 글자/단어 수 카운트 |

---

### 5-3. 펫 캐릭터 시스템 (Gacha / 가챠)

**Monday Gacha** — 주 1회 펫을 뽑는 가챠 시스템

| 등급 | 색상 | 특징 |
|------|------|------|
| COMMON | 주황/회색 | 기본 연출 |
| RARE | 파랑 | 단계적 빌드업 연출 |
| EPIC | 보라 | 더 화려한 빌드업 |
| LEGENDARY | 황금 | 최고 등급 풀 연출 |

**가챠 연출 Phase 흐름**:
```
intro → selecting → [buildup] → cracking → revealed → summoning
```
- RARE 이상에서 점층적 빛+파티클 연출 (등급별 색상, 진동 강도 상이)
- 뽑은 펫은 `chrome.storage.local`에 저장, **영구 유지**

**지원 펫 종류**: 고양이, 토끼, 고슴도치, 너구리, 유니콘 (Lottie 애니메이션)

---

### 5-4. 펫 행동 시스템

| 상태 | 설명 |
|------|------|
| idle | 기본 대기 상태 |
| alert | 새 알림 수신 — 빨간 테두리, 튀어오르는 애니메이션 |
| dismissed | 화면 아래로 퇴장 |
| 졸음 (sleepy) | idle 2분 경과 시 ZZZ 파티클 표시 |
| 아침 인사 | 오전 6~11시 첫 등장 시 흔들림 |
| 돌아다니기 | 화면 하단을 좌우로 자유롭게 이동 (토글 가능) |

**위치 기억**: 펫의 x 좌표를 `storage`에 저장 → 탭 전환 후에도 마지막 위치 유지

---

### 5-5. Google OAuth2 인증

- Chrome Extension `identity API`로 팝업 없이 Google 계정 연동
- 로그인 시 FCM 토큰 등록 + Gmail Watch + Calendar Watch 자동 설정
- 로그아웃 시 모든 탭에서 펫 즉시 퇴장 (스토리지 동기화)
- 인증 토큰 캐시 관리 (만료 시 자동 갱신)

---

## 6. 폴더 구조

```
src/
├── background/
│   ├── background.ts          # Service Worker 핵심 로직
│   ├── config.ts              # 설정값 (Watch 갱신 주기 등)
│   ├── fcm.ts                 # Firebase Cloud Messaging 토큰 등록
│   ├── watchSetup.ts          # Gmail / Calendar Watch API 설정
│   └── api/
│       ├── auth.ts            # Google OAuth2 토큰 관리
│       ├── gmail.ts           # Gmail API (읽지 않은 메일, History API)
│       ├── googleCalendar.ts  # Calendar API (오늘 일정, 변경 감지)
│       ├── gemini.ts          # Gemini AI API (번역, 요약, 질문)
│       └── fcm.ts             # FCM 서버 통신
│
├── content/
│   ├── index.tsx              # Content Script 진입점 (Shadow DOM 마운트)
│   ├── content.css            # Tailwind 주입 CSS
│   └── components/
│       ├── PetOverlay.tsx         # 최상위 컨테이너 + 상태 머신
│       ├── OrbitCharacter.tsx     # 펫 캐릭터 (Lottie + Framer Motion)
│       ├── WanderingPetContainer.tsx  # 펫 돌아다니기 물리 엔진
│       ├── PetSpeechBubble.tsx    # 미니 말풍선 (5초 자동 소멸)
│       ├── MorningBriefingDashboard.tsx  # 3탭 브리핑 대시보드
│       ├── BrowserToolsPanel.tsx  # 도구 탭 (그리드 + 서브패널)
│       ├── MondayGacha.tsx        # 펫 가챠 전체화면 모달
│       ├── ScreenshotSelector.tsx # 영역 선택 드래그 UI
│       ├── FocusTimerPanel.tsx    # 집중 타이머
│       ├── QuickMemoPanel.tsx     # 빠른 메모
│       ├── TranslatePanel.tsx     # 번역
│       ├── SummarizePanel.tsx     # 페이지 요약
│       ├── GeminiAskPanel.tsx     # Gemini 질문
│       ├── WordCountPanel.tsx     # 글자 수 세기
│       └── ColorPickerPanel.tsx   # 색상 추출
│
├── popup/
│   ├── App.tsx                # 팝업 UI (로그인, Gemini 키 설정)
│   └── index.html
│
├── types/
│   └── messages.ts            # Chrome 메시지 유니온 타입 (any 금지)
│
└── assets/lottie/
    ├── idle.json / alert.json / walking.json
    └── pets/  (rabbit, hedgehog, raccoon, unicorn, beaver)
```

---

## 7. 메시지 타입 시스템

`background ↔ content script` 통신은 모두 **유니온 타입**으로 강타입 관리:

```typescript
type ExtMessage =
  | { type: 'BRIEFING_ALERT'; payload: BriefingPayload }
  | { type: 'DISMISS_PET' }
  | { type: 'SHOW_PET' }
  | { type: 'SHOW_GACHA' }
  | { type: 'FETCH_FULL_BRIEFING' }
  | { type: 'TRANSLATE_TEXT'; text: string; sourceLang: string; targetLang: string }
  | { type: 'SUMMARIZE_PAGE'; pageText: string }
  | { type: 'ASK_GEMINI'; question: string }
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'LOGIN_GREETING' }
  | { type: 'LOGOUT_FAREWELL' }
  // ... 등
```

---

## 8. 개발 포인트 / 기술적 챌린지

### 1. Content Script 충돌 방지
- Tailwind에 `wp-` prefix를 적용해 호스트 페이지 CSS와 충돌 원천 차단
- 전체 오버레이에 `pointer-events: none` → 호스트 페이지 인터랙션 100% 보호

### 2. 탭 간 상태 동기화
- `chrome.storage.onChanged`로 다른 탭의 로그인/로그아웃/브리핑 이벤트를 실시간 수신
- 새 탭 열릴 때 `storage`에서 자동으로 마지막 브리핑 + 펫 상태 복원

### 3. 알림 중복 방지
- 이메일 ID, 이벤트 알림 플래그(`tenMin`, `fiveMin`, `oneMin`, `onTime`)를 storage에 기록
- 일정 시간 변경 감지: `startTime`이 바뀌면 해당 이벤트 알림 플래그 자동 리셋

### 4. FCM Push 연동
- 앱 서버에서 FCM 토큰 등록 → Gmail/Calendar Watch 설정
- 브라우저 비활성 상태에서도 새 메일·일정 변경 즉시 감지
- Watch 유효기간 만료 전 자동 갱신 (6일 주기)

### 5. 가챠 연출 (UX)
- 등급별 파티클 색상·빛 강도·진동 패턴 차별화
- Framer Motion `AnimatePresence`로 Phase 전환 간 부드러운 애니메이션 처리

### 6. MV3 Service Worker 제약 대응
- Service Worker는 항상 실행 중이 아니므로 `chrome.alarms`로 주기 작업 등록
- 브라우저 재시작 시 기존 briefing을 모든 탭에 즉시 브로드캐스트

---

## 9. 빌드 & 설치 방법

```bash
# 의존성 설치
npm install

# 빌드 (TypeScript 컴파일 + Vite 번들)
npm run build

# Chrome 설치
# 1. chrome://extensions 접속
# 2. 개발자 모드 ON
# 3. "압축 해제된 확장 프로그램 로드" → dist/ 폴더 선택
```

---

## 10. 향후 계획

- [ ] Monday.com GraphQL API 연동 (태스크 관리)
- [ ] Chrome `sidePanel` API — 풀 브리핑 사이드 패널
- [ ] 비밀번호 생성기, URL 단축, JSON 포맷터 (도구 탭 추가 예정)
- [ ] 펫 상호작용 확장 (드래그, 먹이 주기 등)
- [ ] 다국어 지원

---

*Work-Pet: Orbit v0.1.3*
