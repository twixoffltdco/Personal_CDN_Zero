/**
 * app/dashboard/page.tsx — публичный дашборд сохранённых ссылок.
 * Хранение: IndexedDB (lib/idb.ts) — только в браузере пользователя.
 * Возможности: добавление с полем «Folder Name» (гостевой режим ручной вставки),
 * генерация читаемой ссылки /cdn/{folder_name}/{filename}, копирование CDN-URL,
 * проверка доступности (HEAD через сам прокси), удаление, экспорт/импорт JSON.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addLink, deleteLink, exportJson, getLinks, importJson, updateLink,
  buildReadableCdnUrl, sanitizeSegment, DEFAULT_FOLDER, type CdnLink,
} from '@/lib/idb';

/** Определить облако по хосту прямой ссылки. */
function detectProvider(u: string): string {
  if (/dropbox/i.test(u)) return 'dropbox';
  if (/drive\.google|googleusercontent/i.test(u)) return 'gdrive';
  if (/onedrive|1drv|sharepoint/i.test(u)) return 'onedrive';
  if (/disk\.yandex/i.test(u)) return 'yandex';
  if (/mega\.(nz|co\.nz)/i.test(u)) return 'mega';
  return 'manual';
}

/**
 * ЧИТАЕМАЯ CDN-ссылка по ТЗ: /cdn/{folder_name}/{filename}?url=<прямая ссылка облака>.
 * Прокси принимает ТОЛЬКО прямые ссылки облаков (Dropbox/GDrive/OneDrive/Yandex/MEGA) —
 * сторонние CDN не поддерживаются (см. lib/url-guard.ts).
 */
function buildCdnUrl(directUrl: string, folder: string, filename: string): string {
  return buildReadableCdnUrl('', folder, filename, directUrl);
}

function nameFromUrl(u: string): string {
  try {
    const p = new URL(u).pathname.split('/').filter(Boolean).pop();
    return p ? decodeURIComponent(p).slice(0, 60) : u.slice(0, 60);
  } catch {
    return u.slice(0, 60);
  }
}

const PROVIDER_BADGE: Record<string, string> = {
  dropbox: 'border-blue-400/30 bg-blue-500/15 text-blue-300',
  gdrive: 'border-yellow-400/30 bg-yellow-500/15 text-yellow-300',
  onedrive: 'border-sky-400/30 bg-sky-500/15 text-sky-300',
  yandex: 'border-red-400/30 bg-red-500/15 text-red-300',
  mega: 'border-orange-400/30 bg-orange-500/15 text-orange-300',
  manual: 'border-slate-400/30 bg-slate-500/15 text-slate-300',
};

const STATUS_BADGE: Record<string, string> = {
  ok: 'border-green-500/30 bg-green-500/15 text-green-400',
  dead: 'border-red-500/30 bg-red-500/15 text-red-400',
  unknown: 'border-slate-500/30 bg-slate-500/15 text-slate-400',
};

