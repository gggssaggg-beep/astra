/**
 * Хранение данных в РЕАЛЬНОМ файле на диске через File System Access API
 * (Chrome/Edge). Файл — обычный читаемый JSON (`astra-data.json`), переживает
 * чистку кэша. Хэндл файла запоминаем в IndexedDB, чтобы переподключаться при
 * следующем открытии (браузер требует один клик для подтверждения доступа).
 *
 * На устройстве (Capacitor) тот же контракт реализуем через Filesystem-плагин
 * в выбранной папке (§10.6) — этот модуль подменяется, остальной код не меняется.
 */

export const fsApiAvailable = (): boolean =>
  typeof (globalThis as any).showSaveFilePicker === 'function';

// --- запоминание хэндла в IndexedDB ---
const IDB = 'astra-fs', STORE = 'handles', KEY = 'dataFile';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(val: any): Promise<void> {
  const db = await openIdb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function idbGet(): Promise<any> {
  const db = await openIdb();
  const val = await new Promise<any>((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).get(KEY);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  db.close();
  return val ?? null;
}
async function idbClear(): Promise<void> { await idbPut(undefined); }

// --- операции с файлом ---
const PICK_OPTS = {
  suggestedName: 'astra-data.json',
  types: [{ description: 'Данные Astra (JSON)', accept: { 'application/json': ['.json'] } }],
};

export async function chooseNewFile(): Promise<any> {
  const h = await (globalThis as any).showSaveFilePicker(PICK_OPTS);
  await idbPut(h);
  return h;
}
export async function chooseExistingFile(): Promise<any> {
  const [h] = await (globalThis as any).showOpenFilePicker({ types: PICK_OPTS.types, multiple: false });
  await idbPut(h);
  return h;
}
export async function savedHandle(): Promise<any> { return idbGet(); }
export async function forgetHandle(): Promise<void> { await idbClear(); }

export async function hasPermission(h: any, mode: 'read' | 'readwrite' = 'readwrite'): Promise<boolean> {
  return (await h.queryPermission?.({ mode })) === 'granted';
}
export async function requestPermission(h: any, mode: 'read' | 'readwrite' = 'readwrite'): Promise<boolean> {
  if (await hasPermission(h, mode)) return true;
  return (await h.requestPermission?.({ mode })) === 'granted';
}

export async function readFileText(h: any): Promise<string> {
  const file = await h.getFile();
  return file.text();
}
export async function writeFileText(h: any, text: string): Promise<void> {
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
}

export const handleName = (h: any): string => h?.name ?? 'файл';
