#!/bin/bash
set -e

# ─── INSTALL ──────────────────────────────────────────────────────────────────
INSTALL_MARKER="node_modules/.post-merge-install-marker"
if [ ! -d "node_modules" ] || [ ! -f "$INSTALL_MARKER" ] || [ "pnpm-lock.yaml" -nt "$INSTALL_MARKER" ]; then
  echo "[post-merge] Running pnpm install..."
  pnpm install --no-frozen-lockfile
  touch "$INSTALL_MARKER"
else
  echo "[post-merge] node_modules up to date, skipping install"
fi

# ─── BUILD LIBS ───────────────────────────────────────────────────────────────
pnpm --filter @workspace/db build 2>/dev/null || echo "[post-merge] WARN: @workspace/db build skipped"
pnpm --filter @workspace/phone-utils build 2>/dev/null || echo "[post-merge] WARN: @workspace/phone-utils build skipped"

# ─── MIGRATIONS ───────────────────────────────────────────────────────────────
MIGRATION_DIR="lib/db/migrations"
DB_URL="${DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "[post-merge] Skipping migrations — no DATABASE_URL set."
  echo "[post-merge] Add DATABASE_URL as a Replit Secret, then re-run post-merge manually."
else
  psql "$DB_URL" -c "
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  " 2>&1

  for sql_file in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
    filename=$(basename "$sql_file")
    already_applied=$(psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM _schema_migrations WHERE filename = '$filename';")
    if [ "$already_applied" -eq "0" ]; then
      echo "[migration] Applying $filename..."
      psql "$DB_URL" -f "$sql_file" 2>&1 && \
        psql "$DB_URL" -c "INSERT INTO _schema_migrations (filename) VALUES ('$filename') ON CONFLICT DO NOTHING;" 2>&1
      echo "[migration] Applied $filename"
    else
      echo "[migration] Skipping $filename (already applied)"
    fi
  done
fi

echo "[post-merge] Done"
