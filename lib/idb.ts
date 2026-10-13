/**
 * lib/idb.ts — IndexedDB-хранилище сохранённых ссылок дашборда.
 * Без бэкенда и без аккаунтов: всё живёт в браузере пользователя.
 */

'use client';

/** Имя папки по умолчанию, если пользователь ничего не ввёл. */
export const DEFAULT_FOLDER = 'default';

/**
 * Санитизация сегмента пути (folder/filename) для ЧИТАЕМОГО URL /cdn/{folder}/{file}.
 * Оставляем только буквы (все алфавиты), цифры, дефис, точку, подчёркивание;
 * слэши, «..» и управляющие символы вырезаются — путь не может выйти за префикс.
 */
export function sanitizeSegment(raw: string, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[\/\u0000-\u001f]+/g, '-')      // любые слэши/управляющие -> дефис
    .replace(/[^\p{L}\p{N}._-]+/gu, '')        // только буквы/цифры/точка/_/-
    .replace(/^[.-]+|[.-]+$/g, '')              // без ведущих/замыкающих точек (защита от "..", скрытых файлов)
    .slice(0, 80);
  return cleaned || fallback;
}

/**
 * Генерация ЧИТАЕМОЙ CDN-ссылки вида /cdn/{folder_name}/{filename}.
 * Реальный прямой URL облака живёт в query-параметре ?url= (требование безопасности:
 * прокси принимает ТОЛЬКО прямые ссылки из облаков — см. lib/url-guard.ts).
 */
export function buildReadableCdnUrl(origin: string | undefined, folder: string, filename: string, directUrl: string): string {
  const f = sanitizeSegment(folder, DEFAULT_FOLDER);
  const n = sanitizeSegment(filename, 'file');
  const base = (origin || '').replace(/\/+$/, '');   // '' => относительный URL (для дашборда)
  return `${base}/cdn/${encodeURIComponent(f)}/${encodeURIComponent(n)}?url=${encodeURIComponent(directUrl)}`;
}

export interface CdnLink {
  id?: number;            // autoincrement
  name: string;           // человекочитаемое имя файла/ресурса
  folder: string;         // Folder Name — сегмент читаемого URL /cdn/{folder}/{filename}
  filename: string;       // имя файла в CDN-URL (санитизированное)
  directUrl: string;      // исходная прямая ссылка облака (Dropbox/Yandex/GDrive/OneDrive/MEGA)
  cdnUrl: string;         // готовая CDN-ссылка /cdn/{folder}/{filename}?url=...
  provider: string;       // dropbox | gdrive | onedrive | yandex | mega | manual
  createdAt: number;      // timestamp
  lastCheck?: number;     // когда последний раз проверяли доступность
  lastStatus?: 'ok' | 'dead' | 'unknown';
}

const DB_NAME = 'personal-cdn-zero';
const STORE = 'links';
const VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE)) {
        store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      } else {
        store = req.transaction!.objectStore(STORE);
      }
      if (!store.indexNames.contains('createdAt')) store.createIndex('createdAt', 'createdAt');
      if (!store.indexNames.contains('folder')) store.createIndex('folder', 'folder');
      // Миграция записей v1: проставляем folder/filename по умолчанию
      {
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cur = cursorReq.result;
          if (!cur) return;
          const rec = cur.value as CdnLink;
          if (!rec.folder) {
            rec.folder = DEFAULT_FOLDER;
            rec.filename = rec.filename || sanitizeSegment(rec.name, 'file');
            cur.update(rec);
          }
          cur.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Добавить ссылку (dedup по directUrl). */
export async function addLink(link: Omit<CdnLink, 'id'>): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    const all = os.getAll();
    all.onsuccess = () => {
      const existing = (all.result as CdnLink[]).find((l) => l.directUrl === link.directUrl);
      if (existing && existing.id != null) { resolve(existing.id); return; }
      const put = os.add(link as CdnLink);
      put.onsuccess = () => resolve(put.result as number);
      put.onerror = () => reject(put.error);
    };
    all.onerror = () => reject(all.error);
  });
}

/** Все ссылки, новые сверху. */
export async function getLinks(): Promise<CdnLink[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as CdnLink[]).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLink(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateLink(link: CdnLink): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(link);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Экспорт всего списка в JSON (бэкап / перенос между браузерами). */
export async function exportJson(): Promise<string> {
  return JSON.stringify(await getLinks(), null, 2);
}

/** Импорт из JSON (валидируем поле directUrl). */
export async function importJson(text: string): Promise<number> {
  let arr: unknown;
  try { arr = JSON.parse(text); } catch { throw new Error('Некорректный JSON'); }
  if (!Array.isArray(arr)) throw new Error('Ожидался массив ссылок');
  let count = 0;
  for (const item of arr) {
    const it = item as Partial<CdnLink>;
    if (typeof it.directUrl !== 'string') continue;
    await addLink({
      name: it.name || 'импорт',
      folder: it.folder || DEFAULT_FOLDER,
      filename: it.filename || sanitizeSegment(it.name || it.directUrl, 'file'),
      directUrl: it.directUrl,
      cdnUrl: it.cdnUrl || '',
      provider: it.provider || 'manual',
      createdAt: it.createdAt || Date.now(),
    });
    count++;
  }
  return count;
}
