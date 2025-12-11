<script>
  import { actions, selectedAction, actionFilter, clearActions, activeDetailTab } from '../stores/connection.js';
  import ActionDetail from './ActionDetail.svelte';
  
  let leftWidth = parseInt(localStorage.getItem('mobx-panel-width') || '280');
  let dragging = false;
  let startX = 0;
  let startW = 0;
  
  // Virtual scroll
  const ITEM_HEIGHT = 42;
  const BUFFER = 5;
  let scrollTop = 0;
  let containerHeight = 300;
  let listEl;
  
  $: filtered = $actionFilter
    ? $actions.filter(a => 
        (a.name || '').toLowerCase().includes($actionFilter.toLowerCase()) ||
        (a.object || '').toLowerCase().includes($actionFilter.toLowerCase()))
    : $actions;
  
  $: totalHeight = filtered.length * ITEM_HEIGHT;
  $: startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
  $: endIdx = Math.min(filtered.length, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + BUFFER);
  $: visible = filtered.slice(startIdx, endIdx);
  $: offsetY = startIdx * ITEM_HEIGHT;
  
  function select(action) { $selectedAction = action; }
  function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : ''; }
  
  function onScroll(e) { scrollTop = e.target.scrollTop; }
  
  function startDrag(e) { dragging = true; startX = e.clientX; startW = leftWidth; }
  function onMove(e) { if (dragging) leftWidth = Math.max(180, Math.min(startW + e.clientX - startX, window.innerWidth - 200)); }
  function stopDrag() { if (dragging) { dragging = false; localStorage.setItem('mobx-panel-width', leftWidth); } }
</script>

<svelte:window on:mousemove={onMove} on:mouseup={stopDrag} />

<div class="flex h-[calc(100vh-80px)] gap-0">
  <div class="flex flex-col bg-base-200 rounded overflow-hidden" style="width: {leftWidth}px">
    <div class="flex gap-1 p-1.5 border-b border-base-300">
      <input type="text" placeholder="Filter..." class="flex-1 px-2 py-0.5 text-xs border border-base-300 rounded bg-base-100"
        bind:value={$actionFilter} />
      <button class="px-2 py-0.5 text-xs text-error border border-error/50 rounded hover:bg-error/10" on:click={clearActions}>Clear</button>
    </div>
    
    <div class="flex-1 overflow-auto" bind:this={listEl} bind:clientHeight={containerHeight} on:scroll={onScroll}>
      {#if filtered.length === 0}
        <div class="text-center py-4 opacity-50 text-xs">No actions</div>
      {:else}
        <div style="height: {totalHeight}px; position: relative;">
          <div style="transform: translateY({offsetY}px);">
            {#each visible as action (action.id)}
              <div class="px-2 py-1.5 cursor-pointer border-b border-base-300 hover:bg-base-300 h-[42px] box-border
                          {$selectedAction?.id === action.id ? 'bg-primary/20 border-l-2 border-l-primary' : ''}"
                on:click={() => select(action)} on:keydown={e => e.key === 'Enter' && select(action)}>
                <div class="text-[10px] opacity-50 truncate h-3">{action.object || ''}</div>
                <div class="flex justify-between items-center">
                  <span class="text-xs truncate">
                    {action.name || 'Unknown'}
                    {#if action.isGrouped}
                      <span class="text-warning opacity-70">(×{action.totalOccurrences})</span>
                    {/if}
                  </span>
                  <span class="text-[10px] opacity-40 ml-1 shrink-0">{formatTime(action.timestamp)}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
  
  <div class="w-1 bg-base-300 cursor-col-resize hover:bg-primary shrink-0 {dragging ? 'bg-primary' : ''}"
    on:mousedown={startDrag}></div>
  
  <div class="flex-1 flex flex-col bg-base-200 rounded overflow-hidden ml-0.5">
    <div class="flex gap-0.5 bg-base-300 p-1">
      <button class="px-2 py-0.5 text-xs rounded {$activeDetailTab === 'state' ? 'bg-base-100' : 'hover:bg-base-200'}"
        on:click={() => $activeDetailTab = 'state'}>State</button>
      <button class="px-2 py-0.5 text-xs rounded {$activeDetailTab === 'diff' ? 'bg-base-100' : 'hover:bg-base-200'}"
        on:click={() => $activeDetailTab = 'diff'}>Diff</button>
      <button class="px-2 py-0.5 text-xs rounded {$activeDetailTab === 'trace' ? 'bg-base-100' : 'hover:bg-base-200'}"
        on:click={() => $activeDetailTab = 'trace'}>Trace</button>
    </div>
    
    <div class="flex-1 overflow-auto p-2">
      {#if $selectedAction}
        <ActionDetail action={$selectedAction} tab={$activeDetailTab} />
      {:else}
        <div class="text-center py-4 opacity-50 text-xs">Select an action</div>
      {/if}
    </div>
  </div>
</div>
