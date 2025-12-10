// Background Service Worker
const contentConnections = new Map();
const devtoolsConnections = new Map();

function safePostMessage(port, message, tabId, connectionMap) {
  try {
    port.postMessage(message);
  } catch (e) {
    if (tabId && connectionMap) {
      connectionMap.delete(tabId);
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'mobx-devtools-content') {
    const tabId = port.sender?.tab?.id;
    if (tabId) {
      contentConnections.set(tabId, port);
      
      port.onMessage.addListener((message) => {
        const devtoolsPort = devtoolsConnections.get(tabId);
        if (devtoolsPort) {
          safePostMessage(devtoolsPort, message, tabId, devtoolsConnections);
        }
      });
      
      port.onDisconnect.addListener(() => {
        contentConnections.delete(tabId);
      });
    }
  } else if (port.name === 'mobx-devtools-panel') {
    let panelTabId = null;
    
    port.onMessage.addListener((message) => {
      if (message.type === 'INIT_PANEL' && message.tabId) {
        panelTabId = message.tabId;
        devtoolsConnections.set(panelTabId, port);
        
        const contentPort = contentConnections.get(panelTabId);
        if (contentPort) {
          safePostMessage(contentPort, { type: 'GET_STATE' }, panelTabId, contentConnections);
        }
      } else if (message.type === 'SEND_TO_PAGE') {
        const contentPort = contentConnections.get(message.tabId);
        if (contentPort) {
          safePostMessage(contentPort, message, message.tabId, contentConnections);
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
