/**
 * extension/content/dropbox.js — сниффер для Dropbox.
 *
 * Особенности Dropbox (важно для бесплатных ссылок ![](...) и s/...):
 *  - Прямые ссылки живут на dl.dropboxusercontent.com / dl-web.dropbox.com;
 *  - Любую shared-ссылку dropbox.com/s/<path>?dl=0 можно превратить в прямую,
 *    поменяв хост на dl.dropboxusercontent.com и поставив ?dl=1 — это стабильный
 *    «независящий от вёрстки» трюк, используем как гарантированный fallback.
 */

(function PCDNDropbox() {
  'use strict';
  const S = window.__PCDN__;
  if (!S) return; // common.js не загрузился — выходим

  /** Дополнительные Dropbox-специфичные кандидаты. */
  function getExtra() {
    const out = [];

    // 1) Guarantee-трюк: текущая страница /s/... → прямой URL
    try {
      const u = new URL(location.href);
      if (/\/s(\.html)?\//.test(u.pathname) || /\/sharing\/link\//.test(u.pathname)) {
        const direct = new URL(u.href);
        direct.hostname = 'dl.dropboxusercontent.com';
        direct.searchParams.set('dl', '1');
        // Для sharing/link нужен path /s/..., оставляем как есть
        out.push({ url: direct.href, source: 'dropbox:host-trick' });
      }
    } catch (_) {}

    // 2) Элементы предпросмотра: <img>/<video> уже указывают на прямой CDN-хост
    document.querySelectorAll('img[src*="dropboxusercontent"], video[src*="dropboxusercontent"], source[src*="dropboxusercontent"]').forEach((el) => {
      out.push({ url: el.src, source: 'dropbox:media-src' });
    });

    // 3) data-test-id кнопки скачивания (Dropbox держит эти атрибуты годами)
    document.querySelectorAll('[data-test-id*="download" i]').forEach((el) => {
      const a = el.closest('a[href]') || (el.tagName === 'A' ? el : null);
      if (a && /^https?:/.test(a.href)) out.push({ url: a.href, source: 'dropbox:data-test-id' });
    });

    return out;
  }

  S.mountToolbarButton(S.makeHandler('dropbox', getExtra));
  S.registerPopupResponder('dropbox', getExtra);
})();
