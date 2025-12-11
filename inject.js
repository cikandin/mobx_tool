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
    } catch (e) {}
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
    sourceCache: {},
    
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
    
    // Resolve relative URL to absolute URL
    resolveUrl: function(url) {
      if (!url) return url;
      
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      
      if (url.startsWith('...')) {
        url = url.substring(3);
      }
      
      if (url.startsWith('./')) {
        url = url.substring(2);
      }
      
      var baseUrl = window.location.origin;
      
      if (!url.startsWith('/')) {
        url = '/src/' + url;
      }
      
      return baseUrl + url;
    },
    
    // Fetch source code for a file URL
    fetchSourceCode: function(fileUrl, lineNumber, callback) {
      var self = this;
      var resolvedUrl = self.resolveUrl(fileUrl);
      var cacheKey = resolvedUrl;
      
      if (self.sourceCache[cacheKey]) {
        callback(self.extractLines(self.sourceCache[cacheKey], lineNumber));
        return;
      }
      
      fetch(resolvedUrl)
        .then(function(response) {
          if (!response.ok) throw new Error('Not found');
          return response.text();
        })
        .then(function(source) {
          // Check if response is HTML (404 fallback to index.html)
          if (source.trim().startsWith('<!') || source.trim().startsWith('<html') || source.trim().startsWith('<script')) {
            callback(null);
            return;
          }
          self.sourceCache[cacheKey] = source;
          callback(self.extractLines(source, lineNumber));
        })
        .catch(function() {
          callback(null);
        });
    },
    
    // Extract lines around target line (±3 lines)
    extractLines: function(source, lineNumber) {
      var lines = source.split('\n');
      var start = Math.max(0, lineNumber - 4);
      var end = Math.min(lines.length, lineNumber + 3);
      
      var result = [];
      for (var i = start; i < end; i++) {
        result.push({
          lineNumber: i + 1,
          code: lines[i],
          isTarget: (i + 1) === lineNumber
        });
      }
      return result;
    },
    
    // Parse stack trace string into frames
    parseStackFrames: function(stackTrace) {
      var frames = [];
      var lines = stackTrace.split('\n').filter(function(l) { return l.trim(); });
      
      lines.forEach(function(line) {
        line = line.trim();
        var match = line.match(/^at\s+(?:async\s+)?(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?$/);
        if (match) {
          frames.push({
            function: match[1] || 'anonymous',
            file: match[2],
            line: parseInt(match[3], 10),
            column: parseInt(match[4], 10)
          });
        }
      });
      return frames;
    },
    
    // Map stack trace using source maps (async)
    mapStackTrace: function(rawStack, callback) {
      if (typeof window.sourceMappedStackTrace !== 'undefined' && 
          typeof window.sourceMappedStackTrace.mapStackTrace === 'function') {
        try {
          window.sourceMappedStackTrace.mapStackTrace(rawStack, function(mappedStack) {
            if (mappedStack && mappedStack.length > 0) {
              callback(mappedStack.join('\n'));
            } else {
              callback(rawStack);
            }
          }, { cacheGlobally: true });
        } catch (e) {
          callback(rawStack);
        }
      } else {
        callback(rawStack);
      }
    },
    
    // Fetch source code for stack frames (async)
    fetchStackSources: function(stackTrace, callback) {
      var self = this;
      var frames = self.parseStackFrames(stackTrace);
      var pending = frames.length;
      var results = [];
      
      if (pending === 0) {
        callback([]);
        return;
      }
      
      frames.forEach(function(frame, idx) {
        if (frame.file && (frame.file.indexOf('http') === 0 || frame.file.indexOf('/src/') !== -1)) {
          self.fetchSourceCode(frame.file, frame.line, function(sourceLines) {
            results[idx] = { frame: frame, sourceLines: sourceLines };
            pending--;
            if (pending === 0) callback(results.filter(Boolean));
          });
        } else {
          results[idx] = { frame: frame, sourceLines: null };
          pending--;
          if (pending === 0) callback(results.filter(Boolean));
        }
      });
    },
    
    // Send action with its changes
    sendAction: function(action) {
      var self = this;
      var shouldSend = action.isFiltered || action.changes.length > 0;
      
      if (shouldSend) {
        var rawStack = action.stackTrace || '';
        
        self.mapStackTrace(rawStack, function(mappedStack) {
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
    
    // Handle request for source code (lazy loading)
    handleSourceRequest: function(actionId, stackTrace) {
      var self = this;
      self.fetchStackSources(stackTrace, function(stackWithSource) {
        safeSend('STACK_SOURCE', {
          actionId: actionId,
          stackWithSource: stackWithSource
        });
      });
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
              
              // Capture stack trace
              var stackTrace = '';
              try {
                throw new Error();
              } catch (e) {
                stackTrace = e.stack || '';
                var lines = stackTrace.split('\n');
                var filteredLines = lines.filter(function(line, idx) {
                  if (idx === 0 && line.indexOf('Error') !== -1) return false;
                  if (line.indexOf('/mobx.') !== -1) return false;
                  if (line.indexOf('/mobx/') !== -1) return false;
                  if (line.indexOf('chunk-DQOE5FNA') !== -1) return false;
                  if (line.indexOf('inject.js') !== -1) return false;
                  if (line.indexOf('executeAction') !== -1) return false;
                  if (line.indexOf('_startAction') !== -1) return false;
                  if (line.indexOf('spyReport') !== -1) return false;
                  return true;
                });
                stackTrace = filteredLines.join('\n');
              }
              
              // Serialize arguments
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
        // Send max 50 actions
        var actionsToSend = self.actionQueue.slice(-50);
        self.actionQueue = [];
        
        actionsToSend.forEach(function(action) {
          safeSend('ACTION', action);
        });
        
        // Update state after actions
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
    
    // Parse path for array indices
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
    
    // Set value in observable store
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
    
    // Serialize observable values
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
        } else if (event.data.type === 'GET_STACK_SOURCE') {
          hook.handleSourceRequest(event.data.payload.actionId, event.data.payload.stackTrace);
        } else if (event.data.type === 'GET_SINGLE_SOURCE') {
          var payload = event.data.payload;
          var frameIdx = payload.frameIdx;
          var stackTrace = payload.stackTrace;
          
          var frames = hook.parseStackFrames(stackTrace);
          
          if (frameIdx >= 0 && frameIdx < frames.length) {
            var frame = frames[frameIdx];
            
            // Only fetch if we have a proper path (http URL or path with /)
            var hasProperPath = frame.file && (
              frame.file.indexOf('http://') === 0 || 
              frame.file.indexOf('https://') === 0 || 
              frame.file.indexOf('/') !== -1
            );
            
            if (hasProperPath) {
              hook.fetchSourceCode(frame.file, frame.line, function(sourceLines) {
                safeSend('SINGLE_FRAME_SOURCE', {
                  actionId: payload.actionId,
                  frameIdx: frameIdx,
                  sourceLines: sourceLines,
                  frame: frame
                });
              });
            } else {
              safeSend('SINGLE_FRAME_SOURCE', {
                actionId: payload.actionId,
                frameIdx: frameIdx,
                sourceLines: null,
                frame: frame
              });
            }
          } else {
            safeSend('SINGLE_FRAME_SOURCE', {
              actionId: payload.actionId,
              frameIdx: frameIdx,
              sourceLines: null,
              frame: null
            });
          }
        }
      } catch (e) {}
    });
  } catch (e) {}

  // Initial detection attempts
  setTimeout(function() { detectExistingMobX(); }, 500);
  setTimeout(function() { detectExistingMobX(); }, 2000);
  
})();
