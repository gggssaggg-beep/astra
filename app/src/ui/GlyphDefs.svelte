<script lang="ts">
  /**
   * Общие SVG-градиенты для стилей «Переливание»/«Радуга» глифов (Glyph.svelte).
   * Монтируется ОДИН раз в App — все инлайновые глифы ссылаются на url(#glyphShimmer)
   * / url(#glyphRainbow). Рендерим ТОЛЬКО активный градиент (вне стиля SMIL-анимация
   * впустую жгла бы батарею — перф-правило WebView; при экономии App подменяет стиль).
   * В колесе свои per-uid градиенты — этот модуль для HTML-глифов вне SVG-колеса.
   */
  import type { SignStyle } from '../lib/models.ts';
  let { style = 'gold' }: { style?: SignStyle } = $props();
</script>

{#if style === 'shimmer' || style === 'rainbow'}
  <svg width="0" height="0" aria-hidden="true" style="position:absolute">
    <defs>
      {#if style === 'shimmer'}
        <linearGradient id="glyphShimmer" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#f3c969" />
          <stop offset="50%" stop-color="#cdd6ff" />
          <stop offset="100%" stop-color="#9b8cff" />
          <animateTransform attributeName="gradientTransform" type="translate"
            values="-1 0;1 0;-1 0" dur="5s" repeatCount="indefinite" />
        </linearGradient>
      {/if}
      {#if style === 'rainbow'}
        <linearGradient id="glyphRainbow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ff6b6b" />
          <stop offset="25%" stop-color="#f3c969" />
          <stop offset="50%" stop-color="#7fd99a" />
          <stop offset="75%" stop-color="#7fd0ff" />
          <stop offset="100%" stop-color="#b39bff" />
          <animateTransform attributeName="gradientTransform" type="rotate"
            values="0 .5 .5;360 .5 .5" dur="14s" repeatCount="indefinite" />
        </linearGradient>
      {/if}
    </defs>
  </svg>
{/if}
