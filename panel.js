// DevTools Panel Main Logic
(function() {
  'use strict';

  let currentState = {};
  let actions = [];
  let observables = [];
  let connectionPort = null;
  let autoScroll = true;
  let expandedPaths = new Set(); // Track expanded node paths
  let selectedStores = new Set(); // Track selected stores for filtering
  let allStoreNames = []; // All available store names

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
    if (selectedStores.size > 0) {
      sendToPage({
        type: 'SET_FILTER',
        stores: Array.from(selectedStores)
      });
    }
  }

  // Save selected stores to localStorage
  function saveSelectedStores() {
    try {
      localStorage.setItem('mobx-devtools-selected-stores', JSON.stringify(Array.from(selectedStores)));
      
      // Send filter to inject.js
      sendToPage({
        type: 'SET_FILTER',
        stores: Array.from(selectedStores)
      });
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
    renderActions();
  });

  // Toggle auto scroll
  document.getElementById('autoScroll').addEventListener('change', (e) => {
    autoScroll = e.target.checked;
  });

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
        console.log('[MobX DevTools Panel] Received message:', message.type);
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
      
      reconnectAttempts = 0; // 연결 성공 시 재시도 횟수 초기화
      
    } catch (error) {
      console.error('[MobX DevTools Panel] Connection error:', error);
      if (error.message.includes('Extension context invalidated')) {
        updateStatus(false, '확장 프로그램이 업데이트되었습니다. 페이지를 새로고침하세요.');
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
        currentState = data.payload.state;
        
        // Check for new stores
        const newStoreNames = Object.keys(currentState);
        const hasNewStores = newStoreNames.some(name => !allStoreNames.includes(name));
        
        if (hasNewStores) {
          // Add new stores to selectedStores by default
          newStoreNames.forEach(name => {
            if (!allStoreNames.includes(name)) {
              selectedStores.add(name);
            }
          });
          saveSelectedStores();
          
          // Update filter if visible
          const filterDiv = document.getElementById('storeFilter');
          if (filterDiv.style.display !== 'none') {
            renderStoreFilter();
          }
        }
        
        var storeCount = Object.keys(currentState).length;
        var time = new Date().toLocaleTimeString();
        document.getElementById('lastUpdate').textContent = `${storeCount} stores | ${time}`;
        renderState();
        break;
      
      case 'ACTION':
        console.log('[MobX DevTools Panel] ACTION received:', data.payload);
        actions.push(data.payload);
        // 액션이 너무 많으면 오래된 것 삭제
        if (actions.length > 200) {
          actions = actions.slice(-100);
        }
        renderActions();
        if (autoScroll) {
          scrollToBottom('actionsList');
        }
        break;
      
      case 'ACTIONS_BATCH':
        console.log('[MobX DevTools Panel] ACTIONS_BATCH received:', data.payload.actions.length);
        actions = actions.concat(data.payload.actions);
        // 액션이 너무 많으면 오래된 것 삭제
        if (actions.length > 200) {
          actions = actions.slice(-100);
        }
        renderActions();
        if (autoScroll) {
          scrollToBottom('actionsList');
        }
        break;
      
      case 'OBSERVABLE_UPDATE':
        addObservableUpdate(data.payload);
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
    
    // Initialize selectedStores if empty
    if (selectedStores.size === 0) {
      allStoreNames.forEach(name => selectedStores.add(name));
    }
    
    container.innerHTML = allStoreNames.map(storeName => {
      const checked = selectedStores.has(storeName) ? 'checked' : '';
      return `
        <label>
          <input type="checkbox" value="${storeName}" ${checked} class="store-checkbox">
          ${storeName}
        </label>
      `;
    }).join('');
    
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
    const filteredState = {};
    Object.keys(currentState).forEach(storeName => {
      if (selectedStores.size === 0 || selectedStores.has(storeName)) {
        filteredState[storeName] = currentState[storeName];
      }
    });
    
    if (Object.keys(filteredState).length === 0) {
      container.innerHTML = '<div class="empty-state">No stores selected</div>';
      return;
    }
    
    container.innerHTML = '';
    renderTree(container, filteredState, 0, '');
  }

  // Render tree
  function renderTree(container, obj, depth = 0, path = '', storeName = '') {
    // Extract store name from path if at top level
    if (depth === 0 && !storeName) {
      Object.keys(obj).forEach(key => {
        renderTree(container, obj[key], 1, key, key);
      });
      return;
    }
    if (obj === null || obj === undefined) {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.style.marginLeft = `${depth * 16}px`;
      node.innerHTML = `<span class="tree-null">null</span>`;
      container.appendChild(node);
      return;
    }

    if (typeof obj !== 'object' || Array.isArray(obj)) {
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
      } else if (Array.isArray(obj)) {
        value = `[${obj.length} items]`;
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

    Object.keys(obj).forEach(key => {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.style.marginLeft = `${depth * 16}px`;
      
      const value = obj[key];
      const currentPath = path ? `${path}.${key}` : key;
      const isExpandable = typeof value === 'object' && value !== null && !Array.isArray(value);
      
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
            renderTree(children, value, depth + 1, currentPath, storeName);
            node.parentNode.insertBefore(children, node.nextSibling);
          }
        });
        
        node.appendChild(toggle);
        
        // Use createElement instead of innerHTML +=
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = key;
        node.appendChild(keySpan);
        
        node.appendChild(document.createTextNode(': '));
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'tree-value';
        valueSpan.textContent = '{...}';
        node.appendChild(valueSpan);
        
        // Auto-expand if previously expanded
        if (wasExpanded) {
          const children = document.createElement('div');
          children.className = 'tree-children';
          renderTree(children, value, depth + 1, currentPath, storeName);
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
          valueNode.className = 'tree-value';
          valueNode.textContent = `[${value.length} items]`;
        } else {
          valueNode.className = 'tree-value';
          valueNode.textContent = String(value);
        }
        
        if (editable && storeName) {
          valueNode.classList.add('editable-value');
          valueNode.title = 'Double-click to edit';
          valueNode.addEventListener('dblclick', () => {
            editValue(valueNode, storeName, currentPath, value);
          });
        }
        
        node.appendChild(valueNode);
      }
      
      container.appendChild(node);
    });
  }
  
  // Edit value function
  function editValue(element, storeName, path, currentValue) {
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
    
    const finishEdit = (save) => {
      if (save && input.value !== displayValue.toString()) {
        // Send SET_VALUE message to inject.js
        sendToPage({
          type: 'SET_VALUE',
          storeName: storeName,
          path: path,
          value: input.value
        });
      }
      
      input.remove();
      element.style.display = '';
    };
    
    input.addEventListener('blur', () => finishEdit(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEdit(true);
      } else if (e.key === 'Escape') {
        finishEdit(false);
      }
    });
  }

  // 액션 렌더링
  function renderActions() {
    const container = document.getElementById('actionsList');
    if (actions.length === 0) {
      container.innerHTML = '<div class="empty-state">액션이 없습니다</div>';
      return;
    }
    
    container.innerHTML = actions.map(action => {
      const time = action.timestamp ? new Date(action.timestamp).toLocaleTimeString() : '';
      const storeName = action.object ? `<span class="action-store">${action.object}</span>` : '';
      
      return `
        <div class="action-item">
          <div class="action-header">
            <span class="action-name">${action.name || 'Unknown Action'}</span>
            ${storeName}
            <span class="action-time">${time}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Observable 업데이트 추가
  function addObservableUpdate(update) {
    observables.unshift({
      ...update,
      id: observables.length
    });
    
    // 최대 100개만 유지
    if (observables.length > 100) {
      observables = observables.slice(0, 100);
    }
    
    renderObservables();
  }

  // Observables 렌더링
  function renderObservables() {
    const container = document.getElementById('observablesList');
    if (observables.length === 0) {
      container.innerHTML = '<div class="empty-state">Observable 변경사항이 없습니다</div>';
      return;
    }
    
    container.innerHTML = observables.map(obs => {
      const time = new Date(obs.timestamp).toLocaleTimeString();
      return `
        <div class="observable-item">
          <div class="observable-header">
            <span class="observable-name">${obs.name || 'Unknown'}</span>
            <span class="action-time">${time}</span>
          </div>
          <div class="action-args">
            Type: ${obs.type}<br>
            ${obs.oldValue !== undefined ? `Old: ${JSON.stringify(obs.oldValue)}<br>` : ''}
            ${obs.newValue !== undefined ? `New: ${JSON.stringify(obs.newValue)}` : ''}
          </div>
        </div>
      `;
    }).join('');
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
  
  // 주기적으로 상태 확인
  setInterval(() => {
    requestState();
  }, 2000);
})();

