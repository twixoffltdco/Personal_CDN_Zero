// deploy/layer0/layer0.config.js — конфигурация Layer0 (ex-Flare) для Personal CDN Zero.
// Layer0 поддерживает Next.js из коробки + edge-мидлвары. Установка CLI: npm i -g @layer0/cli
// Деплой: layer0 deploy (из корня репозитория, конфиг копируется в root как layer0.config.js).

module.exports = {
  // Сборка стандартная next build; Layer0 подхватывает output:'standalone'
  includeFiles: {
    public: true,
  },

  // Проброс заголовков клиента в origin — нужен для корректного IP в rate limiter
  featureFlags: {
    edge_streaming: true,        // стриминг ответа прокси без буферизации
    zero_request_timeout: 60,    // сек — крупные файлы должны успеть
  },
};
