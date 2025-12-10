// Main Panel Logic - Initialization and coordination

(function() {
  'use strict';

  // State is initialized in utils.js (loaded first)
  
  // Wait for DOM to load
  document.addEventListener('DOMContentLoaded', initPanel);

  function initPanel() {
    const state = window.MobXDevToolsState;
    const connection = window.MobXDevToolsConnection;
    const statePanel = window.MobXDevToolsStatePanel;
    const actionsPanel = window.MobXDevToolsActionsPanel;

    // Get current tab ID
    window.currentTabId = chrome.devtools.inspectedWindow.tabId;

    // Load saved settings
    statePanel.loadSelectedStores();

    // Setup tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}Tab`).classList.add('active');
      });
    });

    // State tab controls
    document.getElementById('refreshState').addEventListener('click', () => {
      connection.requestState();
    });

    document.getElementById('exportState').addEventListener('click', () => {
      const dataStr = JSON.stringify(state.currentState, null, 2);
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
        statePanel.renderStoreFilter();
      } else {
        filterDiv.style.display = 'none';
      }
    });

    // Actions tab controls
    document.getElementById('clearActions').addEventListener('click', () => {
      actionsPanel.clearActions();
    });

    document.getElementById('actionFilter').addEventListener('input', (e) => {
      state.actionFilter = e.target.value.toLowerCase();
      actionsPanel.renderActions();
    });

    // Action detail tabs
    document.querySelectorAll('.action-detail-tab').forEach(button => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.detailTab;
        document.querySelectorAll('.action-detail-tab').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        actionsPanel.renderActionDetail(tabName);
      });
    });

    // Setup Chrome listener
    connection.setupChromeListener();

    // Connect to background
    connection.connectToBackground();

    // Initial status
    connection.updateStatus(false, 'Detecting MobX...');

    // Request state once after connection
    setTimeout(() => {
      connection.requestState();
    }, 500);
    
    // Setup resize handle for actions panel
    setupResizeHandle();
  }
  
  /**
   * Setup draggable resize handle for actions panel
   */
  function setupResizeHandle() {
    const handle = document.getElementById('resizeHandle');
    const leftPanel = document.getElementById('actionsPanelLeft');
    const container = document.getElementById('actionsContainer');
    
    if (!handle || !leftPanel || !container) return;
    
    let isDragging = false;
    let startX, startY, startWidth, startHeight;
    
    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      handle.classList.add('dragging');
      
      const isVertical = window.innerWidth <= 600;
      
      if (isVertical) {
        startY = e.clientY;
        startHeight = leftPanel.offsetHeight;
      } else {
        startX = e.clientX;
        startWidth = leftPanel.offsetWidth;
      }
      
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const isVertical = window.innerWidth <= 600;
      
      if (isVertical) {
        const deltaY = e.clientY - startY;
        const newHeight = Math.max(150, Math.min(startHeight + deltaY, container.offsetHeight - 150));
        leftPanel.style.height = newHeight + 'px';
      } else {
        const deltaX = e.clientX - startX;
        const newWidth = Math.max(200, Math.min(startWidth + deltaX, container.offsetWidth - 200));
        leftPanel.style.width = newWidth + 'px';
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        handle.classList.remove('dragging');
        
        // Save size to localStorage
        const isVertical = window.innerWidth <= 600;
        if (isVertical) {
          localStorage.setItem('mobx-devtools-panel-height', leftPanel.offsetHeight);
        } else {
          localStorage.setItem('mobx-devtools-panel-width', leftPanel.offsetWidth);
        }
      }
    });
    
    // Restore saved size
    const savedWidth = localStorage.getItem('mobx-devtools-panel-width');
    const savedHeight = localStorage.getItem('mobx-devtools-panel-height');
    
    if (savedWidth && window.innerWidth > 600) {
      leftPanel.style.width = savedWidth + 'px';
    }
    if (savedHeight && window.innerWidth <= 600) {
      leftPanel.style.height = savedHeight + 'px';
    }
  }
})();

