<script lang="ts">
  /** Контекстная «?» рядом с термином. Тап открывает глоссарий ПОВЕРХ всего.
   *  Правило проекта «сам элемент, не рамка»: без GlowCard/подсветки вокруг. */
  import { openGloss } from '../lib/studyStore.svelte.ts';
  import { tick } from '../lib/haptics.ts';
  let { k }: { k: string } = $props();
</script>

<!-- stopPropagation ОБЯЗАТЕЛЕН: «?» часто внутри кликабельных карточек
     (AspectCard открывает трактовку) — тап по «?» не должен провалиться в родителя. -->
<button class="hint-q" aria-label="Что это?"
  onclick={(e) => { e.stopPropagation(); tick(); openGloss(k); }}>?</button>

<style>
  .hint-q {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; padding: 0; margin: 0 2px;
    /* хит-зона ≥ 28px через невидимый отступ, а видимый кружок 16px */
    box-sizing: content-box; border: 1px solid var(--glass-brd);
    border-radius: 50%; background: #ffffff10; color: var(--ink-faint);
    font-size: 0.7rem; font-weight: 700; line-height: 1; cursor: pointer;
    flex: none; vertical-align: middle;
  }
  .hint-q:hover { color: var(--ink); border-color: var(--accent); }
</style>
