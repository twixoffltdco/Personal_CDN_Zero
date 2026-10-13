// deploy/onreza/onreza.config.js — конфигурация деплоя Onreza Edge Platform.
// Onreza принимает Docker-образ (см. /Dockerfile) либо git-репозиторий с автоопределением Next.js.
// Комментарии на русском допускаются, т.к. это JS-конфиг (не строгий JSON).

module.exports = {
  name: 'personal-cdn-zero',
  runtime: 'node20',
  build: {
    dockerfile: 'Dockerfile',
  },
  env: {
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
  },
  edge: {
    enabled: true,
    regions: ['ru-mos', 'ru-ekb', 'eu-de'], // российские точки — минимальный пинг до Яндекс.Диска
    functions: [
      {
        route: ['/cdn/*', '/api/cdn/*'],   // читаемые /cdn/{folder}/{file} + старый /api/cdn       // edge-прокси как отдельная функция…
        entrypoint: 'edge/proxy.ts', // …или остаётся роутом Next.js — оба варианта в репо
        timeoutMs: 60000,
        streaming: true,           // бинарный поток без буферизации
      },
    ],
  },
  cache: {
    exclude: ['/api/*'], // кэш отдаёт сам прокси через Cache-Control
  },
};
