/**
 * extension/background.js — service worker (Manifest V3).
 *
 * Принимает сообщения от content-скриптов (runtime.sendMessage) и:
 *  1. Сохраняет историю отправленных ссылок в chrome.storage.local;
 *  2. Копирует CDN-ссылку в буфер обмена;
 *  3. Опционально открывает вкладку с сайтом Personal CDN (?add=<cdnUrl>) —
 *     страница сама добавит ссылку в IndexedDB-дашборд.
 */

/* global chrome */

const DEFAULT_SITE = 'https://cdn.example.personal';

function getSiteBase() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ cdnSite: DEFAULT_SITE }, (r) => resolve(String(r.cdnSite).replace(/\/+$/, '')));
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'PCDN_SUBMIT') return; // молча игнорируем чужие сообщения

  (async () => {
    const base = await getSiteBase();
    // Читаемая ссылка /cdn/{folder}/{filename}; если content script не прислал — собираем здесь
    const fname = msg.fileName || 'file';
    const fld = msg.folder || 'cloud';
    const cdnUrl = msg.cdnUrl || `${base}/cdn/${encodeURIComponent(fld)}/${encodeURIComponent(fname)}?url=${encodeURIComponent(msg.directUrl)}`;

    // 1) История в storage.local (доступна из popup)
    try {
      const { history = [] } = await chrome.storage.local.get('history');
      history.unshift({
        cdnUrl,
        directUrl: msg.directUrl,
        fileName: msg.fileName || '',
        pageUrl: msg.pageUrl || (sender.tab && sender.tab.url) || '',
        ts: Date.now(),
      });
      await chrome.storage.local.set({ history: history.slice(0, 200) });
    } catch (e) { console.warn('[PCDN bg] history save failed', e); }

    // 2) Копирование в буфер обмена через offscreen-документ — единственный
    //    легальный способ clipboardWrite из MV3 service worker.
    try {
      await copyViaOffscreen(cdnUrl);
    } catch (e) {
      console.warn('[PCDN bg] clipboard failed:', e);
    }

    // 3) Бейдж + оповещение
    chrome.action.setBadgeText({ text: '✓' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);

    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Personal CDN Zero',
        message: `Ссылка отправлена: ${msg.fileName || 'файл'}\n${cdnUrl.slice(0, 90)}`,
      });
    } catch (_) { /* notifications не доступен в Safari — не критично */ }

    sendResponse({ ok: true, cdnUrl });
  })();

  return true; // асинхронный sendResponse
});

/** Offscreen document для доступа к clipboard API из SW (Chrome 109+). */
async function copyViaOffscreen(text) {
  if (typeof chrome.offscreen === 'undefined') {
    // Firefox/Safari без offscreen API — просто считаем, что content script
    // уже скопировал ссылку через свой fallbackClipboard.
    return;
  }
  const already = await chrome.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!already || already.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      reasonDescriptions: ['copy cdn link'],
    });
  }
  await chrome.runtime.sendMessage({ type: 'PCDN_OFFSCREEN_COPY', text });
}

// Первый запуск — открыть страницу настроек сайта
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ cdnSite: null }, (r) => {
    if (!r.cdnSite) chrome.runtime.openOptionsPage?.();
  });
});
