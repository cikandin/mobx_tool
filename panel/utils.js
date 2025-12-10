// Utility functions for MobX DevTools Panel

// Shared state for all modules - initialize first
window.MobXDevToolsState = {
  currentState: {},
  actions: [],
  selectedStores: new Set(),
  allStoreNames: [],
  expandedPaths: new Set(),
  isEditing: false,
  editingStoreName: null,
  selectedAction: null,
  actionStates: new Map(),
  actionFilter: '',
  autoScroll: true,
  pendingStores: {},
  lastTimestamp: null,
  expectedStoreCount: 0
};

/**
 * Parse path to handle both object keys and array indices
 * Examples: "user.name" -> ["user", "name"]
 *           "[0].locationName" -> [0, "locationName"]
 *           "items[0].name" -> ["items", 0, "name"]
 */
function parsePath(path) {
  const parts = [];
  let current = '';
  let i = 0;
  
  while (i < path.length) {
    if (path[i] === '[') {
      if (current) {
        parts.push(current);
        current = '';
      }
      i++;
      let index = '';
      while (i < path.length && path[i] !== ']') {
        index += path[i];
        i++;
      }
      if (index !== '') {
        parts.push(parseInt(index, 10));
      }
      i++;
    } else if (path[i] === '.') {
      if (current) {
        parts.push(current);
        current = '';
      }
      i++;
    } else {
      current += path[i];
      i++;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  return parts;
}

/**
 * Calculate diff between two states
 */
function calculateDiff(before, after, path = '') {
  const changes = [];
  
  const beforeIsObject = before !== null && before !== undefined && typeof before === 'object' && !Array.isArray(before);
  const afterIsObject = after !== null && after !== undefined && typeof after === 'object' && !Array.isArray(after);
  
  // Both are primitives, null, or undefined
  if (!beforeIsObject && !afterIsObject) {
    const beforeStr = before === undefined ? 'undefined' : (before === null ? 'null' : JSON.stringify(before));
    const afterStr = after === undefined ? 'undefined' : (after === null ? 'null' : JSON.stringify(after));
    
    if (beforeStr !== afterStr) {
      changes.push({
        path: path || 'root',
        type: 'modified',
        oldValue: before,
        newValue: after
      });
    }
    return changes;
  }
  
  // One is object, one is not
  if (beforeIsObject && !afterIsObject) {
    changes.push({
      path: path || 'root',
      type: 'modified',
      oldValue: before,
      newValue: after
    });
    return changes;
  }
  
  if (!beforeIsObject && afterIsObject) {
    changes.push({
      path: path || 'root',
      type: 'modified',
      oldValue: before,
      newValue: after
    });
    return changes;
  }
  
  // Both are objects
  if (beforeIsObject && afterIsObject) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  
    allKeys.forEach(key => {
      const currentPath = path ? `${path}.${key}` : key;
      const beforeExists = key in before;
      const afterExists = key in after;
      const beforeValue = beforeExists ? before[key] : undefined;
      const afterValue = afterExists ? after[key] : undefined;
      
      if (!beforeExists && afterExists) {
        changes.push({
          path: currentPath,
          type: 'added',
          newValue: afterValue
        });
      } else if (beforeExists && !afterExists) {
        changes.push({
          path: currentPath,
          type: 'removed',
          oldValue: beforeValue
        });
      } else if (beforeExists && afterExists) {
        if (typeof beforeValue === 'object' && beforeValue !== null && typeof afterValue === 'object' && afterValue !== null) {
          if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
            if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
              changes.push({
                path: currentPath,
                type: 'modified',
                oldValue: beforeValue,
                newValue: afterValue
              });
            }
          } else {
            changes.push(...calculateDiff(beforeValue, afterValue, currentPath));
          }
        } else {
          const beforeStr = beforeValue === undefined ? 'undefined' : JSON.stringify(beforeValue);
          const afterStr = afterValue === undefined ? 'undefined' : JSON.stringify(afterValue);
          
          if (beforeStr !== afterStr) {
            changes.push({
              path: currentPath,
              type: 'modified',
              oldValue: beforeValue,
              newValue: afterValue
            });
          }
        }
      }
    });
  }
  
  return changes;
}

/**
 * Safely stringify values including undefined/false
 */
function safeStringify(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  return JSON.stringify(value);
}

/**
 * Scroll element to bottom
 */
function scrollToBottom(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

// Export for use in other modules
window.MobXDevToolsUtils = {
  parsePath,
  calculateDiff,
  safeStringify,
  scrollToBottom
};