export default function Dashboard() {
  const [links, setLinks] = useState<CdnLink[]>([]);
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');       // Folder Name — сегмент читаемого URL
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  /** Сохранить ссылку; cdnUrl генерируется как /cdn/{folder_name}/{filename}. */
  async function saveDirect(directUrl: string, label?: string, folderName?: string) {
    const fname = (label || '').trim() || nameFromUrl(directUrl);
    const fld = sanitizeSegment(folderName || '', DEFAULT_FOLDER);
    const filename = sanitizeSegment(fname, 'file');
    await addLink({
      name: fname,
      folder: fld,
      filename,
      directUrl,
      cdnUrl: buildCdnUrl(directUrl, fld, filename),   // /cdn/{folder}/{filename}?url=...
      provider: detectProvider(directUrl),
      createdAt: Date.now(),
      lastStatus: 'unknown',
    });
    setMsg(`✅ Ссылка сохранена: /cdn/${fld}/${filename}`);
    setTimeout(() => setMsg(''), 2500);
  }

  // Приём ссылки от расширения: /dashboard?add=<cdnUrl или directUrl>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const add = q.get('add');
    if (add) {
      // Расширение шлёт либо прямую ссылку, либо старый формат /api/cdn?url=…
      const direct = add.includes('url=')
        ? decodeURIComponent(add.split('url=')[1]!)
        : add;
      void saveDirect(direct);
      window.history.replaceState({}, '', '/dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => setLinks(await getLinks()), []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function copyCdn(l: CdnLink) {
    const full = location.origin + l.cdnUrl;   // https://…/cdn/{folder}/{filename}?url=…
    await navigator.clipboard.writeText(full);
    setMsg('📋 CDN-URL скопирован: ' + full.slice(0, 70) + '…');
    setTimeout(() => setMsg(''), 3000);
  }

  /** Проверка доступности: HEAD-запрос к прокси. 2xx → ok, иначе → протухла. */
  async function check(l: CdnLink) {
    if (!l.id) return;
    setBusyId(l.id);
    try {
      const r = await fetch(l.cdnUrl, { method: 'HEAD' });
      const status = r.ok ? 'ok' : 'dead';
      await updateLink({ ...l, lastCheck: Date.now(), lastStatus: status });
      setMsg(status === 'ok' ? '🟢 Ссылка жива' : '🔴 Ссылка протухла — обновите через расширение');
    } catch {
      await updateLink({ ...l, lastCheck: Date.now(), lastStatus: 'dead' });
      setMsg('🔴 Сеть недоступна');
    }
    setBusyId(null);
    await refresh();
    setTimeout(() => setMsg(''), 3000);
  }

  async function remove(l: CdnLink) {
    if (l.id != null) { await deleteLink(l.id); await refresh(); }
  }

  async function doExport() {
    const blob = new Blob([await exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'personal-cdn-zero-links.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(file: File) {
    try {
      const n = await importJson(await file.text());
      setMsg(`⬇️ Импортировано ссылок: ${n}`);
      await refresh();
    } catch (e) {
      setMsg('❌ ' + (e as Error).message);
    }
  }

  const btnCls = 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-brand-500 hover:text-white disabled:opacity-50';

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-3xl font-bold">📦 Дашборд</h1>
      <p className="mb-6 text-sm text-slate-400">
        Все ссылки хранятся локально в вашем браузере (IndexedDB). Сервер не видит ни один URL
        до момента запроса к прокси.
      </p>

      {/* Гостевой режим: ручная вставка прямой ссылки */}
      <section className="card mb-6">
        <h2 className="mb-3 font-semibold">
          ➕ Добавить ссылку{' '}
          <span className="text-xs font-normal text-slate-400">(гостевой режим — расширение не обязательно)</span>
        </h2>
        <div className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://dl.dropboxusercontent.com/s/abc/file.zip?dl=1"
            className="mono rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder={`Folder Name (${DEFAULT_FOLDER})`}
              title="Папка для читаемой ссылки /cdn/{folder_name}/{filename}"
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Имя файла (необязательно)"
              className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
        </div>
        {/* Предпросмотр читаемой ссылки генерируется на лету: /cdn/{folder_name}/{filename} */}
        {input.trim().startsWith('http') && (
          <p className="mono mt-3 truncate text-xs text-slate-400">
            🔗 {`/cdn/${sanitizeSegment(folder, DEFAULT_FOLDER)}/${sanitizeSegment(name.trim() || nameFromUrl(input.trim()), 'file')}?url=…`}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            ⚠️ Прокси работает только с прямыми ссылками облаков (Dropbox / GDrive / OneDrive / Яндекс.Диск / MEGA).
            Сторонние CDN не поддерживаются.
          </p>
          <button
            onClick={() => {
              const v = input.trim();
              if (/^https?:\/\//.test(v)) void saveDirect(v, name, folder).then(refresh).then(() => { setInput(''); setName(''); setFolder(''); });
              else setMsg('❌ Введите полный https:// URL');
            }}
            className="btn-primary shrink-0 !py-2 text-sm"
          >
            Сохранить
          </button>
        </div>
        {msg && <p className="mt-3 text-sm text-brand-500">{msg}</p>}
      </section>

      {/* Список ссылок */}
      {links.length === 0 ? (
        <div className="card text-center text-sm text-slate-500">
          Пока пусто. Откройте файл в облаке и нажмите ⚡ в расширении — или вставьте ссылку выше.
        </div>
      ) : (
        <ul className="space-y-3">
          {links.map((l) => (
            <li key={l.id} className="card flex flex-wrap items-center gap-3 !p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{l.name}</p>
                {/* Читаемая CDN-ссылка /cdn/{folder}/{filename} */}
                <p className="mono truncate text-xs text-brand-500" title={l.cdnUrl}>
                  {'/cdn/' + (l.folder || DEFAULT_FOLDER) + '/' + (l.filename || sanitizeSegment(l.name, 'file'))}
                </p>
                <p className="mono truncate text-xs text-slate-500" title={l.directUrl}>{l.directUrl}</p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-xs uppercase ${PROVIDER_BADGE[l.provider] || PROVIDER_BADGE.manual}`}>
                {l.provider}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_BADGE[l.lastStatus || 'unknown']}`}>
                {l.lastStatus === 'ok' ? 'жива' : l.lastStatus === 'dead' ? 'протухла' : '—'}
              </span>
              <div className="flex gap-2">
                <button onClick={() => copyCdn(l)} className={btnCls}>📋 Копировать CDN</button>
                <button onClick={() => check(l)} disabled={busyId === l.id} className={btnCls}>
                  {busyId === l.id ? '⏳' : '🔎 Проверить'}
                </button>
                <button onClick={() => remove(l)} className={`${btnCls} !text-red-400`}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Экспорт/импорт */}
      <div className="mt-6 flex gap-3">
        <button onClick={doExport} className="btn-ghost !py-2 text-sm">⬆️ Экспорт JSON</button>
        <label className="btn-ghost cursor-pointer !py-2 text-sm">
          ⬇️ Импорт JSON
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])}
          />
        </label>
      </div>
    </main>
  );
}
