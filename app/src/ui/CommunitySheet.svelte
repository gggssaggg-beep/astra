<script lang="ts">
  /** «Сообщество»: обсуждения аспектов с лайками и комментариями (Supabase).
   *  Три состояния: не подключено (нет ключей) → тёплая заглушка; не вошли →
   *  вход через Google; вошли → лента / тред. `signature` фильтрует по аспекту. */
  import type { Session } from '@supabase/supabase-js';
  import {
    configured, initCommunityAuth, signInGoogle, signInEmail, signOut, ensureProfile,
    listDiscussions, listComments, createDiscussion, addComment, toggleLike,
    removeDiscussion, removeComment, isAdmin,
    follow, getProfileCard, subscribeThread, isSubscribed,
    type Discussion, type CommunityComment, type ProfileCard,
  } from '../lib/community.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import { tick as buzz, success } from '../lib/haptics.ts';
  import { PLANET_GLYPH, ASPECTS } from '../engine/index.ts';
  import { parseSignature } from '../lib/signature.ts';

  let { signature = null, title = '', onclose }:
    { signature?: string | null; title?: string; onclose: () => void } = $props();

  // краткая подпись аспекта, ИЗ КОТОРОГО написано обсуждение: «☉ □ ♂» — чтобы в
  // ленте было видно, к чему тема (раньше сигнатура была, но не показывалась)
  function aspectLabel(sig: string | null): string | null {
    if (!sig) return null;
    const { p1, p2, aspect } = parseSignature(sig);
    const sym = ASPECTS[aspect]?.symbol ?? '';
    return `${PLANET_GLYPH[p1] ?? p1} ${sym} ${PLANET_GLYPH[p2] ?? p2}`.trim();
  }

  let session = $state<Session | null>(null);
  let err = $state<string | null>(null);
  let loading = $state(false);

  let feed = $state<Discussion[]>([]);
  let open = $state<Discussion | null>(null);      // открытый тред
  let comments = $state<CommunityComment[]>([]);
  let subbed = $state(false);                      // подписана ли на открытую ветку
  let card = $state<ProfileCard | null>(null);     // открытая карточка пользователя
  let cardBusy = $state(false);

  let newTitle = $state('');
  let newBody = $state('');
  let newComment = $state('');
  let creating = $state(false);
  let posting = $state(false);   // блокировка на время отправки — иначе двойной тап публиковал дважды

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  async function refresh() {
    if (!configured() || !session) return;
    loading = true; err = null;
    try { feed = await listDiscussions(signature); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    finally { loading = false; }
  }

  $effect(() => {
    if (!configured()) return;
    initCommunityAuth((s) => {
      const was = !!session;
      session = s;
      if (s && !was) { void ensureProfile(s); void refresh(); }
    });
  });

  async function login() {
    err = null;
    try { await signInGoogle(); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
  }

  // вход по почте — запасная дверь, пока Google-клиент не настроен
  let email = $state('');
  let mailSent = $state(false);
  let mailBusy = $state(false);
  async function loginEmail() {
    const em = email.trim(); if (!em || mailBusy) return;
    err = null; mailBusy = true;
    try { await signInEmail(em); mailSent = true; }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
    finally { mailBusy = false; }
  }

  // Закрытие «на пункт выше»: карточка → тред → лента → закрыть шторку. Свайп-вниз
  // и ✕ идут сюда же — «при закрытии ветки возвращать к списку сообщений».
  function handleClose() {
    if (card) { card = null; return; }
    if (open) { open = null; return; }
    onclose();
  }

  async function openThread(d: Discussion) {
    open = d; comments = []; buzz();
    try {
      comments = await listComments(d.id);
      subbed = await isSubscribed(d.id);
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
  }

  async function toggleSub() {
    if (!open) return;
    const next = !subbed; subbed = next; buzz();     // оптимистично
    try { await subscribeThread(open.id, next); }
    catch (e) { subbed = !next; err = e instanceof Error ? e.message : String(e); }
  }

  // карточка пользователя (тап по имени автора): аватар, счётчики, подписка
  async function openCard(userId: string) {
    buzz(); err = null;
    try { card = await getProfileCard(userId); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  async function toggleFollow() {
    if (!card || cardBusy) return;
    cardBusy = true;
    const next = !card.iFollow;
    try {
      await follow(card.id, next);
      card = { ...card, iFollow: next, followers: card.followers + (next ? 1 : -1) };
      success();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    finally { cardBusy = false; }
  }

  async function submitDiscussion() {
    const t = newTitle.trim(); if (!t || posting) return;
    err = null; posting = true;
    try {
      await createDiscussion({ title: t, body: newBody.trim(), signature });
      newTitle = ''; newBody = ''; creating = false; success();
      await refresh();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    finally { posting = false; }
  }

  async function submitComment() {
    const t = newComment.trim(); if (!t || !open || posting) return;
    err = null; posting = true;
    try {
      await addComment(open.id, t);
      newComment = ''; success();
      comments = await listComments(open.id);
      open.comments = comments.length;
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    finally { posting = false; }
  }

  // удалять может автор своей темы/комментария ИЛИ админ-владелица (по email);
  // сервер всё равно проверит через RLS — кнопка лишь показывает доступное
  function canModify(authorId: string): boolean {
    return !!session && (session.user.id === authorId || isAdmin(session));
  }
  async function deleteDiscussion(d: Discussion) {
    if (!confirm('Удалить обсуждение целиком? Действие необратимо.')) return;
    err = null;
    try { await removeDiscussion(d.id); open = null; success(); await refresh(); }
    catch (e) { err = e instanceof Error ? e.message : String(e); }
  }
  async function deleteComment(c: CommunityComment) {
    if (!open || !confirm('Удалить комментарий?')) return;
    err = null;
    try {
      await removeComment(c.id);
      comments = await listComments(open.id); open.comments = comments.length;
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
  }

  async function heart(d: Discussion) {
    buzz();
    d.myLike = !d.myLike; d.likes += d.myLike ? 1 : -1;   // оптимистично
    try { await toggleLike('discussion', d.id, d.myLike); }
    catch { d.myLike = !d.myLike; d.likes += d.myLike ? 1 : -1; }
  }
  async function heartComment(c: CommunityComment) {
    buzz();
    c.myLike = !c.myLike; c.likes += c.myLike ? 1 : -1;
    try { await toggleLike('comment', c.id, c.myLike); }
    catch { c.myLike = !c.myLike; c.likes += c.myLike ? 1 : -1; }
  }
</script>

<div class="backdrop" onclick={handleClose} role="presentation"></div>
<section class="sheet glass" aria-label="Сообщество" use:bottomSheet={{ onclose: handleClose }}>
  <header>
    {#if open}
      <button class="back" onclick={() => (open = null)}>‹ Лента</button>
    {:else}
      <h2>Сообщество{signature ? ' · аспект' : ''}</h2>
    {/if}
    <div class="hbtns">
      {#if open}
        <button class="link" class:on={subbed} onclick={toggleSub}
          title="Уведомлять о новых комментариях в этой ветке">
          {subbed ? '🔔 Подписана' : '🔕 Подписаться'}</button>
      {/if}
      {#if session && !open}<button class="link" onclick={() => signOut()}>выйти</button>{/if}
      <button class="x" onclick={handleClose} aria-label="Закрыть">✕</button>
    </div>
  </header>
  {#if signature && title && !open}<div class="subt">{title}</div>{/if}

  {#if !configured()}
    <div class="stub">
      <div class="stubstar">✧</div>
      <b>Сообщество ещё не подключено</b>
      <p>Здесь астрологи будут обсуждать аспекты, ставить сердечки и делиться
        наблюдениями. Осталось создать проект по инструкции
        <b>docs/SUPABASE_SETUP.md</b> — и всё оживёт ближайшим обновлением.</p>
    </div>
  {:else if !session}
    <div class="stub">
      <div class="stubstar">✧</div>
      <b>Вход в сообщество</b>
      <p>Обсуждения видны только вошедшим.</p>
      <button class="gbtn" onclick={login}>Войти через Google</button>
      <div class="or">или по ссылке на почту</div>
      {#if mailSent}
        <p class="sentok">Письмо отправлено ✓<br />Откройте его на этом телефоне и
          коснитесь ссылки — она вернёт в приложение уже с входом.</p>
      {:else}
        <div class="mailrow">
          <input type="email" bind:value={email} placeholder="ваша почта…"
            onkeydown={(e) => e.key === 'Enter' && loginEmail()} />
          <button class="btn primary" disabled={mailBusy || !email.trim()} onclick={loginEmail}>
            {mailBusy ? '…' : 'Прислать'}</button>
        </div>
      {/if}
    </div>
  {:else if open}
    <!-- ТРЕД -->
    <div class="thread">
      {#if aspectLabel(open.aspect_signature)}
        <div class="achip glyph">{aspectLabel(open.aspect_signature)}</div>
      {/if}
      <div class="dtitle">{open.title}</div>
      <div class="dmeta">
        <button class="who" onclick={() => open && openCard(open.author_id)}>{open.authorName}</button>
        · {fmt(open.created_at)}</div>
      {#if open.body}<div class="dbody">{open.body}</div>{/if}
      <div class="tactions">
        <button class="heart" class:on={open.myLike} onclick={() => open && heart(open)}>
          {open.myLike ? '♥' : '♡'} {open.likes}</button>
        {#if canModify(open.author_id)}
          <button class="del" onclick={() => open && deleteDiscussion(open)}>🗑 Удалить</button>
        {/if}
      </div>
    </div>
    <div class="lbl">Комментарии ({comments.length})</div>
    {#each comments as c (c.id)}
      <div class="cmt reveal" use:reveal>
        <div class="cmeta"><b>{c.authorName}</b> · {fmt(c.created_at)}</div>
        <div class="cbody">{c.body}</div>
        <div class="tactions">
          <button class="heart small" class:on={c.myLike} onclick={() => heartComment(c)}>
            {c.myLike ? '♥' : '♡'} {c.likes || ''}</button>
          {#if canModify(c.author_id)}
            <button class="del small" onclick={() => deleteComment(c)}>удалить</button>
          {/if}
        </div>
      </div>
    {:else}
      <div class="hint">Пока тихо — будь первой ✧</div>
    {/each}
    <div class="inputrow">
      <textarea bind:value={newComment} rows="1" placeholder="Комментарий…"></textarea>
      <button class="btn primary" onclick={submitComment} disabled={!newComment.trim()}>▶</button>
    </div>
  {:else}
    <!-- ЛЕНТА -->
    {#if creating}
      <div class="newform">
        <input bind:value={newTitle} placeholder="Заголовок обсуждения…" maxlength="200" />
        <textarea bind:value={newBody} rows="3" placeholder="Что заметила, о чём спросить коллег…"></textarea>
        <div class="row">
          <button class="btn" onclick={() => (creating = false)}>Отмена</button>
          <button class="btn primary" onclick={submitDiscussion} disabled={!newTitle.trim() || posting}>
            {posting ? 'Публикую…' : 'Опубликовать'}</button>
        </div>
      </div>
    {:else}
      <button class="btn primary newbtn" onclick={() => (creating = true)}>
        ✎ Новое обсуждение{signature ? ' этого аспекта' : ''}</button>
    {/if}

    {#if loading}<div class="hint">✦ загружаю…</div>{/if}
    {#each feed as d (d.id)}
      <button class="drow reveal" use:reveal onclick={() => openThread(d)}>
        {#if aspectLabel(d.aspect_signature)}
          <div class="achip glyph">{aspectLabel(d.aspect_signature)}</div>
        {/if}
        <div class="dtitle">{d.title}</div>
        {#if d.body}<div class="dprev">{d.body}</div>{/if}
        <div class="dmeta">
          <span class="who" role="button" tabindex="-1" onkeydown={() => {}}
            onclick={(e) => { e.stopPropagation(); openCard(d.author_id); }}>{d.authorName}</span>
          · {fmt(d.created_at)}
          <span class="spacer"></span>
          <span class="cnt">💬 {d.comments}</span>
          <span class="cnt" class:liked={d.myLike}
            onclick={(e) => { e.stopPropagation(); heart(d); }}
            role="button" tabindex="-1" onkeydown={() => {}}>{d.myLike ? '♥' : '♡'} {d.likes}</span>
        </div>
      </button>
    {:else}
      {#if !loading}
        <div class="hint" style="margin-top:14px">
          {signature ? 'Этот аспект ещё не обсуждали — начни первой ✧' : 'Лента пуста — начни первое обсуждение ✧'}</div>
      {/if}
    {/each}
  {/if}

  {#if err}<div class="err">⚠ {err}</div>{/if}
</section>

{#if card}
  <div class="cardback" onclick={() => (card = null)} role="presentation"></div>
  <div class="ucard glass" role="dialog" aria-modal="true" aria-label="Карточка пользователя" tabindex="-1">
    {#if card.avatar}
      <img class="uav" src={card.avatar} alt="" referrerpolicy="no-referrer" />
    {:else}
      <div class="uav ph glyph">✧</div>
    {/if}
    <div class="uname">{card.name}</div>
    <div class="ustats">
      <span><b>{card.posts}</b> тем</span>
      <span><b>{card.followers}</b> подписчиков</span>
      <span><b>{card.following}</b> подписок</span>
    </div>
    {#if !card.isMe}
      <button class="btn primary" class:following={card.iFollow} disabled={cardBusy} onclick={toggleFollow}>
        {card.iFollow ? '✓ Вы подписаны' : '+ Подписаться'}</button>
    {:else}
      <div class="hint">Это вы ✧</div>
    {/if}
    <button class="ux" onclick={() => (card = null)} aria-label="Закрыть">✕</button>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 26; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 92vh; min-height: 45vh; overflow-y: auto; z-index: 27;
    padding: 16px 16px calc(18px + var(--safe-bottom)); border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .subt { color: var(--ink-dim); font-size: 0.86rem; margin-top: 4px; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hbtns { display: flex; align-items: center; gap: 10px; }
  .link { background: transparent; border: none; color: var(--ink-faint); font-size: 0.8rem; text-decoration: underline; }
  .link.on { color: var(--gold); text-decoration: none; }
  .back { background: transparent; border: none; color: var(--accent); font-size: 0.95rem; padding: 4px 0; }

  .stub { text-align: center; padding: 26px 14px; color: var(--ink-dim); }
  .stubstar { font-size: 2rem; color: var(--accent); margin-bottom: 8px; }
  .stub p { font-size: 0.9rem; line-height: 1.55; }
  .gbtn { margin-top: 10px; background: var(--accent); border: none; color: var(--on-accent);
    border-radius: 14px; padding: 12px 22px; font-weight: 600; }
  .or { margin: 14px 0 8px; color: var(--ink-faint); font-size: 0.78rem; }
  .mailrow { display: flex; gap: 8px; max-width: 360px; margin: 0 auto; }
  .mailrow input { flex: 1; min-width: 0; background: #ffffff10; border: 1px solid var(--glass-brd);
    color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; }
  .sentok { color: var(--gold); font-size: 0.88rem; line-height: 1.5; }

  .newbtn { width: 100%; margin: 12px 0; }
  .newform { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
  .newform input, .newform textarea, .inputrow textarea { width: 100%; background: #ffffff10;
    border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; }
  .row { display: flex; justify-content: flex-end; gap: 8px; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 14px; font-size: 0.9rem; }
  .btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }
  .btn:disabled { opacity: 0.5; }

  .drow { display: block; width: 100%; text-align: left; background: #ffffff0c;
    border: 1px solid var(--glass-brd); border-radius: 14px; padding: 12px 14px; margin-bottom: 8px; }
  .dtitle { font-weight: 600; font-family: var(--font-display); }
  .dprev { color: var(--ink-dim); font-size: 0.86rem; margin-top: 3px;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .dmeta { display: flex; align-items: center; gap: 8px; color: var(--ink-faint); font-size: 0.78rem; margin-top: 8px; }
  .spacer { flex: 1; }
  .cnt { color: var(--ink-faint); }
  .cnt.liked { color: var(--rose); }

  .thread { padding: 10px 0 12px; border-bottom: 1px solid var(--glass-brd); }
  .dbody { margin-top: 8px; font-size: 0.92rem; white-space: pre-wrap; }
  .heart { background: transparent; border: 1px solid var(--glass-brd); border-radius: 999px;
    color: var(--ink-dim); padding: 5px 12px; margin-top: 10px; font-size: 0.88rem; }
  .heart.on { color: var(--rose); border-color: color-mix(in srgb, var(--rose) 50%, transparent); }
  .heart.small { border: none; padding: 2px 0; margin-top: 4px; font-size: 0.82rem; }
  .tactions { display: flex; align-items: center; gap: 12px; }
  .del { background: transparent; border: 1px solid color-mix(in srgb, var(--rose) 45%, transparent);
    color: var(--rose); border-radius: 999px; padding: 5px 12px; margin-top: 10px; font-size: 0.84rem; }
  .del.small { border: none; padding: 2px 0; margin-top: 4px; font-size: 0.78rem; color: var(--ink-faint); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin: 12px 0 6px; }
  .cmt { padding: 8px 0; border-bottom: 1px solid var(--glass-brd); }
  .cmeta { font-size: 0.78rem; color: var(--ink-faint); }
  .cmeta b { color: var(--ink-dim); }
  .cbody { font-size: 0.92rem; margin-top: 3px; white-space: pre-wrap; }
  .inputrow { display: flex; gap: 8px; margin-top: 12px; }
  .inputrow textarea { flex: 1; resize: none; }
  /* чип аспекта, из которого написано обсуждение */
  .achip { display: inline-block; font-size: 0.95rem; letter-spacing: 2px; color: var(--silver);
    background: #ffffff10; border: 1px solid var(--glass-brd); border-radius: 999px;
    padding: 2px 10px; margin-bottom: 6px; }
  .hint { color: var(--ink-faint); font-size: 0.86rem; text-align: center; padding: 8px 0; }
  .err { margin-top: 10px; padding: 8px 12px; background: #ff5a5a1e; color: #ffb3b3; border-radius: 10px; font-size: 0.86rem; }
  /* кликабельное имя автора */
  .who { background: transparent; border: none; color: var(--accent); font: inherit;
    font-size: inherit; padding: 0; text-decoration: underline; text-underline-offset: 2px; }
  /* оверлей-карточка пользователя (подписка на человека) */
  .cardback { position: fixed; inset: 0; z-index: 46; background: #0009; }
  .ucard { position: fixed; z-index: 47; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(340px, calc(100% - 40px)); border-radius: 20px; padding: 22px 20px; text-align: center; }
  .uav { width: 76px; height: 76px; border-radius: 50%; object-fit: cover; margin: 0 auto 10px;
    display: block; border: 1px solid var(--glass-brd); }
  .uav.ph { display: flex; align-items: center; justify-content: center; font-size: 2rem;
    color: var(--accent); background: #ffffff10; }
  .uname { font-family: var(--font-display); font-size: 1.15rem; font-weight: 600; }
  .ustats { display: flex; justify-content: center; gap: 14px; margin: 12px 0 16px;
    color: var(--ink-faint); font-size: 0.8rem; }
  .ustats b { color: var(--ink); font-size: 0.95rem; }
  .ucard .btn.primary.following { background: transparent; border: 1px solid var(--glass-brd); color: var(--ink-dim); }
  .ux { position: absolute; top: 10px; right: 12px; background: transparent; border: none;
    color: var(--ink-faint); font-size: 1rem; }
</style>
