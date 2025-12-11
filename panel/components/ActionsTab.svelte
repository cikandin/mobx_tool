<script>
  import { actions, selectedAction, actionFilter, clearActions, activeDetailTab } from '../stores/connection.js';
  import ActionDetail from './ActionDetail.svelte';
  
  let leftWidth = parseInt(localStorage.getItem('mobx-panel-width') || '300');
  let dragging = false;
  let startX = 0;
  let startW = 0;
  
  $: filtered = $actionFilter
    ? $actions.filter(a => 
        (a.name || '').toLowerCase().includes($actionFilter.toLowerCase()) ||
        (a.object || '').toLowerCase().includes($actionFilter.toLowerCase()))
    : $actions;
  
  function select(action) {
    $selectedAction = action;
  }
  
  function formatTime(ts) {
    return ts ? new Date(ts).toLocaleTimeString() : '';
  }
  
  function startDrag(e) {
    dragging = true;
    startX = e.clientX;
    startW = leftWidth;
  }
  
  function onMove(e) {
    if (!dragging) return;
    leftWidth = Math.max(200, Math.min(startW + e.clientX - startX, window.innerWidth - 300));
  }
  
  function stopDrag() {
    if (dragging) {
      dragging = false;
      localStorage.setItem('mobx-panel-width', leftWidth);
    }
  }
</script>

<svelte:window on:mousemove={onMove} on:mouseup={stopDrag} />

<div class="flex h-[calc(100vh-140px)] gap-0">
  <div class="flex flex-col bg-base-200 rounded-lg overflow-hidden" style="width: {leftWidth}px">
    <div class="flex gap-2 p-2 border-b border-base-300">
      <input type="text" placeholder="Filter..." class="input input-sm input-bordered flex-1"
        bind:value={$actionFilter} />
      <button class="btn btn-sm btn-outline btn-error" on:click={clearActions}>Clear</button>
    </div>
    
    <div class="flex-1 overflow-auto">
      {#if filtered.length === 0}
        <div class="text-center py-8 opacity-50">No actions</div>
      {:else}
        {#each filtered as action (action.id)}
          <div class="px-3 py-2 cursor-pointer border-b border-base-300 hover:bg-base-300
                      {$selectedAction?.id === action.id ? 'bg-primary/20 border-l-2 border-l-primary' : ''}"
            on:click={() => select(action)} on:keydown={e => e.key === 'Enter' && select(action)}>
            {#if action.object}
              <div class="text-xs opacity-50 truncate">{action.object}</div>
            {/if}
            <div class="flex justify-between items-center">
              <span class="font-medium text-sm truncate">{action.name || 'Unknown'}</span>
              <span class="text-xs opacity-40 ml-2">{formatTime(action.timestamp)}</span>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
  
  <div class="w-1 bg-base-300 cursor-col-resize hover:bg-primary {dragging ? 'bg-primary' : ''}"
    on:mousedown={startDrag}></div>
  
  <div class="flex-1 flex flex-col bg-base-200 rounded-lg overflow-hidden ml-1">
    <div class="tabs tabs-bordered bg-base-300">
      <button class="tab tab-sm {$activeDetailTab === 'state' ? 'tab-active' : ''}"
        on:click={() => $activeDetailTab = 'state'}>State</button>
      <button class="tab tab-sm {$activeDetailTab === 'diff' ? 'tab-active' : ''}"
        on:click={() => $activeDetailTab = 'diff'}>Diff</button>
      <button class="tab tab-sm {$activeDetailTab === 'trace' ? 'tab-active' : ''}"
        on:click={() => $activeDetailTab = 'trace'}>Trace</button>
    </div>
    
    <div class="flex-1 overflow-auto p-4">
      {#if $selectedAction}
        <ActionDetail action={$selectedAction} tab={$activeDetailTab} />
      {:else}
        <div class="text-center py-8 opacity-50">Select an action</div>
      {/if}
    </div>
  </div>
</div>

