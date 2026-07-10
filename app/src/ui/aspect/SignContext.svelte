<script lang="ts">
  /** «Участники в знаках» — привязка аспекта к ЕГО моменту (жалоба владелицы:
   *  «почему нет трактовки данного конкретного трина?»). Каждая строка —
   *  планета в своём знаке и градусе (на момент точного аспекта — правило
   *  астролога), раскрытие показывает полный текст «Планеты в знаках»
   *  (бог планеты в мифе знака, авторская раскладка). */
  import { PLANET_GLYPH, ZODIAC } from '../../engine/index.ts';
  import { fmtPos } from '../../lib/format.ts';
  import { planetSignLore } from '../../lib/planetSignLore.ts';
  let { p1, p2, lon1, lon2, label = 'Участники в знаках' }:
    { p1: string; p2: string; lon1: number; lon2: number; label?: string } = $props();
  const signOf = (lon: number): string => ZODIAC[((Math.floor(lon / 30) % 12) + 12) % 12];
  const rows = $derived([
    { planet: p1, lon: lon1, lore: planetSignLore(p1, signOf(lon1)) },
    { planet: p2, lon: lon2, lore: planetSignLore(p2, signOf(lon2)) },
  ]);
</script>

<div class="block">
  <div class="lbl">{label}</div>
  {#each rows as r (r.planet + r.lon)}
    {#if r.lore}
      <details class="prow">
        <summary><span class="g glyph">{PLANET_GLYPH[r.planet] ?? '•'}</span>
          <b>{r.planet}</b><span class="pos glyph">{fmtPos(r.lon)}</span><span class="arr">▸</span></summary>
        <div class="ltext">{r.lore}</div>
      </details>
    {:else}
      <!-- доп. объекты без текста «в знаке» — просто позиция -->
      <div class="prow flat"><span class="g glyph">{PLANET_GLYPH[r.planet] ?? '•'}</span>
        <b>{r.planet}</b><span class="pos glyph">{fmtPos(r.lon)}</span></div>
    {/if}
  {/each}
</div>

<style>
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .prow { padding: 4px 0; }
  .prow summary, .prow.flat { list-style: none; display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .prow summary::-webkit-details-marker { display: none; }
  .prow.flat { cursor: default; }
  .g { font-size: 1.1rem; color: var(--silver); width: 1.4rem; text-align: center; }
  .prow b { font-size: 0.9rem; }
  .pos { color: var(--ink-dim); font-size: 0.84rem; margin-left: auto; }
  .arr { color: var(--ink-faint); font-size: 0.8rem; transition: transform 0.2s ease; }
  .prow[open] .arr { transform: rotate(90deg); }
  .ltext { color: var(--ink-dim); font-size: 0.88rem; line-height: 1.5; padding: 8px 4px 4px calc(1.4rem + 8px); }
</style>
