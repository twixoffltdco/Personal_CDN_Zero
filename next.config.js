/** Конфигурация Next.js 14. Edge-прокси работает на Node/Edge runtime без внешних сервисов. */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tatnet / Layer0 / Onreza поддерживают стандартный вывод next build.
  output: 'standalone',
  async headers() {
    // Глобальные CORS для статических ресурсов лендинга
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
