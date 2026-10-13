/**
 * extension/content/common.js — общий «движок» сниффера для всех облаков.
 *
 * Принципы устойчивости к изменениям вёрстки:
 *  1. Ищем элементы по aria-label, data-атрибутам и тексту кнопки («Скачать», «Download»),
 *     а НЕ по CSS-классам (классы облаков меняются каждый релиз).
 *  2. Параллельно перехватываем сетевые запросы страницы (fetch/XHR) и запоминаем
 *     URL, похожие на прямые ссылки скачивания (dl.dropboxusercontent, uc?export=download,
 *     downloader.disk.yandex, storage.live.com и т.п.).
 *  3. Кандидаты ранжируются: прямой download-хост > URL с download-параметрами > обычный <a href>.
 *
 * Работает одинаково в Chrome/Firefox/Edge/Safari (Manifest V3, стандартные API).
 */

(function PCZNCommon() {
  'use strict';

  // Единое пространство для всех провайдерских скриптов
  window.__PCDN__ = window.__PCDN__ || {};

  const S = window.__PCDN__;

  // ---------- Хелперы читаемого URL /cdn/{folder}/{filename} ----------
  /** Папка для читаемого URL: облако-источник по хосту страницы. */
  S.detectCloudFolder = function (host) {
    if (/dropbox/i.test(host)) return 'dropbox';
    if (/drive\.google|googleusercontent/i.test(host)) return 'gdrive';
    if (/onedrive|1drv|sharepoint/i.test(host)) return 'onedrive';
    if (/disk\.yandex/i.test(host)) return 'yandex';
    if (/mega\./i.test(host)) return 'mega';
    return 'cloud';
  };

  /** Санитизация сегмента пути (буквы всех алфавитов, цифры, . _ -) — как в lib/idb.ts. */
  S.sanitizeSeg = function (raw, fb) {
    var c = String(raw || '').trim()
      .replace(/[\/\u0000-\u001f]+/g, '-')
      .replace(/[^\p{L}\p{N}._-]+/gu, '')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 80);
    return c || (fb || 'file');
  };

  // ---------- Настройки сайта Personal CDN (можно менять в popup → storage.sync) ----------
  S.getSiteBase = function () {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get({ cdnSite: 'https://cdn.example.personal' }, (res) => {
          resolve(res.cdnSite.replace(/\/+$/, ''));
        });
      } catch (_) {
        resolve('https://cdn.example.personal');
      }
    });
  };

  // ---------- Хранилище кандидатов, найденных через сеть ----------
  const networkCandidates = []; // {url, ts}
  const DIRECT_HINTS = [
    'dl.dropboxusercontent.com', 'dl-web.dropbox.com',
    'drive.google.com/uc', 'drive.usercontent.google.com/download',
    'storage.live.com', 'files.onedrive.live.com', 'onedrive.live.com/download',
    'downloader.disk.yandex', 'api.disk.yandex',
    'mega.nz/file', 'content.download',
  ];

  S.isDirectLike = function (u) {
    if (!/^https?:/.test(u)) return false;
    if (/^https?:\/\/[^/]*\.(googleusercontent|dropboxusercontent)\./i.test(u)) return true;
    if (DIRECT_HINTS.some((h) => u.includes(h))) return true;
    if (/[?&](dl=1|download=1|export=download|op=download)/i.test(u)) return true;
    return false;
  };

  function pushNetworkCandidate(url) {
    try {
      const abs = new URL(url, location.href).href;
      if (!S.isDirectLike(abs)) return;
      const last = networkCandidates[networkCandidates.length - 1];
      if (last && last.url === abs) return;
      networkCandidates.push({ url: abs, ts: Date.now() });
      // Храним последние 20 кандидатов
      if (networkCandidates.length > 20) networkCandidates.shift();
      S.log('network candidate:', abs);
    } catch (_) { /* невалидный URL — игнор */ }
  }

  // ---------- Перехват fetch / XHR (monkey-patch в MAIN world недоступен из isolated,
  // ---------- поэтому используем webRequest-подобный подход через performance API + патч ниже) ----------
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const u = typeof input === 'string' ? input : (input && input.url);
      if (u) pushNetworkCandidate(u);
    } catch (_) {}
    return origFetch.apply(this, arguments);
  };

  const origXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { if (url) pushNetworkCandidate(String(url)); } catch (_) {}
    return origXhrOpen.apply(this, arguments);
  };

  // Дополнительно: следим за навигацией iframe/a[download] кликами
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && (a.hasAttribute('download') || S.isDirectLike(a.href))) {
      pushNetworkCandidate(a.href);
    }
  }, true);

  // ---------- Поиск элементов «Скачать» в DOM ----------
  // Селекторы составлены по aria/data/тексту — устойчивы к редизайнам.
  S.findDomCandidates = function () {
    const out = [];

    // 1) Явные aria-label/data-атрибуты кнопки скачивания
    const ariaSelectors = [
      '[aria-label*="Скачать" i]',
      '[aria-label*="Download" i]',
      '[data-feature="download"]',
      '[data-test-id*="download" i]',
      '[data-id*="download" i]',
      '[data-action*="download" i]',
      'button[title*="Скачать" i]',
      'button[title*="Download" i]',
      'a[download]',
    ];
    for (const sel of ariaSelectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          const url = el.href || el.getAttribute('data-url') || el.getAttribute('data-download-url');
          if (url && /^https?:/.test(url)) out.push({ url: new URL(url, location.href).href, source: 'dom:' + sel });
        });
      } catch (_) {}
    }

    // 2) Текстовые кнопки «Скачать» — рядом ищем ссылку или data-URL
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = walk.nextNode())) {
      const tag = n.tagName;
      if (tag !== 'BUTTON' && tag !== 'A') continue;
      const text = (n.textContent || '').trim().toLowerCase();
      if (text === 'скачать' || text === 'скачать как архив' || text === 'download' || text.startsWith('download ')) {
        if (n.href) out.push({ url: n.href, source: 'dom:text' });
        // OneDrive/Yandex рендерят svg-иконки — берём ближайшего родителя-ссылку
        const link = n.closest('a[href]');
        if (link && link.href) out.push({ url: link.href, source: 'dom:text-parent' });
      }
    }

    // 3) meta/link теги с прямыми ссылками
    document.querySelectorAll('meta[property*="image"], link[rel="alternate"][type*="video"]').forEach((m) => {
      const c = m.getAttribute('content') || m.getAttribute('href');
      if (c && S.isDirectLike(c)) out.push({ url: c, source: 'dom:meta' });
    });

    return out;
  };

  // ---------- Ранжирование: лучший кандидат — первый ----------
  S.rankCandidates = function (extra) {
    const all = []
      .concat(networkCandidates.map((c) => ({ url: c.url, source: 'net', score: 100, ts: c.ts })))
      .concat(S.findDomCandidates().map((c) => ({ ...c, score: 80 })))
      .concat((extra || []).map((c) => ({ ...c, score: 90 })));

    // Dedup по URL, сортировка по score, свежие сетевые — выше
    const seen = new Set();
    return all
      .sort((a, b) => b.score - a.score || (b.ts || 0) - (a.ts || 0))
      .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)));
  };

  // ---------- Отправка ссылки на сайт Personal CDN ----------
  S.sendToCdn = async function (directUrl, fileName) {
    const base = await S.getSiteBase();
    // ЧИТАЕМАЯ CDN-ссылка по ТЗ: {site}/cdn/{folder_name}/{filename}?url=<прямая ссылка облака>
    const fname = fileName || guessFileName(directUrl);
    const cdnUrl = base + '/cdn/' + S.sanitizeSeg(S.detectCloudFolder(location.hostname), 'cloud')
      + '/' + S.sanitizeSeg(fname, 'file') + '?url=' + encodeURIComponent(directUrl);

    // Вариант 1 (основной по ТЗ): runtime.sendMessage → background → сайт/clipboard
    const payload = { type: 'PCDN_SUBMIT', directUrl, cdnUrl, fileName: fileName || guessFileName(directUrl), pageUrl: location.href };
    try {
      chrome.runtime.sendMessage(payload, (resp) => {
        if (chrome.runtime.lastError) {
          S.fallbackClipboard(payload);
        } else if (resp && resp.ok) {
          S.toast('✅ CDN-ссылка скопирована: ' + truncate(resp.cdnUrl, 60));
        }
      });
    } catch (_) {
      S.fallbackClipboard(payload);
    }
    return payload;
  };

  // Вариант 2 (fallback по ТЗ): clipboard API — пользователь сам вставит на сайте
  S.fallbackClipboard = async function (payload) {
    try {
      await navigator.clipboard.writeText(payload.cdnUrl);
      S.toast('📋 Ссылка скопирована в буфер обмена. Вставьте её на странице Personal CDN.');
    } catch (_) {
      // Последний рубеж: prompt — ссылка не потеряется
      window.prompt('Скопируйте CDN-ссылку вручную:', payload.cdnUrl);
    }
  };

  // ---------- Утилита: имя файла из URL ----------
  function guessFileName(u) {
    try {
      const p = new URL(u).pathname.split('/').pop();
      return p ? decodeURIComponent(p) : 'file';
    } catch (_) { return 'file'; }
  }
  S.guessFileName = guessFileName;

  function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  // ---------- Логирование ----------
  S.debug = false;
  S.log = function (...args) { if (S.debug) console.log('[PCDN]', ...args); };

  // ---------- Тулбар-кнопка внутри страницы («Отправить в Personal CDN») ----------
  S.mountToolbarButton = function (onClick) {
    if (document.getElementById('pcdn-toolbar-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'pcdn-toolbar-btn';
    btn.type = 'button';
    btn.textContent = '⚡ Отправить в Personal CDN';
    btn.setAttribute('aria-label', 'Отправить в Personal CDN');
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 2147483647,
      background: '#2b8cff', color: '#fff', border: 'none', borderRadius: '999px',
      padding: '10px 18px', font: '600 14px system-ui, sans-serif',
      boxShadow: '0 4px 16px rgba(43,140,255,.4)', cursor: 'pointer',
    });
    btn.addEventListener('mouseenter', () => (btn.style.background = '#1f6fe0'));
    btn.addEventListener('mouseleave', () => (btn.style.background = '#2b8cff'));
    btn.addEventListener('click', () => onClick(btn));
    document.documentElement.appendChild(btn);
  };

  // ---------- Тост-уведомление ----------
  S.toast = function (msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '70px', right: '20px', zIndex: 2147483647,
      background: '#0b1c33', color: '#fff', padding: '10px 16px',
      borderRadius: '8px', font: '500 13px system-ui, sans-serif',
      maxWidth: '360px', boxShadow: '0 4px 16px rgba(0,0,0,.35)',
    });
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  };

  // ---------- Общий обработчик клика по кнопке для всех провайдеров ----------
  // Провайдер может передать getExtra(): () => [{url, source}] со своими эвристиками.
  S.makeHandler = function (providerName, getExtra) {
    return async function (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Ищу прямую ссылку…';
      try {
        const extra = getExtra ? getExtra() : [];
        // Если страница ещё не успела дёрнуть download-endpoint — подсказываем ей:
        // кликнем по найденной кнопке «Скачать» в shadow DOM/iframe невозможна из isolated world,
        // поэтому просто ждём до 2 сек, пока появятся сетевые кандидаты.
        let best = S.rankCandidates(extra)[0];
        if (!best) {
          await new Promise((r) => setTimeout(r, 2000));
          best = S.rankCandidates(extra)[0];
        }
        if (!best) {
          // Последний вариант — нормализовать текущий URL страницы (для dropbox /s/... работает всегда)
          const normalized = providerNormalize(providerName, location.href);
          if (normalized) best = { url: normalized, source: 'page-url-normalized' };
        }
        if (!best) {
          S.toast('❌ Прямая ссылка не найдена. Откройте предпросмотр файла и повторите.');
          return;
        }
        S.log(providerName, 'best candidate:', best);
        await S.sendToCdn(best.url);
      } finally {
        btn.disabled = false;
        btn.textContent = '⚡ Отправить в Personal CDN';
      }
    };
  };

  function providerNormalize(name, pageUrl) {
    try {
      const u = new URL(pageUrl);
      if (name === 'dropbox' && /\/s\//.test(u.pathname)) {
        u.hostname = 'dl.dropboxusercontent.com';
        u.searchParams.set('dl', '1');
        return u.href;
      }
      if (name === 'gdrive') {
        const m = u.pathname.match(/\/file\/d\/([^/]+)/);
        if (m) return 'https://drive.usercontent.google.com/download?id=' + m[1] + '&export=download';
      }
      if (name === 'yandex') {
        const m = u.pathname.match(/^\/i\/([^/]+)/);
        if (m) return 'https://disk.yandex.ru/public/disk/get/' + m[1] + '?format=ZIP';
      }
    } catch (_) {}
    return null;
  }

  // ---------- Ответ popup-окну: «PCDN_GET_BEST» → лучшая прямая ссылка текущей страницы ----------
  S.registerPopupResponder = function (providerName, getExtra) {
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.type === 'PCDN_GET_BEST') {
          let best = S.rankCandidates(getExtra ? getExtra() : [])[0];
          if (!best) {
            const normalized = providerNormalize(providerName, location.href);
            if (normalized) best = { url: normalized };
          }
          sendResponse({ directUrl: best ? best.url : null, fileName: best ? S.guessFileName(best.url) : '' });
        }
      });
    } catch (_) { /* вне контекста расширения — игнорируем */ }
  };
})();
