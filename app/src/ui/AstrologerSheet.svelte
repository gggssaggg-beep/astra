<script lang="ts">
  /**
   * «Написать астрологу» (просьба владелицы 2026-07-07). Двойное назначение:
   *   • КЛИЕНТ: связь с астрологом в Telegram + отправка своей натальной карты
   *     прямо из приложения (выбор, какие данные приложить). Вход не нужен.
   *   • АСТРОЛОГ (= админ по email): раздел «Входящие» — карты клиентов с датой
   *     отправки в ЕЁ часовом поясе, можно открыть, пометить прочтённой, удалить.
   */
  import { onMount } from 'svelte';
  import type { Session } from '@supabase/supabase-js';
  import type { Engine } from '../engine/index.ts';
  import { db, uid } from '../lib/db.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { buildClientChart, parseChartEnvelope, type ClientChartBlocks, type ClientChartEnvelope } from '../lib/clientChart.ts';
  import { tgHref } from '../lib/telegram.ts';
  import { success, tap } from '../lib/haptics.ts';
  import {
    configured, initCommunityAuth, isAstrologer, sendClientChart,
    listClientCharts, markClientChartRead, removeClientChart, type ClientChart,
  } from '../lib/community.ts';

  let { engine, orbOf, objects = null, houseSystem = 'horizontal', tz, onclose }:
    { engine: Engine; orbOf: (n: string) => number; objects?: string[] | null;
      houseSystem?: string; tz: string; onclose: () => void } = $props();

  // Telegram астролога (Кира Нарица) — по @username, открывает ЛС
  const astroTgHref = tgHref('leccinum_de_la_luna');

  let session = $state<Session | null>(null);
  onMount(() => initCommunityAuth((s) => (session = s)));
  const amAstrologer = $derived(isAstrologer(session));

  // --- Отправка своей карты (клиент) ---
  let people = $state(db.people.all().slice());
  let selId = $state<string>(people[0]?.id ?? '');
  let blocks = $state<ClientChartBlocks>({ positions: true, aspects: true, houses: true });
  let contact = $state('');
  let sending = $state(false);
  let sendMsg = $state<string | null>(null);

  async function doSend(): Promise<void> {
    const p = db.people.get(selId);
    if (!p) { sendMsg = '⚠ Выбери, чью карту отправить.'; return; }
    if (!configured()) { sendMsg = '⚠ Сообщество не подключено — отправка недоступна.'; return; }
    sending = true; sendMsg = null;
    try {
      const { summary, payload } = buildClientChart(engine, p, { orbOf, objects, houseSystem, blocks });
      await sendClientChart({ fromName: p.name, summary, contact: contact.trim() || null, payload });
      success();
      sendMsg = '✓ Отправлено. Астролог увидит твою карту в приложении с датой отправки.';
    } catch (e) {
      sendMsg = '⚠ ' + (e instanceof Error ? e.message : String(e));
    } finally { sending = false; }
  }

  /** Скопировать текст в буфер (навигатор → фолбэк execCommand для WebView). */
  async function copyText(t: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(t); return true; }
    } catch { /* нет доступа к clipboard API — фолбэк ниже */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }

  /** Второй путь доставки (выбор владелицы «оба способа», 2026-07-07): Telegram
   *  по ссылке НЕ умеет приложить текст сам — поэтому копируем карту в буфер и
   *  открываем чат Киры; клиент вставляет и отправляет. Плюс к «Входящим» в приложении. */
  async function sendViaTelegram(): Promise<void> {
    const p = db.people.get(selId);
    if (!p) { sendMsg = '⚠ Выбери, чью карту отправить.'; return; }
    sending = true; sendMsg = null;
    try {
      const { card } = buildClientChart(engine, p, { orbOf, objects, houseSystem, blocks });
      const ok = await copyText(card);
      success();
      if (ok) {
        sendMsg = '✓ Карта скопирована. Откроется чат — вставь её (долгое нажатие → «Вставить») и отправь.';
        window.location.href = astroTgHref;
      } else {
        sendMsg = '⚠ Не удалось скопировать карту. Отправь её через «🔮 Отправить астрологу» (в приложение).';
      }
    } finally { sending = false; }
  }

  // --- Входящие (астролог) ---
  let inbox = $state<ClientChart[]>([]);
  let inboxErr = $state<string | null>(null);
  let openId = $state<string | null>(null);
  $effect(() => { if (amAstrologer) void reloadInbox(); });
  async function reloadInbox(): Promise<void> {
    inboxErr = null;
    try { inbox = await listClientCharts(); }
    catch (e) { inboxErr = e instanceof Error ? e.message : String(e); }
  }
  async function openCard(c: ClientChart): Promise<void> {
    openId = openId === c.id ? null : c.id;
    if (openId === c.id && !c.read) {
      try { await markClientChartRead(c.id); c.read = true; inbox = inbox.slice(); } catch { /* оффлайн */ }
    }
    tap();
  }
  async function delCard(c: ClientChart): Promise<void> {
    try { await removeClientChart(c.id); inbox = inbox.filter((x) => x.id !== c.id); } catch { /* оффлайн */ }
  }

  // Добавить присланную карту В ПРОГРАММУ (в db.people со своим id) — дальше
  // астролог открывает её как обычную карту в «Добавить» (колесо/аспекты/дома/транзиты).
  let addedIds = $state(new Set<string>());
  let addedMsg = $state<string | null>(null);
  let addedFor = $state<string | null>(null);
  function addToProgram(c: ClientChart, env: ClientChartEnvelope): void {
    const person = { ...env.person, id: uid(), createdAt: new Date().toISOString() };
    db.people.put(person);
    addedIds = new Set(addedIds).add(c.id);
    addedFor = c.id;
    addedMsg = `✓ «${person.name}» добавлена в программу. Открой её в нижнем меню «Добавить».`;
    success();
  }

  const fmtSent = (iso: string): string => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Астролог" use:bottomSheet={{ onclose }}>
  <header><h2>Астролог</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>

  <div class="block">
    <div class="lbl">Связаться</div>
    <p class="hint">Личная консультация и разбор карты — напрямую астрологу в Telegram.</p>
    <a class="btn primary tg" href={astroTgHref}>✈ Написать астрологу в Telegram</a>
  </div>

  <div class="block">
    <div class="lbl">Отправить астрологу свои данные</div>
    {#if people.length === 0}
      <p class="hint">Сначала добавь человека (свою карту) в нижнем меню «Добавить» —
        тогда сможешь отправить её астрологу.</p>
    {:else}
      <p class="hint">Выбери, чью карту и какие данные отправить. Два способа: прямо в
        приложение астрологу («Входящие») или через Telegram — карта скопируется,
        останется вставить её в чат.</p>
      <select class="select" bind:value={selId}>
        {#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
      <div class="checks">
        <label class="chk"><input type="checkbox" bind:checked={blocks.positions} /> Положения планет</label>
        <label class="chk"><input type="checkbox" bind:checked={blocks.aspects} /> Аспекты карты</label>
        <label class="chk"><input type="checkbox" bind:checked={blocks.houses} /> Дома (если задано место и время)</label>
      </div>
      <input class="select" type="text" bind:value={contact}
        placeholder="Твой контакт для ответа (Telegram/@, необязательно)" />
      <button class="btn primary send" onclick={doSend} disabled={sending}>
        {sending ? 'Отправляю…' : '🔮 Отправить астрологу'}</button>
      <button class="btn tgsend" onclick={sendViaTelegram} disabled={sending}>
        ✈ Отправить через Telegram</button>
      {#if sendMsg}<div class="msg" class:err={sendMsg.startsWith('⚠')}>{sendMsg}</div>{/if}
      <p class="hint tiny">Дата и место рождения — чувствительные данные. Отправляются только
        астрологу; читать их может только она.</p>
    {/if}
  </div>

  {#if amAstrologer}
    <div class="block">
      <div class="lbl">Входящие от клиентов {#if inbox.length}· {inbox.length}{/if}</div>
      <button class="btn ghost small" onclick={reloadInbox}>⟳ Обновить</button>
      {#if inboxErr}<div class="msg err">⚠ {inboxErr}</div>{/if}
      {#if !inbox.length && !inboxErr}<p class="hint" style="margin-top:8px">Пока пусто — здесь появятся карты, которые пришлют клиенты.</p>{/if}
      {#each inbox as c (c.id)}
        <div class="card" class:unread={!c.read}>
          <button class="cardhead" onclick={() => openCard(c)}>
            <div class="ci">
              <b>{c.from_name}</b>
              <small>{c.summary}</small>
              <small class="sent">📨 {fmtSent(c.created_at)}{#if c.contact} · ответ: {c.contact}{/if}</small>
            </div>
            {#if !c.read}<span class="dot" aria-label="Новое"></span>{/if}
          </button>
          {#if openId === c.id}
            {@const env = parseChartEnvelope(c.payload)}
            <pre class="payload">{env ? env.card : c.payload}</pre>
            <div class="row">
              {#if env}
                <button class="btn primary small" onclick={() => addToProgram(c, env)} disabled={addedIds.has(c.id)}>
                  {addedIds.has(c.id) ? '✓ Добавлена' : '➕ Добавить карту в программу'}</button>
              {/if}
              <button class="btn ghost small" onclick={() => delCard(c)}>Удалить</button>
            </div>
            {#if addedMsg && addedFor === c.id}<div class="msg">{addedMsg}</div>{/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 22; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 23; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .block:first-of-type { border-top: none; }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .hint { color: var(--ink-dim); font-size: 0.86rem; margin: 0 0 10px; }
  .hint.tiny { font-size: 0.76rem; color: var(--ink-faint); margin-top: 8px; }
  .select { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font: inherit; margin-bottom: 8px; }
  .checks { display: flex; flex-direction: column; gap: 8px; margin: 4px 0 10px; }
  .chk { display: flex; align-items: center; gap: 8px; color: var(--ink-dim); font-size: 0.9rem; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 14px; font-size: 0.92rem; }
  .btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }
  .btn.ghost { color: var(--ink-dim); }
  .btn.small { padding: 7px 12px; font-size: 0.84rem; }
  .btn:disabled { opacity: 0.5; }
  .tg { display: inline-block; text-decoration: none; text-align: center; width: 100%; }
  .send { width: 100%; margin-top: 4px; }
  .tgsend { width: 100%; margin-top: 8px; display: inline-flex; align-items: center; justify-content: center;
    gap: 6px; background: #ffffff10; border-color: color-mix(in srgb, var(--accent) 40%, var(--glass-brd)); }
  .msg { margin-top: 10px; padding: 8px 12px; background: #ffffff10; border-radius: 10px; font-size: 0.86rem; color: var(--ink-dim); }
  .msg.err { background: color-mix(in srgb, var(--rose) 14%, transparent); color: var(--rose); }
  .card { border: 1px solid var(--glass-brd); border-radius: 12px; margin-top: 8px; overflow: hidden; }
  .card.unread { border-color: color-mix(in srgb, var(--accent) 60%, transparent); }
  .cardhead { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: #ffffff08; border: none; color: var(--ink); padding: 10px 12px; }
  .ci { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .ci small { color: var(--ink-dim); font-size: 0.8rem; }
  .ci .sent { color: var(--ink-faint); font-size: 0.74rem; font-family: var(--font-mono); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none;
    box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 70%, transparent); }
  .payload { white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono);
    font-size: 0.76rem; line-height: 1.5; color: var(--ink-dim); background: #ffffff0a;
    border-top: 1px solid var(--glass-brd); padding: 12px; margin: 0; }
  .row { display: flex; gap: 8px; padding: 8px 12px; }
</style>
