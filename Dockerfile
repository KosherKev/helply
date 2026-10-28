# Helply API. Node 22 has built-in SQLite; the only runtime dependency is Express.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=8787 HELPLY_DB_PATH=/data/helply.db
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
COPY scripts/seed-logs.js scripts/verify-live.js scripts/check-khaya.js ./scripts/
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:8787/health || exit 1
CMD ["node", "--experimental-sqlite", "--disable-warning=ExperimentalWarning", "src/server.js"]
