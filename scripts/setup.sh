#!/bin/bash
# setup.sh — One-command setup for any fresh Replit import
# Usage: bash scripts/setup.sh  OR  pnpm run setup
#
# Steps:
#   1. Install all dependencies (pnpm install)
#   2. Verify DATABASE_URL is available
#   3. Push DB schema to Neon (pnpm db:push)
#   4. Print success summary

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║          AJKMart — One-Click Setup           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── 1. INSTALL DEPENDENCIES ──────────────────────────────────────────────────
echo "[setup] Step 1/3 — Installing dependencies..."
pnpm install --no-frozen-lockfile
echo "[setup] Dependencies installed."
echo ""

# ─── 2. VERIFY DATABASE_URL ───────────────────────────────────────────────────
# Source DATABASE_URL from .replit userenv if not already in the environment
if [ -z "${DATABASE_URL:-}" ]; then
  # Try to extract it from .replit [userenv.shared] section
  if [ -f ".replit" ]; then
    EXTRACTED=$(grep -E '^DATABASE_URL\s*=' .replit | head -1 | sed 's/^DATABASE_URL\s*=\s*"\(.*\)"/\1/')
    if [ -n "$EXTRACTED" ]; then
      export DATABASE_URL="$EXTRACTED"
      echo "[setup] DATABASE_URL sourced from .replit userenv."
    fi
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo ""
  echo "[setup] ERROR: DATABASE_URL is not set."
  echo "[setup] Add it to [userenv.shared] in .replit or as a Replit Secret:"
  echo "[setup]   DATABASE_URL = \"postgresql://<user>:<pass>@<host>/<db>?sslmode=require\""
  echo ""
  exit 1
fi

echo "[setup] Step 2/3 — DATABASE_URL is set. Pushing schema..."

# ─── 3. PUSH DB SCHEMA ────────────────────────────────────────────────────────
pnpm db:push
DB_STAMP="node_modules/.bootstrap-db-stamp"
touch "$DB_STAMP"
echo "[setup] Schema pushed to Neon."
echo ""

# ─── 4. SUCCESS SUMMARY ───────────────────────────────────────────────────────
echo "[setup] Step 3/3 — Done!"
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║            Setup complete!                   ║"
echo "║                                              ║"
echo "║  Dependencies installed  ✓                   ║"
echo "║  DB schema pushed        ✓                   ║"
echo "║                                              ║"
echo "║  Click Run to start all services.            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
