<script lang="ts">
  /**
   * Интерфейсная иконка из единого контурного набора (icons.ts) — вместо
   * эмодзи. Размер 1em (наследует font-size места), цвет currentColor
   * (наследует цвет текста: золото в Библиотеке, акцент в активной вкладке).
   */
  import { ICONS } from './icons.ts';
  let { name }: { name: string } = $props();
</script>

<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#each ICONS[name] ?? [] as d}<path {d} />{/each}
</svg>

<style>
  .ui-icon { display: inline-block; width: 1em; height: 1em; vertical-align: -0.125em; overflow: visible; }
</style>
