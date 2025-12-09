// MobX DevTools Injection Script
// Compatible with official mobx-devtools API
(function() {
  'use strict';

  if (window.__MOBX_DEVTOOLS_GLOBAL_HOOK__) {
    return;
  }

  // Debounce utility
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

  // Safe message sending
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
    
    // Official API: Inject MobX library
    injectMobx: function(mobx) {
      try {
        this.mobx = mobx;
        safeSend('MOBX_DETECTED', {
          version: mobx.version || 'unknown',
          timestamp: Date.now()
        });
        this.setupSpy(mobx);
      } catch (e) {}
      return this;
    },
    
    // Setup spy
    setupSpy: function(mobx) {
      if (!mobx || !mobx.spy) return;
      var self = this;
      var actionCount = 0;
      
      try {
        mobx.spy(function(event) {
          try {
            // Action event
            if (event.type === 'action') {
              actionCount++;
              
              // Add action to queue
              self.actionQueue.push({
                id: actionCount,
                name: event.name,
                type: event.type,
                object: event.object ? event.object.constructor.name : null,
                timestamp: Date.now()
              });
              
              // Always update store reference
              if (event.object) {
                var storeName = event.object.constructor.name || 'Store';
                self.stores.set(storeName, event.object);
              }
              
              // Flush actions queue (debounced)
              self.flushActionsDebounced();
            }
            
            // Observable update event
            if (event.type === 'update' || event.type === 'add' || event.type === 'delete') {
              self.sendStateDebounced();
            }
          } catch (e) {}
        });
      } catch (e) {}
    },
    
    // State sending (debounced)
    sendStateDebounced: debounce(function() {
      var self = window.__MOBX_DEVTOOLS_GLOBAL_HOOK__;
      if (self) {
        self.sendState();
      }
    }, 300),
    
    // Flush actions queue (debounced - 500ms)
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
    
    // Official API: Inject mobx-react
    injectMobxReact: function(mobxReact, mobx) {
      try {
        if (mobx && !this.mobx) {
          this.injectMobx(mobx);
        }
      } catch (e) {}
      return this;
    },
    
    // Official API: Register store
    inject: function(name, store) {
      try {
        this.stores.set(name, store);
      } catch (e) {}
      return this;
    },
    
    // Send state
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
            // Convert observable to plain object using toJS (always get latest value)
            var plain;
            if (self.mobx && self.mobx.toJS) {
              try {
                plain = self.mobx.toJS(store);
              } catch (e) {
                plain = self.serialize(store, 0);
              }
            } else {
              plain = self.serialize(store, 0);
            }
            
            allStores[name] = plain;
          } catch (e) {
            allStores[name] = { error: 'Failed' };
          }
        });
        
        // Remove all functions completely using JSON.parse(JSON.stringify())
        var cleanState = JSON.parse(JSON.stringify(allStores));
        
        // Send all at once
        safeSend('STATE_UPDATE', {
          state: cleanState,
          timestamp: timestamp
        });
      } catch (e) {
        console.error('[MobX DevTools] sendState error:', e);
      }
    },
    
    // Serialize - directly read observable values
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
        
        // Traverse object directly to read values (instead of toJS)
        var result = {};
        var keys = Object.keys(obj).slice(0, 100);
        var self = this;
        
        keys.forEach(function(key) {
          if (key.charAt(0) === '$' || key.charAt(0) === '_') return;
          try {
            // Read value directly (getter executed = get latest observable value)
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

  // Install global hook
  try {
    Object.defineProperty(window, '__MOBX_DEVTOOLS_GLOBAL_HOOK__', {
      value: hook,
      writable: true,
      enumerable: false,
      configurable: true
    });
  } catch (e) {
    window.__MOBX_DEVTOOLS_GLOBAL_HOOK__ = hook;
  }

  // Detect already loaded MobX
  function detectExistingMobX() {
    try {
      if (window.mobx && !hook.mobx) {
        hook.injectMobx(window.mobx);
        return true;
      }
      
      var storeNames = ['store', 'rootStore', 'appStore', 'stores'];
      for (var i = 0; i < storeNames.length; i++) {
        var name = storeNames[i];
        try {
          if (window[name] && typeof window[name] === 'object') {
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

  // Handle DevTools requests
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

  // Initial detection attempts
  setTimeout(function() { detectExistingMobX(); }, 500);
  setTimeout(function() { detectExistingMobX(); }, 2000);

  // Periodic state update (every 10 seconds)
  setInterval(function() {
    try {
      if (hook.stores.size > 0) {
        hook.sendState();
      }
    } catch (e) {}
  }, 10000);
  
})();
