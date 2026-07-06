<script lang="ts">
  /** Окно «Промпт для любой ИИ»: показывает готовый полный промпт и даёт его
   *  скопировать (для ChatGPT/Gemini/др. — работа с картой на любом сервисе). */
  import { bottomSheet } from '../lib/sheet.ts';
  import { success } from '../lib/haptics.ts';

  let { text, onclose }: { text: string; onclose: () => void } = $props();

  let copied = $state(false);
  async function copy(): Promise<void> {
    try { await navigator.clipboard.writeText(text); }
    catch {
      // фолбэк для старых WebView без Clipboard API
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* совсем никак */ }
      ta.remove();
    }
    copied = true; success();
    setTimeout(() => (copied = false), 1800);
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Промпт для ИИ" use:bottomSheet={{ onclose }}>
  <header><h2>Промпт для любой ИИ</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Полный корректный промпт с данными этой карты. Скопируй и вставь
    в ChatGPT, Gemini или другой ИИ — расчёт уже сделан, останется трактовать.</div>
  <button class="btn primary copy" onclick={copy}>{copied ? '✓ Скопировано' : '📋 Скопировать промпт'}</button>
  <pre class="promptbox">{text}</pre>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 28; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 29; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.82rem; margin: 6px 0 10px; }
  .btn.primary { background: var(--accent); border: none; color: var(--on-accent); font-weight: 600;
    border-radius: 14px; padding: 12px; width: 100%; margin-bottom: 12px; }
  .promptbox { white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono);
    font-size: 0.78rem; line-height: 1.5; color: var(--ink-dim); background: #ffffff0a;
    border: 1px solid var(--glass-brd); border-radius: 12px; padding: 12px; margin: 0; }
</style>
