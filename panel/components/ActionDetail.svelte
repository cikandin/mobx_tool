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
      const url = new URL(p);
      const parts = url.pathname.split('/').filter(x => x);
      return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : url.pathname;
    } catch {
      const parts = p.split('/').filter(x => x);
      return parts.length > 2 ? '.../' + parts.slice(-2).join('/') : p;
    }
  }
  
  function selectFrame(idx) {
    selectedFrame = idx;
    if (!action.stackWithSource?.[idx]?.sourceLines) {
      requestSingleFrameSource(action.id, action.stackTrace, idx);
    }
  }
  
  function formatVal(v) {
    return typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
  }
</script>

{#if tab === 'state'}
  {#if action.object && $currentState[action.object]}
    <StateTree data={storeData} />
  {:else}
    <div class="text-center py-4 opacity-50">No store data</div>
  {/if}

{:else if tab === 'diff'}
  {#if actionState?.changes?.length > 0}
    <div class="space-y-2">
      {#each actionState.changes as c}
        <div class="bg-base-300 rounded-lg p-3">
          <div class="flex items-center gap-2 mb-2">
            <span class="badge badge-sm {c.type === 'add' ? 'badge-success' : c.type === 'delete' ? 'badge-error' : 'badge-warning'}">
              {c.type}
            </span>
            <span class="font-mono text-sm">{c.store ? `${c.store}.` : ''}{c.name}</span>
          </div>
          {#if c.type !== 'add'}
            <div class="font-mono text-sm text-error bg-error/10 rounded px-2 py-1 mb-1">- {formatVal(c.oldValue)}</div>
          {/if}
          {#if c.type !== 'delete'}
            <div class="font-mono text-sm text-success bg-success/10 rounded px-2 py-1">+ {formatVal(c.newValue)}</div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-center py-4 opacity-50">No changes</div>
  {/if}

{:else if tab === 'trace'}
  <div class="space-y-4">
    <div>
      <div class="text-xs uppercase opacity-50 mb-1">Action</div>
      <div class="font-mono text-lg">{action.name || 'Unknown'}</div>
    </div>
    
    <div>
      <div class="text-xs uppercase opacity-50 mb-1">Arguments</div>
      {#if action.arguments?.length > 0}
        {#each action.arguments as arg, i}
          <div class="bg-base-300 rounded px-3 py-2 font-mono text-sm mb-1">
            <span class="opacity-50">[{i}]</span>
            <pre class="whitespace-pre-wrap mt-1">{formatVal(arg)}</pre>
          </div>
        {/each}
      {:else}
        <div class="opacity-50 text-sm">No arguments</div>
      {/if}
    </div>
    
    <div>
      <div class="text-xs uppercase opacity-50 mb-1">Call Stack</div>
      {#if frames.length > 0}
        <div class="space-y-1">
          {#each frames as f, i}
            <div class="flex items-center gap-2 bg-base-300 rounded px-3 py-2 cursor-pointer hover:bg-base-100
                        {selectedFrame === i ? 'ring-2 ring-primary' : ''}"
              on:click={() => selectFrame(i)} on:keydown={e => e.key === 'Enter' && selectFrame(i)}>
              <span class="text-xs opacity-40 w-4">{i}</span>
              <div class="flex-1 min-w-0">
                <div class="font-mono text-sm text-primary truncate">{f.fn}</div>
                <div class="font-mono text-xs opacity-50 truncate">
                  {f.file}{f.line ? `:${f.line}` : ''}{f.col ? `:${f.col}` : ''}
                </div>
              </div>
              <span class="text-xs opacity-30">▶</span>
            </div>
          {/each}
        </div>
        
        {#if selectedFrame !== null}
          <div class="mt-4 bg-base-300 rounded-lg overflow-hidden">
            <div class="px-3 py-2 bg-base-100 text-xs font-mono opacity-70 border-b border-base-200">
              {frames[selectedFrame]?.file}:{frames[selectedFrame]?.line}
            </div>
            {#if frameSource?.sourceLines}
              <div class="font-mono text-sm">
                {#each frameSource.sourceLines as line}
                  <div class="flex {line.isTarget ? 'bg-warning/20' : ''}">
                    <span class="w-12 text-right pr-3 opacity-30 select-none">{line.lineNumber}</span>
                    <pre class="flex-1 overflow-x-auto">{line.code}</pre>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="p-4 text-center opacity-50">Loading...</div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="opacity-50 text-sm">No stack trace</div>
      {/if}
    </div>
  </div>
{/if}

