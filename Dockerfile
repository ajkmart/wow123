# ═══════════════════════════════════════════════════════════════════════════
#  AJKMart Multi-Stage Dockerfile
#  Stages:
#    1. deps    — install all workspace dependencies (layer-cached)
#    2. builder — compile API server + build all frontend apps
#    3. runner  — minimal production image (API + static assets only)
#
#  Build:
#    docker build -t ajkmart .
#  Run:
#    docker run -p 5000:5000 --env-file .env ajkmart
# ═══════════════════════════════════════════════════════════════════════════

# ───────── Stage 1: Install workspace dependencies ─────────
FROM node:20-alpine AS deps

WORKDIR /app

# Enable corepack so pnpm is available without a global install
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Copy workspace manifests first for better layer caching.
# pnpm needs every package.json present before install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Root-level artifacts
COPY artifacts/api-server/package.json  ./artifacts/api-server/
COPY artifacts/admin/package.json       ./artifacts/admin/
COPY artifacts/vendor-app/package.json  ./artifacts/vendor-app/
COPY artifacts/rider-app/package.json   ./artifacts/rider-app/

# Shared libraries
COPY lib/db/package.json                          ./lib/db/
COPY lib/api-client-react/package.json            ./lib/api-client-react/
COPY lib/api-spec/package.json                    ./lib/api-spec/
COPY lib/api-zod/package.json                     ./lib/api-zod/
COPY lib/i18n/package.json                        ./lib/i18n/
COPY lib/auth-utils/package.json                  ./lib/auth-utils/
COPY lib/phone-utils/package.json                 ./lib/phone-utils/
COPY lib/service-constants/package.json           ./lib/service-constants/
COPY lib/admin-timing-shared/package.json         ./lib/admin-timing-shared/
COPY lib/integrations/package.json                ./lib/integrations/
COPY lib/integrations/gemini_ai_integrations/package.json \
                                                  ./lib/integrations/gemini_ai_integrations/
COPY lib/integrations-gemini-ai/package.json      ./lib/integrations-gemini-ai/
COPY lib/ui/package.json                          ./lib/ui/
COPY scripts/package.json                         ./scripts/

RUN pnpm install --frozen-lockfile


# ───────── Stage 2: Build all applications ─────────
FROM deps AS builder

# Copy full source now that deps are cached
COPY . .

# Build the API server (esbuild → dist/index.mjs)
RUN pnpm --filter @workspace/api-server build

# Build frontend apps with their correct base paths
RUN BASE_PATH=/admin/   pnpm --filter @workspace/admin      build
RUN BASE_PATH=/vendor/  pnpm --filter @workspace/vendor-app build
RUN BASE_PATH=/rider/   pnpm --filter @workspace/rider-app  build


# ───────── Stage 3: Production runner ─────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Workspace config needed for pnpm prod install
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Only the API server needs production node_modules
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Copy shared lib manifests referenced by the API server
COPY lib/db/package.json                          ./lib/db/
COPY lib/api-zod/package.json                     ./lib/api-zod/
COPY lib/auth-utils/package.json                  ./lib/auth-utils/
COPY lib/phone-utils/package.json                 ./lib/phone-utils/
COPY lib/service-constants/package.json           ./lib/service-constants/
COPY lib/integrations/package.json                ./lib/integrations/
COPY lib/integrations/gemini_ai_integrations/package.json \
                                                  ./lib/integrations/gemini_ai_integrations/
COPY lib/integrations-gemini-ai/package.json      ./lib/integrations-gemini-ai/

RUN pnpm install --prod --frozen-lockfile --filter @workspace/api-server

# ── Compiled API server ──
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist

# ── Database migrations (run at startup) ──
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder /app/lib/db/src        ./lib/db/src

# ── Built frontend static assets ──
# The API server proxies /admin/, /vendor/, /rider/ to these dist folders in
# development; in production it serves them directly as static files.
COPY --from=builder /app/artifacts/admin/dist      ./artifacts/admin/dist
COPY --from=builder /app/artifacts/vendor-app/dist ./artifacts/vendor-app/dist
COPY --from=builder /app/artifacts/rider-app/dist  ./artifacts/rider-app/dist

# ── Upload storage (falls back to local disk when S3 not configured) ──
RUN mkdir -p ./uploads

EXPOSE 5000

# Lightweight health probe — Docker marks container unhealthy after 3 failures
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "artifacts/api-server/dist/index.mjs"]
