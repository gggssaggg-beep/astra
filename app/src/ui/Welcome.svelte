<script lang="ts">
  /** Приветствие первого запуска (раунд 5): какая школа и по каким правилам
   *  считаем. Показывается, пока settings.seenWelcome=false; повторно — из настроек.
   *  Онбординг П1 (2026-07-11): три шага — приветствие → «Добавь себя» (натальная
   *  карта пользователя) → предложение тура. */
  import { WELCOME } from '../lib/lore.ts';
  import { pushScrollLock } from '../lib/sheet.ts';
  import { db } from '../lib/db.ts';
  import PersonForm from './charts/PersonForm.svelte';
  let { onclose, onstarttour, defaultTz = 'UTC' }:
    { onclose: () => void; onstarttour?: () => void; defaultTz?: string } = $props();

  // пока приветствие открыто — фоновая лента дней не должна проматываться под ним
  $effect(() => pushScrollLock());

  // шаги приветствия: интро → добавь себя → предложение тура
  let step = $state<'intro' | 'self' | 'offer'>('intro');

  // сохранить нового человека как «мою карту» (транзиты к наталу заработают)
  function onSelfSaved(id: string): void {
    db.settings.set({ ...db.settings.get(), transitSelfId: id });
    step = 'offer';
  }
</script>

<div class="wrap">
  <section class="card glass frost">
    {#if step === 'intro'}
      <div class="logo glyph">☉ ☽ ☿ ♀ ♂ ♃ ♄</div>
      <h1>{WELCOME.title}</h1>
      <p class="intro">{WELCOME.intro}</p>
      <p class="school">{WELCOME.school}</p>

      <div class="rules">
        <div class="rt">По каким правилам считаем</div>
        <ul>{#each WELCOME.rules as r}<li>{r}</li>{/each}</ul>
      </div>

      <button class="go" onclick={() => (step = 'self')}>Дальше →</button>

    {:else if step === 'self'}
      <h1>Добавь себя</h1>
      <p class="intro">Впиши свою дату рождения — и приложение будет показывать,
        как небо каждого дня трогает <b>именно твою</b> карту: транзиты к наталу,
        «твой Меркурий», «твоё Солнце». Без этого термины остаются в вакууме.</p>
      <p class="mini">Время и место — по желанию. Не помнишь время — так и скажи,
        возьмём полдень. Позже это всё правится в <b>«Карты → + Добавить человека»</b>.</p>

      <div class="formhost">
        <PersonForm person={null} {defaultTz} embedded defaultName="Я"
          saveLabel="Это я — сохранить"
          onsaved={onSelfSaved} ondeleted={() => {}}
          oncancel={() => (step = 'intro')} onclose={() => (step = 'intro')} />
      </div>

      <button class="go ghost" onclick={() => (step = 'offer')}>Пропустить — добавлю позже</button>

    {:else}
      <div class="logo glyph">✨</div>
      <h1>Готово</h1>
      <p class="intro">Можно осмотреться. Если хочешь — короткое обучение проведёт
        по разделам за пару минут. Не понял слово в интерфейсе — жми на «?» рядом
        с ним.</p>

      {#if onstarttour}
        <button class="go tour" onclick={onstarttour}>🎓 Пройти обучение</button>
        <button class="go ghost" onclick={onclose}>Начать без обучения</button>
      {:else}
        <button class="go" onclick={onclose}>Понятно, начать</button>
      {/if}
    {/if}
  </section>
</div>

<style>
  .wrap { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
    padding: 16px; background: #050714e8; overflow-y: auto; }
  .card { width: min(560px, 100%); max-height: 92vh; overflow-y: auto;
    padding: 22px 20px calc(20px + var(--safe-bottom)); border-radius: 22px; }
  .logo { text-align: center; font-size: 1.6rem; letter-spacing: 6px; color: var(--silver); opacity: 0.85; }
  h1 { text-align: center; font-size: 1.5rem; margin: 10px 0 6px; }
  .intro { text-align: center; color: var(--ink-dim); margin: 0 0 16px; }
  .mini { color: var(--ink-faint); font-size: 0.84rem; margin: 0 0 16px; text-align: center; }
  .school { font-size: 0.92rem; color: var(--ink-dim); background: #ffffff0c; border: 1px solid var(--glass-brd);
    border-radius: 14px; padding: 12px 14px; margin: 0 0 16px; }
  .rules .rt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1.2px; color: var(--accent);
    font-weight: 600; margin-bottom: 8px; }
  ul { margin: 0 0 18px; padding-left: 18px; }
  li { color: var(--ink-dim); font-size: 0.9rem; margin-bottom: 8px; line-height: 1.4; }
  /* рамка вокруг встроенной формы человека — визуально отделяет от подачи */
  .formhost { background: #ffffff08; border: 1px solid var(--glass-brd); border-radius: 16px;
    padding: 14px 14px 4px; margin: 0 0 12px; }
  .go { display: block; width: 100%; background: var(--accent); border: none; color: var(--on-accent); font-weight: 600;
    font-size: 1rem; border-radius: 14px; padding: 13px; }
  .go.ghost { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); margin-top: 8px; }
</style>
