# Work-Pet: Orbit 🐾

> 화면 한구석에 조용히 머무는 데스크톱 펫 비서 — Gmail · Google Calendar 알림과 일상 도구를 한 마리에 담았습니다.

Tauri 2 기반의 가벼운 네이티브 앱으로, 화면 위를 자유롭게 걸어 다니는 작은 펫 캐릭터가 새 메일·일정·임박한 마감을 알려주고 번역·요약·캡처 같은 자주 쓰는 도구를 한 번의 클릭으로 제공합니다.

---

## 핵심 철학 — 방해하지 않는다

펫 창은 투명·테두리 없음·작업표시줄 비표시로 만들어져 작업 흐름을 가리지 않습니다. macOS에서는 모든 데스크톱(Space)에 항상 떠 있어 가상 데스크톱을 전환해도 따라옵니다. 알림이 들어오면 펫이 살짝 반응하고, 클릭해야 비로소 패널이 열립니다.

---

## 주요 기능

### 🔔 알림 & 브리핑
- **자동 폴링**: 60초마다 Gmail 신규 메일(History API 기반 델타 감지)과 Google Calendar 신규/임박 일정을 확인합니다.
- **시스템 알림**: OS 네이티브 알림으로 새 메일·일정 도착을 알리고, 펫이 alert 상태로 전환됩니다.
- **알람 패널**: 펫을 클릭해 알람 탭에서 항목을 하나씩 처리하면 카운트가 줄어들고, 모두 비우면 자동으로 idle 상태로 돌아갑니다.
- **수동 브리핑**: 브리핑 탭에서 오늘 일정을 한눈에 조회하거나 트레이의 "브리핑 새로고침"으로 강제 갱신합니다.

### 🐾 펫 캐릭터
- **9종 Lottie 애니메이션**: 고양이 · 토끼 · 고슴도치 · 너구리 · 유니콘 · 강아지 · 판다 · 사자 · 드래곤
- **자유 배회**: idle 상태에서 화면 하단을 좌우로 걸어 다니고, 종료 후에도 마지막 위치를 복원합니다.
- **드래그 이동**: 펫을 직접 드래그해 원하는 위치로 옮길 수 있습니다.
- **3단계 크기**: 트레이 메뉴에서 작게/보통/크게 변경.
- **감정 표현**: 졸음(2분 idle 경과), 아침 인사(오전 6~11시 첫 등장), 점프·하트·인사·춤·기지개·빼꼼 등 원샷 애니메이션.
- **가챠 시스템**: 4등급(COMMON · RARE · EPIC · LEGENDARY) 펫 뽑기 연출.

### 🛠️ 내장 도구 (도구 탭)
| 도구 | 설명 |
|------|------|
| ⏱️ 집중 타이머 | 포모도로식 타이머 — 패널을 닫아도 계속 동작 |
| 🌐 번역 | Gemini로 텍스트 번역 |
| 📝 요약 | 긴 텍스트를 Gemini로 요약 |
| 🤔 질문 | Gemini에 자유롭게 질문 |
| 📋 빠른 메모 | 앱을 종료해도 유지되는 메모 |
| 📎 클립보드 | 최근 복사한 텍스트 20개를 자동 보관, 클릭하면 다시 복사 |
| 🎨 색상 추출 | 화면 픽셀 색상을 네이티브 캡처로 정확히 스포이드 |
| 🔢 글자수 | 선택 텍스트 글자·단어 수 카운트 |
| 📸 영역 캡처 | 마우스 드래그로 화면 영역을 PNG로 캡처 |

### 🎛️ 트레이 메뉴
앱은 메뉴바/시스템 트레이에 상주하며, 다음 메뉴를 제공합니다.
- 펫 종류 / 펫 크기 변경
- Google 로그인 · 로그아웃
- 패널 · 가챠 열기, 브리핑 새로고침
- 걷기 일시정지, 펫 소환·퇴장
- 기본 위치 / 우하단으로 이동
- 종료

---

## 설치 & 실행

### 요구 사항
- **Node.js** 18 이상, **npm** 9 이상
- **Rust** 1.77.2 이상 (Tauri 2 빌드용)
- 플랫폼별 시스템 의존성: [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) 참고

