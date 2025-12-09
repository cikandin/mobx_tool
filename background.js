// Background Service Worker
const contentConnections = new Map(); // tabId -> content port
const devtoolsConnections = new Map(); // tabId -> devtools port

// Handle connection with content script
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'mobx-devtools-content') {
    const tabId = port.sender?.tab?.id;
    if (tabId) {
      contentConnections.set(tabId, port);
      
      port.onMessage.addListener((message) => {
        // Send message only to DevTools of the same tab
        const devtoolsPort = devtoolsConnections.get(tabId);
        if (devtoolsPort) {
          devtoolsPort.postMessage(message);
        }
      });
      
      port.onDisconnect.addListener(() => {
        contentConnections.delete(tabId);
      });
    }
  } else if (port.name === 'mobx-devtools-panel') {
    // DevTools panel connection - tabId received from message
    let panelTabId = null;
    
    port.onMessage.addListener((message) => {
      if (message.type === 'INIT_PANEL' && message.tabId) {
        panelTabId = message.tabId;
        devtoolsConnections.set(panelTabId, port);
        
        // Request initial state if content script is already connected
        const contentPort = contentConnections.get(panelTabId);
        if (contentPort) {
          contentPort.postMessage({ type: 'GET_STATE' });
        }
      } else if (message.type === 'SEND_TO_PAGE' && message.tabId) {
        const contentPort = contentConnections.get(message.tabId);
        if (contentPort) {
          contentPort.postMessage(message);
        }
      }
    });
    
    port.onDisconnect.addListener(() => {
      if (panelTabId) {
        devtoolsConnections.delete(panelTabId);
      }
    });
  }
});

// Message listener (fallback)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  return true;
});

