# Deployment Runbook

## Overview

AJKMart is a pnpm monorepo running on Replit. The primary entry point is `scripts/secure-start.mjs`, which installs dependencies, runs DB migrations, and starts all five services in parallel: API server, Admin panel, Vendor app, Rider app, and the Expo customer app.

---

## Pre-Deploy Checklist

- [ ] All feature branches merged to `main` and peer-reviewed
- [ ] No TypeScript errors: `pnpm run typecheck` passes locally
- [ ] `.replit` `[userenv.shared]` section has all required secrets set (see `.env.example`)
- [ ] `DATABASE_URL` points to the correct Neon PostgreSQL database
- [ ] `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ADMIN_ACCESS_TOKEN_SECRET`, `ADMIN_REFRESH_TOKEN_SECRET`, `ADMIN_CSRF_SECRET`, `ERROR_REPORT_HMAC_SECRET` are all set and ≥ 32 characters
- [ ] `NODE_ENV=production` is set for production deployments
- [ ] If Firebase SMS is used: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` are set
- [ ] If Twilio SMS is used: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` are set
- [ ] If email alerts are enabled: `SENDGRID_API_KEY` or SMTP credentials are set

---

## Step 1 — Install Dependencies

Run from the **workspace root** (where `pnpm-workspace.yaml` lives):

```bash
pnpm install --no-frozen-lockfile
```

> `secure-start.mjs` runs this automatically on each workflow start if `pnpm-lock.yaml` has changed since the last install stamp.

---

## Step 2 — Apply Database Migrations

Drizzle migrations are applied automatically by the API server on startup via `runSqlMigrations()` in `artifacts/api-server/src/services/sqlMigrationRunner.ts`.

To run migrations manually (e.g., to verify before traffic):

```bash
pnpm --filter @workspace/db run migrate
```

To push the current Drizzle schema without a migration file (development only):

```bash
pnpm --filter @workspace/db push
```

> **Production note:** Always use `migrate` (not `push`) in production. `push` is destructive and may drop columns.

---

## Step 3 — Start / Restart Replit Workflows

The Run button triggers the `Project` workflow, which runs `Start application` in parallel with stub `Rider App` and `Vendor App` workflows.

**To restart manually in the Replit UI:**
1. Open the Replit workspace.
2. Click the **Stop** button (if running), then click **Run**.
3. Watch the `Start application` workflow console for health-check confirmations.

**To restart from the shell (Replit shell tab):**

```bash
node scripts/secure-start.mjs
```

This will install deps, skip DB push, start all five services, and print health-check results.

---

## Step 4 — Verify Deployment via `/api/health`

Once the API server is up, verify with:

```bash
curl -sf https://<REPLIT_DEV_DOMAIN>/api/health | node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d)));"
```

Expected response:

```json
{ "status": "ok", "timestamp": "2025-..." }
```

Also check `/api/healthz` for the full structured health payload (DB connectivity, uptime, memory).

---

## Step 5 — Smoke-Test Each App

| App | URL | What to verify |
|---|---|---|
| Admin panel | `/admin/` | Login with `ADMIN_SEED_USERNAME` / `ADMIN_SEED_PASSWORD`; dashboard loads |
| Vendor app | `/vendor/` | Login page renders without JS errors |
| Rider app | `/rider/` | Login page renders without JS errors |
| Customer app | `/customer/` | Expo web app loads; home screen visible |
| API | `/api/health` | Returns `{"status":"ok"}` |
| API Docs | `/api/docs` | Swagger UI renders with all endpoints (admin login required) |

---

## Port Map

| Service | Local port | External port |
|---|---|---|
| API server (main) | 5000 | 80 |
| Admin panel (Vite dev) | 23744 | 3000 |
| Rider app (Vite dev) | 3001 | 6000 |
| Vendor app (Vite dev) | 3002 | 3002 |
| Customer app (Expo web) | 19006 | 8080 |

---

## Rollback

If the deployment fails, see [`rollback.md`](./rollback.md).
