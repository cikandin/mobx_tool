<script>
  import { currentState, selectedStores, allStoreNames, requestState, exportState, saveSelectedStores } from '../stores/connection.js';
  import StateTree from './StateTree.svelte';
  
  let showFilter = false;
  
  $: filteredState = Object.fromEntries(
    Object.entries($currentState).filter(([name]) => $selectedStores.has(name))
  );
  
  $: storeCount = Object.keys($currentState).length;
  
  function toggleStore(name) {
    const newSet = new Set($selectedStores);
    newSet.has(name) ? newSet.delete(name) : newSet.add(name);
    saveSelectedStores(newSet);
  }
  
  function selectAll() { saveSelectedStores(new Set($allStoreNames)); }
  function deselectAll() { saveSelectedStores(new Set()); }
</script>

<div class="flex flex-wrap gap-1 mb-2">
  <button class="px-2 py-0.5 text-xs border border-base-300 rounded hover:bg-base-200" on:click={requestState}>Refresh</button>
  <button class="px-2 py-0.5 text-xs border border-base-300 rounded hover:bg-base-200" on:click={exportState}>Export</button>
  <button class="px-2 py-0.5 text-xs border rounded {showFilter ? 'bg-primary text-primary-content border-primary' : 'border-base-300 hover:bg-base-200'}"
    on:click={() => showFilter = !showFilter}>Filter</button>
  <span class="ml-auto text-xs opacity-50">{storeCount} stores</span>
</div>

{#if showFilter}
  <div class="bg-base-200 rounded p-2 mb-2">
    <div class="flex gap-1 mb-2">
      <button class="px-1.5 py-0.5 text-xs border border-base-300 rounded hover:bg-base-300" on:click={selectAll}>All</button>
      <button class="px-1.5 py-0.5 text-xs border border-base-300 rounded hover:bg-base-300" on:click={deselectAll}>None</button>
    </div>
    <div class="flex flex-wrap gap-2">
      {#each $allStoreNames as name}
        <label class="flex items-center gap-1 cursor-pointer text-xs">
          <input type="checkbox" class="w-3 h-3" checked={$selectedStores.has(name)} on:change={() => toggleStore(name)} />
          {name}
        </label>
      {/each}
      {#if $allStoreNames.length === 0}
        <span class="text-xs opacity-50">No stores</span>
      {/if}
    </div>
  </div>
{/if}

<div class="bg-base-200 rounded p-2 overflow-auto max-h-[calc(100vh-120px)]">
  {#if Object.keys(filteredState).length === 0}
    <div class="text-center py-4 opacity-50 text-xs">
      {$allStoreNames.length === 0 ? 'No stores' : 'Select stores'}
    </div>
  {:else}
    <StateTree data={filteredState} />
  {/if}
</div>
