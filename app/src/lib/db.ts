/**
 * Хранилище данных (§4, §10.6/10.7). Единый объект данных в памяти, который:
 *   1) всегда зеркалится в localStorage (быстрый кэш, переживает перезагрузку);
 *   2) при подключённом файле — АВТО-сохраняется в обычный читаемый JSON на диске
 *      (fileStore). Файл переживает чистку кэша; его можно открыть как текст,
 *      экспортировать и импортировать.
 *
 * API-ключ здесь НЕ хранится (только защищённое хранилище устройства).
 */
import type {
  Settings, JournalNote, TrackedAspect, Interpretation, DeityArchetype, Reminder,
} from './models.ts';
import { DEFAULT_SETTINGS } from './models.ts';
import { DATA_SCHEMA } from './version.ts';
import * as fs from './fileStore.ts';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { defaultArchetypes } from './lore.ts';

// На устройстве (Capacitor) durable-хранилище — нативный Preferences
// (SharedPreferences/UserDefaults). Переживает перезапуск и OTA-обновление, в
// отличие от localStorage в WebView (может очищаться / менять origin).
const NATIVE = Capacitor.isNativePlatform();

export interface AppData {
  schema: number;
  notes: JournalNote[];
  tracked: TrackedAspect[];
  reminders: Reminder[];
  interpretations: Interpretation[];
  archetypes: DeityArchetype[];
  settings: Settings;
}

const LS_KEY = 'astra:data';

function emptyData(): AppData {
  return {
    schema: DATA_SCHEMA, notes: [], tracked: [], reminders: [],
    interpretations: [], archetypes: [], settings: { ...DEFAULT_SETTINGS },
  };
}

function loadLS(): AppData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...emptyData(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return emptyData();
}

let data: AppData = loadLS();

// --- подписки (для реактивности панели данных) ---
const subs = new Set<() => void>();
export function onChange(cb: () => void): () => void { subs.add(cb); return () => subs.delete(cb); }
function notify() { subs.forEach((cb) => cb()); }

// --- файловое состояние ---
let handle: any = null;
export const fileState: { connected: boolean; name: string; error: string | null; saving: boolean } =
  { connected: false, name: '', error: null, saving: false };

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFileSave() {
  if (!handle) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      fileState.saving = true; notify();
      await fs.writeFileText(handle, serialize());
      fileState.error = null;
    } catch (e) {
      fileState.error = e instanceof Error ? e.message : String(e);
    } finally {
      fileState.saving = false; notify();
    }
  }, 600);
}

let prefTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNativeSave() {
  if (!NATIVE) return;
  if (prefTimer) clearTimeout(prefTimer);
  prefTimer = setTimeout(() => {
    Preferences.set({ key: LS_KEY, value: serialize() }).catch(() => { /* нет места — данные всё равно в localStorage */ });
  }, 300);
}

function persist() {
  try { localStorage.setItem(LS_KEY, serialize()); } catch { /* quota */ }
  scheduleFileSave();
  scheduleNativeSave();
  notify();
}

export function serialize(): string {
  return JSON.stringify({ app: 'astra', schema: DATA_SCHEMA, savedAt: new Date().toISOString(), data }, null, 2);
}

function adopt(parsed: any, mode: 'merge' | 'replace') {
  const incoming: Partial<AppData> = parsed?.data ?? parsed ?? {};
  if (mode === 'replace') {
    data = { ...emptyData(), ...incoming };
  } else {
    const byId = <T extends { id: string }>(a: T[] = [], b: T[] = []) => {
      const map = new Map(a.map((x) => [x.id, x]));
      for (const x of b) map.set(x.id, x);   // импорт не затирает существующее по id
      return [...map.values()];
    };
    const byKey = <T>(a: T[] = [], b: T[] = [], key: (x: T) => string) => {
      const map = new Map(a.map((x) => [key(x), x]));
      for (const x of b) if (!map.has(key(x))) map.set(key(x), x);
      return [...map.values()];
    };
    data = {
      schema: DATA_SCHEMA,
      notes: byId(data.notes, incoming.notes),
      tracked: byId(data.tracked, incoming.tracked),
      reminders: byId(data.reminders, incoming.reminders),
      interpretations: byKey(data.interpretations, incoming.interpretations, (x) => x.signature),
      archetypes: byKey(data.archetypes, incoming.archetypes, (x) => x.object),
      settings: { ...data.settings, ...(incoming.settings ?? {}) },
    };
  }
}

// --- коллекции ---
class Collection<T extends { id: string }> {
  constructor(private pick: () => T[]) {}
  all(): T[] { return this.pick(); }
  get(id: string): T | undefined { return this.pick().find((x) => x.id === id); }
  put(item: T): T {
    const list = this.pick();
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
    persist();
    return item;
  }
  remove(id: string): void {
    const list = this.pick();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) { list.splice(i, 1); persist(); }
  }
  query(pred: (x: T) => boolean): T[] { return this.pick().filter(pred); }
}

