// DevTools Panel Main Logic
(function() {
  'use strict';

  let currentState = {};
  let actions = [];
  let connectionPort = null;
  let autoScroll = true;
  let expandedPaths = new Set(); // Track expanded node paths
  let selectedStores = new Set(); // Track selected stores for filtering
  let allStoreNames = []; // All available store names
  let isEditing = false; // Track if user is currently editing a value
  let editingStoreName = null; // Track which store is being edited
  let selectedAction = null; // Track selected action
  let actionStates = new Map(); // Store state snapshots for each action
  let actionFilter = ''; // Filter text for actions

  // Load selected stores from localStorage
  function loadSelectedStores() {
    try {
      const saved = localStorage.getItem('mobx-devtools-selected-stores');
      if (saved) {
        selectedStores = new Set(JSON.parse(saved));
      }
    } catch (e) {}
  }
  
  // Send filter to page after connection
  function sendFilterToPage() {
    // Send current filter state to inject.js
    // If no stores selected (default), send empty array to unsubscribe from all actions
    if (selectedStores.size > 0) {
      sendToPage({
        type: 'SET_FILTER',
        stores: Array.from(selectedStores)
      });
    } else {
      // No stores selected - unsubscribe from all actions
      sendToPage({
        type: 'SET_FILTER',
        stores: []
      });
    }
  }

  // Save selected stores to localStorage
  function saveSelectedStores() {
    try {
      localStorage.setItem('mobx-devtools-selected-stores', JSON.stringify(Array.from(selectedStores)));
      
      // Send filter to inject.js
      // If no stores selected, send empty array to unsubscribe from all actions
      if (selectedStores.size > 0) {
        sendToPage({
          type: 'SET_FILTER',
          stores: Array.from(selectedStores)
        });
      } else {
        // No stores selected - unsubscribe from all actions
        sendToPage({
          type: 'SET_FILTER',
          stores: []
        });
      }
    } catch (e) {}
  }

  loadSelectedStores();

  // Tab switching
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      document.getElementById(`${tabName}Tab`).classList.add('active');
    });
  });

  // Refresh state
  document.getElementById('refreshState').addEventListener('click', () => {
    requestState();
  });

  // Export state
  document.getElementById('exportState').addEventListener('click', () => {
    const dataStr = JSON.stringify(currentState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mobx-state-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Toggle store filter
  document.getElementById('toggleStoreFilter').addEventListener('click', () => {
    const filterDiv = document.getElementById('storeFilter');
    if (filterDiv.style.display === 'none') {
      filterDiv.style.display = 'flex';
      renderStoreFilter();
    } else {
      filterDiv.style.display = 'none';
    }
  });

  // Clear action log
  document.getElementById('clearActions').addEventListener('click', () => {
    actions = [];
    actionStates.clear();
    selectedAction = null;
    renderActions();
    renderActionDetail();
  });
  
  // Action filter
  document.getElementById('actionFilter').addEventListener('input', (e) => {
    actionFilter = e.target.value.toLowerCase();
    renderActions();
  });
  
  // Action detail tabs
  document.querySelectorAll('.action-detail-tab').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.detailTab;
      document.querySelectorAll('.action-detail-tab').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      renderActionDetail(tabName);
    });
  });

  // Toggle auto scroll (removed from UI, keeping functionality)
  // autoScroll is now always true by default

  // 현재 탭 ID 가져오기 (DevTools API 사용)
  window.currentTabId = chrome.devtools.inspectedWindow.tabId;

  // Background와 연결
  let port;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  
  function connectToBackground() {
    try {
      // 컨텍스트가 유효한지 확인
      if (!chrome.runtime || !chrome.runtime.id) {
        console.error('[MobX DevTools Panel] Extension context is invalid');
        updateStatus(false, '확장 프로그램이 업데이트되었습니다. 페이지를 새로고침하세요.');
        return;
      }
      
      port = chrome.runtime.connect({ name: 'mobx-devtools-panel' });
      
      // 연결 후 즉시 tabId 전송
      try {
        port.postMessage({
          type: 'INIT_PANEL',
          tabId: window.currentTabId
        });
      } catch (postError) {
        console.error('[MobX DevTools Panel] Error sending INIT_PANEL:', postError);
        return;
      }

      // Port 메시지 리스너
      port.onMessage.addListener((message) => {
        if (message.type === 'MOBX_MESSAGE') {
          handleMobXMessage(message.payload);
        } else {
          handleMobXMessage(message);
        }
      });
      
      // 연결 해제 처리
      port.onDisconnect.addListener(() => {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          setTimeout(connectToBackground, 1000);
        } else {
          updateStatus(false, '연결이 끊어졌습니다. 페이지를 새로고침하세요.');
        }
      });
      
      reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      
      // Send initial filter
      setTimeout(() => {
        sendFilterToPage();
      }, 100);
      
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        updateStatus(false, 'Extension has been updated. Please refresh the page.');
      }
    }
  }
  
  connectToBackground();

  // Chrome 메시지 리스너 (fallback)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.type === 'MOBX_MESSAGE') {
        handleMobXMessage(message.payload);
      }
    } catch (error) {}
    return true;
  });

  // 페이지로 메시지 전송
  function sendToPage(message) {
    try {
      // 컨텍스트 유효성 확인
      if (!chrome.runtime || !chrome.runtime.id) return;
      
      // port가 유효한지 확인
      if (!port) return;
      
      if (window.currentTabId) {
        port.postMessage({
          type: 'SEND_TO_PAGE',
          tabId: window.currentTabId,
          payload: message
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'SEND_TO_PAGE',
          payload: message
        }).catch(() => {});
      }
    } catch (error) {
      if (error.message && error.message.includes('Extension context invalidated')) {
        updateStatus(false, '확장 프로그램이 업데이트되었습니다. 페이지를 새로고침하세요.');
      }
    }
  }

  let pendingStores = {};
  let lastTimestamp = null;
  let expectedStoreCount = 0;
  
  // MobX 메시지 처리
  function handleMobXMessage(data) {
    switch (data.type) {
      case 'MOBX_DETECTED':
        updateStatus(true, `MobX v${data.payload.version} detected`);
        sendFilterToPage(); // Send filter first
        requestState();
        break;
      
      case 'INITIAL_STATE':
        currentState = data.payload.state;
        renderState();
        break;
      
      case 'STORE_DATA':
        // 새로운 타임스탬프면 초기화
        if (lastTimestamp !== data.payload.timestamp) {
          pendingStores = {};
          lastTimestamp = data.payload.timestamp;
          expectedStoreCount = data.payload.total;
        }
        
        // Store 데이터 추가
        pendingStores[data.payload.name] = data.payload.data;
        
        // 모든 store를 받았으면 렌더링
        if (Object.keys(pendingStores).length === expectedStoreCount) {
          currentState = pendingStores;
          var time = new Date().toLocaleTimeString();
          document.getElementById('lastUpdate').textContent = `${expectedStoreCount}개 store | ${time}`;
          renderState();
        }
        break;
      
      case 'STATE_UPDATE':
        // Don't update state completely while editing - just refresh display
        if (!isEditing) {
          const previousState = JSON.parse(JSON.stringify(currentState));
          currentState = data.payload.state;
          
          // Find the most recent action that doesn't have an after state yet
          // This ensures each action gets its own state snapshot
          for (let i = actions.length - 1; i >= 0; i--) {
            const action = actions[i];
            const state = actionStates.get(action.id);
            if (state && !state.after) {
              // This action's after state hasn't been set yet
              // Use currentState (which is the new state after the action) as after
              state.after = JSON.parse(JSON.stringify(currentState));
              
              console.log('[MobX DevTools] Updated after state for action:', {
                actionId: action.id,
                actionName: action.name,
                actionStore: action.object,
                hasAfter: !!state.after,
                afterStoreKeys: state.after ? Object.keys(state.after) : [],
                afterStoreData: state.after && action.object ? state.after[action.object] : null
              });
              
              // Update detail view if this action is selected
              if (selectedAction && String(selectedAction.id) === String(action.id)) {
                renderActionDetail();
              }
              break; // Only update the most recent pending action
            }
          }
        }
        
        // Check for new stores
        const newStoreNames = Object.keys(data.payload.state);
        const hasNewStores = newStoreNames.some(name => !allStoreNames.includes(name));
        
        if (hasNewStores) {
          // Don't auto-add new stores to selection anymore
          // User must manually select them
          
          // Update filter if visible
          const filterDiv = document.getElementById('storeFilter');
          if (filterDiv.style.display !== 'none') {
            renderStoreFilter();
          }
        }
        
        var storeCount = Object.keys(data.payload.state).length;
        var time = new Date().toLocaleTimeString();
        document.getElementById('lastUpdate').textContent = `${storeCount} stores | ${time}`;
        
        if (!isEditing) {
          renderState();
        }
        break;
      
      case 'ACTION':
        // Save current state as before state for this action
        // This captures the state right before this action executes
        const beforeState = JSON.parse(JSON.stringify(currentState));
        
        actions.push(data.payload);
        
        // Save before state for this action
        // after will be set when the next STATE_UPDATE arrives
        actionStates.set(data.payload.id, {
          before: beforeState,
          after: null // Will be updated when STATE_UPDATE arrives
        });
        
        // 액션이 너무 많으면 오래된 것 삭제
        if (actions.length > 200) {
          const removed = actions.slice(0, -100);
          removed.forEach(action => actionStates.delete(action.id));
          actions = actions.slice(-100);
        }
        renderActions();
        if (autoScroll) {
          scrollToBottom('actionsList');
        }
        break;
      
      case 'ACTIONS_BATCH':
        // For batch actions, we don't have before states, so we'll use current state
        const batchBeforeState = JSON.parse(JSON.stringify(currentState));
        data.payload.actions.forEach(action => {
          actionStates.set(action.id, {
            before: batchBeforeState,
            after: null
          });
        });
        
        actions = actions.concat(data.payload.actions);
        // 액션이 너무 많으면 오래된 것 삭제
        if (actions.length > 200) {
          const removed = actions.slice(0, -100);
          removed.forEach(action => actionStates.delete(action.id));
          actions = actions.slice(-100);
        }
        renderActions();
        if (autoScroll) {
          scrollToBottom('actionsList');
        }
        break;
      
      case 'ACTIONS_UPDATE':
        actions = data.payload.actions;
        renderActions();
        break;
        
      default:
        console.log('[MobX DevTools Panel] Unknown message type:', data.type);
    }
  }

  // 상태 요청
  function requestState() {
    try {
      sendToPage({ type: 'GET_STATE' });
    } catch (error) {}
  }

  // Render store filter
  function renderStoreFilter() {
    const container = document.getElementById('storeFilter');
    allStoreNames = Object.keys(currentState);
    
    if (allStoreNames.length === 0) {
      container.innerHTML = '<div style="color: #999;">No stores available</div>';
      return;
    }
    
    // Don't auto-initialize - default is empty (all filters OFF)
    
    container.innerHTML = `
      <div style="margin-bottom: 8px;">
        <button id="selectAllStores" class="btn" style="font-size: 11px; padding: 4px 8px;">Select All</button>
        <button id="deselectAllStores" class="btn" style="font-size: 11px; padding: 4px 8px;">Deselect All</button>
      </div>
    ` + allStoreNames.map(storeName => {
      const checked = selectedStores.has(storeName) ? 'checked' : '';
      return `
        <label>
          <input type="checkbox" value="${storeName}" ${checked} class="store-checkbox">
          ${storeName}
        </label>
      `;
    }).join('');
    
    // Select/Deselect all buttons
    document.getElementById('selectAllStores').addEventListener('click', () => {
      allStoreNames.forEach(name => selectedStores.add(name));
      saveSelectedStores();
      renderStoreFilter();
      renderState();
    });
    
    document.getElementById('deselectAllStores').addEventListener('click', () => {
      selectedStores.clear();
      saveSelectedStores();
      renderStoreFilter();
      renderState();
    });
    
    // Add event listeners
    container.querySelectorAll('.store-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const storeName = e.target.value;
        if (e.target.checked) {
          selectedStores.add(storeName);
        } else {
          selectedStores.delete(storeName);
        }
        saveSelectedStores();
        renderState();
      });
    });
  }

  // Render state (filtered by selected stores)
  function renderState() {
    const container = document.getElementById('stateTree');
    if (Object.keys(currentState).length === 0) {
      container.innerHTML = '<div class="empty-state">No state available</div>';
      return;
    }
    
    // Filter state by selected stores
    // Only show stores that are selected (if none selected, show nothing)
    const filteredState = {};
    Object.keys(currentState).forEach(storeName => {
      if (selectedStores.has(storeName)) {
        filteredState[storeName] = currentState[storeName];
      }
    });
    
    if (Object.keys(filteredState).length === 0) {
      container.innerHTML = '<div class="empty-state">No stores available</div>';
      return;
    }
    
    container.innerHTML = '';
    renderTree(container, filteredState, 0, '');
  }

  // Render tree
  function renderTree(container, obj, depth = 0, path = '', storeName = '') {
    if (obj === null || obj === undefined) {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.style.marginLeft = `${depth * 16}px`;
      node.innerHTML = `<span class="tree-null">null</span>`;
      container.appendChild(node);
      return;
    }

    // Handle primitive values (not objects/arrays)
    if (typeof obj !== 'object' || obj === null) {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.style.marginLeft = `${depth * 16}px`;
      
      let value = obj;
      let className = 'tree-value';
      let editable = false;
      
      if (typeof obj === 'string') {
        value = `"${obj}"`;
        className = 'tree-string';
        editable = true;
      } else if (typeof obj === 'number') {
        className = 'tree-number';
        editable = true;
      } else if (typeof obj === 'boolean') {
        className = 'tree-boolean';
        editable = true;
      }
      
      const valueSpan = document.createElement('span');
      valueSpan.className = className + (editable ? ' editable-value' : '');
      valueSpan.textContent = value;
      
      if (editable && storeName) {
        valueSpan.title = 'Double-click to edit';
        valueSpan.addEventListener('dblclick', () => {
          editValue(valueSpan, storeName, path, obj);
        });
      }
      
      node.appendChild(valueSpan);
      container.appendChild(node);
      return;
    }

    // Handle arrays and objects
    const keys = Array.isArray(obj) ? obj.map((_, i) => i) : Object.keys(obj);
    
    keys.forEach(key => {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.style.marginLeft = `${depth * 16}px`;
      
      const value = obj[key];
      // Build path: for arrays use [index], for objects use .key
      let currentPath;
      if (Array.isArray(obj)) {
        currentPath = path ? `${path}[${key}]` : `[${key}]`;
      } else {
        currentPath = path ? `${path}.${key}` : key;
      }
      // At depth 0, key is the storeName
      const currentStoreName = depth === 0 ? key : storeName;
      const isExpandable = typeof value === 'object' && value !== null;
      
      if (isExpandable) {
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        
        // Check if previously expanded
        const wasExpanded = expandedPaths.has(currentPath);
        toggle.className = wasExpanded ? 'tree-toggle expanded' : 'tree-toggle';
        toggle.textContent = wasExpanded ? '▼' : '▶';
        
        toggle.addEventListener('click', () => {
          const isExpanded = toggle.classList.contains('expanded');
          if (isExpanded) {
            toggle.classList.remove('expanded');
            toggle.textContent = '▶';
            expandedPaths.delete(currentPath);
            if (node.nextSibling && node.nextSibling.classList.contains('tree-children')) {
              node.nextSibling.remove();
            }
          } else {
            toggle.classList.add('expanded');
            toggle.textContent = '▼';
            expandedPaths.add(currentPath);
            const children = document.createElement('div');
            children.className = 'tree-children';
            renderTree(children, value, depth + 1, currentPath, currentStoreName);
            node.parentNode.insertBefore(children, node.nextSibling);
          }
        });
        
        node.appendChild(toggle);
        
        // Use createElement instead of innerHTML +=
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = Array.isArray(obj) ? `[${key}]` : key;
        node.appendChild(keySpan);
        
        node.appendChild(document.createTextNode(': '));
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'tree-value';
        valueSpan.textContent = Array.isArray(value) ? `[${value.length} items]` : '{...}';
        node.appendChild(valueSpan);
        
        // Auto-expand if previously expanded
        if (wasExpanded) {
          const children = document.createElement('div');
          children.className = 'tree-children';
          renderTree(children, value, depth + 1, currentPath, currentStoreName);
          container.appendChild(node);
          container.appendChild(children);
          return;
        }
      } else {
        // Show key
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = key;
        node.appendChild(keySpan);
        
        node.appendChild(document.createTextNode(': '));
        
        // Show value (editable)
        const valueNode = document.createElement('span');
        let editable = false;
        
        if (typeof value === 'string') {
          valueNode.className = 'tree-string';
          valueNode.textContent = `"${value}"`;
          editable = true;
        } else if (typeof value === 'number') {
          valueNode.className = 'tree-number';
          valueNode.textContent = value;
          editable = true;
        } else if (typeof value === 'boolean') {
          valueNode.className = 'tree-boolean';
          valueNode.textContent = value;
          editable = true;
        } else if (value === null) {
          valueNode.className = 'tree-null';
          valueNode.textContent = 'null';
        } else if (Array.isArray(value)) {
          // Array is expandable, handled above
          valueNode.className = 'tree-value';
          valueNode.textContent = `[${value.length} items]`;
        } else if (typeof value === 'object') {
          // Object is expandable, handled above
          valueNode.className = 'tree-value';
          valueNode.textContent = '{...}';
        } else {
          valueNode.className = 'tree-value';
          valueNode.textContent = String(value);
        }
        
        if (editable && currentStoreName) {
          valueNode.classList.add('editable-value');
          valueNode.title = 'Double-click to edit';
          valueNode.addEventListener('dblclick', () => {
            editValue(valueNode, currentStoreName, currentPath, value);
          });
        }
        
        node.appendChild(valueNode);
      }
      
      container.appendChild(node);
    });
  }
  
  // Parse path to handle both object keys and array indices
  // Examples: "user.name" -> ["user", "name"]
  //           "[0].locationName" -> [0, "locationName"]
  //           "items[0].name" -> ["items", 0, "name"]
  function parsePath(path) {
    const parts = [];
    let current = '';
    let i = 0;
    
    while (i < path.length) {
      if (path[i] === '[') {
        // Array index
        if (current) {
          parts.push(current);
          current = '';
        }
        i++; // Skip '['
        let index = '';
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
  }

  // Edit value function
  function editValue(element, storeName, path, currentValue) {
    // Mark as editing
    isEditing = true;
    editingStoreName = storeName;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'value-editor';
    
    // Set initial value (remove quotes for strings)
    let displayValue = currentValue;
    if (typeof currentValue === 'string') {
      displayValue = currentValue;
    }
    input.value = displayValue;
    
    // Replace element with input
    element.style.display = 'none';
    element.parentNode.insertBefore(input, element);
    input.focus();
    input.select();
    
    let isFinishing = false; // Prevent duplicate calls
    
    const finishEdit = (save) => {
      if (isFinishing) return; // Already finishing
      isFinishing = true;
      
      if (save && input.value !== displayValue.toString()) {
        // Update local state immediately
        try {
          const keys = parsePath(path);
          let target = currentState[storeName];
          
          if (!target) {
            console.error('[MobX DevTools] Store not found:', storeName);
            isFinishing = false;
            return;
          }
          
          // If first key matches storeName, remove it (path includes storeName)
          let startIndex = 0;
          if (keys.length > 0 && keys[0] === storeName) {
            startIndex = 1;
          }
          
          // Navigate to parent object
          for (let i = startIndex; i < keys.length - 1; i++) {
            if (target === null || target === undefined) {
              console.error('[MobX DevTools] Invalid path at:', keys.slice(0, i + 1));
              isFinishing = false;
              return;
            }
            target = target[keys[i]];
          }
          
          const lastKey = keys[keys.length - 1];
          
          if (target === null || target === undefined) {
            console.error('[MobX DevTools] Invalid path:', path);
            isFinishing = false;
            return;
          }
          
          // Convert type
          let newValue = input.value;
          const oldValue = target[lastKey];
          if (typeof oldValue === 'number') {
            newValue = parseFloat(input.value);
            if (isNaN(newValue)) newValue = input.value;
          } else if (typeof oldValue === 'boolean') {
            newValue = input.value === 'true' || input.value === true;
          }
          
          target[lastKey] = newValue;
          
          // Update element text immediately
          if (typeof newValue === 'string') {
            element.textContent = `"${newValue}"`;
          } else {
            element.textContent = newValue;
          }
          
          // Send SET_VALUE message to inject.js
          sendToPage({
            type: 'SET_VALUE',
            storeName: storeName,
            path: path,
            value: input.value
          });
        } catch (e) {
          console.error('[MobX DevTools] Failed to update local state:', e);
        }
      }
      
      // Remove input safely
      if (input.parentNode) {
        input.remove();
      }
      element.style.display = '';
      
      // Mark editing as complete
      isEditing = false;
      editingStoreName = null;
    };
    
    input.addEventListener('blur', () => finishEdit(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finishEdit(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finishEdit(false);
      }
    });
  }

  // 액션 렌더링
  function renderActions() {
    const container = document.getElementById('actionsList');
    
    // Filter actions
    let filteredActions = actions;
    if (actionFilter) {
      filteredActions = actions.filter(action => {
        const name = (action.name || '').toLowerCase();
        const store = (action.object || '').toLowerCase();
        return name.includes(actionFilter) || store.includes(actionFilter);
      });
    }
    
    if (filteredActions.length === 0) {
      container.innerHTML = '<div class="empty-state">No actions found</div>';
      return;
    }
    
    container.innerHTML = filteredActions.map(action => {
      const time = action.timestamp ? new Date(action.timestamp).toLocaleTimeString() : '';
      const storeName = action.object ? `<span class="action-store">${action.object}</span>` : '';
      const isSelected = selectedAction && String(selectedAction.id) === String(action.id);
      
      return `
        <div class="action-item ${isSelected ? 'selected' : ''}" data-action-id="${action.id}">
          <div class="action-header">
            <span class="action-name">${action.name || 'Unknown Action'}</span>
            ${storeName}
            <span class="action-time">${time}</span>
          </div>
        </div>
      `;
    }).join('');
    
    // Add click handlers
    container.querySelectorAll('.action-item').forEach(item => {
      item.addEventListener('click', () => {
        const actionId = item.dataset.actionId; // Keep as string since ID is now timestamp-counter
        selectedAction = actions.find(a => String(a.id) === String(actionId));
        renderActions(); // Re-render to update selection
        renderActionDetail();
      });
    });
  }
  
  // Render action detail
  function renderActionDetail(activeTab) {
    const container = document.getElementById('actionDetailContent');
    
    if (!selectedAction) {
      container.innerHTML = '<div class="empty-state">Select an action to view details</div>';
      return;
    }
    
    // Get active tab
    if (!activeTab) {
      const activeTabButton = document.querySelector('.action-detail-tab.active');
      activeTab = activeTabButton ? activeTabButton.dataset.detailTab : 'state';
    }
    
    if (activeTab === 'state') {
      renderActionState(container);
    } else if (activeTab === 'diff') {
      renderActionDiff(container);
    }
  }
  
  // Render action state
  function renderActionState(container) {
    const state = actionStates.get(selectedAction.id);
    if (!state || !state.after) {
      console.log('[MobX DevTools] renderActionState - missing state:', {
        hasState: !!state,
        hasAfter: state ? !!state.after : false,
        actionId: selectedAction.id
      });
      container.innerHTML = '<div class="empty-state">No state snapshot available</div>';
      return;
    }
    
    // Filter by selected action's store
    const actionStore = selectedAction.object;
    if (!actionStore) {
      container.innerHTML = '<div class="empty-state">No store information available</div>';
      return;
    }
    
    console.log('[MobX DevTools] renderActionState:', {
      actionStore,
      afterStateKeys: Object.keys(state.after),
      hasStoreInAfter: actionStore in state.after,
      storeData: state.after[actionStore]
    });
    
    // Only show the store that this action belongs to
    const filteredState = {};
    if (actionStore in state.after) {
      filteredState[actionStore] = state.after[actionStore];
    }
    
    if (Object.keys(filteredState).length === 0) {
      container.innerHTML = '<div class="empty-state">Store not found in state snapshot</div>';
      return;
    }
    
    container.innerHTML = '';
    const stateContainer = document.createElement('div');
    stateContainer.className = 'tree-view';
    renderTree(stateContainer, filteredState, 0, '');
    container.appendChild(stateContainer);
  }
  
  // Render action diff
  function renderActionDiff(container) {
    const state = actionStates.get(selectedAction.id);
    if (!state) {
      container.innerHTML = '<div class="empty-state">No state snapshot available</div>';
      return;
    }
    
    if (!state.before || !state.after) {
      console.log('[MobX DevTools] Missing before/after state:', {
        hasBefore: !!state.before,
        hasAfter: !!state.after,
        actionId: selectedAction.id
      });
      container.innerHTML = '<div class="empty-state">No diff available (before or after state missing)</div>';
      return;
    }
    
    // Filter by selected action's store
    const actionStore = selectedAction.object;
    if (!actionStore) {
      container.innerHTML = '<div class="empty-state">No store information available</div>';
      return;
    }
    
    // Only compare the store that this action belongs to
    const beforeStore = state.before[actionStore];
    const afterStore = state.after[actionStore];
    
    console.log('[MobX DevTools] Calculating diff for store:', {
      actionStore,
      hasBeforeStore: beforeStore !== undefined,
      hasAfterStore: afterStore !== undefined,
      beforeStore,
      afterStore
    });
    
    // Calculate diff only for this store
    // Pass undefined if store doesn't exist (not empty object)
    const diff = calculateDiff(beforeStore, afterStore, actionStore);
    
    console.log('[MobX DevTools] Diff result:', diff);
    
    if (diff.length === 0) {
      container.innerHTML = '<div class="empty-state">No changes detected</div>';
      return;
    }
    
    // Helper function to safely stringify values including undefined/false
    const safeStringify = (value) => {
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (typeof value === 'boolean') return String(value);
      if (typeof value === 'string') return JSON.stringify(value);
      return JSON.stringify(value);
    };
    
    container.innerHTML = diff.map(change => {
      return `
        <div style="padding: 8px; margin-bottom: 4px; border-left: 3px solid ${change.type === 'added' ? '#4caf50' : change.type === 'removed' ? '#f44336' : '#ff9800'}; background: #f9f9f9;">
          <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${change.path}</div>
          ${change.type === 'removed' ? `<div style="color: #f44336;">- ${safeStringify(change.oldValue)}</div>` : ''}
          ${change.type === 'added' ? `<div style="color: #4caf50;">+ ${safeStringify(change.newValue)}</div>` : ''}
          ${change.type === 'modified' ? `
            <div style="color: #f44336;">- ${safeStringify(change.oldValue)}</div>
            <div style="color: #4caf50;">+ ${safeStringify(change.newValue)}</div>
          ` : ''}
        </div>
      `;
    }).join('');
  }
  
  // Calculate diff between two states
  function calculateDiff(before, after, path = '') {
    const changes = [];
    
    // Handle null/undefined cases - but keep them as undefined for comparison
    // Don't convert to empty object, as that would hide the fact that they don't exist
    const beforeIsObject = before !== null && before !== undefined && typeof before === 'object' && !Array.isArray(before);
    const afterIsObject = after !== null && after !== undefined && typeof after === 'object' && !Array.isArray(after);
    
    // Handle cases where one or both are not objects
    if (!beforeIsObject && !afterIsObject) {
      // Both are primitives, null, or undefined - compare directly
      const beforeStr = before === undefined ? 'undefined' : (before === null ? 'null' : JSON.stringify(before));
      const afterStr = after === undefined ? 'undefined' : (after === null ? 'null' : JSON.stringify(after));
      
      if (beforeStr !== afterStr) {
        changes.push({
          path: path || 'root',
          type: 'modified',
          oldValue: before,
          newValue: after
        });
      }
      return changes;
    }
    
    // One is object, one is not - treat as complete replacement
    if (beforeIsObject && !afterIsObject) {
      changes.push({
        path: path || 'root',
        type: 'modified',
        oldValue: before,
        newValue: after
      });
      return changes;
    }
    
    if (!beforeIsObject && afterIsObject) {
      changes.push({
        path: path || 'root',
        type: 'modified',
        oldValue: before,
        newValue: after
      });
      return changes;
    }
    
    // Both are objects - compare their keys
    if (beforeIsObject && afterIsObject) {
      // Get all keys from both objects
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    
      allKeys.forEach(key => {
        const currentPath = path ? `${path}.${key}` : key;
        // Use 'in' operator to check existence, then get value (handles undefined/false correctly)
        const beforeExists = key in before;
        const afterExists = key in after;
        const beforeValue = beforeExists ? before[key] : undefined;
        const afterValue = afterExists ? after[key] : undefined;
        
        if (!beforeExists && afterExists) {
          // Added (including false/undefined -> value)
          changes.push({
            path: currentPath,
            type: 'added',
            newValue: afterValue
          });
        } else if (beforeExists && !afterExists) {
          // Removed
          changes.push({
            path: currentPath,
            type: 'removed',
            oldValue: beforeValue
          });
        } else if (beforeExists && afterExists) {
          // Both exist - check if changed
          // Handle objects and arrays
          if (typeof beforeValue === 'object' && beforeValue !== null && typeof afterValue === 'object' && afterValue !== null) {
            if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
              // Handle arrays - compare length and elements
              if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
                changes.push({
                  path: currentPath,
                  type: 'modified',
                  oldValue: beforeValue,
                  newValue: afterValue
                });
              }
            } else {
              // Recursively check nested objects
              changes.push(...calculateDiff(beforeValue, afterValue, currentPath));
            }
          } else {
            // Primitive values - use deep equality check that handles undefined/false
            const beforeStr = beforeValue === undefined ? 'undefined' : JSON.stringify(beforeValue);
            const afterStr = afterValue === undefined ? 'undefined' : JSON.stringify(afterValue);
            
            if (beforeStr !== afterStr) {
              // Modified (including false/undefined -> value, value -> false/undefined)
              changes.push({
                path: currentPath,
                type: 'modified',
                oldValue: beforeValue,
                newValue: afterValue
              });
            }
          }
        }
      });
    }
    
    return changes;
  }

  // 상태 업데이트
  function updateStatus(connected, text) {
    const indicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    if (connected) {
      indicator.classList.add('connected');
      indicator.classList.remove('disconnected');
    } else {
      indicator.classList.add('disconnected');
      indicator.classList.remove('connected');
    }
    
    statusText.textContent = text;
  }

  // 스크롤 하단으로
  function scrollToBottom(elementId) {
    const element = document.getElementById(elementId);
    element.scrollTop = element.scrollHeight;
  }

  // 초기화
  updateStatus(false, 'MobX 감지 중...');
  
  // 초기 상태 요청 (1회만)
  setTimeout(() => {
    requestState();
  }, 500);
})();

