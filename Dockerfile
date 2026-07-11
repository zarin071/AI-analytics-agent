# ── AI Analytics Agent — API image ──────────────────────────────────────────
# Multi-stage: build workspace → slim runtime. The dashboard builds to static
# files and is served by any CDN/nginx (see kubernetes/dashboard.yaml).

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY agent/package.json agent/
COPY sdk/package.json sdk/
COPY api/package.json api/
COPY connectors/package.json connectors/
COPY dashboard/package.json dashboard/
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm --filter @ai-analytics/agent --filter @ai-analytics/connectors --filter @ai-analytics/api build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/agent/dist ./agent/dist
COPY --from=build /app/agent/package.json ./agent/
COPY --from=build /app/connectors/dist ./connectors/dist
COPY --from=build /app/connectors/package.json ./connectors/
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/package.json ./api/
COPY analytics.config.ts prompts ./
COPY database ./database
USER app
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "api/dist/server.js"]
