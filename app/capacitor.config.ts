import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.astra.sky',
  appName: 'Astra',
  webDir: 'dist', // собранная папка (npm run build) — Capacitor раздаёт её локально на телефоне
  plugins: {
    // OTA: используем Capgo как загрузчик в РУЧНОМ режиме (наш манифест на GitHub),
    // штатный авто-канал Capgo выключаем, чтобы он не лез на свой бэкенд. См. lib/ota.ts.
    CapacitorUpdater: {
      autoUpdate: false,
    },
  },
};

export default config;
