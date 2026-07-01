<script lang="ts">
  import { onMount } from 'svelte';
  import type { Engine } from '../engine/index.ts';
  import { getKey, setKey, clearKey } from '../lib/secret.ts';
  import { systemPrompt, askClaude, type ChatMsg } from '../lib/chat.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { db, uid } from '../lib/db.ts';
  import { noteDateStr } from '../lib/journal.ts';

  let { engine, date, tz, orbOf, seed, source, onclose }:
    { engine: Engine; date: Date; tz: string; orbOf: (name: string) => number;
      seed?: string | null;
      source?: { objects: string[]; aspectSignature?: string; title?: string } | null;
      onclose: () => void } = $props();

  let key = $state(getKey());
  let keyInput = $state('');
  let editingKey = $state(!getKey());

  let messages = $state<ChatMsg[]>([]);
  let input = $state('');
  let busy = $state(false);
  let err = $state<string | null>(null);
  let saved = $state(false);   // разговор уже записан в журнал (показываем подпись)

  // Автосохранение: вся переписка с Claude пишется в бортовой журнал сама — ОДНА
  // запись на разговор (upsert по noteId), обновляется после каждого ответа. Если
  // чат открыт из карточки аспекта — тегируется объектами и сигнатурой, поэтому
  // попадает в «Похожие прошлые» этого аспекта и в фильтр по планете.
  let noteId: string | null = null;
  let noteCreatedAt = '';
  function persistChat() {
    if (!messages.length) return;
    if (!noteId) { noteId = uid(); noteCreatedAt = new Date().toISOString(); }
    const body = messages
      .map((m) => (m.role === 'user' ? 'Вопрос: ' : 'Claude: ') + m.content)
      .join('\n\n');
    const head = source?.title ? `Обсуждение аспекта ${source.title} с Claude\n\n` : 'Чат с Claude\n\n';
    db.notes.put({
      id: noteId, createdAt: noteCreatedAt, date: noteDateStr(date),
      text: head + body, objects: source?.objects ?? [], aspectSignature: source?.aspectSignature,
    });
    saved = true;
  }

  function saveKey() {
    const k = keyInput.trim();
    if (!k) return;
    setKey(k); key = k; keyInput = ''; editingKey = false;
    if (seed && !messages.length) send(seed);   // был ждущий вопрос — отправить
  }
  function forgetKey() { clearKey(); key = ''; editingKey = true; }

  // открыт с затравкой (обсуждение аспекта/планеты): отправить сразу при наличии
  // ключа, иначе оставить ждать — уйдёт после ввода ключа (см. saveKey).
  onMount(() => { if (seed && key) send(seed); });

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy || !key) return;
    err = null;
    messages = [...messages, { role: 'user', content: q }];
    input = '';
    busy = true;
    try {
      const reply = await askClaude(key, systemPrompt(engine, date, tz, orbOf), messages);
      messages = [...messages, { role: 'assistant', content: reply || '(пустой ответ)' }];
      persistChat();   // авто-запись разговора в журнал после каждого ответа
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    } finally { busy = false; }
  }
  const quick = ['Сводка неба на сегодня', 'Что главное и на что обратить внимание?'];
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Чат трактовок" use:bottomSheet={{ onclose }}>
  <header>
    <h2>Чат трактовок · Claude</h2>
    <div class="hbtns">
      {#if key}<button class="link" onclick={forgetKey} title="Сменить ключ">ключ</button>{/if}
      <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
    </div>
  </header>

  {#if editingKey || !key}
    <div class="keybox">
      <div class="hint">Вставь свой ключ Anthropic (Claude). Хранится только на этом устройстве,
        не в файле данных и не в гите. Без ключа чат недоступен — остальное приложение работает.</div>
      <div class="krow">
        <input class="kin" type="password" placeholder="sk-ant-…" bind:value={keyInput}
          onkeydown={(e) => e.key === 'Enter' && saveKey()} />
        <button class="btn primary" onclick={saveKey} disabled={!keyInput.trim()}>Сохранить</button>
      </div>
    </div>
  {:else}
    <div class="msgs">
      {#if !messages.length}
        <div class="empty">Спроси о трактовке дня. Модель видит уже посчитанные позиции,
          аспекты и события — и трактует их.</div>
        <div class="quick">{#each quick as q}<button onclick={() => send(q)}>{q}</button>{/each}</div>
      {/if}
      {#each messages as m}
        <div class="m {m.role}">{m.content}</div>
      {/each}
      {#if busy}<div class="m assistant busy">…думает…</div>{/if}
      {#if err}<div class="m err">⚠ {err}</div>{/if}
    </div>
    {#if saved}
      <div class="autosave">✓ Разговор сохраняется в журнал автоматически</div>
    {/if}
    <div class="inputrow">
      <textarea bind:value={input} rows="1" placeholder="Спросить о дне…"
        onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}></textarea>
      <button class="btn primary" onclick={() => send(input)} disabled={busy || !input.trim()}>▶</button>
    </div>
  {/if}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; backdrop-filter: blur(2px); z-index: 22; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; display: flex; flex-direction: column; z-index: 23; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; animation: up 0.25s ease; }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  h2 { margin: 0; font-size: 1.05rem; }
  .hbtns { display: flex; align-items: center; gap: 10px; }
  .link { background: transparent; border: none; color: var(--accent); font-size: 0.82rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin-bottom: 10px; }
  .krow, .inputrow { display: flex; gap: 8px; }
  .kin, textarea { flex: 1; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; resize: none; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 14px; }
  .btn.primary { background: var(--accent); border-color: transparent; color: #0b0f24; font-weight: 600; }
  .btn:disabled { opacity: 0.5; }
  .msgs { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 6px 0 10px; min-height: 200px; }
  .empty { color: var(--ink-faint); font-size: 0.88rem; }
  .quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .quick button { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 999px; padding: 7px 13px; font-size: 0.82rem; }
  .m { padding: 9px 12px; border-radius: 12px; font-size: 0.92rem; white-space: pre-wrap; max-width: 92%; }
  .m.user { align-self: flex-end; background: var(--accent); color: #0b0f24; }
  .m.assistant { align-self: flex-start; background: #ffffff12; border: 1px solid var(--glass-brd); }
  .m.busy { color: var(--ink-faint); }
  .m.err { align-self: stretch; color: var(--rose); background: transparent; }
  .autosave { color: var(--gold); font-size: 0.78rem; margin: 0 0 8px; text-align: center; opacity: 0.85; }
</style>
