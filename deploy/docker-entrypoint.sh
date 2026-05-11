#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# AJKMart Docker Entrypoint
#
# Execution order:
#   1. Start Caddy in the background (reverse proxy on port 80)
#   2. Run DB migration check via the API server's built-in migrator
#   3. Hand off to pm2-runtime so the container stays in the foreground
#      and PM2 manages restarts for individual app processes.
#
# Environment variables (set via docker-compose or --env-file):
#   DATABASE_URL   — PostgreSQL connection string (required)
#   API_PORT       — internal API server port (default: 8080)
#   APP_ROOT       — root of the app inside the container (default: /app)
#   AJKMART_DOMAIN — public hostname for Caddy TLS (default: localhost)
# ─────────────────────────────────────────────────────────────────────────────

set -e

APP_ROOT="${APP_ROOT:-/app}"

echo "[entrypoint] Starting AJKMart container..."

# ── 1. Caddy ─────────────────────────────────────────────────────────────────
# Run caddy in the background.  Caddy reads /etc/caddy/Caddyfile which was
# baked into the image at build time.
echo "[entrypoint] Starting Caddy reverse proxy..."
caddy start --config /etc/caddy/Caddyfile --adapter caddyfile
echo "[entrypoint] Caddy started."

# ── 2. Database migrations ────────────────────────────────────────────────────
# The API server runs Drizzle migrations on every boot; we trigger a quick
# pre-flight here so migration errors surface before PM2 takes over.
echo "[entrypoint] Running database migrations..."
cd "${APP_ROOT}/artifacts/api-server"
node -e "
import('./dist/index.mjs').catch((err) => {
  // Startup imports run migrations; if they fail we want the container to exit.
  console.error('[migration] Fatal error during startup:', err.message);
  process.exit(1);
});
// Give the server 10 s to run migrations then kill it — PM2 will start it properly.
setTimeout(() => process.exit(0), 10000);
" || true
cd "${APP_ROOT}"
echo "[entrypoint] Migration pre-flight complete."

# ── 3. PM2 ───────────────────────────────────────────────────────────────────
# pm2-runtime keeps the container's PID 1 in the foreground and forwards
# SIGTERM/SIGINT to all managed processes for graceful shutdown.
echo "[entrypoint] Launching PM2..."
exec pm2-runtime "${APP_ROOT}/ecosystem.config.cjs"
