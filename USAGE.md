# MobX DevTools 사용 가이드

## 확장 프로그램 개발 시 주의사항

### "Extension context invalidated" 에러

이 에러는 확장 프로그램을 수정하거나 새로고침할 때 발생합니다.

**해결 방법:**
1. Chrome 확장 프로그램 페이지(`chrome://extensions/`)에서 확장 프로그램 **새로고침(🔄)**
2. **페이지를 완전히 새로고침** (Cmd+R 또는 F5)
3. DevTools를 닫았다가 다시 열기 (F12)

**개발 워크플로우:**
```
코드 수정
  ↓
확장 프로그램 새로고침 (chrome://extensions/)
  ↓
페이지 새로고침 (F5)
  ↓
DevTools 다시 열기 (F12)
  ↓
MobX 탭 확인
```

## MobX 감지 문제 해결

### 1. MobX가 감지되지 않을 때

콘솔에서 다음을 실행:
```javascript
// MobX 전역 변수 확인
console.log('window.mobx:', window.mobx);

// Observable 객체 찾기
Object.keys(window).filter(k => {
  try {
    return window[k] && window[k].$mobx;
  } catch(e) {
    return false;
  }
});
```

### 2. 프로젝트에서 MobX 노출하기

개발 모드에서 디버깅을 위해 MobX를 전역에 노출:

```javascript
// 개발 환경에서만
if (process.env.NODE_ENV === 'development') {
  window.mobx = require('mobx'); // 또는 import * as mobx from 'mobx'
}
```

또는 store를 전역에 노출:
```javascript
// 개발 환경에서만
if (process.env.NODE_ENV === 'development') {
  window.myStore = myStore;
}
```

### 3. Webpack/Vite 설정

**Webpack:**
```javascript
// webpack.config.js
module.exports = {
  externals: {
    // 개발 모드에서 MobX를 window에 노출
    mobx: 'mobx'
  }
};
```

**Vite:**
```javascript
// vite.config.js
export default {
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV)
  }
};
```

## 사용 팁

### State 탭
- **펼치기/접기**: ▶ 아이콘 클릭
- **상태는 자동으로 유지됨**: 상태가 업데이트되어도 펼쳐진 트리는 유지
- **새로고침**: 현재 상태를 다시 가져옴
- **내보내기**: 현재 상태를 JSON 파일로 저장

### Actions 탭
- **로그 지우기**: 액션 히스토리 초기화
- **자동 스크롤**: 새 액션이 추가될 때 자동으로 스크롤

### Observables 탭
- Observable 값의 변경사항을 실시간으로 표시
- 변경 전/후 값 비교

## 실제 프로젝트 예제

### React + MobX 프로젝트

```javascript
// stores/RootStore.js
import { makeObservable, observable, action } from 'mobx';

class RootStore {
  count = 0;
  
  constructor() {
    makeObservable(this, {
      count: observable,
      increment: action
    });
    
    // 개발 환경에서만 전역 노출
    if (process.env.NODE_ENV === 'development') {
      window.rootStore = this;
    }
  }
  
  increment() {
    this.count++;
  }
}

export const rootStore = new RootStore();
```

### Vue + MobX 프로젝트

```javascript
// stores/store.js
import { observable, action, makeObservable } from 'mobx';

class Store {
  data = [];
  
  constructor() {
    makeObservable(this, {
      data: observable,
      addItem: action
    });
    
    if (process.env.NODE_ENV === 'development') {
      window.vueStore = this;
    }
  }
  
  addItem(item) {
    this.data.push(item);
  }
}

export default new Store();
```

## 문제 해결

### Q: DevTools에 MobX 탭이 없어요
**A:** 
1. 확장 프로그램이 설치되어 있는지 확인 (`chrome://extensions/`)
2. 개발자 모드가 활성화되어 있는지 확인
3. 페이지를 새로고침

### Q: "MobX 감지 중..." 상태에서 멈춰요
**A:**
1. 콘솔에서 `[MobX DevTools]` 로그 확인
2. `window.mobx` 또는 Observable 객체 존재 확인
3. 프로젝트에서 실제로 MobX를 사용하는지 확인

### Q: 상태가 업데이트되지 않아요
**A:**
1. Observable이 제대로 선언되어 있는지 확인
2. 액션이 `@action` 또는 `action()` 래퍼로 감싸져 있는지 확인
3. 콘솔에서 `[MobX DevTools] Observable changed` 로그 확인

### Q: 트리가 자동으로 닫혀요
**A:**
이 문제는 수정되었습니다. 최신 버전을 사용하세요.

## 디버깅 로그

확장 프로그램의 디버깅 로그는 다음과 같은 형식으로 출력됩니다:

```
[MobX DevTools] Inject script loaded
[MobX DevTools] MobX detected: 6.x.x
[MobX DevTools] Subscribed to: store.count
[MobX DevTools] Observable changed: store.count
[Background] Content script connected, tab: 123
[MobX DevTools Panel] Inspecting tab: 123
```

문제가 있을 때 이 로그들을 확인하세요.

