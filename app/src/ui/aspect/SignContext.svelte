<script lang="ts">
  /** «Участники в знаках» — привязка аспекта к ЕГО моменту (жалоба владелицы:
   *  «почему нет трактовки данного конкретного трина?»). Каждая строка —
   *  планета в своём знаке и градусе (на момент точного аспекта — правило
   *  астролога), раскрытие показывает полный текст «Планеты в знаках»
   *  (бог планеты в мифе знака, авторская раскладка). */
  import { PLANET_GLYPH, ZODIAC } from '../../engine/index.ts';
  import { fmtPos } from '../../lib/format.ts';
  import { planetSignLore } from '../../lib/planetSignLore.ts';
  let { p1, p2, lon1, lon2, label = 'Участники в знаках', transit = false }:
    { p1: string; p2: string; lon1: number; lon2: number; label?: string;
      // «я + небо»: p1 — натальная планета человека, p2 — транзитная (небесная).
      // Тексты «планета в знаке» написаны про ХАРАКТЕР («такой человек…»), к
      // транзитному положению они неприменимы — там это просто окраска неба
      // сейчас. Поэтому подписываем строки и не выдаём натальный текст на транзит
      // (аудит текстов 2026-07-25).
      transit?: boolean } = $props();
  const signOf = (lon: number): string => ZODIAC[((Math.floor(lon / 30) % 12) + 12) % 12];
  const rows = $derived([
    { planet: p1, lon: lon1, note: transit ? 'твоя натальная' : null,
      lore: planetSignLore(p1, signOf(lon1)) },
    { planet: p2, lon: lon2, note: transit ? 'в небе сейчас' : null,
      lore: transit ? null : planetSignLore(p2, signOf(lon2)) },
  ]);
</script>

<div class="block">
  <div class="lbl">{label}</div>
  {#each rows as r (r.planet + r.lon)}
    {#if r.lore}
      <details class="prow">
        <summary><span class="g glyph">{PLANET_GLYPH[r.planet] ?? '•'}</span>
          <b>{r.planet}</b>{#if r.note}<span class="who">{r.note}</span>{/if}
          <span class="pos glyph">{fmtPos(r.lon)}</span><span class="arr">▸</span></summary>
        <div class="ltext">{r.lore}</div>
      </details>
    {:else}
      <!-- транзитная планета и доп. объекты без текста «в знаке» — просто позиция -->
      <div class="prow flat"><span class="g glyph">{PLANET_GLYPH[r.planet] ?? '•'}</span>
        <b>{r.planet}</b>{#if r.note}<span class="who">{r.note}</span>{/if}
        <span class="pos glyph">{fmtPos(r.lon)}</span></div>
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
  /* чья планета: «твоя натальная» / «в небе сейчас» — иначе две строки читались
     как разбор двух РАЗНЫХ ЛЮДЕЙ (жалоба владелицы) */
  .who { color: var(--ink-faint); font-size: 0.72rem; }
  .arr { color: var(--ink-faint); font-size: 0.8rem; transition: transform 0.2s ease; }
  .prow[open] .arr { transform: rotate(90deg); }
  .ltext { color: var(--ink-dim); font-size: 0.88rem; line-height: 1.5; padding: 8px 4px 4px calc(1.4rem + 8px); }
</style>
