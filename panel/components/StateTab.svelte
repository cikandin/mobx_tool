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
  
  function selectAll() {
    saveSelectedStores(new Set($allStoreNames));
  }
  
  function deselectAll() {
    saveSelectedStores(new Set());
  }
</script>

<div class="flex flex-wrap gap-2 mb-4">
  <button class="btn btn-sm btn-outline" on:click={requestState}>Refresh</button>
  <button class="btn btn-sm btn-outline" on:click={exportState}>Export</button>
  <button class="btn btn-sm {showFilter ? 'btn-primary' : 'btn-outline'}" on:click={() => showFilter = !showFilter}>
    Filter Stores
  </button>
  <span class="ml-auto text-sm opacity-50">{storeCount} stores</span>
</div>

{#if showFilter}
  <div class="bg-base-200 rounded-lg p-4 mb-4">
    <div class="flex gap-2 mb-3">
      <button class="btn btn-xs btn-outline" on:click={selectAll}>Select All</button>
      <button class="btn btn-xs btn-outline" on:click={deselectAll}>Deselect All</button>
    </div>
    <div class="flex flex-wrap gap-3">
      {#each $allStoreNames as name}
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" class="checkbox checkbox-sm checkbox-primary"
            checked={$selectedStores.has(name)} on:change={() => toggleStore(name)} />
          <span class="text-sm">{name}</span>
        </label>
      {/each}
      {#if $allStoreNames.length === 0}
        <span class="text-sm opacity-50">No stores available</span>
      {/if}
    </div>
  </div>
{/if}

<div class="bg-base-200 rounded-lg p-4 overflow-auto max-h-[calc(100vh-200px)]">
  {#if Object.keys(filteredState).length === 0}
    <div class="text-center py-8 opacity-50">
      {$allStoreNames.length === 0 ? 'No stores available' : 'Select stores to view'}
    </div>
  {:else}
    <StateTree data={filteredState} />
  {/if}
</div>

