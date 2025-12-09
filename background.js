// Background Service Worker
const contentConnections = new Map(); // tabId -> content port
const devtoolsConnections = new Map(); // tabId -> devtools port

// Content script와의 연결 처리
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'mobx-devtools-content') {
    const tabId = port.sender?.tab?.id;
    if (tabId) {
      console.log('[Background] Content script connected, tab:', tabId);
      contentConnections.set(tabId, port);
      
      port.onMessage.addListener((message) => {
        console.log('[Background] Message from content script, tab:', tabId, message.type);
        
        if (message.payload && message.payload.type === 'STATE_UPDATE' && message.payload.payload) {
          var storeCount = Object.keys(message.payload.payload.state || {}).length;
          console.log('[Background] STATE_UPDATE with', storeCount, 'stores');
        }
        
        // 해당 탭의 DevTools로만 메시지 전송
        const devtoolsPort = devtoolsConnections.get(tabId);
        if (devtoolsPort) {
          console.log('[Background] Forwarding to DevTools panel');
          devtoolsPort.postMessage(message);
        } else {
          console.log('[Background] No DevTools connection for tab:', tabId);
        }
      });
      
      port.onDisconnect.addListener(() => {
        console.log('[Background] Content script disconnected, tab:', tabId);
        contentConnections.delete(tabId);
      });
    }
  } else if (port.name === 'mobx-devtools-panel') {
    // DevTools 패널 연결 - tabId는 메시지에서 받음
    let panelTabId = null;
    
    port.onMessage.addListener((message) => {
      if (message.type === 'INIT_PANEL' && message.tabId) {
        panelTabId = message.tabId;
        console.log('[Background] DevTools panel connected, tab:', panelTabId);
        devtoolsConnections.set(panelTabId, port);
        
        // 이미 content script가 연결되어 있다면 초기 상태 요청
        const contentPort = contentConnections.get(panelTabId);
        if (contentPort) {
          contentPort.postMessage({ type: 'GET_STATE' });
        }
      } else if (message.type === 'SEND_TO_PAGE' && message.tabId) {
        console.log('[Background] Sending to page, tab:', message.tabId);
        const contentPort = contentConnections.get(message.tabId);
        if (contentPort) {
          contentPort.postMessage(message);
        }
      }
    });
    
    port.onDisconnect.addListener(() => {
      if (panelTabId) {
        console.log('[Background] DevTools panel disconnected, tab:', panelTabId);
        devtoolsConnections.delete(panelTabId);
      }
    });
  }
});

// 메시지 리스너 (fallback)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Runtime message:', message.type, 'from tab:', sender.tab?.id);
  return true;
});

