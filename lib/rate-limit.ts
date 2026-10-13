/**
 * lib/rate-limit.ts — Rate limiting 100 запросов/минуту на IP.
 * In-memory скользящее окно (LruMap). Для одного инстанса этого достаточно;
 * при горизонтальном масштабировании замените на Edge KV / Redis.
 */

type Bucket = { hits: number[] };

const WINDOW_MS = 60_000; // окно в 1 минуту
const MAX_HITS = 100;     // 100 req/min per IP
const MAX_KEYS = 10_000;  // защита от разрастания памяти

// Глобальный кеш переживает hot-reload в dev-режиме
const globalCache = globalThis as unknown as { __pcdnRateLimit?: Map<string, Bucket> };
if (!globalCache.__pcdnRateLimit) globalCache.__pcdnRateLimit = new Map();
const buckets = globalCache.__pcdnRateLimit;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/** Извлекает IP клиента из заголовков, которые ставит edge-платформа (Tatnet/Layer0/Onreza). */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'unknown';
}

/** Проверка и регистрация запроса. Возвращает ok=false, если лимит превышен. */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(ip);
  if (!bucket) {
    // Простая eviction-политика: при переполнении чистим половину старых ключей
    if (buckets.size >= MAX_KEYS) {
      const keys = [...buckets.keys()].slice(0, Math.floor(MAX_KEYS / 2));
      for (const k of keys) buckets.delete(k);
    }
    bucket = { hits: [] };
    buckets.set(ip, bucket);
  }

  // Оставляем только попадания внутри текущего окна
  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);

  if (bucket.hits.length >= MAX_HITS) {
    const oldest = bucket.hits[0]!;
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    return { ok: false, remaining: 0, retryAfterSec };
  }

  bucket.hits.push(now);
  return { ok: true, remaining: MAX_HITS - bucket.hits.length, retryAfterSec: 0 };
}
