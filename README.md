# MobX DevTools

Redux DevTools처럼 MobX 상태를 추적하고 디버깅할 수 있는 Chrome 확장 프로그램입니다.

## 기능

- 🔍 **상태 추적**: MobX observable 상태를 실시간으로 모니터링
- 📝 **액션 로그**: MobX 액션 실행 내역 추적
- 🔄 **Observable 변경 추적**: Observable 값 변경사항 실시간 감지
- 💾 **상태 내보내기**: 현재 상태를 JSON 파일로 내보내기
- 🎨 **직관적인 UI**: Redux DevTools와 유사한 사용자 인터페이스

## 설치 방법

1. 이 저장소를 클론하거나 다운로드합니다.

2. Chrome 브라우저에서 확장 프로그램 관리 페이지로 이동합니다:
   - `chrome://extensions/` 또는
   - Chrome 메뉴 > 확장 프로그램 > 확장 프로그램 관리

3. 개발자 모드를 활성화합니다 (우측 상단 토글).

4. "압축해제된 확장 프로그램을 로드합니다" 버튼을 클릭합니다.

5. 이 프로젝트의 루트 디렉토리를 선택합니다.

6. Chrome DevTools를 열고 "MobX" 탭을 확인합니다.

## 사용 방법

1. MobX를 사용하는 웹 페이지를 엽니다.
   - 테스트를 위해 `example.html` 파일을 사용할 수 있습니다.

2. Chrome DevTools를 엽니다 (F12 또는 Cmd+Option+I).

3. "MobX" 탭을 클릭합니다.

4. 세 가지 탭을 사용할 수 있습니다:
   - **State**: 현재 MobX 상태 트리 뷰
     - 상태 트리를 펼치고 접을 수 있습니다
     - "새로고침" 버튼으로 최신 상태를 가져올 수 있습니다
     - "내보내기" 버튼으로 현재 상태를 JSON 파일로 저장할 수 있습니다
   - **Actions**: 실행된 액션 로그
     - 모든 MobX 액션 실행 내역을 시간순으로 확인할 수 있습니다
     - "로그 지우기" 버튼으로 로그를 초기화할 수 있습니다
   - **Observables**: Observable 변경사항 로그
     - Observable 값의 변경사항을 실시간으로 추적합니다

## 지원하는 MobX 버전

- MobX 4.x
- MobX 5.x
- MobX 6.x

## 개발

### 초기 설정

1. **의존성 설치**:
   ```bash
   npm install
   ```
   이 명령은 MobX를 설치하고 `lib/mobx.js` 파일을 생성합니다.

2. **MobX 파일 확인**:
   `lib/mobx.js` 파일이 존재하는지 확인하세요. 이 파일은 `example.html`에서 사용됩니다.

### 파일 구조

```
mobxtool/
├── manifest.json          # Chrome 확장 프로그램 매니페스트
├── devtools.html          # DevTools 페이지 진입점
├── devtools.js            # DevTools 패널 생성 스크립트
├── panel.html             # DevTools 패널 UI
├── panel.js               # DevTools 패널 로직
├── panel.css              # DevTools 패널 스타일
├── content.js             # Content Script (페이지와 통신)
├── inject.js              # 페이지에 주입되는 MobX 추적 스크립트
├── background.js          # Background Service Worker
├── lib/                   # 로컬 라이브러리
│   └── mobx.js            # MobX 라이브러리 (로컬 파일)
├── example.html           # 테스트용 예제 페이지
└── icons/                 # 확장 프로그램 아이콘
```

### 아이콘 추가

`icons/` 디렉토리에 다음 크기의 아이콘을 추가하세요:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

또는 `generate-icons.html` 파일을 브라우저에서 열어 자동으로 아이콘을 생성할 수 있습니다.

### 테스트

`example.html` 파일을 브라우저에서 열어 MobX DevTools가 제대로 작동하는지 테스트할 수 있습니다.

## 제한사항

- 순환 참조가 있는 객체는 완전히 직렬화되지 않을 수 있습니다.
- Private 필드나 접근 제한이 있는 객체는 추적되지 않을 수 있습니다.
- 매우 큰 상태 객체는 성능에 영향을 줄 수 있습니다.

## 라이선스

MIT

