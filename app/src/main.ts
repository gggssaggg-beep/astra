import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/unbounded/500.css';
import '@fontsource/unbounded/600.css';
import '@fontsource/unbounded/700.css';
import './lib/fonts.ts';   // выбор шрифта интерфейса (регистрирует @font-face 10 семейств)
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initOta, resumeOta } from './lib/ota.ts';

// OTA: notifyAppReady нужно отправить КАК МОЖНО РАНЬШЕ (до тяжёлого mount) —
// иначе Capgo решит, что новый бандл не поднялся, и откатит его к вшитому.
void initOta();

// Докачка при возврате: сворачивание/блокировка экрана в Android WebView
// замораживает JS и рвёт скачивание бандла — при возврате на экран докачиваем.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void resumeOta();
});

const app = mount(App, { target: document.getElementById('app')! });

export default app;
