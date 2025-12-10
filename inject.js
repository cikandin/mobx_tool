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
    actionCount: 0, // Global action counter for unique IDs
    filteredStores: null, // Filtered store names (null = send all)
    editingPath: null, // Currently editing path to skip update events
    editingTimeout: null, // Timeout to clear editing state
    actionStack: [], // Stack of { id, info, changes, storeName }
    
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
            // ACTION START - spyReportStart: true
            if (event.type === 'action' && event.spyReportStart) {
              var storeName = 'Unknown';
              
              if (event.object && event.object.constructor) {
                storeName = event.object.constructor.name || 'Store';
              }
              if (event.debugObjectName) {
                var match = event.debugObjectName.match(/^([^@]+)/);
                if (match) storeName = match[1];
              }
              
              // Always register store
              if (event.object && storeName !== 'Unknown') {
                self.stores.set(storeName, event.object);
              }
              
              // Check if should record
              var shouldRecord = self.filteredStores && 
                                 self.filteredStores.length > 0 && 
                                 self.filteredStores.includes(storeName);
              
              if (shouldRecord) {
                self.actionCount++;
                var actionId = Date.now() + '-' + self.actionCount;
                
                // Push to stack
                self.actionStack.push({
                  id: actionId,
                  name: event.name,
                  storeName: storeName,
                  timestamp: Date.now(),
                  changes: []
                });
              } else {
                // Push placeholder for non-recorded action (to maintain stack balance)
                self.actionStack.push(null);
              }
            }
            
            // ACTION END - spyReportEnd: true
            if (event.type === 'action' && event.spyReportEnd) {
              if (self.actionStack.length > 0) {
                var action = self.actionStack.pop();
                
                // Send if it was a recorded action
                if (action !== null) {
                  safeSend('ACTION', {
                    id: action.id,
                    name: action.name,
                    type: 'action',
                    object: action.storeName,
                    timestamp: action.timestamp,
                    changes: action.changes
                  });
                }
              }
            }
            
            // FALLBACK: Action without spyReportStart/End (older MobX)
            if (event.type === 'action' && !event.spyReportStart && !event.spyReportEnd) {
              var storeName = 'Unknown';
              
              if (event.object && event.object.constructor) {
                storeName = event.object.constructor.name || 'Store';
              }
              if (event.debugObjectName) {
                var match = event.debugObjectName.match(/^([^@]+)/);
                if (match) storeName = match[1];
              }
              
              if (event.object && storeName !== 'Unknown') {
                self.stores.set(storeName, event.object);
              }
              
              var shouldRecord = self.filteredStores && 
                                 self.filteredStores.length > 0 && 
                                 self.filteredStores.includes(storeName);
              
              if (shouldRecord) {
                self.actionCount++;
                safeSend('ACTION', {
                  id: Date.now() + '-' + self.actionCount,
                  name: event.name,
                  type: 'action',
                  object: storeName,
                  timestamp: Date.now(),
                  changes: [] // No change tracking for fallback
                });
              }
            }
            
            // Observable changes - add to current action
            if (event.type === 'update' || event.type === 'add' || event.type === 'delete') {
              // Skip if editing
              if (self.editingPath && event.name && self.editingPath.indexOf(event.name) !== -1) {
                return;
              }
              
              // Get store name
              var changeStoreName = null;
              if (event.debugObjectName) {
                var match = event.debugObjectName.match(/^([^@]+)/);
                if (match) changeStoreName = match[1];
              }
              if (!changeStoreName && event.object && event.object.constructor) {
                changeStoreName = event.object.constructor.name;
              }
              
              // Register store
              if (changeStoreName && changeStoreName !== 'Object' && changeStoreName !== 'Array') {
                if (event.object) {
                  self.stores.set(changeStoreName, event.object);
                }
              }
              
              // Find the innermost recorded action in stack
              var currentAction = null;
              for (var i = self.actionStack.length - 1; i >= 0; i--) {
                if (self.actionStack[i] !== null) {
                  currentAction = self.actionStack[i];
                  break;
                }
              }
              
              // Add change to current action if exists
              if (currentAction) {
                var change = {
                  type: event.type,
                  name: event.name || '',
                  store: changeStoreName,
                  observableKind: event.observableKind || 'unknown',
                  oldValue: undefined,
                  newValue: undefined
                };
                
                try {
                  if (event.type === 'update') {
                    change.oldValue = event.oldValue;
                    change.newValue = event.newValue;
                    if (self.mobx && self.mobx.toJS) {
                      try { change.oldValue = self.mobx.toJS(event.oldValue); } catch(e) {}
                      try { change.newValue = self.mobx.toJS(event.newValue); } catch(e) {}
                    }
                  } else if (event.type === 'add') {
                    change.newValue = event.newValue;
                    if (self.mobx && self.mobx.toJS) {
                      try { change.newValue = self.mobx.toJS(event.newValue); } catch(e) {}
                    }
                  } else if (event.type === 'delete') {
                    change.oldValue = event.oldValue;
                    if (self.mobx && self.mobx.toJS) {
                      try { change.oldValue = self.mobx.toJS(event.oldValue); } catch(e) {}
                    }
                  }
                  change = JSON.parse(JSON.stringify(change));
                  currentAction.changes.push(change);
                } catch (e) {}
              }
              
              // Update state panel
              if (self.filteredStores && self.filteredStores.length > 0) {
                if (changeStoreName && self.filteredStores.includes(changeStoreName)) {
                  self.sendStateDebounced();
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
