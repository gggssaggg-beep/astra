import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initOta } from './lib/ota.ts';

const app = mount(App, { target: document.getElementById('app')! });

// OTA-обновление веб-части (на устройстве; в вебе — no-op). Не блокируем запуск.
void initOta();

export default app;
