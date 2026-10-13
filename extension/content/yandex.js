/**
 * extension/content/yandex.js — сниффер для Яндекс.Диска.
 *
 * Особенности Yandex Disk:
 *  - Публичная ссылка вида disk.yandex.ru/i/<token> или /d/<folder-token>;
 *  - Прямая отдача идёт через downloader.disk.yandex.ru/get/...?<sig> — подпись живёт
 *    несколько минут, поэтому сниффер ОБЯЗАТЕЛЬНО перехватывает fetch/XHR:
 *    как только пользователь открывает предпросмотр или жмёт «Скачать», мы запоминаем
 *    реальный downloader-URL (патч в common.js, score 100 — он победит в ранжировании);
 *  - Fallback без сети: JSON переменные страницы (window.__SSR_DATA) содержат
 *    publicObject с ключами downloadUrl — читаем их напрямую, это не зависит от CSS-классов;
 *  - Кнопка скачивания имеет data-bem / aria-label «Скачать».
 */

(function PCDNYandex() {
  'use strict';
  const S = window.__PCDN__;
  if (!S) return;

  function getExtra() {
    const out = [];

    // 1) SSR-данные страницы: самый надёжный источник downloadUrl
    try {
      const ssr = window.__SSR_DATA || window.AMYL_DATA;
      const po = ssr && ssr.state && ssr.state.model && ssr.state.model.publicObject;
      if (po) {
        const list = Array.isArray(po) ? po : [po];
        for (const item of list) {
          const dl = item && (item.downloadUrl || (item.exif && item.exif.downloadUrl));
          if (dl) out.push({ url: normalizeYandexDl(dl), source: 'yandex:ssr' });
        }
      }
    } catch (_) {}

    // 2) data-bem/aria кнопки «Скачать»
    document.querySelectorAll('[aria-label*="Скачать" i], [data-bem*="download" i]').forEach((el) => {
      const a = el.closest('a[href]');
      if (a && /^https?:/.test(a.href)) out.push({ url: a.href, source: 'yandex:aria' });
    });

    // 3) Media предпросмотра уже указывает на downloader.disk.yandex.ru
    document.querySelectorAll('img[src*="downloader.disk.yandex"], video[src*="downloader.disk.yandex"], source[src*="downloader.disk.yandex"]').forEach((el) => {
      out.push({ url: el.src, source: 'yandex:media-src' });
    });

    return out;
  }

  /** downloadUrl из SSR может быть относительным или без протокола. */
  function normalizeYandexDl(u) {
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return 'https://disk.yandex.ru' + u;
    return u;
  }

  S.mountToolbarButton(S.makeHandler('yandex', getExtra));
  S.registerPopupResponder('yandex', getExtra);
})();
