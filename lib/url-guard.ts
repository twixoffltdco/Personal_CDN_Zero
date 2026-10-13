/**
 * lib/url-guard.ts — Безопасность прямых ссылок.
 * Whitelist доменов облаков + проверка схемы. Это не даёт proxy превратиться
 * в открытый SSRF-релей для внутренних сетей (169.254.x.x, localhost и т.п.).
 */

/**
 * Поддерживаемые облачные хранилища (публичные прямые ссылки без API).
 * ВАЖНО (корректировка ТЗ): прокси работает ТОЛЬКО с прямыми ссылками из
 * облаков. Сторонние CDN и любые иные домены (например, чужие зеркальные
 * CDN вида blackkazakstan.kz) в whitelist отсутствуют и блокируются на
 * уровне normalizeDirectLink() — это не настройка, а политика проекта.
 */
export const ALLOWED_HOSTS: string[] = [
  // Dropbox: dl.dropboxusercontent.com, dl-web.dropbox.com, dropbox.com/s/…
  'dropbox.com',
  'dl.dropbox.com',
  'dl.dropboxusercontent.com',
  'dl-web.dropbox.com',
  'uc.dropboxusercontent.com',
  // Google Drive
  'drive.google.com',
  'docs.google.com',
  'usercontent.google.com',
  'googleusercontent.com',
  // OneDrive / SharePoint
  '1drv.ms',
  'onedrive.live.com',
  'storage.live.com',
  'files.onedrive.live.com',
  '*.sharepoint.com',
  // Yandex Disk
  'disk.yandex.ru',
  'disk.yandex.com',
  'disk.yandex.net',
  'api.disk.yandex.ru',
  'downloader.disk.yandex.ru',
  'cloud-api.yandex.net',
  // Mega
  'mega.nz',
  'mega.co.nz',
  // Общие CDN облаков
  'dropboxstatic.com',
];

/** Проверяет, разрешён ли хост (включая поддомены и записи вида *.example.com). */
export function isHostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return host === suffix || host.endsWith('.' + suffix);
    }
    return host === pattern || host.endsWith('.' + pattern);
  });
}

/** Приводит ссылку облака к «прямому» виду (Dropbox ?dl=0 → ?dl=1 и т.д.). */
export function normalizeDirectLink(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('INVALID_URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('ONLY_HTTPS');
  }
  if (!isHostAllowed(url.hostname)) {
    throw new Error('HOST_NOT_ALLOWED');
  }

  // Dropbox: /s/…?dl=0 отдаёт превью-страницу, ?dl=1 — прямой файл
  if (url.hostname.includes('dropbox')) {
    if (url.searchParams.has('dl')) url.searchParams.set('dl', '1');
    else url.searchParams.set('dl', '1');
    // dropbox.com → dl.dropboxusercontent.com (надёжнее для бинарного стрима)
    if (url.hostname === 'www.dropbox.com' || url.hostname === 'dropbox.com') {
      url.hostname = 'dl.dropboxusercontent.com';
    }
  }

  // Google Drive: /file/d/ID/view → uc?export=download&ID=
  const gview = url.pathname.match(/\/file\/d\/([^/]+)\/(?:view|edit)/);
  if (gview && url.hostname === 'drive.google.com') {
    url.pathname = '/uc';
    url.search = '';
    url.searchParams.set('export', 'download');
    url.searchParams.set('id', gview[1]!);
  }

  // OneDrive shared: /?download=1 уже прямой — ничего не делаем
  return url.toString();
}

/** Определяет Content-Type по расширению файла в URL (эвристика без внешних библиотек). */
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.zip': 'application/zip', '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed', '.gz': 'application/gzip',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.samp': 'application/octet-stream', '.asi': 'application/octet-stream',
  '.ide': 'application/octet-stream', '.fme': 'application/octet-stream',
};

export function guessContentType(link: string, upstreamType?: string | null): string {
  // Приоритет — заголовок от самого облака, если он осмысленный
  if (upstreamType && !/octet-stream|text\/html/i.test(upstreamType)) {
    return upstreamType;
  }
  try {
    const path = new URL(link).pathname.toLowerCase();
    const dot = path.lastIndexOf('.');
    if (dot !== -1) {
      const ext = path.slice(dot);
      if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext];
    }
  } catch { /* ignore */ }
  return upstreamType || 'application/octet-stream';
}
