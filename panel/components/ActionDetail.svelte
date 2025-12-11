<script>
  import { currentState, actionStates, requestSingleFrameSource } from '../stores/connection.js';
  import StateTree from './StateTree.svelte';
  
  export let action;
  export let tab = 'state';
  
  let selectedFrame = null;
  
  $: actionState = $actionStates.get(action?.id);
  $: storeData = action?.object ? { [action.object]: $currentState[action.object] } : {};
  $: frames = action?.stackTrace ? parseStack(action.stackTrace) : [];
  $: frameSource = action?.stackWithSource?.[selectedFrame];
  
  function parseStack(stack) {
    return stack.split('\n').filter(l => l.trim()).map(line => {
      const m = line.trim().match(/^at\s+(?:async\s+)?(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?$/);
      if (m) return { fn: m[1] || 'anonymous', file: cleanPath(m[2]), line: m[3], col: m[4] };
      return { fn: line, file: '', line: '', col: '' };
    });
  }
  
  function cleanPath(p) {
    if (!p) return '';
    try {
      const parts = new URL(p).pathname.split('/').filter(x => x);
      return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
    } catch {
      const parts = p.split('/').filter(x => x);
      return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p;
    }
  }
  
  function selectFrame(idx) {
    selectedFrame = idx;
    if (!action.stackWithSource?.[idx]?.sourceLines) {
      requestSingleFrameSource(action.id, action.stackTrace, idx);
    }
  }
  
  function fmt(v) { return typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v); }
</script>

{#if tab === 'state'}
  {#if action.object && $currentState[action.object]}
    <StateTree data={storeData} />
  {:else}
    <div class="text-center py-2 opacity-50 text-xs">No store data</div>
  {/if}

{:else if tab === 'diff'}
  {#if actionState?.changes?.length > 0}
    <div class="space-y-1">
      {#each actionState.changes as c}
        <div class="bg-base-300 rounded p-2">
          <div class="flex items-center gap-1 mb-1">
            <span class="px-1 py-0 text-[10px] rounded {c.type === 'add' ? 'bg-success/20 text-success' : c.type === 'delete' ? 'bg-error/20 text-error' : 'bg-warning/20 text-warning'}">
              {c.type}
            </span>
            <span class="font-mono text-xs">{c.store ? `${c.store}.` : ''}{c.name}</span>
          </div>
          {#if c.type !== 'add'}
            <div class="font-mono text-xs text-error bg-error/10 rounded px-1.5 py-0.5 mb-0.5 overflow-auto">- {fmt(c.oldValue)}</div>
          {/if}
          {#if c.type !== 'delete'}
            <div class="font-mono text-xs text-success bg-success/10 rounded px-1.5 py-0.5 overflow-auto">+ {fmt(c.newValue)}</div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-center py-2 opacity-50 text-xs">No changes</div>
  {/if}

{:else if tab === 'trace'}
  <div class="space-y-2">
    <div>
      <div class="text-[10px] uppercase opacity-50 mb-0.5">Action</div>
      <div class="font-mono text-sm">{action.name || 'Unknown'}</div>
    </div>
    
    <div>
      <div class="text-[10px] uppercase opacity-50 mb-0.5">Arguments</div>
      {#if action.arguments?.length > 0}
        {#each action.arguments as arg, i}
          <div class="bg-base-300 rounded px-2 py-1 font-mono text-xs mb-0.5">
            <span class="opacity-50">[{i}]</span>
            <pre class="whitespace-pre-wrap">{fmt(arg)}</pre>
          </div>
        {/each}
      {:else}
        <div class="opacity-50 text-xs">No arguments</div>
      {/if}
    </div>
    
    <div>
      <div class="text-[10px] uppercase opacity-50 mb-0.5">Call Stack</div>
      {#if frames.length > 0}
        <div class="space-y-0.5">
          {#each frames as f, i}
            <div class="flex items-center gap-1 bg-base-300 rounded px-2 py-1 cursor-pointer hover:bg-base-100
                        {selectedFrame === i ? 'ring-1 ring-primary' : ''}"
              on:click={() => selectFrame(i)} on:keydown={e => e.key === 'Enter' && selectFrame(i)}>
              <span class="text-[10px] opacity-40 w-3">{i}</span>
              <div class="flex-1 min-w-0">
                <div class="font-mono text-xs text-primary truncate">{f.fn}</div>
                <div class="font-mono text-[10px] opacity-50 truncate">{f.file}{f.line ? `:${f.line}` : ''}</div>
              </div>
              <span class="text-[10px] opacity-30">▶</span>
            </div>
          {/each}
        </div>
        
        {#if selectedFrame !== null}
          <div class="mt-2 bg-base-300 rounded overflow-hidden">
            <div class="px-2 py-1 bg-base-100 text-[10px] font-mono opacity-70 border-b border-base-200">
              {frames[selectedFrame]?.file}:{frames[selectedFrame]?.line}
            </div>
            {#if frameSource?.sourceLines}
              <div class="font-mono text-xs">
                {#each frameSource.sourceLines as line}
                  <div class="flex {line.isTarget ? 'bg-warning/20' : ''}">
                    <span class="w-8 text-right pr-2 opacity-30 select-none text-[10px]">{line.lineNumber}</span>
                    <pre class="flex-1 overflow-x-auto">{line.code}</pre>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="p-2 text-center opacity-50 text-xs">Loading...</div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="opacity-50 text-xs">No stack trace</div>
      {/if}
    </div>
  </div>
{/if}
