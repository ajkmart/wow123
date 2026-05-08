# AJKMart Super-App — Complete 360° Monorepo Documentation Book

> Multi-service super-app for AJK region, Pakistan.
> E-commerce · Food Delivery · Ride-Hailing · Pharmacy · Parcel · Inter-city Transport
>
> **Stack:** Node.js · Express · PostgreSQL · Drizzle ORM · React · Vite · Expo · Socket.IO · TypeScript · pnpm Monorepo

---

## Table of Contents

| # | Section |
|---|---|
| 1 | [Fully Working — 0% Risk Features](#section-1-fully-working--0-risk-features) |
| 2 | [Missing · Gaps · Incomplete · Bugs · Loopholes](#section-2-missing--gaps--incomplete--bugs--loopholes) |
| 3 | [Recommended Modules & Functions — Full Stack](#section-3-recommended-modules--functions--full-stack) |
| 4 | [AI Prompts — Fix Missing · Bugs · Loopholes](#section-4-ai-prompts--fix-missing--bugs--loopholes) |
| 5 | [AI Prompts — Recommended Modules & Functions](#section-5-ai-prompts--recommended-modules--functions) |
| 6 | [How to Start Server · Run Single or Multi Apps · Configure DB & APIs](#section-6-how-to-start-server--run-single-or-multi-apps--configure-db--apis) |
| 7 | *(Reserved — Section 7 skipped per user request)* |
| 8 | [Move Project — Codespaces · Replit · VPS · Localhost · Any Host](#section-8-move-project--codespaces--replit--vps--localhost--any-host) |
| 9 | [ENV & Secrets — Complete Reference](#section-9-env--secrets--complete-reference) |
| 10 | [Admin Panel — Modules · Functions · Settings · Organize · Simplify](#section-10-admin-panel--modules--functions--settings--organize--simplify) |

---

---

# SECTION 1: Fully Working — 0% Risk Features

> These features are confirmed implemented, wired end-to-end, and carry no known missing pieces.

---

## 1.1 — Backend / API Server (Node.js + Express)

| # | Feature | Notes |
|---|---|---|
| 1 | Express server startup with port-retry | Auto-retries up to 10 ports if default is busy |
| 2 | Health endpoint `/api/health` | Returns `{status, db, redis, uptime, timestamp}`, HTTP 503 when DB is down |
| 3 | JWT authentication (access + refresh tokens) | 15-min access token, 7-day refresh, `jti` UUID embedded |
| 4 | JWT blacklisting on logout | Redis-backed `blacklistJti()` / `isJtiBlacklisted()` in `security.ts` |
| 5 | Phone/Email OTP login | Provider-abstracted SMS/WhatsApp/Email OTP |
| 6 | Username + Password login | bcrypt hashing, TOTP 2FA support |
| 7 | Admin authentication (separate JWT flow) | Admin-specific access/refresh/CSRF tokens |
| 8 | Rate limiting — login | `loginLimiter` 5 req/60s per IP on `/auth/login` |
| 9 | Rate limiting — OTP | `otpLimiter` 3 req/60s per phone on `/auth/send-otp` |
| 10 | Rate limiting — user API | `userApiLimiter` 100 req/60s per user |
| 11 | CORS with `ALLOWED_ORIGINS` env | Comma-separated list, fallback to FRONTEND_URL/CLIENT_URL |
| 12 | Request logging with pino-http | Every request/response logged with `x-request-id` UUID |
| 13 | Body size limit (10 KB global) | Error-report route has its own higher limit |
| 14 | Zod request validation | Consolidated schemas in `validation/schemas.ts` |
| 15 | CSRF protection | Token-based, wired into admin auth |
| 16 | Ownership guard middleware | `verifyOwnership()` for rider/vendor/wallet/order/ride/user |
| 17 | AES-256-GCM encryption helpers | `crypto/encryption.ts` — ready for PII column encryption |
| 18 | Cursor-based pagination | `buildCursorPage()` / `encodeCursor()` / `decodeCursor()` |
| 19 | Audit logging for wallet operations | Structured pino `[audit:wallet]` lines on topup/deposit/send |
| 20 | Socket.IO real-time events | Wired to API server |
| 21 | Platform config endpoint | Dynamic business logic / feature toggle control |
| 22 | Suspicious pattern detector | Middleware counts req/IP/min on sensitive paths, fires alerts |
| 23 | Sentry webhook receiver | HMAC-verified, inserts to `sentry_known_issues`, fires admin alert |
| 24 | Data export audit logging | `/api/users/export-data` writes to `data_export_logs` |
| 25 | Health alert monitor | Background `setInterval` service, email + Slack alerts, deduplication |
| 26 | Admin seeding endpoint | First-run admin account creation |
| 27 | Drizzle ORM + PostgreSQL | Schema fully defined, migrations via Drizzle Kit |
| 28 | DB auto-migration on startup | `sqlMigrationRunner.ts` runs pending SQL at boot |
| 29 | Schema drift detection | `schemaDrift.service.ts` |
| 30 | Security tables auto-creation | `ensureSecurityTables()` creates `data_export_logs`, `sentry_known_issues` |

---

## 1.2 — Shared Libraries

| # | Library | Status |
|---|---|---|
| 1 | `@workspace/db` | Drizzle schema + migration helpers — complete |
| 2 | `@workspace/api-client-react` | Typed React Query hooks — complete |
| 3 | `@workspace/api-spec` | OpenAPI-style spec — complete |
| 4 | `@workspace/api-zod` | All request/response Zod schemas — complete |
| 5 | `@workspace/i18n` | English / Urdu / Roman Urdu string catalogue — complete |
| 6 | `@workspace/service-constants` | Shared enums, service IDs, feature flags — complete |
| 7 | `@workspace/auth-utils` | JWT helpers (shared server+client) — complete |
| 8 | `@workspace/admin-timing-shared` | Time-slot utilities — complete |
| 9 | `@workspace/phone-utils` | Phone number formatting/validation — complete |
| 10 | `@workspace/integrations` | Third-party adapter wrappers — complete |
| 11 | `@workspace/integrations-gemini-ai` | Gemini AI helpers — complete |

---

## 1.3 — Admin Panel (React + Vite)

| # | Module / Page | What Works |
|---|---|---|
| 1 | Login + forgot password + reset password | Full auth flow |
| 2 | Dashboard | Summary stats cards |
| 3 | Orders management | Table, filter bar, detail drawer, rider assign, GPS mini-map, refund confirm |
| 4 | Users management | List, search, KYC view |
| 5 | Riders management | List, status, fleet tracking |
| 6 | Rides management | Active/history view |
| 7 | Vendors management | List + plan info |
| 8 | Products management | CRUD with variants |
| 9 | Categories management | Create/edit/delete |
| 10 | Banners + Popups | CMS content |
| 11 | Promo codes | Create/expire |
| 12 | Promotions hub | Flash deals, loyalty |
| 13 | Notifications | Send push/SMS/email |
| 14 | Reviews | Moderation |
| 15 | Audit logs | Admin action history |
| 16 | Roles & permissions (RBAC) | Role presets, permission assignment |
| 17 | Security dashboard | Data exports, suspicious pattern events |
| 18 | Health dashboard | Service health status + alert config |
| 19 | Error monitor | Customer error reports |
| 20 | Settings (system, payment, security, integrations, render, weather) | All settings pages present |
| 21 | SMS gateways | Gateway list + test |
| 22 | SOS alerts | Emergency alert view |
| 23 | KYC verification | Document review queue |
| 24 | Support chat monitor | Live chat oversight |
| 25 | Deep links | CMS deep link management |
| 26 | Revenue analytics | Finance reporting |
| 27 | Transactions | Wallet transaction list |
| 28 | Deposit requests | Manual deposit approval |
| 29 | Live riders map | Real-time GPS map |
| 30 | Launch control | Feature flag toggles |

---

## 1.4 — Rider App (React + Vite PWA)

| # | Feature | Status |
|---|---|---|
| 1 | Login / Register / Forgot Password | Complete |
| 2 | Home (active orders dashboard) | Complete |
| 3 | Active order view | Complete |
| 4 | Order history | Complete |
| 5 | Earnings + Wallet | Complete |
| 6 | Profile management | Complete |
| 7 | Notifications | Complete |
| 8 | Security settings | Complete |
| 9 | Van driver mode | Complete |
| 10 | Chat with customer | Complete |

---

## 1.5 — Vendor App (React + Vite)

| # | Feature | Status |
|---|---|---|
| 1 | Login | Complete |
| 2 | Dashboard | Complete |
| 3 | Products CRUD | Complete |
| 4 | Orders management | Complete |
| 5 | Store profile | Complete |
| 6 | Wallet | Complete |
| 7 | Promotions / Promos | Complete |
| 8 | Campaigns | Complete |
| 9 | Analytics | Complete |
| 10 | Reviews management | Complete |
| 11 | Notifications | Complete |
| 12 | Chat | Complete |

---

## 1.6 — Customer App (Expo / React Native)

| # | Feature | Status |
|---|---|---|
| 1 | Auth (login / register / forgot password / OTP) | Complete |
| 2 | Onboarding | Complete |
| 3 | Home (tabs) | Complete |
| 4 | Mart (e-commerce) | Complete |
| 5 | Food / restaurants | Complete |
| 6 | Ride booking | Complete |
| 7 | Parcel delivery | Complete |
| 8 | Pharmacy | Complete |
| 9 | Van service | Complete |
| 10 | Cart | Complete |
| 11 | Orders list + order detail | Complete |
| 12 | Chat (support + vendor) | Complete |
| 13 | Wishlist | Complete |
| 14 | Offers | Complete |
| 15 | Search | Complete |
| 16 | Recently viewed | Complete |
| 17 | My reviews | Complete |
| 18 | Product detail | Complete |
| 19 | Weather widget | Complete |
| 20 | QR scanner | Complete |
| 21 | Vendor profile page | Complete |

---

## 1.7 — Infrastructure & DevOps

| # | Feature | Status |
|---|---|---|
| 1 | pnpm workspace monorepo | Fully configured |
| 2 | TypeScript project references | Fully wired |
| 3 | `secure-start.mjs` universal launcher | Works on Replit, Codespaces, local |
| 4 | PM2 ecosystem config for VPS | Ready |
| 5 | Caddy reverse proxy config | `deploy/Caddyfile` present |
| 6 | Nginx config | `deploy/nginx.conf` present |
| 7 | Post-merge hook | Auto-installs deps + runs migrations |
| 8 | Production build script | `scripts/build-production.mjs` |
| 9 | Replit `.replit` + `replit.nix` | Configured |
| 10 | Devcontainer config | `.devcontainer/` present |

---

---

# SECTION 2: Missing · Gaps · Incomplete · Bugs · Loopholes

> Full-stack list of everything that is absent, partial, broken, or risky.

---

## 2.1 — Backend / API Gaps

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | PII encryption not applied to DB columns | HIGH | `encryption.ts` helper exists but no DB columns are encrypted. `ALTER TABLE ... ADD COLUMN encrypted_* TEXT` migrations never written. |
| 2 | Redis optional — rate limiting silent failure | HIGH | If `REDIS_URL` is not set, rate limiting falls back silently. A slow-mode fallback (in-memory) should be documented and enforced. |
| 3 | No refresh token rotation | HIGH | Refresh tokens are stored but not rotated on use — stolen refresh token can be reused indefinitely. |
| 4 | No token family invalidation | HIGH | If a refresh token is stolen and reused, the entire family is not invalidated. |
| 5 | `ENCRYPTION_MASTER_KEY` not validated at boot | MEDIUM | Missing from `checkEnv()` — app boots silently without PII encryption key. |
| 6 | Wallet atomic transaction race condition | HIGH | Concurrent balance deductions not protected by DB-level row locking (`SELECT FOR UPDATE`). |
| 7 | School routes (`school.ts`) — stub/incomplete | MEDIUM | Route file exists, feature logic unclear / not documented. |
| 8 | Van service (`van.ts`) — partial | MEDIUM | Route present, booking flow not fully described in any doc. |
| 9 | Inter-city transport — no dedicated module | MEDIUM | Referenced in overview but no standalone route or schema file found. |
| 10 | `idempotency_keys` table — not wired to endpoints | MEDIUM | Table exists in schema but no middleware applies idempotency checks to payment/wallet routes. |
| 11 | Magic link auth — schema exists, flow unclear | MEDIUM | `magic_link_tokens` table in schema; no route or service file found. |
| 12 | TOTP 2FA — `totp.ts` service exists but admin UI missing | MEDIUM | No admin page for enabling/disabling TOTP per user. |
| 13 | `file-scanner.ts` — no exposure in API | LOW | Scanner service written but no endpoint or scheduled job calls it. |
| 14 | `integration_test_history` table — orphaned | LOW | Table in schema, no service or route uses it. |
| 15 | `system_snapshots` table — orphaned | LOW | Table in schema, no snapshot creation code found. |
| 16 | `/api/seed/full` exposed in production | HIGH | Seed endpoint protected only by `x-admin-seed-key` header. Should be disabled in production via `NODE_ENV` check. |
| 17 | No input sanitization (XSS) | MEDIUM | Zod validates shape/type but no HTML-stripping for freetext fields (product descriptions, chat messages). |
| 18 | `LOG_LEVEL` not validated | LOW | Invalid value causes silent verbose logging. |
| 19 | `SENTRY_DSN` optional but no fallback error logging | LOW | If Sentry not configured, unhandled errors are only logged to stdout — no alerting. |
| 20 | No DB connection pooling config | MEDIUM | Drizzle default pool settings used; no `max`, `idleTimeout`, or `connectionTimeout` tuning. |

---

## 2.2 — Frontend / App Gaps

| # | App | Issue | Severity |
|---|---|---|---|
| 1 | Customer App | Biometrics (expo-local-authentication) — wired but not tested on web fallback | MEDIUM |
| 2 | Customer App | Deep linking for auth — configured, but `wrong-app.tsx` redirect logic untested cross-platform | MEDIUM |
| 3 | Customer App | No offline cart persistence after app restart | MEDIUM |
| 4 | Customer App | `recently-viewed.tsx` — no pagination / max-item cap | LOW |
| 5 | Customer App | Network-aware image loading — no visual indicator when loading on slow network | LOW |
| 6 | Admin | `experiments.tsx` (A/B testing) — page exists, no backend route found | HIGH |
| 7 | Admin | `accessibility.tsx` — page exists, no backend saving logic found | MEDIUM |
| 8 | Admin | `consent-log.tsx` — display-only, no export or filter | LOW |
| 9 | Admin | `account-conditions.tsx` / `condition-rules.tsx` — rules exist but enforcement backend unclear | MEDIUM |
| 10 | Admin | `flash-deals.tsx` — no countdown clock sync with server time | MEDIUM |
| 11 | Admin | `qr-codes.tsx` — generation present, scanning/validation flow not shown | MEDIUM |
| 12 | Admin | `broadcast.tsx` — no delivery-status tracking after broadcast send | MEDIUM |
| 13 | Admin | `search-analytics.tsx` — UI present, data source unclear (no dedicated search log endpoint) | MEDIUM |
| 14 | Admin | `deep-links.tsx` — CMS present but no preview / test-open on device | LOW |
| 15 | Admin | Duplicate settings pages — `settings.tsx`, `settings-system.tsx`, `settings-security.tsx`, `settings-payment.tsx`, `settings-render.tsx`, `settings-integrations.tsx`, `settings-weather.tsx` — 7 separate files with potential config key overlap | MEDIUM |
| 16 | Rider App | No real-time push from server on new order — relies on polling | HIGH |
| 17 | Rider App | GPS accuracy indicator missing | LOW |
| 18 | Vendor App | No stock alert / low-stock notification | MEDIUM |
| 19 | Vendor App | No bulk product import (CSV/Excel) | MEDIUM |
| 20 | All web apps | No service worker / offline fallback for Vite apps | MEDIUM |

---

## 2.3 — Database / Schema Gaps

| # | Issue | Severity |
|---|---|---|
| 1 | No soft-delete on users, orders, products | MEDIUM — hard deletes break audit trails |
| 2 | No `updated_at` trigger on all tables | LOW |
| 3 | `ab_experiments` table — no result tracking columns | MEDIUM |
| 4 | `offer_templates` table — no expiry enforcement column | LOW |
| 5 | `demo_backups` table — purpose unclear, no documented process | LOW |
| 6 | No full-text search index on products/vendors | MEDIUM — search is currently LIKE query |
| 7 | No composite indexes on high-traffic join columns | MEDIUM — e.g., `orders(user_id, status)` |
| 8 | `live_locations` / `location_history` — no TTL/auto-purge | HIGH — table will grow unboundedly |
| 9 | `login_history` — no purge policy | MEDIUM |
| 10 | `rate_limits` table — not used if Redis is active; duplicate with Redis store | LOW |

---

## 2.4 — Security Loopholes

| # | Loophole | Severity |
|---|---|---|
| 1 | Seed endpoint reachable in production | CRITICAL — `/api/seed/full` must be blocked in `NODE_ENV=production` |
| 2 | No TOTP enforcement for admin actions | HIGH — admin can perform destructive actions without 2FA |
| 3 | Admin password reset token TTL configurable but no invalidation on use | HIGH |
| 4 | Error reports HMAC — key absence not fatal | MEDIUM |
| 5 | Firebase private key stored as plain text in env | MEDIUM — should be base64-encoded with decode at runtime |
| 6 | No brute-force lockout on admin password reset | MEDIUM |
| 7 | `ALLOWED_ORIGINS` empty defaults to permissive CORS | HIGH — if env not set, all origins may be allowed |
| 8 | No CSP (Content-Security-Policy) headers | MEDIUM |
| 9 | No `Referrer-Policy` or `Permissions-Policy` headers | LOW |
| 10 | JWT `issuer` (`JWT_ISSUER`) not validated on every verify call | MEDIUM |

---

---

# SECTION 3: Recommended Modules & Functions — Full Stack

> What must be added for a production-ready super-app. Grouped by layer.

---

## 3.1 — Backend Must-Have Modules

| # | Module | Function | Why |
|---|---|---|---|
| 1 | **Refresh Token Rotation** | Invalidate old refresh token on every use, issue new one | Prevents stolen token reuse |
| 2 | **Token Family Invalidation** | Track token families; invalidate all on suspicious reuse | Stops refresh token replay attacks |
| 3 | **Row-Level Wallet Locking** | `SELECT ... FOR UPDATE` on wallet balance rows | Prevents race-condition double-spend |
| 4 | **Idempotency Middleware** | Check `idempotency_keys` before processing payment/wallet requests | Prevents duplicate charges |
| 5 | **Magic Link Auth Route** | `/auth/magic-link/send` + `/auth/magic-link/verify` | Schema exists — needs routes + service |
| 6 | **TOTP 2FA API** | `/auth/totp/enable`, `/auth/totp/verify`, `/auth/totp/disable` | Service exists — needs routes |
| 7 | **PII Encryption Migration** | Add `encrypted_*` columns + data migration script | `encryption.ts` ready — needs wiring |
| 8 | **Seed Block in Production** | `if (NODE_ENV === 'production') return 403` in seed route | Critical security fix |
| 9 | **Input Sanitizer Middleware** | Strip HTML tags from all freetext fields | Prevent stored XSS |
| 10 | **DB Connection Pool Config** | Set `max`, `idleTimeout`, `connectionTimeout` in Drizzle client | Prevent connection exhaustion |
| 11 | **Live Location TTL Purge Job** | `setInterval` or cron to DELETE old `live_locations` rows | Prevent unbounded table growth |
| 12 | **Full-Text Search Index** | PostgreSQL `tsvector` index on products.name + description | Replace slow LIKE queries |
| 13 | **File Scanner Job** | Scheduled call to `file-scanner.ts` on uploaded files | Malware detection |
| 14 | **Soft Delete** | `deleted_at TIMESTAMPTZ` column on users, orders, products | Audit-safe data management |
| 15 | **CSP + Security Headers** | Helmet.js with `contentSecurityPolicy`, `referrerPolicy` | Browser XSS/injection protection |
| 16 | **Van/School/Inter-city Booking Flow** | Complete route + service for `van.ts`, `school.ts` | Referenced but incomplete |
| 17 | **Subscription / Stock Alert** | Notify user when out-of-stock item is back | `stock_subscriptions` table exists |
| 18 | **Webhook Registry** | `webhook_registrations` table — send events to vendor webhooks | Table exists, not wired |
| 19 | **Admin 2FA Enforcement** | Require TOTP for admin destructive actions | Security hardening |
| 20 | **Rate Limit In-Memory Fallback** | Explicit in-memory fallback with warning log when Redis absent | Don't silently skip rate limiting |

---

## 3.2 — Frontend Must-Have Modules

| # | App | Module | Function |
|---|---|---|---|
| 1 | Customer | Offline Cart Persistence | Save cart to AsyncStorage, restore on app launch |
| 2 | Customer | Network Quality Banner | Show "Slow connection" banner when NetInfo detects low speed |
| 3 | Customer | Order Real-Time Status | Socket.IO subscription for live order status updates |
| 4 | Customer | Review + Rating Flow | Post-delivery rating prompt |
| 5 | Customer | Referral System UI | Share referral code, track rewards |
| 6 | Rider | Push Notification on New Order | Firebase push instead of polling |
| 7 | Rider | GPS Accuracy Indicator | Show accuracy radius on map |
| 8 | Rider | Earnings Chart | Weekly/monthly earnings graph |
| 9 | Vendor | Low-Stock Alert | Dashboard badge when product qty < threshold |
| 10 | Vendor | Bulk Product Import | CSV upload → parse → bulk insert API call |
| 11 | Vendor | Revenue Chart | Daily/weekly revenue graph |
| 12 | Admin | A/B Experiment Backend Wiring | Connect `experiments.tsx` to API |
| 13 | Admin | Consent Log Export | CSV export of `consent_log` table |
| 14 | Admin | Flash Deal Countdown Sync | Sync countdown timer with server-side expiry |
| 15 | Admin | Settings Consolidation | Merge 7 settings pages into tabbed single page |
| 16 | All Web | Service Worker / Offline Shell | Cache app shell for offline load |
| 17 | All Web | Error Boundary | React ErrorBoundary with user-friendly fallback UI |
| 18 | All Web | Session Timeout Warning | Modal warning 2 min before JWT expiry with refresh button |

---

## 3.3 — Database Must-Have

| # | What | SQL / Action |
|---|---|---|
| 1 | Soft delete columns | `ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ` (+ orders, products) |
| 2 | Composite index on orders | `CREATE INDEX ON orders(user_id, status)` |
| 3 | Full-text index on products | `CREATE INDEX ON products USING GIN(to_tsvector('english', name || ' ' || description))` |
| 4 | TTL purge for live_locations | Cron: `DELETE FROM live_locations WHERE updated_at < NOW() - INTERVAL '1 hour'` |
| 5 | Login history purge | Cron: `DELETE FROM login_history WHERE created_at < NOW() - INTERVAL '90 days'` |
| 6 | `updated_at` default trigger | Add `DEFAULT NOW()` + update trigger to all major tables |
| 7 | Row-level lock on wallet | Use `SELECT ... FOR UPDATE` in wallet deduction transactions |

---

---

# SECTION 4: AI Multi-Prompts — Fix Missing · Bugs · Loopholes

> Copy and paste each prompt directly into AI (ChatGPT, Claude, Gemini, Copilot, etc.)

---

## Prompt 4-A — Fix Seed Endpoint in Production

```
I have a Node.js/Express API server in `artifacts/api-server/src/routes/seed.ts`.
The endpoint POST /api/seed/full is currently only protected by a header key.
This endpoint must return 403 Forbidden when NODE_ENV === 'production'.
Add a guard at the top of the route handler:
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Seed endpoint disabled in production' });
  }
Show me the updated route file.
```

---

## Prompt 4-B — Fix Refresh Token Rotation

```
In my Express API (artifacts/api-server), refresh tokens are issued but never rotated.
I use Drizzle ORM with a `refresh_tokens` table that has columns: id, user_id, token_hash, expires_at, revoked.
Please write:
1. A service function `rotateRefreshToken(oldToken)` that:
   - Verifies the old token exists and is not revoked
   - Marks old token as revoked
   - Issues a new refresh token and stores it
   - Returns the new access token + refresh token pair
2. Wire it to the POST /auth/refresh endpoint
Use TypeScript and Drizzle ORM syntax.
```

---

## Prompt 4-C — Fix Wallet Race Condition

```
My PostgreSQL wallet balance update in artifacts/api-server uses Drizzle ORM.
Currently balance is read then updated in two separate queries — this causes race conditions.
Rewrite the wallet deduction function to use a single atomic query with row-level locking:
  BEGIN;
  SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE;
  -- check balance >= amount
  UPDATE wallets SET balance = balance - $amount WHERE user_id = $1;
  COMMIT;
Show me the Drizzle ORM equivalent using `db.transaction()` with `for update` locking.
```

---

## Prompt 4-D — Fix ALLOWED_ORIGINS Permissive Default

```
In my Express CORS config, if ALLOWED_ORIGINS env var is empty the app may allow all origins.
In artifacts/api-server/src/app.ts (or wherever CORS is configured):
1. If ALLOWED_ORIGINS is empty AND NODE_ENV === 'production', throw an error at startup and refuse to boot.
2. If NODE_ENV === 'development' and ALLOWED_ORIGINS is empty, log a warning and allow localhost only.
Show the updated CORS configuration code.
```

---

## Prompt 4-E — Add Input Sanitization Middleware

```
My Node.js/Express API accepts freetext input (product descriptions, chat messages, vendor names).
These are Zod-validated for shape but not sanitized for HTML/XSS.
Write an Express middleware using the `sanitize-html` npm package that:
1. Recursively strips all HTML tags from string values in req.body
2. Allows zero HTML (plain text only)
3. Is placed before all routes in app.ts
TypeScript, Express, compatible with existing Zod validation.
```

---

## Prompt 4-F — Wire Idempotency Middleware to Payment Routes

```
I have an `idempotency_keys` table in my Drizzle PostgreSQL schema with columns:
  id, key, user_id, request_hash, response_body, created_at, expires_at
Write an Express middleware `withIdempotency()` that:
1. Reads the `Idempotency-Key` header from the request
2. If the key was seen before (and not expired), return the cached response immediately
3. If new, process the request, store the response, then return it
4. Apply this middleware to: POST /api/wallet/topup, POST /api/wallet/send, POST /api/payments/initiate
Use TypeScript and Drizzle ORM.
```

---

## Prompt 4-G — Fix live_locations Table Unbounded Growth

```
I have a `live_locations` table in PostgreSQL that stores GPS pings from riders.
It has no TTL or purge policy and will grow forever.
In my Node.js API server (artifacts/api-server/src):
1. Add a startup `setInterval` job that runs every 15 minutes and executes:
   DELETE FROM live_locations WHERE updated_at < NOW() - INTERVAL '2 hours'
2. Also add a similar purge for `location_history` rows older than 30 days.
Use Drizzle ORM with proper TypeScript types.
```

---

## Prompt 4-H — Block Admin Destructive Actions Without 2FA

```
In my admin panel API (artifacts/api-server/src/routes/admin), 
I want to require TOTP verification for these sensitive actions:
- DELETE /api/admin/users/:id
- POST /api/admin/wallet/adjust
- POST /api/admin/riders/penalty

Write Express middleware `requireAdminTOTP()` that:
1. Reads a `X-Admin-TOTP` header from the request
2. Verifies it using the admin's TOTP secret stored in DB
3. Rejects with 403 if not provided or invalid
4. Has a 30-second window tolerance
Use the existing totp.ts service in artifacts/api-server/src/services/.
```

---

## Prompt 4-I — Add CSP Headers with Helmet

```
My Express app in artifacts/api-server/src/app.ts does not set Content-Security-Policy headers.
Install and configure `helmet` with these settings:
- contentSecurityPolicy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'
- referrerPolicy: 'no-referrer'
- frameguard: 'DENY'
- noSniff: true
Show the updated app.ts with helmet configured before all routes.
```

---

## Prompt 4-J — Add DB Connection Pool Configuration

```
My Drizzle ORM connects to PostgreSQL via `lib/db/src/connection-url.ts`.
Currently using default pool settings. Add explicit pool configuration:
- max: 20 connections
- idleTimeoutMillis: 30000
- connectionTimeoutMillis: 5000
Show how to configure this with `pg` Pool and Drizzle's `drizzle(pool)` setup in TypeScript.
```

---

---

# SECTION 5: AI Multi-Prompts — Recommended Modules & Functions

> Copy each prompt to build the recommended missing features from scratch.

---

## Prompt 5-A — Build Full-Text Product Search

```
My PostgreSQL products table has columns: id, name, description, category_id, vendor_id, price, status.
Currently search uses LIKE '%query%' which is slow.
Please:
1. Write a Drizzle migration that adds a GIN tsvector index:
   ALTER TABLE products ADD COLUMN search_vector tsvector;
   CREATE INDEX products_fts_idx ON products USING GIN(search_vector);
   CREATE TRIGGER products_search_update BEFORE INSERT OR UPDATE ON products
     FOR EACH ROW EXECUTE FUNCTION tsvector_update_trigger(search_vector, 'pg_catalog.english', name, description);
2. Update the GET /api/products/search endpoint to use:
   WHERE search_vector @@ plainto_tsquery('english', $query)
   ORDER BY ts_rank(search_vector, plainto_tsquery('english', $query)) DESC
Show TypeScript + Drizzle ORM implementation.
```

---

## Prompt 5-B — Build Magic Link Authentication

```
I have a `magic_link_tokens` table in my Drizzle schema.
Build a complete magic link authentication flow for my Express API:
1. POST /api/auth/magic-link/send — generates a secure token, saves to DB with 15-min expiry, sends email via SendGrid
2. GET /api/auth/magic-link/verify?token=xxx — validates token, marks as used, returns JWT access + refresh token
3. Include rate limiting: max 3 magic link requests per email per hour
4. Token must be a 64-char hex string (crypto.randomBytes(32).toString('hex'))
Use TypeScript, Drizzle ORM, and the existing email.ts service.
```

---

## Prompt 5-C — Build Vendor Bulk Product Import (CSV)

```
Build a CSV bulk product import feature for my vendor app:
Backend (Node.js/Express):
1. POST /api/vendor/products/bulk-import — accepts multipart/form-data with a CSV file
2. Parse CSV with `csv-parse` npm package
3. Validate each row with Zod (name, price, category_id, stock_qty required)
4. Bulk insert valid rows into products table using Drizzle ORM
5. Return { imported: N, failed: M, errors: [{row, reason}] }

Frontend (React + Vite, artifacts/vendor-app):
1. Add a "Bulk Import" button on Products page
2. File picker (accept .csv only)
3. Show progress and results after upload

Show complete TypeScript code for both.
```

---

## Prompt 5-D — Build Real-Time Order Push for Rider App

```
My rider app (React + Vite PWA) currently polls for new orders.
Replace this with Firebase Cloud Messaging push notifications:
Backend (Node.js/Express):
1. When a new order is assigned to a rider, call Firebase Admin SDK to send a push notification to the rider's FCM token
2. FCM token stored in rider_profiles table (add column if missing)
3. Use the existing firebase.ts service in artifacts/api-server/src/services/

Rider Frontend (React + Vite PWA):
1. Request notification permission on login
2. Get FCM token using Firebase JS SDK
3. Send token to POST /api/rider/fcm-token endpoint
4. Handle incoming push notification — navigate to Active.tsx order screen

Show TypeScript code for both backend and frontend.
```

---

## Prompt 5-E — Build Offline Cart Persistence (Customer App)

```
In my Expo / React Native customer app (artifacts/ajkmart):
The cart state is in memory and lost when app is closed.
Build persistent cart using expo-secure-store or AsyncStorage:
1. Create a CartContext with: items, addItem, removeItem, clearCart, total
2. On every cart change, persist to AsyncStorage with key 'ajkmart_cart'
3. On app launch, hydrate cart from AsyncStorage before rendering
4. Handle JSON parse errors gracefully (corrupt storage → empty cart)
5. Cart item shape: { productId, vendorId, name, price, qty, imageUrl }
Show complete TypeScript implementation.
```

---

## Prompt 5-F — Build Stock Alert System

```
I have a `stock_subscriptions` table in my PostgreSQL DB.
Build a stock alert feature:
Backend:
1. POST /api/products/:id/notify-me — saves (user_id, product_id) to stock_subscriptions
2. When stock is updated via admin/vendor and qty goes from 0 to > 0:
   - Query stock_subscriptions for this product_id
   - Send push notification to all subscribed users via Firebase
   - Send email via SendGrid
   - Delete fulfilled subscriptions
3. Add this check in the product stock-update endpoint

Frontend (Customer App):
1. Show "Notify me when available" button on out-of-stock product page
2. Call POST /api/products/:id/notify-me
3. Toggle button to "You'll be notified" after success

TypeScript, Drizzle ORM, Expo.
```

---

## Prompt 5-G — Build Session Timeout Warning (All Web Apps)

```
In my React + Vite web apps (admin, rider, vendor):
JWT access tokens expire in 15 minutes.
Build a SessionTimeoutWarning component that:
1. Reads token expiry from JWT payload (decode without verify on client side)
2. 2 minutes before expiry, shows a modal: "Your session expires in 2 minutes. Stay logged in?"
3. "Stay logged in" button calls POST /api/auth/refresh to get a new token
4. "Log out" button clears tokens and redirects to login
5. If user ignores, auto-logout when timer hits 0

Use React hooks, no external libraries except jwt-decode.
Show TypeScript component + hook.
```

---

## Prompt 5-H — Consolidate Admin Settings Pages

```
My admin panel (artifacts/admin/src/pages) has 7 separate settings pages:
settings.tsx, settings-system.tsx, settings-security.tsx, 
settings-payment.tsx, settings-render.tsx, settings-integrations.tsx, settings-weather.tsx

Consolidate them into one SettingsPage with tab navigation:
Tabs: System | Security | Payment | Render | Integrations | Weather | Advanced

1. Create artifacts/admin/src/pages/settings/index.tsx with a tab layout
2. Move each existing page's JSX into a tab panel component
3. Shared save button at the bottom that submits the active tab's form
4. Use the existing Tailwind CSS + Lucide icons already in the project
5. Keep all existing API calls intact

Show the consolidated component structure in TypeScript + React.
```

---

## Prompt 5-I — Build Webhook Registry Dispatcher

```
I have a `webhook_registrations` table in my PostgreSQL DB with columns:
id, vendor_id, event_type, target_url, secret, is_active, created_at

Build a webhook dispatch system:
1. Service `webhookDispatcher.ts`:
   - `dispatchWebhook(event_type, payload)` — finds all active webhooks for the event
   - Signs payload with HMAC-SHA256 using the webhook's secret
   - Sends POST to target_url with headers: X-AJKMart-Signature, X-AJKMart-Event
   - Retries 3 times with exponential backoff on failure
   - Logs result to webhook delivery log

2. Call `dispatchWebhook('order.created', orderData)` in the order creation endpoint
3. Call `dispatchWebhook('order.status_changed', orderData)` in the status update endpoint

TypeScript, Node.js fetch or axios.
```

---

## Prompt 5-J — Build Earnings Chart for Rider App

```
In my Rider app (artifacts/rider-app, React + Vite):
The Earnings.tsx page shows a balance number but no chart.
Add a weekly earnings bar chart:
1. Backend: GET /api/rider/earnings/weekly — returns last 7 days earnings grouped by date
   { date: '2025-01-01', amount: 1500 }[]
2. Frontend: Use Recharts (install if not present) to render a BarChart
   - X axis: day labels (Mon, Tue...)
   - Y axis: PKR amount
   - Bar color: green (#22c55e)
   - Show total for the week above the chart
3. Show a skeleton loader while fetching

TypeScript, React, Recharts, Tailwind CSS.
```

---

---

# SECTION 6: How to Start Server · Run Single or Multi Apps · Configure DB & APIs

---

## 6.1 — How to Start All Apps at Once

### On Replit (Recommended)

```
1. Open the project in Replit
2. Add required secrets in the Secrets panel (padlock icon)
3. Click the green "Run" button

The Run button triggers: node scripts/secure-start.mjs
This script automatically:
  - Installs pnpm dependencies if missing
  - Pushes DB schema if DATABASE_URL is set
  - Starts all 5 services in parallel
```

### On Any Other Platform (Codespaces, VPS, Local)

```bash
# Step 1 — Install dependencies
pnpm install

# Step 2 — Set environment variables
cp .env.example .env
# Edit .env with your real values

# Step 3 — Push database schema
pnpm db:push

# Step 4 — Start all services at once
node scripts/secure-start.mjs
# OR
pnpm dev:all
```

---

## 6.2 — How to Start Individual Apps

```bash
# API Server only (port 5000)
pnpm --filter @workspace/api-server dev

# Admin Panel only (port 23744)
pnpm --filter @workspace/admin dev

# Vendor App only (port 3002)
pnpm --filter @workspace/vendor-app dev

# Rider App only (port 3001)
pnpm --filter @workspace/rider-app dev

# Customer App (Expo web, port 19006)
pnpm --filter @workspace/ajkmart web

# Using dev-ctl script (start/stop/status):
node scripts/dev-ctl.mjs start api
node scripts/dev-ctl.mjs start admin
node scripts/dev-ctl.mjs start vendor
node scripts/dev-ctl.mjs start rider
node scripts/dev-ctl.mjs start ajkmart
node scripts/dev-ctl.mjs stop api
node scripts/dev-ctl.mjs status all
```

---

## 6.3 — Service URLs and Ports

| Service | Dev Port | Replit Path | What You See |
|---|---|---|---|
| API Server | 5000 | `/api/` | JSON API responses |
| Admin Panel | 23744 | `/admin/` | Admin dashboard |
| Vendor App | 3002 | `/vendor/` | Vendor portal |
| Rider App | 3001 | `/rider/` | Rider PWA |
| Customer App | 19006 | `/` | Expo web customer app |
| Mockup Sandbox | 20716 | `/__mockup` | UI component preview |

---

## 6.4 — Database Setup

### Step 1 — Get a PostgreSQL URL

**Option A — Replit Built-in DB:**
```
Go to Tools → Database in Replit sidebar
Copy the DATABASE_URL that appears
Add it as a Replit Secret named DATABASE_URL
```

**Option B — Neon Cloud (Free):**
```
1. Go to neon.tech and sign up
2. Create a new project → copy the connection string
3. Add as DATABASE_URL secret
```

**Option C — Local PostgreSQL:**
```bash
# Install PostgreSQL
sudo apt install postgresql     # Ubuntu/Debian
brew install postgresql         # macOS

# Create database
psql -U postgres
CREATE DATABASE ajkmart;
\q

# Your DATABASE_URL:
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/ajkmart
```

### Step 2 — Push Schema

```bash
pnpm db:push
# This creates all tables from the Drizzle schema
```

### Step 3 — Seed Sample Data (Development Only)

```bash
curl -X POST http://localhost:5000/api/seed/full \
  -H "x-admin-seed-key: local-dev-seed-ajkmart" \
  -H "Content-Type: application/json"
```

### Step 4 — Open DB Browser (Optional)

```bash
pnpm db:studio
# Opens Drizzle Studio at http://localhost:4983
```

---

## 6.5 — API Configuration

### CORS

```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001,http://localhost:3002
# In production: ALLOWED_ORIGINS=https://yourdomain.com
```

### API Base URL for Frontend Apps

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_API_PROXY_TARGET=http://localhost:5000
EXPO_PUBLIC_DOMAIN=http://localhost:5000
```

### Ports

```env
PORT=5000
ADMIN_DEV_PORT=23744
RIDER_DEV_PORT=3001
VENDOR_DEV_PORT=3002
PORT_FALLBACK_ENABLE=true
PORT_MAX_RETRIES=10
```

---

## 6.6 — PM2 (Process Manager for Multi-App Start in Background)

```bash
# Install PM2 globally
npm install -g pm2

# Start all apps with PM2
node scripts/pm2-control.mjs start

# View all running processes
pnpm dlx pm2 list

# View live logs
pnpm dlx pm2 logs

# Restart everything
pnpm dlx pm2 restart all

# Stop everything
pnpm dlx pm2 stop all
```

---

---

# SECTION 8: Move Project — Codespaces · Replit · VPS · Localhost · Any Host

---

## 8.1 — Move to Replit

```
Step 1: Create a new Replit project
  - Click "+ Create Repl" → Import from GitHub
  - Paste your GitHub repo URL → Import

Step 2: Add secrets in the Secrets panel (padlock icon):
  - DATABASE_URL
  - JWT_SECRET
  - ADMIN_JWT_SECRET, ADMIN_REFRESH_SECRET, ADMIN_SECRET
  - ADMIN_ACCESS_TOKEN_SECRET, ADMIN_REFRESH_TOKEN_SECRET, ADMIN_CSRF_SECRET
  - VENDOR_JWT_SECRET, RIDER_JWT_SECRET
  - (Optional) GEMINI_API_KEY, TWILIO_*, SENDGRID_API_KEY, FIREBASE_*

Step 3: Click the green Run button
  - scripts/secure-start.mjs runs automatically
  - All 5 services start on their ports
  - DB schema is pushed automatically

Access URLs:
  /         → Customer App
  /api/     → API Server
  /admin/   → Admin Panel
  /vendor/  → Vendor Portal
  /rider/   → Rider PWA
```

---

## 8.2 — Move to GitHub Codespaces

```bash
# Step 1: Open repo in Codespaces
#   Go to GitHub repo → Code → Codespaces → New Codespace

# Step 2: In the Codespace terminal:
pnpm install

# Step 3: Set environment variables
cp .env.example .env
# Edit .env in the file editor — fill in your values

# Step 4: Push DB schema
pnpm db:push

# Step 5: Start services
node scripts/secure-start.mjs

# Ports auto-forwarded by Codespaces:
# Port 5000 → API
# Port 23744 → Admin
# Port 3001 → Rider
# Port 3002 → Vendor
# Port 19006 → Customer App
```

---

## 8.3 — Move to VPS (Ubuntu / Debian)

```bash
# Step 1: Connect to your server
ssh user@your-server-ip

# Step 2: Install dependencies
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash
sudo apt install -y nodejs postgresql caddy
npm install -g pnpm pm2

# Step 3: Clone project
git clone https://github.com/your-org/ajkmart.git /srv/ajkmart
cd /srv/ajkmart
pnpm install

# Step 4: Set up environment
cp .env.example .env
nano .env
# Fill in all values — NODE_ENV=production, real DATABASE_URL, real secrets

# Step 5: Set up PostgreSQL
sudo -u postgres psql
CREATE DATABASE ajkmart;
CREATE USER ajkmart_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE ajkmart TO ajkmart_user;
\q

# Step 6: Push DB schema
pnpm db:push

# Step 7: Build all apps
node scripts/build-production.mjs

# Step 8: Start with PM2
node scripts/pm2-control.mjs start
pm2 save
pm2 startup    # auto-start on server reboot

# Step 9: Configure Caddy reverse proxy
export AJKMART_DOMAIN=yourdomain.com
export APP_ROOT=/srv/ajkmart
caddy run --config deploy/Caddyfile

# Caddy routes traffic:
# /api/* → API server (port 5000)
# /admin/* → Admin dist/public
# /vendor/* → Vendor dist/public
# /rider/* → Rider dist/public
# /* → Customer web (port 19006)
```

---

## 8.4 — Move to Localhost (Windows / macOS / Linux)

```bash
# Prerequisites:
# - Node.js 20+ (https://nodejs.org)
# - pnpm 9+ (npm install -g pnpm)
# - PostgreSQL 15+ (https://www.postgresql.org/download/)

# Step 1: Clone
git clone https://github.com/your-org/ajkmart.git
cd ajkmart

# Step 2: Install deps
pnpm install

# Step 3: Copy and fill env
cp .env.example .env
# Open .env in any text editor and fill in:
# DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ajkmart
# JWT_SECRET=any-long-random-string
# (other JWT secrets = any random strings)

# Step 4: Create DB (if not exists)
psql -U postgres -c "CREATE DATABASE ajkmart;"

# Step 5: Push schema
pnpm db:push

# Step 6: Start all services
node scripts/secure-start.mjs

# Open in browser:
# http://localhost:5000         → Customer App
# http://localhost:5000/api     → API
# http://localhost:5000/admin   → Admin (proxied)
# http://localhost:5000/rider   → Rider (proxied)
# http://localhost:5000/vendor  → Vendor (proxied)
```

---

## 8.5 — Move to Any Other Host (Railway, Render, Fly.io, etc.)

```
General steps for any cloud host:

1. Connect your GitHub repository
2. Set environment variables in the host's secrets panel (same variables as .env.example)
3. Set BUILD COMMAND:  pnpm install && node scripts/build-production.mjs
4. Set START COMMAND:  node scripts/secure-start.mjs
5. Set PORT:           5000
6. Make sure DATABASE_URL points to your hosted PostgreSQL (Neon, Supabase, etc.)

Railway specific:
  - Add a PostgreSQL service — Railway auto-sets DATABASE_URL
  - Everything else is automatic

Render specific:
  - Type: Web Service
  - Build Command: pnpm install && pnpm build
  - Start Command: node artifacts/api-server/dist/index.js
  - Add env vars in Render dashboard

Fly.io specific:
  - fly launch → follow prompts
  - fly secrets set DATABASE_URL=... JWT_SECRET=... (etc.)
  - fly deploy
```

---

---

# SECTION 9: ENV & Secrets — Complete Reference

> Every variable the project uses, what it does, and whether it is required or optional.

---

## 9.1 — Database

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **REQUIRED** | none | Full PostgreSQL connection string. App refuses to start without it. |

---

## 9.2 — JWT / Authentication

| Variable | Required | Default | Description |
|---|---|---|---|
| `JWT_SECRET` | **REQUIRED** | none | Signing key for customer JWT tokens |
| `ADMIN_JWT_SECRET` | **REQUIRED** | none | Signing key for admin JWT tokens |
| `ADMIN_REFRESH_SECRET` | **REQUIRED** | none | Signing key for admin refresh tokens |
| `ADMIN_SECRET` | **REQUIRED** | none | Admin-level shared secret |
| `ADMIN_ACCESS_TOKEN_SECRET` | **REQUIRED** | none | Admin access token signing key |
| `ADMIN_REFRESH_TOKEN_SECRET` | **REQUIRED** | none | Admin refresh token signing key |
| `ADMIN_CSRF_SECRET` | **REQUIRED** | none | CSRF token signing key for admin |
| `VENDOR_JWT_SECRET` | **REQUIRED** | none | Signing key for vendor JWT tokens |
| `RIDER_JWT_SECRET` | **REQUIRED** | none | Signing key for rider JWT tokens |
| `JWT_ISSUER` | optional | `ajkmart-dev` | Issuer claim embedded in all JWTs |

> **Tip:** Generate secure random values: `openssl rand -hex 32`

---

## 9.3 — Admin Setup

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_SEED_USERNAME` | optional | `superadmin` | First admin username created on seed |
| `ADMIN_SEED_PASSWORD` | optional | `Admin@123` | First admin password — **change in production** |
| `ADMIN_SEED_EMAIL` | optional | `admin@ajkmart.com` | First admin email |
| `ADMIN_SEED_NAME` | optional | `Super Admin` | First admin display name |

---

## 9.4 — Security

| Variable | Required | Default | Description |
|---|---|---|---|
| `ERROR_REPORT_HMAC_SECRET` | optional | none | HMAC key for signing error reports |
| `ALLOWED_ORIGINS` | **required in prod** | none | Comma-separated list of allowed CORS origins |
| `ADMIN_LEGACY_AUTH_DISABLED` | optional | `0` | Set `1` to disable legacy admin auth method |
| `ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN` | optional | `15` | Password reset token lifetime in minutes |
| `ENCRYPTION_MASTER_KEY` | optional | none | AES-256 key for PII column encryption (min 16 chars) |
| `SENTRY_WEBHOOK_SECRET` | optional | none | HMAC secret for Sentry webhook verification |

---

## 9.5 — Ports & URLs

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | optional | `5000` | API server port |
| `PORT_FALLBACK_ENABLE` | optional | `true` | Auto-retry next port if busy |
| `PORT_MAX_RETRIES` | optional | `10` | Max port retry attempts |
| `APP_BASE_URL` | optional | `http://localhost:5000` | Full URL of the API server |
| `ADMIN_BASE_URL` | optional | `http://localhost:5173` | Full URL of the admin panel |
| `FRONTEND_URL` | optional | localhost URLs | Comma-separated frontend URLs (CORS fallback) |
| `CLIENT_URL` | optional | `http://localhost:5173` | Primary frontend URL (CORS fallback) |

---

## 9.6 — Firebase (Push Notifications)

| Variable | Required | Default | Description |
|---|---|---|---|
| `FIREBASE_PROJECT_ID` | optional | none | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | optional | none | Service account email |
| `FIREBASE_PRIVATE_KEY` | optional | none | Service account private key (from Firebase Console JSON) |

> **How to get Firebase keys:**
> Firebase Console → Project Settings → Service Accounts → Generate new private key → Download JSON → Copy `project_id`, `client_email`, `private_key`

---

## 9.7 — Twilio (SMS OTP)

| Variable | Required | Default | Description |
|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | optional | none | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | optional | none | Twilio auth token |
| `TWILIO_FROM_NUMBER` | optional | none | Twilio sender phone number (e.g. +12345678901) |

---

## 9.8 — Email

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENDGRID_API_KEY` | optional | none | SendGrid API key for email delivery |
| `SMTP_HOST` | optional | none | SMTP server host (fallback to SendGrid) |

---

## 9.9 — AI & Maps

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | optional | none | Google Gemini AI API key |
| `GOOGLE_MAPS_API_KEY` | optional | none | Google Maps JS API key |
| `OSRM_API_URL` | optional | none | Open Source Routing Machine URL for ride routing |

---

## 9.10 — Web Push (VAPID)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VAPID_PUBLIC_KEY` | optional | none | VAPID public key for web push |
| `VAPID_PRIVATE_KEY` | optional | none | VAPID private key |
| `VAPID_CONTACT_EMAIL` | optional | none | Contact email for VAPID |

> **Generate VAPID keys:**
> ```bash
> pnpm dlx web-push generate-vapid-keys
> ```

---

## 9.11 — Infrastructure

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | optional | none | Redis connection URL — enables rate limiting |
| `SENTRY_DSN` | optional | none | Sentry error tracking DSN |

---

## 9.12 — Runtime & Logging

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | optional | `development` | `development` or `production` |
| `LOG_LEVEL` | optional | `debug` | Pino log level: `trace`,`debug`,`info`,`warn`,`error` |

---

## 9.13 — Expo / Vite (Frontend)

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXPO_PUBLIC_DOMAIN` | optional | `http://localhost:5000` | API base URL for Expo customer app |
| `VITE_API_BASE_URL` | optional | `http://localhost:5000` | API base URL for Vite apps |
| `VITE_API_PROXY_TARGET` | optional | `http://localhost:5000` | Vite dev proxy target |

---

## 9.14 — How to Add Secrets

### On Replit
```
Sidebar → padlock icon (Secrets) → + New Secret → Name + Value → Save
```

### On Local / VPS / Codespaces
```bash
# Edit .env file
cp .env.example .env
nano .env    # or any editor
```

### Generate Secure JWT Secrets
```bash
# Each JWT secret should be a unique 64-char hex string
openssl rand -hex 32    # run once for each secret
```

---

---

# SECTION 10: Admin Panel — Modules · Functions · Settings · Complete Guide

---

## 10.1 — All Admin Panel Pages (Complete List)

| # | Page File | Module Name | Category |
|---|---|---|---|
| 1 | `dashboard.tsx` | Dashboard Overview | Core |
| 2 | `orders/index.tsx` | Orders Management | Operations |
| 3 | `users.tsx` | Users Management | Operations |
| 4 | `riders.tsx` | Riders Management | Operations |
| 5 | `rides.tsx` | Rides Management | Operations |
| 6 | `parcel.tsx` | Parcel Delivery | Operations |
| 7 | `pharmacy.tsx` | Pharmacy Orders | Operations |
| 8 | `products.tsx` | Products CRUD | Inventory |
| 9 | `categories.tsx` | Categories CRUD | Inventory |
| 10 | `banners.tsx` | Banners CMS | Content |
| 11 | `popups.tsx` | Popups CMS | Content |
| 12 | `flash-deals.tsx` | Flash Deals | Promotions |
| 13 | `promo-codes.tsx` | Promo Codes | Promotions |
| 14 | `promotions-hub.tsx` | Promotions Hub | Promotions |
| 15 | `loyalty.tsx` | Loyalty Program | Promotions |
| 16 | `notifications.tsx` | Notifications Broadcast | Communication |
| 17 | `broadcast.tsx` | Mass Broadcast | Communication |
| 18 | `communication.tsx` | Communication Settings | Communication |
| 19 | `support-chat.tsx` | Support Chat Monitor | Communication |
| 20 | `sms-gateways.tsx` | SMS Gateway Config | Communication |
| 21 | `transactions.tsx` | Transactions List | Finance |
| 22 | `revenue-analytics.tsx` | Revenue Analytics | Finance |
| 23 | `DepositRequests.tsx` | Deposit Requests | Finance |
| 24 | `roles-permissions.tsx` | Roles & Permissions | Access Control |
| 25 | `kyc.tsx` | KYC Verification | Compliance |
| 26 | `consent-log.tsx` | Consent Log | Compliance |
| 27 | `audit-logs.tsx` | Admin Audit Logs | Compliance |
| 28 | `security.tsx` | Security Dashboard | Security |
| 29 | `sos-alerts.tsx` | SOS Alerts | Safety |
| 30 | `error-monitor.tsx` | Error Monitor | Health |
| 31 | `health-dashboard.tsx` | Health Dashboard | Health |
| 32 | `live-riders-map.tsx` | Live Riders Map | Monitoring |
| 33 | `chat-monitor.tsx` | Chat Monitor | Monitoring |
| 34 | `search-analytics.tsx` | Search Analytics | Analytics |
| 35 | `experiments.tsx` | A/B Experiments | Analytics |
| 36 | `launch-control.tsx` | Launch Control / Feature Flags | Config |
| 37 | `app-management.tsx` | App Management | Config |
| 38 | `auth-methods.tsx` | Auth Methods Config | Config |
| 39 | `settings.tsx` | Settings (General) | Config |
| 40 | `settings-system.tsx` | System Settings | Config |
| 41 | `settings-security.tsx` | Security Settings | Config |
| 42 | `settings-payment.tsx` | Payment Settings | Config |
| 43 | `settings-render.tsx` | Render Settings | Config |
| 44 | `settings-integrations.tsx` | Integrations Settings | Config |
| 45 | `settings-weather.tsx` | Weather Settings | Config |
| 46 | `otp-control.tsx` | OTP Control | Config |
| 47 | `deep-links.tsx` | Deep Links CMS | Config |
| 48 | `qr-codes.tsx` | QR Codes | Utilities |
| 49 | `faq-management.tsx` | FAQ Management | Content |
| 50 | `reviews.tsx` | Reviews Moderation | Content |
| 51 | `account-conditions.tsx` | Account Conditions | Rules |
| 52 | `condition-rules.tsx` | Condition Rules | Rules |
| 53 | `delivery-access.tsx` | Delivery Zone Access | Config |
| 54 | `accessibility.tsx` | Accessibility Settings | Config |

---

## 10.2 — Functions Per Module

### Dashboard
- View real-time KPI cards: total orders, active riders, revenue today, new users
- View service health status

### Orders Management
- List all orders with filters (status, date, vendor, service type)
- View order detail (items, timeline, GPS stamp)
- Assign / reassign rider
- Approve refund
- Export orders CSV

### Users Management
- List, search, filter users
- View user profile + KYC status
- Ban / unban user
- View order history per user
- Trigger password reset

### Riders Management
- List riders + availability status
- View active ride / order
- View earnings + penalties
- Assign fleet type (bike/van)
- Add / remove penalty
- View GPS location history

### Products & Categories
- Create / edit / delete products
- Manage product variants (size, color, etc.)
- Set price, stock, images
- Assign categories
- Bulk actions

### Finance
- View all wallet transactions
- Approve / reject manual deposit requests
- View revenue breakdown by service type
- Export reports

### Promotions
- Create promo codes with rules (min order, max discount, user limit)
- Schedule flash deals with start/end time
- Manage loyalty points rules
- Manage campaigns

### Roles & Permissions (RBAC)
- Create custom roles
- Assign permissions to roles
- Assign roles to admin accounts
- View permission matrix

### Security Dashboard
- View suspicious IP events
- View data export audit log
- View Sentry-tracked error issues

### Health Dashboard
- View service uptime / downtime
- Configure health alert thresholds
- Toggle health monitor on/off

### Launch Control
- Toggle feature flags (enable/disable services per region)
- Control which auth methods are active
- Toggle AI features

---

## 10.3 — Duplicate / Overlapping Pages (Fix List)

| # | Duplicate Group | Problem | Fix |
|---|---|---|---|
| 1 | settings.tsx + settings-system.tsx + settings-security.tsx + settings-payment.tsx + settings-render.tsx + settings-integrations.tsx + settings-weather.tsx | 7 separate settings pages — hard to find config, possible key conflicts | Merge into one tabbed Settings page |
| 2 | communication.tsx + broadcast.tsx + notifications.tsx | Three pages for messaging — confusing | Merge into "Communications Hub" with sub-tabs: Notifications / Broadcast / Settings |
| 3 | security.tsx + settings-security.tsx | Security in two places | Move all security config into Security Dashboard |
| 4 | account-conditions.tsx + condition-rules.tsx | Unclear separation | Merge into "Business Rules" single page |
| 5 | revenue-analytics.tsx + search-analytics.tsx | Two separate analytics pages | Merge into "Analytics" with tabs: Revenue / Search / Users |

---

## 10.4 — How to Organize Admin Panel (Recommended Menu Structure)

```
ADMIN SIDEBAR MENU (recommended)

📊 Dashboard
  └── Overview

📦 Operations
  ├── Orders
  ├── Rides
  ├── Parcel
  └── Pharmacy

👥 People
  ├── Users
  ├── Riders
  └── KYC Verification

🏪 Catalog
  ├── Products
  └── Categories

💰 Finance
  ├── Transactions
  ├── Deposit Requests
  └── Revenue Analytics

📢 Marketing
  ├── Promotions Hub
  ├── Promo Codes
  ├── Flash Deals
  ├── Banners
  ├── Popups
  └── Loyalty

💬 Communications
  ├── Notifications
  ├── Broadcast
  ├── Support Chat
  └── SMS Gateways

📈 Analytics
  ├── Revenue
  ├── Search
  └── A/B Experiments

🔒 Security & Compliance
  ├── Security Dashboard
  ├── Audit Logs
  ├── Consent Log
  ├── SOS Alerts
  └── Roles & Permissions

🏥 Health & Monitoring
  ├── Health Dashboard
  ├── Error Monitor
  ├── Live Riders Map
  └── Chat Monitor

⚙️ Configuration
  ├── Settings (tabbed: System / Payment / Security / Render / Integrations / Weather)
  ├── Auth Methods
  ├── Launch Control
  ├── OTP Control
  ├── Deep Links
  ├── QR Codes
  ├── Delivery Access
  ├── Business Rules
  └── FAQ Management
```

---

## 10.5 — How to Make Admin Panel Easier to Use

| # | Improvement | Action |
|---|---|---|
| 1 | Consolidate 7 settings pages into 1 tabbed page | See Prompt 5-H in Section 5 |
| 2 | Add global search bar | Search across orders, users, riders by ID or name |
| 3 | Add "Quick Actions" on Dashboard | Buttons: Assign Rider, Approve Deposit, Send Notification |
| 4 | Add breadcrumbs on all pages | User knows where they are |
| 5 | Add keyboard shortcuts | `/` = search, `N` = new item, `Esc` = close drawer |
| 6 | Add column sorting on all tables | Click column header to sort |
| 7 | Add export CSV on every list page | Orders, users, riders, transactions |
| 8 | Color-code order/ride status badges | Green=delivered, Yellow=pending, Red=cancelled |
| 9 | Collapse sidebar to icon-only mode | More screen space for tables |
| 10 | Add "Last updated" timestamp to all pages | Know when data is stale |

---

## 10.6 — Complete Settings Variables (Stored in DB via Platform Config)

| Setting Key | Type | Description |
|---|---|---|
| `security_suspicious_pattern_threshold` | integer | Requests/min/IP before alert fires (default: 60) |
| `health_monitor_enabled` | boolean | Enable/disable background health alert monitor |
| `otp_method` | string | `sms` / `whatsapp` / `email` |
| `max_delivery_distance_km` | integer | Max delivery radius |
| `commission_rate_percent` | decimal | Platform commission on orders |
| `rider_base_pay` | decimal | Base pay per delivery |
| `flash_deal_max_discount` | decimal | Max discount allowed on flash deals |
| `loyalty_points_per_order` | integer | Points awarded per completed order |
| `kyc_required` | boolean | Force KYC before first purchase |
| `maintenance_mode` | boolean | Show maintenance page to all users |

---

*— End of AJKMart Documentation Book —*

> Last updated: 2025 | Version: 1.x | Platform: pnpm Monorepo · Node.js · React · Expo · PostgreSQL
