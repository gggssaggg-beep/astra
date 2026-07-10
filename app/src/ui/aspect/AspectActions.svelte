<script lang="ts">
  /** Действия шторки аспекта (7б, #14): акцентная «Обсудить с Claude» + компактный
   *  ряд «Промпт для ИИ · Сообщество» (партия 5 аудита, #6). Бейдж 💬 — счётчик
   *  обсуждений сообщества, тихо 0 без входа/сети. Проводка — колбэки родителя
   *  (у транзитной и статичной шторок она разная: ondiscuss(rec) vs onchat(seed)). */
  import { discussionCounts } from '../../lib/community.ts';
  let { sig, title, label = 'Обсудить с Claude', ondiscuss, onprompt, oncommunity }:
    { sig: string; title: string; label?: string;
      ondiscuss?: () => void; onprompt: () => void;
      oncommunity?: (sig: string, title: string) => void } = $props();
  let discCount = $state(0);
  $effect(() => {
    let cancelled = false;
    void discussionCounts([sig]).then((m) => { if (!cancelled) discCount = m.get(sig) ?? 0; });
    return () => { cancelled = true; };
  });
</script>

<button class="discuss" onclick={() => ondiscuss?.()}>
  <span class="dg glyph">💬</span>
  <span>{label}<small>по заложенным архетипам участников</small></span>
</button>
<div class="actrow">
  <button class="discuss ghost mini" title="готовый текст для ChatGPT, Gemini и др." onclick={onprompt}>
    <span class="dg glyph">📋</span>
    <span>Промпт для ИИ</span>
  </button>
  <button class="discuss ghost mini"
    title={discCount ? 'коллеги уже обсуждают этот аспект — загляни' : 'что говорят коллеги про этот аспект'}
    onclick={() => oncommunity?.(sig, title)}>
    <span class="dg glyph">✧</span>
    <span>Сообщество</span>
    {#if discCount}<span class="dbadge">💬 {discCount}</span>{/if}
  </button>
</div>

<style>
  .discuss { display: flex; align-items: center; gap: 12px; width: 100%; margin-top: 12px;
    background: var(--accent); border: none; color: var(--on-accent); border-radius: 14px; padding: 12px 14px; text-align: left; }
  .discuss .dg { font-size: 1.3rem; }
  .discuss.ghost { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); margin-top: 8px; }
  /* два вторичных действия в один ряд (высота одной строки, без подписей) */
  .actrow { display: flex; gap: 8px; margin-top: 8px; }
  .discuss.ghost.mini { flex: 1; min-width: 0; margin-top: 0; justify-content: center;
    gap: 6px; padding: 10px 10px; font-size: 0.86rem; }
  .discuss.ghost.mini .dg { font-size: 1.05rem; }
  .discuss.ghost.mini .dbadge { margin-left: 2px; }
  .dbadge { margin-left: auto; align-self: center; font-size: 0.78rem; color: var(--accent);
    background: #ffffff12; border: 1px solid var(--glass-brd); border-radius: 999px; padding: 2px 9px; white-space: nowrap; }
  .discuss span { font-weight: 600; }
  .discuss small { display: block; font-weight: 400; opacity: 0.8; font-size: 0.76rem; }
</style>
