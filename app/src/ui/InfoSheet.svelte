<script lang="ts">
  /** Обучалка (раунд 5): тык по символу в колесе → разбор планеты или аспекта.
   *  Контент — встроенный (lore.ts); для планеты подмешивается архетип астролога,
   *  если он его правил. Кнопка «Обсудить с Claude» открывает чат по архетипам. */
  import type { WheelInfo } from '../lib/lore.ts';
  import { PLANET_LORE, ASPECT_LORE, SIGN_LORE } from '../lib/lore.ts';
  import { PLANET_GLYPH, ZODIAC, SIGN_GLYPH } from '../engine/index.ts';
  import { db } from '../lib/db.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { buildAstroPrompt } from '../lib/aiPrompt.ts';
  import PromptSheet from './PromptSheet.svelte';

  let { info, onclose, ondiscuss, onopenfull }:
    { info: WheelInfo; onclose: () => void; ondiscuss?: (seed: string) => void;
      // передан только для аспекта, который есть в списке дня → мостик к полной
      // карточке аспекта (времена вход/точно/выход, заметка, «когда ещё»)
      onopenfull?: () => void } = $props();

  const NAT = { harm: 'гармоничный', tense: 'напряжённый', neutral: 'нейтральный' };

  // планета
  const pl = $derived(info.kind === 'planet' ? PLANET_LORE[info.name] : null);
  const userArch = $derived(info.kind === 'planet' ? db.archetypes.get(info.name) : undefined);
  const deity = $derived(userArch?.deity || pl?.deity || '');
  const archText = $derived((userArch?.text?.trim()) || pl?.arch || '');

  // аспект
  const asp = $derived(info.kind === 'aspect' ? ASPECT_LORE[info.aspect] : null);

  // знак зодиака
  const sign = $derived(info.kind === 'sign' ? SIGN_LORE[info.index] : null);

  function discuss() {
    if (info.kind === 'planet') {
      ondiscuss?.(`Расскажи про планету ${info.name} в астрологии — её роль и архетип `
        + `(${deity}). Кратко и по делу.`);
    } else if (info.kind === 'sign') {
      ondiscuss?.(`Расскажи про знак ${ZODIAC[info.index]} в астрологии — стихия, `
        + `характер, как в нём проявляются планеты. Кратко и по делу.`);
    } else {
      ondiscuss?.(`Обсудим аспект ${info.p1} ${info.aspect} ${info.p2} `
        + `(${info.symbol}, ${asp?.angle}°). Опираясь на заложенные архетипы участников `
        + `и характер этого аспекта — что это сочетание значит?`);
    }
  }

  // «Промпт для любой ИИ» — тот же готовый текст, что и рядом с Claude, но для
  // вставки в ChatGPT/Gemini/др. Строится под тип тапнутого символа.
  let showPrompt = $state(false);
  const promptText = $derived.by(() => {
    if (info.kind === 'planet') {
      return buildAstroPrompt({
        kind: 'natal', title: `архетип планеты ${info.name}`,
        focus: `${info.name}${deity ? ` (${deity})` : ''}${archText ? ` — ${archText}` : ''}`,
        extra: 'Разбор одной планеты как архетипа: её роль, ключевые мотивы, как проживается. Мифологию переводи на бытовой язык.',
      });
    }
    if (info.kind === 'sign') {
      return buildAstroPrompt({
        kind: 'natal', title: `знак ${ZODIAC[info.index]}`,
        focus: `${ZODIAC[info.index]}${sign ? ` — ${sign.role}. ${sign.text}` : ''}`,
        extra: 'Разбери знак: стихия, характер, как в нём проявляются планеты. Бытовым языком.',
      });
    }
    return buildAstroPrompt({
      kind: 'aspect', title: `аспект ${info.p1} ${info.aspect} ${info.p2}`,
      aspects: [`${info.p1} ${info.aspect} ${info.p2}${asp ? `, ${asp.angle}°` : ''}`],
      focus: `${info.p1} ${info.aspect} ${info.p2}${asp ? ` — ${asp.short}. ${asp.text}` : ''}`,
      extra: 'Разбери, как энергии участников взаимодействуют через характер этого аспекта.',
    });
  });
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Описание символа" use:bottomSheet={{ onclose }}>
  <header>
    {#if info.kind === 'planet'}
      <div class="title"><span class="g glyph">{PLANET_GLYPH[info.name] ?? '•'}</span>
        <div><b>{info.name}</b><small>{deity}</small></div></div>
    {:else if info.kind === 'sign'}
      <div class="title"><span class="g glyph">{SIGN_GLYPH[info.index]}</span>
        <div><b>{ZODIAC[info.index]}</b><small>{sign?.element}</small></div></div>
    {:else}
      <div class="title"><span class="g glyph">{info.symbol}</span>
        <div><b>{info.p1} {info.aspect} {info.p2}</b><small>{asp?.angle}° · {asp ? NAT[asp.nature] : ''}</small></div></div>
    {/if}
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </header>

  {#if info.kind === 'planet' && pl}
    <div class="role">{pl.role}</div>
    <p class="text">{archText}</p>
  {:else if info.kind === 'sign' && sign}
    <div class="role">{sign.role}</div>
    <p class="text">{sign.text}</p>
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

  {#if info.kind === 'aspect' && onopenfull}
    <button class="openfull" onclick={onopenfull}>Открыть карточку аспекта →</button>
  {/if}

  <button class="discuss" onclick={discuss}>
    <span class="dg glyph">💬</span> Обсудить с Claude
  </button>
  <button class="discuss ghost" onclick={() => (showPrompt = true)}>
    <span class="dg glyph">📋</span> Промпт для любой ИИ
  </button>
</section>

{#if showPrompt}
  <PromptSheet text={promptText} onclose={() => (showPrompt = false)} />
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 26; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 27; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
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
    background: var(--accent); border: none; color: var(--on-accent); font-weight: 600; border-radius: 14px; padding: 12px; }
  .discuss.ghost { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); margin-top: 8px; }
  /* мостик к полной карточке аспекта — тихая строка-ссылка над кнопками */
  .openfull { display: block; width: 100%; margin-bottom: 12px; padding: 6px 2px;
    background: transparent; border: none; color: var(--accent); font-size: 0.9rem; text-align: left; cursor: pointer; }
  .dg { font-size: 1.1rem; }
</style>
