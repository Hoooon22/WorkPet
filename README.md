# Work-Pet: Orbit 🐾

Google Workspace(Gmail, Calendar)와 Monday.com을 연동하는 **AI 펫 비서** Chrome 확장 프로그램.

화면 우측 하단에 조용히 머물며 마감일 임박 알림, 일정 요약, 미완료 태스크 리마인더를 전달합니다.

---

## 주요 기능

- 마감 임박 Monday 태스크 알림
- Google Calendar 일정 브리핑
- Gmail 중요 메일 요약
- 화면을 가리지 않는 비침해적 말풍선 UI
- 집중 타이머, 번역, 단어 수 세기 등 빠른 도구 모음

---

## 설치 방법 (빌드된 파일 사용)

### 1. 릴리즈 파일 다운로드

[Releases](../../releases) 페이지에서 최신 버전의 `work-pet-orbit-v*.zip`을 다운로드합니다.

### 2. 압축 해제

다운로드한 `.zip` 파일을 원하는 위치에 압축 해제합니다.

### 3. Chrome에 확장 프로그램 설치

1. Chrome 주소창에 `chrome://extensions` 입력 후 이동
2. 우측 상단 **개발자 모드** 토글 활성화
3. **압축 해제된 확장 프로그램을 로드합니다** 버튼 클릭
4. 압축 해제된 폴더(`dist/`) 선택

> Edge 브라우저도 동일한 방법으로 설치 가능합니다.

---

## 직접 빌드하기

### 요구 사항

- Node.js 18 이상
- npm 9 이상

### 빌드 단계

```bash
# 저장소 클론
git clone https://github.com/<your-username>/WorkPet.git
cd WorkPet

# 의존성 설치
npm install

# 프로덕션 빌드
npm run build
```

빌드 완료 후 `dist/` 폴더가 생성됩니다. 위의 **3단계**를 참고해 Chrome에 로드합니다.

---

## 개발 환경 실행

```bash
npm run dev
```

HMR(Hot Module Replacement)이 활성화된 개발 서버가 실행됩니다.  
`dist/`에 실시간으로 반영되므로 Chrome 확장 프로그램을 다시 로드하면 변경 사항을 확인할 수 있습니다.

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 번들러 | Vite 5 + `@crxjs/vite-plugin` |
| UI | React 18 (TypeScript) |
| 스타일 | Tailwind CSS 3 (`wp-` prefix) |
| 애니메이션 | Framer Motion 11 |
| 타입 | `@types/chrome` |

---

## 라이선스

MIT
