/**
 * app/api/cdn/route.ts — EDGE DELIVERY PROXY.
 *
 * Принимает прямую ссылку на файл из облака, стримит её от имени сервера
 * и отдаёт клиенту с правильными CORS/Cache заголовками.
 *
 * GET /api/cdn?url={encoded_direct_link}
 *
 * Runtime: edge (Node-совместимый fetch доступен и там, и в default).
 * Деплой: Tatnet / Layer0 / Onreza (Next.js 14 standalone build).
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeDirectLink, guessContentType } from '@/lib/url-guard';

// Прокси живёт на edge-runtime: минимальная задержка, стриминг без буферизации
export const runtime = 'edge';

// Таймаут ожидания ответа от облака (мс). Долгие файлы при этом продолжают
// стримиться без ограничения — таймер относится только к получению заголовков.
const UPSTREAM_TIMEOUT_MS = 15_000;

/** Стандартный набор CDN-заголовков (включая обязательные Accept-Ranges и immutable-кэш). */
function cdnHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra as Record<string, string> | undefined);
  h.set('Access-Control-Allow-Origin', '*');                       // можно грузить с любого сайта
  h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Range, Content-Type');    // лаунчеры шлют Range даже на preflight
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');           // нужно для <img> с crossorigin и шрифтов
  // Критично для скорости загрузок в лаунчерах: год кэша + immutable (ссылка уникальна на версию файла)
  h.set('Cache-Control', 'public, max-age=31536000, immutable');
  // Обязателен по ТЗ: докачка/параллельные сегменты в SA-MP лаунчерах. Значение от облака — точнее, но не ниже этого.
  h.set('Accept-Ranges', 'bytes');
  h.set('X-Powered-By', 'Personal CDN Zero');
  return h;
}

export async function OPTIONS() {
  // Preflight для fetch() со сторонних сайтов
  return new NextResponse(null, { headers: cdnHeaders() });
}

export async function GET(req: NextRequest) {
  // 1. Rate limiting: 100 req/min per IP (защита от злоупотреблений чужими ссылками)
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: `Слишком много запросов. Повторите через ${rl.retryAfterSec} сек.` },
      { status: 429, headers: { ...cdnHeaders(), 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  // 2. Разбор и нормализация ссылки
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) {
    return NextResponse.json(
      { error: 'MISSING_URL', message: 'Укажите ?url=<закодированная прямая ссылка облака>' },
      { status: 400, headers: cdnHeaders() },
    );
  }

  let direct: string;
  try {
    direct = normalizeDirectLink(raw);
  } catch (e) {
    const code = (e as Error).message;
    return NextResponse.json(
      {
        error: code,
        message:
          code === 'HOST_NOT_ALLOWED'
            ? 'Домен не входит в список поддерживаемых облаков.'
            : 'Некорректная ссылка.',
      },
      { status: 403, headers: cdnHeaders() },
    );
  }

  // 3. Fetch к облаку от имени сервера (стрим, без полной буферизации)
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(direct, {
      redirect: 'follow',
      signal: abort.signal,
      headers: {
        // Некоторые облака отдают разный контент без нормального UA
        'User-Agent': 'PersonalCDNZero/1.0 (+edge delivery proxy)',
        Accept: '*/*',
      },
    });
  } catch {
    clearTimeout(timer);
    return fallbackResponse(raw);
  }
  clearTimeout(timer);

  // 4. Fallback: ссылка протухла / недоступна / вернула HTML вместо файла
  if (!upstream.ok || upstream.status >= 400) {
    return fallbackResponse(raw);
  }
  const ctype = upstream.headers.get('content-type');
  if (ctype && /text\/html/i.test(ctype)) {
    // Облако отдало страницу-превью вместо файла → ссылка не прямая или протухла
    return fallbackResponse(raw);
  }

  // 5. Отдаём бинарный поток клиенту + CDN-заголовки
  const outHeaders = cdnHeaders({
    'Content-Type': guessContentType(direct, ctype),
  });
  const len = upstream.headers.get('content-length');
  if (len) outHeaders.set('Content-Length', len);
  // Пробрасываем ETag/Last-Modified если были — важно для видеоплееров и докачки.
  // Accept-Ranges уже гарантированно выставлен в cdnHeaders() как 'bytes' (ТЗ),
  // поэтому его не перезаписываем ответом облака.
  for (const h of ['etag', 'last-modified'] as const) {
    const v = upstream.headers.get(h);
    if (v) outHeaders.set(h, v);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: outHeaders,
  });
}

/** Единый ответ «ссылка протухла» — как требует ТЗ: 404 + сообщение. */
function fallbackResponse(originalUrl: string): NextResponse {
  return NextResponse.json(
    {
      error: 'LINK_EXPIRED',
      message: 'Обновите ссылку через расширение. Файл недоступен по прямой ссылке (протух, удалён или закрыт доступ).',
      hint: 'Откройте файл в облаке заново и нажмите «Отправить в Personal CDN».',
      url: originalUrl,
    },
    { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
