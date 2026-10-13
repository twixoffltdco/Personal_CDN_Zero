/**
 * extension/offscreen.js — слушает PCDN_OFFSCREEN_COPY от service worker
 * и выполняет реальное копирование в буфер обмена (clipboardWrite).
 */
/* global chrome */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'PCDN_OFFSCREEN_COPY' && typeof msg.text === 'string') {
    navigator.clipboard.writeText(msg.text).catch((e) => console.warn('[PCDN offscreen]', e));
  }
});