### 처음 셋업

```bash
git clone https://github.com/Hoooon22/WorkPet.git
cd WorkPet
npm install
```

### 개발 모드

```bash
npm run tauri:dev
```

### 배포 빌드

```bash
npm run tauri:build
```

빌드 산출물은 `src-tauri/target/release/bundle/` 아래에 플랫폼별로 생성됩니다 (macOS는 `.dmg`/`.app`, Windows는 `.msi`/`.exe`, Linux는 `.deb`/`.AppImage`).

---

## 환경 설정

다음 두 가지를 설정해야 모든 기능이 동작합니다.

### 1) Google OAuth (Gmail · Calendar)

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID** → **Desktop app**
2. Gmail API와 Google Calendar API를 활성화하고, OAuth 동의 화면에 다음 스코프를 추가합니다.
   - `gmail.readonly`, `gmail.metadata`
   - `calendar.readonly`
   - `openid`, `email`, `profile`
3. 발급된 Client ID / Secret을 프로젝트 루트의 `.env.local`에 저장합니다.

```bash
# .env.local
VITE_GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
VITE_GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-xxxxx
```

> Google 가이드에 따라 데스크톱 앱의 client_secret은 실제로는 비밀이 아니며, 보안은 PKCE로 보장됩니다. 인증 흐름은 `127.0.0.1` 루프백 + PKCE를 사용해 Rust 측(`src-tauri/src/lib.rs`)에서 처리합니다.

### 2) Gemini API 키 (번역·요약·질문 도구)

1. [Google AI Studio](https://aistudio.google.com/app/apikey)에서 API 키 발급
2. 앱을 실행한 뒤 **펫 클릭 → ⚙️ 설정 탭 → Gemini AI 설정**에 키를 붙여넣고 저장
3. 키는 OS의 안전한 위치(`tauri-plugin-store`의 `settings.json`)에 저장됩니다.

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 셸 / 시스템 통합 | Tauri 2 (Rust), tray-icon, tauri-plugin-store / -shell / -notification / -clipboard-manager |
| 프런트엔드 | React 18 + TypeScript |
| 번들러 | Vite 5 |
| 애니메이션 | Framer Motion 11, Lottie (`lottie-react`) |
| 화면 캡처 | `screenshots` crate + `image` (PNG 인코딩) |
| AI | Google Gemini API |
| OAuth | Google OAuth 2.0 (Loopback + PKCE, Rust `tiny_http` + `ureq`) |

---

## 프로젝트 구조

```
WorkPet/
├── src/
│   ├── desktop/
│   │   ├── App.tsx              # 펫 창 — 배회 / 상태 머신 / 이벤트 허브
│   │   ├── components/          # LottiePet, 말풍선, 액션 정의
│   │   ├── panel/               # 패널 창 (alerts / briefing / tools / settings)
│   │   ├── gacha/               # 가챠 창
│   │   └── screenshot/          # 영역 캡처 / 색상 추출 오버레이
│   ├── shared/
│   │   ├── auth.ts              # OAuth 로그인 상태
│   │   ├── briefing.ts          # Gmail / Calendar 폴링 로직
│   │   ├── scheduler.ts         # 60초 주기 백그라운드 틱
│   │   ├── storage.ts           # tauri-plugin-store 래퍼
│   │   └── api/                 # gmail, googleCalendar, gemini, fetchWithAuth
│   └── assets/lottie/           # idle / walking / alert + pets/*.json
├── src-tauri/
│   ├── src/lib.rs               # Tauri 명령(OAuth, 창 관리, 캡처, 트레이)
│   ├── tauri.conf.json
│   └── icons/                   # 플랫폼별 아이콘 + 트레이 아이콘
├── index.html / panel.html / gacha.html / screenshot.html  # Vite 다중 엔트리
├── vite.config.ts
└── package.json
```

각 창(`pet`, `panel`, `gacha`, `screenshot`, `color-picker`)은 독립된 Vite 엔트리이며, 상태는 `tauri-plugin-store`와 Tauri 이벤트 버스(`orbit:*` 토픽)로 동기화됩니다.

---

## 라이선스

MIT
