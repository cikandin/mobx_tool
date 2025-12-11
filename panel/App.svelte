<script>
  import { onMount } from 'svelte';
  import { isConnected, statusText, activeTab, initConnection } from './stores/connection.js';
  import StateTab from './components/StateTab.svelte';
  import ActionsTab from './components/ActionsTab.svelte';
  
  onMount(() => {
    initConnection();
  });
</script>

<div class="min-h-screen bg-base-100 text-base-content">
  <header class="navbar bg-base-200 px-4 min-h-12">
    <div class="flex-1">
      <span class="text-lg font-bold">MobX DevTools</span>
    </div>
    <div class="flex-none flex items-center gap-2">
      <div class="badge {$isConnected ? 'badge-success' : 'badge-error'} badge-sm"></div>
      <span class="text-sm opacity-70">{$statusText}</span>
    </div>
  </header>

  <div class="tabs tabs-boxed bg-base-200 mx-4 mt-2">
    <button class="tab {$activeTab === 'state' ? 'tab-active' : ''}" on:click={() => $activeTab = 'state'}>
      State
    </button>
    <button class="tab {$activeTab === 'actions' ? 'tab-active' : ''}" on:click={() => $activeTab = 'actions'}>
      Actions
    </button>
  </div>

  <main class="p-4">
    {#if $activeTab === 'state'}
      <StateTab />
    {:else}
      <ActionsTab />
    {/if}
  </main>
</div>

<style>
  :global(body) { margin: 0; padding: 0; }
</style>

