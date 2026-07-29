<script lang="ts">
  /**
   * СТРАНИЦА ГРАХИ (джйотиш) — тап по плашке на экране дня. Правка астролога
   * 2026-07-29: «должно быть сразу понятно, как влияет; тут же — когда похожие
   * транзиты были в прошлом, избранное и промпт для ИИ».
   *
   * Порядок: где стоит → что включает (гочара по дому от лагны) → сроки этого
   * прохода → когда было раньше → действия. Трактовка живёт ЗДЕСЬ, а не в
   * событиях дня и не на плашке: там только затравка (правка 4).
   */
  import { bottomSheet } from '../lib/sheet.ts';
  import { tick, success } from '../lib/haptics.ts';
  import type { Engine } from '../engine/index.ts';
  import { ZODIAC, PLANET_GLYPH } from '../engine/index.ts';
  import { db } from '../lib/db.ts';
  import { nakshatraOf, signIndexOf, BHAVA_THEME } from '../lib/vedic.ts';
  import { degMin } from '../lib/vedicChart.ts';
  import { gocharaText } from '../lib/gocharaLore.ts';
  import { gocharaSignText } from '../lib/gocharaSignLore.ts';
  import { gocharaTeaser } from '../lib/gocharaTeaser.ts';
  import { signPassages, passageDays, type Passage } from '../lib/gocharaTiming.ts';
  import PromptSheet from './PromptSheet.svelte';
  import Hint from './Hint.svelte';

  let { engine, graha, at, tz, lagnaSign = null, selfName = null, dasha = null, onclose }:
    { engine: Engine; graha: string; at: Date; tz: string;
      /** знак лагны «моей карты» — без него дома нет, показываем только знак */
      lagnaSign?: number | null;
      selfName?: string | null;
      /** «Сатурн — Меркурий»: текущий период, если карта заведена */
      dasha?: string | null;
      onclose: () => void } = $props();

  const pos = $derived(engine.positions(at, [graha])[0] ?? null);
  const signIndex = $derived(pos ? signIndexOf(pos.lon) : 0);
  const sign = $derived(ZODIAC[signIndex]);
  const nak = $derived(pos ? nakshatraOf(pos.lon) : null);
  const house = $derived(lagnaSign == null ? 0 : ((signIndex - lagnaSign + 12) % 12) + 1);
  const teaser = $derived(gocharaTeaser(graha, sign));
  const lore = $derived(house ? gocharaText(graha, house) : null);
  // текст по ЗНАКУ работает без карты — он и идёт первым: «что вообще
  // происходит». Дом ниже отвечает на «как это ложится на тебя».
  const signLore = $derived(gocharaSignText(graha, sign));

  // сроки прохода и прошлые заходы в этот же знак (ретро-заходы склеены)
  const passages = $derived.by((): Passage[] => {
    if (!pos) return [];
    try { return signPassages(engine, graha, signIndex, at, graha === 'Луна' ? 1 : 3); }
    catch { return []; }
  });
  const now = $derived(passages.find((p) => p.current) ?? null);
  const past = $derived(passages.filter((p) => !p.current));

  const d = (x: Date | null): string => (x
    ? new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(x)
    : '…');
  const dShort = (x: Date | null): string => (x
    ? new Intl.DateTimeFormat('ru-RU', { timeZone: tz, month: 'short', year: 'numeric' }).format(x)
    : '…');
  /** «29 лет назад» — сколько прошло с прошлого прохода */
  const ago = (x: Date | null): string => {
    if (!x) return '';
    const years = Math.round((+at - +x) / (365.25 * 86_400_000));
    if (years >= 2) {
      const t = years % 10, h = years % 100;
      const word = t === 1 && h !== 11 ? 'год' : t >= 2 && t <= 4 && (h < 12 || h > 14) ? 'года' : 'лет';
      return `${years} ${word} назад`;
    }
    const months = Math.max(1, Math.round((+at - +x) / (30.4 * 86_400_000)));
    return `${months} мес. назад`;
  };
  /** «идёт 4-й месяц из 30» — сколько прохода уже позади */
  const progress = $derived.by(() => {
    if (!now?.from || !now?.to) return null;
    const all = passageDays(now) ?? 0;
    const gone = Math.round((+at - +now.from) / 86_400_000);
    if (all <= 0) return null;
    return { gone, all, pct: Math.max(0, Math.min(100, Math.round((gone / all) * 100))) };
  });

  // ⭐ избранное: пары «Граха|Знак» в настройках — плашка дня их подсвечивает
  const favKey = $derived(`${graha}|${sign}`);
  let favs = $state<string[]>(db.settings.get().favTransits ?? []);
  const isFav = $derived(favs.includes(favKey));
  function toggleFav(): void {
    const s = db.settings.get();
    const list = (s.favTransits ?? []).slice();
    const i = list.indexOf(favKey);
    if (i >= 0) list.splice(i, 1); else list.push(favKey);
    db.settings.set({ ...s, favTransits: list });
    favs = list;
    if (i < 0) success(); else tick();
  }

  let showPrompt = $state(false);
  const promptText = $derived.by(() => {
    const lines = [
      'Ты ведический астролог (джйотиш). Отвечай простым бытовым языком, без эзотерического тумана.',
      '',
      'ТРАНЗИТ (гочара) на ' + d(at) + ':',
      `${graha} — ${pos ? degMin(pos.lon - signIndex * 30) : ''} ${sign}${pos?.retro ? ', попятный ход (вакри)' : ''}`
        + (nak ? `, накшатра ${nak.name} (пада ${nak.pada}, упр. ${nak.lord})` : ''),
    ];
    if (house) lines.push(`Дом от лагны${selfName ? ` карты «${selfName}»` : ''}: ${house}-й — ${BHAVA_THEME[house]}`);
    if (now) lines.push(`В этом знаке: ${d(now.from)} — ${d(now.to)}`);
    if (dasha) lines.push(`Текущий период Вимшоттари: ${dasha}`);
    if (past.length) lines.push('Прошлые проходы по этому знаку: '
      + past.map((p) => `${dShort(p.from)} — ${dShort(p.to)}`).join('; '));
    lines.push('',
      'Разбери: что этот проход включает в жизни человека, на что уходят силы, что удаётся легче обычного, '
      + 'а что требует терпения. Опирайся на дом от лагны и на природу грахи. Не выдумывай градусы и даты — '
      + 'считай данными только то, что дано выше.');
    return lines.join('\n');
  });
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Граха в транзите" use:bottomSheet={{ onclose }}>
  <header>
    <h2><span class="g glyph">{PLANET_GLYPH[graha] ?? '•'}</span> {graha}
      {#if pos?.retro}<span class="rx">℞</span>{/if}</h2>
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </header>

  {#if !pos}
    <div class="empty">Граха не считается: проверь, включена ли она в настройках.</div>
  {:else}
    <div class="lead glass">
      <div class="where">{degMin(pos.lon - signIndex * 30)} {sign}
        {#if nak}<span class="nk">· {nak.name}, пада {nak.pada}</span>{/if}</div>
      {#if house}
        <div class="hs">{house}-й дом от лагны — {BHAVA_THEME[house]}</div>
      {:else}
        <div class="hs faint">Дом не показан: выбери свою карту с местом рождения в настройках.</div>
      {/if}
      {#if teaser}<div class="teaser">{teaser}</div>{/if}
      {#if pos.retro}<div class="hs faint">Вакри — граха идёт попятно: тема возвращается на пересмотр,
        новое здесь даётся хуже, чем доделывание старого.</div>{/if}
    </div>

    {#if signLore}
      <div class="hdr">Что происходит <Hint k="gochara" /></div>
      <div class="card glass"><p>{signLore}</p></div>
    {/if}

    {#if lore}
      <div class="hdr">Как ложится на карту {selfName ? `«${selfName}»` : ''}</div>
      <div class="card glass"><p>{lore}</p></div>
    {:else if house === 0}
      <div class="hdr">Как ложится на твою карту</div>
      <div class="card glass"><p>Это считается от лагны: без карты с местом рождения дом
        неизвестен, а в джйотише проход читается именно по дому. Заведи свою карту
        в «Картах» и выбери её в настройках.</p></div>
    {/if}

    {#if now}
      <div class="hdr">Сроки прохода</div>
      <div class="card glass">
        <div class="row"><span class="k">В знаке</span>
          <span class="v">{d(now.from)} — {d(now.to)}</span></div>
        {#if progress}
          <div class="bar"><span class="fill" style="width:{progress.pct}%"></span></div>
          <div class="sub">позади {progress.gone} из {progress.all} суток прохода</div>
        {/if}
        {#if dasha}<div class="row"><span class="k">Период</span><span class="v">{dasha}</span></div>{/if}
      </div>
    {/if}

    {#if past.length}
      <div class="hdr">Было раньше</div>
      <div class="card glass">
        <div class="sub">Тот же проход по знаку {sign} в прошлые разы — по своим записям
          тех лет видно, как он ощущался.</div>
        {#each past as p, i (i)}
          <div class="row"><span class="k">{ago(p.to)}</span>
            <span class="v">{d(p.from)} — {d(p.to)}</span></div>
        {/each}
      </div>
    {/if}

    <div class="acts">
      <button class="btn" class:on={isFav} onclick={toggleFav}>
        {isFav ? '★ В избранном' : '☆ В избранное'}
      </button>
      <button class="btn" onclick={() => { tick(); showPrompt = true; }}>📋 Промпт для ИИ</button>
    </div>
  {/if}
</section>

{#if showPrompt}
  <PromptSheet text={promptText} vedic onclose={() => (showPrompt = false)} />
{/if}

<style>
  .backdrop { z-index: 24; }
  .sheet { z-index: 25; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  h2 { margin: 0; font-size: 1.1rem; display: flex; align-items: baseline; gap: 8px; }
  .g { color: var(--silver); font-size: 1.25rem; }
  .rx { color: var(--gold); font-size: 0.9rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .empty { color: var(--ink-dim); font-size: 0.88rem; padding: 18px 10px; }

  .lead { padding: 12px 14px; margin: 4px 0 10px; border-radius: 16px; }
  .where { font-size: 1rem; color: var(--ink); }
  .nk { color: var(--ink-dim); font-size: 0.84rem; }
  .hs { color: var(--ink-faint); font-size: 0.8rem; line-height: 1.45; margin-top: 5px; }
  .hs.faint { color: var(--ink-faint); }
  .teaser { color: var(--ink-dim); font-size: 0.88rem; line-height: 1.5; margin-top: 7px; }

  .hdr { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase;
    letter-spacing: 1px; margin: 16px 4px 4px; }
  .card { padding: 12px 14px; margin: 6px 0; border-radius: 16px; }
  .card p { margin: 0; font-size: 0.9rem; line-height: 1.6; color: var(--ink); }
  .row { display: flex; gap: 10px; align-items: baseline; padding: 4px 0; }
  .row + .row { border-top: 1px solid var(--glass-brd); }
  .k { color: var(--ink-faint); font-size: 0.78rem; min-width: 5.4rem; }
  .v { color: var(--ink); font-size: 0.86rem; margin-left: auto; text-align: right; }
  .sub { color: var(--ink-faint); font-size: 0.78rem; line-height: 1.45; margin: 6px 0 2px; }
  .bar { height: 5px; border-radius: 3px; background: var(--glass-brd); overflow: hidden; margin-top: 8px; }
  .bar .fill { display: block; height: 100%; background: color-mix(in srgb, var(--gold) 55%, transparent); }

  .acts { display: flex; gap: 8px; margin: 14px 0 4px; }
  .btn { flex: 1; background: #ffffff12; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 11px 12px; font-size: 0.86rem; }
  .btn.on { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 45%, var(--glass-brd)); }
</style>
