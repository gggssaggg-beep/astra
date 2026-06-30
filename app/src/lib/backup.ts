/**
 * Экспорт/импорт данных (§5/§12, раунд 5).
 *  • Экспорт: на устройстве — Filesystem (кэш) + системный «Поделиться» (выбрать
 *    куда сохранить/отправить); в вебе — скачивание blob. File System Access API
 *    в Android WebView нет, а <a download> там ненадёжен — поэтому Share.
 *  • Импорт: общий <input type="file"> (работает и в WebView, и в браузере) —
 *    остаётся в DataPanel, здесь только экспорт.
 */
import { Capacitor } from '@capacitor/core';
import { exportText } from './db.ts';

export async function exportBackup(): Promise<string> {
  const text = exportText();
  const filename = `astra-data-${new Date().toISOString().slice(0, 10)}.json`;

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({
      path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: 'Данные Astra', text: 'Резервная копия Astra', url: res.uri });
      return 'Файл готов — выберите, куда сохранить или отправить.';
    } catch {
      // пользователь закрыл диалог «поделиться» — файл всё равно записан
      return `Сохранено в файлы приложения: ${filename}`;
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
