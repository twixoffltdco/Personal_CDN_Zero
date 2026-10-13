# Документация Personal CDN Zero

- [README.md (корень)](../README.md) — главный документ: как это работает без API, поддерживаемые облака, установка расширения, ограничения прямых ссылок.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — принципы и как добавить новое облако.

## Как написать content script для нового облака

Движок `extension/content/common.js` берёт на себя 90% работы:
перехват fetch/XHR, ранжирование кандидатов, кнопку, тосты, отправку на сайт.
Ваш скрипт должен экспортировать только `getExtra()` — список провайдерских кандидатов:

```js
(function PCDNIcloud() {
  'use strict';
  const S = window.__PCDN__;
  if (!S) return;

  function getExtra() {
    const out = [];
    // 1) Нормализация URL страницы в прямой download-эндпоинт (самый надёжный путь)
    // 2) <img>/<video> предпросмотра, указывающие на download-хост
    // 3) Кнопки по aria-label/data-атрибутам (НЕ по классам!)
    return out;
  }

  S.mountToolbarButton(S.makeHandler('icloud', getExtra));
  S.registerPopupResponder('icloud', getExtra);
})();
```

Затем:
1. `manifest.json` → `content_scripts` + `host_permissions`;
2. `lib/url-guard.ts` и `edge/proxy.ts` → `ALLOWED_HOSTS`;
3. Прокси сам разберётся со стримом — если облако отдаёт файл по GET без куки пользователя, всё заработает «из коробки».

## Схема сообщений расширение ↔ сайт

| Направление | Сообщение | Назначение |
|---|---|---|
| content → background | `PCDN_SUBMIT {directUrl, cdnUrl, fileName, pageUrl}` | Пользователь нажал «⚡ Отправить» |
| popup → content | `PCDN_GET_BEST` | Popup просит лучший кандидат с активной вкладки |
| background → offscreen | `PCDN_OFFSCREEN_COPY {text}` | Копирование из MV3 service worker |
| extension → сайт | `GET /dashboard?add=<cdnUrl>` | Сохранение в IndexedDB дашборда |

## Формат ответа прокси при ошибке

```json
{ "error": "LINK_EXPIRED",
  "message": "Обновите ссылку через расширение. Файл недоступен по прямой ссылке (протух, удалён или закрыт доступ).",
  "hint": "Откройте файл в облаке заново и нажмите «Отправить в Personal CDN»." }
```

Коды: `400 MISSING_URL`, `403 HOST_NOT_ALLOWED/INVALID_URL`, `404 LINK_EXPIRED`, `429 RATE_LIMITED`.
