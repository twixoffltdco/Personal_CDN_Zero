# Contributing to Personal CDN Zero

Спасибо, что хотите улучшить проект. Он живой именно благодаря патчам — облака меняют вёрстку, а мы адаптируемся.

## Принципы проекта (нарушение = отказ в PR)

1. **No API.** Никаких OAuth, App Keys, Client Secrets, SDK облаков. Только публичные прямые ссылки.
2. **Бесплатно.** Решение должно работать на бесплатных тарифах облаков и бесплатных edge-платформах.
3. **Устойчивость к вёрстке.** В content scripts используйте селекторы по `aria-label`, `data-*` атрибутам, тексту кнопок — **не** по CSS-классам.
4. **Приватность.** Ссылки хранятся только в IndexedDB пользователя. Не добавляйте серверное хранение без явной дискуссии в Issue.
5. **Комментарии на русском.** Язык кода — английский, язык комментариев и UI — русский.

## Структура

```
app/            Next.js 14 (App Router): лендинг, дашборд, /api/cdn
extension/      Manifest V3: content scripts, popup, background SW
edge/proxy.ts   автономная Edge Function для Tatnet/Layer0/Onreza
lib/            idb.ts, rate-limit.ts, url-guard.ts
docs/           документация
examples/       SA-MP, WordPress, static sites
deploy/         конфиги платформ
```

## Как добавить новое облако

1. Создайте `extension/content/<provider>.js` по образцу `dropbox.js` (~20–40 строк).
2. Добавьте запись в `content_scripts` и `host_permissions` в `extension/manifest.json`.
3. Добавьте домены в `ALLOWED_HOSTS` (`lib/url-guard.ts` и `edge/proxy.ts`).
4. Обновите таблицу облаков в README.md и лендинге.

## Процесс

1. Fork → feature branch (`feat/yandex-metro-support`, `fix/gdrive-large-file`).
2. `npm ci && npm run build` — сборка обязана проходить; расширение тестируется загрузкой распакованного `extension/`.
3. Один PR = одна логическая изменение. Опишите, **как вы проверили сниффер** (скриншот/network log приветствуются).
4. Code of Conduct: уважение к участникам, никаких токсичных ревью.

## Безопасность

Уязвимости сообщайте приватно (security@ проекта или через GitHub Private Vulnerability Report), **не** через публичный Issue. Отдельно следите, чтобы правки не превратили `/api/cdn` в открытый SSRF-релей: любой новый хост обязан попасть в whitelist осознанно.

## Лицензия

Отправляя PR, вы подтверждаете, что ваш код лицензируется под MIT (см. LICENSE).
