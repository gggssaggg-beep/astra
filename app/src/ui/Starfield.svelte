<script lang="ts">
  /**
   * Летающие пылинки-звёздочки (тема neon-stardust, п.2 DESIGN_BRIEF).
   * Один фоновый <canvas>, ниже контента — лёгкий дрейф + мерцание, без
   * внешних библиотек. Не создаёт дополнительных DOM-узлов на кадр.
   */
  import { onMount } from 'svelte';

  const COUNT = 62;
  const BIG_R = 1.7;      // радиус, начиная с которого рисуем гало

  interface Dust { x: number; y: number; vx: number; vy: number; r: number; a: number; k: number; ph: number; }

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    let dust: Dust[] = [];

    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    function spawn(): Dust {
      return {
        x: Math.random() * w, y: Math.random() * h,
        vx: rnd(-0.012, 0.012), vy: rnd(-0.01, 0.014),
        r: rnd(0.6, 2.4), a: rnd(0.3, 0.85),
        k: rnd(0.0006, 0.0018), ph: rnd(0, Math.PI * 2),
      };
    }

    function resize() {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    dust = Array.from({ length: COUNT }, spawn);
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();

    function frame(t: number) {
      const dt = Math.min(t - last, 50); // защита от скачка при возврате в фон
      last = t;
      ctx!.clearRect(0, 0, w, h);
      for (const p of dust) {
        if (!reduced) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
          if (p.y < -4) p.y = h + 4; else if (p.y > h + 4) p.y = -4;
        }
        const pulse = 0.55 + 0.45 * Math.sin(t * p.k + p.ph);
        const alpha = p.a * pulse;
        if (p.r > BIG_R) {
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(230, 236, 255, ${(alpha * 0.15).toFixed(3)})`;
          ctx!.fill();
        }
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx!.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<canvas bind:this={canvas} class="stardust" aria-hidden="true"></canvas>

<style>
  .stardust { position: fixed; inset: 0; z-index: -1; pointer-events: none; display: block; }
</style>
