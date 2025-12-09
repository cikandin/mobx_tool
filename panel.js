// DevTools 패널 메인 로직
(function() {
  'use strict';

  let currentState = {};
  let actions = [];
  let observables = [];
  let connectionPort = null;
  let autoScroll = true;
  let expandedPaths = new Set(); // 펼쳐진 노드 경로 추적

  // 탭 전환
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      // 탭 버튼 활성화
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // 탭 컨텐츠 표시
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      document.getElementById(`${tabName}Tab`).classList.add('active');
    });
  });

  // 상태 새로고침
  document.getElementById('refreshState').addEventListener('click', () => {
    requestState();
  });

  // 상태 내보내기
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

  // 액션 로그 지우기
  document.getElementById('clearActions').addEventListener('click', () => {
    actions = [];
    renderActions();
  });

  // 자동 스크롤 토글
  document.getElementById('autoScroll').addEventListener('change', (e) => {
    autoScroll = e.target.checked;
  });

  // 현재 탭 ID 가져오기 (DevTools API 사용)
  window.currentTabId = chrome.devtools.inspectedWindow.tabId;
  console.log('[MobX DevTools Panel] Inspecting tab:', window.currentTabId);

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
        console.warn('[MobX DevTools Panel] Port disconnected');
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          console.log('[MobX DevTools Panel] Reconnecting... attempt', reconnectAttempts);
          setTimeout(connectToBackground, 1000);
        } else {
          updateStatus(false, '연결이 끊어졌습니다. 페이지를 새로고침하세요.');
        }
      });
      
      reconnectAttempts = 0; // 연결 성공 시 재시도 횟수 초기화
      console.log('[MobX DevTools Panel] Connected to background');
      
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
      console.log('[MobX DevTools Panel] Runtime message:', message.type);
      if (message.type === 'MOBX_MESSAGE') {
        handleMobXMessage(message.payload);
      }
    } catch (error) {
      console.error('[MobX DevTools Panel] Error handling message:', error);
    }
    return true;
  });

  // 페이지로 메시지 전송
  function sendToPage(message) {
    try {
      // 컨텍스트 유효성 확인
      if (!chrome.runtime || !chrome.runtime.id) {
        console.warn('[MobX DevTools] Extension context is invalid');
        return;
      }
      
      // port가 유효한지 확인
      if (!port) {
        console.warn('[MobX DevTools] Port is not connected');
        return;
      }
      
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
      console.error('[MobX DevTools] Error sending message:', error);
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
    console.log('[MobX DevTools Panel] handleMobXMessage:', data.type);
    
    switch (data.type) {
      case 'MOBX_DETECTED':
        updateStatus(true, `MobX v${data.payload.version} 감지됨`);
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
        
        console.log('[MobX DevTools Panel] Received store:', data.payload.name, 
                    '(', Object.keys(pendingStores).length, '/', expectedStoreCount, ')');
        
        // 모든 store를 받았으면 렌더링
        if (Object.keys(pendingStores).length === expectedStoreCount) {
          currentState = pendingStores;
          var time = new Date().toLocaleTimeString();
          document.getElementById('lastUpdate').textContent = `${expectedStoreCount}개 store | ${time}`;
          renderState();
          console.log('[MobX DevTools Panel] All stores received, rendering');
        }
        break;
      
      case 'STATE_UPDATE':
        console.log('[MobX DevTools Panel] STATE_UPDATE received');
        console.log('[MobX DevTools Panel] Store names:', Object.keys(data.payload.state));
        console.log('[MobX DevTools Panel] Full data sample (LocationStore):', data.payload.state.LocationStore);
        
        // 이전 상태와 비교
        if (currentState.LocationStore && data.payload.state.LocationStore) {
          var oldValue = JSON.stringify(currentState.LocationStore);
          var newValue = JSON.stringify(data.payload.state.LocationStore);
          console.log('[MobX DevTools Panel] LocationStore changed:', oldValue !== newValue);
        }
        
        currentState = data.payload.state;
        var storeCount = Object.keys(currentState).length;
        var time = new Date().toLocaleTimeString();
        document.getElementById('lastUpdate').textContent = `${storeCount}개 store | ${time}`;
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
    } catch (error) {
      console.error('[MobX DevTools Panel] Error requesting state:', error);
    }
  }

  // 상태 렌더링
  function renderState() {
    const container = document.getElementById('stateTree');
    if (Object.keys(currentState).length === 0) {
      container.innerHTML = '<div class="empty-state">상태가 없습니다</div>';
      return;
    }
    
    container.innerHTML = '';
    renderTree(container, currentState, 0, '');
  }

  // 트리 렌더링
  function renderTree(container, obj, depth = 0, path = '') {
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
      
      if (typeof obj === 'string') {
        value = `"${obj}"`;
        className = 'tree-string';
      } else if (typeof obj === 'number') {
        className = 'tree-number';
      } else if (typeof obj === 'boolean') {
        className = 'tree-boolean';
      } else if (Array.isArray(obj)) {
        value = `[${obj.length} items]`;
      }
      
      node.innerHTML = `<span class="${className}">${value}</span>`;
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
        
        // 이전에 펼쳐져 있었는지 확인
        const wasExpanded = expandedPaths.has(currentPath);
        toggle.className = wasExpanded ? 'tree-toggle expanded' : 'tree-toggle';
        toggle.textContent = wasExpanded ? '▼' : '▶';
        
        toggle.addEventListener('click', () => {
          const isExpanded = toggle.classList.contains('expanded');
          if (isExpanded) {
            toggle.classList.remove('expanded');
            toggle.textContent = '▶';
            expandedPaths.delete(currentPath); // 경로 제거
            if (node.nextSibling && node.nextSibling.classList.contains('tree-children')) {
              node.nextSibling.remove();
            }
          } else {
            toggle.classList.add('expanded');
            toggle.textContent = '▼';
            expandedPaths.add(currentPath); // 경로 추가
            const children = document.createElement('div');
            children.className = 'tree-children';
            renderTree(children, value, depth + 1, currentPath);
            node.parentNode.insertBefore(children, node.nextSibling);
          }
        });
        
        node.appendChild(toggle);
        
        // innerHTML += 대신 createElement 사용
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = key;
        node.appendChild(keySpan);
        
        node.appendChild(document.createTextNode(': '));
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'tree-value';
        valueSpan.textContent = '{...}';
        node.appendChild(valueSpan);
        
        // 이전에 펼쳐져 있었으면 자동으로 다시 펼치기
        if (wasExpanded) {
          const children = document.createElement('div');
          children.className = 'tree-children';
          renderTree(children, value, depth + 1, currentPath);
          container.appendChild(node);
          container.appendChild(children);
          return; // forEach 계속
        }
      } else {
        // 키 표시
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = key;
        node.appendChild(keySpan);
        
        node.appendChild(document.createTextNode(': '));
        
        // 값 표시
        const valueNode = document.createElement('span');
        if (typeof value === 'string') {
          valueNode.className = 'tree-string';
          valueNode.textContent = `"${value}"`;
        } else if (typeof value === 'number') {
          valueNode.className = 'tree-number';
          valueNode.textContent = value;
        } else if (typeof value === 'boolean') {
          valueNode.className = 'tree-boolean';
          valueNode.textContent = value;
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
        node.appendChild(valueNode);
      }
      
      container.appendChild(node);
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

