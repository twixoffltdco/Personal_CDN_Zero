# deploy/layer0/README.md — Layer0 (ex. Flare): быстрая настройка

1. `npm i -g @layer0/cli && layer0 init` в корне репозитория.
2. Скопируйте `deploy/layer0/layer0.config.js` в корень как `layer0.config.js`.
3. Для edge-режима прокси можно вынести `edge/proxy.ts` отдельной функцией:
   ```js
   // layer0/routes.js
   const { router, edge } = require('@layer0/core');
   module.exports = router.edge().get('/cdn/:folder/:file', edge('./edge/proxy.ts'))  // читаемые ссылки
     .edge().get('/api/cdn', edge('./edge/proxy.ts'))               // прямой ?url= формат;
   ```
4. Деплой: `layer0 deploy --target=production`.
5. Обновите адрес сайта в popup расширения (поле «Адрес вашего сайта Personal CDN»).
