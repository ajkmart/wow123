# AJKMart Admin Panel — Complete Documentation

> **Stack:** React 19 · Vite · Wouter (routing) · TanStack React Query · Tailwind CSS · Lucide Icons · TypeScript
> **Port (dev):** 23744 | **Prod path:** `/admin/`
> **Auth:** Separate JWT flow — `ADMIN_ACCESS_TOKEN_SECRET` / `ADMIN_REFRESH_TOKEN_SECRET` / `ADMIN_CSRF_SECRET`

---

## Table of Contents

| # | Section |
|---|---|
| A | [Architecture Overview](#a-architecture-overview) |
| B | [Authentication & Session Management](#b-authentication--session-management) |
| C | [RBAC — Roles & Permissions Complete Reference](#c-rbac--roles--permissions-complete-reference) |
| D | [All Routes — Complete List with Permissions](#d-all-routes--complete-list-with-permissions) |
| E | [Sidebar Navigation Groups](#e-sidebar-navigation-groups) |
| F | [Every Page — What It Does, API Calls, Key Functions](#f-every-page--what-it-does-api-calls-key-functions) |
| G | [Settings Page — All 10 Tabs & Every Setting Key](#g-settings-page--all-10-tabs--every-setting-key) |
| H | [All Admin API Endpoints (Backend Reference)](#h-all-admin-api-endpoints-backend-reference) |
| I | [All Admin React Hooks — use-admin.ts Reference](#i-all-admin-react-hooks--use-admints-reference) |
| J | [How to Add a New Admin Module (Step-by-Step)](#j-how-to-add-a-new-admin-module-step-by-step) |
| K | [Duplicate Pages & How to Consolidate](#k-duplicate-pages--how-to-consolidate) |
| L | [Mobile Layout & Command Palette](#l-mobile-layout--command-palette) |
| M | [Health Dashboard & Monitoring](#m-health-dashboard--monitoring) |
| N | [Security Dashboard — All Tabs](#n-security-dashboard--all-tabs) |
| O | [Gaps, Bugs & Missing Wiring](#o-gaps-bugs--missing-wiring) |

---

---

# A. Architecture Overview

```
artifacts/admin/
├── src/
│   ├── App.tsx                  ← Root: QueryClient, Auth, Router, all route definitions
│   ├── main.tsx                 ← Entry: Sentry init, analytics init, push registration
│   ├── pages/                   ← One file per admin page (67 pages)
│   │   ├── orders/              ← Orders sub-module (split into components)
│   │   │   ├── index.tsx        ← Main orders page
│   │   │   ├── OrdersTable.tsx
│   │   │   ├── OrderDetailDrawer.tsx
│   │   │   ├── OrdersFilterBar.tsx
│   │   │   ├── OrdersStatsCards.tsx
│   │   │   ├── OrdersMobileList.tsx
│   │   │   ├── RiderAssignPanel.tsx
│   │   │   ├── GpsMiniMap.tsx
│   │   │   ├── GpsStampCard.tsx
│   │   │   ├── RefundConfirmDialog.tsx
│   │   │   ├── DeliverConfirmDialog.tsx
│   │   │   ├── CancelConfirmDialog.tsx
│   │   │   ├── SortHeader.tsx
│   │   │   └── constants.ts
│   │   └── settings-*.tsx       ← Settings sub-sections (imported by settings.tsx)
│   ├── components/              ← Shared UI components
│   │   ├── layout/              ← AdminLayout, sidebar, header
│   │   ├── ui/                  ← shadcn/ui primitives
│   │   └── shared/              ← PageHeader, StatCard, FilterBar, ActionBar
│   ├── hooks/
│   │   ├── use-admin.ts         ← ALL admin data hooks (React Query)
│   │   └── usePermissions.ts    ← RBAC gating hook
│   └── lib/
│       ├── adminAuthContext.tsx  ← Admin auth state + token refresh
│       ├── navConfig.ts         ← Sidebar nav groups (single source of truth)
│       ├── api.ts               ← Base fetcher with auth headers
│       ├── platformConfig.ts    ← Load currency + timing settings at boot
│       └── adminTiming.ts       ← Debounce/poll interval config (DB-overridable)
```

---

## Routing Engine

The admin panel uses **Wouter** (lightweight React router). All routes are defined in `App.tsx`.

```
Base URL: set by VITE_ADMIN_BASE_URL or import.meta.env.BASE_URL
Default:  /admin/
```

---

## Code-Split Routes (Lazy Loaded)

These pages use `React.lazy()` to avoid loading heavy dependencies until needed:

| Page | Why Lazy |
|---|---|
| `LiveRidersMap` | `react-leaflet` + mapbox-gl (~1 MB JS) |
| `ErrorMonitor` | Long error/communication panels |
| `Communication` | Heavy messaging KPI dashboard |

---

---

# B. Authentication & Session Management

---

## B1 — Admin Login Flow

```
POST /api/admin/auth/login
  Body: { username, password, totp? }

  Response A — Normal login:
    { accessToken, refreshToken, user: AdminUser }
    → Store accessToken in memory (NOT localStorage)
    → Store refreshToken in sessionStorage
    → If user.usingDefaultCredentials → show FirstLoginCredentialsDialog

  Response B — TOTP required:
    { requireTotp: true, tempToken }
    → Show TOTP input step
    → POST /api/admin/auth/login with { totp, tempToken }
```

---

## B2 — Token Storage

| Token | Storage | Lifetime |
|---|---|---|
| Access Token | In-memory only (React state) | 15 minutes |
| Refresh Token | `sessionStorage` | 7 days |
| CSRF Token | Embedded in response header | Per session |

> **Security:** Access token is NEVER written to localStorage or cookies. Lost on page refresh → silent refresh from refreshToken.

---

## B3 — Silent Token Refresh

`adminAuthContext.tsx` schedules a refresh 60 seconds before expiry:

```
On login → decode JWT exp claim
         → setTimeout(refreshAccessToken, (exp - now - 60s))

refreshAccessToken():
  POST /api/admin/auth/refresh
    → new accessToken → update in-memory state → reschedule timer
```

If refresh fails (expired or revoked):
```
→ clearTokens()
→ redirect to /login
→ show "Session expired" toast
```

---

## B4 — Auto-Logout on 401

```
QueryClient.getQueryCache().subscribe(event)
  → if event.action.type === "error" && error.status === 401
  → if user is currently logged in (accessToken exists)
  → logout() → redirect to /login
```

This prevents pre-login query failures (expected 401s) from causing redirect loops.

---

## B5 — First-Login Credentials Dialog

When `user.usingDefaultCredentials === true`:
- Shows `FirstLoginCredentialsDialog` after login
- Admin can change their username and/or password
- "Skip for now" closes dialog for the session (not persisted)
- `changePassword()` → `POST /api/admin/auth/change-password`
- `updateOwnProfile()` → `PATCH /api/admin/profile`

---

## B6 — Password Reset Flow

```
1. Forgot Password: POST /api/admin/auth/forgot-password
   → Sends email with reset token (TTL: ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN env)

2. Reset Password: POST /api/admin/auth/reset-password
   → { token, newPassword }

3. Set New Password (force on first login): POST /api/admin/auth/change-password
   → { currentPassword, newPassword }
```

---

---

# C. RBAC — Roles & Permissions Complete Reference

---

## C1 — How RBAC Works

```
Backend:
  JWT access token embeds:  { sub, role, perms: string[], exp }
  Middleware: requirePermission("users.view") checks perms array
  Super admin role bypasses all checks

Frontend:
  usePermissions() decodes JWT from in-memory accessToken
  has("users.view") → true/false
  <PermissionGate perm="users.delete">…</PermissionGate>
  isSuper → bypasses all UI gating
```

---

## C2 — All Permission IDs (Complete Catalog)

### System Permissions

| Permission ID | Label | High Risk |
|---|---|---|
| `system.settings.view` | View platform settings | |
| `system.settings.edit` | Edit platform settings | |
| `system.secrets.manage` | Manage secrets / integrations | ⚠️ |
| `system.roles.manage` | Manage roles & permissions | |
| `system.audit.view` | View audit log | |
| `system.maintenance` | Toggle maintenance mode | |

### User Permissions

| Permission ID | Label | High Risk |
|---|---|---|
| `users.view` | View users | |
| `users.create` | Create users | |
| `users.edit` | Edit user profiles | |
| `users.delete` | Delete users | ⚠️ |
| `users.ban` | Ban / unban users | |
| `users.impersonate` | Impersonate users | ⚠️ |
| `users.approve` | Approve / reject pending accounts | |
| `users.wallet` | Top-up / adjust user wallets | |

### Order Permissions

| Permission ID | Label |
|---|---|
| `orders.view` | View orders |
| `orders.edit` | Edit orders |
| `orders.cancel` | Cancel orders |
| `orders.refund` | Issue refunds |
| `orders.reassign` | Reassign orders / riders |

### Finance Permissions

| Permission ID | Label | High Risk |
|---|---|---|
| `finance.transactions.view` | View wallet transactions | |
| `finance.wallet.topup` | Top-up user wallets | |
| `finance.wallet.adjust` | Adjust wallet balances | |
| `finance.withdrawals.view` | View withdrawal requests | |
| `finance.withdrawals.approve` | Approve withdrawals | ⚠️ |
| `finance.payouts.release` | Release vendor / rider payouts | ⚠️ |
| `finance.deposits.review` | Review deposit requests | |
| `finance.kyc.view` | View KYC submissions | |
| `finance.kyc.approve` | Approve KYC submissions | |

### Vendor Permissions

| Permission ID | Label |
|---|---|
| `vendors.view` | View vendor accounts |
| `vendors.edit` | Edit vendor accounts |
| `vendors.approve` | Approve vendor accounts |
| `vendors.suspend` | Suspend vendor accounts |

### Content Permissions

| Permission ID | Label |
|---|---|
| `content.products.view` | View products |
| `content.products.edit` | Edit products |
| `content.products.delete` | Delete products |
| `content.categories.edit` | Edit categories |
| `content.banners.edit` | Edit banners |

### Promotion Permissions

| Permission ID | Label |
|---|---|
| `promotions.view` | View promotions |
| `promotions.edit` | Edit promotions / promo codes |
| `promotions.publish` | Publish promotions |
| `promotions.flash.edit` | Manage flash deals |

### Fleet / Dispatch Permissions

| Permission ID | Label |
|---|---|
| `fleet.rides.view` | View rides |
| `fleet.rides.dispatch` | Dispatch rides / reassign drivers |
| `fleet.rides.cancel` | Cancel rides |
| `fleet.parcel.view` | View parcel bookings |
| `fleet.parcel.dispatch` | Dispatch parcels |
| `fleet.pharmacy.view` | View pharmacy orders |
| `fleet.pharmacy.dispatch` | Dispatch pharmacy orders |

### Support Permissions

| Permission ID | Label |
|---|---|
| `support.chat.view` | View support chats |
| `support.chat.respond` | Respond to support chats |
| `support.chat.edit` | Edit support chat settings |
| `support.broadcast.send` | Send broadcast notifications |

### Vendor Staff Permissions

| Permission ID | Label |
|---|---|
| `vendor_staff.prices.edit` | Vendor: edit prices |
| `vendor_staff.products.edit` | Vendor: edit products |
| `vendor_staff.orders.fulfill` | Vendor: fulfill orders |
| `vendor_staff.staff.manage` | Vendor: manage staff |
| `vendor_staff.payouts.view` | Vendor: view payouts |

### Rider Operations Permissions

| Permission ID | Label |
|---|---|
| `rider_ops.rides.dispatch` | Rider: accept dispatched rides |
| `rider_ops.parcel.handle` | Rider: handle parcel deliveries |

---

## C3 — Built-In Role Presets

| Role Slug | Permissions Included |
|---|---|
| `super_admin` | ALL permissions |
| `support_admin` | users.view/create/edit/ban/approve, orders.view/cancel, fleet.*.view, support.*, system.audit.view |
| `finance_admin` | users.view, orders.view/refund, finance.*, system.audit.view |
| `vendor_owner` | vendor_staff.* (all vendor staff permissions) |
| `vendor_staff` | vendor_staff.orders.fulfill only |
| `rider` | rider_ops.rides.dispatch, rider_ops.parcel.handle |

---

## C4 — PermissionGate Component Usage

```tsx
import { PermissionGate } from "@/hooks/usePermissions";

// Single permission
<PermissionGate perm="users.delete" fallback={<DisabledButton />}>
  <DeleteButton />
</PermissionGate>

// Any of several permissions
<PermissionGate anyOf={["orders.edit", "orders.cancel"]}>
  <EditOrderPanel />
</PermissionGate>

// All permissions required
<PermissionGate allOf={["finance.wallet.adjust", "system.audit.view"]}>
  <AuditedWalletAdjust />
</PermissionGate>
```

---

---

# D. All Routes — Complete List with Permissions

| Route | Component | Required Permission |
|---|---|---|
| `/login` | Login | public |
| `/forgot-password` | ForgotPassword | public |
| `/reset-password` | ResetPassword | public |
| `/set-new-password` | SetNewPassword | authenticated |
| `/dashboard` | Dashboard | authenticated |
| `/users` | Users | `users.view` |
| `/orders` | Orders | `orders.view` |
| `/rides` | Rides | `fleet.rides.view` |
| `/pharmacy` | Pharmacy | `fleet.pharmacy.view` |
| `/parcel` | Parcel | `fleet.parcel.view` |
| `/products` | Products | `content.products.view` |
| `/broadcast` | Broadcast | `support.broadcast.send` |
| `/transactions` | Transactions | `finance.transactions.view` |
| `/revenue-analytics` | RevenueAnalytics | `finance.transactions.view` |
| `/settings` | Settings | `system.settings.view` |
| `/settings/:section` | Settings | `system.settings.view` |
| `/settings/:section/:subsection` | Settings | `system.settings.view` |
| `/flash-deals` | FlashDeals | `promotions.view` |
| `/categories` | Categories | `content.products.view` |
| `/banners` | Banners | `content.products.view` |
| `/app-management` | AppManagement | `system.settings.view` |
| `/vendors` | Vendors | `vendors.view` |
| `/riders` | Riders | `fleet.rides.view` |
| `/promo-codes` | PromoCodes | `promotions.view` |
| `/notifications` | Notifications | `support.broadcast.send` |
| `/withdrawals` | Withdrawals | `finance.withdrawals.view` |
| `/deposit-requests` | DepositRequests | `finance.deposits.review` |
| `/security` | Security | `system.settings.view` |
| `/sos-alerts` | SosAlerts | `fleet.rides.view` |
| `/live-riders-map` | LiveRidersMap *(lazy)* | `fleet.rides.view` |
| `/reviews` | Reviews | `content.products.view` |
| `/kyc` | KycPage | `finance.kyc.view` |
| `/van` | VanService | `fleet.rides.view` |
| `/delivery-access` | DeliveryAccess | `vendors.view` |
| `/account-conditions` | AccountConditions | `system.settings.view` |
| `/condition-rules` | ConditionRules | `system.settings.view` |
| `/popups` | Popups | `content.products.view` |
| `/promotions` | PromotionsHub | `promotions.view` |
| `/support-chat` | SupportChat | `support.chat.view` |
| `/faq-management` | FaqManagement | `content.products.view` |
| `/search-analytics` | SearchAnalytics | `system.settings.view` |
| `/error-monitor` | ErrorMonitor *(lazy)* | `system.settings.view` |
| `/communication` | Communication *(lazy)* | `support.chat.view` |
| `/loyalty` | Loyalty | `promotions.view` |
| `/wallet-transfers` | WalletTransfers | `finance.transactions.view` |
| `/chat-monitor` | ChatMonitor | `support.chat.view` |
| `/wishlist-insights` | WishlistInsights | `content.products.view` |
| `/qr-codes` | QrCodes | `content.products.view` |
| `/experiments` | Experiments | `system.settings.view` |
| `/webhooks` | WebhookManager | `system.settings.view` |
| `/deep-links` | DeepLinks | `content.products.view` |
| `/launch-control` | LaunchControl | `system.maintenance` |
| `/otp-control` | OtpControl | `system.settings.edit` |
| `/sms-gateways` | SmsGateways | `system.settings.view` |
| `/auth-methods` | AuthMethods | `system.settings.edit` |
| `/roles-permissions` | RolesPermissions | `system.roles.manage` |
| `/audit-logs` | AuditLogs | `system.audit.view` |
| `/whatsapp-delivery-log` | WhatsAppDeliveryLog | `system.settings.view` |
| `/accessibility` | AccessibilityPage | `system.settings.view` |
| `/consent-log` | ConsentLogPage | `system.audit.view` |
| `/vendor-inventory-settings` | VendorInventorySettings | `vendors.view` |
| `/health-dashboard` | HealthDashboard | `system.settings.view` |
| `/403` | Forbidden | public |

**Total routes: 62**

---

---

# E. Sidebar Navigation Groups

The sidebar is defined in `lib/navConfig.ts` — single source of truth. Adding a route here automatically adds it to the sidebar, command palette, breadcrumbs, and favorites.

---

## Group 1 — System (indigo #6366F1)

| Link | Path | Description |
|---|---|---|
| Dashboard | `/dashboard` | Overview KPIs and live activity |
| Users & Permissions | `/users` | Customers, admins and roles |
| Roles & Permissions | `/roles-permissions` | Admin RBAC matrix and role assignment |
| Settings | `/settings` | Single source of truth for platform settings |
| Feature Toggles | `/app-management` | Service status overview, admin accounts, release notes |
| Launch Control | `/launch-control` | Pre-launch readiness checklist |
| Auth Methods | `/auth-methods` | Per-role login methods (Phone, Email, OAuth, 2FA, Biometric) |
| OTP Control | `/otp-control` | OTP delivery providers and policies |
| SMS Gateways | `/sms-gateways` | SMS provider routing and credits |
| Account Conditions | `/account-conditions` | Apply or lift restrictions on accounts |
| Condition Rules | `/condition-rules` | Default rules per condition type |
| Action Log | `/audit-logs` | Paginated log of all admin actions with filters |
| Health Dashboard | `/health-dashboard` | Live status of GPS tracking, content moderation rules, and service feature flags |

---

## Group 2 — Finance (green #22C55E)

| Link | Path | Description |
|---|---|---|
| Orders | `/orders` | All marketplace orders and refunds |
| Transactions | `/transactions` | Wallet, payouts and ledger entries |
| Revenue Analytics | `/revenue-analytics` | Monthly revenue breakdown, category totals, top vendors |
| Withdrawals | `/withdrawals` | Vendor and rider withdrawal requests |
| Deposit Requests | `/deposit-requests` | Customer top-ups awaiting approval |
| Wallet Transfers | `/wallet-transfers` | Internal wallet movements |
| Loyalty Points | `/loyalty` | Loyalty point ledger and rules |
| KYC Verification | `/kyc` | KYC submissions and verification |
| Vendors | `/vendors` | Stores, catalogues and payouts |
| Products | `/products` | Global catalogue and curation |
| Promotions Hub | `/promotions` | Offers, coupons and campaigns |

---

## Group 3 — Fleet & Logistics (red #EF4444)

| Link | Path | Description |
|---|---|---|
| Rides | `/rides` | Ride bookings and disputes |
| Van Service | `/van` | Van service requests |
| Pharmacy | `/pharmacy` | Pharmacy orders and pre-orders |
| Live Riders Map | `/live-riders-map` | Real-time rider positions |
| SOS Alerts | `/sos-alerts` | Active safety alerts (pulsing red badge when active) |
| Error Monitor | `/error-monitor` | Client and server error stream (amber badge when unchecked) |
| Audit Logs | `/security` | Audit log of admin actions |
| Delivery Access | `/delivery-access` | Pilot whitelist and access requests |

---

## Group 4 — Marketing (pink #EC4899)

| Link | Path | Description |
|---|---|---|
| Offers & Coupons | `/promotions` | Promo codes and offer management |
| Flash Deals | `/flash-deals` | Time-bound flash deal calendar |
| Banners | `/banners` | Home and category banner slots |
| Popups | `/popups` | In-app popup campaigns |
| Campaigns Calendar | `/promotions?tab=campaigns` | Campaign scheduling |

---

## Group 5 — Customer Support (cyan #06B6D4)

| Link | Path | Description |
|---|---|---|
| Inbox / Chat Moderation | `/support-chat` | Inbox plus chat moderation |
| FAQ Management | `/faq-management` | Help centre and FAQ articles |
| Send Broadcast | `/broadcast` | Send notifications to segments |
| Notifications Log | `/notifications` | Outbound notifications log |

---

## Group 6 — Analytics (pink #F472B6)

| Link | Path | Description |
|---|---|---|
| Search Analytics | `/search-analytics` | Search queries and zero-result terms |
| Messaging KPIs | `/communication` | Messaging dashboard |
| Wishlist Insights | `/wishlist-insights` | Most-wished products and trends |
| QR Codes | `/qr-codes` | Branded QR codes and campaigns |
| Experiments | `/experiments` | A/B tests and rollouts |

---

## Group 7 — Integrations (emerald #10B981)

| Link | Path | Description |
|---|---|---|
| Webhooks | `/webhooks` | Outgoing webhook endpoints |
| Deep Links | `/deep-links` | Deep link generator and analytics |
| WhatsApp Delivery Log | `/whatsapp-delivery-log` | WhatsApp message delivery status |

---

## Mobile Bottom Navigation (Fixed 4 + More)

| Tab | Path |
|---|---|
| Dashboard | `/dashboard` |
| Orders | `/orders` |
| Rides | `/rides` |
| SOS Alerts | `/sos-alerts` |
| More | Opens full sidebar drawer |

---

---

# F. Every Page — What It Does, API Calls, Key Functions

---

## F1 — Dashboard (`/dashboard`)

**What it does:** Real-time KPI overview for the whole platform.

**API Calls:**
- `GET /api/admin/stats` — total users, orders, rides, revenue today
- `GET /api/admin/stats/revenue-trend` — 7-day revenue chart data (Recharts AreaChart)
- `GET /api/admin/stats/leaderboard` — top vendors / riders
- `GET /api/fleet/dashboard-export` — exports full dashboard snapshot as JSON

**Key UI:**
- StatCards with Sparkline charts (mini LineChart in each card)
- Revenue AreaChart (last 7 days)
- Leaderboard table (top vendors/riders)
- Pull-to-refresh
- Export button → downloads dashboard JSON file
- Clickable cards → navigate to relevant page

---

## F2 — Users (`/users`)

**What it does:** Full user management — customers, riders, vendors.

**API Calls:**
- `GET /api/admin/users` — paginated list with search + filter
- `GET /api/admin/users/:id/activity` — order/ride history for a user
- `GET /api/admin/users/pending` — accounts awaiting approval
- `POST /api/admin/users` — create new user
- `PATCH /api/admin/users/:id` — edit profile
- `PATCH /api/admin/users/:id/security` — security settings (ban, reset OTP)
- `DELETE /api/admin/users/:id` — delete user (⚠️ requires `users.delete`)
- `POST /api/admin/users/bulk-ban` — bulk ban selected users
- `POST /api/admin/users/:id/approve` — approve pending account
- `POST /api/admin/users/:id/reject` — reject pending account
- `POST /api/admin/users/:id/wallet/topup` — top-up wallet (requires `users.wallet`)
- `GET /api/admin/users/:id/sessions` — active sessions list
- `DELETE /api/admin/users/:id/sessions/:sessionId` — revoke session
- `DELETE /api/admin/users/:id/sessions` — revoke all sessions
- `GET /api/admin/users/:id/otp` — admin view of OTP (dev only)
- `POST /api/admin/users/:id/verify-contact` — force verify phone/email
- `POST /api/admin/users/:id/force-password-reset` — trigger password reset email
- `GET /api/admin/kyc?userId=:id` — KYC status for a user
- `POST /api/admin/kyc/:id/approve` — approve KYC
- `POST /api/admin/kyc/:id/reject` — reject KYC
- `POST /api/admin/users/:id/waive-debt` — waive negative wallet balance
- `POST /api/admin/users/:id/reset-otp` — reset OTP lockout

**Key UI:**
- Table with role badges (color-coded: blue=customer, green=rider, orange=vendor, purple=admin)
- Per-user detail modal with: profile, activity tab, sessions tab, KYC tab
- WalletAdjustModal for balance adjustments
- SensitiveActionDialog confirmation for destructive actions (ban/delete)
- Bulk-select with bulk-ban action

---

## F3 — Orders (`/orders`)

**What it does:** All marketplace orders — view, filter, assign rider, refund, cancel.

**API Calls:**
- `GET /api/admin/orders` — paginated + filtered (search, status, type, date range)
- `GET /api/admin/orders/stats` — counts per status
- `PATCH /api/admin/orders/:id` — update status
- `POST /api/admin/orders/:id/assign-rider` — assign rider
- `POST /api/admin/orders/:id/refund` — issue refund
- `GET /api/admin/riders` — rider list for assignment dropdown
- (export) `GET /api/admin/orders/export` — download CSV

**Key UI:**
- `OrdersStatsCards` — counts for pending/processing/delivered/cancelled
- `OrdersFilterBar` — search + status + type + date range filters
- `OrdersTable` (desktop) / `OrdersMobileList` (mobile)
- `OrderDetailDrawer` — full order detail slide-over
  - Items list, timeline, address, payment method
  - `GpsMiniMap` — static map of delivery location
  - `GpsStampCard` — delivery GPS coordinates
  - `RiderAssignPanel` — search + assign rider
  - `RefundConfirmDialog`, `DeliverConfirmDialog`, `CancelConfirmDialog`
- Sort by: date, total, status
- Export CSV (client-side or API)

---

## F4 — Rides (`/rides`)

**What it does:** Ride bookings, status management, dispute resolution.

**API Calls:**
- `GET /api/admin/rides` — paginated + filtered
- `PATCH /api/admin/rides/:id` — update ride status
- `GET /api/admin/fleet/rides` — fleet-level ride data

**Key UI:**
- Rides table with status, rider, fare, distance
- Status update dropdown
- Dispute flag + notes

---

## F5 — Vendors (`/vendors`)

**What it does:** Vendor account management, plan assignment, payouts.

**API Calls:**
- `GET /api/admin/vendors` — paginated vendor list
- `PATCH /api/admin/vendors/:id/status` — approve/suspend
- `POST /api/admin/vendors/:id/payout` — release payout
- `POST /api/admin/vendors/:id/credit` — add credit

---

## F6 — Riders (`/riders`)

**What it does:** Rider profile management, penalties, bonuses, payouts.

**API Calls:**
- `GET /api/admin/riders` — paginated rider list
- `PATCH /api/admin/riders/:id/status` — activate/deactivate
- `POST /api/admin/riders/:id/payout` — release payout
- `POST /api/admin/riders/:id/bonus` — add bonus
- `GET /api/admin/riders/:id/penalties` — penalty history
- `GET /api/admin/riders/:id/ratings` — rating history
- `POST /api/admin/riders/:id/restrict` — add restriction
- `DELETE /api/admin/riders/:id/restrict` — lift restriction

---

## F7 — Products (`/products`)

**What it does:** Global product catalog — create, edit, delete, approve/reject.

**API Calls:**
- `GET /api/admin/products` — paginated product list
- `POST /api/admin/products` — create product
- `PATCH /api/admin/products/:id` — update product
- `DELETE /api/admin/products/:id` — delete product (requires `content.products.delete`)
- `GET /api/admin/products/pending` — products awaiting approval
- `POST /api/admin/products/:id/approve` — approve vendor product
- `POST /api/admin/products/:id/reject` — reject vendor product

---

## F8 — Categories (`/categories`)

**API Calls:**
- `GET /api/admin/categories` — full category tree
- `POST /api/admin/categories` — create category
- `PATCH /api/admin/categories/:id` — update
- `DELETE /api/admin/categories/:id` — delete

---

## F9 — Banners (`/banners`)

**API Calls:**
- `GET /api/admin/banners` — banner list
- `POST /api/admin/banners` — create banner (title, image, link, position)
- `PATCH /api/admin/banners/:id` — update
- `DELETE /api/admin/banners/:id` — delete

---

## F10 — Transactions (`/transactions`)

**What it does:** Full wallet transaction ledger — credits, debits, payouts.

**API Calls:**
- `GET /api/admin/finance/transactions` — paginated transaction list

---

## F11 — Revenue Analytics (`/revenue-analytics`)

**What it does:** Revenue breakdown by service type, vendor, date range.

**API Calls:**
- `GET /api/admin/stats/revenue` — revenue totals
- `GET /api/admin/stats/revenue-trend` — time-series data (Recharts AreaChart)

---

## F12 — Withdrawals (`/withdrawals`)

**What it does:** Vendor/rider withdrawal request management.

**API Calls:**
- `GET /api/admin/finance/withdrawals` — pending + history
- `POST /api/admin/finance/withdrawals/:id/approve` — approve (⚠️ highRisk)
- `POST /api/admin/finance/withdrawals/:id/reject` — reject

---

## F13 — Deposit Requests (`/deposit-requests`)

**What it does:** Review customer manual top-up receipts and approve/reject.

**API Calls:**
- `GET /api/admin/finance/deposits` — deposit request list (filter by status)
- `POST /api/admin/finance/deposits/:id/approve` — approve + credit wallet
- `POST /api/admin/finance/deposits/:id/reject` — reject with reason

---

## F14 — KYC Verification (`/kyc`)

**What it does:** Review submitted ID documents and approve/reject identity verification.

**API Calls:**
- `GET /api/admin/kyc` — paginated KYC submissions
- `GET /api/admin/kyc/:id` — full KYC document view
- `POST /api/admin/kyc/:id/approve` — approve → updates user `accountLevel` to Gold
- `POST /api/admin/kyc/:id/reject` — reject with reason

---

## F15 — Promo Codes (`/promo-codes`)

**API Calls:**
- `GET /api/admin/promo-codes` — list
- `POST /api/admin/promo-codes` — create (code, discount%, flat, min order, usage limit, expiry)
- `PATCH /api/admin/promo-codes/:id` — update
- `DELETE /api/admin/promo-codes/:id` — delete

---

## F16 — Flash Deals (`/flash-deals`)

**What it does:** Create time-bound discounted product offers.

**API Calls:**
- `GET /api/admin/flash-deals` — list
- `POST /api/admin/flash-deals` — create (product, discount%, start, end)
- `PATCH /api/admin/flash-deals/:id` — update
- `DELETE /api/admin/flash-deals/:id` — delete

---

## F17 — Promotions Hub (`/promotions`)

**What it does:** Tabbed hub for all promotional content — Offers, Promo Codes, Campaigns.

**Tabs:** Offers | Promo Codes | Campaigns | Flash Deals

---

## F18 — Loyalty (`/loyalty`)

**What it does:** Points rules and loyalty ledger.

**API Calls:**
- `GET /api/admin/loyalty` — loyalty config + ledger
- `PATCH /api/admin/loyalty/config` — update points rules

---

## F19 — Notifications (`/notifications`)

**What it does:** View log of all outbound notifications (push/SMS/email).

**API Calls:**
- `GET /api/admin/notifications` — notification history

---

## F20 — Broadcast (`/broadcast`)

**What it does:** Send bulk notifications to user segments.

**API Calls:**
- `POST /api/admin/broadcast` — send notification (title, body, segment, channel)
- `GET /api/admin/broadcast/recipient-count?segment=...` — preview recipient count

---

## F21 — Support Chat (`/support-chat`)

**What it does:** Admin inbox for all customer support conversations.

**API Calls:**
- `GET /api/admin/support-chat` — conversation list
- `GET /api/admin/support-chat/:id/messages` — message history
- `POST /api/admin/support-chat/:id/messages` — admin reply

---

## F22 — FAQ Management (`/faq-management`)

**API Calls:**
- `GET /api/admin/faq` — FAQ list
- `POST /api/admin/faq` — create FAQ item
- `PATCH /api/admin/faq/:id` — update
- `DELETE /api/admin/faq/:id` — delete

---

## F23 — Roles & Permissions (`/roles-permissions`)

**What it does:** Create custom RBAC roles, assign permissions, assign roles to admin accounts.

**API Calls:**
- `GET /api/admin/system/rbac/permissions` — full permission catalog
- `GET /api/admin/system/rbac/roles` — all roles (built-in + custom)
- `GET /api/admin/system/rbac/roles/:id` — role detail + permissions
- `POST /api/admin/system/rbac/roles` — create role (requires `system.roles.manage`)
- `PATCH /api/admin/system/rbac/roles/:id` — update role name/description
- `DELETE /api/admin/system/rbac/roles/:id` — delete role (built-in = non-deletable)
- `PUT /api/admin/system/rbac/roles/:id/permissions` — set permission list
- `GET /api/admin/system/rbac/admins/:id/roles` — roles assigned to admin
- `PUT /api/admin/system/rbac/admins/:id/roles` — assign roles to admin
- `GET /api/admin/system/rbac/admins/:id/permissions` — effective permissions
- `POST /api/admin/system/rbac/roles/:id/revoke-sessions` — revoke all sessions for role

**Key UI:**
- Permission matrix grouped by category
- High-risk permissions flagged with red badge
- Role creation dialog (slug, name, description)
- Admin account → role assignment panel
- PermissionGate hides write actions from non-super admins

---

## F24 — Launch Control (`/launch-control`)

**What it does:** Pre-launch readiness checklist. Vendor plans management. Role preset management.

**API Calls:**
- `GET /api/admin/platform-settings` — current config + diff from AI recommendations
- `POST /api/admin/launch/recommend` — get AI-generated optimal settings
- `GET /api/admin/vendor-plans` — list vendor subscription plans
- `POST /api/admin/vendor-plans` — create plan
- `PATCH /api/admin/vendor-plans/:id` — update plan
- `DELETE /api/admin/vendor-plans/:id` — delete plan
- `GET /api/admin/system/rbac/roles` — role presets

---

## F25 — Live Riders Map (`/live-riders-map`)

**What it does:** Real-time map of all active rider positions. (Lazy-loaded — Leaflet)

**API Calls:**
- `GET /api/admin/riders/live-locations` — GPS coordinates for all online riders

---

## F26 — SOS Alerts (`/sos-alerts`)

**What it does:** Emergency alerts from riders/customers. Pulsing red sidebar badge when active.

**API Calls:**
- `GET /api/admin/sos` — active SOS alert list
- `PATCH /api/admin/sos/:id/resolve` — mark as resolved

---

## F27 — Audit Logs (`/audit-logs`)

**What it does:** Paginated log of every admin action with IP, timestamp, result.

**API Calls:**
- `GET /api/admin/system/audit` — paginated audit log (filter by admin, action, date)

---

## F28 — Consent Log (`/consent-log`)

**What it does:** GDPR consent records — who accepted which terms version and when.

**API Calls:**
- `GET /api/admin/compliance/consent-log` — consent records

---

## F29 — Error Monitor (`/error-monitor`)

**What it does:** Live stream of client-side errors reported by the customer app.

**API Calls:**
- `GET /api/admin/errors` — error report list (paginated)
- `PATCH /api/admin/errors/:id/resolve` — mark resolved

---

## F30 — Health Dashboard (`/health-dashboard`)

**What it does:** Live health status of all services and background monitors.

*Full details in Section M.*

---

## F31 — Security Dashboard (`/security`)

**What it does:** Multi-tab security management center.

*Full details in Section N.*

---

## F32 — Webhooks (`/webhooks`)

**What it does:** Register and manage outgoing webhook endpoints for vendor events.

**API Calls:**
- `GET /api/admin/webhook-registrations` — list all webhooks
- `POST /api/admin/webhook-registrations` — register new webhook (URL, event types, secret)
- `PATCH /api/admin/webhook-registrations/:id` — update
- `DELETE /api/admin/webhook-registrations/:id` — delete
- `POST /api/admin/webhook-registrations/:id/test` — send test event

---

## F33 — Deep Links (`/deep-links`)

**What it does:** Create, manage, and track deep links for campaigns.

**API Calls:**
- `GET /api/admin/deep-links` — list
- `POST /api/admin/deep-links` — create (target, campaign, UTM)
- `DELETE /api/admin/deep-links/:id` — delete

---

## F34 — Wishlist Insights (`/wishlist-insights`)

**What it does:** Analytics on most-wishlisted products.

**API Calls:**
- `GET /api/admin/wishlist-analytics` — top wishlist products

---

## F35 — QR Codes (`/qr-codes`)

**What it does:** Generate branded QR codes linked to products/vendors/promotions.

**API Calls:**
- `GET /api/admin/qr-codes` — list
- `POST /api/admin/qr-codes` — create (target, label, style)
- `DELETE /api/admin/qr-codes/:id` — delete

---

## F36 — Experiments (`/experiments`)

**What it does:** A/B test management. *(Backend wiring currently incomplete — see Section O.)*

**API Calls:**
- `GET /api/admin/experiments` — experiment list
- `POST /api/admin/experiments` — create experiment
- `PATCH /api/admin/experiments/:id` — update / toggle

---

## F37 — WhatsApp Delivery Log (`/whatsapp-delivery-log`)

**What it does:** Track WhatsApp message delivery status (sent/delivered/read/failed).

**API Calls:**
- `GET /api/admin/communication/whatsapp-log` — delivery log

---

## F38 — Communication (`/communication`)

**What it does:** Messaging KPIs dashboard. (Lazy-loaded)

**API Calls:**
- `GET /api/admin/communication/stats` — KPIs (sent, delivered, read rate, failed)

---

## F39 — Search Analytics (`/search-analytics`)

**What it does:** Top search queries, zero-result terms, search trends.

**API Calls:**
- `GET /api/admin/search-analytics` — search log aggregates

---

## F40 — SMS Gateways (`/sms-gateways`)

**What it does:** Configure and test SMS provider routing (Twilio, etc.).

**API Calls:**
- `GET /api/admin/sms-gateways` — gateway list
- `POST /api/admin/sms-gateways` — add gateway
- `PATCH /api/admin/sms-gateways/:id` — update
- `DELETE /api/admin/sms-gateways/:id` — delete
- `POST /api/admin/sms-gateways/:id/test` — send test SMS

---

## F41 — OTP Control (`/otp-control`)

**What it does:** Global OTP bypass toggle + per-provider policy settings.

**API Calls:**
- `GET /api/admin/otp-control` — current OTP config
- `PATCH /api/admin/otp-control` — update (bypass toggle, provider, max attempts)

---

## F42 — Auth Methods (`/auth-methods`)

**What it does:** Per-role authentication method toggles (Phone OTP, Email OTP, Username, Google, Facebook, Magic Link, 2FA, Biometric).

**API Calls:**
- `GET /api/admin/auth-methods` — current auth method config
- `PATCH /api/admin/auth-methods` — update toggles

---

---

# G. Settings Page — All 10 Tabs & Every Setting Key

The Settings page (`/settings`) consolidates all platform configuration into **10 top-level tabs**.

---

## Tab 1 — General

*Legacy categories: `general`, `regional`, `localization`, `branding`*

| Setting Key | Type | Description |
|---|---|---|
| `app_name` | string | App display name |
| `app_tagline` | string | Tagline shown on splash/login |
| `app_version` | string | Current version string |
| `currency_symbol` | string | e.g. `Rs.` |
| `currency_code` | string | e.g. `PKR` |
| `default_language` | string | `en` / `ur` / `roman` |
| `timezone` | string | e.g. `Asia/Karachi` |
| `country_code` | string | e.g. `PK` |
| `phone_format` | string | e.g. `03XXXXXXXXX` |
| `support_phone` | string | Support phone number |
| `support_email` | string | Support email |
| `support_hours` | string | e.g. `Mon-Sat 9am-6pm` |
| `business_address` | string | Physical address |
| `social_facebook` | string | Facebook page URL |
| `social_instagram` | string | Instagram URL |
| `default_lat` | decimal | Default map center latitude |
| `default_lng` | decimal | Default map center longitude |
| `tnc_url` | string | Terms & conditions URL |
| `privacy_url` | string | Privacy policy URL |
| `refund_policy_url` | string | Refund policy URL |
| `faq_url` | string | FAQ page URL |
| `about_url` | string | About page URL |

---

## Tab 2 — Services & Features

*Legacy category: `features`*

| Setting Key | Type | Description |
|---|---|---|
| `feature_mart` | boolean | Enable e-commerce mart |
| `feature_food` | boolean | Enable food delivery |
| `feature_rides` | boolean | Enable ride hailing |
| `feature_pharmacy` | boolean | Enable pharmacy |
| `feature_parcel` | boolean | Enable parcel delivery |
| `feature_van` | boolean | Enable van / inter-city |
| `feature_wallet` | boolean | Enable wallet |
| `feature_referral` | boolean | Enable referral system |
| `feature_new_users` | boolean | Allow new user registration |
| `feature_chat` | boolean | Enable in-app chat |
| `feature_live_tracking` | boolean | Enable GPS order tracking |
| `feature_reviews` | boolean | Enable reviews & ratings |
| `feature_sos` | boolean | Enable SOS emergency button |
| `feature_weather` | boolean | Enable weather widget |

---

## Tab 3 — Operations & Dispatch

*Legacy categories: `dispatch`, `orders`, `delivery`, `rides`, `van`, `onboarding`*

| Setting Key | Type | Description |
|---|---|---|
| `min_order_amount` | decimal | Minimum cart value to place order |
| `max_cod_amount` | decimal | Max order value for cash on delivery |
| `max_cart_value` | decimal | Maximum cart total |
| `cancel_window_min` | integer | Minutes after order to allow cancellation |
| `auto_cancel_min` | integer | Auto-cancel if no rider accepts (minutes) |
| `refund_days` | integer | Refund processing days |
| `base_delivery_fee` | decimal | Base fee per delivery |
| `per_km_delivery_fee` | decimal | Additional fee per km |
| `free_delivery_threshold` | decimal | Cart total for free delivery |
| `max_delivery_distance_km` | integer | Max service radius |
| `rider_auto_assign` | boolean | Auto-assign nearest rider |
| `dispatch_radius_km` | decimal | Radius to search for riders |
| `ride_base_fare` | decimal | Ride base fare |
| `ride_per_km_fare` | decimal | Ride per-km rate |
| `ride_min_fare` | decimal | Minimum ride fare |

---

## Tab 4 — Roles

*Legacy categories: `customer`, `rider`, `vendor`*

| Setting Key | Type | Description |
|---|---|---|
| `customer_kyc_required` | boolean | Require KYC for purchases |
| `customer_wallet_limit` | decimal | Max wallet balance |
| `customer_order_limit_per_day` | integer | Max orders per day |
| `rider_commission_pct` | decimal | Platform commission on rider earnings |
| `rider_daily_withdrawal_limit` | decimal | Max daily withdrawal |
| `vendor_commission_pct` | decimal | Platform commission on vendor sales |
| `vendor_payout_cycle_days` | integer | Days between payouts |
| `vendor_max_products` | integer | Default max products for free plan |

---

## Tab 5 — Finance & Payments

*Legacy categories: `finance`, `payment`*

| Setting Key | Type | Description |
|---|---|---|
| `payment_jazzcash_enabled` | boolean | Enable JazzCash |
| `payment_easypaisa_enabled` | boolean | Enable EasyPaisa |
| `payment_bank_transfer_enabled` | boolean | Enable bank transfer |
| `payment_cod_enabled` | boolean | Enable cash on delivery |
| `payment_wallet_enabled` | boolean | Enable wallet payment |
| `jazzcash_merchant_id` | string | JazzCash merchant ID |
| `jazzcash_api_url` | string | JazzCash API endpoint |
| `easypaisa_merchant_id` | string | EasyPaisa merchant ID |
| `bank_account_title` | string | Platform bank account title |
| `bank_account_number` | string | Platform bank account number |
| `bank_name` | string | Bank name |
| `bank_iban` | string | IBAN |
| `loyalty_points_per_order` | integer | Points per completed order |
| `loyalty_points_to_rupee` | decimal | Points-to-PKR conversion rate |

---

## Tab 6 — Communication

*Legacy categories: `notifications`, `content`*

| Setting Key | Type | Description |
|---|---|---|
| `otp_provider` | string | `twilio` / `whatsapp` / `email` |
| `otp_bypass_active` | boolean | Global OTP bypass (dev/testing) |
| `otp_bypass_message` | string | Message shown when bypass is on |
| `otp_max_attempts` | integer | Lock after N failed attempts |
| `otp_expiry_min` | integer | OTP validity in minutes |
| `push_enabled` | boolean | Enable push notifications |
| `email_enabled` | boolean | Enable email notifications |
| `whatsapp_enabled` | boolean | Enable WhatsApp messages |
| `support_chat_enabled` | boolean | Enable support chat |
| `support_schedule_mon_open` | string | Monday open time HH:MM |
| `support_schedule_mon_close` | string | Monday close time |
| `announcement` | string | Platform-wide announcement banner text |
| `maintenance_msg` | string | Message shown during maintenance mode |
| `vendor_notice` | string | Notice shown to vendors |
| `rider_notice` | string | Notice shown to riders |
| `show_banner` | boolean | Show announcement banner |
| `tracker_banner_enabled` | boolean | Show active order tracker strip |
| `tracker_banner_position` | string | `top` or `bottom` |

---

## Tab 7 — Integrations

*Legacy category: `integrations`*

| Setting Key | Type | Description |
|---|---|---|
| `google_maps_api_key` | secret | Google Maps JS API key |
| `osrm_api_url` | string | OSRM routing API URL |
| `firebase_project_id` | string | Firebase project ID |
| `sentry_dsn` | secret | Sentry DSN |
| `gemini_api_key` | secret | Gemini AI API key |
| `sendgrid_api_key` | secret | SendGrid API key |
| `slack_webhook_url` | string | Slack alert webhook URL |
| `sentry_webhook_secret` | secret | Sentry webhook HMAC secret |

---

## Tab 8 — Security & Access

*Legacy categories: `security`, `jwt`, `moderation`, `ratelimit`*

| Setting Key | Type | Description |
|---|---|---|
| `security_suspicious_pattern_threshold` | integer | Req/min/IP before alert fires |
| `admin_ip_lockout_enabled` | boolean | Lock admin login after N failures |
| `admin_ip_lockout_attempts` | integer | Attempts before lockout |
| `admin_ip_lockout_min` | integer | Lockout duration in minutes |
| `jwt_access_ttl_sec` | integer | Access token TTL (default 900 = 15 min) |
| `jwt_refresh_ttl_days` | integer | Refresh token TTL (default 7 days) |
| `allowed_origins` | string | CORS allowed origins (comma-separated) |
| `content_moderation_enabled` | boolean | Enable AI content moderation |
| `rate_limit_login_per_min` | integer | Login attempts per IP per minute |
| `rate_limit_otp_per_min` | integer | OTP attempts per phone per minute |
| `encryption_master_key` | secret | AES-256 PII encryption key |
| `password_min_length` | integer | Min password length |
| `password_require_uppercase` | boolean | Require uppercase |
| `password_require_number` | boolean | Require number |
| `password_require_special` | boolean | Require special character |

---

## Tab 9 — System & Performance

*Legacy categories: `system`, `system_limits`, `cache`, `network`, `geo`, `uploads`, `pagination`*

| Setting Key | Type | Description |
|---|---|---|
| `maintenance_mode` | boolean | Put entire app in maintenance mode |
| `log_level` | string | `debug` / `info` / `warn` / `error` |
| `max_upload_size_mb` | integer | Max file upload size |
| `allowed_upload_types` | string | Comma-separated: `jpg,png,pdf` |
| `image_compression_quality` | integer | 1-100 |
| `max_page_size` | integer | Default API pagination limit |
| `redis_url` | secret | Redis connection URL |
| `health_monitor_enabled` | boolean | Enable background health alert monitor |
| `health_alert_email_enabled` | boolean | Send health alerts via email |
| `health_alert_slack_enabled` | boolean | Send health alerts via Slack |
| `gps_spoof_detection_enabled` | boolean | Detect GPS spoofing |
| `gps_max_speed_kmh` | integer | Flag if rider moves faster than this |
| `admin_timing_*` | integer | Debounce/poll interval overrides (DB-tunable) |

---

## Tab 10 — Widgets

*Legacy categories: `widgets` (weather, render overrides)*

| Setting Key | Type | Description |
|---|---|---|
| `weather_api_provider` | string | e.g. `openweathermap` |
| `weather_api_key` | secret | Weather API key |
| `weather_default_city` | string | Default city for weather widget |
| `weather_update_interval_min` | integer | Minutes between weather refreshes |
| `render_show_prices` | boolean | Show prices in product lists |
| `render_show_ratings` | boolean | Show star ratings |
| `render_show_stock` | boolean | Show stock quantity |
| `render_card_image_aspect` | string | `square` / `portrait` / `landscape` |

---

---

# H. All Admin API Endpoints (Backend Reference)

> Base path: `/api/admin/` — all require `adminAuth` middleware + CSRF protection (except auth routes)

---

## Auth Routes (no adminAuth required)

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/auth/login` | Admin login (username + password) |
| POST | `/api/admin/auth/refresh` | Refresh access token |
| POST | `/api/admin/auth/logout` | Logout + blacklist token |
| POST | `/api/admin/auth/forgot-password` | Send reset email |
| POST | `/api/admin/auth/reset-password` | Apply reset token + new password |
| POST | `/api/admin/auth/change-password` | Change own password |
| GET | `/api/admin/auth/me` | Get own admin profile |
| PATCH | `/api/admin/profile` | Update own name/username |

---

## System Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/system/rbac/permissions` | All permission definitions |
| GET | `/api/admin/system/rbac/roles` | All roles |
| POST | `/api/admin/system/rbac/roles` | Create role |
| GET | `/api/admin/system/rbac/roles/:id` | Role detail |
| PATCH | `/api/admin/system/rbac/roles/:id` | Update role |
| DELETE | `/api/admin/system/rbac/roles/:id` | Delete role |
| PUT | `/api/admin/system/rbac/roles/:id/permissions` | Set permissions |
| GET | `/api/admin/system/rbac/admins/:id/roles` | Admin's roles |
| PUT | `/api/admin/system/rbac/admins/:id/roles` | Set admin roles |
| GET | `/api/admin/system/rbac/admins/:id/permissions` | Effective permissions |
| POST | `/api/admin/system/rbac/roles/:id/revoke-sessions` | Revoke all for role |
| GET | `/api/admin/system/audit` | Audit log |
| GET | `/api/admin/system/users` | Admin accounts list |
| POST | `/api/admin/system/users` | Create admin account |
| PATCH | `/api/admin/system/users/:id` | Update admin |
| DELETE | `/api/admin/system/users/:id` | Delete admin |

---

## User Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users` | Paginated user list |
| GET | `/api/admin/users/pending` | Pending accounts |
| POST | `/api/admin/users` | Create user |
| GET | `/api/admin/users/:id` | User detail |
| PATCH | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| PATCH | `/api/admin/users/:id/security` | Security settings (ban, OTP) |
| POST | `/api/admin/users/:id/approve` | Approve pending |
| POST | `/api/admin/users/:id/reject` | Reject pending |
| POST | `/api/admin/users/bulk-ban` | Bulk ban |
| POST | `/api/admin/users/:id/wallet/topup` | Wallet top-up |
| GET | `/api/admin/users/:id/activity` | Activity history |
| GET | `/api/admin/users/:id/sessions` | Active sessions |
| DELETE | `/api/admin/users/:id/sessions/:sid` | Revoke session |
| DELETE | `/api/admin/users/:id/sessions` | Revoke all sessions |
| POST | `/api/admin/users/:id/force-password-reset` | Force password reset |
| POST | `/api/admin/users/:id/verify-contact` | Force verify contact |
| POST | `/api/admin/users/:id/waive-debt` | Waive debt |
| POST | `/api/admin/users/:id/reset-otp` | Reset OTP lockout |

---

## Order Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/orders` | Paginated + filtered orders |
| GET | `/api/admin/orders/stats` | Order status counts |
| GET | `/api/admin/orders/export` | Export CSV |
| PATCH | `/api/admin/orders/:id` | Update status |
| POST | `/api/admin/orders/:id/assign-rider` | Assign rider |
| POST | `/api/admin/orders/:id/refund` | Issue refund |

---

## Finance Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/finance/transactions` | Wallet transactions |
| GET | `/api/admin/finance/withdrawals` | Withdrawal requests |
| POST | `/api/admin/finance/withdrawals/:id/approve` | Approve withdrawal |
| POST | `/api/admin/finance/withdrawals/:id/reject` | Reject withdrawal |
| GET | `/api/admin/finance/deposits` | Deposit requests |
| POST | `/api/admin/finance/deposits/:id/approve` | Approve + credit wallet |
| POST | `/api/admin/finance/deposits/:id/reject` | Reject |

---

## Fleet Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/fleet/rides` | Rides list |
| PATCH | `/api/admin/fleet/rides/:id` | Update ride |
| GET | `/api/admin/fleet/service-zones` | Service zone list |
| POST | `/api/admin/fleet/service-zones` | Create zone |
| PATCH | `/api/admin/fleet/service-zones/:id` | Update zone |
| DELETE | `/api/admin/fleet/service-zones/:id` | Delete zone |
| GET | `/api/admin/riders/live-locations` | All rider GPS positions |

---

## Content Routes

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/admin/products` | Products CRUD |
| GET/PATCH/DELETE | `/api/admin/products/:id` | Single product |
| GET/POST | `/api/admin/categories` | Categories CRUD |
| GET/POST | `/api/admin/banners` | Banners CRUD |
| GET/POST | `/api/admin/popups` | Popups CRUD |
| GET/POST | `/api/admin/deep-links` | Deep links CRUD |
| GET/POST | `/api/admin/qr-codes` | QR codes CRUD |

---

## Platform Settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/platform-settings` | All settings |
| PATCH | `/api/admin/platform-settings` | Update settings (batch upsert) |
| POST | `/api/admin/launch/recommend` | AI-recommended settings |
| GET | `/api/admin/launch/data` | Launch readiness data |

---

## Security Routes

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/security/data-exports` | Data export audit log |
| GET | `/api/admin/security/events` | Suspicious pattern events |
| POST | `/api/admin/sentry-webhook` | Sentry webhook receiver (HMAC) |

---

## Health Route

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | DB + Redis + uptime check |
| GET | `/api/admin/health-dashboard` | Extended service health data |

---

---

# I. All Admin React Hooks — use-admin.ts Reference

All data fetching in the admin panel goes through these hooks. Every hook uses **TanStack React Query**.

| Hook | Method | Description |
|---|---|---|
| `useAdminLogin` | mutation | Login |
| `useStats` | query | Dashboard KPI stats |
| `useRevenueTrend` | query | 7-day revenue trend |
| `useLeaderboard` | query | Top vendors/riders |
| `useUsers(params?)` | query | User list with filters |
| `usePendingUsers` | query | Pending account list |
| `useApproveUser` | mutation | Approve user |
| `useRejectUser` | mutation | Reject user |
| `useUpdateUser` | mutation | Update user profile |
| `useUpdateUserSecurity` | mutation | Security actions (ban, etc.) |
| `useWalletTopup` | mutation | Top-up wallet |
| `useCreateUser` | mutation | Create new user |
| `useWaiveDebt` | mutation | Waive negative balance |
| `useDeleteUser` | mutation | Delete user |
| `useUserActivity` | query | User activity history |
| `useAdminUserSessions` | query | Active sessions |
| `useRevokeUserSession` | mutation | Revoke single session |
| `useRevokeAllUserSessions` | mutation | Revoke all sessions |
| `useAdminViewOtp` | query | View OTP (dev) |
| `useAdminVerifyContact` | mutation | Force verify contact |
| `useAdminForcePasswordReset` | mutation | Force password reset |
| `useAdminKycByUserId` | query | KYC by user |
| `useAdminKycApprove` | mutation | Approve KYC |
| `useAdminKycReject` | mutation | Reject KYC |
| `useAdminResetOtp` | mutation | Reset OTP lockout |
| `useOrders` | query | Orders list |
| `useOrdersEnriched` | query | Orders with filters + pagination |
| `useOrdersStats` | query | Order status counts |
| `fetchOrdersExport` | async fn | Download orders CSV |
| `useUpdateOrder` | mutation | Update order status |
| `useAssignRider` | mutation | Assign rider to order |
| `useOrderRefund` | mutation | Issue refund |
| `useRides` | query | Rides list |
| `useRidesEnriched` | query | Rides with filters |
| `useUpdateRide` | mutation | Update ride |
| `usePharmacyOrders` | query | Pharmacy orders |
| `useUpdatePharmacyOrder` | mutation | Update pharmacy order |
| `useParcelBookings` | query | Parcel bookings |
| `useUpdateParcelBooking` | mutation | Update parcel status |
| `useCategories` | query | Category list |
| `useProducts` | query | Product list |
| `useCreateProduct` | mutation | Create product |
| `useUpdateProduct` | mutation | Update product |
| `useDeleteProduct` | mutation | Delete product |
| `usePendingProducts` | query | Products awaiting approval |
| `useApproveProduct` | mutation | Approve product |
| `useRejectProduct` | mutation | Reject product |
| `useBroadcast` | mutation | Send broadcast |
| `useBroadcastRecipientCount` | query | Preview recipient count |
| `useTransactions` | query | Wallet transactions |
| `useHealthDashboard` | query | Health status data |
| `useUnlockAdminIpLockout` | mutation | Unlock locked admin IP |
| `usePlatformSettings` | query | Platform settings |
| `useUpdatePlatformSettings` | mutation | Batch update settings |
| `useVendors` | query | Vendor list |
| `useFleetVendors` | query | Fleet-enabled vendors |
| `useUpdateVendorStatus` | mutation | Approve/suspend vendor |
| `useVendorPayout` | mutation | Release vendor payout |
| `useVendorCredit` | mutation | Add vendor credit |
| `useRiders` | query | Rider list |
| `useSearchRiders` | query | Search riders (for assignment) |
| `useUpdateRiderStatus` | mutation | Activate/deactivate rider |
| `useRiderPayout` | mutation | Release rider payout |
| `useRiderBonus` | mutation | Add rider bonus |
| `useRiderPenalties` | query | Rider penalty history |
| `useRiderRatings` | query | Rider rating history |
| `useRestrictRider` | mutation | Add rider restriction |
| `useUnrestrictRider` | mutation | Remove restriction |
| `usePromoCodes` | query | Promo code list |
| `useCreatePromoCode` | mutation | Create promo code |
| `useUpdatePromoCode` | mutation | Update promo code |
| `useDeletePromoCode` | mutation | Delete promo code |
| `useDepositRequests` | query | Deposit request list |

---

---

# J. How to Add a New Admin Module (Step-by-Step)

---

## Step 1 — Create the Page File

```bash
touch artifacts/admin/src/pages/my-module.tsx
```

---

## Step 2 — Write the Page Component

```tsx
// artifacts/admin/src/pages/my-module.tsx
import { useState } from "react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { usePermissions, PermissionGate } from "@/hooks/usePermissions";
import { fetcher } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/useLanguage";
import { tDual } from "@workspace/i18n";
import { PullToRefresh } from "@/components/PullToRefresh";

export default function MyModule() {
  const { language } = useLanguage();
  const T = (key: any) => tDual(key, language);
  const { toast } = useToast();
  const qc = useQueryClient();
  const { has } = usePermissions();

  const { data, isLoading } = useQuery({
    queryKey: ["my-module"],
    queryFn: () => fetcher("/my-module"),
  });

  const mutation = useMutation({
    mutationFn: (input: any) =>
      fetcher("/my-module", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-module"] });
      toast({ title: "Saved" });
    },
  });

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["my-module"] })}>
      <PageHeader title="My Module" description="Description of this module" />
      <Card className="p-6">
        {isLoading ? <div>Loading…</div> : <div>{JSON.stringify(data)}</div>}
        <PermissionGate perm="system.settings.edit">
          <Button onClick={() => mutation.mutate({})}>Save</Button>
        </PermissionGate>
      </Card>
    </PullToRefresh>
  );
}
```

---

## Step 3 — Add Backend Route

```typescript
// artifacts/api-server/src/routes/admin/my-module.ts
import { Router } from "express";
import { adminAuth, addAuditEntry, type AdminRequest } from "../admin-shared.js";
import { requirePermission } from "../../middlewares/require-permission.js";
import { sendSuccess, sendError } from "../../lib/response.js";

const router = Router();
router.use(adminAuth);

router.get("/my-module", requirePermission("system.settings.view"), async (_req, res) => {
  // your logic here
  sendSuccess(res, { items: [] });
});

router.post("/my-module", requirePermission("system.settings.edit"), async (req, res) => {
  const aReq = req as AdminRequest;
  try {
    // your logic here
    addAuditEntry({
      action: "my_module_create",
      adminId: aReq.adminId,
      ip: aReq.adminIp || "unknown",
      details: JSON.stringify(req.body),
      result: "success",
    });
    sendSuccess(res, { ok: true }, undefined, 201);
  } catch (err) {
    sendError(res, (err as Error).message, 400);
  }
});

export default router;
```

---

## Step 4 — Register the Route in admin.ts

```typescript
// artifacts/api-server/src/routes/admin.ts
import myModuleRoutes from "./admin/my-module.js";
// … after all other imports …
router.use(myModuleRoutes);
```

---

## Step 5 — Add to Router in App.tsx

```tsx
// artifacts/admin/src/App.tsx
import MyModule from "@/pages/my-module";
// … inside the <Switch> block …
<Route path="/my-module">
  <ProtectedRoute component={MyModule} requiredPermission="system.settings.view" />
</Route>
```

---

## Step 6 — Add to Sidebar (navConfig.ts)

```typescript
// artifacts/admin/src/lib/navConfig.ts
// Add to the appropriate group's items array:
{ nameKey: "navMyModule" as TranslationKey, href: "/my-module", icon: PackageSearch },
```

---

## Step 7 — Add Description (navConfig.ts)

```typescript
// In NAV_DESCRIPTIONS:
"/my-module": "Description for tooltip and command palette",
```

---

## Step 8 — Add Hook to use-admin.ts (optional)

```typescript
// artifacts/admin/src/hooks/use-admin.ts
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";

export const useMyModule = () =>
  useQuery({ queryKey: ["my-module"], queryFn: () => fetcher("/my-module") });

export const useCreateMyModuleItem = () =>
  useMutation({ mutationFn: (data: any) => fetcher("/my-module", { method: "POST", body: JSON.stringify(data) }) });
```

---

## Step 9 — Add Translation Key (if needed)

```typescript
// lib/i18n/src/strings.ts
navMyModule: { en: "My Module", ur: "میرا ماڈیول", roman: "Mera module" },
```

---

---

# K. Duplicate Pages & How to Consolidate

---

## Problem 1 — 7 Settings Files

| File | Tab It Should Become |
|---|---|
| `settings.tsx` | Container (already done — imports all below) |
| `settings-system.tsx` | Tab 9: System & Performance |
| `settings-security.tsx` | Tab 8: Security & Access |
| `settings-payment.tsx` | Tab 5: Finance & Payments |
| `settings-render.tsx` | Tab 10: Widgets |
| `settings-integrations.tsx` | Tab 7: Integrations |
| `settings-weather.tsx` | Tab 10: Widgets (merged with render) |

**Status:** `settings.tsx` already imports and renders all sub-sections as tabs using the `Top10Key` system. The individual files are sub-components, not separate routes. ✅ Already consolidated.

---

## Problem 2 — Overlapping Paths Between Groups

| Page A | Page B | Overlap |
|---|---|---|
| `/security` (Fleet group) | `/security` (Security Dashboard) | Same route — same page. The Fleet sidebar entry points to the same security page. Rename Fleet sidebar item to "Admin Action Log" pointing to `/audit-logs`. |
| `/promotions` (Finance group) | `/promotions` (Marketing group) | Same route appearing in two sidebar groups — intentional cross-listing, not a bug. |
| `/audit-logs` | `/security` | Partial — Security has an "Audit" tab; `/audit-logs` is standalone. Keep both but clarify naming. |

---

## Problem 3 — Three Messaging Pages

| Page | Should Be |
|---|---|
| `/broadcast` | "Send Broadcast" sub-tab |
| `/notifications` | "Notifications Log" sub-tab |
| `/communication` | "KPI Dashboard" sub-tab |

**Consolidation plan:** Merge into `/communications` with 3 tabs: `Send` / `Log` / `KPIs`

---

## Problem 4 — Account Conditions vs Condition Rules

| Page | Content |
|---|---|
| `/account-conditions` | View accounts with conditions applied + apply/remove |
| `/condition-rules` | Configure the default rules per condition type |

**Status:** These serve different purposes — one is operational (per-account), one is config (global rules). Keep both but rename for clarity:
- `/account-conditions` → "Account Restrictions"
- `/condition-rules` → "Restriction Rule Config"

---

---

# L. Mobile Layout & Command Palette

---

## Mobile Layout

On screens smaller than `md` breakpoint (768px):
- Bottom navigation bar replaces sidebar (Dashboard / Orders / Rides / SOS / More)
- "More" opens `MobileDrawer` — full sidebar in slide-over panel
- Tables automatically switch to card/list view (`OrdersMobileList`)
- `PullToRefresh` component enables gesture-based refresh on all major pages

---

## Command Palette (`CommandPalette.tsx`)

Keyboard shortcut: `Ctrl+K` / `Cmd+K`

- Instant fuzzy-search across all `NAV_ITEMS` (from navConfig.ts)
- Shows route name + one-line description from `NAV_DESCRIPTIONS`
- Recently visited routes shown at top
- Debounce: configurable via `admin_timing_command_palette_debounce_ms` platform setting (default 200ms)
- Supports typing partial route names or descriptions
- Opens in full-screen modal on mobile

---

## Sidebar Features

- **Collapsible to icon-only** (desktop): saves screen space for data tables
- **Pinned favorites**: drag-to-reorder, persisted in `localStorage` key `ajkmart_sidebar_favorites`
- **In-sidebar search**: filter nav items by typing
- **Group collapse/expand**: each group can be collapsed, state persisted in `localStorage`
- **Active route highlight**: accent color pill per group
- **SOS badge**: pulsing red dot on SOS Alerts when active alerts exist
- **Error badge**: amber dot on Error Monitor when unchecked errors exist
- **Version check** (`useVersionCheck`): notifies admin when a new version is deployed

---

## Accessibility Settings (`/accessibility`)

The admin panel has a dedicated accessibility settings page:
- **Font scale**: Small / Medium (default) / Large / Extra Large
- **High contrast mode**: toggle
- Settings applied on boot via `bootAccessibilitySettings()` (before first paint)

---

---

# M. Health Dashboard & Monitoring

**Route:** `/health-dashboard`  
**API:** `GET /api/admin/health-dashboard`  
**Permission:** `system.settings.view`

---

## What It Shows

### Service Status Cards

| Status Indicator | Meaning |
|---|---|
| Green dot (steady) | Service healthy |
| Amber dot (steady) | Warning / degraded |
| Red dot (pulsing) | Error / offline |

Services monitored:
- Database connection
- Redis connection
- API server uptime
- Socket.IO connections active
- Queue depth (pending orders)
- Error rate (last 5 min)

---

## Feature Flag Status

Shows current on/off state of all `feature_*` platform settings in one view.

---

## Alert Config

| Setting | Description |
|---|---|
| `health_monitor_enabled` | Toggle background health monitor |
| `health_alert_email_enabled` | Send email on critical issue |
| `health_alert_slack_enabled` | Send Slack alert on critical issue |

Background monitor (`healthAlertMonitor.ts`):
- Runs as `setInterval` in the API server process
- Checks: DB ping, Redis ping, disk space, memory, error rate
- Deduplicates alerts using in-memory snooze tracking
- Sends email + Slack when threshold breached

---

## IP Lockout Management

Visible in Health Dashboard:
- List of currently locked-out admin IPs
- `useUnlockAdminIpLockout()` → `POST /api/admin/auth/unlock-ip` — manually release lockout

---

---

# N. Security Dashboard — All Tabs

**Route:** `/security`  
**Permission:** `system.settings.view`

The Security page has **8 tabs**:

---

## Tab 1 — Auth & Sessions (`auth`)

- **OTP bypass toggle** — global admin override for testing
- **MFA status** — TOTP enable/disable per admin
- **Login lockout settings** — max attempts, lockout duration
- **Session duration settings** — access token TTL, refresh token TTL
- **Live lockout list** — currently locked phones/IPs with remaining time
  - `GET /api/admin/security/lockouts`
  - `DELETE /api/admin/security/lockouts/:phone` — manually unlock

---

## Tab 2 — Auth Methods (`authmethods`)

Per-role login method toggles:
- Phone OTP, Email OTP, Username/Password, Google, Facebook, Magic Link, TOTP 2FA, Biometric
- Changes call `PATCH /api/admin/auth-methods`

---

## Tab 3 — Rate Limiting (`ratelimit`)

- Login rate limit (req/min/IP)
- OTP rate limit (req/min/phone)
- User API rate limit (req/min/user)
- VPN/TOR blocking toggle
- Suspicious pattern threshold (req/min/IP on sensitive paths)

---

## Tab 4 — GPS & Location (`gps`)

- GPS spoof detection enable/disable
- Max speed threshold (km/h) — flag if rider exceeds this
- Geofence config (delivery service zones)
- `GET /api/admin/security/gps-events` — recent GPS flag events

---

## Tab 5 — Passwords (`passwords`)

- Min password length
- Require uppercase / number / special character
- JWT rotation policy
- Password reset token TTL

---

## Tab 6 — File Uploads (`uploads`)

- Max upload size (MB)
- Allowed file types (csv of extensions)
- Image compression quality
- File scanner enable/disable

---

## Tab 7 — Fraud Detection (`fraud`)

- Fake order detection threshold
- Auto-block IP after N events
- Live IP manager — view blocked IPs, unblock
  - `GET /api/admin/security/blocked-ips`
  - `DELETE /api/admin/security/blocked-ips/:ip`
- Account limits per phone number (max accounts)

---

## Tab 8 — Data Exports (`dataexports`)

Shows the full **data export audit log** (`data_export_logs` table):

| Column | Description |
|---|---|
| User ID | Who requested their data |
| Masked Phone | Phone number with middle digits masked |
| IP Address | Request origin IP |
| Requested At | Timestamp |
| Completed At | When export finished |
| Success | Whether export completed |

Also shows **suspicious pattern events** (from `suspiciousPatternDetector` middleware).

**API Calls:**
- `GET /api/admin/security/data-exports` — paginated list
- `GET /api/admin/security/events` — suspicious pattern events

---

---

# O. Gaps, Bugs & Missing Wiring

---

## O1 — Backend Gaps

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | `/experiments` page has no backend route | HIGH | `experiments.ts` route file exists in admin routes but experiment CRUD endpoints not wired |
| 2 | `POST /api/admin/launch/recommend` — AI recommendation not implemented | MEDIUM | LaunchControl calls this but server may return 404 |
| 3 | No batch settings update validation | MEDIUM | `PATCH /api/admin/platform-settings` accepts any key — no schema validation on setting values |
| 4 | Sentry webhook route not in admin router | MEDIUM | `POST /api/admin/sentry-webhook` exists in routes but may not be mounted |
| 5 | No paginated audit log for non-super admins | LOW | `GET /api/admin/system/audit` may return all records without role check |
| 6 | Wallet transfers page — no dedicated backend endpoint | MEDIUM | `useWalletTransfers` hook may call generic transactions endpoint |

---

## O2 — Frontend Gaps

| # | Issue | Severity | Detail |
|---|---|---|---|
| 1 | `experiments.tsx` — A/B test result tracking not displayed | HIGH | Experiment list shows but no result metrics |
| 2 | `accessibility.tsx` — settings not saved to backend | MEDIUM | Font scale + contrast only persisted in localStorage, not synced to admin profile |
| 3 | `consent-log.tsx` — no export or filter | LOW | Display-only, no CSV export |
| 4 | `flash-deals.tsx` — countdown timer not synced to server time | MEDIUM | Client-side countdown may drift from server expiry |
| 5 | `deep-links.tsx` — no preview / test-open functionality | LOW | Can create links but no test on device |
| 6 | `qr-codes.tsx` — scan validation flow not shown | MEDIUM | QR generation present, no scan tracking |
| 7 | `broadcast.tsx` — no delivery status tracking | MEDIUM | Sent count shown, but no delivered/failed breakdown |
| 8 | `whatsapp-delivery-log.tsx` — may not have backend data | MEDIUM | Depends on WhatsApp provider webhook integration |
| 9 | No global "Unsaved changes" warning | LOW | Navigating away from settings mid-edit loses changes silently |
| 10 | `CommandPalette` — no keyboard shortcut hint on first open | LOW | UX: users don't know Ctrl+K exists |

---

## O3 — Security Gaps (Admin-Specific)

| # | Issue | Severity |
|---|---|---|
| 1 | No TOTP enforcement for destructive admin actions | HIGH |
| 2 | Admin password reset token not invalidated on use | HIGH |
| 3 | No brute-force lockout on admin password reset endpoint | MEDIUM |
| 4 | `FirstLoginCredentialsDialog` is skippable — default creds kept indefinitely | MEDIUM |
| 5 | Audit log does not capture read-only access (only mutations) | LOW |

---

*— End of AJKMart Admin Panel Documentation —*

> Last updated: 2025 | Admin Panel: React 19 + Vite + Wouter + TanStack Query
> Related: see `ajkmart.md` for full monorepo docs, `ajkmart-customer-app.md` for customer app
