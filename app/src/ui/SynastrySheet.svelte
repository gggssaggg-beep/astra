<script lang="ts">
  /**
   * Синастрия двух людей: двойное колесо + межаспекты карт A×B. Композит владелица
   * не ведёт — в UI его нет (математика compositeChart законсервирована в движке).
   * Одна шторка, три вида внутри: список людей → форма → карта. Свайп-вниз/крестик
   * закрывают всю шторку (onclose); ← внутри переходов возвращает к списку.
   */
  import { bottomSheet } from '../lib/sheet.ts';
  import { db, uid } from '../lib/db.ts';
  import type { Person, SignStyle } from '../lib/models.ts';
  import type { Engine } from '../engine/index.ts';
  import { synastryAspects, staticKey } from '../engine/index.ts';
  import { natalPositions } from '../lib/charts.ts';
  import { fmtPos } from '../lib/format.ts';
  import Wheel from './Wheel.svelte';
  import StaticAspectRow from './StaticAspectRow.svelte';

  let { engine, orbOf, signStyle, defaultTz, onclose }:
    { engine: Engine; orbOf: (name: string) => number; signStyle: SignStyle;
      defaultTz: string; onclose: () => void } = $props();

  let view = $state<'list' | 'form' | 'chart'>('list');
  // db.people.all() отдаёт ТУ ЖЕ ссылку — держим локальную копию, обновляем .slice() после мутаций
  let people = $state(db.people.all().slice());
  let pair = $state<string[]>([]);              // до двух id (0 → «А», 1 → «Б»)
  let selKey = $state<string | null>(null);     // выделенная линия в колесе

  const personA = $derived(people.find((p) => p.id === pair[0]) ?? null);
  const personB = $derived(people.find((p) => p.id === pair[1]) ?? null);

  // расчёт карты — движок зовём только при смене людей (не при выделении линии)
  const posA = $derived(personA ? natalPositions(engine, personA) : []);
  const posB = $derived(personB ? natalPositions(engine, personB) : []);
  const cross = $derived(posA.length && posB.length ? synastryAspects(posA, posB, orbOf) : []);

  const TZs = ['Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg',
    'Asia/Omsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok',
    'Europe/Minsk', 'Europe/Kiev', 'Asia/Almaty', 'Asia/Tbilisi', 'Asia/Yerevan',
    'Europe/Berlin', 'UTC'];

  const fmtBirth = (p: Person): string => {
    const [y, m, d] = p.birthDate.split('-');
    const tm = p.unknownTime || !p.birthTime ? 'время неизвестно' : p.birthTime;
    return `${d}.${m}.${y} · ${tm} · ${p.birthTz}`;
  };

  function toggleSel(id: string): void {
    if (pair.includes(id)) pair = pair.filter((x) => x !== id);
    else if (pair.length < 2) pair = [...pair, id];   // третий тап игнорируем
  }

  // --- форма (добавить/править) ---
  let editId = $state<string | null>(null);
  let fName = $state('');
  let fDate = $state('');
  let fTime = $state('');
  let fUnknown = $state(false);
  let fTz = $state('');   // задаётся в openNew (defaultTz) / openEdit (пояс человека) до показа формы
  let fPlaceName = $state('');
  let fLat = $state<number | null>(null);
  let fLon = $state<number | null>(null);
  let fErr = $state<string | null>(null);
  let tzBad = $state(false);

  function openNew(): void {
    editId = null; fName = ''; fDate = ''; fTime = ''; fUnknown = false; fTz = defaultTz;
    fPlaceName = ''; fLat = null; fLon = null; fErr = null; tzBad = false;
    view = 'form';
  }
  function openEdit(p: Person): void {
    editId = p.id; fName = p.name; fDate = p.birthDate; fTime = p.birthTime ?? '';
    fUnknown = p.unknownTime; fTz = p.birthTz;
    fPlaceName = p.place?.name ?? ''; fLat = p.place?.lat ?? null; fLon = p.place?.lon ?? null;
    fErr = null; tzBad = false;
    view = 'form';
  }
  function toggleUnknown(): void { if (fUnknown) fTime = ''; }

  function save(): void {
    fErr = null; tzBad = false;
    const name = fName.trim();
    if (!name) { fErr = 'Впиши имя.'; return; }
    if (!fDate) { fErr = 'Укажи дату рождения.'; return; }
    const tz = fTz.trim();
    try { new Intl.DateTimeFormat('ru', { timeZone: tz }); }
    catch { tzBad = true; fErr = 'Не узнаю такой часовой пояс.'; return; }
    // пустое время без галочки — трактуем как «время неизвестно» (полдень), не блокируем
    const noTime = fUnknown || !fTime;
    const place = (fPlaceName.trim() || fLat != null || fLon != null)
      ? { name: fPlaceName.trim(), lat: fLat ?? 0, lon: fLon ?? 0 } : null;
    const prev = editId ? db.people.get(editId) : null;
    db.people.put({
      id: editId ?? uid(), name, birthDate: fDate,
      birthTime: noTime ? null : fTime, birthTz: tz, place, unknownTime: noTime,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
    });
    people = db.people.all().slice();
    view = 'list';
  }
  function del(): void {
    if (!editId) return;
    if (!confirm('Удалить этого человека?')) return;
    db.people.remove(editId);
    pair = pair.filter((id) => id !== editId);
    people = db.people.all().slice();
    view = 'list';
  }

  function onStatic(key: string): void { selKey = selKey === key ? null : key; }
  function toList(): void { view = 'list'; selKey = null; }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Синастрия" use:bottomSheet={{ onclose }}>
  {#if view === 'list'}
    <header><h2>Синастрия</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
    <div class="hint">Добавь людей и выбери двух — покажу межаспекты.</div>

    {#if people.length === 0}
      <div class="empty">Пока никого нет — добавь первого человека.</div>
    {/if}
    {#each people as p (p.id)}
      {@const idx = pair.indexOf(p.id)}
      <div class="prow" class:sel={idx >= 0}>
        <button class="pmain" onclick={() => toggleSel(p.id)}>
          {#if idx >= 0}<span class="badge">{idx === 0 ? 'А' : 'Б'}</span>{/if}
          <span class="pinfo"><b>{p.name}</b><small>{fmtBirth(p)}</small></span>
        </button>
        <button class="edit" onclick={() => openEdit(p)} aria-label="Править">✎</button>
      </div>
    {/each}

    <button class="btn add" onclick={openNew}>+ Добавить человека</button>
    {#if personA && personB}
      <button class="btn primary open" onclick={() => { view = 'chart'; selKey = null; }}>Открыть карту →</button>
    {/if}

  {:else if view === 'form'}
    <header>
      <button class="back" onclick={toList} aria-label="Назад">←</button>
      <h2>{editId ? 'Править человека' : 'Новый человек'}</h2>
      <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
    </header>

    <label class="fld"><span>Имя</span>
      <input type="text" bind:value={fName} placeholder="Имя" /></label>
    <label class="fld"><span>Дата рождения</span>
      <input type="date" bind:value={fDate} /></label>
    <label class="fld"><span>Время рождения</span>
      <input type="time" bind:value={fTime} disabled={fUnknown} /></label>
    <label class="chk">
      <input type="checkbox" bind:checked={fUnknown} onchange={toggleUnknown} />
      Время неизвестно (возьму полдень)</label>
    <label class="fld"><span>Часовой пояс места рождения</span>
      <input type="text" list="synastry-tz" bind:value={fTz} class:bad={tzBad} /></label>
    <datalist id="synastry-tz">{#each TZs as t}<option value={t}></option>{/each}</datalist>

    <details class="place">
      <summary>Место (для домов — позже)</summary>
      <label class="fld"><span>Название</span><input type="text" bind:value={fPlaceName} /></label>
      <div class="two">
        <label class="fld"><span>Широта</span><input type="number" step="0.0001" bind:value={fLat} /></label>
        <label class="fld"><span>Долгота</span><input type="number" step="0.0001" bind:value={fLon} /></label>
      </div>
    </details>

    {#if fErr}<div class="err">⚠ {fErr}</div>{/if}
    <div class="formbtns">
      <button class="btn" onclick={toList}>← Назад</button>
      {#if editId}<button class="btn danger" onclick={del}>Удалить</button>{/if}
      <button class="btn primary" onclick={save}>Сохранить</button>
    </div>

  {:else}
    <header>
      <button class="back" onclick={toList} aria-label="К списку">←</button>
      <h2 class="pairttl">{personA?.name} <span class="vs">✕</span> {personB?.name}</h2>
    </header>

    <Wheel positions={posA} positionsOuter={posB} staticAspects={cross} {signStyle}
      selectedStaticKey={selKey} onstatictap={onStatic} />
    <div class="legend">внутреннее кольцо — {personA?.name}, внешнее — {personB?.name}</div>

    {#if personA?.unknownTime}
      <div class="warn">⚠ У {personA.name} время рождения не задано — взят полдень, Луна и быстрые точки неточны.</div>
    {/if}
    {#if personB?.unknownTime}
      <div class="warn">⚠ У {personB.name} время рождения не задано — взят полдень, Луна и быстрые точки неточны.</div>
    {/if}

    {#if cross.length === 0}
      <div class="empty">Нет мажорных аспектов в орбисе.</div>
    {:else}
      {#each cross as a}
        <StaticAspectRow {a} ownerA={personA?.name} ownerB={personB?.name}
          selected={staticKey(a) === selKey} ontap={() => onStatic(staticKey(a))} />
      {/each}
    {/if}

    <details class="positions">
      <summary>Позиции</summary>
      <div class="posgrp">{personA?.name}</div>
      {#each posA as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPos(p.lon)}</div>{/each}
      <div class="posgrp">{personB?.name}</div>
      {#each posB as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPos(p.lon)}</div>{/each}
    </details>
  {/if}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 21; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .pairttl { flex: 1; text-align: center; font-size: 1rem; }
  .vs { color: var(--ink-faint); margin: 0 4px; }
  .x, .back { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); flex: none; }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .empty { color: var(--ink-faint); font-size: 0.86rem; margin: 10px 0; text-align: center; }

  /* список людей */
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

  /* кнопки */
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 11px 14px; }
  .btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }
  .btn.danger { color: var(--rose); }
  .btn.add { width: 100%; margin-top: 6px; }
  .btn.open { width: 100%; margin-top: 10px; }

  /* форма */
  .fld { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .fld > span { color: var(--ink-dim); font-size: 0.8rem; }
  .fld input { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font: inherit; }
  .fld input.bad { border-color: var(--rose); }
  .chk { display: flex; align-items: center; gap: 8px; color: var(--ink-dim); font-size: 0.86rem; margin-bottom: 10px; }
  .place { margin-bottom: 10px; }
  .place summary { color: var(--ink-dim); font-size: 0.86rem; cursor: pointer; margin-bottom: 8px; }
  .two { display: flex; gap: 10px; }
  .two .fld { flex: 1; }
  .err { color: var(--rose); font-size: 0.84rem; margin-bottom: 10px; }
  .formbtns { display: flex; gap: 8px; justify-content: flex-end; }

  /* карта */
  .legend { color: var(--ink-faint); font-size: 0.78rem; text-align: center; margin: 4px 0 12px; }
  .warn { color: var(--gold); font-size: 0.8rem; margin: 6px 0; }
  .positions { margin-top: 12px; }
  .positions summary { color: var(--ink-dim); font-size: 0.86rem; cursor: pointer; }
  .posgrp { color: var(--ink-dim); font-size: 0.8rem; font-weight: 600; margin: 8px 0 4px; }
  .posrow { color: var(--ink-dim); font-size: 0.86rem; padding: 2px 0; }
</style>
