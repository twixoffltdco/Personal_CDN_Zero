/**
 * app/cdn/[folder]/[file]/route.ts — ЧИТАЕМЫЕ CDN-ССЫЛКИ вида /cdn/{folder_name}/{filename}.
 *
 * По требованию ТЗ пользователь получает красивую ссылку:
 *   https://cdn.example.com/cdn/samp-packs/models.dff?url=<закодированная прямая ссылка облака>
 *
 * Как это работает:
 *  - сегменты пути {folder}/{file} — человекочитаемая метка (для кэшей, логов, лаунчеров);
 *  - РЕАЛЬНЫЙ источник файла — параметр ?url= (прямая ссылка облака). Прокси НЕ хранит
 *    файлов и НИКОГДА не строит upstream-ссылку из названия папки/файла — иначе любой
 *    мог бы сканировать чужие домены. Поэтому без валидного ?url= ответ всегда 400.
 *  - Дальше запрос обрабатывает тот же Edge Delivery Proxy (app/api/cdn/route.ts):
 *    whitelist облаков, rate limit, стрим + Cache-Control immutable / Accept-Ranges bytes.
 *
 * Сторонние CDN (blackkazakstan и т.п.) не поддерживаются: normalizeDirectLink()
 * принимает только прямые ссылки Dropbox / Google Drive / OneDrive / Яндекс.Диск / MEGA.
 */
import { NextRequest } from 'next/server';
import { GET as proxyGet } from '@/app/api/cdn/route';

export const runtime = 'edge';

type Ctx = { params: { folder?: string; file?: string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  // 1. Обязателен прямой облачный URL в ?url= (методика NO-API)
  const direct = req.nextUrl.searchParams.get('url');
  if (!direct) {
    return Response.json(
      {
        error: 'MISSING_URL',
        message:
          'Читаемый путь /cdn/{folder}/{filename} требует ?url=<прямая ссылка облака>. ' +
          'Сгенерируйте полную ссылку в дашборде или расширении Personal CDN.',
        hint: 'Пример: /cdn/packs/models.dff?url=https%3A%2F%2Fdl.dropboxusercontent.com%2Fs%2Fabc%2Fmodels.dff%3Fdl%3D1',
      },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } },
    );
  }

  // 2. Блокируем path-traversal в сегментах имени (путь — только метка, но чистим честно)
  const { folder = 'default', file = 'file' } = ctx?.params || {};
  if (/\.\.|[%/\\]/.test(decodeURIComponent(folder)) || /\.\.|[%/\\]/.test(decodeURIComponent(file))) {
    return Response.json(
      { error: 'BAD_PATH', message: 'Некорректное имя папки или файла.' },
      { status: 400 },
    );
  }

  // 3. Делегируем обработку edge-прокси (rate limit, whitelist облаков, стрим, CDN-заголовки)
  const proxied = new Request(`https://pcdn.local/api/cdn?url=${encodeURIComponent(direct)}`, {
    method: req.method,            // GET / HEAD сохраняем (HEAD нужен для проверки доступности)
    headers: req.headers,
  });
  return proxyGet(proxied as unknown as NextRequest);
}

// Тот же preflight, что у основного прокси
export { OPTIONS } from '@/app/api/cdn/route';
