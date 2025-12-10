// DevTools Panel Main Logic
(function() {
  'use strict';

  let currentState = {};
  let actions = [];
  let connectionPort = null;
  let autoScroll = true;
  let expandedPaths = new Set();
  let selectedStores = new Set();
  let allStoreNames = [];
  let isEditing = false;
  let editingStoreName = null;
  let selectedAction = null;
  let actionStates = new Map();
  let actionFilter = '';

  function loadSelectedStores() {
    try {
      const saved = localStorage.getItem('mobx-devtools-selected-stores');
      if (saved) {
        selectedStores = new Set(JSON.parse(saved));
      }
    } catch (e) {}
  }
  
  function sendFilterToPage() {
    if (selectedStores.size > 0) {
      sendToPage({
        type: 'SET_FILTER',
        stores: Array.from(selectedStores)
      });
    } else {
      sendToPage({
        type: 'SET_FILTER',
        stores: []
      });
    }
  }

  function saveSelectedStores() {
    try {
      localStorage.setItem('mobx-devtools-selected-stores', JSON.stringify(Array.from(selectedStores)));
      
      if (selectedStores.size > 0) {
        sendToPage({
          type: 'SET_FILTER',
          stores: Array.from(selectedStores)
        });
      } else {
        sendToPage({
          type: 'SET_FILTER',
          stores: []
        });
      }
    } catch (e) {}
  }

  loadSelectedStores();

  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      document.getElementById(`${tabName}Tab`).classList.add('active');
    });
  });

  document.getElementById('refreshState').addEventListener('click', () => {
    requestState();
  });

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

  document.getElementById('toggleStoreFilter').addEventListener('click', () => {
    const filterDiv = document.getElementById('storeFilter');
    if (filterDiv.style.display === 'none') {
      filterDiv.style.display = 'flex';
      renderStoreFilter();
    } else {
      filterDiv.style.display = 'none';
    }
  });

  document.getElementById('clearActions').addEventListener('click', () => {
    actions = [];
    actionStates.clear();
    selectedAction = null;
    renderActions();
    renderActionDetail();
  });
  
  document.getElementById('actionFilter').addEventListener('input', (e) => {
    actionFilter = e.target.value.toLowerCase();
    renderActions();
  });
  
  document.querySelectorAll('.action-detail-tab').forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.detailTab;
      document.querySelectorAll('.action-detail-tab').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      renderActionDetail(tabName);
    });
  });

  window.currentTabId = chrome.devtools.inspectedWindow.tabId;

  let port;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  
  function connectToBackground() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        updateStatus(false, 'Extension has been updated. Please refresh the page.');
        return;
      }
      
      port = chrome.runtime.connect({ name: 'mobx-devtools-panel' });
      
      try {
        port.postMessage({
          type: 'INIT_PANEL',
          tabId: window.currentTabId
        });
      } catch (postError) {
        return;
      }

      port.onMessage.addListener((message) => {
        if (message.type === 'MOBX_MESSAGE') {
          handleMobXMessage(message.payload);
        } else {
          handleMobXMessage(message);
        }
      });
      
      port.onDisconnect.addListener(() => {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          setTimeout(connectToBackground, 1000);
        } else {
          updateStatus(false, 'Connection lost. Please refresh the page.');
        }
      });
      
      reconnectAttempts = 0;
      
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.type === 'MOBX_MESSAGE') {
        handleMobXMessage(message.payload);
      }
    } catch (error) {}
    return true;
  });

  function sendToPage(message) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
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
        updateStatus(false, 'Extension has been updated. Please refresh the page.');
      }
    }
  }

  let pendingStores = {};
  let lastTimestamp = null;
  let expectedStoreCount = 0;
  
  function handleMobXMessage(data) {
    switch (data.type) {
      case 'MOBX_DETECTED':
        updateStatus(true, `MobX v${data.payload.version} detected`);
        sendFilterToPage();
        requestState();
        break;
      
      case 'INITIAL_STATE':
        currentState = data.payload.state;
        renderState();
        break;
      
      case 'STORE_DATA':
        if (lastTimestamp !== data.payload.timestamp) {
          pendingStores = {};
          lastTimestamp = data.payload.timestamp;
          expectedStoreCount = data.payload.total;
        }
        
        pendingStores[data.payload.name] = data.payload.data;
        
        if (Object.keys(pendingStores).length === expectedStoreCount) {
          currentState = pendingStores;
          var time = new Date().toLocaleTimeString();
          document.getElementById('lastUpdate').textContent = `${expectedStoreCount} stores | ${time}`;
          renderState();
        }
        break;
      
      case 'STATE_UPDATE':
        if (!isEditing) {
          const previousState = JSON.parse(JSON.stringify(currentState));
          currentState = data.payload.state;
          
          for (let i = actions.length - 1; i >= 0; i--) {
            const action = actions[i];
            const state = actionStates.get(action.id);
            if (state && !state.after) {
              state.after = JSON.parse(JSON.stringify(currentState));
              
              if (selectedAction && String(selectedAction.id) === String(action.id)) {
                renderActionDetail();
              }
              break;
            }
          }
        }
        
        const newStoreNames = Object.keys(data.payload.state);
        const hasNewStores = newStoreNames.some(name => !allStoreNames.includes(name));
        
        if (hasNewStores) {
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
        const beforeState = JSON.parse(JSON.stringify(currentState));
        
        actions.push(data.payload);
        
        actionStates.set(data.payload.id, {
          before: beforeState,
          after: null
        });
        
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
        const batchBeforeState = JSON.parse(JSON.stringify(currentState));
        data.payload.actions.forEach(action => {
          actionStates.set(action.id, {
            before: batchBeforeState,
            after: null
          });
        });
        
        actions = actions.concat(data.payload.actions);
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
    }
  }

  function requestState() {
    try {
      sendToPage({ type: 'GET_STATE' });
    } catch (error) {}
  }

  function renderStoreFilter() {
    const container = document.getElementById('storeFilter');
    allStoreNames = Object.keys(currentState);
    
    if (allStoreNames.length === 0) {
      container.innerHTML = '<div style="color: #999;">No stores available</div>';
      return;
    }
    
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

  function renderState() {
    const container = document.getElementById('stateTree');
    if (Object.keys(currentState).length === 0) {
      container.innerHTML = '<div class="empty-state">No state available</div>';
      return;
    }
    
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

  function renderTree(container, obj, depth = 0, path = '', storeName = '') {
    if (obj === null || obj === undefined) {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.style.marginLeft = `${depth * 16}px`;
      node.innerHTML = `<span class="tree-null">null</span>`;
      container.appendChild(node);
      return;
    }

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

    const keys = Array.isArray(obj) ? obj.map((_, i) => i) : Object.keys(obj);
    
    keys.forEach(key => {
      const node = document.createElement('div');
      node.className = 'tree-node';
      node.style.marginLeft = `${depth * 16}px`;
      
      const value = obj[key];
      let currentPath;
      if (Array.isArray(obj)) {
        currentPath = path ? `${path}[${key}]` : `[${key}]`;
      } else {
        currentPath = path ? `${path}.${key}` : key;
      }
      const currentStoreName = depth === 0 ? key : storeName;
      const isExpandable = typeof value === 'object' && value !== null;
      
      if (isExpandable) {
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        
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
        
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = Array.isArray(obj) ? `[${key}]` : key;
        node.appendChild(keySpan);
        
        node.appendChild(document.createTextNode(': '));
        
        const valueSpan = document.createElement('span');
        valueSpan.className = 'tree-value';
        valueSpan.textContent = Array.isArray(value) ? `[${value.length} items]` : '{...}';
        node.appendChild(valueSpan);
        
        if (wasExpanded) {
          const children = document.createElement('div');
          children.className = 'tree-children';
          renderTree(children, value, depth + 1, currentPath, currentStoreName);
          container.appendChild(node);
          container.appendChild(children);
          return;
        }
      } else {
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = key;
        node.appendChild(keySpan);
        
        node.appendChild(document.createTextNode(': '));
        
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
        } else if (typeof value === 'object') {
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
  
  function parsePath(path) {
    const parts = [];
    let current = '';
    let i = 0;
    
    while (i < path.length) {
      if (path[i] === '[') {
        if (current) {
          parts.push(current);
          current = '';
        }
        i++;
        let index = '';
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
  }

  function editValue(element, storeName, path, currentValue) {
    isEditing = true;
    editingStoreName = storeName;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'value-editor';
    
    let displayValue = currentValue;
    if (typeof currentValue === 'string') {
      displayValue = currentValue;
    }
    input.value = displayValue;
    
    element.style.display = 'none';
    element.parentNode.insertBefore(input, element);
    input.focus();
    input.select();
    
    let isFinishing = false;
    
    const finishEdit = (save) => {
      if (isFinishing) return;
      isFinishing = true;
      
      if (save && input.value !== displayValue.toString()) {
        try {
          const keys = parsePath(path);
          let target = currentState[storeName];
          
          if (!target) {
            isFinishing = false;
            return;
          }
          
          let startIndex = 0;
          if (keys.length > 0 && keys[0] === storeName) {
            startIndex = 1;
          }
          
          for (let i = startIndex; i < keys.length - 1; i++) {
            if (target === null || target === undefined) {
              isFinishing = false;
              return;
            }
            target = target[keys[i]];
          }
          
          const lastKey = keys[keys.length - 1];
          
          if (target === null || target === undefined) {
            isFinishing = false;
            return;
          }
          
          let newValue = input.value;
          const oldValue = target[lastKey];
          if (typeof oldValue === 'number') {
            newValue = parseFloat(input.value);
            if (isNaN(newValue)) newValue = input.value;
          } else if (typeof oldValue === 'boolean') {
            newValue = input.value === 'true' || input.value === true;
          }
          
          target[lastKey] = newValue;
          
          if (typeof newValue === 'string') {
            element.textContent = `"${newValue}"`;
          } else {
            element.textContent = newValue;
          }
          
          sendToPage({
            type: 'SET_VALUE',
            storeName: storeName,
            path: path,
            value: input.value
          });
        } catch (e) {}
      }
      
      if (input.parentNode) {
        input.remove();
      }
      element.style.display = '';
      
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

  function renderActions() {
    const container = document.getElementById('actionsList');
    
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
    
    container.querySelectorAll('.action-item').forEach(item => {
      item.addEventListener('click', () => {
        const actionId = item.dataset.actionId;
        selectedAction = actions.find(a => String(a.id) === String(actionId));
        renderActions();
        renderActionDetail();
      });
    });
  }
  
  function renderActionDetail(activeTab) {
    const container = document.getElementById('actionDetailContent');
    
    if (!selectedAction) {
      container.innerHTML = '<div class="empty-state">Select an action to view details</div>';
      return;
    }
    
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
  
  function renderActionState(container) {
    const state = actionStates.get(selectedAction.id);
    if (!state || !state.after) {
      container.innerHTML = '<div class="empty-state">No state snapshot available</div>';
      return;
    }
    
    const actionStore = selectedAction.object;
    if (!actionStore) {
      container.innerHTML = '<div class="empty-state">No store information available</div>';
      return;
    }
    
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
  
  function renderActionDiff(container) {
    const state = actionStates.get(selectedAction.id);
    if (!state) {
      container.innerHTML = '<div class="empty-state">No state snapshot available</div>';
      return;
    }
    
    if (!state.before || !state.after) {
      container.innerHTML = '<div class="empty-state">No diff available (before or after state missing)</div>';
      return;
    }
    
    const actionStore = selectedAction.object;
    if (!actionStore) {
      container.innerHTML = '<div class="empty-state">No store information available</div>';
      return;
    }
    
    const beforeStore = state.before[actionStore];
    const afterStore = state.after[actionStore];
    
    const diff = calculateDiff(beforeStore, afterStore, actionStore);
    
    if (diff.length === 0) {
      container.innerHTML = '<div class="empty-state">No changes detected</div>';
      return;
    }
    
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
  
  function calculateDiff(before, after, path = '') {
    const changes = [];
    
    const beforeIsObject = before !== null && before !== undefined && typeof before === 'object' && !Array.isArray(before);
    const afterIsObject = after !== null && after !== undefined && typeof after === 'object' && !Array.isArray(after);
    
    if (!beforeIsObject && !afterIsObject) {
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
    
    if (beforeIsObject && afterIsObject) {
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    
      allKeys.forEach(key => {
        const currentPath = path ? `${path}.${key}` : key;
        const beforeExists = key in before;
        const afterExists = key in after;
        const beforeValue = beforeExists ? before[key] : undefined;
        const afterValue = afterExists ? after[key] : undefined;
        
        if (!beforeExists && afterExists) {
          changes.push({
            path: currentPath,
            type: 'added',
            newValue: afterValue
          });
        } else if (beforeExists && !afterExists) {
          changes.push({
            path: currentPath,
            type: 'removed',
            oldValue: beforeValue
          });
        } else if (beforeExists && afterExists) {
          if (typeof beforeValue === 'object' && beforeValue !== null && typeof afterValue === 'object' && afterValue !== null) {
            if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
              if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
                changes.push({
                  path: currentPath,
                  type: 'modified',
                  oldValue: beforeValue,
                  newValue: afterValue
                });
              }
            } else {
              changes.push(...calculateDiff(beforeValue, afterValue, currentPath));
            }
          } else {
            const beforeStr = beforeValue === undefined ? 'undefined' : JSON.stringify(beforeValue);
            const afterStr = afterValue === undefined ? 'undefined' : JSON.stringify(afterValue);
            
            if (beforeStr !== afterStr) {
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

  function scrollToBottom(elementId) {
    const element = document.getElementById(elementId);
    element.scrollTop = element.scrollHeight;
  }

  updateStatus(false, 'Detecting MobX...');
  
  setTimeout(() => {
    requestState();
  }, 500);
})();
