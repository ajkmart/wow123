# AJKMart Super-App — Complete Setup Guide

> Multi-service super-app for AJK region, Pakistan. E-commerce · Food Delivery · Ride-Hailing · Pharmacy · Parcel · Inter-city Transport.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Quick Start](#2-quick-start)
3. [Project File Structure](#3-project-file-structure)
4. [Environment System](#4-environment-system)
5. [Development Workflow](#5-development-workflow)
6. [All pnpm Scripts — Complete Reference](#6-all-pnpm-scripts--complete-reference)
7. [Production Deployment VPS](#7-production-deployment-vps)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Project Overview

AJKMart is a pnpm workspace monorepo containing 5 deployable apps and 10 shared libraries.

| Layer | What |
|---|---|
| **API** | Node.js / Express · Drizzle ORM · PostgreSQL · Socket.IO · JWT |
| **Admin** | React + Vite · Command-centre dashboard |
| **Vendor** | React + Vite · Product & order management portal |
| **Rider** | React + Vite PWA · GPS tracking · Earnings |
| **Customer** | Expo / React Native · iOS · Android · Web |
| **Database** | PostgreSQL (Neon cloud or local) |
| **Cache** | Redis (optional, for rate-limiting) |
| **Push** | Web Push via VAPID |
| **AI** | Google Gemini API |
| **SMS** | Twilio |
| **Email** | SendGrid / SMTP |

---

## 2. Quick Start

### Prerequisites (all platforms)

- **Node.js** 20+ and **pnpm** 9+
- **PostgreSQL** connection string (`DATABASE_URL`)

---

### 2.1 Replit (Recommended for Development)

**Zero-touch setup — 3 steps:**

1. Import the repo from GitHub into any Replit account
2. Add your secrets in the **Replit Secrets panel** (padlock icon): at minimum `DATABASE_URL` and the JWT/auth secrets
3. Press **Run** — everything bootstraps automatically

`scripts/secure-start.mjs` runs automatically and:
- Installs dependencies (`pnpm install`) if missing or stale
- Pushes the database schema (`pnpm db:push`) if `DATABASE_URL` is set
- Starts all five services in parallel with health checks

**Service URLs in Replit preview pane:**

| Service | Path |
|---|---|
| Customer App (Expo web) | `/` |
| API Server | `/api/` |
| Admin Panel | `/admin/` |
| Vendor Portal | `/vendor/` |
| Rider PWA | `/rider/` |

---

### 2.2 GitHub Codespaces

```bash
# 1. Clone repo and open in Codespace
# 2. Install dependencies
pnpm install

# 3. Set environment variables (copy .env.example and fill in values)
cp .env.example .env

# 4. Start all services
pnpm secure-start

# Or start individual services:
pnpm dev:api              # API on :5000
pnpm dev:admin            # Admin on :5173
pnpm dev:vendor           # Vendor on :5174
pnpm dev:rider            # Rider on :5175
pnpm dev:customer         # Customer web on :19006
```

Port forwards are automatically detected by Codespaces.

---

### 2.3 Local Machine

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment (copy template and fill in values)
cp .env.example .env

# 3. Push database schema
pnpm db:push

# 4. Start all services
pnpm secure-start

# Or start services in parallel (foreground, with combined output):
pnpm dev:all
```

---

### 2.4 VPS / Production Server

```bash
# 1. Clone and install
git clone <repo-url>
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your production values

# 3. Build all apps
node scripts/build-production.mjs

# 4. Start with PM2
pnpm pm2:start
```

See [Section 7](#7-production-deployment-vps) for Caddy / Nginx config.

---

## 3. Project File Structure

### Root Directory

| File / Folder | Purpose |
|---|---|
| `package.json` | Root scripts, workspace config, all `pnpm *` commands |
| `pnpm-workspace.yaml` | Workspace package paths (artifacts/*, lib/*) |
| `tsconfig.base.json` | Shared TypeScript compiler base config |
| `tsconfig.json` | Root-level TS project references |
| `.npmrc` | pnpm settings (enforce pnpm usage) |
| `ecosystem.config.cjs` | PM2 app config for VPS production start |
| `flake.nix` / `replit.nix` | Nix environment for Replit |
| `.env` | Active env vars — **gitignored**, never commit |
| `.env.example` | Non-sensitive template — safe to commit |
| `.gitignore` | Ignores `.env` and backup files |
| `replit.md` | Agent memory / project documentation |
| `test123.md` | Legacy reference document |
| `setup.md` | This file — complete setup guide |

---

### scripts/ — Automation Scripts

| File | Purpose |
|---|---|
| ~~`env-manager.mjs`~~ | Removed — use Replit Secrets or `.env` instead |
| `secure-start.mjs` | Universal starter — installs deps, pushes DB, starts all services |
| `dev-ctl.mjs` | Developer control script — start/stop individual services |
| `build-production.mjs` | Build all apps for production |
| `pm2-control.mjs` | Start / stop PM2 via ecosystem.config.cjs |
| `post-merge.sh` | Auto-runs after git merge — installs deps, warns if .env missing |
| `setup.sh` | One-command setup (install + DB push) |
| `src/seed.ts` | Sample product seed data — run to populate dev database |

---

### artifacts/ — Deployable Applications

| App | Dev Port | Prod Path | Stack |
|---|---|---|---|
| `api-server` | 8080 | `/api/` | Node.js · Express · Drizzle · Socket.IO |
| `admin` | 5173 | `/admin/` | React · Vite |
| `vendor-app` | 5174 | `/vendor/` | React · Vite |
| `rider-app` | 5175 | `/rider/` | React · Vite · PWA |
| `ajkmart` | 19006 / 5000 | `/` | Expo · React Native · Web |
| `mockup-sandbox` | 20716 | `/__mockup` | Vite component preview server |

---

### lib/ — Shared Libraries

| Package | Purpose |
|---|---|
| `@workspace/db` | Drizzle ORM schema, migrations, connection helpers |
| `@workspace/api-client-react` | Typed API client with React Query hooks |
| `@workspace/api-spec` | OpenAPI-style API route specifications |
| `@workspace/api-zod` | Zod schemas for all API request/response types |
| `@workspace/i18n` | Trilingual strings — English / Urdu / Roman Urdu |
| `@workspace/service-constants` | Shared enums, service IDs, feature flags |
| `@workspace/auth-utils` | JWT helpers shared between server and clients |
| `@workspace/admin-timing-shared` | Time-slot utilities for admin scheduling |
| `@workspace/phone-utils` | Phone number formatting and validation |
| `@workspace/integrations` | Third-party integration adapters |
| `@workspace/integrations-gemini-ai` | Google Gemini AI helpers |

---

### deploy/ — Server Config Files

| File | Purpose |
|---|---|
| `Caddyfile` | Caddy web server config — reverse proxy + static files |
| `nginx.conf` | Nginx alternative config |
| `env.example` | Legacy env example (use `.env.example` at root instead) |

---

## 4. Environment System

All secrets are managed via **Replit Secrets** on Replit, or a plain `.env` file on other platforms. There is no encrypted `.env.enc` system.

### On Replit

Add secrets directly in the **Secrets panel** (padlock icon in the sidebar). Required secrets:

| Group | Variables |
|---|---|
| Database | `DATABASE_URL` |
| JWT / Auth | `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ADMIN_REFRESH_SECRET`, `ADMIN_SECRET`, `ADMIN_ACCESS_TOKEN_SECRET`, `ADMIN_REFRESH_TOKEN_SECRET`, `ADMIN_CSRF_SECRET`, `VENDOR_JWT_SECRET`, `RIDER_JWT_SECRET`, `JWT_ISSUER` |
| Admin Seed | `ADMIN_SEED_USERNAME`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_EMAIL`, `ADMIN_SEED_NAME` |
| Security | `ERROR_REPORT_HMAC_SECRET`, `ALLOWED_ORIGINS`, `ADMIN_LEGACY_AUTH_DISABLED`, `ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN` |
| Ports & URLs | `PORT` (5000), `APP_BASE_URL`, `ADMIN_BASE_URL`, `FRONTEND_URL`, `CLIENT_URL`, `PORT_FALLBACK_ENABLE`, `PORT_MAX_RETRIES` |
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Twilio / SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Email | `SENDGRID_API_KEY`, `SMTP_HOST` |
| AI | `GEMINI_API_KEY` |
| Maps & Routing | `GOOGLE_MAPS_API_KEY`, `OSRM_API_URL` |
| Push (VAPID) | `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_CONTACT_EMAIL` |
| Infrastructure | `REDIS_URL`, `SENTRY_DSN` |
| Runtime | `NODE_ENV`, `LOG_LEVEL` |
| Expo / Vite | `EXPO_PUBLIC_DOMAIN`, `VITE_API_BASE_URL`, `VITE_API_PROXY_TARGET` |

### On other platforms (local / Codespaces / VPS)

Copy the template and fill in your values:

```bash
cp .env.example .env
# Edit .env with your actual credentials
```

### Security Rules

- `.env` is gitignored — never commit it
- `.env.example` is safe to commit (secrets redacted)

---

## 5. Development Workflow

### First Time (new machine / clone)

```bash
git clone <repo-url>
cd ajkmart
pnpm install
cp .env.example .env      # fill in your credentials
pnpm db:push              # apply schema to database
pnpm secure-start         # start all services
```

### Daily Work

```bash
pnpm secure-start         # start all services
# OR
pnpm dev:api              # start only API
pnpm dev:admin            # start only admin
```

### After Pulling Changes (git pull / merge)

The `scripts/post-merge.sh` runs automatically and:
1. Installs any new dependencies (`pnpm install`)
2. Builds shared libraries (`@workspace/db`, `@workspace/phone-utils`)
3. Runs any pending SQL migrations if `DATABASE_URL` is set

> **Note:** `DATABASE_URL` must be present in your process environment (via Replit Secrets, `[userenv.shared]` in `.replit`, or exported in your shell session) for migrations to run. On Replit this is automatic; on other platforms run `export DATABASE_URL=<your-url>` before invoking post-merge manually.

### Database Commands

```bash
pnpm db:push              # push schema changes to database
pnpm db:studio            # open Drizzle Studio (visual DB browser)
pnpm db:generate          # generate migration files
pnpm db:migrate           # run migrations
```

### Seeding Sample Data

```bash
pnpm --filter @workspace/scripts tsx scripts/src/seed.ts
```

Inserts 20 sample products (groceries, food, household) for vendor `vendor_demo_001`.

---

## 6. All pnpm Scripts — Complete Reference

### Startup Scripts

| Script | Command | Description |
|---|---|---|
| `pnpm secure-start` | `node scripts/secure-start.mjs` | Start all services (any platform) |
| `pnpm start:all` | `node scripts/secure-start.mjs` | Alias for secure-start |
| `pnpm dev:all` | shell `&` parallel | Start all 5 services in foreground |
| `pnpm pm2:start` | `node scripts/pm2-control.mjs start` | Start services via PM2 (production) |
| `pnpm pm2:stop` | `node scripts/pm2-control.mjs stop` | Stop PM2 services |
| `pnpm pm2:restart` | `pnpm dlx pm2 restart all` | Restart PM2 services |
| `pnpm pm2:logs` | `pnpm dlx pm2 logs` | View PM2 logs |

### Dev Scripts (individual services)

| Script | Port | Description |
|---|---|---|
| `pnpm dev:api` | 8080 | API server (hot reload) |
| `pnpm dev:admin` | 5173 | Admin panel (Vite HMR) |
| `pnpm dev:vendor` | 5174 | Vendor portal (Vite HMR) |
| `pnpm dev:rider` | 5175 | Rider app (Vite HMR) |
| `pnpm dev:customer` | 19006 | Customer Expo web |

### Database Scripts

| Script | Description |
|---|---|
| `pnpm db:push` | Push Drizzle schema to database |
| `pnpm db:generate` | Generate migration SQL files |
| `pnpm db:migrate` | Run pending migrations |
| `pnpm db:studio` | Open Drizzle Studio browser |

### Build & Deploy Scripts

| Script | Description |
|---|---|
| `pnpm build:all` | Build all 5 apps for production |
| `pnpm build:api` | Build API server only |
| `pnpm build:admin` | Build admin panel only |
| `pnpm build:vendor` | Build vendor portal only |
| `pnpm build:rider` | Build rider app only |
| `pnpm build:customer` | Build customer Expo web only |

### Utility Scripts

| Script | Description |
|---|---|
| `pnpm check-permissions` | Validate Replit permissions (used by Run button) |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm typecheck` | TypeScript type-check all packages |

---

## 7. Production Deployment (VPS)

### Server Requirements

- Ubuntu 22.04+ / Debian 12+
- Node.js 20+, pnpm 9+
- PostgreSQL 15+ (or Neon cloud DB)
- Caddy or Nginx (for reverse proxy)
- PM2 (for process management)
- Optional: Redis 7+ (for caching/rate-limiting)

### Step-by-Step

```bash
# 1. Clone and install
git clone <repo-url> /srv/ajkmart
cd /srv/ajkmart
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env — set NODE_ENV=production, APP_BASE_URL, ALLOWED_ORIGINS, DATABASE_URL, etc.

# 3. Push database schema
pnpm db:push

# 5. Build all apps
node scripts/build-production.mjs

# 6. Start with PM2
node scripts/pm2-control.mjs start

# PM2 commands:
pnpm dlx pm2 list           # check status
pnpm dlx pm2 logs           # view logs
pnpm dlx pm2 restart all    # restart
pnpm dlx pm2 stop all       # stop
```

### Caddy Config (deploy/Caddyfile)

```
AJKMART_DOMAIN=yourdomain.com \
APP_ROOT=/srv/ajkmart \
caddy run --config deploy/Caddyfile
```

Routes:
- `/api/*` → API server (port 8080)
- `/admin/*` → Admin dist/public
- `/vendor/*` → Vendor dist/public
- `/rider/*` → Rider dist/public
- `/*` → Customer web (port 19006)

### Environment Variables for Production

Edit `.env` (or set as system environment variables / server secrets) before deploying:

| Variable | Production Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your production PostgreSQL URL |
| `APP_BASE_URL` | `https://yourdomain.com` |
| `ALLOWED_ORIGINS` | `https://yourdomain.com` |
| `REDIS_URL` | `redis://localhost:6379` (if Redis installed) |
| `SENTRY_DSN` | Your real Sentry DSN (for error tracking) |
| `FIREBASE_PRIVATE_KEY` | Real key from Firebase Console |
| `GEMINI_API_KEY` | Real Google AI API key |

---

## 8. Troubleshooting

### `DATABASE_URL` not set / DB connection fails

On Replit: add `DATABASE_URL` in the Secrets panel (padlock icon).
On other platforms: set it in your `.env` file.

```bash
pnpm db:push              # re-push schema after fixing DATABASE_URL
```

### Port already in use

The API server has auto port-retry (up to 10 ports). Or set `PORT_FALLBACK_ENABLE=false` to get a clear error.

### TypeScript / Build errors

```bash
pnpm typecheck             # see all TS errors across monorepo
pnpm --filter @workspace/api-server typecheck    # single package
```

### pnpm install fails

```bash
corepack enable            # enable corepack (fixes pnpm version issues)
pnpm install --no-frozen-lockfile
```

### API returns 401 / JWT errors

Ensure all JWT secrets are set — `JWT_SECRET`, `ADMIN_JWT_SECRET`, `VENDOR_JWT_SECRET`, `RIDER_JWT_SECRET`, etc. On Replit, add them in the Secrets panel.

### Firebase / Push notifications not working

`FIREBASE_PRIVATE_KEY` needs a real key from Firebase:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Copy the `private_key` field from the downloaded JSON
4. Add it as `FIREBASE_PRIVATE_KEY` in Replit Secrets (or your `.env`)

### Gemini AI not responding

Get a real API key and add it as `GEMINI_API_KEY`:
1. Go to https://makersuite.google.com/app/apikey
2. Create a new API key
3. Add it in Replit Secrets (or your `.env` file)

---

## Summary: Required Secrets

Add these in the Replit Secrets panel (or `.env` for other platforms):

| Group | Variables | Notes |
|---|---|---|
| Database | `DATABASE_URL` | Required — app will not start without it |
| JWT / Auth | `JWT_SECRET`, `ADMIN_JWT_SECRET`, `VENDOR_JWT_SECRET`, `RIDER_JWT_SECRET`, etc. | Required for auth to work |
| Admin Seed | `ADMIN_SEED_USERNAME`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_EMAIL` | Needed for first admin account |
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Optional — push notifications |
| Gemini AI | `GEMINI_API_KEY` | Optional — AI features |
| Twilio / SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Optional — SMS OTP |
| Email | `SENDGRID_API_KEY` | Optional — email delivery |

---

*Last updated: May 2026 — AJKMart v1.x*
