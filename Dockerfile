# Personal CDN Zero — деплой на Tatnet Cloud (Next.js 14, standalone build)
# Документация: https://tat.cloud → «Контейнеры» → сборка из Git-репозитория.
# 1) Подключите репозиторий GitHub/Gitverse.ru в Tatnet CI.
# 2) Build command:  npm ci && npm run build
#    (Dockerfile ниже — альтернатива для ручного контейнера)
# 3) Start command:  node server.js        (PORT подставляется платформой)
# 4) Домен и HTTPS включаются в панели Tatnet; edge-роут /api/cdn работает на том же контейнере.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js output:'standalone' собирает минимальный рантайм
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
