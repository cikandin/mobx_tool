// Content Script - Bridge between page and DevTools
// Runs at document_start, so inject.js as soon as possible
(function() {
  'use strict';

  // Inject inject.js immediately (must be loaded before MobX)
  try {
    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = function() { this.remove(); };
    (document.head || document.documentElement).appendChild(script);
  } catch (e) {}

  // Rest runs after DOM is loaded
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

  function safePostMessage(message) {
    if (!isConnected || !port) return false;
    try {
      port.postMessage(message);
      return true;
    } catch (e) {
      isConnected = false;
      port = null;
      return false;
    }
  }

  function setupMessageListener() {
    window.addEventListener('message', function(event) {
      if (!event.data || event.data.source !== 'mobx-devtools-inject') return;
      safePostMessage({
        type: 'MOBX_MESSAGE',
        payload: event.data
      });
    });
  }

  // Connect when DOM is ready
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
