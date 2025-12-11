import { writable, derived, get } from 'svelte/store';

// Connection state
export const isConnected = writable(false);
export const statusText = writable('Detecting MobX...');

// MobX state
export const currentState = writable({});
export const selectedStores = writable(new Set());
export const allStoreNames = derived(currentState, $state => Object.keys($state));

// Actions state
export const actions = writable([]);
export const selectedAction = writable(null);
export const actionStates = writable(new Map());
export const actionFilter = writable('');

// UI state
export const expandedPaths = writable(new Set());
export const activeTab = writable('state');
export const activeDetailTab = writable('state');

let port = null;
let currentTabId = null;

export function initConnection() {
  currentTabId = chrome.devtools.inspectedWindow.tabId;
  loadSelectedStores();
  setupChromeListener();
  connectToBackground();
}

function connectToBackground() {
  try {
    if (!chrome.runtime?.id) {
      updateStatus(false, 'Extension updated. Refresh page.');
      return;
    }
    
    port = chrome.runtime.connect({ name: 'mobx-devtools-panel' });
    port.postMessage({ type: 'INIT_PANEL', tabId: currentTabId });

    port.onMessage.addListener((msg) => {
      handleMessage(msg.type === 'MOBX_MESSAGE' ? msg.payload : msg);
    });
    
    port.onDisconnect.addListener(() => {
      setTimeout(connectToBackground, 1000);
    });
    
    setTimeout(sendFilterToPage, 100);
  } catch (e) {}
}

export function sendToPage(message) {
  if (!chrome.runtime?.id || !currentTabId) return;
  
  chrome.tabs.sendMessage(currentTabId, {
    type: 'SEND_TO_PAGE',
    payload: message
  }).catch(() => {
    port?.postMessage({ type: 'SEND_TO_PAGE', tabId: currentTabId, payload: message });
  });
}

export function sendFilterToPage() {
  const stores = get(selectedStores);
  sendToPage({
    type: 'SET_FILTER',
    stores: stores.size > 0 ? Array.from(stores) : []
  });
}

export function requestState() {
  sendToPage({ type: 'GET_STATE' });
}

function handleMessage(data) {
  switch (data.type) {
    case 'MOBX_DETECTED':
      updateStatus(true, `MobX v${data.payload.version}`);
      sendFilterToPage();
      requestState();
      break;
    
    case 'STATE_UPDATE':
      currentState.set(data.payload.state);
      break;
    
    case 'ACTION':
      actions.update(list => {
        const newList = [...list, data.payload];
        return newList.length > 500 ? newList.slice(-500) : newList;
      });
      
      if (data.payload.changes?.length > 0) {
        actionStates.update(map => {
          map.set(data.payload.id, { changes: data.payload.changes });
          return map;
        });
      }
      break;
    
    case 'SINGLE_FRAME_SOURCE':
      const { actionId, frameIdx, sourceLines, frame } = data.payload;
      actions.update(list => {
        const action = list.find(a => a.id === actionId);
        if (action) {
          action.stackWithSource = action.stackWithSource || [];
          action.stackWithSource[frameIdx] = { frame, sourceLines };
        }
        return [...list]; // Create new array to trigger reactivity
      });
      // Also update selectedAction if it's the same action
      selectedAction.update(sel => {
        if (sel && sel.id === actionId) {
          sel.stackWithSource = sel.stackWithSource || [];
          sel.stackWithSource[frameIdx] = { frame, sourceLines };
          return { ...sel }; // Create new object to trigger reactivity
        }
        return sel;
      });
      break;
  }
}

function updateStatus(connected, text) {
  isConnected.set(connected);
  statusText.set(text);
}

function setupChromeListener() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'MOBX_MESSAGE') handleMessage(msg.payload);
    return true;
  });
}

function loadSelectedStores() {
  try {
    const saved = localStorage.getItem('mobx-devtools-selected-stores');
    if (saved) selectedStores.set(new Set(JSON.parse(saved)));
  } catch (e) {}
}

export function saveSelectedStores(stores) {
  localStorage.setItem('mobx-devtools-selected-stores', JSON.stringify([...stores]));
  selectedStores.set(stores);
  sendFilterToPage();
}

export function clearActions() {
  actions.set([]);
  actionStates.set(new Map());
  selectedAction.set(null);
}

export function requestSingleFrameSource(actionId, stackTrace, frameIdx) {
  sendToPage({
    type: 'GET_SINGLE_SOURCE',
    payload: { actionId, stackTrace, frameIdx: +frameIdx }
  });
}

export function setValue(storeName, path, value) {
  sendToPage({ type: 'SET_VALUE', storeName, path, value });
}

export function exportState() {
  const state = get(currentState);
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mobx-state-${Date.now()}.json`;
  a.click();
}

