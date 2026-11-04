# Production image: the built frontend and server plus runtime dependencies, running as "node".
# Build context is this folder; deploy/compose.yml builds it on the server.

FROM node:24-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# Same Debian release as the build stage, so the compiled better-sqlite3 binary runs here too.
FROM node:24-bookworm-slim
LABEL app=aistudio365-shop
ENV NODE_ENV=production DATA_DIR=/app/data
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/shop').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server/dist/index.js"]
