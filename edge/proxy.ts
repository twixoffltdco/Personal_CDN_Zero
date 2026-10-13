/**
 * edge/proxy.ts — автономная Edge Function версии прокси.
 *
 * Это тот же код, что и app/api/cdn/route.ts, но в виде standalone-функции
 * для платформ, которые ожидают «одну edge-функцию» вместо Next.js роута
 * (Tatnet Edge Functions, Layer0/Flare worker-совместимый режим, Onreza).
 *
 * Точка входа: export default { fetch(request) }.
 */

// ---------- Rate limiting (in-memory на инстанс) ----------
const WINDOW_MS = 60_000;
const MAX_HITS = 100;
const buckets = new Map<string, number[]>();

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const hits = (buckets.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_HITS) {
    buckets.set(ip, hits);
    return { ok: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - hits[0]!)) / 1000) };
  }
  hits.push(now);
  buckets.set(ip, hits);
  return { ok: true, retryAfterSec: 0 };
}

// ---------- Whitelist облаков ----------
// Только прямые ссылки облаков. Сторонние CDN (blackkazakstan и т.п.) не проксируются — политика проекта.
const ALLOWED_HOSTS = [
  'dropbox.com', 'dl.dropbox.com', 'dl.dropboxusercontent.com', 'dl-web.dropbox.com',
  'drive.google.com', 'docs.google.com', 'googleusercontent.com',
  '1drv.ms', 'onedrive.live.com', 'storage.live.com', '.sharepoint.com',
  'disk.yandex.ru', 'disk.yandex.com', 'disk.yandex.net',
  'downloader.disk.yandex.ru', 'api.disk.yandex.ru', 'cloud-api.yandex.net',
  'mega.nz', 'mega.co.nz',
];

function isHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some((p) => (p.startsWith('.') ? h.endsWith(p) : h === p || h.endsWith('.' + p)));
}

function normalizeDirectLink(raw: string): string {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error('ONLY_HTTPS');
  if (!isHostAllowed(url.hostname)) throw new Error('HOST_NOT_ALLOWED');
  if (url.hostname.includes('dropbox')) {
    url.searchParams.set('dl', '1');
    if (/^(www\.)?dropbox\.com$/.test(url.hostname)) url.hostname = 'dl.dropboxusercontent.com';
  }
  const gview = url.pathname.match(/\/file\/d\/([^/]+)\/(?:view|edit)/);
  if (gview && url.hostname === 'drive.google.com') {
    url.pathname = '/uc';
    url.search = '';
    url.searchParams.set('export', 'download');
    url.searchParams.set('id', gview[1]!);
  }
  return url.toString();
}

function guessContentType(link: string, upstreamType: string | null): string {
  if (upstreamType && !/octet-stream|text\/html/i.test(upstreamType)) return upstreamType;
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.mp3': 'audio/mpeg', '.zip': 'application/zip', '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  };
  try {
    const path = new URL(link).pathname.toLowerCase();
    const dot = path.lastIndexOf('.');
    if (dot !== -1 && map[path.slice(dot)]) return map[path.slice(dot)]!;
  } catch { /* ignore */ }
  return upstreamType || 'application/octet-stream';
}

// ---------- CORS / CDN заголовки ----------
function cdnHeaders(init?: HeadersInit): Headers {
  const h = new Headers(init);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  // Критично для скорости в лаунчерах (ТЗ): immutable-кэш на год
  h.set('Cache-Control', 'public, max-age=31536000, immutable');
  // Обязателен по ТЗ: Range-докачка и параллельные сегменты
  h.set('Accept-Ranges', 'bytes');
  h.set('X-Powered-By', 'Personal CDN Zero (edge)');
  return h;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: cdnHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
  });
}

// ---------- Точка входа Edge Function ----------
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cdnHeaders() });
    if (request.method !== 'GET') return jsonError(405, 'METHOD_NOT_ALLOWED', 'Только GET/OPTIONS');

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown';

    const rl = checkRateLimit(ip);
    if (!rl.ok) {
      return jsonError(429, 'RATE_LIMITED', `Слишком много запросов. Повторите через ${rl.retryAfterSec} сек.`);
    }

    const raw = new URL(request.url).searchParams.get('url');
    if (!raw) return jsonError(400, 'MISSING_URL', 'Укажите ?url=<закодированная прямая ссылка облака>');

    let direct: string;
    try {
      direct = normalizeDirectLink(raw);
    } catch (e) {
      return jsonError(403, (e as Error).message, 'Домен не входит в список поддерживаемых облаков.');
    }

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15_000);
    let upstream: Response;
    try {
      upstream = await fetch(direct, {
        redirect: 'follow',
        signal: abort.signal,
        headers: { 'User-Agent': 'PersonalCDNZero/1.0 (+edge delivery proxy)', Accept: '*/*' },
      });
    } catch {
      clearTimeout(timer);
      return jsonError(404, 'LINK_EXPIRED', 'Обновите ссылку через расширение. Файл недоступен по прямой ссылке.');
    }
    clearTimeout(timer);

    if (!upstream.ok) {
      return jsonError(404, 'LINK_EXPIRED', 'Обновите ссылку через расширение. Файл недоступен по прямой ссылке.');
    }
    const ctype = upstream.headers.get('content-type');
    if (ctype && /text\/html/i.test(ctype)) {
      return jsonError(404, 'LINK_EXPIRED', 'Обновите ссылку через расширение: облако вернуло страницу вместо файла.');
    }

    // Стрим бинарного потока клиенту без буферизации.
    // Accept-Ranges уже гарантирован cdnHeaders() = 'bytes' (ТЗ) — не перезаписываем.
    const out = cdnHeaders({ 'Content-Type': guessContentType(direct, ctype) });
    for (const h of ['content-length', 'etag', 'last-modified'] as const) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(upstream.body, { status: 200, headers: out });
  },
};
