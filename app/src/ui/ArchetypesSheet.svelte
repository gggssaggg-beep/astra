<script lang="ts">
  import { db } from '../lib/db.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { getKey } from '../lib/secret.ts';
  import { loadDeityMyth } from '../lib/chat.ts';
  import { PLANET_LORE } from '../lib/lore.ts';
  import { reveal } from '../lib/reveal.ts';
  import ScrollThread from './ScrollThread.svelte';

  let { onclose }: { onclose: () => void } = $props();
  let sheetEl = $state<HTMLElement | null>(null);

  const OBJ = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'];
  // подсказки-греческие соответствия — из встроенного контента (lore.ts)
  const HINT: Record<string, string> = Object.fromEntries(
    OBJ.map((o) => [o, PLANET_LORE[o]?.deity ?? 'божество'])
  );

  let items = $state(OBJ.map((o) => {
    const a = db.archetypes.get(o);
    return { object: o, deity: a?.deity ?? '', text: a?.text ?? '' };
  }));

  // Аккордеон: список компактный (глиф · планета · божество), редактирование
  // раскрывается по тапу — раньше 11 блоков с полями подряд перегружали экран.
  let open = $state<string | null>(null);
  function toggle(o: string) {
    // сохранить раскрытый блок ПЕРЕД сворачиванием: onchange у textarea может
    // не выстрелить при демонтаже узла — правка осталась бы только в памяти
    if (open) {
      const i = items.findIndex((x) => x.object === open);
      if (i >= 0) saveItem(i);
    }
    open = open === o ? null : o;
  }

  let loadingObj = $state<string | null>(null);
  let loadErr = $state<string | null>(null);

  function saveItem(i: number) {
    const it = items[i];
    db.archetypes.put({ object: it.object, deity: it.deity.trim(), text: it.text.trim(), updatedAt: new Date().toISOString() });
  }

  async function loadMyth(i: number) {
    if (loadingObj) return;
    const key = getKey();
    if (!key) { loadErr = 'Сначала введите ключ Claude во вкладке «Чат».'; return; }
    const it = items[i];
    loadErr = null; loadingObj = it.object;
    try {
      const text = await loadDeityMyth(key, it.object, it.deity || HINT[it.object]);
      items[i].text = text;
      if (!items[i].deity) items[i].deity = HINT[it.object];
      saveItem(i);
    } catch (e) {
      loadErr = e instanceof Error ? e.message : String(e);
    } finally {
      loadingObj = null;
    }
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<ScrollThread target={sheetEl} zIndex={26} />
<section class="sheet glass" aria-label="Архетипы божеств" use:bottomSheet={{ onclose }} bind:this={sheetEl}>
  <header><h2>Архетипы божеств</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Нажми планету, чтобы раскрыть архетип и отредактировать.</div>
  {#if loadErr}<div class="lerr">⚠ {loadErr}</div>{/if}

  {#each items as it, i (it.object)}
    {@const opened = open === it.object}
    <div class="row reveal" class:opened use:reveal>
      <button class="head" onclick={() => toggle(it.object)} aria-expanded={opened}>
        <span class="g glyph">{PLANET_GLYPH[it.object] ?? '•'}</span>
        <span class="name">{it.object}</span>
        <span class="deity-tag">{it.deity || HINT[it.object]}</span>
        <span class="chev" class:up={opened}>▾</span>
      </button>

      {#if opened}
        <div class="body">
          <label class="fld">
            <span class="flbl">Божество</span>
            <input class="deity" bind:value={it.deity} placeholder={HINT[it.object] ?? 'божество'} onchange={() => saveItem(i)} />
          </label>
          <textarea bind:value={it.text} rows="5" placeholder="Архетип, миф, ключевые мотивы…" onchange={() => saveItem(i)}></textarea>
          <div class="rowbtns">
            <button class="myth" disabled={loadingObj === it.object} onclick={() => loadMyth(i)}>
              {loadingObj === it.object ? '…подгружаю…' : '✨ Подгрузить миф (Claude)'}
            </button>
          </div>
        </div>
      {:else if it.text}
        <button class="preview" onclick={() => toggle(it.object)}>{it.text}</button>
      {/if}
    </div>
  {/each}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 24; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 25; padding: 16px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; animation: up 0.25s ease; }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.82rem; margin: 6px 0 12px; }
  .lerr { color: var(--rose); font-size: 0.84rem; margin-bottom: 8px; }

  .row { background: #ffffff0a; border: 1px solid var(--glass-brd); border-radius: 14px;
    margin-bottom: 8px; overflow: hidden; }
  .row.opened { background: #ffffff10; border-color: color-mix(in srgb, var(--accent) 45%, var(--glass-brd)); }

  .head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; padding: 12px 14px; }
  .g { font-size: 1.25rem; color: var(--silver); width: 1.5rem; text-align: center; flex: none; }
  .name { font-weight: 600; flex: none; }
  .deity-tag { flex: 1; min-width: 0; color: var(--ink-dim); font-size: 0.86rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
  .chev { color: var(--ink-faint); flex: none; transition: transform 0.2s ease; }
  .chev.up { transform: rotate(180deg); }

  /* свёрнутый превью-хвостик: одна строка текста, чтобы видеть, что заполнено */
  .preview { display: block; width: 100%; text-align: left; background: transparent; border: none;
    border-top: 1px solid var(--glass-brd); padding: 8px 14px; color: var(--ink-faint); font-size: 0.8rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .body { padding: 0 14px 12px; }
  .fld { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .flbl { color: var(--ink-faint); font-size: 0.78rem; flex: none; }
  .deity { flex: 1; min-width: 0; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 10px; padding: 6px 10px; font: inherit; }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 12px; font: inherit; resize: vertical; }
  .rowbtns { display: flex; justify-content: flex-end; margin-top: 8px; }
  .myth { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--accent); border-radius: 999px; padding: 6px 12px; font-size: 0.8rem; }
  .myth:disabled { opacity: 0.6; }
</style>
