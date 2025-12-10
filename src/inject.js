// MobX DevTools Injection Script
// Compatible with official mobx-devtools API
import { mapStackTrace } from 'sourcemapped-stacktrace';

// Wrap in IIFE for isolation
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
    } catch (e) {}
  }

  // Map stack trace using source maps (async)
  function mapStack(rawStack) {
    return new Promise(function(resolve) {
      try {
        mapStackTrace(rawStack, function(mappedStack) {
          if (mappedStack && mappedStack.length > 0) {
            resolve(mappedStack.join('\n'));
          } else {
            resolve(rawStack);
          }
        }, { cacheGlobally: true });
      } catch (e) {
        resolve(rawStack);
      }
    });
  }

  var hook = {
    mobx: null,
    stores: new Map(),
    actionCount: 0,
    filteredStores: null,
    editingPath: null,
    editingTimeout: null,
    actionStack: [],
    reportEndDepth: 0,
    
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
    
    // Send action with its changes (async to allow source map mapping)
    sendAction: function(action) {
      var shouldSend = action.isFiltered || action.changes.length > 0;
      
      if (shouldSend) {
        var rawStack = action.stackTrace || '';
        
        mapStack(rawStack).then(function(mappedStack) {
          safeSend('ACTION', {
            id: action.id,
            name: action.name,
            type: 'action',
            object: action.storeName,
            timestamp: action.timestamp,
            changes: action.changes,
            arguments: action.arguments || [],
            stackTrace: mappedStack
          });
        });
      }
    },
    
    // Get current action (top of stack)
    getCurrentAction: function() {
      if (this.actionStack.length > 0) {
        return this.actionStack[this.actionStack.length - 1];
      }
      return null;
    },
    
    // Setup spy
    setupSpy: function(mobx) {
      if (!mobx || !mobx.spy) return;
      var self = this;
      
      try {
        mobx.spy(function(event) {
          try {
            if (event.spyReportStart) {
              self.reportEndDepth++;
            }
            
            // Action START
            if (event.type === 'action' && event.spyReportStart) {
              var storeName = 'Unknown';
              var actionName = event.name || '';
              
              var atIndex = actionName.indexOf('@');
              if (atIndex > 0) {
                storeName = actionName.substring(0, atIndex);
              } else if (event.object && event.object.constructor) {
                storeName = event.object.constructor.name || 'Store';
              }
              
              if (event.object && storeName !== 'Unknown') {
                self.stores.set(storeName, event.object);
              }
              
              var isFiltered = self.filteredStores && 
                               self.filteredStores.length > 0 && 
                               self.filteredStores.includes(storeName);
              
              var stackTrace = '';
              try {
                throw new Error();
              } catch (e) {
                stackTrace = e.stack || '';
                var lines = stackTrace.split('\n');
                var filteredLines = lines.filter(function(line, idx) {
                  if (idx < 3) return false;
                  if (line.indexOf('mobx') !== -1) return false;
                  if (line.indexOf('inject.js') !== -1) return false;
                  if (line.indexOf('chunk-DQOE5FNA') !== -1) return false;
                  return true;
                });
                stackTrace = filteredLines.join('\n');
              }
              
              var args = [];
              try {
                if (event.arguments && event.arguments.length > 0) {
                  for (var i = 0; i < event.arguments.length; i++) {
                    var arg = event.arguments[i];
                    if (self.mobx && self.mobx.toJS) {
                      try { arg = self.mobx.toJS(arg); } catch(e) {}
                    }
                    args.push(arg);
                  }
                  args = JSON.parse(JSON.stringify(args));
                }
              } catch (e) {
                args = ['[serialization error]'];
              }
              
              self.actionCount++;
              self.actionStack.push({
                id: Date.now() + '-' + self.actionCount,
                name: actionName,
                storeName: storeName,
                timestamp: Date.now(),
                changes: [],
                isFiltered: isFiltered,
                startDepth: self.reportEndDepth - 1,
                arguments: args,
                stackTrace: stackTrace
              });
            }
            
            // Report END
            if (event.type === 'report-end') {
              self.reportEndDepth--;
              
              if (self.actionStack.length > 0) {
                var topAction = self.actionStack[self.actionStack.length - 1];
                if (topAction.startDepth === self.reportEndDepth) {
                  self.actionStack.pop();
                  
                  var shouldSend = topAction.isFiltered || topAction.changes.length > 0;
                  if (shouldSend) {
                    self.sendAction(topAction);
                  }
                }
              }
            }
            
            // Observable changes
            if ((event.type === 'update' || event.type === 'add' || event.type === 'delete') && event.spyReportStart) {
              if (self.editingPath && event.name && self.editingPath.indexOf(event.name) !== -1) {
                return;
              }
              
              var changeStoreName = null;
              if (event.debugObjectName) {
                var match = event.debugObjectName.match(/^([^@]+)/);
                if (match) changeStoreName = match[1];
              }
              if (!changeStoreName && event.object && event.object.constructor) {
                changeStoreName = event.object.constructor.name;
              }
              
              if (!changeStoreName || changeStoreName === 'Object' || changeStoreName === 'Array') {
                return;
              }
              
              if (event.object) {
                self.stores.set(changeStoreName, event.object);
              }
              
              self.sendStateDebounced();
              
              var isFiltered = self.filteredStores && 
                               self.filteredStores.length > 0 && 
                               self.filteredStores.includes(changeStoreName);
              
              if (!isFiltered) {
                return;
              }
              
              var currentAction = self.getCurrentAction();
              
              if (currentAction) {
                var change = {
                  type: event.type,
                  name: event.name || '',
                  store: changeStoreName,
                  observableKind: event.observableKind || ''
                };
                
                try {
                  if (self.mobx && self.mobx.toJS) {
                    change.oldValue = self.mobx.toJS(event.oldValue);
                    change.newValue = self.mobx.toJS(event.newValue);
                  } else {
                    change.oldValue = event.oldValue;
                    change.newValue = event.newValue;
                  }
                  change = JSON.parse(JSON.stringify(change));
                  currentAction.changes.push(change);
                } catch (e) {
                  change.oldValue = String(event.oldValue);
                  change.newValue = String(event.newValue);
                  currentAction.changes.push(change);
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
    
    // Flush actions queue (debounced)
    flushActionsDebounced: debounce(function() {
      var self = window.__MOBX_DEVTOOLS_GLOBAL_HOOK__;
      if (self && self.actionQueue && self.actionQueue.length > 0) {
        var actionsToSend = self.actionQueue.slice(-50);
        self.actionQueue = [];
        
        actionsToSend.forEach(function(action) {
          safeSend('ACTION', action);
        });
        
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
          try {
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
        
        var cleanState = JSON.parse(JSON.stringify(allStores));
        
        safeSend('STATE_UPDATE', {
          state: cleanState,
          timestamp: timestamp
        });
      } catch (e) {}
    },
    
    // Parse path
    parsePath: function(path) {
      var parts = [];
      var current = '';
      var i = 0;
      
      while (i < path.length) {
        if (path[i] === '[') {
          if (current) {
            parts.push(current);
            current = '';
          }
          i++;
          var index = '';
          while (i < path.length && path[i] !== ']') {
            index += path[i];
            i++;
          }
          if (index !== '') {
            parts.push(parseInt(index, 10));
          }
          i++;
        } else if (path[i] === '.') {
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
    
    // Set value
    setValue: function(storeName, path, value) {
      try {
        var store = this.stores.get(storeName);
        if (!store) return;
        
        var fullPath = storeName + '.' + path;
        this.editingPath = fullPath;
        
        var self = this;
        clearTimeout(this.editingTimeout);
        this.editingTimeout = setTimeout(function() {
          self.editingPath = null;
        }, 1000);
        
        var keys = this.parsePath(path);
        var target = store;
        
        var startIndex = 0;
        if (keys.length > 0 && keys[0] === storeName) {
          startIndex = 1;
        }
        
        for (var i = startIndex; i < keys.length - 1; i++) {
          if (target === null || target === undefined) return;
          target = target[keys[i]];
        }
        
        if (target === null || target === undefined) return;
        
        var lastKey = keys[keys.length - 1];
        var oldValue = target[lastKey];
        
        var newValue = value;
        if (typeof oldValue === 'number') {
          newValue = parseFloat(value);
          if (isNaN(newValue)) newValue = value;
        } else if (typeof oldValue === 'boolean') {
          newValue = value === 'true' || value === true;
        }
        
        target[lastKey] = newValue;
      } catch (e) {}
    },
    
    // Serialize
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
        
        var result = {};
        var keys = Object.keys(obj).slice(0, 100);
        var self = this;
        
        keys.forEach(function(key) {
          if (key.charAt(0) === '$' || key.charAt(0) === '_') return;
          try {
            var value = obj[key];
            if (typeof value === 'function') return;
            result[key] = self.serialize(value, depth + 1);
          } catch (e) {
            result[key] = '[Error]';
          }
        });
        
        return result;
      } catch (e) {
        return '[Error]';
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
          hook.filteredStores = event.data.payload.stores;
        } else if (event.data.type === 'SET_VALUE') {
          hook.setValue(event.data.payload.storeName, event.data.payload.path, event.data.payload.value);
        }
      } catch (e) {}
    });
  } catch (e) {}

  // Initial detection attempts
  setTimeout(function() { detectExistingMobX(); }, 500);
  setTimeout(function() { detectExistingMobX(); }, 2000);
  
})();
