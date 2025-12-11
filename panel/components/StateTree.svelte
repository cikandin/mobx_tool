<script>
  import { expandedPaths, setValue } from '../stores/connection.js';
  
  export let data;
  export let depth = 0;
  export let path = '';
  export let storeName = '';
  
  let editingKey = null;
  let editValue = '';
  
  function toggle(key) {
    const p = path ? `${path}.${key}` : key;
    expandedPaths.update(set => {
      const newSet = new Set(set);
      newSet.has(p) ? newSet.delete(p) : newSet.add(p);
      return newSet;
    });
  }
  
  function startEdit(key, value) {
    editingKey = key;
    editValue = typeof value === 'string' ? value : String(value);
  }
  
  function finishEdit(key, original) {
    if (editingKey === key) {
      const p = path ? `${path}.${key}` : key;
      const store = depth === 0 ? key : storeName;
      setValue(store, p, editValue);
      editingKey = null;
    }
  }
  
  function getClass(v) {
    if (v === null) return 'text-warning';
    if (typeof v === 'string') return 'text-success';
    if (typeof v === 'number') return 'text-info';
    if (typeof v === 'boolean') return 'text-secondary';
    return '';
  }
  
  function format(v) {
    if (v === null) return 'null';
    if (typeof v === 'string') return `"${v}"`;
    return String(v);
  }
  
  $: entries = data ? Object.entries(data) : [];
</script>

<div class="font-mono text-sm" style="margin-left: {depth * 16}px">
  {#each entries as [key, value]}
    {@const isObj = typeof value === 'object' && value !== null}
    {@const currentPath = path ? `${path}.${key}` : key}
    {@const currentStore = depth === 0 ? key : storeName}
    {@const expanded = $expandedPaths.has(currentPath)}
    
    <div class="py-0.5 hover:bg-base-300 rounded px-1 -mx-1">
      {#if isObj}
        <span class="cursor-pointer w-4 inline-block text-center opacity-50 hover:opacity-100"
          on:click={() => toggle(key)} on:keydown={e => e.key === 'Enter' && toggle(key)}>
          {expanded ? '▼' : '▶'}
        </span>
        <span class="text-primary font-medium">{key}</span>
        <span class="opacity-50">: {Array.isArray(value) ? `[${value.length}]` : '{...}'}</span>
      {:else}
        <span class="w-4 inline-block"></span>
        <span class="text-primary font-medium">{key}</span>
        <span class="opacity-50">: </span>
        {#if editingKey === key}
          <input type="text" class="input input-xs input-bordered w-32"
            bind:value={editValue}
            on:blur={() => finishEdit(key, value)}
            on:keydown={e => e.key === 'Enter' && finishEdit(key, value)} />
        {:else}
          <span class="{getClass(value)} cursor-pointer hover:underline"
            on:dblclick={() => startEdit(key, value)} title="Double-click to edit">
            {format(value)}
          </span>
        {/if}
      {/if}
    </div>
    
    {#if isObj && expanded}
      <svelte:self data={value} depth={depth + 1} path={currentPath} storeName={currentStore} />
    {/if}
  {/each}
</div>

