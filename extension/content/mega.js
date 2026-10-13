/**
 * extension/content/mega.js — сниффер для MEGA.
 *
 * Особенности MEGA: расшифровка идёт на клиенте (WebAssembly), поэтому «прямой ссылки»
 * на готовый файл в классическом смысле нет. Честное решение:
 *  - отдаём ссылку вида https://mega.nz/file/<id>#<key> — она публична и не требует аккаунта;
 *  - прокси Personal CDN умеет стримить mega.co.nz/...?noattachment только для сырых blob-ов,
 *    поэтому для META мы рекомендуем режим «ссылка-на-облако» (клиент скачивает сам).
 * Расширение копирует именно ссылку просмотра — этого достаточно для дашборда и SA-MP лаунчеров,
 * где файл нужен «по клику», а не как inline-ресурс.
 */

(function PCDNMega() {
  'use strict';
  const S = window.__PCDN__;
  if (!S) return;

  function getExtra() {
    const out = [];
    try {
      const u = new URL(location.href);
      // Ссылки вида mega.nz/file/XXXX#KEY или mega.nz/#F!... сохраняем как есть
      if (/^\/(?:file|folder|g)\//.test(u.pathname) || u.hash.startsWith('#')) {
        out.push({ url: u.href, source: 'mega:page-link' });
      }
    } catch (_) {}
    return out;
  }

  S.mountToolbarButton(S.makeHandler('mega', getExtra));
  S.registerPopupResponder('mega', getExtra);
})();
