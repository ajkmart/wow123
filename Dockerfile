# ═══════════════════════════════════════════════════════════════════════════
#  AJKMart Multi-Stage Dockerfile
#
#  Stages:
#    1. deps    — install all workspace dependencies (layer-cached)
#    2. builder — compile API server + build Vite frontend apps
#    3. runtime — minimal production image with PM2 + Caddy
#
#  Build:
#    docker build -t ajkmart .
#
#  Run (single container):
#    docker run -p 80:80 --env-file .env ajkmart
#
#  Or use docker-compose:
#    docker-compose up
#
#  Notes:
#    - Uses node:18-slim (Debian/glibc) — required for the `sharp` native addon.
#      Alpine (musl libc) causes sharp to crash at import time.
#    - The Expo/React Native customer app (artifacts/ajkmart) is NOT built here.
#      Docker only handles web/server targets. Use EAS for native builds.
#    - Caddy serves on port 80 and routes to the API (8080) and static builds.
#    - PM2 manages the API server process inside the container.
# ═══════════════════════════════════════════════════════════════════════════


# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — deps: install ALL workspace dependencies (cached layer)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:18-slim AS deps

WORKDIR /app

# Suppress Husky git-hooks setup (no .git dir in Docker) and signal CI context.
ENV HUSKY=0 \
    CI=true

# Enable corepack so pnpm is available without a separate global install.
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

# ── Workspace manifests ──
# Copy every package.json + pnpm-lock.yaml before `pnpm install` so that
# the install layer is only invalidated when a manifest or lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Artifact packages
COPY artifacts/api-server/package.json  ./artifacts/api-server/
COPY artifacts/admin/package.json       ./artifacts/admin/
COPY artifacts/vendor-app/package.json  ./artifacts/vendor-app/
COPY artifacts/rider-app/package.json   ./artifacts/rider-app/
# ajkmart package.json is required so pnpm can resolve the workspace graph,
# even though we skip building the Expo app.
COPY artifacts/ajkmart/package.json     ./artifacts/ajkmart/

# Shared libraries
COPY lib/admin-timing-shared/package.json   ./lib/admin-timing-shared/
COPY lib/api-client-react/package.json      ./lib/api-client-react/
COPY lib/api-spec/package.json              ./lib/api-spec/
COPY lib/api-zod/package.json              ./lib/api-zod/
COPY lib/auth-utils/package.json            ./lib/auth-utils/
COPY lib/db/package.json                    ./lib/db/
COPY lib/i18n/package.json                  ./lib/i18n/
COPY lib/integrations-gemini-ai/package.json ./lib/integrations-gemini-ai/
COPY lib/phone-utils/package.json           ./lib/phone-utils/
COPY lib/service-constants/package.json     ./lib/service-constants/
COPY lib/ui/package.json                    ./lib/ui/

# Scripts workspace member
COPY scripts/package.json ./scripts/

# Install all dependencies with a frozen lockfile to guarantee reproducibility.
RUN pnpm install --frozen-lockfile


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — builder: compile all web/server apps
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS builder

# Copy full source (node_modules already present from deps stage).
COPY . .

# ── API server (esbuild → dist/index.mjs) ──
RUN pnpm --filter @workspace/api-server build

# ── Vite frontend apps ──
# @workspace/ajkmart is explicitly excluded: it is an Expo app and requires
# different tooling (EAS / expo export) not available in this build context.
RUN BASE_PATH=/admin/   pnpm --filter @workspace/admin      build
RUN BASE_PATH=/vendor/  pnpm --filter @workspace/vendor-app build
RUN BASE_PATH=/rider/   pnpm --filter @workspace/rider-app  build

# ── Production deploy bundle for the API server ──
# `pnpm deploy` produces a self-contained directory with only production
# dependencies and the package source — no devDeps, no unrelated workspace
# packages.  The compiled dist/ is copied in afterwards.
RUN pnpm --filter @workspace/api-server deploy --prod /prod/api-server
COPY --from=builder /app/artifacts/api-server/dist /prod/api-server/dist


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runtime: minimal production image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:18-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    APP_ROOT=/app \
    API_PORT=8080 \
    MOBILE_WEB_PORT=19006

# ── System packages ──
# - curl/wget: health checks
# - debian-keyring / apt-transport-https: required to add the Caddy apt repo
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        debian-keyring \
        debian-archive-keyring \
        apt-transport-https \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
    && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | tee /etc/apt/sources.list.d/caddy-stable.list \
    && apt-get update && apt-get install -y --no-install-recommends caddy \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── PM2 process manager ──
RUN npm install -g pm2 --no-fund --no-audit

# ── API server — production-only node_modules + compiled bundle ──
COPY --from=builder /prod/api-server ./artifacts/api-server

# ── Database migrations (needed at startup) ──
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder /app/lib/db/src        ./lib/db/src

# ── Built frontend static assets ──
# Caddy serves these directly from disk — no Vite preview server needed.
COPY --from=builder /app/artifacts/admin/dist      ./artifacts/admin/dist
COPY --from=builder /app/artifacts/vendor-app/dist ./artifacts/vendor-app/dist
COPY --from=builder /app/artifacts/rider-app/dist  ./artifacts/rider-app/dist

# ── PM2 ecosystem config ──
COPY ecosystem.config.cjs ./

# ── Caddy reverse-proxy config ──
COPY deploy/Caddyfile /etc/caddy/Caddyfile

# ── Entrypoint script ──
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# ── Upload storage (falls back to local disk when S3 is not configured) ──
RUN mkdir -p ./uploads

# Port 80 is the single externally-visible port; Caddy proxies internally.
EXPOSE 80

# Health probe — checks the API server's /health endpoint via Caddy.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:80/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
