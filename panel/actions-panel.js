// Actions Panel - Actions tab, list, detail, and diff

(function() {
  'use strict';

  const { calculateDiff, safeStringify, scrollToBottom } = window.MobXDevToolsUtils;
  const state = window.MobXDevToolsState;

  /**
   * Render actions list
   */
  function renderActions() {
    const container = document.getElementById('actionsList');
    
    let filteredActions = state.actions;
    if (state.actionFilter) {
      filteredActions = state.actions.filter(action => {
        const name = (action.name || '').toLowerCase();
        const store = (action.object || '').toLowerCase();
        return name.includes(state.actionFilter) || store.includes(state.actionFilter);
      });
    }
    
    if (filteredActions.length === 0) {
      container.innerHTML = '<div class="empty-state">No actions found</div>';
      return;
    }
    
    container.innerHTML = filteredActions.map(action => {
      const time = action.timestamp ? new Date(action.timestamp).toLocaleTimeString() : '';
      const isSelected = state.selectedAction && String(state.selectedAction.id) === String(action.id);
      
      return `
        <div class="action-item ${isSelected ? 'selected' : ''}" data-action-id="${action.id}">
          ${action.object ? `<div class="action-store-line">${action.object}</div>` : ''}
          <div class="action-header">
            <span class="action-name">${action.name || 'Unknown Action'}</span>
            <span class="action-time">${time}</span>
          </div>
        </div>
      `;
    }).join('');
    
    container.querySelectorAll('.action-item').forEach(item => {
      item.addEventListener('click', () => {
        const actionId = item.dataset.actionId;
        state.selectedAction = state.actions.find(a => String(a.id) === String(actionId));
        renderActions();
        renderActionDetail();
      });
    });
  }

  /**
   * Render action detail (State, Diff, or Trace tab)
   */
  function renderActionDetail(activeTab) {
    const container = document.getElementById('actionDetailContent');
    
    if (!state.selectedAction) {
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
    } else if (activeTab === 'trace') {
      renderActionTrace(container);
    }
  }

  /**
   * Render action state - shows current state of affected store
   */
  function renderActionState(container) {
    const actionStore = state.selectedAction.object;
    if (!actionStore) {
      container.innerHTML = '<div class="empty-state">No store information available</div>';
      return;
    }
    
    const storeData = state.currentState[actionStore];
    if (!storeData) {
      container.innerHTML = '<div class="empty-state">Store not found: ' + actionStore + '</div>';
      return;
    }
    
    container.innerHTML = '';
    const stateContainer = document.createElement('div');
    stateContainer.className = 'tree-view';
    
    const filteredState = {};
    filteredState[actionStore] = storeData;
    window.MobXDevToolsStatePanel.renderTree(stateContainer, filteredState, 0, '');
    container.appendChild(stateContainer);
  }

  /**
   * Render action diff
   */
  function renderActionDiff(container) {
    const actionState = state.actionStates.get(state.selectedAction.id);
    if (!actionState) {
      container.innerHTML = '<div class="empty-state">No state snapshot available</div>';
      return;
    }
    
    // Use tracked changes directly
    if (actionState.changes) {
      if (actionState.changes.length === 0) {
        container.innerHTML = '<div class="empty-state">No changes detected</div>';
        return;
      }
      
      container.innerHTML = actionState.changes.map(change => {
        const changeType = change.type === 'update' ? 'modified' : change.type;
        const pathInfo = change.store ? `${change.store}.${change.name}` : (change.name || 'unknown');
        const kindBadge = change.observableKind && change.observableKind !== 'unknown' 
          ? `<span class="change-kind">${change.observableKind}</span>` : '';
        
        return `
          <div class="diff-item diff-${changeType}">
            <div class="diff-path">${pathInfo} ${kindBadge}</div>
            ${change.type === 'delete' ? `<div class="diff-removed">- ${safeStringify(change.oldValue)}</div>` : ''}
            ${change.type === 'add' ? `<div class="diff-added">+ ${safeStringify(change.newValue)}</div>` : ''}
            ${change.type === 'update' ? `
              <div class="diff-removed">- ${safeStringify(change.oldValue)}</div>
              <div class="diff-added">+ ${safeStringify(change.newValue)}</div>
            ` : ''}
          </div>
        `;
      }).join('');
      return;
    }
    
    // Legacy format: use before/after state comparison
    if (!actionState.before || !actionState.after) {
      container.innerHTML = '<div class="empty-state">No diff available</div>';
      return;
    }
    
    const actionStore = state.selectedAction.object;
    if (!actionStore) {
      container.innerHTML = '<div class="empty-state">No store information available</div>';
      return;
    }
    
    const beforeStore = actionState.before[actionStore];
    const afterStore = actionState.after[actionStore];
    
    const diff = calculateDiff(beforeStore, afterStore, actionStore);
    
    if (diff.length === 0) {
      container.innerHTML = '<div class="empty-state">No changes detected</div>';
      return;
    }
    
    container.innerHTML = diff.map(change => {
      return `
        <div class="diff-item diff-${change.type}">
          <div class="diff-path">${change.path}</div>
          ${change.type === 'removed' ? `<div class="diff-removed">- ${safeStringify(change.oldValue)}</div>` : ''}
          ${change.type === 'added' ? `<div class="diff-added">+ ${safeStringify(change.newValue)}</div>` : ''}
          ${change.type === 'modified' ? `
            <div class="diff-removed">- ${safeStringify(change.oldValue)}</div>
            <div class="diff-added">+ ${safeStringify(change.newValue)}</div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Render action trace (arguments and stack trace)
   */
  function renderActionTrace(container) {
    const action = state.selectedAction;
    
    let html = '<div class="trace-container">';
    
    // Action name
    html += `<div class="trace-section">
      <div class="trace-section-title">Action</div>
      <div class="trace-action-name">${escapeHtml(action.name || 'Unknown')}</div>
    </div>`;
    
    // Arguments
    html += '<div class="trace-section">';
    html += '<div class="trace-section-title">Arguments</div>';
    
    if (action.arguments && action.arguments.length > 0) {
      html += '<div class="trace-arguments">';
      action.arguments.forEach((arg, idx) => {
        const argStr = typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
        html += `<div class="trace-arg">
          <span class="trace-arg-index">[${idx}]</span>
          <pre class="trace-arg-value">${escapeHtml(argStr)}</pre>
        </div>`;
      });
      html += '</div>';
    } else {
      html += '<div class="trace-empty">No arguments</div>';
    }
    html += '</div>';
    
    // Stack trace
    html += '<div class="trace-section">';
    html += '<div class="trace-section-title">Call Stack <span class="trace-hint">(click to view source)</span></div>';
    
    if (action.stackTrace) {
      html += '<div id="stackTraceContent" class="trace-stack-list">';
      html += renderClickableStackFrames(parseStackTrace(action.stackTrace), action.id);
      html += '</div>';
      html += '<div id="sourcePreview" class="source-preview-container"></div>';
    } else {
      html += '<div class="trace-empty">No stack trace available</div>';
    }
    html += '</div>';
    
    html += '</div>';
    container.innerHTML = html;
  }
  
  /**
   * Render stack frames to HTML
   */
  function renderStackFrames(frames) {
    if (frames.length === 0) {
      return '<div class="trace-empty">Could not parse stack trace</div>';
    }
    
    let html = '';
    frames.forEach((frame, idx) => {
      html += `
        <div class="trace-stack-frame">
          <div class="trace-stack-index">${idx}</div>
          <div class="trace-stack-details">
            <div class="trace-stack-function">${escapeHtml(frame.function || 'anonymous')}</div>
            <div class="trace-stack-location">
              <span class="trace-stack-file">${escapeHtml(frame.file || 'unknown')}</span>
              ${frame.line ? `<span class="trace-stack-line">:${frame.line}</span>` : ''}
              ${frame.column ? `<span class="trace-stack-column">:${frame.column}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    });
    return html;
  }
  
  /**
   * Render clickable stack frames (source loaded on click)
   */
  function renderClickableStackFrames(frames, actionId) {
    if (frames.length === 0) {
      return '<div class="trace-empty">Could not parse stack trace</div>';
    }
    
    let html = '';
    frames.forEach((frame, idx) => {
      const shortFile = cleanFilePath(frame.file || 'unknown');
      const fileUrl = frame.file || '';
      const line = frame.line || 0;
      
      html += `
        <div class="trace-stack-frame clickable" 
             data-file="${escapeHtml(fileUrl)}" 
             data-line="${line}"
             data-action-id="${actionId}"
             data-frame-idx="${idx}">
          <div class="trace-stack-index">${idx}</div>
          <div class="trace-stack-details">
            <div class="trace-stack-function">${escapeHtml(frame.function || 'anonymous')}</div>
            <div class="trace-stack-location">
              <span class="trace-stack-file">${escapeHtml(shortFile)}</span>
              ${frame.line ? `<span class="trace-stack-line">:${frame.line}</span>` : ''}
              ${frame.column ? `<span class="trace-stack-column">:${frame.column}</span>` : ''}
            </div>
          </div>
          <div class="trace-stack-arrow">▶</div>
        </div>
      `;
    });
    return html;
  }
  
  /**
   * Render source code preview for a single frame
   */
  function renderSourcePreview(sourceLines, frame) {
    if (!sourceLines || sourceLines.length === 0) {
      return '<div class="trace-empty">Source code not available</div>';
    }
    
    const shortFile = cleanFilePath(frame.file || 'unknown');
    let html = `<div class="source-preview-header">${escapeHtml(shortFile)}:${frame.line}</div>`;
    html += '<div class="trace-source-preview">';
    sourceLines.forEach(line => {
      const lineClass = line.isTarget ? 'trace-source-line target' : 'trace-source-line';
      html += `
        <div class="${lineClass}">
          <span class="trace-source-linenum">${line.lineNumber}</span>
          <span class="trace-source-code">${escapeHtml(line.code || '')}</span>
        </div>`;
    });
    html += '</div>';
    return html;
  }
  
  /**
   * Handle stack frame click - load source code
   */
  function handleStackFrameClick(element) {
    const actionId = element.dataset.actionId;
    const frameIdx = element.dataset.frameIdx;
    
    // Highlight selected frame
    document.querySelectorAll('.trace-stack-frame.clickable').forEach(el => {
      el.classList.remove('selected');
    });
    element.classList.add('selected');
    
    const previewContainer = document.getElementById('sourcePreview');
    if (!previewContainer) return;
    
    const action = state.actions.find(a => a.id === actionId);
    if (!action) return;
    
    // Check cache first
    if (action.stackWithSource && action.stackWithSource[frameIdx]) {
      const frameData = action.stackWithSource[frameIdx];
      if (frameData && frameData.sourceLines) {
        previewContainer.innerHTML = renderSourcePreview(frameData.sourceLines, frameData.frame);
        return;
      }
    }
    
    previewContainer.innerHTML = '<div class="trace-loading">Loading source...</div>';
    
    // Request source for single frame
    requestSingleFrameSource(actionId, action.stackTrace, frameIdx);
  }
  
  /**
   * Request source for a single stack frame
   */
  function requestSingleFrameSource(actionId, stackTrace, frameIdx) {
    if (window.MobXDevToolsConnection && window.MobXDevToolsConnection.sendToPage) {
      window.MobXDevToolsConnection.sendToPage({
        type: 'GET_SINGLE_SOURCE',
        payload: {
          actionId: actionId,
          stackTrace: stackTrace,
          frameIdx: parseInt(frameIdx, 10)
        }
      });
    }
  }
  
  /**
   * Handle single frame source response
   */
  function handleSingleFrameSource(data) {
    const { actionId, frameIdx, sourceLines, frame } = data;
    
    const action = state.actions.find(a => a.id === actionId);
    if (action) {
      if (!action.stackWithSource) {
        action.stackWithSource = [];
      }
      action.stackWithSource[frameIdx] = { frame, sourceLines };
    }
    
    if (state.selectedAction && state.selectedAction.id === actionId) {
      const previewContainer = document.getElementById('sourcePreview');
      if (previewContainer) {
        previewContainer.innerHTML = renderSourcePreview(sourceLines, frame);
      }
    }
  }
  
  /**
   * Try to map stack trace using source maps (async)
   */
  function tryMapStackTrace(stackTrace, actionId) {
    if (typeof window.sourceMappedStackTrace === 'undefined') {
      return;
    }
    
    if (!state.mappedStacks) {
      state.mappedStacks = new Map();
    }
    
    if (state.mappedStacks.has(actionId)) {
      const cached = state.mappedStacks.get(actionId);
      updateStackTraceUI(cached);
      return;
    }
    
    try {
      window.sourceMappedStackTrace.mapStackTrace(stackTrace, function(mappedStack) {
        if (mappedStack && mappedStack.length > 0) {
          const mappedFrames = parseStackTrace(mappedStack.join('\n'));
          state.mappedStacks.set(actionId, mappedFrames);
          
          if (state.selectedAction && state.selectedAction.id === actionId) {
            updateStackTraceUI(mappedFrames);
          }
        }
      }, {
        cacheGlobally: true
      });
    } catch (e) {}
  }
  
  /**
   * Update stack trace UI with mapped frames
   */
  function updateStackTraceUI(frames) {
    const container = document.getElementById('stackTraceContent');
    if (container) {
      container.innerHTML = renderStackFrames(frames);
    }
  }
  
  /**
   * Parse stack trace string into structured frames
   */
  function parseStackTrace(stackTrace) {
    const frames = [];
    const lines = stackTrace.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      line = line.trim();
      
      // Chrome format
      let match = line.match(/^at\s+(?:async\s+)?(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?$/);
      
      if (match) {
        frames.push({
          function: match[1] || 'anonymous',
          file: cleanFilePath(match[2]),
          line: match[3],
          column: match[4]
        });
        return;
      }
      
      // Firefox format
      match = line.match(/^(.+?)@(.+?):(\d+):(\d+)$/);
      if (match) {
        frames.push({
          function: match[1] || 'anonymous',
          file: cleanFilePath(match[2]),
          line: match[3],
          column: match[4]
        });
        return;
      }
      
      if (line && !line.startsWith('Error')) {
        frames.push({
          function: line,
          file: '',
          line: '',
          column: ''
        });
      }
    });
    
    return frames;
  }
  
  /**
   * Clean file path for display
   */
  function cleanFilePath(path) {
    if (!path) return '';
    
    path = path.replace(/^webpack-internal:\/\/\//, '');
    path = path.replace(/^webpack:\/\/\//, '');
    
    try {
      const url = new URL(path);
      let pathname = url.pathname;
      
      pathname = pathname.replace(/\/node_modules\/\.vite\/deps\//, '');
      
      const parts = pathname.split('/').filter(p => p);
      if (parts.length > 2) {
        return '.../' + parts.slice(-2).join('/');
      }
      return pathname;
    } catch {
      const parts = path.split('/').filter(p => p);
      if (parts.length > 2) {
        return '.../' + parts.slice(-2).join('/');
      }
      return path;
    }
  }
  
  /**
   * Escape HTML characters
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * Handle new action received
   */
  function handleAction(actionData) {
    state.actions.push(actionData);
    
    if (actionData.changes && actionData.changes.length > 0) {
      state.actionStates.set(actionData.id, {
        changes: actionData.changes
      });
    } else if (actionData.beforeState && actionData.afterState) {
      const beforeObj = {};
      const afterObj = {};
      beforeObj[actionData.object] = actionData.beforeState;
      afterObj[actionData.object] = actionData.afterState;
      
      state.actionStates.set(actionData.id, {
        before: beforeObj,
        after: afterObj
      });
    } else {
      state.actionStates.set(actionData.id, {
        changes: []
      });
    }
    
    if (state.actions.length > 200) {
      const removed = state.actions.slice(0, -100);
      removed.forEach(action => state.actionStates.delete(action.id));
      state.actions = state.actions.slice(-100);
    }
    
    renderActions();
    if (state.autoScroll) {
      scrollToBottom('actionsList');
    }
  }

  /**
   * Handle batch actions received
   */
  function handleActionsBatch(actionsData) {
    const batchBeforeState = JSON.parse(JSON.stringify(state.currentState));
    
    actionsData.forEach(action => {
      state.actionStates.set(action.id, {
        before: batchBeforeState,
        after: null
      });
    });
    
    state.actions = state.actions.concat(actionsData);
    
    if (state.actions.length > 200) {
      const removed = state.actions.slice(0, -100);
      removed.forEach(action => state.actionStates.delete(action.id));
      state.actions = state.actions.slice(-100);
    }
    
    renderActions();
    if (state.autoScroll) {
      scrollToBottom('actionsList');
    }
  }

  /**
   * Update after state for pending actions when STATE_UPDATE arrives
   */
  function updateActionAfterState(newState) {
    const state = window.MobXDevToolsState;
    if (!state || !state.actions || state.actions.length === 0) return;
    
    for (let i = state.actions.length - 1; i >= 0; i--) {
      const action = state.actions[i];
      const actionState = state.actionStates.get(action.id);
      
      if (actionState && actionState.after === null) {
        const afterObj = {};
        if (action.object && newState[action.object]) {
          afterObj[action.object] = JSON.parse(JSON.stringify(newState[action.object]));
        } else {
          afterObj[action.object] = JSON.parse(JSON.stringify(newState));
        }
        actionState.after = afterObj;
        
        if (state.selectedAction && String(state.selectedAction.id) === String(action.id)) {
          renderActionDetail();
        }
        break;
      }
    }
  }

  /**
   * Request source code for stack trace (lazy loading)
   */
  function requestStackSource(actionId, stackTrace) {
    if (!state.pendingSourceRequests) {
      state.pendingSourceRequests = new Set();
    }
    
    if (state.pendingSourceRequests.has(actionId)) {
      return;
    }
    
    state.pendingSourceRequests.add(actionId);
    
    if (window.MobXDevToolsConnection && window.MobXDevToolsConnection.sendToPage) {
      window.MobXDevToolsConnection.sendToPage({
        type: 'GET_STACK_SOURCE',
        payload: {
          actionId: actionId,
          stackTrace: stackTrace
        }
      });
    }
  }
  
  /**
   * Handle source code response
   */
  function handleStackSource(data) {
    const actionId = data.actionId;
    const stackWithSource = data.stackWithSource;
    
    if (state.pendingSourceRequests) {
      state.pendingSourceRequests.delete(actionId);
    }
    
    const action = state.actions.find(a => a.id === actionId);
    if (action) {
      action.stackWithSource = stackWithSource;
      
      if (state.selectedAction && state.selectedAction.id === actionId) {
        const container = document.getElementById('stackTraceContent');
        const loading = document.getElementById('sourceLoading');
        
        if (container && stackWithSource && stackWithSource.length > 0) {
          container.innerHTML = renderStackFramesWithSource(stackWithSource);
        }
        
        if (loading) {
          loading.remove();
        }
      }
    }
  }

  /**
   * Clear all actions
   */
  function clearActions() {
    state.actions = [];
    state.actionStates.clear();
    state.selectedAction = null;
    if (state.pendingSourceRequests) {
      state.pendingSourceRequests.clear();
    }
    renderActions();
    renderActionDetail();
  }

  // Setup click handler for stack frames
  document.addEventListener('click', function(e) {
    const frame = e.target.closest('.trace-stack-frame.clickable');
    if (frame) {
      handleStackFrameClick(frame);
    }
  });

  // Export functions
  window.MobXDevToolsActionsPanel = {
    renderActions,
    renderActionDetail,
    renderActionState,
    renderActionDiff,
    renderActionTrace,
    handleAction,
    handleActionsBatch,
    updateActionAfterState,
    clearActions,
    handleStackSource,
    requestStackSource,
    handleSingleFrameSource
  };
})();
