<script lang="ts">
  import { db } from '../lib/db.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';

  let { onclose }: { onclose: () => void } = $props();

  const OBJ = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'];
  // подсказки-греческие соответствия (можно переписать)
  const HINT: Record<string, string> = {
    'Солнце': 'Гелиос / Аполлон', 'Луна': 'Селена / Артемида', 'Меркурий': 'Гермес',
    'Венера': 'Афродита', 'Марс': 'Арес', 'Юпитер': 'Зевс', 'Сатурн': 'Кронос',
    'Уран': 'Уран', 'Нептун': 'Посейдон', 'Раху': 'Голова дракона', 'Кету': 'Хвост дракона',
  };

  let items = $state(OBJ.map((o) => {
    const a = db.archetypes.get(o);
    return { object: o, deity: a?.deity ?? '', text: a?.text ?? '' };
  }));

  function saveItem(i: number) {
    const it = items[i];
    db.archetypes.put({ object: it.object, deity: it.deity.trim(), text: it.text.trim(), updatedAt: new Date().toISOString() });
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Архетипы божеств">
  <header><h2>Архетипы божеств</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Грецкая мифология на каждую планету. Тексты твои — приложение их хранит и
    показывает рядом с аспектом.</div>

  {#each items as it, i (it.object)}
    <div class="row">
      <div class="head">
        <span class="g glyph">{PLANET_GLYPH[it.object] ?? '•'}</span>
        <b>{it.object}</b>
        <input class="deity" bind:value={it.deity} placeholder={HINT[it.object] ?? 'божество'} onchange={() => saveItem(i)} />
      </div>
      <textarea bind:value={it.text} rows="2" placeholder="Архетип, миф, ключевые мотивы…" onchange={() => saveItem(i)}></textarea>
    </div>
  {/each}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; backdrop-filter: blur(2px); z-index: 24; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 25; padding: 16px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; animation: up 0.25s ease; }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.82rem; margin: 6px 0 12px; }
  .row { padding: 10px 0; border-top: 1px solid var(--glass-brd); }
  .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .g { font-size: 1.2rem; color: var(--silver); width: 1.4rem; text-align: center; }
  .deity { flex: 1; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 10px; padding: 6px 10px; font: inherit; }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 12px; font: inherit; resize: vertical; }
</style>
