FROM node:22.23.4-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM builder AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22.23.4-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    MEOW_HOST=0.0.0.0 \
    MEOW_PORT=3000 \
    MEOW_DATA_DIR=/data/meow-v2 \
    MEOW_STATIC_DIR=/app/build
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/build ./build
RUN mkdir -p /data/meow-v2 && chown -R node:node /data
USER node
EXPOSE 3000
VOLUME ["/data/meow-v2"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/main.js"]
