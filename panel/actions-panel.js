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
      const storeName = action.object ? `<span class="action-store">${action.object}</span>` : '';
      const isSelected = state.selectedAction && String(state.selectedAction.id) === String(action.id);
      
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
        state.selectedAction = state.actions.find(a => String(a.id) === String(actionId));
        renderActions();
        renderActionDetail();
      });
    });
  }

  /**
   * Render action detail (State or Diff tab)
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
    
    // Show current state of the store
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
    
    // New format: use tracked changes directly
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
   * Handle new action received
   */
  function handleAction(actionData) {
    state.actions.push(actionData);
    
    // Store changes directly from inject.js
    if (actionData.changes && actionData.changes.length > 0) {
      state.actionStates.set(actionData.id, {
        changes: actionData.changes
      });
    } else if (actionData.beforeState && actionData.afterState) {
      // Legacy: use beforeState/afterState
      const beforeObj = {};
      const afterObj = {};
      beforeObj[actionData.object] = actionData.beforeState;
      afterObj[actionData.object] = actionData.afterState;
      
      state.actionStates.set(actionData.id, {
        before: beforeObj,
        after: afterObj
      });
    } else {
      // No state info
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
   * (Fallback for actions without embedded beforeState/afterState)
   */
  function updateActionAfterState(newState) {
    const state = window.MobXDevToolsState;
    if (!state || !state.actions || state.actions.length === 0) return;
    
    for (let i = state.actions.length - 1; i >= 0; i--) {
      const action = state.actions[i];
      const actionState = state.actionStates.get(action.id);
      
      // Only update if after is null (not already set by inject.js)
      if (actionState && actionState.after === null) {
        // Build after state with just the relevant store
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
   * Clear all actions
   */
  function clearActions() {
    state.actions = [];
    state.actionStates.clear();
    state.selectedAction = null;
    renderActions();
    renderActionDetail();
  }

  // Export functions
  window.MobXDevToolsActionsPanel = {
    renderActions,
    renderActionDetail,
    renderActionState,
    renderActionDiff,
    handleAction,
    handleActionsBatch,
    updateActionAfterState,
    clearActions
  };
})();

