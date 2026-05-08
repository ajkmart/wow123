# AJKMart Rider & Vendor Apps — Complete Documentation

> **Rider App:** React + Vite · Wouter · TanStack Query · Capacitor (iOS/Android) · Leaflet Maps · Socket.IO
> **Vendor App:** React + Vite · Wouter · TanStack Query · Capacitor (iOS/Android) · Leaflet Maps · Recharts
> **Both:** TypeScript · Tailwind CSS · Trilingual (EN/UR/Roman Urdu) · PWA-ready

---

## Table of Contents

| # | Section |
|---|---|
| A | [Rider App — Architecture Overview](#a-rider-app--architecture-overview) |
| B | [Rider App — Authentication & Registration](#b-rider-app--authentication--registration) |
| C | [Rider App — Every Screen Deep Dive](#c-rider-app--every-screen-deep-dive) |
| D | [Rider App — All API Calls Reference](#d-rider-app--all-api-calls-reference) |
| E | [Rider App — GPS System & Offline Queue](#e-rider-app--gps-system--offline-queue) |
| F | [Rider App — Offline Action Queue (IndexedDB)](#f-rider-app--offline-action-queue-indexeddb) |
| G | [Rider App — Van Driver Mode](#g-rider-app--van-driver-mode) |
| H | [Rider App — Push Notifications & FCM](#h-rider-app--push-notifications--fcm) |
| I | [Vendor App — Architecture Overview](#i-vendor-app--architecture-overview) |
| J | [Vendor App — Authentication & Registration](#j-vendor-app--authentication--registration) |
| K | [Vendor App — Every Screen Deep Dive](#k-vendor-app--every-screen-deep-dive) |
| L | [Vendor App — All API Calls Reference](#l-vendor-app--all-api-calls-reference) |
| M | [Vendor App — Offline Queue & Order Sync](#m-vendor-app--offline-queue--order-sync) |
| N | [Vendor App — Chat with WebRTC Voice Calls](#n-vendor-app--chat-with-webrtc-voice-calls) |
| O | [Shared Systems (Both Apps)](#o-shared-systems-both-apps) |
| P | [Gaps, Missing Features & Known Issues](#p-gaps-missing-features--known-issues) |
| Q | [How to Add a New Screen (Both Apps)](#q-how-to-add-a-new-screen-both-apps) |

---

---

# A. Rider App — Architecture Overview

```
artifacts/rider-app/
├── src/
│   ├── App.tsx                    ← Root: routes, auth guards, offline banners, FCM setup
│   ├── main.tsx                   ← Entry: Leaflet icon patch, Sentry, Capacitor
│   ├── pages/                     ← All screens
│   │   ├── Home.tsx               ← Dashboard + request feed (EAGER loaded)
│   │   ├── Active.tsx             ← Active trip/order tracker with map (EAGER)
│   │   ├── Login.tsx              ← Login screen (EAGER)
│   │   ├── Register.tsx           ← Registration wizard (EAGER)
│   │   ├── ForgotPassword.tsx     ← Password reset (EAGER)
│   │   ├── Profile.tsx            ← Profile + edit + bank + vehicle info (EAGER)
│   │   ├── History.tsx            ← Delivery/ride history (LAZY)
│   │   ├── Earnings.tsx           ← Earnings breakdown + daily goal (LAZY)
│   │   ├── Wallet.tsx             ← Wallet + withdraw + deposit + COD (LAZY)
│   │   ├── Notifications.tsx      ← Notification list (LAZY)
│   │   ├── SecuritySettings.tsx   ← Password + 2FA (LAZY)
│   │   ├── VanDriver.tsx          ← Van driver mode (LAZY)
│   │   └── Chat.tsx               ← Rider-to-customer/support chat (LAZY)
│   ├── components/
│   │   ├── dashboard/             ← Home screen sub-components
│   │   │   ├── OnlineToggleCard.tsx
│   │   │   ├── StatsGrid.tsx
│   │   │   ├── OrderRequestCard.tsx
│   │   │   ├── RideRequestCard.tsx
│   │   │   ├── SilenceControls.tsx
│   │   │   ├── ActiveTaskBanner.tsx
│   │   │   └── helpers.ts
│   │   ├── wallet/                ← Wallet modal sub-components
│   │   │   ├── WithdrawModal.tsx
│   │   │   ├── DepositModal.tsx
│   │   │   └── RemittanceModal.tsx
│   │   ├── ui/                    ← Shared UI primitives
│   │   ├── BottomNav.tsx          ← Bottom tab navigation
│   │   ├── AnnouncementBar.tsx    ← Dismissable platform announcement
│   │   ├── PopupEngine.tsx        ← Admin-triggered popup campaigns
│   │   ├── MaintenanceScreen.tsx  ← Full-screen maintenance mode
│   │   ├── PullToRefresh.tsx      ← Gesture pull-to-refresh
│   │   └── PwaInstallBanner.tsx   ← PWA install prompt
│   ├── lib/
│   │   ├── api.ts                 ← ALL API calls (single export `api` object)
│   │   ├── auth.tsx               ← AuthContext + token storage (Capacitor Preferences)
│   │   ├── socket.tsx             ← Socket.IO context
│   │   ├── gpsQueue.ts            ← GPS ping offline queue (IndexedDB)
│   │   ├── gps/
│   │   │   └── validation.ts      ← GPS spoof detection + geofence validation
│   │   ├── offline/
│   │   │   └── queueManager.ts    ← Offline action queue (IndexedDB, idempotent)
│   │   ├── useConfig.ts           ← Platform config hook
│   │   ├── useLanguage.ts         ← i18n hook
│   │   ├── rideUtils.ts           ← Ride event logging helpers
│   │   ├── notificationSound.ts   ← Audio unlock + silence mode
│   │   ├── logoutSequence.ts      ← Graceful logout (revoke + clear)
│   │   └── sentry.ts              ← Sentry init wrapper
│   └── hooks/
│       ├── useVersionCheck.ts     ← Auto-reload on new deploy
│       └── useOTPBypass.ts        ← Dev OTP bypass shortcut
```

---

## Rider Bottom Navigation

| Tab | Path | Condition |
|---|---|---|
| Home | `/` | Always |
| Active | `/active` | Always |
| Earnings | `/earnings` | `modules.earnings = true` |
| History | `/history` | `modules.history = true` |
| Profile | `/profile` | Always |

---

## App Status Guards

Before routing to any screen, `App.tsx` checks:

| Status | What Renders |
|---|---|
| `approvalStatus === "pending"` | "Account Under Review" blocking screen + contact support |
| `approvalStatus === "rejected"` | "Account Rejected" screen with rejection reason |
| `config.platform.appStatus === "maintenance"` | `MaintenanceScreen` |
| `config.platform.appStatus === "limited"` | Orange banner strip (non-blocking) |
| `user.roles.includes("van_driver")` | Full-screen `VanDriver` mode (bypasses standard routing) |

---

---

# B. Rider App — Authentication & Registration

---

## B1 — Token Storage

| Token | Storage | Notes |
|---|---|---|
| Access Token | `@capacitor/preferences` (native) / `localStorage` fallback (web) | In-memory cached as `_inMemoryAccessToken` |
| Refresh Token | `sessionStorage` (web) / NOT stored natively — HttpOnly cookie | Legacy migration: moves from `localStorage` to Preferences on first boot |

**Key:** `ajkmart_rider_token` (access), `ajkmart_rider_refresh_token` (refresh)

**Migration:** `tokenStoreReady` Promise — awaited by `AuthProvider` before reading token, preventing "no session" flash on restart.

---

## B2 — Rider Auth Methods

| Method | API Call |
|---|---|
| Phone OTP | `POST /auth/send-otp` → `POST /auth/verify-otp` (role: "rider") |
| Email OTP | `POST /auth/send-email-otp` → `POST /auth/verify-email-otp` |
| Username + Password | `POST /auth/login` (role: "rider") |
| Google OAuth | `POST /auth/social/google` (role: "rider") |
| Facebook OAuth | `POST /auth/social/facebook` |
| Magic Link | `POST /auth/magic-link/send` → `POST /auth/magic-link/verify` |
| 2FA TOTP | `GET /auth/2fa/setup` → `POST /auth/2fa/verify-setup` → `POST /auth/2fa/verify` |

Available methods are controlled by `PlatformConfig.auth.*` toggles (per-role).

---

## B3 — Rider Registration Flow

```
/register
  ├── Step 1: Phone verification (OTP) — OR Email registration path
  ├── Step 2: Basic info (name, CNIC)
  ├── Step 3: Vehicle info (type, plate, reg number, driving license)
  ├── Step 4: Document uploads (CNIC photo, license photo, vehicle reg photo)
  │     └── Via ImageUploader → POST /uploads/register (multipart FormData)
  └── Step 5: Submit
        ├── POST /auth/register (phone path)
        └── POST /auth/email-register (email path)
              ↓
        approvalStatus = "pending" → blocking screen shown
```

**Vehicle types:** `bike` / `car` / `rickshaw` / `bicycle` / `on_foot` / `van`

---

## B4 — Silent Token Refresh

```
On login → decode JWT exp claim (UTC-safe, UTF-8 decoder)
         → scheduleProactiveRefresh(token)
         → setTimeout(refreshAccessToken, exp - now - 60s)

refreshAccessToken():
  POST /auth/refresh
    ├── "refreshed" → new token in Preferences → reschedule
    ├── "auth_failed" → logout() → redirect to /
    └── "transient" → retry once after 10s, then logout

refreshFailCountRef: tracks consecutive failures
→ After 3 failures: dispatch custom event → show "Connection issue" toast
```

---

## B5 — 2FA (TOTP) Setup

Available from `/settings/security`:
1. `GET /auth/2fa/setup` → returns `{ secret, qrCodeDataUrl }`
2. Show QR code to scan with authenticator app
3. `POST /auth/2fa/verify-setup` → `{ code }` — confirm setup
4. From now on, login requires `POST /auth/2fa/verify` after credentials

Disable: `POST /auth/2fa/disable` → `{ code }`
Recovery: `POST /auth/2fa/recovery` → `{ recoveryCode }`

---

---

# C. Rider App — Every Screen Deep Dive

---

## C1 — Home Screen (`/`)

**The rider's main work screen.** Shows incoming delivery and ride requests in real-time.

```
Home Screen
  ├── AnnouncementBar (platform message)
  ├── LiveClock (real-time seconds display)
  ├── OnlineToggleCard
  │     ├── Toggle ON/OFF → PATCH /rider/online
  │     ├── When offline: "OfflineConfirmDialog" before going offline
  │     └── isRestricted flag → shows warning instead of toggle
  ├── StatsGrid (today: earnings, deliveries, rating, online hours)
  ├── SilenceControls
  │     ├── Silence mode: mutes audio alerts for X minutes
  │     ├── Modes: "30 min" / "1 hour" / "Until I turn off"
  │     └── Audio unlock: required on iOS before any sound plays
  ├── FixedBanners (penalty warnings, COD debt alerts)
  ├── InlineWarnings (high cancellation rate, geofence violations)
  ├── ActiveTaskBanner (if active order/ride → tap → /active)
  ├── RequestListHeader (count of available requests)
  ├── [Request Feed — from GET /rider/requests every poll interval]
  │     ├── OrderRequestCard (order delivery request)
  │     │     ├── Order type icon (food/mart/pharmacy/parcel)
  │     │     ├── Pickup address + distance (haversine from rider position)
  │     │     ├── Drop address
  │     │     ├── Estimated earnings
  │     │     ├── Payment method (COD / wallet)
  │     │     ├── Accept button → POST /rider/orders/:id/accept (or offline queue)
  │     │     └── Dismiss button → addDismissed (90s TTL in IndexedDB)
  │     └── RideRequestCard (ride hailing request)
  │           ├── Pickup + drop location
  │           ├── Estimated fare + distance
  │           ├── Counter-offer option → POST /rider/rides/:id/counter
  │           ├── Accept → POST /rider/rides/:id/accept
  │           └── Ignore → POST /rider/rides/:id/ignore
  └── Pull-to-refresh
```

**Request polling:** Interval adapts to network quality. Dismissed requests are stored in IndexedDB with 90-second TTL — same request won't reappear mid-trip.

**Sound alerts:**
- New request → `playRequestSound()` (Web Audio API oscillator)
- Audio locked on iOS until first user gesture → `unlockAudio()` on tap
- Silence mode suppresses all sounds for configured duration

**Goal modal:** Rider can set a personal daily earnings goal. Shown as progress ring on stats grid. Overrides admin default goal from platform config.

---

## C2 — Active Screen (`/active`)

**The active trip tracker.** Full Leaflet map with live routing.

```
Active Screen
  ├── Map (Leaflet) — tile provider from GET /maps/config?app=rider
  │     ├── Providers: OSM (default) / Mapbox / Google / LocationIQ
  │     ├── Pickup marker (green teardrop)
  │     ├── Drop marker (red teardrop)
  │     ├── Rider marker (blue pulsing dot)
  │     ├── Route polyline (OSRM routing)
  │     └── AutoFitMap: auto-fits bounds to all markers
  ├── Trip header card
  │     ├── Customer name + phone (tap to call)
  │     ├── Order type + items summary
  │     ├── Payment method + fare
  │     └── Distance remaining
  ├── Status action button (context-aware):
  │     ├── "Arrived at Pickup" → PATCH /rider/orders/:id/status {status: "arrived_at_pickup"}
  │     ├── "Picked Up" → PATCH with proof photo upload option
  │     ├── "Out for Delivery" → PATCH
  │     ├── "Delivered" → PATCH + camera photo proof (optional)
  │     └── For rides: "Arrived" / "Trip Started" / "Trip Completed"
  ├── OTP verification (ride pickup — requires customer OTP)
  │     └── POST /rider/rides/:id/verify-otp
  ├── GPS ping (every 5–10 seconds depending on network tier)
  │     ├── PATCH /rider/location (live)
  │     └── Falls back to GPS queue (IndexedDB) if offline
  ├── MapErrorBoundary (catches Leaflet crashes gracefully)
  ├── Cancel trip dialog
  └── SOS button (if features.sos enabled)
```

**Map tile config:** `GET /maps/config?app=rider` — returns `{ provider, token }`. Supports Mapbox, Google Maps, LocationIQ, OSM. Map switches tile URL at runtime without reload.

**GPS Validation (in `gps/validation.ts`):**
- Max speed check (default 200 km/h — configurable via `gps_max_speed_kmh` setting)
- Mock provider detection (`mockProvider` flag in location payload)
- Geofence polygon check (polygon from `config.geofence.polygon`)
- Suspicious pings flagged and logged

---

## C3 — Profile Screen (`/profile`)

```
Profile Screen
  ├── Header: Avatar + name + phone + account status
  ├── Stats summary: deliveries today / total / earnings / rating
  ├── Edit sections (accordion expand/collapse):
  │     ├── Personal Info (name, email, CNIC, city, address, emergency contact)
  │     ├── Vehicle Info (type, plate, registration number, driving license)
  │     └── Bank Info (bank name, account number, account title)
  ├── Document upload section
  │     ├── CNIC photo → POST /uploads (FormData)
  │     ├── License photo → POST /uploads
  │     └── Vehicle registration photo → POST /uploads
  ├── Two-factor status → /settings/security
  ├── Language selector (en / ur / roman)
  ├── App version display
  ├── Help links (phone, email, Instagram, Facebook)
  └── Logout button → executeLogoutSequence()
```

**Edit payload:** `PATCH /rider/profile` — fields: name, email, cnic, city, address, emergencyContact, vehicleType, vehiclePlate, vehicleRegNo, drivingLicense, bankName, bankAccount, bankAccountTitle.

---

## C4 — Earnings Screen (`/earnings`)

```
Earnings Screen
  ├── Period selector: Today / This Week / This Month
  ├── Daily goal progress ring
  │     ├── Admin goal (from platform config rider.dailyGoal)
  │     ├── Personal override (stored on rider profile, null = use admin)
  │     └── Edit goal modal → PATCH /rider/profile {dailyGoal}
  ├── Period summary:
  │     ├── Total earnings
  │     ├── Total deliveries
  │     └── Avg earnings per delivery
  ├── Breakdown by service type (accordion):
  │     ├── Food: earnings + count
  │     ├── Parcel: earnings + count
  │     └── Rides: earnings + count
  ├── Performance stats:
  │     ├── Lifetime total earnings
  │     ├── Lifetime deliveries
  │     └── Rating (star label: Excellent ≥4.8 / Very Good ≥4.5 / Good ≥4.0 / Needs Work)
  └── Cancel/ignore stats link → GET /rider/cancel-stats + GET /rider/ignore-stats
```

**API:** `GET /rider/earnings` — returns `{ today, week, month, dailyGoal, breakdown }`.

**Platform config keys used:**
- `config.rider.keepPct` — rider's share of commission
- `config.rider.dailyGoal` — admin default daily goal
- `config.finance.riderEarningPct` — fallback keep percentage

---

## C5 — History Screen (`/history`)

```
History Screen
  ├── Filter period: Today / This Week / All
  ├── Filter kind: All / Order / Ride
  ├── Infinite scroll (InfiniteQuery, page size 50)
  │     ├── Each item shows: type icon, address, earnings, status badge, date
  │     └── Expand → full detail (items, distances, payment)
  ├── Pull-to-refresh
  └── "Load more" button when hasNextPage
```

**API:** `GET /rider/history?limit=50&offset=N` — returns `{ history: HistoryItem[], hasMore }`.

---

## C6 — Wallet Screen (`/wallet`)

```
Wallet Screen
  ├── Balance card
  │     ├── Available balance
  │     ├── Pending balance (COD not yet remitted)
  │     └── Min balance requirement notice
  ├── Quick action buttons:
  │     ├── Withdraw → WithdrawModal
  │     ├── Deposit → DepositModal
  │     └── COD Remittance → RemittanceModal
  ├── Earnings chart (mini bar chart — last 7 days)
  ├── Transaction list (infinite scroll, grouped by date)
  │     ├── today / yesterday / this week / month labels
  │     ├── Transaction types: credit / bonus / loyalty / cashback /
  │     │   platform_fee / deposit / cod_remittance / cash_collection / withdraw
  │     └── Each shows: icon, label badge, amount (+/-), timestamp
  └── Deposit history tab
```

### WithdrawModal (3 steps)
```
Step 1 — Form: amount + bank + account number + account name + note
Step 2 — Confirm: review details
Step 3 — Done: "Request submitted — admin will process within X days"
API: POST /rider/wallet/withdraw
```

### DepositModal
```
Step 1 — Enter amount
Step 2 — Choose method (JazzCash / EasyPaisa / Bank Transfer)
Step 3 — Upload receipt photo (camera or gallery)
Step 4 — Done — pending admin approval
API: POST /rider/wallet/deposit
```

### RemittanceModal (COD remittance)
```
Shows: Total COD collected, amount owed to platform
Submit → POST /rider/cod/remit
API: GET /rider/cod-summary (total collected vs remitted)
```

---

## C7 — Notifications Screen (`/notifications`)

```
Notifications Screen
  ├── Notification list (GET /rider/notifications)
  │     ├── Each: title, body, type icon, timestamp
  │     └── Tap → mark as read + navigate (if has action)
  ├── Mark all read → PATCH /rider/notifications/read-all
  └── Pull-to-refresh
```

---

## C8 — Security Settings (`/settings/security` or `/security`)

```
Security Settings
  ├── Password Change section
  │     ├── Current password + New password + Confirm
  │     ├── Password strength indicator (Weak/Fair/Good/Strong)
  │     └── POST /auth/set-password
  └── Two-Factor Authentication (TOTP) section
        ├── If disabled: Show enable button
        │     ├── GET /auth/2fa/setup → QR code + secret
        │     └── POST /auth/2fa/verify-setup → confirm setup
        └── If enabled: Show disable button
              └── POST /auth/2fa/disable
```

Uses `TwoFactorSetup` and `TwoFactorVerify` from `@workspace/auth-utils`.

---

---

# D. Rider App — All API Calls Reference

> Base URL: `VITE_API_BASE_URL` (rider-specific env var)

---

## Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/send-otp` | Send OTP to phone |
| POST | `/auth/verify-otp` | Verify OTP (role: "rider") |
| POST | `/auth/send-email-otp` | Send email OTP |
| POST | `/auth/verify-email-otp` | Verify email OTP |
| POST | `/auth/login` | Username + password login (role: "rider") |
| POST | `/auth/register` | Phone registration |
| POST | `/auth/email-register` | Email registration |
| POST | `/auth/logout` | Logout + token revoke |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/forgot-password` | Send reset email/SMS |
| POST | `/auth/reset-password` | Apply reset |
| POST | `/auth/social/google` | Google OAuth (role: "rider") |
| POST | `/auth/social/facebook` | Facebook OAuth |
| POST | `/auth/magic-link/send` | Send magic link |
| POST | `/auth/magic-link/verify` | Verify magic link |
| POST | `/auth/set-password` | Change own password |
| POST | `/auth/check-available` | Check phone/email/username availability |
| GET  | `/auth/2fa/setup` | Get TOTP QR code |
| POST | `/auth/2fa/verify-setup` | Confirm TOTP setup |
| POST | `/auth/2fa/verify` | Verify TOTP during login |
| POST | `/auth/2fa/recovery` | Use recovery code |
| POST | `/auth/2fa/disable` | Disable TOTP |

---

## Rider Profile & Status

| Method | Path | Description |
|---|---|---|
| GET  | `/rider/me` | Get own profile + stats |
| PATCH| `/rider/online` | Toggle online/offline |
| PATCH| `/rider/profile` | Update profile fields |
| GET  | `/rider/cancel-stats` | Cancellation rate stats |
| GET  | `/rider/ignore-stats` | Ignore rate stats |
| GET  | `/rider/penalty-history` | Penalty records |
| GET  | `/rider/reviews` | My received reviews |

---

## Requests & Active Trips

| Method | Path | Description |
|---|---|---|
| GET  | `/rider/requests` | Available delivery + ride requests |
| GET  | `/rider/active` | Currently active order/ride |
| POST | `/rider/orders/:id/accept` | Accept order |
| POST | `/rider/orders/:id/reject` | Reject order (with reason) |
| PATCH| `/rider/orders/:id/status` | Update order status (+ proof photo) |
| POST | `/rider/rides/:id/accept` | Accept ride |
| PATCH| `/rider/rides/:id/status` | Update ride status (+ GPS coords) |
| POST | `/rider/rides/:id/verify-otp` | Verify customer OTP at pickup |
| POST | `/rider/rides/:id/counter` | Counter-offer with custom fare |
| POST | `/rider/rides/:id/reject-offer` | Reject platform fare offer |
| POST | `/rider/rides/:id/ignore` | Ignore ride request (dismisses from feed) |

---

## GPS & Location

| Method | Path | Description |
|---|---|---|
| PATCH| `/rider/location` | Live GPS ping (single) |
| POST | `/rider/location/batch` | Batch GPS pings (offline drain) |
| GET  | `/maps/config?app=rider` | Map tile provider + API token |

---

## Earnings & History

| Method | Path | Description |
|---|---|---|
| GET  | `/rider/earnings` | Earnings breakdown (today/week/month/dailyGoal) |
| GET  | `/rider/history` | Delivery + ride history (paginated) |

---

## Wallet & COD

| Method | Path | Description |
|---|---|---|
| GET  | `/rider/wallet/transactions` | Transaction list (paginated) |
| GET  | `/rider/wallet/min-balance` | Minimum balance requirement |
| POST | `/rider/wallet/withdraw` | Submit withdrawal request |
| POST | `/rider/wallet/deposit` | Submit deposit with receipt |
| GET  | `/rider/wallet/deposits` | My deposit requests |
| GET  | `/rider/cod-summary` | COD collected vs remitted |
| POST | `/rider/cod/remit` | Remit COD cash to platform |

---

## Notifications

| Method | Path | Description |
|---|---|---|
| GET  | `/rider/notifications` | Notification list |
| PATCH| `/rider/notifications/read-all` | Mark all as read |
| PATCH| `/rider/notifications/:id/read` | Mark one as read |

---

## Uploads

| Method | Path | Description |
|---|---|---|
| POST | `/uploads` | General image upload (JSON base64) |
| POST | `/uploads/proof` | Delivery proof photo (FormData) |
| POST | `/uploads/register` | Registration documents (FormData) |

---

## Settings & Platform

| Method | Path | Description |
|---|---|---|
| GET  | `/settings` | Platform config for rider |
| GET  | `/platform/config` | Full platform config (features, pricing) |

---

---

# E. Rider App — GPS System & Offline Queue

---

## E1 — GPS Ping Flow

```
Every 5–10 seconds (when active trip):
  1. Get browser/Capacitor GPS position
  2. validateGpsPing(ping, lastValidPing):
       ├── Speed check: haversine(prev, curr) / timeDelta → km/h
       │     → If > gps_max_speed_kmh: flag as suspicious
       ├── Mock provider check: if mockProvider=true → flag
       └── Geofence check: if polygon set → point-in-polygon test
  3. enqueue(ping) → IndexedDB GPS queue
  4. drainGpsQueue():
       ├── If online: PATCH /rider/location (single) or POST /rider/location/batch
       └── If offline: stays in IndexedDB until drain handler called
```

---

## E2 — GPS Queue Storage (IndexedDB)

**Database:** `ajkmart_gps_queue`
**Stores:** `pings` (GPS queue) + `dismissed` (dismissed request IDs)

| Key | Config | Default |
|---|---|---|
| GPS queue max | `config.network.riderGpsQueueMax` | Configurable |
| Dismissed request TTL | `config.network.riderDismissedRequestTtlSec` | 90 seconds |

Dismissed requests:
- Stored with `expiresAt = Date.now() + TTL`
- `sweepAndLoadDismissed()` called on Home mount — loads valid dismissed IDs into memory
- Requests past `expiresAt` automatically removed (so expired requests reappear in feed)

---

## E3 — GPS Validation Module (`gps/validation.ts`)

```typescript
validateGpsPing(ping, lastPing):
  → Returns: { valid, suspicious, reason }

Checks:
  1. Speed between pings (haversine + time delta)
  2. mockProvider flag (spoof detection)
  3. Geofence polygon (if configured from admin)
```

Suspicious pings are still stored and sent, but flagged. Backend `securityRoutes` logs these for the admin security dashboard GPS tab.

---

---

# F. Rider App — Offline Action Queue (IndexedDB)

---

## F1 — Queue Architecture

**Database:** `ajkmart_action_queue`
**Store:** `actions`

When an action fails due to network:
1. `enqueueAction(type, entityId, payload)` → stored in IndexedDB with UUID
2. `X-Idempotency-Key: action.id` header prevents duplicate execution
3. On reconnect: `syncQueue()` drains queue in order
4. Failed items stay in queue for next retry

---

## F2 — Supported Queued Actions

| Action Type | Trigger | API Call on Drain |
|---|---|---|
| `accept_order` | Accept while offline | `POST /rider/orders/:id/accept` |
| `accept_ride` | Accept ride while offline | `POST /rider/rides/:id/accept` |
| `update_order` | Status update while offline | `PATCH /rider/orders/:id/status` |
| `update_ride` | Ride status + GPS while offline | `PATCH /rider/rides/:id/status` |
| `complete_trip` | Van trip completion while offline | `PATCH /van/driver/schedules/:id/date/:date/complete` |

---

## F3 — Idempotency

Every action has a stable UUID generated at enqueue time.
```
X-Idempotency-Key: "550e8400-e29b-41d4-a716-446655440000"
```
Backend uses this key to de-duplicate replayed actions — accepting the same order twice via a retried offline queue does NOT create two acceptances.

---

---

# G. Rider App — Van Driver Mode

If `user.roles.includes("van_driver")`:
- Standard rider routing is bypassed
- `VanDriver` component renders full-screen (no bottom nav)

```
VanDriver Screen
  ├── Today's Schedules (GET /van/driver/today)
  │     ├── Route name + from → to
  │     ├── Departure time + return time
  │     ├── Van code
  │     ├── Booked seat count / total seats
  │     └── Trip status (not_started / in_progress / completed)
  ├── Select schedule → see Passenger Manifest
  │     ├── GET /van/driver/schedules/:id/date/:date/passengers
  │     ├── Passenger list: name, phone, seat numbers, seat tier, fare, payment
  │     ├── Seat tier badges: Window / Aisle / Economy
  │     ├── "Boarded" toggle per passenger → PATCH /van/driver/bookings/:id/board
  │     └── Passengers with boardedAt timestamp shown as checked in
  ├── Trip Controls:
  │     ├── "Start Trip" → POST /van/driver/schedules/:id/date/:date/start-trip
  │     ├── "Complete Trip" → PATCH /van/driver/schedules/:id/date/:date/complete
  │     │     └── Falls back to offline queue if network fails
  │     └── "Send Location" → PATCH /van/driver/schedules/:id/date/:date/location
  └── Driver Metrics card
        ├── Trips today + earnings today + passengers today
        ├── Online hours today
        ├── Trips this month + earnings this month
        └── Cancellations + no-shows (last 30 days)
```

**Real-time location:** Sends GPS every ~30 seconds while trip is `in_progress`.

---

---

# H. Rider App — Push Notifications & FCM

---

## H1 — Native (Capacitor)

```
registerPush(onForeground, onNotificationTap):
  ├── Uses @capacitor/push-notifications
  ├── On native: registers FCM token → POST /push/register
  ├── Permission: requestPermissions() (shown once per install)
  ├── Foreground events: onForeground(title, body) → in-app banner 5s
  └── Tap events: routeByData(data)
        ├── data.type === "wallet" → navigate("/wallet")
        ├── data.rideId / data.orderId → navigate("/active")
        └── data.type === "ride_request" / "order_request" → navigate("/active")
```

## H2 — Web (PWA)

```
On mount: check Notification.permission
  ├── "default" → request permission (asked only once per tab session)
  ├── "granted" → registerPush()
  └── "denied" → skip silently
```

## H3 — Cold Start Tap (Killed App)

```
pushNotificationActionPerformed fires at module load time
→ stashed in _pendingTapData

Once user session loaded (user is not null):
→ consumePendingNotificationTap() → drains stash
→ routeByData(data) → navigate to correct screen
```

Also checks `PushNotifications.getDeliveredNotifications()` for backgrounded-app case on Android.

---

---

# I. Vendor App — Architecture Overview

```
artifacts/vendor-app/
├── src/
│   ├── App.tsx                    ← Root: routes, maintenance grace period, FCM, SideNav
│   ├── main.tsx                   ← Entry: Leaflet icon patch, Sentry, Capacitor
│   ├── pages/                     ← All screens (ALL eager-loaded)
│   │   ├── Login.tsx              ← Login screen
│   │   ├── Dashboard.tsx          ← Main dashboard with stats + notifications
│   │   ├── Orders.tsx             ← Order management + Socket.IO + Leaflet map
│   │   ├── Products.tsx           ← Product catalogue management
│   │   ├── Store.tsx              ← Store settings + hours + location map
│   │   ├── Wallet.tsx             ← Wallet + withdrawal
│   │   ├── Analytics.tsx          ← Revenue charts (Recharts)
│   │   ├── Reviews.tsx            ← Customer reviews + reply
│   │   ├── Promos.tsx             ← Vendor promo code management
│   │   ├── Campaigns.tsx          ← Platform marketing campaigns
│   │   ├── Chat.tsx               ← Chat + WebRTC voice calls + quick replies
│   │   ├── Notifications.tsx      ← Notification list
│   │   └── Profile.tsx            ← Profile + bank + business info
│   ├── components/
│   │   ├── BottomNav.tsx          ← Mobile bottom navigation
│   │   ├── SideNav.tsx            ← Desktop sidebar navigation
│   │   ├── ImageUploader.tsx      ← Image upload with progress
│   │   ├── Header.tsx             ← Page header component
│   │   ├── PageHeader.tsx         ← Page title + subtitle
│   │   ├── AnnouncementBar.tsx    ← Platform announcement banner
│   │   ├── PopupEngine.tsx        ← Admin-triggered popups
│   │   ├── MaintenanceScreen.tsx  ← Full-screen maintenance
│   │   ├── PullToRefresh.tsx      ← Gesture pull-to-refresh
│   │   └── ui/                    ← Shared UI primitives
│   ├── hooks/
│   │   ├── useOfflineQueue.ts     ← localStorage-based order status queue
│   │   ├── useVersionCheck.ts     ← Auto-reload on new deploy
│   │   └── useOTPBypass.ts        ← Dev OTP bypass shortcut
│   └── lib/
│       ├── api.ts                 ← ALL API calls (single `api` export)
│       ├── auth.tsx               ← AuthContext + in-memory token storage
│       ├── useConfig.ts           ← Platform config hook + currency hook
│       ├── useLanguage.ts         ← i18n hook (with RTL support)
│       ├── ui.ts                  ← Shared CSS class constants + formatting
│       └── sentry.ts              ← Sentry init wrapper
```

---

## Vendor Navigation

### Desktop (≥768px)
```
SideNav (left sidebar, always visible):
  ├── Dashboard  /
  ├── Orders     /orders
  ├── Products   /products
  ├── Store      /store
  ├── Wallet     /wallet
  ├── Analytics  /analytics
  ├── Reviews    /reviews
  ├── Promos     /promos
  ├── Campaigns  /campaigns
  └── Chat       /chat
```

### Mobile (< 768px)
```
BottomNav (fixed bottom):
  Home | Orders | Products | Chat | Profile
```

---

## App Status Guards (Vendor)

| Status | What Happens |
|---|---|
| `maintenance` with grace period | Countdown timer strip: "Full screen in MM:SS" |
| `maintenance` after 5-min grace | `MaintenanceScreen` blocks the UI |
| `limited` | Orange "Limited service" strip (non-blocking) |

**Grace period:** Vendor gets 5 minutes (`MAINTENANCE_GRACE_MS = 300_000`) to finish in-progress orders before maintenance screen blocks.

---

---

# J. Vendor App — Authentication & Registration

---

## J1 — Token Storage

**Access Token:** In-memory only (`_inMemoryAccessToken`) — NEVER written to localStorage.

**Refresh Token:** In-memory only (`_inMemoryRefreshToken`) — also delivered as HttpOnly cookie from server.

**Migration:** On first load, any tokens in localStorage are read into memory and immediately erased. Keys swept: `ajkmart_vendor_token`, `ajkmart_vendor_refresh_token`, and any `vendor_*` / `ajkmart_vendor*` localStorage keys from older bundles.

---

## J2 — Vendor Auth Methods

| Method | API Call |
|---|---|
| Phone OTP | `POST /auth/send-otp` → `POST /auth/verify-otp` |
| Email OTP | `POST /auth/send-email-otp` → `POST /auth/verify-email-otp` |
| Username + Password | `POST /auth/login` (role: "vendor") |
| Google OAuth | `POST /auth/social/google` (role: "vendor") |
| Facebook OAuth | `POST /auth/social/facebook` |
| Magic Link | `POST /auth/magic-link/send` → `POST /auth/magic-link/verify` |

---

## J3 — Vendor Registration

```
POST /auth/vendor-register
Body: {
  phone / email, name, password,
  storeName, storeCategory, businessType,
  city, address, cnic,
  bankName, bankAccount, bankAccountTitle
}

→ On success: login() → redirect to /
→ approvalStatus controls access (pending vendors see blocking screen)
```

---

## J4 — Silent Token Refresh

Same pattern as rider app:
- Decode JWT `exp` claim (UTF-8 safe decoder)
- Schedule refresh 60s before expiry
- On `auth_failed` → logout + redirect to /
- On `transient` → retry once, then logout

**Logout event:** `window.dispatchEvent(new CustomEvent("ajkmart:logout", { detail: { reason } }))` — allows multiple components to react to logout.

---

---

# K. Vendor App — Every Screen Deep Dive

---

## K1 — Dashboard (`/`)

```
Dashboard Screen
  ├── Stats card (GET /vendor/stats — refetchInterval: 30s)
  │     ├── Today: orders + revenue
  │     ├── Total: orders + revenue
  │     └── Commission display (1 - commissionPct = vendor keep %)
  ├── Quick Actions (Accept Orders / Open Chat / Manage Products)
  ├── Store status toggle (open/closed)
  │     └── PATCH /vendor/store { storeIsOpen }
  ├── Recent Notifications section (last 5, GET /vendor/notifications every 30s)
  │     ├── Unread count badge
  │     ├── Mark all read → PATCH /vendor/notifications/read-all
  │     └── "View all →" link to /notifications
  └── Pull-to-refresh
```

---

## K2 — Orders Screen (`/orders` and `/orders/:id`)

The most complex vendor screen. Full Socket.IO integration for real-time order updates.

```
Orders Screen
  ├── Tabs: New 🔔 / Active 🍳 / Delivered ✅ / Cancelled ❌ / All 📋
  ├── Search bar (client-side filter)
  ├── Sort: Newest / Oldest / Highest Value
  ├── Bulk select + Bulk Accept / Bulk Reject
  ├── Order cards:
  │     ├── Order type icon (food/mart/pharmacy/parcel)
  │     ├── Status badge (color-coded per STATUS_BADGE map)
  │     ├── Customer name + delivery distance (haversine from vendor GPS)
  │     ├── Items list (expand accordion)
  │     ├── Total + commission + vendor keep
  │     ├── Delivery fee (per type from platform config)
  │     ├── Auto-accept countdown timer (if orderRules.autoAcceptSec set)
  │     └── Action button (context-aware):
  │           ├── pending → "Accept Order" (confirm dialog) / "Reject"
  │           ├── confirmed → "Start Preparing"
  │           ├── preparing → "Mark Ready"
  │           └── ready → Rider assignment panel
  ├── Socket.IO real-time updates
  │     ├── socket.on("new_order") → plays oscillator sound + refetch
  │     ├── socket.on("order_status_changed") → refetch orders
  │     └── socket.on("location:update") → update rider position map
  ├── MiniMap (Leaflet) for ready orders showing:
  │     ├── Vendor location (pin from user.storeLat/storeLng)
  │     ├── Customer delivery location
  │     └── Active rider GPS position (from Socket.IO location updates)
  ├── Rider assignment panel (for ready orders):
  │     ├── GET /vendor/orders/:id/available-riders (with vendor lat/lng)
  │     ├── Auto-assign → POST /vendor/orders/:id/auto-assign
  │     └── Manual assign → POST /vendor/orders/:id/assign-rider
  └── Geolocation: vendor's lat/lng from:
        ├── Priority 1: user.storeLat / user.storeLng (backend-persisted)
        └── Priority 2: navigator.geolocation (browser fallback)
```

**Order status flow:**
```
pending → confirmed → preparing → ready → picked_up → out_for_delivery → delivered
                                       ↘ (rider assigned here)
```

**Auto-accept:** If `orderRules.autoAcceptSec` is configured, a countdown timer shows on pending orders — auto-accepts when it hits zero.

**Offline queue:** If `updateOrder` fails due to network loss, `enqueueStatusUpdate()` saves to localStorage. On reconnect, `flushQueue()` retries all queued updates.

---

## K3 — Products Screen (`/products`)

```
Products Screen
  ├── View toggle: List / Bulk Import
  ├── Search + category filter
  ├── Product list (GET /vendor/products):
  │     ├── Product card: image, name, price, stock badge, category, type
  │     ├── Low stock warning (threshold from config.vendor.lowStockThreshold)
  │     ├── Hidden toggle → PATCH /vendor/products/:id { isHidden }
  │     ├── Edit button → form overlay
  │     ├── Stock history accordion → GET /vendor/products/:id/stock-history
  │     │     Shows: delta (+/-), reason, stockAfter, orderId, timestamp
  │     └── Delete → DELETE /vendor/products/:id
  ├── Add Product form:
  │     ├── Fields: name, description, price, originalPrice, category, unit, stock, type
  │     ├── Type: mart / food / pharmacy / parcel
  │     ├── Image upload (ImageUploader → POST /uploads with progress)
  │     ├── Video URL (optional)
  │     ├── Tags (comma-separated)
  │     └── isHidden toggle
  ├── Bulk Import (CSV):
  │     ├── Papa.parse() → client-side CSV parse
  │     ├── POST /vendor/products/bulk (batch create)
  │     └── Template download (generated locally)
  └── Product count vs limit (config.vendor.maxItems)
```

---

## K4 — Store Screen (`/store`)

```
Store Screen
  ├── Store info editing:
  │     ├── Store name, description, announcement
  │     ├── Store category + business type
  │     ├── Min order value + delivery time estimate
  │     └── PATCH /vendor/store
  ├── Store hours (accordion per day):
  │     ├── Days: Monday → Sunday
  │     ├── Each: open time + close time + "Closed today" toggle
  │     └── PATCH /vendor/store { storeHours }
  ├── Store open/closed toggle (live — customers see this instantly)
  ├── Location picker (Leaflet map):
  │     ├── Default: platform default lat/lng from config
  │     ├── Drag marker to set location
  │     ├── Click on map to move marker
  │     ├── "Use my location" → navigator.geolocation
  │     ├── Tile provider: GET /api/maps/config?app=vendor
  │     └── PATCH /vendor/store { storeLat, storeLng }
  ├── Banner image upload (ImageUploader → POST /uploads/video for video)
  └── Quick replies management (used in Chat):
        ├── GET /vendor/profile/quick-replies
        └── PATCH /vendor/profile/quick-replies
```

---

## K5 — Wallet Screen (`/wallet`)

```
Wallet Screen
  ├── Balance card (GET /vendor/wallet/transactions)
  ├── Withdraw button → WithdrawModal
  │     ├── Steps: Form → Confirm → Done
  │     ├── Validation: amount >= minPayout, amount <= maxPayout, amount <= balance
  │     ├── Banks filtered by platform config (jazzcash/easypaisa toggles)
  │     └── POST /vendor/wallet/withdraw
  ├── Transaction list (grouped by date: Today / Yesterday / This Week / Month)
  │     └── Types: credit / debit / withdrawal / platform_fee / deposit / bonus
  └── Processing time: from config.wallet.withdrawalProcessingDays (e.g. "2 business days")
```

---

## K6 — Analytics Screen (`/analytics`)

```
Analytics Screen
  ├── Range presets: 7d / 30d / 90d / Custom date range
  ├── Granularity: Daily / Weekly / Monthly
  ├── API: GET /vendor/analytics?days=30 or ?from=...&to=...
  ├── Charts (Recharts):
  │     ├── Revenue AreaChart (time-series by granularity)
  │     ├── Orders BarChart (counts per period)
  │     ├── Status breakdown PieChart (order status distribution)
  │     └── Aggregation: client-side bucket by week/month from daily data
  └── Summary cards: total revenue, total orders, avg order value
```

---

## K7 — Reviews Screen (`/reviews`)

```
Reviews Screen
  ├── Filter: All stars / 5★ / 4★ / 3★ / 2★ / 1★
  ├── Sort: Newest / Oldest / Top Rated / Low Rated
  ├── Pagination
  ├── API: GET /vendor/reviews?page=1&stars=5&sort=newest
  ├── Star distribution bar chart
  ├── Average rating display
  ├── Review card:
  │     ├── Customer name (anonymized if moderated)
  │     ├── Star rating
  │     ├── Review text
  │     ├── Date
  │     ├── Moderation status badge (visible / pending_moderation / rejected)
  │     └── Vendor reply section:
  │           ├── No reply: textarea + POST /reviews/:id/vendor-reply
  │           ├── Has reply: edit → PUT /reviews/:id/vendor-reply
  │           └── Delete reply → DELETE /reviews/:id/vendor-reply
  └── Trend chart (Recharts AreaChart — rating trend over time)
```

---

## K8 — Promos Screen (`/promos`)

```
Promos Screen
  ├── Promo list (GET /vendor/promos → or GET /promos)
  ├── Create promo form:
  │     ├── Title, Code (auto-uppercased)
  │     ├── Discount type: percentage / fixed
  │     ├── Discount value
  │     ├── Min order (optional)
  │     ├── Max uses (optional)
  │     └── Expires at (optional date)
  ├── POST /vendor/promos
  ├── Toggle active/inactive → PATCH /vendor/promos/:id/toggle
  └── Delete → DELETE /vendor/promos/:id
```

---

## K9 — Campaigns Screen (`/campaigns`)

```
Campaigns Screen
  ├── Platform campaign list (GET /vendor/campaigns or /promotions/campaigns)
  ├── Campaign card:
  │     ├── Name + description
  │     ├── Theme emoji (flash⚡/festival🎉/seasonal🌿/clearance🏷️/etc.)
  │     ├── Gradient banner (colorFrom/colorTo)
  │     ├── Status badge (live/draft/ended/paused)
  │     ├── Date range + days remaining
  │     ├── Budget cap + max vendors
  │     └── Participation status:
  │           ├── Not joined → "Join Campaign" button
  │           │     POST /vendor/campaigns/:id/join
  │           └── Joined → status (pending/approved/rejected) + "Withdraw" button
  │                 PATCH /vendor/campaigns/:id/withdraw
  └── Pull-to-refresh
```

---

## K10 — Chat Screen (`/chat`)

The most feature-rich vendor screen. Socket.IO + WebRTC voice calls + quick replies.

```
Chat Screen
  ├── Conversation list (GET /communication)
  │     ├── Each: customer name, last message, unread count, timestamp
  │     └── Requests tab (pending chat requests)
  ├── Search other vendors/riders by AJK ID
  ├── Quick replies sidebar (templated message shortcuts):
  │     ├── Loaded from localStorage + GET /vendor/profile/quick-replies
  │     ├── Categories: General / Food / Pharmacy / Delivery
  │     └── Max 8 shortcuts, PATCH /vendor/profile/quick-replies
  ├── Chat room (on conversation select):
  │     ├── Message history (GET /communication/:id/messages)
  │     ├── Real-time messages (Socket.IO room join)
  │     ├── Text send (POST /communication/:id/messages)
  │     ├── Image send (POST /uploads → send URL as message)
  │     ├── Voice note send (MediaRecorder → POST /uploads/audio)
  │     ├── Message delivery status (sent / delivered / read)
  │     └── Long-press to copy message
  └── Voice Call (WebRTC):
        ├── Initiate call → socket.emit("call:initiate")
        ├── Incoming call banner → Accept / Decline
        ├── RTCPeerConnection setup (ICE candidates via Socket.IO)
        ├── Local audio track → getUserMedia({ audio: true })
        └── Call end → socket.emit("call:end") + RTCPeerConnection.close()
```

---

## K11 — Profile Screen (`/profile`)

```
Profile Screen
  ├── Edit profile (name, email, phone, city, address, CNIC, businessType)
  │     └── PATCH /vendor/profile
  ├── Bank info (bank name, account number, account title)
  ├── KYC status display
  ├── Language selector
  ├── Password change section
  └── Logout
```

---

---

# L. Vendor App — All API Calls Reference

> Base URL: `VITE_API_BASE_URL` (vendor-specific env var)

---

## Auth (same routes as rider, different role)

| Method | Path | Description |
|---|---|---|
| POST | `/auth/send-otp` | Send OTP |
| POST | `/auth/verify-otp` | Verify OTP (role: "vendor") |
| POST | `/auth/login` | Username/password login |
| POST | `/auth/vendor-register` | Vendor registration |
| POST | `/auth/logout` | Logout (X-App: vendor header) |
| POST | `/auth/refresh` | Refresh token |
| POST | `/auth/forgot-password` | Password reset |
| POST | `/auth/reset-password` | Apply reset |
| POST | `/auth/social/google` | Google OAuth |
| POST | `/auth/social/facebook` | Facebook OAuth |
| POST | `/auth/magic-link/send` | Send magic link |
| POST | `/auth/magic-link/verify` | Verify magic link |
| POST | `/auth/check-available` | Check phone/email/username |

---

## Vendor Profile & Store

| Method | Path | Description |
|---|---|---|
| GET  | `/vendor/me` | Get own profile + store + stats |
| PATCH| `/vendor/profile` | Update profile fields |
| GET  | `/vendor/store` | Get store settings + hours |
| PATCH| `/vendor/store` | Update store (name, hours, location, isOpen) |
| GET  | `/vendor/stats` | Today + all-time order/revenue counts |
| GET  | `/vendor/profile/quick-replies` | Chat quick reply templates |
| PATCH| `/vendor/profile/quick-replies` | Update quick replies |
| GET  | `/vendor/schedule` | Store schedule/hours |
| PUT  | `/vendor/schedule` | Replace full schedule |

---

## Products

| Method | Path | Description |
|---|---|---|
| GET  | `/vendor/products` | Product list (with search/filter params) |
| POST | `/vendor/products` | Create product |
| POST | `/vendor/products/bulk` | Bulk create (CSV import) |
| PATCH| `/vendor/products/:id` | Update product |
| DELETE | `/vendor/products/:id` | Delete product |
| GET  | `/vendor/products/:id/stock-history` | Stock change log |

---

## Orders

| Method | Path | Description |
|---|---|---|
| GET  | `/vendor/orders` | All orders (filter by status) |
| PATCH| `/vendor/orders/:id/status` | Update order status |
| GET  | `/vendor/orders/available-riders` | Riders near vendor (lat/lng params) |
| POST | `/vendor/orders/:id/assign-rider` | Manual rider assignment |
| POST | `/vendor/orders/:id/auto-assign` | Auto-assign nearest rider |

---

## Analytics

| Method | Path | Description |
|---|---|---|
| GET  | `/vendor/analytics?days=30` | Daily revenue + order data |
| GET  | `/vendor/analytics?from=...&to=...` | Custom date range analytics |

---

## Reviews

| Method | Path | Description |
|---|---|---|
| GET  | `/vendor/reviews` | Reviews with filters (page/stars/sort) |
| GET  | `/reviews/vendor/:id` | Public reviews (no auth) |
| POST | `/reviews/:id/vendor-reply` | Post reply to review |
| PUT  | `/reviews/:id/vendor-reply` | Update reply |
| DELETE | `/reviews/:id/vendor-reply` | Delete reply |

---

## Promotions

| Method | Path | Description |
|---|---|---|
| GET  | `/vendor/promos` | Vendor's promo codes |
| POST | `/vendor/promos` | Create promo code |
| PATCH| `/vendor/promos/:id` | Update promo |
| PATCH| `/vendor/promos/:id/toggle` | Toggle active/inactive |
| DELETE | `/vendor/promos/:id` | Delete promo |

---

## Wallet

| Method | Path | Description |
|---|---|---|
| GET  | `/vendor/wallet/transactions` | Transaction history |
| POST | `/vendor/wallet/withdraw` | Submit withdrawal request |

---

## Communication

| Method | Path | Description |
|---|---|---|
| GET  | `/communication` | Conversation list |
| GET  | `/communication/:id/messages` | Message history |
| POST | `/communication/:id/messages` | Send message |
| GET  | `/communication/requests` | Pending chat requests |

---

## Notifications

| Method | Path | Description |
|---|---|---|
| GET  | `/vendor/notifications` | Notification list |
| PATCH| `/vendor/notifications/read-all` | Mark all read |
| PATCH| `/vendor/notifications/:id/read` | Mark one read |

---

## Location & Delivery

| Method | Path | Description |
|---|---|---|
| GET  | `/locations/:userId` | Get user's last known location |
| POST | `/locations/update` | Update vendor's location (lat/lng/role) |
| GET  | `/vendor/delivery-access/status` | Delivery access pilot status |
| POST | `/vendor/delivery-access/request` | Request delivery access |

---

## Uploads

| Method | Path | Description |
|---|---|---|
| POST | `/uploads` | Image upload (JSON base64 or FormData with progress) |
| POST | `/uploads/video` | Video upload (progress tracking) |

---

## Maps

| Method | Path | Description |
|---|---|---|
| GET  | `/maps/config?app=vendor` | Map tile provider + token |

---

## Platform Settings

| Method | Path | Description |
|---|---|---|
| GET  | `/settings` | Platform config for vendor |
| PUT  | `/settings` | (reserved — not used in vendor currently) |

---

---

# M. Vendor App — Offline Queue & Order Sync

---

## M1 — Offline Queue (localStorage)

**Key:** `ajkmart_vendor_offline_queue`

Unlike the rider app (IndexedDB), the vendor offline queue uses **localStorage** with a simpler structure — vendor actions are less latency-sensitive.

```typescript
interface QueuedStatusUpdate {
  id: string;        // UUID
  orderId: string;
  status: string;
  queuedAt: number;  // Date.now() at enqueue time
}
```

---

## M2 — useOfflineQueue Hook

```
Exported from: hooks/useOfflineQueue.ts

Returns:
  isOnline: boolean           ← navigator.onLine + event listeners
  isSyncing: boolean          ← true while flush is running
  syncToast: string           ← "Syncing..." / "X items failed"
  enqueueStatusUpdate(orderId, status) → adds to localStorage queue
  flushQueue() → called on reconnect
```

**On reconnect event (`window.addEventListener("online")`)**:
```
flushQueue():
  Load queue from localStorage
  For each item:
    → api.updateOrder(item.orderId, item.status)
    → Success: remove from queue
    → Fail: keep in queue for next retry
  After flush: invalidate ["vendor-orders"] + ["vendor-stats"]
  Show "Syncing..." → "X items failed" toast
```

---

## M3 — Sound Alert (New Order)

When a foreground FCM notification arrives with `type === "new_order"` or `type === "order_status"`:

```javascript
Web Audio API:
  OscillatorNode (sine, 880 Hz)
  GainNode (0.3 → exponential ramp to 0.001 over 0.4s)
  Duration: 400ms
```

For `type === "order_cancelled"` → displays banner as "❌ Order Cancelled"
For `type === "payment_settlement"` → displays banner as "💰 Payment Settled"

---

---

# N. Vendor App — Chat with WebRTC Voice Calls

---

## N1 — Socket.IO Chat

```
On chat room open:
  socket.emit("join_room", conversationId)

Incoming message:
  socket.on("new_message") → append to message list + refetch

Send text message:
  socket.emit("send_message", { conversationId, content, messageType: "text" })
  → also POST /communication/:id/messages (REST fallback)

Delivery status:
  socket.on("message_delivered") → update deliveryStatus
  socket.on("message_read") → update to "read"
```

---

## N2 — WebRTC Voice Call Flow

```
CALL INITIATION (vendor initiates):
  1. getUserMedia({ audio: true }) → get local microphone stream
  2. new RTCPeerConnection(iceServers)
  3. Add local track
  4. createOffer() → setLocalDescription()
  5. socket.emit("call:initiate", { callId, targetId, sdp })

INCOMING CALL (vendor receives):
  1. socket.on("call:incoming") → show IncomingCallData banner
  2. Accept: getUserMedia() → RTCPeerConnection → createAnswer()
  3. socket.emit("call:answer", { callId, sdp })
  4. Decline: socket.emit("call:decline", { callId })

ICE CANDIDATE EXCHANGE:
  socket.on("call:ice-candidate") → connection.addIceCandidate()
  connection.onicecandidate → socket.emit("call:ice-candidate", candidate)

CALL END:
  socket.emit("call:end", { callId })
  RTCPeerConnection.close()
  Stop all local media tracks
```

---

## N3 — Quick Replies

Vendor can predefine up to 8 message templates, accessible while chatting:

**Suggested templates:**
- General: "Thank you for your order! 🙏", "Your order has been received ✅"
- Food: "Order is being prepared 🍳", "Ready for pickup 📦", "On its way! 🛵"
- Pharmacy: "Prescription received 💊", "One item is out of stock"
- Delivery: "Your rider is on the way 🛵", "Delivery attempted — please call"

Quick replies are stored both locally (`localStorage`) and server-side (`/vendor/profile/quick-replies`). Local copy syncs to server on every save.

---

---

# O. Shared Systems (Both Apps)

---

## O1 — Platform Config (`useConfig.ts`)

Both apps fetch `GET /platform/config` (or `/settings`) at startup and re-fetch periodically.

**Config sections used by both:**

| Section | Keys |
|---|---|
| `platform` | appName, appStatus, currencySymbol, vendorCommissionPct |
| `content` | announcement, maintenanceMsg, supportPhone |
| `auth` | loginMethods per role |
| `features` | mart, food, rides, wallet, etc. |
| `finance` | riderEarningPct, minWithdrawal, maxWithdrawal |
| `delivery` | mart, food, pharmacy, parcel (base delivery fees) |
| `orderRules` | autoAcceptSec, cancelWindowMin |
| `regional` | timezone, currencyCode |
| `network` | apiTimeoutMs, riderGpsQueueMax, riderDismissedRequestTtlSec |
| `geofence` | polygon (array of [lat,lng] pairs) |
| `integrations` | sentry, analytics, jazzcash, easypaisa |
| `vendor` | maxItems, lowStockThreshold |
| `rider` | keepPct, dailyGoal |
| `wallet` | withdrawalProcessingDays |

---

## O2 — i18n (Trilingual)

Both apps use `@workspace/i18n`:
- **en** — English
- **ur** — Urdu (Arabic script, RTL)
- **roman** — Roman Urdu (Latin script, LTR)

```typescript
const { language } = useLanguage();
const T = (key: TranslationKey) => tDual(key, language);
```

**RTL:** Vendor app `useLanguage()` sets `document.dir = "rtl"` and `document.lang = "ur"` when Urdu is selected.

---

## O3 — Version Check

Both apps use `useVersionCheck()` hook:
- Polls `GET /api/version` every N minutes
- If server returns a newer `buildHash` than the bundled one → show "New version available" banner
- "Update" button → `window.location.reload()`

---

## O4 — Error Boundary & Error Reporting

Both apps wrap critical screens in `ErrorBoundary`:
- Catches React render errors
- Shows friendly error screen with retry
- `initErrorReporter()` → sends to `POST /api/errors/report` (HMAC-signed)
- Also reports to Sentry if DSN is configured

---

## O5 — PWA Install Banner

Both apps show `PwaInstallBanner` when:
- Browser fires `beforeinstallprompt` event
- App is not already installed
- Banner dismissed state tracked in localStorage

---

## O6 — Popup Engine

Both apps include `PopupEngine` — shows admin-triggered promotional popups:
- Fetched from `GET /popups/active`
- Displayed as full-screen overlay on first visit or after configured delay
- Dismissed state tracked per popup ID in localStorage

---

## O7 — Announcement Bar

Both apps show `AnnouncementBar` at the top:
- Content from `config.content.announcement`
- Dismissable (dismissed state in localStorage per announcement text hash)
- Max height capped (`max-h-[80px]`) so long messages scroll internally

---

## O8 — Map Tile Config

Both apps call `GET /maps/config?app=rider` or `?app=vendor`:

| Provider | Tile URL Template |
|---|---|
| OSM (default) | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Mapbox | `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token={token}` |
| Google Maps | `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key={token}` |
| LocationIQ | `https://{s}.locationiq.com/v3/street/r/{z}/{x}/{y}.png?key={token}` |

Configured in admin Settings → Integrations → `google_maps_api_key` and map provider setting.

---

---

# P. Gaps, Missing Features & Known Issues

---

## P1 — Rider App Gaps

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | No in-app map for Van Driver location tracking | HIGH | VanDriver sends location but has no map to show customers |
| 2 | Proof photo not shown on order confirmation | MEDIUM | `proofPhoto` uploaded but not displayed back to rider in history |
| 3 | Audio unlock flow broken on some Android browsers | MEDIUM | `unlockAudio()` requires user gesture — some Android WebViews don't fire click on toggle |
| 4 | Counter-offer (bid) flow — no UI confirmation state | MEDIUM | `api.counterRide()` exists but no pending/accepted counter UI |
| 5 | `refreshUser()` calls not coordinated — may fire concurrently | MEDIUM | Home + Active screens both call `refreshUser()` on mount |
| 6 | Notification permission re-asked on every login in same tab | LOW | `_notifPermissionAsked` resets on logout (module-level flag works only per tab load) |
| 7 | COD remittance amount validation missing | MEDIUM | No client-side check that `remitAmount <= codCollected` |
| 8 | GPS validation speed threshold not dynamically loaded | LOW | `gps_max_speed_kmh` platform setting exists but validation uses hardcoded fallback |
| 9 | History page does not show ride details (only orders) | MEDIUM | HistoryItem.kind supports "ride" but expand view shows order fields |
| 10 | `getMyReviews()` API exists but no Reviews screen | LOW | `GET /rider/reviews` is fetched but no reviews page exists in the app |

---

## P2 — Vendor App Gaps

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | WebRTC voice call — no TURN server configured | HIGH | Calls may fail on restricted networks (corporate/mobile) without TURN relay |
| 2 | No offline capability for product management | HIGH | Product create/edit fails silently offline — no queue |
| 3 | Campaign join/withdraw endpoints not confirmed | MEDIUM | `POST /vendor/campaigns/:id/join` — endpoint may not exist in backend |
| 4 | Bulk CSV import — no progress indicator per row | MEDIUM | `POST /vendor/products/bulk` gives one success/fail for entire batch |
| 5 | Analytics page — no export (CSV/PDF) | MEDIUM | Charts are visual only — no data export |
| 6 | No store verification badge display | LOW | `user.isVerified` exists on auth model but not shown on any screen |
| 7 | `GET /vendor/delivery-access/status` polled but UI for "access pending" state missing | MEDIUM | DeliveryAccess status returned but vendor sees no actionable UI if status is "pending" |
| 8 | Voice note upload endpoint not confirmed | MEDIUM | Chat sends audio to `/uploads/audio` but this endpoint may not exist |
| 9 | Wallet — no deposit flow (vendor) | MEDIUM | Only withdrawal exists; no vendor top-up path |
| 10 | Chat read receipts not visually shown | LOW | deliveryStatus tracked in data model but no "read" tick UI |

---

## P3 — Shared Gaps (Both Apps)

| # | Issue | Severity |
|---|---|---|
| 1 | No automatic retry with exponential backoff for 5xx errors | MEDIUM |
| 2 | No biometric authentication (Capacitor Face ID / Fingerprint) | MEDIUM |
| 3 | Sentry integration depends on admin-configured DSN — no fallback source | LOW |
| 4 | `@capacitor/preferences` import fails gracefully but silently — no log | LOW |
| 5 | Version check — buildHash comparison uses string equality; minor version drift could cause reload loops | LOW |

---

---

# Q. How to Add a New Screen (Both Apps)

---

## Rider App — New Screen

### Step 1 — Create Page File
```bash
touch artifacts/rider-app/src/pages/MyScreen.tsx
```

### Step 2 — Write the Screen
```tsx
// artifacts/rider-app/src/pages/MyScreen.tsx
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PullToRefresh } from "../components/PullToRefresh";

export default function MyScreen() {
  const { user } = useAuth();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const currency = config.platform.currencySymbol ?? "Rs.";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-data"],
    queryFn: () => api.getMyData(),       // add to api.ts
  });

  return (
    <PullToRefresh onRefresh={refetch}>
      <div className="px-4 py-6">
        <h1 className="text-xl font-bold">{T("myScreenTitle")}</h1>
      </div>
    </PullToRefresh>
  );
}
```

### Step 3 — Add to api.ts
```typescript
// In artifacts/rider-app/src/lib/api.ts, inside the `api` export object:
getMyData: () => apiFetch("/rider/my-data"),
```

### Step 4 — Add Route in App.tsx
```tsx
// If eager (hot path):
import MyScreen from "./pages/MyScreen";

// If lazy (lower priority):
const MyScreen = lazy(() => import("./pages/MyScreen"));

// Inside the <Switch>:
{modules.myModule && <Route path="/my-screen" component={MyScreen} />}
```

### Step 5 — Add to Bottom Nav (optional)
```tsx
// In components/BottomNav.tsx — add a new nav item entry
```

### Step 6 — Add to Platform Config module guard (optional)
```typescript
// In lib/useConfig.ts, inside getRiderModules():
myModule: cfg.features?.myModule ?? false,
```

---

## Vendor App — New Screen

### Step 1 — Create Page File
```bash
touch artifacts/vendor-app/src/pages/MyPage.tsx
```

### Step 2 — Write the Screen
```tsx
// artifacts/vendor-app/src/pages/MyPage.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useCurrency, usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { CARD, fc, fd } from "../lib/ui";

export default function MyPage() {
  const { symbol } = useCurrency();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-vendor-data"],
    queryFn: () => api.getMyVendorData(),   // add to api.ts
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  return (
    <PullToRefresh onRefresh={refetch}>
      <PageHeader title={T("myPageTitle")} />
      <div className="px-4 pb-6 space-y-4">
        <div className={CARD + " p-4"}>
          {isLoading ? <div className="skeleton h-16 rounded-xl" /> : (
            <p>{JSON.stringify(data)}</p>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}
```

### Step 3 — Register Route in App.tsx
```tsx
import MyPage from "./pages/MyPage";

// Inside <Switch>:
<Route path="/my-page"><ErrorBoundary><MyPage /></ErrorBoundary></Route>
```

### Step 4 — Add to SideNav
```tsx
// In components/SideNav.tsx — add a nav item to the items array:
{ href: "/my-page", label: "My Page", icon: "📋" }
```

### Step 5 — Add to BottomNav (mobile — if needed)
```tsx
// In components/BottomNav.tsx — add to bottom nav tabs
```

### Step 6 — Add API Method
```typescript
// In lib/api.ts:
getMyVendorData: () => apiFetch("/vendor/my-data"),
```

---

*— End of AJKMart Rider & Vendor Apps Documentation —*

> Last updated: 2025 | Rider App: React + Vite + Capacitor | Vendor App: React + Vite + Capacitor
> Related: `ajkmart.md` (monorepo overview) · `ajkmart-customer-app.md` (customer app) · `ajkmart-admin-panel.md` (admin panel)
