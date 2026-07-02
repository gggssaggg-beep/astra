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
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initOta } from './lib/ota.ts';

// OTA: notifyAppReady нужно отправить КАК МОЖНО РАНЬШЕ (до тяжёлого mount) —
// иначе Capgo решит, что новый бандл не поднялся, и откатит его к вшитому.
void initOta();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
