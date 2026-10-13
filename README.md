# Personal CDN Zero

> **Ваш личный CDN. Бесплатно. Без API.**
> Превратите любой бесплатный тариф облачного хранилища (Dropbox, Google Drive, OneDrive, Яндекс.Диск, MEGA) в полноценный CDN с CORS, кэшированием и бинарным стримингом — без OAuth, без App Keys, без регистраций в консолях разработчиков и без единого рубля ежемесячно.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![Manifest V3](https://img.shields.io/badge/Extension-Manifest%20V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)

📦 Репозитории: **GitHub** + [**Gitverse.ru**](https://gitverse.ru) · 🧩 Лицензия: **MIT**

---

## Оглавление

- [Зачем это нужно](#зачем-это-нужно)
- [Как это работает без API](#как-это-работает-без-api)
- [Архитектура](#архитектура)
- [Быстрый старт](#быстрый-старт)
- [Поддерживаемые облака](#поддерживаемые-облака)
- [Установка расширения](#установка-расширения)
- [Edge Delivery Proxy /cdn/{folder}/{filename}](#edge-delivery-proxy--читаемые-ссылки-cdfolderfilename)
- [Дашборд и гостевой режим](#дашборд-и-гостевой-режим)
- [Hybrid Config: наш CDN + внешние CDN в SA-MP лаунчере](#hybrid-config-наш-cdn--внешние-cdn-в-sa-mp-лаунчере)
- [Примеры интеграции](#примеры-интеграции)
- [Деплой: Tatnet / Layer0 / Onreza](#деплой-tatnet--layer0--onreza)
- [Ограничения прямых ссылок](#ограничения-прямых-ссылок)
- [Безопасность](#безопасность)
- [Структура проекта](#структура-проекта)
- [Вклад и развитие](#вклад-и-развитие)
- [Лицензия](#лицензия)

---

## Зачем это нужно

Типичная задача: отдать файл со своего сайта/сервера/лаунчера быстро, с правильным
`Content-Type`, `Access-Control-Allow-Origin: *` и годовым кэшем. Варианты «купить S3»
или «подключить Cloudflare R2» требуют карту, а «API облаков» — регистрации приложений,
OAuth-консолей и client secrets.

**Personal CDN Zero выбирает третий путь:** у каждого бесплатного облака уже есть
публичные прямые ссылки на скачивание. Мы не лезем в чужие API — браузерное расширение
находит такую ссылку как обычный пользователь, а edge-прокси на вашей стороне доводит её
до CDN-кондиции: стрим, CORS, cache headers, rate limiting, честный 404 для протухших ссылок.

| Обычный CDN                          | Personal CDN Zero                       |
|--------------------------------------|----------------------------------------|
| $/ГБ трафика                         | **$0** — платите только за само облако (бесплатно) |
| Регистрация, ключи, биллинг          | Ничего                                  |
| Загрузка файлов через консоль        | Файл уже в вашем облаке                 |
| Единый вендор                        | Любое облако + зеркала                  |

---

## Как это работает без API

```
┌───────────────┐   1. открывает файл    ┌──────────────────┐
│   Пользователь │ ─────────────────────▶ │ Облако (бесплатно)│
└───────┬───────┘                        │ Dropbox/GDrive/…  │
        │                                └────────┬─────────┘
        │ 2. клик «⚡ Отправить в Personal CDN»    │ публичная
        ▼                                          │ прямая ссылка
┌───────────────────┐  runtime.sendMessage        │
│ Расширение (MV3)  │◀────────────────────────────┘
│  Link Sniffer     │  находит download-URL в DOM и network requests
└───────┬───────────┘
        │ 3. cdnUrl = https://ваш.site/cdn/{папка}/{файл}?url=<direct link>
        ▼
┌───────────────────────────┐   4. fetch/stream от имени сервера
│  Edge Proxy (Tatnet/      │ ◀──────────────────────┐
│  Layer0/Onreza, Next.js)  │                        │
│  • CORS: Access-Control-* │      5. бинарный поток │
│  • Cache immutable 1 год  │ ──────────────────────▶ клиент (сайт,
│  • Rate limit 100 req/min │                          лаунчер, плеер)
│  • 404 «Обновите ссылку»  │
└───────────────────────────┘
```

Три правила, которые делают схему законной и надёжной:

1. **Мы работаем только с тем, что уже публично доступно по ссылке.** Никакого обхода приватности, никакого взлома чужих аккаунтов.
2. **Сниффер устойчив к редизайнам.** Ищем кнопки «Скачать» по `aria-label`, `data-*` атрибутам и тексту, перехватываем реальные сетевые запросы страницы (`fetch`/`XHR`) — CSS-классы облаков не используются вовсе.
3. **Ноль хранения на сервере.** Список ваших ссылок живёт в IndexedDB вашего браузера. Прокси Stateless: он увидит URL только в момент выдачи файла.

---

## Архитектура

| Компонент | Технологии | Где живёт |
|-----------|-----------|-----------|
| Ядро сайта (лендинг + дашборд) | Next.js 14 App Router, TypeScript, TailwindCSS | Tatnet / Layer0 / Onreza |
| Edge Delivery Proxy | Route handler `app/cdn/[folder]/[file]/route.ts` (читаемые `/cdn/{folder}/{filename}`) + базовый `app/api/cdn/route.ts` (runtime: edge) + автономная функция `edge/proxy.ts` | Тот же деплой |
| Browser Extension | Manifest V3, vanilla JS | Chrome / Firefox / Edge / Safari |
| Хранилище ссылок | IndexedDB (`lib/idb.ts`) | Браузер пользователя |
| Rate limiting | In-memory sliding window 100 req/min/IP (`lib/rate-limit.ts`) | Edge |

---

## Быстрый старт

```bash
# 1. Локальный запуск ядра
npm ci
npm run dev            # http://localhost:3000

# 2. Расширение (режим разработчика)
#    Chrome/Edge: chrome://extensions → «Загрузить распакованную» → папка extension/
#    В popup расширения укажите адрес вашего сайта (по умолчанию localhost можно не менять)

# 3. Соберите архив для публикации
npm run ext:package    # dist/personal-cdn-zero-extension.zip
```

Порядок действий пользователя:

1. Откройте файл в облаке (предпросмотр).
2. Нажмите **«⚡ Отправить в Personal CDN»** (кнопка на странице или в тулбаре расширения).
3. Получите читаемую `https://ваш.site/cdn/{папка}/{файл}?url=...` в буфере обмена — используйте где угодно.

---

## Поддерживаемые облака

| Облако | Источник прямой ссылки | Долговечность ссылки | Особенности сниффера |
|--------|------------------------|----------------------|----------------------|
| **Dropbox** | `dl.dropboxusercontent.com/s/…?dl=1` | Вечная (публичная) | Трюк с заменой хоста + `dl=1` — не зависит от вёрстки вообще |
| **Google Drive** | `drive.usercontent.google.com/download?id=…&export=download` | Вечная (для «всем, у кого есть ссылка») | ID извлекается из URL `/file/d/<ID>/view`; `confirm=t` для больших файлов |
| **OneDrive** | `onedrive.live.com/download?cid=…&resid=…&authkey=…` | Длинная (authkey ~60 дней) | Три стратегии: download-endpoint, флаг `?download=1`, SharePoint `_layouts/15/download.aspx` |
| **Яндекс.Диск** | `downloader.disk.yandex.ru/get/…?sign=…` | **Короткая (~минуты)** | Перехват сети + `window.__SSR_DATA.downloadUrl`; обновляйте через расширение |
| **MEGA** | `mega.nz/file/<id>#<key>` | Вечная | Client-side encryption: отдаём ссылку просмотра для скачивания по клику |
| Любое другое | — | — | Свой content script добавляется за 20 строк, см. CONTRIBUTING.md |

Работает на **бесплатных тарифах всех перечисленных облаков**. Платных — тоже.

---

## Установка расширения

Расширение не публикуется в сторах (намеренно: никаких ревьюеров, комиссий и верификаций) —
ставится из исходников за 30 секунд:

- **Chrome:** `chrome://extensions` → Режим разработчика → «Загрузить распакованную» → папка [`extension/`](./extension)
- **Firefox:** `about:debugging#/runtime/this-firefox` → «Загрузить временное дополнение» → `extension/manifest.json` *(для постоянной установки — подпись в AMO или `about:config → xpinstall.signatures.required=false` в Developer Edition)*
- **Edge:** `edge://extensions` → Распаковать расширение → папка `extension/`
- **Safari:** `xcrun safari-web-extension-converter extension/` → открыть проект в Xcode → Build and Run

После установки откройте popup расширения и укажите **адрес вашего задеплоенного сайта**
Personal CDN — все кнопки будут слать ссылки туда.

---

## Edge Delivery Proxy — читаемые ссылки `/cdn/{folder}/{filename}`

Основной формат CDN-ссылки (генерируется дашбордом и расширением):

```
GET /cdn/{folder_name}/{filename}?url=<URL-encoded прямая ссылка облака>
пример: /cdn/samp-packs/client-mods.zip?url=https%3A%2F%2Fdl.dropboxusercontent.com%2Fs%2Fabcd%2Fclient-mods.zip%3Fdl%3D1
```

Сегменты `{folder_name}/{filename}` — человекочитаемая метка (важно для кэшей лаунчеров
и логов); реальный источник файла — параметр `?url=`. Прокси **никогда не строит
upstream-ссылку из названия папки/файла** и всегда требует валидную прямую ссылку облака.
Старый формат `GET /api/cdn?url=…` сохранён как обратная совместимость.

**Политика источников:** прокси работает ТОЛЬКО с прямыми ссылками облаков
(Dropbox / Google Drive / OneDrive / Яндекс.Диск / MEGA). Проксирование сторонних
CDN (сторонние зеркальные сервисы любого вида) **не поддерживается и не планируется** —
такие домены отсекаются whitelist'ом `lib/url-guard.ts` с ответом `403 HOST_NOT_ALLOWED`.
Внешние CDN можно использовать только как прямые зеркала на стороне клиента
(см. раздел «Hybrid Config»).

Что делает прокси ([`app/api/cdn/route.ts`](./app/api/cdn/route.ts)):

1. **Rate limiting:** 100 запросов/минуту на IP (`X-Forwarded-For`). Сверху — `429` с `Retry-After`.
2. **Whitelist доменов:** URL обязан вести на известный хост облака — прокси нельзя превратить в SSRF-релей для внутренних сетей (`lib/url-guard.ts`).
3. **Нормализация:** `dropbox.com/s/…?dl=0` → `dl.dropboxusercontent.com/…?dl=1`; `drive.google.com/file/d/ID/view` → `download?id=ID`.
4. **Стрим без буферизации:** тело ответа облака летит клиенту напрямую (edge runtime), поэтому файлы в сотни МБ не съедают память.
5. **CDN-заголовки:**
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Headers: Range, Content-Type
   Cross-Origin-Resource-Policy: cross-origin
   Cache-Control: public, max-age=31536000, immutable   ← обязательно (скорость в лаунчерах)
   Accept-Ranges: bytes                                 ← обязательно (докачка/параллельные сегменты)
   Content-Type: <автоопределение: upstream → расширение файла → octet-stream>
   ETag / Last-Modified: <пробрасываются от облака>
   ```
6. **Fallback:** протухшая/закрытая/HTML-ответ → `404 {"error":"LINK_EXPIRED","message":"Обновите ссылку через расширение…"}`.

Автономная версия той же функции для платформ «одной edge-функции»: [`edge/proxy.ts`](./edge/proxy.ts) (экспортирует `fetch(request)`).

---

## Дашборд и гостевой режим

**Дашборд** (`/dashboard`) — публичная страница без аккаунтов:

- список сохранённых ссылок (IndexedDB, только ваш браузер);
- поле **«Folder Name»** при добавлении — CDN-ссылка генерируется как читаемая
  `https://…/cdn/{folder_name}/{filename}?url=…` (папка группирует файлы проекта,
  имя файла остаётся узнаваемым для кэшей и лаунчеров);
- кнопка «📋 Копировать CDN» — полный читаемый URL;
- «🔎 Проверить» — HEAD-запрос к прокси: жива ссылка или протухла;
- экспорт/импорт JSON — перенос между устройствами;
- приём ссылок от расширения: `/dashboard?add=<cdnUrl>`.

**Гостевой режим:** расширение не обязательно. Вставьте любую прямую ссылку облака
в поле на дашборде — она сохранится и заработает через прокси сразу. Расширение лишь
автоматизирует поиск этих ссылок.

---

## Hybrid Config: наш CDN + внешние CDN в SA-MP лаунчере

Личный прокси Personal CDN Zero **не проксирует сторонние CDN** — но в лаунчере их
можно использовать как **прямые зеркала**, не через нас. Гибридная схема даёт
отказоустойчивость без нарушения нашей политики источников:

```
┌───────────────┐   основной канал    ┌─────────────────────────────┐
│ SA-MP         │ ──────────────────▶ │ Ваш /cdn/{folder}/{file}    │ → облако (Dropbox/GDrive/Яндекс)
│ лаунчер       │   (приоритет 1)     │ Personal CDN Zero (edge)    │   CORS + immutable-кэш + Accept-Ranges
│               │                     └─────────────────────────────┘
│               │   резервный канал   ┌─────────────────────────────┐
│               │ ──────────────────▶ │ Внешний CDN напрямую        │ (без нашего прокси!)
└───────────────┘   (приоритет 2..N)  └─────────────────────────────┘
```

Почему именно так:

1. **Через наш `/cdn/...`** — файлы из ваших облаков получают `Cache-Control: public,
   max-age=31536000, immutable` и `Accept-Ranges: bytes`: edge-ноды и сам лаунчер кэшируют
   и докачивают сегментами — это критично для скорости раздачи клиентских паков.
2. **Внешний CDN — только прямым URL** в массиве `mirrors`: он работает независимо от
   нашего прокси, поэтому при протухании облачной ссылки или лимите Dropbox лаунчер
   просто переключается на зеркало. Наш прокси такие домены честно отвергнет (`403`).

### files.ini (классический launcher)

```ini
[client]
; приоритет 1 — наш CDN (файл из вашего Dropbox)
mods/client-pack.zip = https://ваш.cdn/cdn/samp-client/client-pack.zip?url=https%3A%2F%2Fdl.dropboxusercontent.com%2Fs%2Fabcd%2Fclient-pack.zip%3Fdl%3D1|remote
```

Лаунчер, поддерживающий несколько URL одного файла, дополняется зеркалом:

### manifest.json (современный/Electron launcher)

```json
{
  "files": [{
    "name": "client-pack.zip",
    "url": "https://ваш.cdn/cdn/samp-client/client-pack.zip?url=https%3A%2F%2Fdl.dropboxusercontent.com%2Fs%2Fabcd%2Fclient-pack.zip%3Fdl%3D1",
    "mirrors": [
      "https://ваш.cdn/cdn/samp-client/client-pack.zip?url=https%3A%2F%2Fonedrive.live.com%2Fdownload%3Fresid%3DABC%26authkey%3Dkey",
      "https://external-cdn.example.org/mirrors/client-pack.zip"
    ],
    "md5": "d41d8cd98f00b204e9800998ecf8427e",
    "target": "mods/client-pack.zip"
  }]
}
```

Логика выбора канала в `examples/samp-launcher/downloader.js`: пробуем URL по порядку,
при 4xx/5xx или таймауте — следующий mirror; md5 сверяется после полной загрузки.
Рабочие шаблоны — в [`examples/samp-launcher/`](./examples/samp-launcher) (`files.ini`
секция `[hybrid-mirrors]`, `manifest.json` с `mirror_note`).

---

## Примеры интеграции

Все примеры — в папке [`examples/`](./examples), рабочие, с комментариями на русском:

- **🎮 SA-MP лаунчер** — [`examples/samp-launcher/`](./examples/samp-launcher): шаблон `files.ini`, `manifest.json` для современных лаунчеров и `downloader.js` (Node) с md5-проверкой, Range-докачкой, ретраями и зеркалами.
- **📝 WordPress** — [`examples/wordpress/personal-cdn-zero.php`](./examples/wordpress/personal-cdn-zero.php): шорткоды `[pcdn]` / `[pcdn_direct]` для картинок, видео, аудио и кнопок скачивания + страница настроек.
- **🌐 Статические сайты** — [`examples/static-site/index.html`](./examples/static-site/index.html): `<img>`, `<video>` с перемоткой (Range!), `fetch()` JSON и `@font-face` — всё через один CDN-URL.

---

## Деплой: Tatnet / Layer0 / Onreza

Единая команда сборки для всех трёх платформ: `npm ci && npm run build`
(вывод — `output: 'standalone'`, запуск `node server.js`).

| Платформа | Конфиг | Особенности |
|-----------|--------|-------------|
| **Tatnet Cloud** | [`deploy/tatnet/deploy.yml`](./deploy/tatnet/deploy.yml) + корневой [`Dockerfile`](./Dockerfile) | Роут `/cdn/*` (+ legacy `/api/cdn/*`) с `cache: false` и таймаутом 60s; RU-регионы — минимальный пинг до Яндекс.Диска |
| **Layer0 (ex-Flare)** | [`deploy/layer0/layer0.config.js`](./deploy/layer0/layer0.config.js), инструкция [`README`](./deploy/layer0/README.md) | Можно вынести `edge/proxy.ts` как отдельную edge-функцию маршрутов `/cdn/:folder/:file` и `/api/cdn` |
| **Onreza** | [`deploy/onreza/onreza.config.js`](./deploy/onreza/onreza.config.js) | Streaming edge-функция на роуте прокси |

После деплоя пропишите ваш домен в popup расширения — цикл замкнётся.

---

## Ограничения прямых ссылок

Честно о том, что может пойти не так (и как это лечится):

1. **Подписанные URL живут недолго.** Яндекс.Диск выдаёт downloader-ссылку с подписью на минуты. Лечение: одно обновление кликом расширения; в дашборде статус «протухла» подсвечен красным.
2. **Суточные лимиты трафика облаков.** GDrive ограничивает скачивание популярных файлов (~10 ГБ/сутки), Dropbox режет bandwidth у «горячих» ссылок. Это лимиты облака, а не прокси. Лечение: зеркала в 2–3 облаках (`manifest.json` пример поддерживает массив `mirrors`).
3. **Размер файлов.** Некоторые облака для >100 МБ требуют confirm-токены; снифферы добавляют их заранее, но самый надёжный способ — дать пользователю открыть предпросмотр файла перед сниффом.
4. **Редизайны верстки.** Селекторы по aria/data переживают редизайны лучше классов, но гарантию даёт только сообщество — присылайте патчи.
5. **MEGA peculiarity.** Шифрование на клиенте означает отсутствие «сырой» прямой ссылки; мы честно отдаём ссылку просмотра для скачивания по клику.
6. **Только облака.** Прокси принципиально не разгоняет сторонние CDN (`blackkazakstan` и любые другие чужие зеркала): whitelist принимает только прямые ссылки облаков. Если нужно зеркало на внешнем CDN — ставьте его прямым URL в mirrors лаунчера, минуя наш прокси (см. «Hybrid Config»).
7. **Не для тяжёлых продакшенов.** Это личный CDN для своих файлов. Rate limit 100 req/min оставлен специально, чтобы чужие боты не выкачали ваше облако до блокировки.

---

## Безопасность

- **SSRF-защита:** прокси ходит только в whitelist облачных доменов (`ALLOWED_HOSTS`); внутренние IP, `localhost`, произвольные хосты запрещены на уровне нормализатора.
- **Только облака, никаких сторонних CDN:** чужие CDN-домены не проксируются принципиально (корректировка ТЗ) — запрос к ним возвращает `403 HOST_NOT_ALLOWED`. Внешние CDN допустимы лишь как прямые зеркала на стороне клиента (см. «Hybrid Config»). Сегменты пути `/cdn/{folder}/{filename}` — только метка: upstream никогда не собирается из них, path-traversal блокируется.
- **Rate limiting:** 100 req/min per IP на обоих рантаймах (Next route и standalone edge function).
- **Приватность:** сервер ничего не хранит; ссылки — только IndexedDB пользователя. В логах платформы остаются URL запросов (стандартное поведение любого веб-сервера) — не кладите в публичные ссылки секреты.
- **Ответственное использование:** инструмент работает с файлами, которые вы сами сделали публичными по ссылке. Обход приватных ограничений облаков не реализован и не будет реализован.

---

## Структура проекта

```
personal-cdn-zero/
├── app/                    # Next.js 14 App Router
│   ├── page.tsx            # Лендинг («Ваш личный CDN. Бесплатно. Без API»)
│   ├── dashboard/page.tsx  # Публичный дашборд (IndexedDB)
│   ├── cdn/[folder]/[file]/route.ts  # читаемые ссылки /cdn/{folder}/{filename}
│   ├── api/cdn/route.ts    # Edge Delivery Proxy
│   ├── layout.tsx
│   └── globals.css
├── extension/              # Manifest V3 (Chrome/Firefox/Edge/Safari)
│   ├── manifest.json
│   ├── background.js       # service worker: история, clipboard, notifications
│   ├── offscreen.{html,js} # clipboard-мост для MV3 SW
│   ├── content/            # common.js (движок) + dropbox/gdrive/onedrive/yandex/mega
│   ├── popup/              # «Отправить в Personal CDN», ручной ввод, настройки, история
│   └── icons/
├── edge/proxy.ts           # Автономная Edge Function (тот же прокси)
├── lib/                    # idb.ts · rate-limit.ts · url-guard.ts
├── deploy/{tatnet,layer0,onreza}/
├── examples/{samp-launcher,wordpress,static-site}/
├── docs/                   # extra-документация
├── Dockerfile              # standalone-образ для контейнерных платформ
├── LICENSE · README.md · CONTRIBUTING.md
```

---

## Вклад и развитие

Прочитайте [CONTRIBUTING.md](./CONTRIBUTING.md). Особенно приветствуются:

- новые content scripts (iCloud, Cloud Mail.ru, Zoho…) — шаблон на 20 строк;
- адаптеры edge-платформ (Cloudflare Workers прямо из `edge/proxy.ts` портируется почти без правок);
- тесты `url-guard` и нормализаторов ссылок;
- перевод UI на английский (вторым языком, комментарии остаются русскими).

Roadmap: авто-обновление протухших Yandex-ссылок по расписанию через popup, WebP-транскод на edge (если позволит память платформы), публичный галерея-режим «раздать файл ссылкой».

## Лицензия

[MIT](./LICENSE) © 2026 Personal CDN Zero Contributors.
Свободно копируйте, модифицируйте, деплойте и продавайте хостинг этого решения — миру нужны дешёвые CDN, а не ещё одна подписка.
