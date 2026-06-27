import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.astra.sky',
  appName: 'Astra',
  webDir: 'dist', // собранная папка (npm run build) — Capacitor раздаёт её локально на телефоне
};

export default config;
