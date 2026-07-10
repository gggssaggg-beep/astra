<script lang="ts">
  /** «Архетипы участников» — общий блок шторок трактовки (7б, UX-аудит #14).
   *  Показывает авторские архетипы обеих планет пары, если они заданы. */
  import { db } from '../../lib/db.ts';
  let { p1, p2 }: { p1: string; p2: string } = $props();
  const arch = (o: string) => db.archetypes.get(o);
</script>

{#if arch(p1) || arch(p2)}
  <div class="block">
    <div class="lbl">Архетипы участников</div>
    {#each [p1, p2] as o}
      {#if arch(o)}
        <div class="arch"><b>{o} · {arch(o)?.deity}</b><div class="atext">{arch(o)?.text}</div></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .arch { margin-bottom: 8px; }
  .atext { font-size: 0.9rem; color: var(--ink-dim); white-space: pre-wrap; }
</style>
