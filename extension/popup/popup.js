/**
 * extension/popup/popup.js — логика всплывающей окна расширения.
 * Кнопка «Отправить в Personal CDN» для активного таба, ручной ввод, настройки сайта, история.
 */
/* global chrome */

const $ = (id) => document.getElementById(id);

const CLOUD_HOSTS = /dropbox\.com|drive\.google\.com|docs\.google\.com|onedrive\.live\.com|1drv\.ms|sharepoint\.com|disk\.yandex|mega\.nz/;

/** Построить CDN-ссылку из прямой. */
async function buildCdnUrl(directUrl) {
  const { cdnSite = 'https://cdn.example.personal' } = await chrome.storage.sync.get('cdnSite');
      // Читаемый формат по ТЗ: /cdn/{folder_name}/{filename}?url=<прямая ссылка>
    let name = 'file';
    try {
      const pth = new URL(directUrl).pathname.split('/').filter(Boolean).pop();
      if (pth) name = decodeURIComponent(pth);
    } catch (e) { /* ignore */ }
    const seg = (x, fb) => (String(x || '').replace(/[^\p{L}\p{N}._-]/gu, '').replace(/^[.-]+|[.-]+$/g, '') || fb).slice(0, 80);
    return String(cdnSite).replace(/\/+$/, '') + '/cdn/manual/' + seg(name, 'file') + '?url=' + encodeURIComponent(directUrl);
}

// ---------- Кнопка: отправить ссылку с активной страницы облака ----------
$('sendBtn').addEventListener('click', async () => {
  const status = $('status');
  status.textContent = '⏳ Снифаю прямую ссылку…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !CLOUD_HOSTS.test(tab.url)) {
      status.textContent = '❌ Откройте файл в поддерживаемом облаке (Dropbox/GDrive/OneDrive/Yandex/Mega).';
      return;
    }
    // Спрашиваем content script о лучшем кандидате (он уже всё просканировал)
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'PCDN_GET_BEST' }).catch(() => null);
    let directUrl = resp && resp.directUrl;

    if (!directUrl) {
      // Если content script не отвечает (страница открыта до установки расширения) —
      // инжектируем мгновенный сниффер через scripting API
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: instantSniff,
      });
      directUrl = results && results[0] && results[0].result;
    }

    if (!directUrl) {
      // Самый последний fallback — нормализация URL страницы (работает для Dropbox/GDrive)
      directUrl = normalizePageUrl(tab.url);
    }

    if (!directUrl) {
      status.textContent = '❌ Прямая ссылка не найдена. Нажмите кнопку ⚡ прямо на странице предпросмотра файла.';
      return;
    }

    const cdnUrl = await buildCdnUrl(directUrl);
    await navigator.clipboard.writeText(cdnUrl);
    await chrome.storage.local.get('history').then(async ({ history = [] }) => {
      history.unshift({ cdnUrl, directUrl, pageUrl: tab.url, ts: Date.now() });
      await chrome.storage.local.set({ history: history.slice(0, 200) });
      renderHistory();
    });
    status.textContent = '✅ Скопировано в буфер:\n' + cdnUrl.slice(0, 80) + (cdnUrl.length > 80 ? '…' : '');
  } catch (e) {
    status.textContent = '❌ Ошибка: ' + e.message;
  }
});

/** Функция-инжект: быстрый однопроходный sniff без common.js (для вкладок, открытых до установки). */
function instantSniff() {
  const hints = ['dl.dropboxusercontent', 'storage.live.com', 'downloader.disk.yandex', 'uc?export=download', 'usercontent.google'];
  const isDirect = (u) => typeof u === 'string' && /^https?:/.test(u) && (hints.some((h) => u.includes(h)) || /[?&](dl=1|download=1|export=download)/.test(u));
  const a = [...document.querySelectorAll('a[href]')].find((x) => isDirect(x.href) || x.hasAttribute('download'));
  const m = document.querySelector('img[src*="dropboxusercontent"], img[src*="googleusercontent"], video[src*="dropboxusercontent"]');
  if (a) return a.href;
  if (m) return m.src;
  // Нормализация текущего URL
  try {
    const u = new URL(location.href);
    const s = u.pathname.match(/\/s\//);
    if (u.hostname.includes('dropbox') && s) { u.hostname = 'dl.dropboxusercontent.com'; u.searchParams.set('dl', '1'); return u.href; }
    const g = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (g) return 'https://drive.usercontent.google.com/download?id=' + g[1] + '&export=download';
  } catch (_) {}
  return null;
}

function normalizePageUrl(pageUrl) {
  try {
    const u = new URL(pageUrl);
    if (u.hostname.includes('dropbox') && /\/s\//.test(u.pathname)) {
      u.hostname = 'dl.dropboxusercontent.com';
      u.searchParams.set('dl', '1');
      return u.href;
    }
    const g = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (g) return `https://drive.usercontent.google.com/download?id=${g[1]}&export=download`;
    if (/onedrive\.live\.com|1drv\.ms/.test(u.hostname)) { u.searchParams.set('download', '1'); return u.href; }
  } catch (_) {}
  return null;
}

// ---------- Ручной ввод (гостевой режим) ----------
$('manualBtn').addEventListener('click', async () => {
  const v = $('manualUrl').value.trim();
  if (!/^https?:\/\//.test(v)) { $('status').textContent = '❌ Введите полный URL (https://…)'; return; }
  const cdnUrl = await buildCdnUrl(v);
  const out = $('cdnOut');
  out.textContent = cdnUrl;
  out.classList.remove('hidden');
  await navigator.clipboard.writeText(cdnUrl);
  $('status').textContent = '✅ CDN-ссылка скопирована';
});

// ---------- Настройки сайта ----------
chrome.storage.sync.get({ cdnSite: '' }, (r) => { $('siteInput').value = r.cdnSite; });
$('saveSite').addEventListener('click', async () => {
  const v = $('siteInput').value.trim().replace(/\/+$/, '');
  if (v && !/^https?:\/\//.test(v)) { $('status').textContent = '❌ Адрес должен начинаться с https://'; return; }
  await chrome.storage.sync.set({ cdnSite: v || 'https://cdn.example.personal' });
  $('status').textContent = '💾 Настройки сохранены';
});

// ---------- История ----------
function renderHistory() {
  chrome.storage.local.get('history', ({ history = [] }) => {
    const ul = $('history');
    ul.innerHTML = '';
    for (const h of history.slice(0, 15)) {
      const li = document.createElement('li');
      li.textContent = `${new Date(h.ts).toLocaleString('ru-RU')} — ${(h.fileName || h.directUrl || '').slice(0, 46)}`;
      li.title = h.cdnUrl;
      li.addEventListener('click', () => navigator.clipboard.writeText(h.cdnUrl));
      ul.appendChild(li);
    }
    if (!history.length) ul.innerHTML = '<li style="color:#94a3b8;cursor:default">Пока пусто</li>';
  });
}
renderHistory();