export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const db = {
  raw: (): AppData => data,
  notes: new Collection<JournalNote>(() => data.notes),
  tracked: new Collection<TrackedAspect>(() => data.tracked),
  reminders: new Collection<Reminder>(() => data.reminders),

  interpretations: {
    all: (): Interpretation[] => data.interpretations,
    get: (sig: string) => data.interpretations.find((x) => x.signature === sig),
    put: (it: Interpretation) => {
      const i = data.interpretations.findIndex((x) => x.signature === it.signature);
      if (i >= 0) data.interpretations[i] = it; else data.interpretations.push(it);
      persist();
    },
  },
  archetypes: {
    all: (): DeityArchetype[] => data.archetypes,
    get: (object: string) => data.archetypes.find((x) => x.object === object),
    put: (a: DeityArchetype) => {
      const i = data.archetypes.findIndex((x) => x.object === a.object);
      if (i >= 0) data.archetypes[i] = a; else data.archetypes.push(a);
      persist();
    },
  },
  settings: {
    // слияние с дефолтами — у старых сохранений может не быть новых полей
    get: (): Settings => ({ ...DEFAULT_SETTINGS, ...data.settings }),
    set: (s: Settings) => { data.settings = s; persist(); },
  },
};

// --- встроенные архетипы + старт на устройстве ---
/** Дозасеять вшитые архетипы для объектов, у которых их ещё нет (правки не трогаем). */
function seedDefaults(): boolean {
  let added = false;
  for (const a of defaultArchetypes()) {
    if (!data.archetypes.find((x) => x.object === a.object)) {
      data.archetypes.push({ ...a, updatedAt: new Date().toISOString() });
      added = true;
    }
  }
  return added;
}

/** Вызвать один раз при старте (await перед чтением данных в UI). На устройстве
 *  поднимает durable-копию из Preferences (localStorage в WebView ненадёжен), на
 *  вебе — no-op для хранилища. Затем дозасев встроенных архетипов. */
export async function hydrate(): Promise<void> {
  if (NATIVE) {
    try {
      const { value } = await Preferences.get({ key: LS_KEY });
      if (value && value.trim()) {
        adopt(JSON.parse(value), 'replace');
        try { localStorage.setItem(LS_KEY, serialize()); } catch { /* quota */ }
      }
    } catch { /* первый запуск / нет данных — стартуем с localStorage/пустого */ }
  }
  const seeded = seedDefaults();
  if (seeded) persist(); else notify();
}

// --- экспорт / импорт (текстовый JSON) ---
export function exportText(): string { return serialize(); }
export function importText(json: string, mode: 'merge' | 'replace' = 'merge'): void {
  adopt(JSON.parse(json), mode);
  persist();
}

// --- файл на диске ---
async function loadFromHandle(h: any) {
  const text = await fs.readFileText(h);
  if (text.trim()) {
    try { adopt(JSON.parse(text), 'replace'); } catch { /* пустой/битый — оставим текущие */ }
  }
  handle = h;
  fileState.connected = true; fileState.name = fs.handleName(h); fileState.error = null;
  try { localStorage.setItem(LS_KEY, serialize()); } catch { /* quota */ }
  notify();
}

export const file = {
  available: fs.fsApiAvailable,
  status: () => ({ ...fileState }),

  /** Создать/выбрать новый файл данных и сразу записать в него текущие данные. */
  async connectNew(): Promise<void> {
    const h = await fs.chooseNewFile();
    handle = h;
    fileState.connected = true; fileState.name = fs.handleName(h); fileState.error = null;
    await fs.writeFileText(h, serialize());
    notify();
  },

  /** Открыть существующий файл данных (его содержимое становится текущим). */
  async connectExisting(): Promise<void> {
    const h = await fs.chooseExistingFile();
    await loadFromHandle(h);
  },

  /** Тихо переподключить запомненный файл при старте (если доступ уже разрешён). */
  async reconnectSilently(): Promise<boolean> {
    if (!fs.fsApiAvailable()) return false;
    const h = await fs.savedHandle();
    if (!h) return false;
    if (!(await fs.hasPermission(h, 'readwrite'))) return false;
    await loadFromHandle(h);
    return true;
  },

  /** Переподключить запомненный файл с запросом доступа (по клику). */
  async reconnectWithPrompt(): Promise<boolean> {
    const h = await fs.savedHandle();
    if (!h) return false;
    if (!(await fs.requestPermission(h, 'readwrite'))) return false;
    await loadFromHandle(h);
    return true;
  },

  async disconnect(): Promise<void> {
    handle = null; fileState.connected = false; fileState.name = '';
    await fs.forgetHandle(); notify();
  },

  hasSavedHandle: async (): Promise<boolean> => !!(await fs.savedHandle()),
};
