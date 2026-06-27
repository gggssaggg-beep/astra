import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // относительные пути — папка переносимая (любой хост / обёртка APK)
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Astra — небо по дням',
        short_name: 'Astra',
        description: 'Оффлайн астро-приложение: транзиты, аспекты, события, журнал.',
        lang: 'ru',
        theme_color: '#0b1026',
        background_color: '#070a1c',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // прекэш оболочки + .wasm (543 КБ); 12 МБ .data — рантайм-кэшем ниже
        globPatterns: ['**/*.{js,css,html,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 4_000_000,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/wasm/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sweph-files',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // swisseph-wasm грузит .wasm/.data относительно своего модуля (import.meta.url):
  // в dev — из node_modules; в проде — из /wasm (см. app/public/wasm).
  optimizeDeps: { exclude: ['swisseph-wasm'] },
  assetsInclude: ['**/*.se1'],
  server: { fs: { allow: ['..'] } },
});
