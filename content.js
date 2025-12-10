// Content Script - Bridge between page and DevTools
(function() {
  'use strict';

  // Inject sourcemapped-stacktrace library first, then inject.js
  try {
    var libScript = document.createElement('script');
    libScript.src = chrome.runtime.getURL('lib/sourcemapped-stacktrace.js');
    libScript.onload = function() {
      this.remove();
      var injectScript = document.createElement('script');
      injectScript.src = chrome.runtime.getURL('inject.js');
      injectScript.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(injectScript);
    };
    libScript.onerror = function() {
      var injectScript = document.createElement('script');
      injectScript.src = chrome.runtime.getURL('inject.js');
      injectScript.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(injectScript);
    };
    (document.head || document.documentElement).appendChild(libScript);
  } catch (e) {
    try {
      var script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (e2) {}
  }

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
              payload: message.payload.payload || message.payload
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
    
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      try {
        if (message && message.type === 'SEND_TO_PAGE') {
          window.postMessage({
            source: 'mobx-devtools-content',
            type: message.payload.type,
            payload: message.payload.payload || message.payload
          }, '*');
          sendResponse({ success: true });
        }
      } catch (e) {}
      return true;
    });
  }

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
