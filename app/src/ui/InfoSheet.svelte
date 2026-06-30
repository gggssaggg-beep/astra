<script lang="ts">
  /** Обучалка (раунд 5): тык по символу в колесе → разбор планеты или аспекта.
   *  Контент — встроенный (lore.ts); для планеты подмешивается архетип астролога,
   *  если он его правил. Кнопка «Обсудить с Claude» открывает чат по архетипам. */
  import type { WheelInfo } from '../lib/lore.ts';
  import { PLANET_LORE, ASPECT_LORE } from '../lib/lore.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { db } from '../lib/db.ts';
  import { bottomSheet } from '../lib/sheet.ts';

  let { info, onclose, ondiscuss }:
    { info: WheelInfo; onclose: () => void; ondiscuss?: (seed: string) => void } = $props();

  const NAT = { harm: 'гармоничный', tense: 'напряжённый', neutral: 'нейтральный' };

  // планета
  const pl = $derived(info.kind === 'planet' ? PLANET_LORE[info.name] : null);
  const userArch = $derived(info.kind === 'planet' ? db.archetypes.get(info.name) : undefined);
  const deity = $derived(userArch?.deity || pl?.deity || '');
  const archText = $derived((userArch?.text?.trim()) || pl?.arch || '');

  // аспект
  const asp = $derived(info.kind === 'aspect' ? ASPECT_LORE[info.aspect] : null);

  function discuss() {
    if (info.kind === 'planet') {
      ondiscuss?.(`Расскажи про планету ${info.name} в астрологии — её роль и архетип `
        + `(${deity}). Кратко и по делу.`);
    } else {
      ondiscuss?.(`Обсудим аспект ${info.p1} ${info.aspect} ${info.p2} `
        + `(${info.symbol}, ${asp?.angle}°). Опираясь на заложенные архетипы участников `
        + `и характер этого аспекта — что это сочетание значит?`);
    }
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Описание символа" use:bottomSheet={{ onclose }}>
  <header>
    {#if info.kind === 'planet'}
      <div class="title"><span class="g glyph">{PLANET_GLYPH[info.name] ?? '•'}</span>
        <div><b>{info.name}</b><small>{deity}</small></div></div>
    {:else}
      <div class="title"><span class="g glyph">{info.symbol}</span>
        <div><b>{info.p1} {info.aspect} {info.p2}</b><small>{asp?.angle}° · {asp ? NAT[asp.nature] : ''}</small></div></div>
    {/if}
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </header>

  {#if info.kind === 'planet' && pl}
    <div class="role">{pl.role}</div>
    <p class="text">{archText}</p>
  {:else if asp}
    <div class="role">{asp.short}</div>
    <p class="text">{asp.text}</p>
    {#if info.kind === 'aspect'}
      <div class="parts">
        {#each [info.p1, info.p2] as o}
          {#if PLANET_LORE[o]}
            <div class="part"><span class="g glyph">{PLANET_GLYPH[o] ?? '•'}</span>
              <span><b>{o}</b> — {PLANET_LORE[o].role}</span></div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}

  <button class="discuss" onclick={discuss}>
    <span class="dg glyph">💬</span> Обсудить с Claude
  </button>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; backdrop-filter: blur(2px); z-index: 26; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 27; padding: 16px 16px calc(18px + env(safe-area-inset-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.25s ease; }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .title { display: flex; align-items: center; gap: 12px; }
  .title .g { font-size: 1.9rem; color: var(--silver); width: 1.6rem; text-align: center; }
  .title b { font-size: 1.05rem; }
  .title small { display: block; color: var(--ink-faint); font-size: 0.8rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .role { margin: 14px 0 8px; color: var(--gold); font-size: 0.92rem; }
  .text { margin: 0 0 14px; color: var(--ink-dim); line-height: 1.5; }
  .parts { border-top: 1px solid var(--glass-brd); padding-top: 10px; margin-bottom: 14px; }
  .part { display: flex; gap: 10px; align-items: baseline; margin-bottom: 8px; font-size: 0.88rem; color: var(--ink-dim); }
  .part .g { color: var(--silver); width: 1.3rem; text-align: center; }
  .discuss { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
    background: var(--accent); border: none; color: #0b0f24; font-weight: 600; border-radius: 14px; padding: 12px; }
  .dg { font-size: 1.1rem; }
</style>
