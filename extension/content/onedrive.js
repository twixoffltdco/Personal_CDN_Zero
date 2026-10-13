/**
 * extension/content/onedrive.js — сниффер для OneDrive / SharePoint.
 *
 * Особенности OneDrive:
 *  - Кнопка скачивания в тулбаре имеет aria-label «Скачать»/«Download» — стабильно годами;
 *  - Реальный файл отдаётся с storage.live.com или <tenant>-my.sharepoint.com/.../download.aspx
 *    и ловится сетевым сниффером (патч fetch/XHR) при клике на «Скачать»;
 *  - Для shared-ссылок ?cid=... работает гарантированный трюк: добавить &download=1
 *    к URL вида onedrive.live.com/?id=<resid>&cid=<cid> — сервер отвечает 302 на прямой файл;
 *  - Короткие ссылки 1drv.ms/redir?resid=... тоже разворачиваются через download=1.
 */

(function PCDNOneDrive() {
  'use strict';
  const S = window.__PCDN__;
  if (!S) return;

  function getExtra() {
    const out = [];
    try {
      const u = new URL(location.href);

      // Трюк 1: onedrive.live.com/download?cid=...&resid=...&authkey=... — канонический прямой endpoint
      if (u.hostname === 'onedrive.live.com' && (u.searchParams.has('resid') || u.searchParams.has('id'))) {
        const d = new URL('https://onedrive.live.com/download');
        for (const k of ['cid', 'resid', 'id', 'authkey', 'em']) {
          const v = u.searchParams.get(k);
          if (v) d.searchParams.set(k, v);
        }
        out.push({ url: d.href, source: 'onedrive:download-endpoint' });
      }

      // Трюк 2: к любому shared-URL добавляем ?download=1
      if (/onedrive\.live\.com|1drv\.ms|sharepoint\.com/.test(u.hostname)) {
        const d = new URL(u.href);
        d.searchParams.set('download', '1');
        out.push({ url: d.href, source: 'onedrive:download-flag' });
      }

      // Трюк 3: SharePoint direct download path
      if (u.hostname.endsWith('.sharepoint.com')) {
        const m = u.pathname.match(/^(.*\/(?:personal|sites)\/[^/]+)\/(.+)$/);
        if (m) {
          const d = new URL(u.origin + '/_layouts/15/download.aspx');
          d.searchParams.set('sharedurl', encodeURIComponent(u.origin + '/' + m[2]));
          out.push({ url: d.href, source: 'onedrive:sharepoint-layouts' });
        }
      }
    } catch (_) {}

    // Прямые media-src предпросмотра (storage.live.com)
    document.querySelectorAll('img[src*="storage.live.com"], video[src*="storage.live.com"], img[src*="sharepoint"], source[src*="sharepoint"]').forEach((el) => {
      out.push({ url: el.src, source: 'onedrive:media-src' });
    });

    // data-feature / aria кнопки
    document.querySelectorAll('[data-feature="download"], [aria-label*="Скачать" i], [aria-label*="Download" i]').forEach((el) => {
      const a = el.closest('a[href]');
      if (a && /^https?:/.test(a.href)) out.push({ url: a.href, source: 'onedrive:aria' });
    });

    return out;
  }

  S.mountToolbarButton(S.makeHandler('onedrive', getExtra));
  S.registerPopupResponder('onedrive', getExtra);
})();
