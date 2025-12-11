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
export const actionNameCounts = writable(new Map()); // name -> total count

const MAX_ACTIONS = 2000;
const GROUP_THRESHOLD = 200;
const GROUP_KEEP = 5;

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
      const actionName = data.payload.name || 'Unknown';
      
      // Update total count for this action name
      let totalCount = 0;
      actionNameCounts.update(counts => {
        totalCount = (counts.get(actionName) || 0) + 1;
        counts.set(actionName, totalCount);
        return new Map(counts);
      });
      
      actions.update(list => {
        let newList = [...list, { 
          ...data.payload, 
          totalOccurrences: totalCount,
          isGrouped: totalCount >= GROUP_THRESHOLD
        }];
        
        // If this action name has 200+ occurrences, keep only latest 5
        if (totalCount >= GROUP_THRESHOLD) {
          const sameNameActions = newList.filter(a => a.name === actionName);
          if (sameNameActions.length > GROUP_KEEP) {
            const toKeepIds = new Set(sameNameActions.slice(-GROUP_KEEP).map(a => a.id));
            newList = newList.filter(a => a.name !== actionName || toKeepIds.has(a.id));
          }
        }
        
        // Global limit
        if (newList.length > MAX_ACTIONS) {
          newList = newList.slice(-MAX_ACTIONS);
        }
        
        return newList;
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
  actionNameCounts.set(new Map());
  selectedAction.set(null);
}

export function requestSingleFrameSource(actionId, stackTrace, frameIdx, rawStackTrace) {
  sendToPage({
    type: 'GET_SINGLE_SOURCE',
    payload: { actionId, stackTrace, frameIdx: +frameIdx, rawStackTrace }
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

