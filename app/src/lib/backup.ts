/**
 * Экспорт/импорт данных (§5/§12, раунд 5).
 *  • Экспорт: на устройстве — Filesystem (папка Documents, видна в «Файлах») +
 *    системный «Поделиться» (отправить/сохранить куда угодно); в вебе —
 *    скачивание blob. File System Access API в Android WebView нет, а
 *    <a download> там ненадёжен — поэтому Share.
 *  • Импорт: общий <input type="file"> (работает и в WebView, и в браузере) —
 *    остаётся в DataPanel, здесь только экспорт.
 *
 * ВАЖНО: импорты плагинов — СТАТИЧЕСКИЕ. Динамический import() ленивого чанка
 * виснет в офлайн-WebView (тот же корень, что чинили в reminders.ts).
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { exportText } from './db.ts';

export async function exportBackup(): Promise<string> {
  const text = exportText();
  const filename = `astra-data-${new Date().toISOString().slice(0, 10)}.json`;

  if (Capacitor.isNativePlatform()) {
    // Пишем в общую папку Documents — её видно в приложении «Файлы» (владелица
    // спрашивала «куда экспорт?»). Если не вышло (старый Android без права
    // писать наружу) — во внутренний кэш, как раньше.
    let uri = '';
    let place = '';
    try {
      const res = await Filesystem.writeFile({
        path: filename, data: text, directory: Directory.Documents, encoding: Encoding.UTF8,
      });
      uri = res.uri; place = `«Файлы» → Documents → ${filename}`;
    } catch {
      const res = await Filesystem.writeFile({
        path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8,
      });
      uri = res.uri; place = `внутренние файлы приложения (${filename}) — лучше отправь себе через «Поделиться»`;
    }
    try {
      await Share.share({ title: 'Данные Astra', text: 'Резервная копия Astra', url: uri });
      return `Файл готов — выбери, куда сохранить или отправить. Копия: ${place}`;
    } catch {
      // пользователь закрыл диалог «поделиться» — файл всё равно записан
      return `Сохранено: ${place}`;
    }
  }

  // веб — скачивание читаемого JSON
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return 'Экспортировано (скачан файл).';
}
