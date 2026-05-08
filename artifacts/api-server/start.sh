#!/bin/bash
# Load .env if DATABASE_URL is not already set from environment
if [ -z "$DATABASE_URL" ] && [ -f "../../.env" ]; then
  set -a
  source ../../.env
  set +a
fi
pnpm run start
