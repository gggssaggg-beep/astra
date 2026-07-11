<script lang="ts">
  /**
   * Инлайновый глиф планеты/узла/аспекта/знака/℞ — свой SVG-контур вместо
   * системного символьного шрифта (одинаково на всех Android). Размер = 1em
   * (наследует font-size места), красится по `style` (signStyle) ровно как знаки
   * зодиака: серебро/золото/стихии + градиенты переливание/радуга (GlyphDefs).
   * currentColor — фолбэк, если стиль не задан. См. glyphPaths.ts.
   */
  import { PLANET_PATHS, ASPECT_PATHS, ASPECT_SYMBOL_PATHS, RETRO_PATH } from './glyphPaths.ts';
  import { SIGN_PATHS } from './signIcons.ts';
  import { glyphStyle } from '../lib/glyphStyle.svelte.ts';
  import type { SignStyle } from '../lib/models.ts';

  let { kind, name = '', index = 0, style, sel = false }:
    { kind: 'planet' | 'aspect' | 'sign' | 'retro'; name?: string; index?: number;
      style?: SignStyle; sel?: boolean } = $props();

  const ELEM = ['#ff8a5b', '#7fd99a', '#7fd0ff', '#b39bff'];
  // стиль: явный проп → общий стор (App кладёт туда резолвнутый effSignStyle)
  const eff = $derived(style ?? glyphStyle.v);
  const paths = $derived(
    kind === 'planet' ? (PLANET_PATHS[name] ?? [])
    : kind === 'aspect' ? (ASPECT_PATHS[name] ?? ASPECT_SYMBOL_PATHS[name] ?? [])
    : kind === 'retro' ? RETRO_PATH
    : (SIGN_PATHS[index] ?? []));
  const paint = $derived(
    sel ? 'var(--neon-cyan)'
    : eff === 'silver' ? 'var(--silver)'
    : eff === 'gold' ? 'var(--gold)'
    : eff === 'element' ? ELEM[(((index % 4) + 4) % 4)]
    : eff === 'rainbow' ? 'url(#glyphRainbow)'
    : 'currentColor');
</script>

<svg class="gl" class:sel viewBox="0 0 24 24" fill="none" style="stroke:{paint}"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#each paths as d}<path {d} />{/each}
</svg>

<style>
  .gl { display: inline-block; width: 1em; height: 1em; vertical-align: -0.14em; overflow: visible; }
  .gl.sel { filter: drop-shadow(0 0 4px var(--neon-cyan)); }
</style>
