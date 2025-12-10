// Connection - Background script connection and messaging

(function() {
  'use strict';

  let port = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;

  /**
   * Connect to background script
   */
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

  /**
   * Send message to page via chrome.tabs.sendMessage
   */
  function sendToPage(message) {
    try {
      if (!chrome.runtime || !chrome.runtime.id) {
        return;
      }
      
      if (window.currentTabId) {
        chrome.tabs.sendMessage(window.currentTabId, {
          type: 'SEND_TO_PAGE',
          payload: message
        }).catch((err) => {
          // Fallback to port if available
          if (port) {
            try {
              port.postMessage({
                type: 'SEND_TO_PAGE',
                tabId: window.currentTabId,
                payload: message
              });
            } catch (e) {}
          }
        });
      }
    } catch (error) {}
  }

  /**
   * Send filter to page
   */
  function sendFilterToPage() {
    const state = window.MobXDevToolsState;
    if (state.selectedStores.size > 0) {
      sendToPage({
        type: 'SET_FILTER',
        stores: Array.from(state.selectedStores)
      });
    } else {
      sendToPage({
        type: 'SET_FILTER',
        stores: []
      });
    }
  }

  /**
   * Request state from page
   */
  function requestState() {
    try {
      sendToPage({ type: 'GET_STATE' });
    } catch (error) {}
  }

  /**
   * Handle MobX messages from page
   */
  function handleMobXMessage(data) {
    const state = window.MobXDevToolsState;
    const statePanel = window.MobXDevToolsStatePanel;
    const actionsPanel = window.MobXDevToolsActionsPanel;
    
    switch (data.type) {
      case 'MOBX_DETECTED':
        updateStatus(true, `MobX v${data.payload.version} detected`);
        sendFilterToPage();
        requestState();
        break;
      
      case 'INITIAL_STATE':
        state.currentState = data.payload.state;
        statePanel.renderState();
        break;
      
      case 'STORE_DATA':
        if (state.lastTimestamp !== data.payload.timestamp) {
          state.pendingStores = {};
          state.lastTimestamp = data.payload.timestamp;
          state.expectedStoreCount = data.payload.total;
        }
        
        state.pendingStores[data.payload.name] = data.payload.data;
        
        if (Object.keys(state.pendingStores).length === state.expectedStoreCount) {
          state.currentState = state.pendingStores;
          var time = new Date().toLocaleTimeString();
          document.getElementById('lastUpdate').textContent = `${state.expectedStoreCount} stores | ${time}`;
          statePanel.renderState();
        }
        break;
      
      case 'STATE_UPDATE':
        if (!state.isEditing) {
          state.currentState = data.payload.state;
          actionsPanel.updateActionAfterState(data.payload.state);
        }
        
        const newStoreNames = Object.keys(data.payload.state);
        const hasNewStores = newStoreNames.some(name => !state.allStoreNames.includes(name));
        
        if (hasNewStores) {
          const filterDiv = document.getElementById('storeFilter');
          if (filterDiv.style.display !== 'none') {
            statePanel.renderStoreFilter();
          }
        }
        
        var storeCount = Object.keys(data.payload.state).length;
        var time = new Date().toLocaleTimeString();
        document.getElementById('lastUpdate').textContent = `${storeCount} stores | ${time}`;
        
        if (!state.isEditing) {
          statePanel.renderState();
        }
        break;
      
      case 'ACTION':
        actionsPanel.handleAction(data.payload);
        break;
      
      case 'ACTIONS_BATCH':
        actionsPanel.handleActionsBatch(data.payload.actions);
        break;
      
      case 'ACTIONS_UPDATE':
        state.actions = data.payload.actions;
        actionsPanel.renderActions();
        break;
      
      case 'STACK_SOURCE':
        actionsPanel.handleStackSource(data.payload);
        break;
      
      case 'SINGLE_FRAME_SOURCE':
        actionsPanel.handleSingleFrameSource(data.payload);
        break;
    }
  }

  /**
   * Update connection status
   */
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

  /**
   * Setup Chrome runtime listener (fallback)
   */
  function setupChromeListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message.type === 'MOBX_MESSAGE') {
          handleMobXMessage(message.payload);
        }
      } catch (error) {}
      return true;
    });
  }

  // Export functions
  window.MobXDevToolsConnection = {
    connectToBackground,
    sendToPage,
    sendFilterToPage,
    requestState,
    handleMobXMessage,
    updateStatus,
    setupChromeListener
  };
})();
