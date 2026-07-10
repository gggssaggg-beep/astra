<script lang="ts">
  /**
   * Летающие пылинки-звёздочки (тема neon-stardust, п.2 DESIGN_BRIEF).
   * Один фоновый <canvas>, ниже контента — лёгкий дрейф + мерцание, без
   * внешних библиотек. Не создаёт дополнительных DOM-узлов на кадр.
   */
  import { onMount } from 'svelte';

  // слабое железо (≤4 логич. ядра): чуть меньше пылинок и кадров — глазом почти
  // неотличимо, но заметно легче для батареи (Б-3 энерго-аудита). Сильные телефоны
  // и десктоп (>4 ядер) — прежняя плотность/частота, красоту не режем.
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  const COUNT = weak ? 54 : 81;
  const BIG_R = 1.7;      // радиус, начиная с которого рисуем гало
  const MIN_FRAME_MS = weak ? 42 : 31; // ~24 fps на слабом, ~30 fps иначе (вдвое дешевле 60)

  interface Dust { x: number; y: number; vx: number; vy: number; r: number; a: number; k: number; ph: number; c: number; }

  // тёплая палитра блёсток для светлой темы «Рассвет» (солнце/коралл/золото)
  const SPARKLE = ['255, 244, 214', '246, 168, 33', '255, 157, 110', '255, 217, 140'];

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
        c: Math.random(),
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

    // Пылинки/блёстки просвечивают ВСЁ приложение (просьба владелицы), не только
    // главный экран: канвас лежит ПОВЕРХ шторок (z-index в стиле). Раз он больше
    // не под backdrop-blur шторки — его перерисовка не заставляет GPU пересчитывать
    // размытие, поэтому прежней паузы «пока открыта шторка» не нужно (перф ок).

    function frame(t: number) {
      if (t - last < MIN_FRAME_MS) { raf = requestAnimationFrame(frame); return; }
      const dt = Math.min(t - last, 50); // защита от скачка при возврате в фон
      last = t;
      ctx!.clearRect(0, 0, w, h);
      // на светлой теме «Рассвет» — тёплые блёстки с лучиками; на тёмной — белая пыль
      const light = document.documentElement.dataset.theme === 'light';
      for (const p of dust) {
        if (!reduced) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
          if (p.y < -4) p.y = h + 4; else if (p.y > h + 4) p.y = -4;
        }
        if (light) {
          // блёстка: резче мерцает (twinkle), тёплый цвет, у крупных — 4 лучика.
          // На «Рассвете» блёстки заметнее (ярче/крупнее) — жалоба «ничего интересного»
          const s = Math.sin(t * p.k * 1.6 + p.ph);
          const twinkle = s * s * s * s;               // острый всплеск вместо плавной волны
          const alpha = p.a * (0.38 + 0.72 * twinkle);
          const tint = SPARKLE[(p.c * SPARKLE.length) | 0];
          // тёплое гало
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r * 3.8, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(${tint}, ${(alpha * 0.24).toFixed(3)})`;
          ctx!.fill();
          // ядро
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.r * 1.05, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(${tint}, ${alpha.toFixed(3)})`;
          ctx!.fill();
          // лучики-искра у крупных блёсток на пике мерцания
          if (p.r > BIG_R - 0.4 && twinkle > 0.12) {
            const len = p.r * (2.8 + 5.5 * twinkle);
            ctx!.strokeStyle = `rgba(${tint}, ${(alpha * 0.9).toFixed(3)})`;
            ctx!.lineWidth = 0.8;
            ctx!.beginPath();
            ctx!.moveTo(p.x - len, p.y); ctx!.lineTo(p.x + len, p.y);
            ctx!.moveTo(p.x, p.y - len); ctx!.lineTo(p.x, p.y + len);
            ctx!.stroke();
          }
        } else {
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
      }
      raf = requestAnimationFrame(frame);
    }

    // «Экономия аккумулятора»: при data-saver='on' на <html> НЕ крутим цикл —
    // блёстки главный источник расхода. Реагируем на переключение тумблера вживую.
    const saverOn = () => document.documentElement.dataset.saver === 'on';
    function start() { if (!raf && !saverOn()) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } ctx!.clearRect(0, 0, w, h); }
    start();
    const mo = new MutationObserver(() => (saverOn() ? stop() : start()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-saver'] });

    return () => {
      stop();
      mo.disconnect();
      window.removeEventListener('resize', resize);
    };
  });
</script>

<canvas bind:this={canvas} class="stardust" aria-hidden="true"></canvas>

<style>
  /* z-index 35: поверх шторок (z ≤ 27) и их затемнения — блёстки видны во всех
     меню; но под боковой нитью прокрутки (45) и приветствием (40). Не ловит
     касания (pointer-events:none) — просто мерцающая пыль над всем приложением. */
  .stardust { position: fixed; inset: 0; z-index: 35; pointer-events: none; display: block; }
</style>
