// State Panel - State tab rendering and editing

(function() {
  'use strict';

  const { parsePath } = window.MobXDevToolsUtils;
  const state = window.MobXDevToolsState;

  /**
   * Render store filter UI
   */
  function renderStoreFilter() {
    const container = document.getElementById('storeFilter');
    state.allStoreNames = Object.keys(state.currentState);
    
    if (state.allStoreNames.length === 0) {
      container.innerHTML = '<div style="color: #999;">No stores available</div>';
      return;
    }
    
    container.innerHTML = `
      <div style="margin-bottom: 8px;">
        <button id="selectAllStores" class="btn" style="font-size: 11px; padding: 4px 8px;">Select All</button>
        <button id="deselectAllStores" class="btn" style="font-size: 11px; padding: 4px 8px;">Deselect All</button>
      </div>
    ` + state.allStoreNames.map(storeName => {
      const checked = state.selectedStores.has(storeName) ? 'checked' : '';
      return `
        <label>
          <input type="checkbox" value="${storeName}" ${checked} class="store-checkbox">
          ${storeName}
        </label>
      `;
    }).join('');
    
    document.getElementById('selectAllStores').addEventListener('click', () => {
      state.allStoreNames.forEach(name => state.selectedStores.add(name));
      saveSelectedStores();
      renderStoreFilter();
      renderState();
    });
    
    document.getElementById('deselectAllStores').addEventListener('click', () => {
      state.selectedStores.clear();
      saveSelectedStores();
      renderStoreFilter();
      renderState();
    });
    
    container.querySelectorAll('.store-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const storeName = e.target.value;
        if (e.target.checked) {
          state.selectedStores.add(storeName);
        } else {
          state.selectedStores.delete(storeName);
        }
        saveSelectedStores();
        renderState();
      });
    });
  }

  /**
   * Save selected stores to localStorage and send filter to page
   */
  function saveSelectedStores() {
    try {
      localStorage.setItem('mobx-devtools-selected-stores', JSON.stringify(Array.from(state.selectedStores)));
      
      if (state.selectedStores.size > 0) {
        window.MobXDevToolsConnection.sendToPage({
          type: 'SET_FILTER',
          stores: Array.from(state.selectedStores)
        });
      } else {
        window.MobXDevToolsConnection.sendToPage({
          type: 'SET_FILTER',
          stores: []
        });
      }
    } catch (e) {}
  }

  /**
   * Load selected stores from localStorage
   */
  function loadSelectedStores() {
    try {
      const saved = localStorage.getItem('mobx-devtools-selected-stores');
      if (saved) {
        state.selectedStores = new Set(JSON.parse(saved));
      }
    } catch (e) {}
  }

  /**
   * Render state tree (filtered by selected stores)
   */
  function renderState() {
    const container = document.getElementById('stateTree');
    if (Object.keys(state.currentState).length === 0) {
      container.innerHTML = '<div class="empty-state">No state available</div>';
      return;
    }
    
    const filteredState = {};
    Object.keys(state.currentState).forEach(storeName => {
      if (state.selectedStores.has(storeName)) {
        filteredState[storeName] = state.currentState[storeName];
      }
    });
    
    if (Object.keys(filteredState).length === 0) {
      container.innerHTML = '<div class="empty-state">No stores available</div>';
      return;
    }
    
    container.innerHTML = '';
    renderTree(container, filteredState, 0, '');
  }

  /**
   * Render tree recursively
   */
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
        
        const wasExpanded = state.expandedPaths.has(currentPath);
        toggle.className = wasExpanded ? 'tree-toggle expanded' : 'tree-toggle';
        toggle.textContent = wasExpanded ? '▼' : '▶';
        
        toggle.addEventListener('click', () => {
          const isExpanded = toggle.classList.contains('expanded');
          if (isExpanded) {
            toggle.classList.remove('expanded');
            toggle.textContent = '▶';
            state.expandedPaths.delete(currentPath);
            if (node.nextSibling && node.nextSibling.classList.contains('tree-children')) {
              node.nextSibling.remove();
            }
          } else {
            toggle.classList.add('expanded');
            toggle.textContent = '▼';
            state.expandedPaths.add(currentPath);
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

  /**
   * Edit value inline
   */
  function editValue(element, storeName, path, currentValue) {
    state.isEditing = true;
    state.editingStoreName = storeName;
    
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
          let target = state.currentState[storeName];
          
          if (!target) {
            console.error('[MobX DevTools] Store not found:', storeName);
            isFinishing = false;
            return;
          }
          
          let startIndex = 0;
          if (keys.length > 0 && keys[0] === storeName) {
            startIndex = 1;
          }
          
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
          
          window.MobXDevToolsConnection.sendToPage({
            type: 'SET_VALUE',
            storeName: storeName,
            path: path,
            value: input.value
          });
        } catch (e) {
          console.error('[MobX DevTools] Failed to update local state:', e);
        }
      }
      
      if (input.parentNode) {
        input.remove();
      }
      element.style.display = '';
      
      state.isEditing = false;
      state.editingStoreName = null;
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

  // Export functions
  window.MobXDevToolsStatePanel = {
    renderStoreFilter,
    saveSelectedStores,
    loadSelectedStores,
    renderState,
    renderTree,
    editValue
  };
})();

