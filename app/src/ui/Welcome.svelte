<script lang="ts">
  /** Приветствие первого запуска (раунд 5): какая школа и по каким правилам
   *  считаем. Показывается, пока settings.seenWelcome=false; повторно — из настроек. */
  import { WELCOME } from '../lib/lore.ts';
  let { onclose }: { onclose: () => void } = $props();
</script>

<div class="wrap">
  <section class="card glass frost">
    <div class="logo glyph">☉ ☽ ☿ ♀ ♂ ♃ ♄</div>
    <h1>{WELCOME.title}</h1>
    <p class="intro">{WELCOME.intro}</p>
    <p class="school">{WELCOME.school}</p>

    <div class="rules">
      <div class="rt">По каким правилам считаем</div>
      <ul>{#each WELCOME.rules as r}<li>{r}</li>{/each}</ul>
    </div>

    <button class="go" onclick={onclose}>Понятно, начать</button>
  </section>
</div>

<style>
  .wrap { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
    padding: 16px; background: #050714e8; overflow-y: auto; }
  .card { width: min(560px, 100%); max-height: 92vh; overflow-y: auto;
    padding: 22px 20px calc(20px + env(safe-area-inset-bottom)); border-radius: 22px; }
  .logo { text-align: center; font-size: 1.6rem; letter-spacing: 6px; color: var(--silver); opacity: 0.85; }
  h1 { text-align: center; font-size: 1.5rem; margin: 10px 0 6px; }
  .intro { text-align: center; color: var(--ink-dim); margin: 0 0 16px; }
  .school { font-size: 0.92rem; color: var(--ink-dim); background: #ffffff0c; border: 1px solid var(--glass-brd);
    border-radius: 14px; padding: 12px 14px; margin: 0 0 16px; }
  .rules .rt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1.2px; color: var(--accent);
    font-weight: 600; margin-bottom: 8px; }
  ul { margin: 0 0 18px; padding-left: 18px; }
  li { color: var(--ink-dim); font-size: 0.9rem; margin-bottom: 8px; line-height: 1.4; }
  .go { display: block; width: 100%; background: var(--accent); border: none; color: var(--on-accent); font-weight: 600;
    font-size: 1rem; border-radius: 14px; padding: 13px; }
</style>
