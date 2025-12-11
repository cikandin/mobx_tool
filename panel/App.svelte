<script>
  import { onMount } from 'svelte';
  import { isConnected, statusText, activeTab, initConnection } from './stores/connection.js';
  import StateTab from './components/StateTab.svelte';
  import ActionsTab from './components/ActionsTab.svelte';
  
  onMount(() => {
    initConnection();
  });
</script>

<div class="min-h-screen bg-base-100 text-base-content text-xs">
  <header class="flex items-center justify-between bg-base-200 px-3 py-1.5">
    <span class="text-sm font-bold">MobX DevTools</span>
    <div class="flex items-center gap-1.5">
      <div class="w-2 h-2 rounded-full {$isConnected ? 'bg-success' : 'bg-error'}"></div>
      <span class="text-xs opacity-70">{$statusText}</span>
    </div>
  </header>

  <div class="flex gap-1 bg-base-200 px-3 py-1">
    <button class="px-3 py-1 rounded text-xs {$activeTab === 'state' ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}"
      on:click={() => $activeTab = 'state'}>State</button>
    <button class="px-3 py-1 rounded text-xs {$activeTab === 'actions' ? 'bg-primary text-primary-content' : 'hover:bg-base-300'}"
      on:click={() => $activeTab = 'actions'}>Actions</button>
  </div>

  <main class="p-2">
    {#if $activeTab === 'state'}
      <StateTab />
    {:else}
      <ActionsTab />
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; padding: 0; font-size: 12px; }
</style>
