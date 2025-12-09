// Content Script - 페이지와 DevTools 간 브릿지
// document_start에서 실행되므로 최대한 빠르게 inject.js 주입
(function() {
  'use strict';

  // 즉시 inject.js 주입 (MobX보다 먼저 로드되어야 함)
  try {
    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() { this.remove(); };
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {}

  // 나머지는 DOM 로드 후 실행
  var port = null;
  var isConnected = false;

  function connect() {
    try {
      if (!chrome.runtime || !chrome.runtime.id) return;
      
      port = chrome.runtime.connect({ name: 'mobx-devtools-content' });
      isConnected = true;
      
      port.onMessage.addListener(function(message) {
        try {
          if (message && message.type === 'SEND_TO_PAGE') {
            window.postMessage({
              source: 'mobx-devtools-content',
              type: message.payload.type,
              payload: message.payload
            }, '*');
          }
        } catch (e) {}
      });

      port.onDisconnect.addListener(function() {
        isConnected = false;
        port = null;
      });
    } catch (e) {
      isConnected = false;
    }
  }

  function setupMessageListener() {
    window.addEventListener('message', function(event) {
      try {
        if (!event.data || event.data.source !== 'mobx-devtools-inject') return;
        if (!isConnected || !port) return;
        
        port.postMessage({
          type: 'MOBX_MESSAGE',
          payload: event.data
        });
      } catch (e) {
        // Extension context invalidated - 무시
        if (e.message && e.message.indexOf('Extension context invalidated') !== -1) {
          isConnected = false;
          port = null;
        }
      }
    });
  }

  // DOM 준비되면 연결
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      connect();
      setupMessageListener();
    });
  } else {
    connect();
    setupMessageListener();
  }
})();
