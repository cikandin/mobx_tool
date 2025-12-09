# MobX DevTools 배포 가이드

## 로컬 사용 (개발 모드)

### 현재 상태
✅ Chrome 확장 프로그램이 정상 작동 중입니다.

### 계속 사용하기
1. 확장 프로그램은 `chrome://extensions/`에서 "개발자 모드"로 로드됨
2. 코드 수정 시 확장 프로그램 페이지에서 **새로고침(🔄)** 클릭
3. 페이지도 새로고침해야 변경사항 적용

## Chrome Web Store 배포

### 1. 아이콘 생성
```bash
open generate-icons.html
# 또는
open http://localhost:8000/generate-icons.html
```
- "아이콘 생성 및 다운로드" 버튼 클릭
- 다운로드된 `icon16.png`, `icon48.png`, `icon128.png`를 `icons/` 폴더에 저장

### 2. 확장 프로그램 패키징
```bash
# 프로젝트 루트에서
cd /Users/siyoung/repositories/mobxtool

# 불필요한 파일 제거
rm -rf node_modules
rm -f package.json package-lock.json
rm -f test-simple.html generate-icons.html
rm -f DEPLOYMENT.md

# ZIP 파일 생성
zip -r mobx-devtools.zip . -x "*.git*" -x "node_modules/*" -x "*.DS_Store"
```

### 3. Chrome Web Store 등록
1. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/) 접속
2. 개발자 등록비 $5 일회 결제 (필요시)
3. "New Item" 클릭
4. `mobx-devtools.zip` 업로드
5. 스토어 리스팅 정보 작성:
   - **이름**: MobX DevTools
   - **설명**: Redux DevTools처럼 MobX 상태를 추적하고 디버깅
   - **카테고리**: Developer Tools
   - **스크린샷**: DevTools 사용 화면 캡처 (최소 1개)
   - **아이콘**: icons/ 폴더의 아이콘들
6. "Submit for Review" 클릭

### 4. 심사 기간
- 보통 1-3일 소요
- 승인 후 Chrome Web Store에 공개

## GitHub에 공개

### 1. 저장소 준비
```bash
cd /Users/siyoung/repositories/mobxtool

# Git 초기화 (아직 안했다면)
git init
git add .
git commit -m "Initial commit: MobX DevTools Chrome Extension"
```

### 2. GitHub 저장소 생성
1. [GitHub](https://github.com/new) 에서 새 저장소 생성
2. 저장소 이름: `mobx-devtools`
3. Public으로 설정

### 3. Push
```bash
git remote add origin https://github.com/YOUR_USERNAME/mobx-devtools.git
git branch -M main
git push -u origin main
```

### 4. README 업데이트
- 스크린샷 추가
- 설치 방법 명시
- 사용 예제 추가

## 테스트 체크리스트

배포 전 확인사항:

- [ ] 아이콘 생성 완료
- [ ] test-simple.html에서 정상 작동
- [ ] example.html에서 정상 작동
- [ ] 실제 프로젝트에서 테스트
- [ ] State 탭 정상 작동
- [ ] Actions 탭 정상 작동 (있다면)
- [ ] Observables 탭 정상 작동
- [ ] 트리 펼치기/접기 정상 작동
- [ ] 상태 업데이트 실시간 반영
- [ ] 새로고침/내보내기 기능 작동

## 개선 아이디어

향후 추가할 기능:
- [ ] Time-travel debugging (상태 되돌리기)
- [ ] 액션 히스토리 필터링
- [ ] 상태 diff 보기
- [ ] 성능 모니터링
- [ ] Dark mode 지원
- [ ] 상태 import/export
- [ ] 설정 페이지

## 문제 해결

### 확장 프로그램이 감지 안됨
```bash
# Chrome 확장 프로그램 페이지에서 새로고침
# 페이지도 새로고침 (Cmd+R 또는 F5)
```

### MobX 버전 호환성
- MobX 4, 5, 6 지원
- MobX 3 이하는 미지원

### 상태가 안보임
- 콘솔에서 `[MobX DevTools]` 로그 확인
- `window.mobx` 존재 확인
- Observable이 실제로 생성되었는지 확인

