<script lang="ts">
  /** Список людей карт с выбором (вынесено из ChartsSheet, SR-4): строки
   *  «[бейдж А/Б] имя · рождение» + карандаш правки. Тап по строке — выбор
   *  (ontoggle), карандаш — правка (onedit). Логика выбора (needCount) и
   *  форматирование даты рождения (fmtBirth) остаются в родителе. */
  import type { Person } from '../../lib/models.ts';

  let { people, pair, fmtBirth, ontoggle, onedit }:
    { people: Person[]; pair: string[]; fmtBirth: (p: Person) => string;
      ontoggle: (id: string) => void; onedit: (p: Person) => void } = $props();
</script>

{#if people.length === 0}
  <div class="empty">Пока никого нет — добавь первого человека.</div>
{/if}
{#each people as p (p.id)}
  {@const idx = pair.indexOf(p.id)}
  <div class="prow" class:sel={idx >= 0}>
    <button class="pmain" onclick={() => ontoggle(p.id)}>
      {#if idx >= 0}<span class="badge">{idx === 0 ? 'А' : 'Б'}</span>{/if}
      <span class="pinfo"><b>{p.name}</b><small>{fmtBirth(p)}</small></span>
    </button>
    <button class="edit" onclick={() => onedit(p)} aria-label="Править">✎</button>
  </div>
{/each}

<style>
  /* .empty — ДУБЛЬ (в родителе остаётся для пустых списков аспектов) */
  .empty { color: var(--ink-faint); font-size: 0.86rem; margin: 10px 0; text-align: center; }
  .prow { display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
    border-radius: 14px; background: #ffffff08; border: 1px solid var(--glass-brd); }
  .prow.sel { background: color-mix(in srgb, var(--glass) 80%, var(--neon-cyan) 8%);
    border-color: color-mix(in srgb, var(--neon-cyan) 45%, var(--glass-brd)); }
  .pmain { flex: 1; display: flex; align-items: center; gap: 10px; text-align: left;
    background: transparent; border: none; color: var(--ink); padding: 12px 14px; }
  .badge { flex: none; width: 1.5rem; height: 1.5rem; border-radius: 50%; display: grid; place-items: center;
    font-size: 0.8rem; font-weight: 700; background: var(--accent); color: var(--on-accent); }
  .pinfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .pinfo b { font-family: var(--font-display); font-weight: 600; }
  .pinfo small { color: var(--ink-faint); font-size: 0.76rem; }
  .edit { flex: none; background: transparent; border: none; color: var(--ink-dim); font-size: 1rem; padding: 12px 14px; }
</style>
