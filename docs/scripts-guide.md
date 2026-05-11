# AJKMart Scripts Complete Guide
## Tamam Scripts ka Maqsad aur Istemal — Teen Environments ke Liye

> **Teen environments:** Replit · GitHub Codespaces · VPS / Local Server

---

## Table of Contents

1. [secure-start.mjs — Main Launcher](#1-secure-startmjs--main-launcher)
2. [Related Scripts Reference](#2-related-scripts-reference)
3. [Secret Rotation Flow](#3-secret-rotation-flow)
4. [First-Time Setup — Per Environment](#4-first-time-setup--per-environment)
5. [ENV_PASSWORD Reference](#5-env_password-reference)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. `secure-start.mjs` — Main Launcher

### Kya Hai, Kyun Hai

`secure-start.mjs` AJKMart ka universal startup script hai. Ek hi command se saare 5 services (API, Admin, Vendor, Rider, AJKMart customer app) start ho jaate hain — environment automatically detect hoti hai, secrets load hote hain, aur health checks run hote hain.

```bash
node scripts/secure-start.mjs
# ya pnpm alias se (dono secure-start.mjs chalate hain):
pnpm run start:all
```

---

### Environment Detection Table

Script ko koi flag nahi dena — automatically detect karta hai:

| Check | Replit | Codespaces | VPS / Local |
|-------|--------|------------|-------------|
| Detection variable | `REPL_ID` set hai | `CODESPACE_NAME` set hai | Dono nahi hain |
| Env name printed | `Replit` | `Codespaces` | `Local` |
| Secrets source | Replit Secrets panel | `.env.enc` decrypt | `.env` ya `.env.enc` |
| Port conflict action | Stale process kill | Error + exit | Error + exit |

---

### Step-by-Step Execution — 8 Numbered Steps

#### Step 1 — `loadEnv()` — Environment Variables Load Karna

Secrets aur config variables process mein inject karta hai.

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| Source | Replit Secrets panel (already in `process.env`) | `.env.enc` ko `ENV_PASSWORD` se decrypt karta hai | `.env` file directly load karta hai, ya `.env.enc` decrypt |
| `.env.reload` | Check karta hai — rotate-secrets ke baad aaya ho tou apply karta hai aur delete karta hai | Same | Same |
| Agar kuch nahi mila | Warning print karta hai, chalte rehta hai | Error + exit (`ENV_PASSWORD` galat ho) | Warning print karta hai |

> **`.env.reload` kya hai?** `rotate-secrets.mjs` rotate ke baad yeh file likhta hai. `secure-start.mjs` isey sabse pehle load karta hai — naye secrets turant apply hote hain. File ek baar use hone ke baad automatically delete ho jaati hai (single-use).

---

#### Step 2 — Ports Resolve Karna

Har service ka port environment variables se read hota hai:

| Service | Default Port | Env Var |
|---------|-------------|---------|
| API Server | `5000` | `PORT` |
| Admin Panel | `3000` | `ADMIN_PORT_OVERRIDE` ya `ADMIN_DEV_PORT` |
| Vendor App | `3002` | `VENDOR_DEV_PORT` |
| Rider App | `3003` | `RIDER_DEV_PORT` |
| AJKMart Customer | `19006` | `PORT_AJK` |

Override karna ho tou:
```bash
PORT=8000 ADMIN_DEV_PORT=3001 node scripts/secure-start.mjs
```

---

#### Step 3 — `applyReplitOverrides()` — Replit Domain Auto-Detect

Sirf Replit par chalti hai. `REPLIT_DEV_DOMAIN` se public URL auto-set karta hai:

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| Action | `ALLOWED_ORIGINS` mein Replit domain add karta hai; `APP_BASE_URL` set karta hai; `EXPO_PUBLIC_DOMAIN` set karta hai | Kuch nahi karta | Kuch nahi karta |
| Result | Frontend apps Replit ke proxied URL pe accessible hoti hain | Manual config needed | Manual config needed |

---

#### Step 4 — `DATABASE_URL` Check

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| Missing ho tou | `"Add DATABASE_URL to Replit Secrets panel"` print karta hai aur exit | `"Add DATABASE_URL to .env.enc"` print karta hai aur exit | Same as Codespaces |
| Set ho tou | `✓ DATABASE_URL configured` print karta hai aur aage jaata hai | Same | Same |

---

#### Step 5 — `installDeps()` + `buildLibs()` — Stamp-Cached Install

Sirf tab chalte hain jab zarurat ho — har baar nahi:

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| `installDeps()` | `pnpm-lock.yaml` change hua ho ya `node_modules` missing ho tou `pnpm install` | Same | Same |
| `buildLibs()` | `lib/` ke src files change hue hon ya `tsconfig.json` change hua ho | Same | Same |
| Skip condition | Stamp file newer hai lock file se | Same | Same |
| Stamp location | `node_modules/.secure-start-stamp` | Same | Same |

This means fresh restarts are fast — install sirf first time ya lockfile change par hota hai.

---

#### Step 6 — `handlePorts()` — Port Management

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| Port occupied ho tou | `fuser -k <port>/tcp` se stale process kill karta hai, 600ms wait karta hai | Error print karta hai aur exit — user ko manually stop karna hoga | Same as Codespaces |
| Reason | Replit container restart par old processes reh jaate hain | Codespaces/VPS par unexpected process = user ki galti | Same |
| Fix (Codespaces/VPS) | N/A | `kill $(lsof -t -i:<port>)` | Same |

---

#### Step 7 — Services Launch — Sab Ek Saath

Paanch services parallel mein spawn hoti hain:

| Service | pnpm filter | Key env vars passed |
|---------|-------------|---------------------|
| `api` | `@workspace/api-server` | `PORT`, `NODE_ENV=development` |
| `admin` | `@workspace/admin` | `ADMIN_DEV_PORT`, `HOST=0.0.0.0`, `BASE_PATH=/admin/`, `VITE_API_PROXY_TARGET` |
| `vendor` | `@workspace/vendor-app` | `VENDOR_DEV_PORT`, `HOST=0.0.0.0`, `BASE_PATH=/vendor/`, `VITE_API_PROXY_TARGET` |
| `rider` | `@workspace/rider-app` | `RIDER_DEV_PORT`, `HOST=0.0.0.0`, `BASE_PATH=/rider/`, `VITE_API_PROXY_TARGET` |
| `ajkmart` | `@workspace/ajkmart` | `PORT` (19006), `EXPO_PUBLIC_DOMAIN`, `REPLIT_DEV_DOMAIN` |

Processes `detached: true` hain — agar `secure-start.mjs` band ho tou services chalti rehti hain.

**Rotation reload:** Agar API server clean exit kare aur `.env.reload` maujood ho, tou script naye secrets apply karke API ko automatically respawn karta hai (800ms delay ke baad). Baaki services (admin, vendor, rider, ajkmart) chalti rehti hain — zero downtime.

---

#### Step 8 — Health Checks + Startup Summary Box

Sab services ke URLs parallel mein check hote hain:

| Service | Health URL | Max retries | Delay between retries |
|---------|-----------|-------------|----------------------|
| API | `/api/health` | 25 | 2s |
| Admin | `http://127.0.0.1:3000/` | 20 | 2s |
| Vendor | `http://127.0.0.1:3002/` | 20 | 2s |
| Rider | `http://127.0.0.1:3003/` | 20 | 2s |
| AJKMart | `http://127.0.0.1:19006/` | 45 | 3s |

Expo web bundling slow hoti hai — isliye zyada retries aur zyada delay.

Akhir mein summary box print hota hai (actual URLs `REPLIT_DEV_DOMAIN` se aati hain, example pattern neeche hai):

```
╔══════════════════════════════════════════════════════════╗
║            AJKMart — all services running  ✓             ║
╠══════════════════════════════════════════════════════════╣
║  🌐 API          https://<REPLIT_DEV_DOMAIN>/api         ║
║  🛠  Admin        https://<REPLIT_DEV_DOMAIN>/admin/      ║
║  🏪 Vendor        https://<REPLIT_DEV_DOMAIN>/vendor/     ║
║  🚴 Rider         https://<REPLIT_DEV_DOMAIN>/rider/      ║
║  📱 Customer      https://<REPLIT_DEV_DOMAIN>/            ║
║  📋 API Docs      https://<REPLIT_DEV_DOMAIN>/api-docs/   ║
╠══════════════════════════════════════════════════════════╣
║  Environment: Replit                                      ║
║  Admin login: superadmin / Admin@123                      ║
╚══════════════════════════════════════════════════════════╝
```

---

### Replit Mein Kaise Kaam Karta Hai

1. Replit Secrets panel (padlock icon) mein variables add karo
2. Run button dabao ya workflow start karo — `node scripts/secure-start.mjs` chalega
3. `REPL_ID` detect hota hai → Replit mode activate
4. Secrets already `process.env` mein hain — decrypt ki zarurat nahi
5. `REPLIT_DEV_DOMAIN` se `ALLOWED_ORIGINS` aur `APP_BASE_URL` auto-set hote hain
6. Port par koi stale process ho tou `fuser -k` se automatically kill hota hai
7. Startup box mein `REPLIT_DEV_DOMAIN` se derived URLs show hoti hain (e.g., `https://<your-repl-domain>/api`)
8. Default login: `superadmin` / `Admin@123`

---

### GitHub Codespaces Mein Kaise Kaam Karta Hai

1. `CODESPACE_NAME` detect hota hai → Codespaces mode
2. `.env.enc` file `ENV_PASSWORD` se decrypt hoti hai (default: `Khan@123.com`)
3. Decrypt hua data `process.env` mein inject hota hai
4. Ports occupied hon tou error + exit (manual stop karna hoga)
5. Codespace preview URL pattern: `https://<codespace-name>-<port>.preview.app.github.dev` (GitHub Codespaces automatically port forward karta hai)

```bash
# Codespaces mein first time:
node scripts/create-env.mjs --merge
node scripts/secure-start.mjs
```

---

### VPS / Local Server Mein Kaise Kaam Karta Hai

1. Naa `REPL_ID`, naa `CODESPACE_NAME` → Local mode
2. `.env` file maujood ho tou directly load karta hai
3. `.env` naa ho tou `.env.enc` decrypt karta hai (`ENV_PASSWORD` se)
4. Dono naa hon tou `process.env` par rely karta hai (warning print hota hai)
5. Port occupied ho tou error + exit — conflicting process manually band karo
6. URLs `http://localhost:5000` jaisi hogi

```bash
# VPS par PM2 ke saath production ke liye:
node scripts/build-production.mjs
node scripts/pm2-control.mjs start
```

---

### Default Ports Table

| Service | Dev Port | Env Var to Override |
|---------|----------|---------------------|
| API Server | 5000 | `PORT` |
| Admin Panel | 3000 | `ADMIN_PORT_OVERRIDE` or `ADMIN_DEV_PORT` |
| Vendor App | 3002 | `VENDOR_DEV_PORT` |
| Rider App | 3003 | `RIDER_DEV_PORT` |
| AJKMart Expo | 19006 | `PORT_AJK` |

### Startup ke Baad URLs

> URL patterns below — Replit mein `<domain>` = `REPLIT_DEV_DOMAIN` ki value; Codespaces mein `<cs-name>` = `CODESPACE_NAME` ki value.

| | Replit (example pattern) | Codespaces (example pattern) | VPS / Local |
|-|--------|------------|-------------|
| API | `https://<domain>/api` | `https://<cs-name>-5000.preview.app.github.dev/api` | `http://localhost:5000/api` |
| Admin | `https://<domain>/admin/` | `https://<cs-name>-3000.preview.app.github.dev/admin/` | `http://localhost:3000/admin/` |
| Vendor | `https://<domain>/vendor/` | `https://<cs-name>-3002.preview.app.github.dev/vendor/` | `http://localhost:3002/vendor/` |
| Rider | `https://<domain>/rider/` | `https://<cs-name>-3003.preview.app.github.dev/rider/` | `http://localhost:3003/rider/` |
| Customer | `https://<domain>/` | `https://<cs-name>-19006.preview.app.github.dev/` | `http://localhost:19006` |

---

## 2. Related Scripts Reference

### Scripts Overview Table

| Script | Command | Kab Chalana Hai |
|--------|---------|-----------------|
| `rotate-secrets.mjs` | `pnpm rotate-secrets` | Zero-downtime JWT secret rotation — production par scheduled ya compromise ke baad |
| `create-env.mjs` | `node scripts/create-env.mjs` | Pehli dafa ya fresh `.env.enc` banana |
| `env-manager.mjs` | `node scripts/env-manager.mjs` | Manual encrypt/decrypt/setup/reset |
| `build-production.mjs` | `node scripts/build-production.mjs` | Production build sab apps ka |
| `pm2-control.mjs` | `node scripts/pm2-control.mjs` | PM2 se production start/stop |
| `migrate.mjs` | `pnpm db:migrate` | Database migrations chalana |
| `dev-ctl.mjs` | `node scripts/dev-ctl.mjs start all` | Individual services start/stop/status |

---

### `rotate-secrets.mjs` — Zero-Downtime Secret Rotation

**Kya karta hai:** Sab JWT, CSRF, HMAC aur encryption secrets ek saath rotate karta hai — running server ko bhi restart karta hai — bina downtime ke.

**Command aur Options:**

```bash
# Basic rotation (confirmation prompt aayega)
pnpm rotate-secrets

# Confirmation skip karo
pnpm rotate-secrets -- --force

# Sirf .env.enc update karo, server restart nahi
pnpm rotate-secrets -- --no-signal

# Custom password se
pnpm rotate-secrets -- --password "MySecurePass"

# Help
pnpm rotate-secrets -- --help
```

**Secrets jo rotate hote hain (11 total):**
- `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ADMIN_ACCESS_TOKEN_SECRET`
- `ADMIN_REFRESH_TOKEN_SECRET`, `ADMIN_CSRF_SECRET`
- `ADMIN_REFRESH_SECRET`, `ADMIN_SECRET`
- `VENDOR_JWT_SECRET`, `RIDER_JWT_SECRET`
- `ENCRYPTION_MASTER_KEY`, `ERROR_REPORT_HMAC_SECRET`

**Environment Behavior:**

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| `.env.enc` update | Haan — backup bhi banata hai (`.env.enc.bak`) | Haan | Haan |
| `.env.reload` | Likhta hai — bridge until Secrets panel update | Likhta hai | Likhta hai |
| Server restart | `SIGHUP` via PID file ya `fuser` | Same | Same |
| Manual step | Replit Secrets panel mein naye values paste karo (permanent ke liye) | Kuch nahi | Kuch nahi |

**Real Example:**
```bash
$ pnpm rotate-secrets

╔══════════════════════════════════════════════════════════╗
║          AJKMart  rotate-secrets                         ║
║          Zero-downtime JWT / security secret rotation    ║
╚══════════════════════════════════════════════════════════╝

  ⚠  This will rotate all JWT/security secrets and trigger a server reload.
  Continue? (yes/no): yes

  Step 1 — Loading existing config…   ✓ Loaded 45 vars from existing .env.enc
  Step 2 — Generating secrets…        ✓ Generated 11 new secrets
  Step 3 — Rebuilding .env.enc…       ✓ .env.enc written + self-validated
  Step 4 — Writing .env.reload…       ✓ .env.reload written (11 secrets, one-time use)
  Step 5 — Signalling API server…     ✓ SIGHUP sent to PID 12345
  Step 6 — Waiting for server…        ✓ Server back up in 8.3s

  Total time: 11.2s
```

---

### `create-env.mjs` — Fresh .env.enc Generator

**Kya karta hai:** Naye cryptographically-strong secrets generate karta hai aur `.env.enc` file banata hai. Pehli dafa setup ya tamam secrets fresh karne ke liye use karo.

**Command aur Options:**

```bash
# Fresh secrets, default password
node scripts/create-env.mjs

# Fresh JWT secrets, existing API keys preserve karo
node scripts/create-env.mjs --merge

# Custom password se
node scripts/create-env.mjs --password "MyP@ss" --merge

# Plaintext .env bhi likho (warning: kabhi commit mat karo)
node scripts/create-env.mjs --merge --write-env

# Preview karo, kuch write nahi hoga
node scripts/create-env.mjs --dry-run

# Confirmation prompt skip karo
node scripts/create-env.mjs --force

# ENV_PASSWORD env var se
ENV_PASSWORD=MyP@ss node scripts/create-env.mjs --force
```

**Environment Behavior:**

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| `.env.enc` | Banata hai (Replit par usually zarurat nahi — Secrets panel use karo) | Banata hai — primary secrets source | Banata hai |
| `--merge` | Optional API keys (Twilio, Firebase etc.) preserve karta hai | Useful for re-generation | Same |
| `--write-env` | Avoid karo Replit par | Useful for debugging | OK but gitignore mein rakhna |

**Real Example:**
```bash
$ node scripts/create-env.mjs --merge

  Generating secrets…
  JWT_SECRET                          a3f9b2c1d4e5f6…
  ADMIN_JWT_SECRET                    7e8d9c0b1a2f3e…
  [... 9 more ...]

  Preserved from existing .env.enc:
  GEMINI_API_KEY                      AIzaS…key4
  DATABASE_URL                        postg…3306

  ✓ .env.enc written (45 variables)
  ✓ Self-validation passed
```

---

### `env-manager.mjs` — Manual Encrypt/Decrypt Tool

**Kya karta hai:** `.env` aur `.env.enc` ke darmiyan manual conversion. Setup wizard bhi provide karta hai.

**Command aur Options:**

```bash
# .env.enc ko decrypt karke .env banao
node scripts/env-manager.mjs decrypt

# .env ko encrypt karke .env.enc banao
node scripts/env-manager.mjs encrypt

# Interactive setup — missing variables ke liye prompt karta hai
node scripts/env-manager.mjs setup

# Sab kuch reset karo (backup banata hai pehle)
node scripts/env-manager.mjs reset

# Help
node scripts/env-manager.mjs help
```

**Environment Behavior:**

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| Primary use | Debugging ya one-off changes | Main workflow | Main workflow |
| `decrypt` | `.env` file banata hai | Same | Same |
| `encrypt` | `.env` se `.env.enc` banata hai | Same | Same |
| `setup` | Interactive wizard — har variable ke liye prompt karta hai | Same | Same |
| Password | Interactive input mein hidden (asterisks) | Same | Same |

**Real Example:**
```bash
$ node scripts/env-manager.mjs decrypt
Enter decryption password: ******* 
✅ Environment decrypted successfully!
✅ Environment file created: .env
```

> **Note:** `decrypt` command `.env` banata hai — yeh file kabhi git mein commit nahi karna. `.gitignore` mein hai already.

---

### `build-production.mjs` — Production Build

**Kya karta hai:** Sab 5 apps ka production-optimized build karta hai. API server TypeScript compile karta hai, Vite apps bundle karta hai.

**Command:**
```bash
node scripts/build-production.mjs

# Mobile build skip karo
SKIP_MOBILE_BUILD=1 node scripts/build-production.mjs
```

**Environment Behavior:**

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| `.env` source | `process.env` se (Secrets panel) | `.env` file | `.env` file |
| Output | `dist/` folders per app | Same | Same |
| `SKIP_MOBILE_BUILD=1` | AJKMart Expo build skip karo | Same | Same |

**Apps build order:**
1. API Server (`artifacts/api-server`) → `dist/index.js`
2. Admin Panel (`artifacts/admin`) → `BASE_PATH=/admin/`
3. Vendor App (`artifacts/vendor-app`) → `BASE_PATH=/vendor/`
4. Rider App (`artifacts/rider-app`) → `BASE_PATH=/rider/`
5. AJKMart Customer (`artifacts/ajkmart`) → `BASE_PATH=/`

**Real Example:**
```bash
$ node scripts/build-production.mjs

Building API server
[... TypeScript compilation output ...]

Building admin panel
[... Vite build output ...]

Production build complete.
```

---

### `pm2-control.mjs` — PM2 Production Process Manager

**Kya karta hai:** PM2 se production processes start ya stop karta hai. `ecosystem.config.cjs` mein defined 5 apps ko manage karta hai.

**Command:**
```bash
# Sab apps start karo (PM2 se)
node scripts/pm2-control.mjs start
# ya
node scripts/pm2-control.mjs  # default action = start

# Sab apps stop karo
node scripts/pm2-control.mjs stop
```

**Environment Behavior:**

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| Recommended | Nahi — Replit workflows use karo | Development ke liye nahi | Production ke liye recommended |
| PM2 requirement | `pnpm dlx pm2` use karta hai — global install zaruri nahi | Same | Same — `pnpm dlx pm2` bina global install ke kaam karta hai |

**Real Example:**
```bash
$ node scripts/pm2-control.mjs start
[PM2] Applying action restartProcessId on app [all]
[PM2] App [api-server] started
[PM2] App [admin-panel] started
[PM2] App [vendor-app] started
[PM2] App [rider-app] started
[PM2] App [ajkmart-web] started
```

---

### `migrate.mjs` — Database Migrations

**Kya karta hai:** Drizzle ORM migrations chalata hai. Idempotent hai — already applied migrations dobara nahi chalata, error nahi deta.

**Command:**
```bash
pnpm db:migrate
# ya directly:
node scripts/migrate.mjs
```

**Environment Behavior:**

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| `DATABASE_URL` source | Replit Secrets panel | `.env` ya `.env.enc` | `.env` ya env var |
| Already applied | `✅ Schema already up-to-date` print karta hai, exit 0 | Same | Same |
| New migrations | Apply karta hai, success print karta hai | Same | Same |
| Failure | Error print karta hai, exit 1 | Same | Same |

**Real Example:**
```bash
$ pnpm db:migrate
[db:migrate] Running Drizzle migrations…
[db:migrate] ✅ Migrations applied successfully:
Applying migration 0010_new_table.sql...
Done!
```

---

### `dev-ctl.mjs` — Individual Service Controller

**Kya karta hai:** Individual services ko start, stop ya status check karta hai. `secure-start.mjs` se alag — yahan har service separately control hoti hai.

**Command:**

> **Note:** `pnpm run start:all` `secure-start.mjs` chalata hai, `dev-ctl.mjs` nahi. `dev-ctl.mjs` directly use karo jab individual service control karna ho.

```bash
# Sab services start karo (dev-ctl ke zariye, secure-start ke bina)
node scripts/dev-ctl.mjs start all

# Sirf API start karo
node scripts/dev-ctl.mjs start api

# Status check karo
node scripts/dev-ctl.mjs status all
node scripts/dev-ctl.mjs status api

# Koi service stop karo
node scripts/dev-ctl.mjs stop rider

# Help
node scripts/dev-ctl.mjs help
```

**Available services:** `api`, `admin`, `vendor`, `rider`, `ajkmart`, `sandbox`

**dev-ctl vs secure-start:**

| Feature | `dev-ctl.mjs` | `secure-start.mjs` |
|---------|--------------|-------------------|
| Health checks | Nahi | Haan |
| Secret loading | Nahi | Haan |
| Port management | Nahi | Haan |
| Stamp-cached install | Nahi | Haan |
| Individual service control | Haan | Nahi (sab saath) |
| Use case | Debugging, selective restart | Normal startup |

**Environment Behavior:**

| | Replit | Codespaces | VPS / Local |
|-|--------|------------|-------------|
| Port defaults | API: 8080, Admin: 5173, etc. (dev-ctl ke apne defaults hain) | Same | Same |
| Stop mechanism | `pkill -f` pattern matching | Same | Same |

> **Note:** `dev-ctl.mjs` ke port defaults `secure-start.mjs` se alag hain (e.g., API port 8080 vs 5000). Production Replit mein `secure-start.mjs` use karo.

---

## 3. Secret Rotation Flow

### rotate-secrets.mjs ka 6-Step Flow

```
┌─────────────────────────────────────────────────────────┐
│              Secret Rotation Flow Diagram                │
└─────────────────────────────────────────────────────────┘

Step 1: LOAD EXISTING CONFIG
  └─► .env.enc decrypt karo (preserve: DATABASE_URL, API keys, etc.)
      ↓
Step 2: GENERATE NEW SECRETS
  └─► 11 cryptographically-strong secrets generate karo
      (64 bytes each = 128-bit entropy, hex encoded)
      ↓
Step 3: REBUILD .env.enc
  └─► Old .env.enc → .env.enc.bak (backup)
  └─► New .env.enc write karo (preserved + new secrets)
  └─► Self-validate: decrypt karke verify karo
      ↓
Step 4: WRITE .env.reload
  └─► 11 new secrets ek-time-use file mein likhta hai
  └─► Ye file server restart par automatically apply + delete hoti hai
      ↓
Step 5: SEND SIGHUP TO API SERVER
  └─► PID file (/tmp/ajkmart-api.pid) se PID dhoondho
  └─► Fallback: fuser <port>/tcp se dhoondho
  └─► process.kill(pid, 'SIGHUP') — graceful drain + exit
      ↓
Step 6: WAIT FOR RESTART + SUMMARY
  └─► Server down hone ka wait karo (max 15s)
  └─► Server wapas aane ka wait karo (max 60s)
  └─► Summary print karo: rotation time + new secret previews
```

### Replit Par Extra Step

`rotate-secrets.mjs` rotation ke baad Replit par yeh print karta hai:

```
⚠  Replit detected — update these in the Replit Secrets panel
   to make the rotation permanent across future restarts:

  JWT_SECRET
  a3f9b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0...
```

Ye values Replit Secrets panel mein manually paste karni hain. `.env.reload` sirf current session ke liye bridge hai — next workflow restart par Replit Secrets se hi load hoga.

### `.env.reload` ka Lifecycle

```
rotate-secrets.mjs
    │
    ▼ writes
.env.reload (11 KEY=VALUE lines)
    │
    ▼ on next server start OR api service respawn
secure-start.mjs loadEnv()
    │  reads .env.reload
    │  applies to process.env (highest priority — overrides everything)
    │  deletes .env.reload
    ▼
Server starts with new secrets

(File is gone — single-use, never persists)
```

---

## 4. First-Time Setup — Per Environment

### Replit Par Setup

```bash
# Step 1: Replit sidebar mein padlock icon click karo
# Step 2: Yeh required secrets add karo:

DATABASE_URL         postgresql://...
JWT_SECRET           <generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
ADMIN_JWT_SECRET     <same generation command>
ADMIN_ACCESS_TOKEN_SECRET   <same>
ADMIN_REFRESH_TOKEN_SECRET  <same>
ADMIN_CSRF_SECRET    <same>
ADMIN_REFRESH_SECRET <same>
ADMIN_SECRET         <same>
VENDOR_JWT_SECRET    <same>
RIDER_JWT_SECRET     <same>
ERROR_REPORT_HMAC_SECRET    <same>
ENCRYPTION_MASTER_KEY       <same>

# Step 3: Replit "Run" button dabao
# secure-start.mjs automatically chalega

# Step 4: Migrations chalao (pehli baar)
pnpm db:migrate

# Done! Summary box mein URLs show hongi
```

---

### GitHub Codespaces Par Setup

```bash
# Step 1: Dependencies install karo
pnpm install

# Step 2: .env.enc banao (fresh secrets with default config)
node scripts/create-env.mjs

# Step 2a: Agar existing API keys preserve karne hain
node scripts/create-env.mjs --merge

# Step 3: DATABASE_URL aur optional API keys set karo
# Option A: .env.enc ko decrypt karo, edit karo, re-encrypt karo
node scripts/env-manager.mjs decrypt
# .env file open karo, DATABASE_URL set karo
node scripts/env-manager.mjs encrypt

# Option B: Direct env var set karo
export DATABASE_URL="postgresql://..."

# Step 4: Migrations chalao
pnpm db:migrate

# Step 5: Sab services start karo
node scripts/secure-start.mjs

# Done! Codespace preview URLs terminal mein show hongi
```

---

### VPS / Local Server Par Setup

```bash
# Step 1: Repository clone karo aur dependencies install karo
git clone <repo-url>
cd ajkmart
pnpm install

# Step 2: .env.enc banao ya .env file banao
# Option A: create-env se (recommended)
node scripts/create-env.mjs --merge

# Option B: Manual .env file
cp .env.example .env   # agar example file hai
# Edit .env mein DATABASE_URL aur secrets set karo

# Step 3: DATABASE_URL configure karo
# .env.enc mein hai — env-manager se decrypt karo aur edit karo:
node scripts/env-manager.mjs decrypt
nano .env  # DATABASE_URL set karo
node scripts/env-manager.mjs encrypt

# Step 4: Migrations chalao
pnpm db:migrate

# Step 5: Development ke liye
node scripts/secure-start.mjs

# Step 5 (alternative): Production ke liye PM2 se
node scripts/build-production.mjs
node scripts/pm2-control.mjs start

# Done! http://localhost:5000 par accessible hoga
```

---

## 5. ENV_PASSWORD Reference

### Kya Hai

`ENV_PASSWORD` woh password hai jis se `.env.enc` file encrypt/decrypt hoti hai. AES-256-GCM encryption use hoti hai, key `scrypt` se derive hoti hai.

### Default Password

```
Khan@123.com
```

> **Warning:** Default password sirf development ke liye hai. Production mein hamesha strong custom password use karo.

### Override Kaise Karo

```bash
# Method 1: Env var se (recommended)
ENV_PASSWORD=MySecurePass node scripts/secure-start.mjs
ENV_PASSWORD=MySecurePass node scripts/create-env.mjs
ENV_PASSWORD=MySecurePass pnpm rotate-secrets

# Method 2: Flag se (rotate-secrets aur create-env support karte hain)
node scripts/create-env.mjs --password "MySecurePass"
node scripts/rotate-secrets.mjs --password "MySecurePass"
```

### Kis Script Mein Use Hota Hai

| Script | ENV_PASSWORD kaise use karta hai |
|--------|----------------------------------|
| `secure-start.mjs` | `.env.enc` decrypt karne ke liye (Codespaces/Local) |
| `create-env.mjs` | Naya `.env.enc` encrypt karne ke liye |
| `env-manager.mjs` | Encrypt/decrypt ke liye (interactive password prompt) |
| `rotate-secrets.mjs` | Existing `.env.enc` read aur naya likhne ke liye |

### Password Change Karna

```bash
# Step 1: Old password se decrypt karo
ENV_PASSWORD=OldPass node scripts/env-manager.mjs decrypt

# Step 2: Naye password se encrypt karo  
ENV_PASSWORD=NewPass node scripts/env-manager.mjs encrypt

# Step 3: Sab team members aur CI/CD ko naya password do
```

---

## 6. Troubleshooting

### Common Errors aur Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `DATABASE_URL is not set` | Database URL configure nahi ki | **Replit:** Secrets panel mein `DATABASE_URL` add karo. **Codespaces/Local:** `.env.enc` mein add karo ya `export DATABASE_URL=...` |
| `Failed to decrypt .env.enc` | `ENV_PASSWORD` galat hai ya file corrupt hai | Sahi password use karo: `ENV_PASSWORD=CorrectPass node scripts/secure-start.mjs`. Agar password bhool gaye: naya `create-env.mjs` chalaao |
| `Ports already in use: api:5000` | Port par koi aur process chal raha hai (Codespaces/VPS) | `kill $(lsof -t -i:5000)` ya `fuser -k 5000/tcp` |
| `.env.enc not found` | File exist nahi karti | `node scripts/create-env.mjs` chalao |
| `pnpm: command not found` | pnpm install nahi | `npm install -g pnpm` ya Replit par `npm i -g pnpm@9` |
| `Server did not come back within 60s` after rotation | Server restart slow tha ya crash hua | Workflow logs check karo. `.env.reload` still maujood hoga — next restart par automatically apply hoga |
| `Self-validation FAILED` in rotate-secrets | Disk full ya permission issue | `df -h` check karo. Backup `(.env.enc.bak)` se restore karo |
| `Could not find API server PID` | rotate-secrets ne running server nahi dhoondha | `--no-signal` flag use karo aur server manually restart karo |
| `Migration failed` | Database unavailable ya schema conflict | `DATABASE_URL` check karo. `pnpm db:migrate` dubara chalao. Agar conflict hai tou Drizzle logs check karo |
| `ADMIN_JWT_SECRET is a dev placeholder` (production) | Placeholder secrets production mein hain | `pnpm rotate-secrets` chalao ya strong secrets manually generate karo: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |

### Quick Diagnostic Commands

```bash
# Environment check karo
node -e "console.log('REPL_ID:', !!process.env.REPL_ID, 'DB:', !!process.env.DATABASE_URL)"

# Port check karo
lsof -i :5000 -i :3000 -i :3002 -i :3003

# .env.enc validate karo (bina kuch write kiye)
node scripts/create-env.mjs --dry-run

# Health check karo (server chal raha ho tou)
curl http://localhost:5000/api/health

# Services ka status
node scripts/dev-ctl.mjs status all
```
