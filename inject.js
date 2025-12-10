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
    actionQueue: [], // Action queue
    actionCount: 0, // Global action counter for unique IDs
    filteredStores: null, // Filtered store names (null = send all)
    editingPath: null, // Currently editing path to skip update events
    editingTimeout: null, // Timeout to clear editing state
    
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
      
      try {
        mobx.spy(function(event) {
          try {
            // Action event
            if (event.type === 'action') {
              if (event.object) {
                var storeName = event.object.constructor.name || 'Store';
                
                // Always register/update store reference (needed for store list)
                self.stores.set(storeName, event.object);
                
                // Only record actions from filtered stores
                // If filteredStores is null or empty, don't subscribe to any actions
                var shouldRecord = self.filteredStores && 
                                   self.filteredStores.length > 0 && 
                                   self.filteredStores.includes(storeName);
                
                if (shouldRecord) {
                  self.actionCount++;
                  
                  // Create unique ID: timestamp + counter for uniqueness
                  var uniqueId = Date.now() + '-' + self.actionCount;
                  
                  // Add action to queue
                  self.actionQueue.push({
                    id: uniqueId,
                    name: event.name,
                    type: event.type,
                    object: storeName,
                    timestamp: Date.now()
                  });
                  
                  // Flush actions queue (debounced)
                  self.flushActionsDebounced();
                }
              }
            }
            
            // Observable update event
            if (event.type === 'update' || event.type === 'add' || event.type === 'delete') {
              // Skip if this is the path being edited
              if (self.editingPath && event.name && self.editingPath.indexOf(event.name) !== -1) {
                return;
              }
              
              // Always try to register store from observable update event (needed for store list)
              // event.object might be a store instance
              if (event.object && event.object.constructor && event.object.constructor.name) {
                var storeName = event.object.constructor.name;
                // Only register if it looks like a store (has constructor name, not just 'Object')
                if (storeName !== 'Object' && storeName !== 'Array') {
                  self.stores.set(storeName, event.object);
                }
              }
              
              // Only update state if filter is set and has stores (spy event processing is filtered)
              // If filteredStores is null or empty, don't subscribe to observable updates
              if (self.filteredStores && self.filteredStores.length > 0) {
                // Check if the store is in the filter before sending state update
                if (event.object && event.object.constructor && event.object.constructor.name) {
                  var storeName = event.object.constructor.name;
                  if (self.filteredStores.includes(storeName)) {
                    self.sendStateDebounced();
                  }
                }
              }
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
        var timestamp = Date.now();
        var allStores = {};
        
        this.stores.forEach(function(store, name) {
          // Always send all stores so UI can show the list for filtering
          // Filtering is done in the UI, not here
          
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
    
    // Parse path to handle both object keys and array indices
    // Examples: "user.name" -> ["user", "name"]
    //           "[0].locationName" -> [0, "locationName"]
    //           "items[0].name" -> ["items", 0, "name"]
    parsePath: function(path) {
      var parts = [];
      var current = '';
      var i = 0;
      
      while (i < path.length) {
        if (path[i] === '[') {
          // Array index
          if (current) {
            parts.push(current);
            current = '';
          }
          i++; // Skip '['
          var index = '';
          while (i < path.length && path[i] !== ']') {
            index += path[i];
            i++;
          }
          if (index !== '') {
            parts.push(parseInt(index, 10));
          }
          i++; // Skip ']'
        } else if (path[i] === '.') {
          // Object key separator
          if (current) {
            parts.push(current);
            current = '';
          }
          i++;
        } else {
          current += path[i];
          i++;
        }
      }
      
      if (current) {
        parts.push(current);
      }
      
      return parts;
    },
    
    // Set value in observable store
    setValue: function(storeName, path, value) {
      try {
        var store = this.stores.get(storeName);
        if (!store) {
          console.error('[MobX DevTools] Store not found:', storeName);
          return;
        }
        
        // Set editing flag to prevent immediate update
        var fullPath = storeName + '.' + path;
        this.editingPath = fullPath;
        
        // Clear editing flag after 1 second
        var self = this;
        clearTimeout(this.editingTimeout);
        this.editingTimeout = setTimeout(function() {
          self.editingPath = null;
        }, 1000);
        
        // Parse path with array index support
        var keys = this.parsePath(path);
        var target = store;
        
        // If first key matches storeName, remove it (path includes storeName)
        var startIndex = 0;
        if (keys.length > 0 && keys[0] === storeName) {
          startIndex = 1;
        }
        
        // Navigate to the parent object
        for (var i = startIndex; i < keys.length - 1; i++) {
          if (target === null || target === undefined) {
            console.error('[MobX DevTools] Invalid path at:', keys.slice(0, i + 1));
            return;
          }
          target = target[keys[i]];
        }
        
        if (target === null || target === undefined) {
          console.error('[MobX DevTools] Invalid path:', path);
          return;
        }
        
        // Set the value
        var lastKey = keys[keys.length - 1];
        var oldValue = target[lastKey];
        
        // Convert string value to appropriate type
        var newValue = value;
        if (typeof oldValue === 'number') {
          newValue = parseFloat(value);
          if (isNaN(newValue)) newValue = value;
        } else if (typeof oldValue === 'boolean') {
          newValue = value === 'true' || value === true;
        }
        
        target[lastKey] = newValue;
        console.log('[MobX DevTools] Value updated:', path, 'from', oldValue, 'to', newValue);
      } catch (e) {
        console.error('[MobX DevTools] setValue error:', e);
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
        } else if (event.data.type === 'SET_FILTER') {
          // Update filtered stores list
          hook.filteredStores = event.data.payload.stores;
          // Don't send state immediately - let next update cycle handle it
        } else if (event.data.type === 'SET_VALUE') {
          // Set observable value
          hook.setValue(event.data.payload.storeName, event.data.payload.path, event.data.payload.value);
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
  
  // Periodic store detection (every 30 seconds) - scan for new stores
  setInterval(function() {
    try {
      detectExistingMobX();
    } catch (e) {}
  }, 30000);
  
})();
