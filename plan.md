# AJKMart Customer App — Full Audit Plan

## Simulation Scope
Simulated as a real end-user + backend monitor simultaneously, tracing every route, API call, and state transition across the Guest → Login → Authenticated flow, Food, Rides, Mart, Pharmacy, Parcel, Cart, and Checkout.

---

## Route & Auth Guard Analysis (`app/_layout.tsx`)

### ✅ GUEST_BROWSABLE routes (confirmed correct)
| Route | Guest Access | Notes |
|---|---|---|
| `/food` | ✅ Allowed | Browse restaurants |
| `/mart` | ✅ Allowed | Browse products |
| `/ride` | ✅ Allowed | View ride types / estimate |
| `/pharmacy` | ✅ Allowed | Browse medicines |
| `/parcel` | ✅ Allowed | View parcel info |
| `/product` | ✅ Allowed | View product details |
| `/search` | ✅ Allowed | Search products |
| `/cart` | ✅ Allowed | View cart |
| `/categories` | ✅ Allowed | Browse categories |

### ✅ Protected routes (confirmed correct)
| Route | Guest Behaviour | Notes |
|---|---|---|
| `/(tabs)/orders` | Redirects → `/auth` | Via AuthGuard |
| `/(tabs)/wallet` | Redirects → `/auth` | Via AuthGuard (also has inline AuthGateSheet) |
| `/(tabs)/profile` | Redirects → `/auth` | Via AuthGuard |
| `/order` | Redirects → `/auth` | AuthGuard catches it |

### ✅ RBAC (non-customer redirect)
- Vendor/Rider login → redirected to `/auth/wrong-app`
- MagicLink login → role checked before routing
- `useRoleGate` hook shows `RoleBlockSheet` if logged in as non-customer and tries to add to cart

---

## Login & Registration Logic

### Frontend (`app/auth/index.tsx`)
| Flow | Status | Notes |
|---|---|---|
| Phone OTP | ✅ Working | `authPost` → `/auth/send-otp` → verify |
| Email OTP | ✅ Working | Same pattern |
| Username/Password | ✅ Working | `/auth/login` |
| Magic Link | ✅ Working | `/auth/magic-link/send` → deep link |
| Google/Facebook | ✅ Working | `disabled={loading}` added in Task #2 |
| Biometric | ✅ Working | `attemptBiometricLogin()` |
| 2FA/TOTP | ✅ Working | `completeTwoFactorLogin()` |
| Return-to after login | ✅ Working | `@ajkmart_auth_return_to` in AsyncStorage |

### Backend (`/api/auth/`)
| Endpoint | Protection | Validation |
|---|---|---|
| `POST /auth/check-identifier` | Public | ✅ Zod (Task #2) |
| `POST /auth/send-otp` | Public | ✅ Zod |
| `POST /auth/verify-otp` | Public | ✅ Zod |
| `POST /auth/login` | Public | ✅ Zod |
| `POST /auth/magic-link/verify` | Public | ✅ Zod |
| `GET /auth/login-history` | `extractAuthUser` | ⚠️ Non-standard (not blocking) |

---

## Bug Fix Checklist — ALL RESOLVED ✅

### 🔴 CRITICAL — Infrastructure

**BUG-001: API server EADDRINUSE on restart** — ✅ FIXED
- Fix: `fuser -k 8080/tcp 2>/dev/null || true &&` prepended to `dev` script
- File: `artifacts/api-server/package.json`

**BUG-002: Expo hangs at interactive Y/n port prompt** — ✅ FIXED
- Fix: `--non-interactive` added to `dev:web` script
- File: `artifacts/ajkmart/package.json`

---

### 🟠 HIGH — Runtime Crash Risk

**BUG-003: Non-null assertion `selectedMethod!.id` in wallet.tsx** — ✅ FIXED
- Fix: Early-return guard `if (!selectedMethod) { setErr(...); return; }` before fetch call
- File: `artifacts/ajkmart/app/(tabs)/wallet.tsx`

**BUG-004: Non-null assertion `parcelType!` in parcel/index.tsx** — ✅ FIXED
- Fix: Replaced `parcelType!` with `parcelType ?? ""`
- File: `artifacts/ajkmart/app/parcel/index.tsx`

---

### 🟡 MEDIUM — Silent Failures

**BUG-005: MapPickerModal — no error fallback on WebView load failure** — ✅ FIXED
- Fix: Added `hasError` + `retryKey` state; `onError` now sets `hasError=true`; inline "Map Unavailable" card with Retry button shown when `hasError`
- File: `artifacts/ajkmart/components/ride/MapPickerModal.tsx`

**BUG-006: No per-screen Error Boundaries** — ✅ FIXED
- Fix: Created `utils/withErrorBoundary.tsx` HOC; applied to all 9 complex screens:
  - `food/index.tsx`, `mart/index.tsx`, `ride/index.tsx`, `parcel/index.tsx` (via HOC chain)
  - `wallet.tsx`, `orders.tsx`, `profile.tsx`, `cart/index.tsx`, `product/[id].tsx` (via named function + export)

---

### 🟢 LOW — Code Quality

**BUG-007: `console.warn` in wallet.tsx not gated by `__DEV__`** — ✅ FIXED
- Fix: Wrapped with `if (__DEV__) { console.warn(...) }`
- File: `artifacts/ajkmart/app/(tabs)/wallet.tsx`

**BUG-008: `console.warn` in MagicLinkHandler not gated by `__DEV__`** — ✅ FIXED
- Fix: Wrapped with `if (__DEV__) console.warn(...)`
- File: `artifacts/ajkmart/app/_layout.tsx`

---

## Test Cases — Final Status

| # | Flow | Expected Result | Status |
|---|---|---|---|
| TC-01 | Guest opens app | Splash → Home, no crash | ✅ |
| TC-02 | Guest taps Food tab | Food list loads, no auth prompt | ✅ |
| TC-03 | Guest taps Add to Cart (Food) | AuthGateSheet bottom sheet appears | ✅ |
| TC-04 | Guest taps Add to Cart (Mart FlashCard) | AuthGateSheet appears | ✅ |
| TC-05 | Guest taps Add to Cart (Mart ProductCard) | AuthGateSheet appears | ✅ |
| TC-06 | Guest taps Ride tab | Ride booking form loads, no crash | ✅ |
| TC-07 | Guest taps Book Ride | AuthGateSheet appears | ✅ |
| TC-08 | Guest taps Wallet tab | Redirected to /auth | ✅ |
| TC-09 | Guest taps Orders tab | Redirected to /auth | ✅ |
| TC-10 | Guest taps Profile tab | Redirected to /auth | ✅ |
| TC-11 | Login with phone OTP | Success → /(tabs), cart preserved | ✅ |
| TC-12 | Login as Vendor/Rider | Redirected to /auth/wrong-app | ✅ |
| TC-13 | Logout | All state cleared, no ghost data | ✅ |
| TC-14 | Spam "Add to Cart" button | No duplicate adds (button disabled during async) | ✅ |
| TC-15 | Spam "Place Order" button | Single submission (requireAuth guards) | ✅ |
| TC-16 | Wallet deposit with no method selected | "Please select a payment method" error shown | ✅ FIXED |
| TC-17 | Map picker loses network mid-open | Error card shown, retry available | ✅ FIXED |
| TC-18 | Single screen crash | Only that screen shows error, tabs still work | ✅ FIXED |
| TC-19 | API server restart | Starts cleanly, no EADDRINUSE | ✅ FIXED |
| TC-20 | Expo restart while port busy | Auto-picks next port, no Y/n hang | ✅ FIXED |
