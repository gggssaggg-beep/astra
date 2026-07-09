<script lang="ts">
  /**
   * «Фигуры дня» — библиотечный справочник (раунд 29). Все 15 фигур реестра
   * (engine/figures.ts) от простых к сложным: состав рёбер, из чего состоит,
   * образ и «на практике» (figureLore.ts). Живые фигуры считаются на экране дня
   * и в картах — здесь просто описание каждой формы.
   */
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import { FIGURES, ASPECTS } from '../engine/index.ts';
  import { figureLore } from '../lib/figureLore.ts';

  let { onclose }: { onclose: () => void } = $props();

  const nameById = new Map(FIGURES.map((f) => [f.id, f.name]));
  const ARITY: Record<number, string> = { 3: 'треугольник', 4: 'четырёхугольник', 5: 'пятиугольник', 6: 'шестиугольник' };
  const symOf = (aspect: string) => ASPECTS[aspect]?.symbol ?? '';
  const ORDER = ['☍', '□', '△', '⚹'];
  const composition = (edges: { aspect: string }[]): string => {
    const cnt = new Map<string, number>();
    for (const e of edges) { const s = symOf(e.aspect); if (s) cnt.set(s, (cnt.get(s) ?? 0) + 1); }
    return [...cnt.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))
      .map(([s, n]) => `${n}${s}`).join(' + ');
  };

  let open = $state<string | null>('kosoy-parus');
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Фигуры дня" use:bottomSheet={{ onclose }}>
  <header><h2>Фигуры дня</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Скрытая геометрия неба: как аспекты складываются в фигуры — от простых к сложным.</div>

  {#each FIGURES as f (f.id)}
    {@const lore = figureLore(f.id)}
    <div class="card glass reveal" use:reveal>
      <button class="head" onclick={() => (open = open === f.id ? null : f.id)}>
        <span class="nm">{f.name}</span>
        <span class="ar">{ARITY[f.arity]}</span>
        <span class="comp glyph">{composition(f.edges)}</span>
        <span class="arr">{open === f.id ? '▾' : '▸'}</span>
      </button>
      {#if open === f.id}
        <div class="body">
          {#if lore}
            <div class="img">{lore.image}</div>
            <div class="prac">{lore.practice}</div>
          {/if}
          {#if f.contains.length}
            <div class="contains">Состоит из: {f.contains.map((c) => nameById.get(c) ?? c).join(' · ')}</div>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 21; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .card { padding: 2px 6px; margin: 8px 0; }
  .head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; color: var(--ink); padding: 11px 8px; }
  .nm { font-size: 0.95rem; font-weight: 500; }
  .ar { font-size: 0.7rem; color: var(--ink-faint); }
  .comp { margin-left: auto; font-size: 0.86rem; color: var(--ink-dim); letter-spacing: 1px; white-space: nowrap; }
  .arr { color: var(--ink-faint); }
  .body { padding: 2px 10px 12px; }
  .img { color: var(--ink-dim); font-size: 0.86rem; font-style: italic; line-height: 1.5; }
  .prac { color: var(--ink-faint); font-size: 0.86rem; line-height: 1.55; margin-top: 8px; }
  .contains { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--glass-brd);
    color: var(--ink-faint); font-size: 0.8rem; }
</style>
