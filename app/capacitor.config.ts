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
    // Локальные уведомления: монохромная иконка статус-бара (res/drawable/
    // ic_stat_astra) + фиолетовый акцент. Каналы (звук/heads-up) создаём в
    // lib/notifications.ts (createChannel).
    LocalNotifications: {
      smallIcon: 'ic_stat_astra',
      iconColor: '#9b6bff',
    },
  },
};

export default config;
