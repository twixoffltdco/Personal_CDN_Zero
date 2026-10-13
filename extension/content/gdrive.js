/**
 * extension/content/gdrive.js — сниффер для Google Drive.
 *
 * Особенности GDrive:
 *  - Прямая ссылка публичного файла: https://drive.usercontent.google.com/download?id=<ID>&export=download
 *    (старый вариант drive.google.com/uc?export=download тоже работает);
 *  - ID стабильно извлекается из URL вида /file/d/<ID>/view — это не зависит от вёрстки;
 *  - Для больших файлов (>100 МБ) Google отдаёт интерстиш-страницу с confirm=t —
 *    добавляем его заранее; реальный download-endpoint ловится сетевым сниффером
 *    (патч fetch/XHR в common.js) при открытии предпросмотра.
 */

(function PCDNGDrive() {
  'use strict';
  const S = window.__PCDN__;
  if (!S) return;

  function extractFileId(href) {
    // /file/d/ID/view, /uc?id=ID, /open?id=ID, embeddedfolderview?id=ID
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
      /[?&]id=([a-zA-Z0-9_-]{10,})/,
      /\/d\/([a-zA-Z0-9_-]{10,})(?:\/|$)/,
    ];
    for (const p of patterns) {
      const m = href.match(p);
      if (m) return m[1];
    }
    return null;
  }

  function getExtra() {
    const out = [];
    const id = extractFileId(location.href);

    if (id) {
      // Гарантированная прямая ссылка для публичных файлов
      out.push({ url: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, source: 'gdrive:id-build' });
      out.push({ url: `https://drive.google.com/uc?export=download&id=${id}`, source: 'gdrive:id-build-legacy' });
    }

    // Предпросмотр изображений/видео: lhX.googleusercontent.com и hl downloadable src
    document.querySelectorAll('img[src*="googleusercontent.com"][src*="=s"], video[src*="googlevideo"], source[src*="googlevideo"]').forEach((el) => {
      const u = el.src || el.getAttribute('src');
      if (u && S.isDirectLike(u)) out.push({ url: u, source: 'gdrive:media-src' });
    });

    // aria-label кнопки скачивания в тулбаре предпросмотра
    document.querySelectorAll('[aria-label*="Download" i], [aria-label*="Скачать" i]').forEach((el) => {
      const a = el.closest('a[href]');
      if (a && /^https?:/.test(a.href)) out.push({ url: a.href, source: 'gdrive:aria' });
    });

    return out;
  }

  S.mountToolbarButton(S.makeHandler('gdrive', getExtra));
  S.registerPopupResponder('gdrive', getExtra);
})();
