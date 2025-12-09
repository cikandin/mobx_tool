// MobX 상태 추적을 위한 주입 스크립트
// 공식 mobx-devtools API 호환 + 성능 최적화
(function() {
  'use strict';

  if (window.__MOBX_DEVTOOLS_GLOBAL_HOOK__) {
    console.log('[MobX DevTools] Hook already exists');
    return;
  }

  console.log('[MobX DevTools] Installing hook...');

  // Debounce 함수
  function debounce(func, wait) {
    var timeout;
    return function() {
      var context = this;
      var args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function() {
        func.apply(context, args);
      }, wait);
    };
  }

  // 안전한 메시지 전송
  function safeSend(type, payload) {
    try {
      window.postMessage({
        source: 'mobx-devtools-inject',
        type: type,
        payload: payload
      }, '*');
    } catch (e) {
      console.error('[MobX DevTools] postMessage failed:', e.message);
    }
  }

  var hook = {
    mobx: null,
    stores: new Map(),
    actionQueue: [], // 액션 큐
    
    // 공식 API: MobX 라이브러리 주입
    injectMobx: function(mobx) {
      try {
        console.log('[MobX DevTools] injectMobx called, version:', mobx.version);
        this.mobx = mobx;
        safeSend('MOBX_DETECTED', {
          version: mobx.version || 'unknown',
          timestamp: Date.now()
        });
        this.setupSpy(mobx);
      } catch (e) {
        console.error('[MobX DevTools] injectMobx error:', e);
      }
      return this;
    },
    
    // Spy 설정
    setupSpy: function(mobx) {
      if (!mobx || !mobx.spy) return;
      var self = this;
      var actionCount = 0;
      
      try {
        mobx.spy(function(event) {
          try {
            // 액션 이벤트
            if (event.type === 'action') {
              actionCount++;
              
              // 액션을 큐에 추가
              self.actionQueue.push({
                id: actionCount,
                name: event.name,
                type: event.type,
                object: event.object ? event.object.constructor.name : null,
                timestamp: Date.now()
              });
              
              // Store 참조 항상 갱신
              if (event.object) {
                var storeName = event.object.constructor.name || 'Store';
                self.stores.set(storeName, event.object);
              }
              
              // 액션 큐 전송 (debounced)
              self.flushActionsDebounced();
            }
            
            // Observable 업데이트 이벤트 (중요!)
            if (event.type === 'update' || event.type === 'add' || event.type === 'delete') {
              // Observable이 변경되면 즉시 상태 업데이트
              self.sendStateDebounced();
            }
          } catch (e) {}
        });
        console.log('[MobX DevTools] Spy registered for action & update events');
      } catch (e) {
        console.warn('[MobX DevTools] Spy setup failed:', e);
      }
    },
    
    // 상태 전송 (debounced)
    sendStateDebounced: debounce(function() {
      var self = window.__MOBX_DEVTOOLS_GLOBAL_HOOK__;
      if (self) {
        console.log('[MobX DevTools] Observable changed, sending state...');
        self.sendState();
      }
    }, 300),
    
    // 액션 큐 전송 (debounced) - 500ms 대기
    flushActionsDebounced: debounce(function() {
      var self = window.__MOBX_DEVTOOLS_GLOBAL_HOOK__;
      if (self && self.actionQueue && self.actionQueue.length > 0) {
        // 최대 50개만 전송
        var actionsToSend = self.actionQueue.slice(-50);
        self.actionQueue = [];
        
        actionsToSend.forEach(function(action) {
          safeSend('ACTION', action);
        });
        
        // 액션 후 상태도 업데이트
        self.sendState();
      }
    }, 500),
    
    // 공식 API: mobx-react 주입
    injectMobxReact: function(mobxReact, mobx) {
      try {
        console.log('[MobX DevTools] injectMobxReact called');
        if (mobx && !this.mobx) {
          this.injectMobx(mobx);
        }
      } catch (e) {}
      return this;
    },
    
    // 공식 API: Store 등록
    inject: function(name, store) {
      try {
        console.log('[MobX DevTools] Store injected:', name);
        this.stores.set(name, store);
      } catch (e) {}
      return this;
    },
    
    // 상태 전송
    sendState: function() {
      try {
        var self = this;
        var storeNames = [];
        var timestamp = Date.now();
        
        // 먼저 모든 store 이름 수집
        this.stores.forEach(function(store, name) {
          storeNames.push(name);
        });
        
        console.log('[MobX DevTools] Sending', storeNames.length, 'stores:', storeNames.join(', '));
        
        // 모든 store를 모아서 한번에 전송
        var allStores = {};
        var index = 0;
        
        this.stores.forEach(function(store, name) {
          try {
            if (name === 'LocationStore') {
              console.log('[MobX DevTools] ======= LocationStore Debug =======');
              console.log('Store object:', store);
              console.log('Store keys:', Object.keys(store));
              console.log('locationName:', store.locationName);
              console.log('locationId:', store.locationId);
              
              // toJS 결과
              if (self.mobx && self.mobx.toJS) {
                var toJSResult = self.mobx.toJS(store);
                console.log('toJS result keys:', Object.keys(toJSResult));
                console.log('toJS locationName:', toJSResult.locationName);
              }
              console.log('=====================================');
            }
            
            // toJS로 observable을 일반 객체로 변환 (매번 최신 값)
            var plain;
            if (self.mobx && self.mobx.toJS) {
              try {
                plain = self.mobx.toJS(store);
              } catch (e) {
                console.warn('[MobX DevTools] toJS failed for', name, ', using direct read');
                plain = self.serialize(store, 0);
              }
            } else {
              plain = self.serialize(store, 0);
            }
            
            allStores[name] = plain;
          } catch (e) {
            console.error('[MobX DevTools] Failed to serialize', name, ':', e.message);
            allStores[name] = { error: 'Failed: ' + e.message };
          }
        });
        
        console.log('[MobX DevTools] All stores serialized, sending...');
        
        // JSON.parse(JSON.stringify())로 함수 완전 제거
        var cleanState = JSON.parse(JSON.stringify(allStores));
        
        // 한번에 전송
        safeSend('STATE_UPDATE', {
          state: cleanState,
          timestamp: timestamp
        });
        
        console.log('[MobX DevTools] State sent');
      } catch (e) {
        console.error('[MobX DevTools] sendState error:', e);
      }
    },
    
    // 직렬화 - observable 값을 직접 읽기
    serialize: function(obj, depth) {
      try {
        if (depth > 5) return '[Max Depth]';
        if (obj === null) return null;
        if (obj === undefined) return undefined;
        if (typeof obj !== 'object') return obj;
        if (typeof obj === 'function') return undefined;
        
        if (Array.isArray(obj)) {
          var self = this;
          return obj.slice(0, 50).map(function(item) {
            try {
              return self.serialize(item, depth + 1);
            } catch (e) {
              return '[Error]';
            }
          });
        }
        
        // 객체를 직접 순회하면서 값 읽기 (toJS 대신)
        var result = {};
        var keys = Object.keys(obj).slice(0, 100);
        var self = this;
        
        keys.forEach(function(key) {
          if (key.charAt(0) === '$' || key.charAt(0) === '_') return;
          try {
            // 직접 값을 읽음 (getter 실행됨 = 최신 observable 값)
            var value = obj[key];
            if (typeof value === 'function') return;
            result[key] = self.serialize(value, depth + 1);
          } catch (e) {
            result[key] = '[Error: ' + e.message + ']';
          }
        });
        
        return result;
      } catch (e) {
        return '[Error: ' + e.message + ']';
      }
    }
  };

  // 전역 훅 설치
  try {
    Object.defineProperty(window, '__MOBX_DEVTOOLS_GLOBAL_HOOK__', {
      value: hook,
      writable: true,
      enumerable: false,
      configurable: true
    });
    console.log('[MobX DevTools] Hook installed successfully');
  } catch (e) {
    window.__MOBX_DEVTOOLS_GLOBAL_HOOK__ = hook;
    console.log('[MobX DevTools] Hook installed (fallback)');
  }

  // 이미 로드된 MobX 감지
  function detectExistingMobX() {
    try {
      if (window.mobx && !hook.mobx) {
        console.log('[MobX DevTools] Found existing window.mobx');
        hook.injectMobx(window.mobx);
        return true;
      }
      
      var storeNames = ['store', 'rootStore', 'appStore', 'stores'];
      for (var i = 0; i < storeNames.length; i++) {
        var name = storeNames[i];
        try {
          if (window[name] && typeof window[name] === 'object') {
            console.log('[MobX DevTools] Found store:', name);
            hook.stores.set(name, window[name]);
          }
        } catch (e) {}
      }
      
      if (hook.stores.size > 0) {
        hook.sendState();
        safeSend('MOBX_DETECTED', {
          version: hook.mobx ? hook.mobx.version : 'unknown',
          timestamp: Date.now()
        });
        return true;
      }
    } catch (e) {}
    return false;
  }

  // DevTools 요청 처리
  try {
    window.addEventListener('message', function(event) {
      try {
        if (!event.data || event.data.source !== 'mobx-devtools-content') return;
        if (event.data.type === 'GET_STATE') {
          hook.sendState();
        }
      } catch (e) {}
    });
  } catch (e) {}

  // 초기 감지 시도
  setTimeout(function() { detectExistingMobX(); }, 500);
  setTimeout(function() { detectExistingMobX(); }, 2000);

  // 주기적 상태 업데이트 (10초마다 - 성능 최적화)
  setInterval(function() {
    try {
      if (hook.stores.size > 0) {
        hook.sendState();
      }
    } catch (e) {}
  }, 10000);
  
  console.log('[MobX DevTools] Hook ready');
  
})();
