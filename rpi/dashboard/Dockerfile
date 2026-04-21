# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/server.mjs ./server.mjs
COPY --from=build /build/package.json ./package.json
EXPOSE 5173
CMD ["node", "server.mjs"]
