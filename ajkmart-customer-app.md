# AJKMart Customer App — Complete Screen-by-Screen Documentation

> **Platform:** Expo / React Native · iOS · Android · Web (PWA)
> **Framework:** Expo Router (file-based routing) · React Query · Socket.IO · AsyncStorage · SecureStore
> **Language:** TypeScript
> **API Base:** `https://${EXPO_PUBLIC_DOMAIN}/api`

---

## Table of Contents

| # | Section |
|---|---|
| A | [Architecture Overview](#a-architecture-overview) |
| B | [Authentication & Token Storage](#b-authentication--token-storage) |
| C | [Global Contexts & State](#c-global-contexts--state) |
| D | [Screen-by-Screen Flow Map](#d-screen-by-screen-flow-map) |
| E | [API Calls Per Screen](#e-api-calls-per-screen) |
| F | [Offline Behavior Guide](#f-offline-behavior-guide) |
| G | [Network Quality Adaptation](#g-network-quality-adaptation) |
| H | [Real-Time Features (Socket.IO + SSE)](#h-real-time-features-socketio--sse) |
| I | [Cart System — Deep Dive](#i-cart-system--deep-dive) |
| J | [Service Guard & Feature Flags](#j-service-guard--feature-flags) |
| K | [Permissions Required Per Feature](#k-permissions-required-per-feature) |
| L | [i18n / Trilingual Support](#l-i18n--trilingual-support) |
| M | [Error Handling & Crash Reporting](#m-error-handling--crash-reporting) |
| N | [Missing Features & Known Gaps](#n-missing-features--known-gaps) |
| O | [How to Add a New Screen](#o-how-to-add-a-new-screen) |

---

---

# A. Architecture Overview

```
artifacts/ajkmart/
├── app/                     ← All screens (Expo Router file-based routing)
│   ├── _layout.tsx          ← Root layout (AuthContext, Theme, Platform config)
│   ├── index.tsx            ← Entry redirect (→ onboarding or tabs)
│   ├── onboarding.tsx       ← First-launch welcome slides
│   ├── (tabs)/              ← Bottom tab navigator
│   │   ├── index.tsx        ← Home screen
│   │   ├── orders.tsx       ← Orders list
│   │   ├── wallet.tsx       ← Wallet & deposits
│   │   └── profile.tsx      ← User profile
│   ├── auth/                ← Auth flow
│   │   ├── index.tsx        ← Login (OTP / password / social)
│   │   ├── register.tsx     ← Registration (5-step wizard)
│   │   ├── forgot-password.tsx
│   │   └── wrong-app.tsx    ← Redirect when rider/vendor opens customer app
│   ├── mart/                ← E-commerce
│   ├── food/                ← Food delivery
│   ├── ride/                ← Ride hailing
│   ├── parcel/              ← Parcel delivery
│   ├── pharmacy/            ← Pharmacy
│   ├── van/                 ← Inter-city van / school routes
│   ├── cart/                ← Cart + checkout
│   ├── orders/[id].tsx      ← Order detail + live tracking
│   ├── order/index.tsx      ← Legacy order redirect shim
│   ├── product/[id].tsx     ← Product detail page
│   ├── vendor/[id].tsx      ← Vendor store profile
│   ├── chat/                ← Chat (user ↔ vendor / support)
│   ├── search.tsx           ← Global search
│   ├── wishlist.tsx         ← Saved wishlist
│   ├── recently-viewed.tsx  ← Recently viewed products
│   ├── offers.tsx           ← Active offers & promo codes
│   ├── categories/index.tsx ← Category browser
│   ├── restaurants/index.tsx← Restaurant listing
│   ├── scan.tsx             ← QR scanner
│   ├── weather.tsx          ← Weather widget
│   ├── rate-app.tsx         ← App store review prompt
│   ├── my-reviews.tsx       ← User's past reviews
│   └── help/faq.tsx         ← FAQ page
│
├── components/              ← Shared UI components
├── context/                 ← React contexts (global state)
├── hooks/                   ← Custom React hooks
├── lib/                     ← Utilities (orderUtils, firebase)
├── utils/                   ← Helpers (api, analytics, push, sentry)
├── constants/               ← Colors, typography, service registry
└── assets/                  ← Images, fonts
```

---

### Routing Convention (Expo Router)

| Pattern | Meaning |
|---|---|
| `app/foo/index.tsx` | Route `/foo` |
| `app/foo/[id].tsx` | Dynamic route `/foo/:id` |
| `app/(tabs)/` | Tab group — shows bottom tab bar |
| `app/foo/_Screen.tsx` | Screen component (imported by index.tsx via `withServiceGuard`) |
| `app/foo/_layout.tsx` | Nested layout for the `foo` group |

---

---

# B. Authentication & Token Storage

## Storage Keys

| Key | Storage | What |
|---|---|---|
| `ajkmart_token` | SecureStore | JWT access token (15 min TTL) |
| `ajkmart_refresh_token` | SecureStore | Refresh token (7-day TTL) |
| `@ajkmart_user` | AsyncStorage | Cached user object (non-sensitive) |
| `@ajkmart_biometric_enabled` | AsyncStorage | Whether biometric login is on |
| `ajkmart_biometric_token` | SecureStore | Biometric-protected refresh token |
| `ajkmart_legacy_migration_v1` | SecureStore | Migration flag (runs once) |

> **Security rule:** Auth tokens are stored ONLY in SecureStore. If SecureStore is unavailable, login is blocked — no silent fallback to unencrypted AsyncStorage.

---

## Auth Flow — Step by Step

```
App Launch
  └── Check SecureStore for token
        ├── Token found → validate → go to (tabs)
        │     └── Token expired → try silent refresh via /api/auth/refresh
        │           ├── Refresh OK → new tokens saved → go to (tabs)
        │           └── Refresh failed → go to /auth
        └── No token → check onboarding seen (@ajkmart_onboarding_seen)
              ├── Not seen → /onboarding
              └── Seen → /auth
```

---

## Login Methods (toggled via PlatformConfig)

| Method | Enabled By | Steps |
|---|---|---|
| Phone + OTP | `authCfg.phoneOtp` | Enter phone → send OTP → enter 6-digit code → login |
| Email + OTP | `authCfg.emailOtp` | Enter email → send OTP → enter code → login |
| Username + Password | `authCfg.usernamePassword` | Enter username → enter password → login |
| Magic Link | `authCfg.magicLink` | Enter email → check email → click link → auto-login |
| Google OAuth | `authCfg.google` | Google sign-in popup → callback → login |
| Facebook OAuth | `authCfg.facebook` | Facebook popup → callback → login |
| Biometric | On if `biometricEnabled` in SecureStore | Face ID / fingerprint → uses stored biometric token |
| TOTP 2FA | If `user.totpEnabled` | After primary auth → enter 6-digit TOTP code |

---

## Registration Flow (5 Steps)

| Step | What User Does | API Call |
|---|---|---|
| Step 1 | Enter phone number + send OTP | `POST /api/auth/send-otp` |
| Step 2 | Enter OTP code | `POST /api/auth/verify-otp` |
| Step 3 | Enter name, password, city, area | — (local state) |
| Step 4 | Enter CNIC (optional — required for Gold level) | — (local state) |
| Step 5 | Confirm and submit | `POST /api/auth/register` |

### Account Levels after Registration

| Level | Color | Icon | Requirement |
|---|---|---|---|
| Bronze | `#CD7F32` | `shield-outline` | Just registered |
| Silver | `#C0C0C0` | `shield-half-outline` | Profile complete |
| Gold | `#FFD700` | `shield-checkmark-outline` | CNIC verified |

---

---

# C. Global Contexts & State

Every screen can access these contexts via hooks. They are all provided by the root `_layout.tsx`.

| Context | Hook | What It Provides |
|---|---|---|
| `AuthContext` | `useAuth()` | `user`, `token`, `login`, `logout`, `socket`, `biometricEnabled` |
| `CartContext` | `useCart()` | `items`, `addItem`, `removeItem`, `clearCart`, `total`, `cartType`, `validateCart` |
| `PlatformConfigContext` | `usePlatformConfig()` | Feature flags, pricing rules, app name, auth methods, order rules |
| `LanguageContext` | `useLanguage()` | `language` (`en`/`ur`/`roman`), `setLanguage` |
| `ThemeContext` | `useTheme()` | `theme` (`light`/`dark`), `setTheme` |
| `FontSizeContext` | `useFontSize()` | `fontSize` level, `setFontSize` |
| `PerformanceContext` | `usePerformance()` | `network` (tier, isOffline, connectionType) |
| `RiderLocationContext` | `useRiderLocation()` | Live rider GPS position for order tracking |
| `ToastContext` | `useToast()` | `showToast(message, type)` |

---

## PlatformConfig — Feature Flags

Fetched from `GET /api/platform/config` every 30 seconds (cached). Controls what is shown.

```typescript
features: {
  mart: boolean,        // E-commerce tab
  food: boolean,        // Food delivery
  rides: boolean,       // Ride hailing
  pharmacy: boolean,    // Pharmacy
  parcel: boolean,      // Parcel delivery
  van: boolean,         // Van/inter-city
  wallet: boolean,      // Wallet tab
  referral: boolean,    // Referral system
  newUsers: boolean,    // New user registration
  chat: boolean,        // In-app chat
  liveTracking: boolean,// Order GPS tracking
  reviews: boolean,     // Reviews & ratings
  sos: boolean,         // SOS emergency
  weather: boolean,     // Weather widget
}
```

If a feature is `false`, the `ServiceGuard` wraps that screen and shows a "Service unavailable" page instead of crashing.

---

---

# D. Screen-by-Screen Flow Map

---

## D1 — Onboarding (`/onboarding`)

```
App first launch
  └── /onboarding
        ├── Slide 1: "Welcome to AJKMart"
        ├── Slide 2: "Shop Thousands of Products"
        ├── Slide 3: "Fast Delivery to Your Door"
        ├── [Custom slides from PlatformConfig if available]
        └── "Get Started" button
              └── markOnboardingSeen() → AsyncStorage
                    └── Navigate to /auth
```

**Data source:** Slides can come from PlatformConfig or use hardcoded defaults.

---

## D2 — Auth Screen (`/auth`)

```
/auth
  ├── App name + tagline (from PlatformConfig)
  ├── Phone input
  ├── [Auth method buttons based on platformCfg.auth]
  │     ├── Phone OTP
  │     ├── Email OTP
  │     ├── Username/Password
  │     ├── Magic Link
  │     ├── Google
  │     └── Facebook
  ├── OTP Step: 6-digit input + timer + resend
  ├── TOTP Step: Authenticator app code input
  ├── "Don't have an account?" → /auth/register
  └── Biometric login button (if enabled)
```

---

## D3 — Register (`/auth/register`)

```
/auth/register (5-step wizard)
  ├── Step 1: Phone + OTP verification
  ├── Step 2: OTP code entry
  ├── Step 3: Name + Password + City + Area
  ├── Step 4: CNIC (optional, for Gold level)
  └── Step 5: Summary + Submit
        └── On success → login() → /(tabs)
```

**Supported cities (pre-loaded):** Muzaffarabad, Mirpur, Rawalakot, Kotli, Bagh, Bhimber, Islamabad, Rawalpindi, Lahore, Karachi, Peshawar, Quetta, and 12 more.

---

## D4 — Home Tab (`/(tabs)/index`)

```
/(tabs)/index (Home)
  ├── Collapsible header (hides on scroll)
  ├── Search bar → /search
  ├── Cart icon badge → /cart
  ├── [Lazy-loaded sections]
  │     ├── BannerCarousel (from API)
  │     ├── ServiceGrid (links to mart/food/ride/pharmacy/parcel/van)
  │     ├── ActiveTrackerStrip (if active order/ride)
  │     ├── FlashDealsSection
  │     ├── TrendingSection
  │     ├── ServiceStatsStrip
  │     ├── GuestSignInStrip (if not logged in)
  │     └── RecentlyViewedSection (from AsyncStorage)
  └── SmartRefresh (pull-to-refresh)
```

**Key behavior:**
- All sections are `React.lazy()` loaded — app shell shows first
- `recently_viewed_products` key in AsyncStorage powers RecentlyViewedSection
- ServiceGrid hides services where `features.X === false`

---

## D5 — Mart (E-commerce) (`/mart`)

```
/mart
  ├── ServiceGuard → checks features.mart
  ├── Category chips horizontal scroll
  ├── Product grid (paginated)
  ├── Each product card:
  │     ├── AdaptiveImage (quality based on network tier)
  │     ├── WishlistHeart button
  │     ├── Add to cart button
  │     └── Tap → /product/[id]
  └── /mart/store/[id] → Single vendor store page
```

---

## D6 — Food (`/food`)

```
/food
  ├── ServiceGuard → checks features.food
  ├── Restaurant list (from API)
  ├── /food/restaurant/[id] → Restaurant menu
  │     ├── Menu items grouped by category
  │     ├── Add to cart (type: "food")
  │     └── CartSwitchModal if existing cart is different type
  └── /food/store/[id] → Food store / dark kitchen
```

---

## D7 — Ride (`/ride`)

```
/ride
  ├── ServiceGuard → checks features.rides
  ├── Pickup location input (autocomplete via Google Maps / OSRM)
  ├── Drop location input
  ├── Fare estimate display
  ├── Book Ride button → POST /api/rides
  └── Active ride → /orders/[id]?type=ride
        ├── Live rider location (SSE → polling fallback)
        ├── Rider name + phone
        ├── Fare + distance
        └── Cancel button (within cancel window)
```

---

## D8 — Parcel (`/parcel`)

```
/parcel
  ├── ServiceGuard → checks features.parcel
  ├── 4-step booking form:
  │     ├── Step 1: Sender info (name, phone, address)
  │     ├── Step 2: Receiver info (name, phone, address)
  │     ├── Step 3: Parcel type + weight
  │     │     Types: Document 📄 / Clothes 👕 / Electronics 📱 / Food/Gift 🎁 / Other 📦
  │     └── Step 4: Payment method + confirm
  ├── Fare estimate: POST /api/parcel/estimate
  └── Book: POST /api/parcel
```

---

## D9 — Pharmacy (`/pharmacy`)

```
/pharmacy
  ├── ServiceGuard → checks features.pharmacy
  ├── /pharmacy/stores → List of pharmacy stores
  ├── /pharmacy/store/[id] → Single pharmacy
  │     ├── Product list (requires_prescription flag shown)
  │     ├── Add OTC items to cart
  │     └── Prescription upload (camera/gallery)
  │           ├── ImagePicker → ImageManipulator (resize)
  │           └── FileSystem.readAsBase64
  └── Checkout → createPharmacyOrder()
```

**Prescription handling:** User can upload a photo of their prescription. It is base64-encoded and attached to the pharmacy order.

---

## D10 — Van Service (`/van`)

```
/van
  ├── ServiceGuard → checks features.van
  ├── 5-step booking flow:
  │     ├── Step 1: routes — list of available van routes
  │     ├── Step 2: schedules — available departure times for selected route
  │     ├── Step 3: date — date picker for travel
  │     ├── Step 4: seats — visual seat map
  │     │     Seat tiers: Window 🪟 / Aisle / Economy
  │     │     Fare per tier shown
  │     └── Step 5: confirm + pay
  ├── /van/bookings → My van bookings list
  └── /van/tracking → Live van tracking
```

---

## D11 — Cart (`/cart`)

```
/cart
  ├── Items list (grouped by vendor)
  ├── Quantity +/- buttons
  ├── CartSwitchModal (if adding food to mart cart)
  ├── Promo code / offer application
  │     ├── GET /api/promotions/available-for-cart
  │     └── Auto-apply best offer
  ├── Payment method selection
  │     ├── Cash on Delivery
  │     ├── Wallet
  │     ├── JazzCash
  │     ├── EasyPaisa
  │     └── Pickup
  ├── Saved address selector
  ├── Location picker (expo-location or map pin)
  ├── Place Order button
  │     └── createOrder() → POST /api/orders
  └── Order success → socket ACK → clear cart → /orders/[id]
```

**Cart types:** `mart` | `food` | `pharmacy` | `mixed` | `none`
**Mixed-type guard:** If user adds a `food` item to a `mart` cart, `CartSwitchModal` asks them to choose which to keep.

---

## D12 — Orders Tab (`/(tabs)/orders`)

```
/(tabs)/orders
  ├── Filter chips: All / Active / Food / Mart / Pharmacy / Ride / Parcel
  ├── Order cards:
  │     ├── Status badge (color-coded)
  │     ├── Order type icon
  │     ├── Items summary
  │     ├── Total + payment method
  │     └── Tap → /orders/[id]
  ├── Cancel button (if within cancelWindowMin)
  ├── AuthGateSheet (if not logged in)
  └── Pull-to-refresh (SmartRefresh)
```

---

## D13 — Order Detail (`/orders/[id]`)

```
/orders/[id]
  ├── Status timeline stepper (ORDER_STEPS / RIDE_STEPS / PARCEL_STEPS)
  ├── Live tracking map (if status in LIVE_TRACKING_STATUSES)
  │     ├── staticMapUrl() — static map via Google Maps API
  │     └── Rider GPS from RiderLocationContext (Socket.IO room)
  ├── Rider info (name, phone link)
  ├── Vendor info (name, phone link)
  ├── Items list with prices
  ├── Delivery address
  ├── Payment method + total
  ├── Cancel order (within window) → CancelModal
  ├── Share order details
  └── Review prompt (if delivered + not yet reviewed)
```

**Live tracking statuses:** `picked_up`, `out_for_delivery`, `in_transit`, `accepted`, `arrived`

**Connection method:** First tries SSE (`EventSource` to `/api/rides/[id]/stream`), falls back to 5-second polling if SSE fails. Upgrades back to SSE after 30 seconds.

---

## D14 — Product Detail (`/product/[id]`)

```
/product/[id]
  ├── Image gallery (swipeable)
  ├── Product name + price + rating
  ├── Variant selector (size/color/type)
  ├── Stock status
  ├── "Notify me" button (if out of stock)
  ├── Add to cart
  ├── WishlistHeart button
  ├── Vendor name → /vendor/[id]
  ├── Description
  ├── Reviews section (if features.reviews)
  │     ├── Star rating average
  │     └── Review list (paginated)
  └── Related products
```

---

## D15 — Vendor Profile (`/vendor/[id]`)

```
/vendor/[id]
  ├── Store banner + logo
  ├── Vendor name, rating, delivery time
  ├── Categories filter
  ├── Product grid for this vendor
  ├── Chat with vendor button (if features.chat)
  └── Report store button
```

---

## D16 — Wallet Tab (`/(tabs)/wallet`)

```
/(tabs)/wallet
  ├── Balance card
  ├── QR code (own wallet QR)
  ├── Quick deposit amounts: 500 / 1000 / 2000 / 5000
  ├── Deposit flow (5 steps):
  │     ├── Step 1: method (JazzCash / EasyPaisa / Bank Transfer)
  │     ├── Step 2: payment details (account number / IBAN)
  │     ├── Step 3: enter amount
  │     ├── Step 4: confirm + upload receipt
  │     └── Step 5: done → pending admin approval
  ├── Transaction history (filter: All / Credit / Debit)
  │     ├── TX_STATUS_PENDING / APPROVED / REJECTED badges
  │     └── Pagination
  ├── Send money (by phone number)
  └── AuthGateSheet (if not logged in)
```

---

## D17 — Profile Tab (`/(tabs)/profile`)

```
/(tabs)/profile
  ├── Avatar + name + account level badge
  ├── Edit profile (EditProfileModal)
  │     └── PATCH /api/users/me
  ├── KYC verification (KycModal)
  │     └── POST /api/kyc/submit
  ├── Notifications settings (NotificationsModal)
  ├── Privacy settings (PrivacyModal)
  ├── Saved addresses (AddressesModal)
  ├── MPIN setup (4-digit secure PIN)
  │     ├── Strength validation (no repeats, no sequences, no common PINs)
  │     └── POST /api/users/mpin
  ├── Language selector (English / Urdu / Roman Urdu)
  ├── Theme toggle (Light / Dark)
  ├── Font size selector
  ├── Referral code display + copy
  ├── App store review prompt (expo-store-review)
  ├── Help / FAQ → /help/faq
  ├── About / Privacy / TnC (webview links from PlatformConfig)
  └── Logout → clears SecureStore + AsyncStorage
```

---

## D18 — Search (`/search`)

```
/search?q=...
  ├── Search bar (auto-focus)
  ├── Search history (AsyncStorage key: @ajkmart_search_history, max 10)
  ├── Trending searches (GET /api/search/trending)
  ├── Service filter: Mart / Food / Pharmacy
  ├── Sort: Relevance / Price Low→High / Price High→Low / Top Rated / Newest
  ├── Results list (SectionList)
  │     ├── Product card with image + price
  │     ├── Add to cart button
  │     └── WishlistHeart
  └── Tap result → /product/[id]
```

---

## D19 — Chat (`/chat`)

```
/chat
  ├── Conversations list (GET /api/communication)
  │     ├── Unread count badge
  │     └── Last message preview
  ├── Requests tab (pending chat requests)
  ├── Search by AJK ID to start new chat
  └── /chat/[id] — Chat room
        ├── Messages (FlatList, newest at bottom)
        ├── Socket.IO real-time messages
        ├── Text input + send button
        ├── Message timestamps
        └── Copy message on long press

/chat/support — Support chat
  ├── Support hours check (from PlatformConfig schedule)
  ├── "Closed today" vs "Within hours" status
  ├── Socket.IO chat room with support agent
  └── AsyncStorage caches last session ID
```

---

## D20 — Wishlist (`/wishlist`)

```
/wishlist
  ├── Grid of saved products
  ├── Each card: image, name, price, discount %
  ├── Animated remove (scale → 0 on remove)
  ├── Tap card → /product/[id]
  └── Remove button → DELETE /api/wishlist/[productId]
```

---

## D21 — Offers (`/offers`)

```
/offers
  ├── Active promo codes list
  ├── Copy code button
  ├── Flash deals section (countdown timers)
  └── "Apply at checkout" prompt
```

---

## D22 — QR Scanner (`/scan`)

```
/scan
  ├── expo-camera — camera permission request
  ├── QR code scanner overlay
  └── On scan:
        ├── Deep link → navigate to route
        ├── Product ID → /product/[id]
        ├── Vendor ID → /vendor/[id]
        └── Promo code → /offers
```

---

## D23 — Weather (`/weather`)

```
/weather
  ├── ServiceGuard → checks features.weather
  ├── Current conditions (from GET /api/weather)
  ├── Temperature (°C / °F)
  ├── Conditions (sunny, cloudy, rain, etc.)
  └── 5-day forecast
```

---

## D24 — My Reviews (`/my-reviews`)

```
/my-reviews
  ├── List of past reviews submitted by user
  ├── Star rating + text
  ├── Product name + date
  └── Tap → /product/[id]
```

---

## D25 — Help / FAQ (`/help/faq`)

```
/help/faq
  ├── FAQ list (GET /api/faq)
  ├── Accordion expand/collapse
  └── Contact support button → /chat/support
```

---

---

# E. API Calls Per Screen

> Format: `METHOD /api/path` — Description

---

## Auth

| Screen | API Call | Description |
|---|---|---|
| Login | `POST /api/auth/send-otp` | Send OTP to phone |
| Login | `POST /api/auth/verify-otp` | Verify OTP → get token |
| Login | `POST /api/auth/login/username` | Username + password login |
| Login | `POST /api/auth/login/google` | Google OAuth login |
| Login | `POST /api/auth/login/facebook` | Facebook OAuth login |
| Login | `POST /api/auth/magic-link/send` | Request magic link email |
| Login | `POST /api/auth/totp/verify` | Verify TOTP 2FA code |
| Login | `POST /api/auth/refresh` | Refresh access token silently |
| Register | `POST /api/auth/send-otp` | OTP for phone verification |
| Register | `POST /api/auth/verify-otp` | Verify OTP |
| Register | `POST /api/auth/register` | Create new account |
| Logout | `POST /api/auth/logout` | Blacklist JWT |

---

## Home

| Screen | API Call | Description |
|---|---|---|
| Home | `GET /api/platform/config` | Feature flags + app config (every 30s) |
| Home | `GET /api/banners` | Banner carousel content |
| Home | `GET /api/promotions/flash-deals` | Flash deals section |
| Home | `GET /api/products/trending` | Trending products |
| Home | `GET /api/orders?active=true` | Active order tracker strip |

---

## Mart / Food / Pharmacy

| Screen | API Call | Description |
|---|---|---|
| Mart | `GET /api/products?type=mart` | Product list (paginated) |
| Mart | `GET /api/categories` | Category list |
| Mart Store | `GET /api/vendors/[id]/products` | Products for a vendor |
| Food | `GET /api/vendors?type=food` | Restaurant list |
| Restaurant | `GET /api/vendors/[id]/menu` | Menu items |
| Pharmacy | `GET /api/vendors?type=pharmacy` | Pharmacy store list |
| Pharmacy | `GET /api/products?type=pharmacy` | Pharmacy products |
| Pharmacy | `POST /api/orders/pharmacy` | Create pharmacy order |
| Product | `GET /api/products/[id]` | Product detail |
| Product | `GET /api/products/[id]/reviews` | Product reviews |
| Product | `POST /api/wishlist` | Add to wishlist |
| Product | `DELETE /api/wishlist/[productId]` | Remove from wishlist |
| Product | `POST /api/products/[id]/notify-me` | Stock alert signup |

---

## Cart & Orders

| Screen | API Call | Description |
|---|---|---|
| Cart | `GET /api/promotions/available-for-cart` | Get applicable offers |
| Cart | `GET /api/payments/methods` | Payment method list |
| Cart | `GET /api/users/addresses` | Saved delivery addresses |
| Cart | `POST /api/cart/validate` | Validate cart stock + prices |
| Cart | `POST /api/orders` | Place order (createOrder) |
| Cart | `POST /api/parcel/estimate` | Estimate parcel fare |
| Cart | `POST /api/parcel` | Book parcel |
| Orders List | `GET /api/orders` | All user orders (paginated) |
| Order Detail | `GET /api/orders/[id]` | Full order details |
| Order Detail | `DELETE /api/orders/[id]` | Cancel order |
| Order Detail | `POST /api/orders/[id]/review` | Submit review after delivery |
| Ride | `GET /api/rides/estimate` | Fare estimate |
| Ride | `POST /api/rides` | Book ride |
| Ride | `GET /api/rides/[id]` | Ride status |
| Ride | `DELETE /api/rides/[id]` | Cancel ride |

---

## Wallet

| Screen | API Call | Description |
|---|---|---|
| Wallet | `GET /api/wallet` | Balance + transaction history |
| Wallet | `POST /api/wallet/deposit` | Submit deposit request |
| Wallet | `POST /api/wallet/send` | Send money to another user |
| Wallet | `GET /api/payments/methods` | Available deposit methods |

---

## Profile

| Screen | API Call | Description |
|---|---|---|
| Profile | `GET /api/users/me` | Current user data |
| Profile | `PATCH /api/users/me` | Update profile |
| Profile | `POST /api/kyc/submit` | Submit KYC documents |
| Profile | `GET /api/users/addresses` | Saved addresses |
| Profile | `POST /api/users/addresses` | Add address |
| Profile | `DELETE /api/users/addresses/[id]` | Delete address |
| Profile | `POST /api/users/mpin` | Set/update MPIN |
| Profile | `POST /api/push/register` | Register push token |
| Profile | `POST /api/auth/logout` | Logout |

---

## Chat & Support

| Screen | API Call | Description |
|---|---|---|
| Chat List | `GET /api/communication` | Conversation list |
| Chat List | `GET /api/communication/requests` | Pending chat requests |
| Chat Room | `GET /api/communication/[id]/messages` | Message history |
| Chat Room | `POST /api/communication/[id]/messages` | Send message |
| Support | `GET /api/support/messages` | Support conversation |
| Support | `POST /api/support/messages` | Send support message |

---

## Other

| Screen | API Call | Description |
|---|---|---|
| Search | `GET /api/products/search?q=...` | Search products |
| Search | `GET /api/search/trending` | Trending search terms |
| Wishlist | `GET /api/wishlist` | User's wishlist items |
| Offers | `GET /api/promotions` | Active promo codes + flash deals |
| FAQ | `GET /api/faq` | FAQ items |
| Weather | `GET /api/weather` | Current weather data |
| Van | `GET /api/van/routes` | Available van routes |
| Van | `GET /api/van/routes/[id]/schedules` | Schedule for a route |
| Van | `GET /api/van/availability` | Seat availability |
| Van | `POST /api/van/bookings` | Book van seats |
| Van | `GET /api/van/bookings` | My van bookings |

---

---

# F. Offline Behavior Guide

---

## F1 — What Shows When Offline

The app uses multiple layers to handle offline gracefully:

| Layer | What Happens |
|---|---|
| `OfflineBar` | Red banner at top: "You're offline — showing cached data" |
| `SlowConnectionBar` | Yellow banner: "Slow connection detected" |
| React Query cache | Stale data shown for all GET requests |
| AsyncStorage cart | Cart items persist across offline + app close |
| AsyncStorage recently viewed | Last-viewed products shown without API |
| AsyncStorage search history | Previous searches usable offline |
| AsyncStorage onboarding flag | Skip onboarding even offline |
| SecureStore token | Auth state persists — no re-login needed after reconnect |

---

## F2 — What Does NOT Work Offline

| Feature | Why |
|---|---|
| Place order | Requires live API call |
| Live order tracking | Requires Socket.IO / SSE |
| OTP login | Requires SMS delivery |
| Payment / deposit | Requires live API |
| Chat | Socket.IO required |
| Search | API required |
| Banner / flash deal refresh | API required |
| Platform config refresh | Falls back to last cached config |

---

## F3 — Cache Strategy Per Data Type

| Data | Cache Duration | Storage |
|---|---|---|
| Platform config | 30 seconds | In-memory (PerformanceContext) |
| User profile | React Query staleTime (varies) | React Query cache |
| Orders list | React Query staleTime | React Query cache |
| Products | React Query staleTime | React Query cache |
| Cart | Persistent | AsyncStorage (`@ajkmart_cart`) |
| Recently viewed | Persistent | AsyncStorage (`recently_viewed_products`) |
| Search history | Persistent, max 10 | AsyncStorage (`@ajkmart_search_history`) |
| Auth tokens | Persistent | SecureStore |
| Onboarding seen | Persistent | AsyncStorage (`@ajkmart_onboarding_seen`) |

---

## F4 — Offline Detection

The `useNetworkQuality` hook handles offline detection for both web and native:

**Web:** Uses `navigator.connection` + `window.online` / `window.offline` events.

**Native:** Uses `@react-native-community/netinfo` event listener.

Both update `PerformanceContext.network`:
```typescript
{
  tier: "slow" | "medium" | "fast",
  isOffline: boolean,
  connectionType: string,      // wifi / cellular / none / unknown
  effectiveType: string,       // 2g / 3g / 4g
}
```

---

---

# G. Network Quality Adaptation

The app adapts its behavior based on connection quality using `useNetworkQuality()`.

---

## G1 — Image Quality Adaptation

`AdaptiveImage` component uses `getImageQualityForTier()` to request lower-resolution images on slow networks:

| Tier | Max Width | Quality |
|---|---|---|
| `slow` | 200px | 40% |
| `medium` | 400px | 70% |
| `fast` | 800px | 90% |

---

## G2 — Polling Interval Adaptation

`getPollingIntervalForTier()` adjusts how often the app polls:

| Tier | Multiplier | Example (base 5s) |
|---|---|---|
| `slow` | ×2 | 10 seconds |
| `medium` | ×1.5 | 7.5 seconds |
| `fast` | ×1 | 5 seconds |

---

## G3 — Connection Tier Classification

| Effective Type | Tier |
|---|---|
| `slow-2g`, `2g` | `slow` |
| `3g` | `medium` |
| `4g`, `5g`, `wifi`, `ethernet` | `fast` |
| Offline | `slow` (also sets `isOffline = true`) |

---

---

# H. Real-Time Features (Socket.IO + SSE)

---

## H1 — Socket.IO Connection

Established in `AuthContext` on login. Persists as `socket` in the context.

```typescript
const socket = io(`https://${EXPO_PUBLIC_DOMAIN}`, {
  auth: { token },
  transports: ['websocket'],
});
```

Used for:
- Chat messages (real-time send/receive)
- Order status updates (joined by `getSocketRoom(order)`)
- Cart order acknowledgment (`pendingAck` flow)
- Rider location updates

---

## H2 — Order Status via Socket.IO

When viewing an order, the screen joins a Socket.IO room:

```
socket.emit('join', getSocketRoom(order))
// Room format: order:{id} or ride:{id} or parcel:{id}
```

Events received:
- `order:updated` → refresh order status
- `order:ack` → order was accepted by vendor → clear cart, show success
- `location:update` → rider GPS position update

---

## H3 — Ride Tracking via SSE + Polling Fallback

`useRideStatus(rideId)` tries SSE first:

```
Step 1: Connect to /api/rides/[id]/stream (EventSource)
  ├── On message → update ride state
  ├── On error →
  │     └── Retry SSE with exponential backoff (3s → 6s → 10s max)
  │           └── After 3 failures → fall to polling
Step 2: Polling fallback (every 5 seconds)
  ├── GET /api/rides/[id]
  └── After 30 seconds → try to reconnect SSE
```

`connectionType` state: `"sse"` | `"polling"` | `"connecting"`

---

## H4 — Cart Order Acknowledgment Flow

After `POST /api/orders`:

```
1. pendingAck = true (show loading)
2. Listen for socket event: 'order:ack' (order accepted by vendor)
3. If ACK received within timeout:
   └── clearCart() → show success modal → navigate to /orders/[id]
4. If ACK not received (ackStuck = true after timer):
   └── Show "Taking longer than usual" message + dismiss option
5. AckStuck timer also polls GET /api/orders/[pendingOrderId] as fallback
```

---

---

# I. Cart System — Deep Dive

---

## I1 — Cart State Structure

```typescript
interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  type: "mart" | "food" | "pharmacy";  // service type
}
```

---

## I2 — Cart Persistence

Cart is automatically saved to AsyncStorage on every change:

```
addItem() / removeItem() / updateQuantity() / clearCart()
  └── setItems(newItems)
        └── AsyncStorage.setItem('@ajkmart_cart', JSON.stringify(newItems))
```

On app launch, cart is restored:
```
CartProvider mount
  └── AsyncStorage.getItem('@ajkmart_cart')
        └── JSON.parse → setItems (if valid)
```

---

## I3 — Mixed Cart Guard

If user adds a `food` item when cart has `mart` items (or vice versa):

```
addItem() detects cartType conflict
  └── CartSwitchModal appears:
        "Your cart has Mart items. Switch to Food and clear cart?"
        ├── Switch → clearCart() → addItem(new item)
        └── Cancel → keep existing cart
```

---

## I4 — Cart Validation

Before checkout, `validateCart()` calls `POST /api/cart/validate`:
- Checks each item's current stock and price
- Returns `{ valid, cartChanged }`
- If `cartChanged = true`, shows diff to user before proceeding

A **generation counter** (`cartGenRef`) prevents stale validation responses from overwriting user's cart changes made during the validation network call.

---

## I5 — Cart Type Labels

| `cartType` | Meaning |
|---|---|
| `mart` | All items are e-commerce |
| `food` | All items are food |
| `pharmacy` | All items are pharmacy |
| `mixed` | Multiple service types (edge case) |
| `none` | Cart is empty |

---

---

# J. Service Guard & Feature Flags

Every service screen is wrapped with `withServiceGuard(serviceKey, screenImport)`:

```typescript
// Example: /ride/index.tsx
export default withErrorBoundary(
  withServiceGuard("rides", () => import("./_Screen")),
);
```

**What it does:**
1. Reads `usePlatformConfig().features.rides`
2. If `false` → renders a "Service Unavailable" page with a message from platform config
3. If `true` → lazy-imports and renders `_Screen.tsx`

**Why `_Screen.tsx` pattern?**
- Keeps routing file thin (`index.tsx` = guard wrapper)
- Heavy screen logic lives in `_Screen.tsx`
- Enables code-splitting — screen code not loaded until needed

---

## Service Keys

| Key | Screen |
|---|---|
| `mart` | `/mart` |
| `food` | `/food` |
| `rides` | `/ride` |
| `pharmacy` | `/pharmacy` |
| `parcel` | `/parcel` |
| `van` | `/van` |
| `wallet` | `/(tabs)/wallet` |
| `chat` | `/chat` |
| `weather` | `/weather` |
| `reviews` | Product reviews section |
| `sos` | SOS button in profile |
| `liveTracking` | Live map in order detail |

---

---

# K. Permissions Required Per Feature

| Feature | Permission | When Asked | Fallback |
|---|---|---|---|
| Ride booking | `expo-location` — `requestForegroundPermissionsAsync` | When user taps pickup location | Manual address entry |
| Parcel booking | `expo-location` — `requestForegroundPermissionsAsync` | On sender address step | Manual entry |
| Pharmacy prescription | `expo-image-picker` — `requestMediaLibraryPermissionsAsync` | When user taps upload | Camera permission |
| Pharmacy prescription | `expo-camera` — `requestCameraPermissionsAsync` | When user taps camera | Gallery fallback |
| QR Scanner | `expo-camera` — `requestCameraPermissionsAsync` | On scan screen open | Error message |
| Push notifications | `expo-notifications` — `requestPermissionsAsync` | On profile → notifications settings | Silent (no push) |
| Biometric login | `expo-local-authentication` — `authenticateAsync` | On login if biometric enabled | Password login |

All permissions show a `PermissionGuide` component with an explanation before the OS dialog appears.

---

---

# L. i18n / Trilingual Support

The app supports 3 languages via `@workspace/i18n`.

---

## Language Keys

| Code | Name | Script |
|---|---|---|
| `en` | English | Latin |
| `ur` | Urdu | Arabic/RTL |
| `roman` | Roman Urdu | Latin (Urdu in English letters) |

---

## How to Use in a Screen

```typescript
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useLanguage } from "@/context/LanguageContext";

const { language } = useLanguage();
const T = (key: TranslationKey) => tDual(key, language);

// Usage:
<Text>{T("addToCart")}</Text>
```

---

## How to Add a New Translation Key

1. Open `lib/i18n/src/strings.ts`
2. Add the key with all 3 translations:
   ```typescript
   myNewKey: {
     en: "My new text",
     ur: "میرا نیا متن",
     roman: "Mera naya matn",
   }
   ```
3. TypeScript will enforce the key exists on `TranslationKey`

---

## RTL Support

Urdu (`ur`) is right-to-left. The app handles this via:
- React Native's built-in RTL support when `I18nManager.isRTL` is true
- Text alignment in StyleSheets defaults to `auto` (respects RTL)

---

---

# M. Error Handling & Crash Reporting

---

## M1 — ErrorBoundary

Every major screen is wrapped with `withErrorBoundary()`:

```typescript
export default withErrorBoundary(MyScreen);
```

If the screen throws an unhandled error:
1. `ErrorBoundary` catches it
2. Renders `ErrorFallback` component (friendly UI with retry button)
3. Reports to Sentry via `utils/sentry.ts`
4. Logs to `POST /api/errors/report` (if `SENTRY_DSN` not set)

---

## M2 — API Error Handling

`unwrapApiResponse()` in `utils/api.ts`:
- Extracts `.data` from API response
- Throws structured error if `res.ok === false`
- Formats error messages for Toast display

---

## M3 — Sentry

`utils/sentry.ts` wraps Sentry SDK:
- Only active if `EXPO_PUBLIC_SENTRY_DSN` is set
- Tags errors with `userId`, `platform`, `appVersion`
- Fallback: sends to `/api/errors/report` if Sentry not configured

---

## M4 — Error Reporter

`utils/error-reporter.ts` — sends client errors to backend:
```
POST /api/errors/report
Headers: X-Error-HMAC (signed with ERROR_REPORT_HMAC_SECRET)
Body: { message, stack, context, platform, appVersion }
```

---

---

# N. Missing Features & Known Gaps

---

## N1 — Features Not Yet Built (Customer App)

| # | Missing Feature | Impact | Fix |
|---|---|---|---|
| 1 | Push notification on new order status | HIGH | Firebase FCM token registration → backend sends push |
| 2 | Offline cart persistence after uninstall | MEDIUM | Cart in AsyncStorage clears on reinstall |
| 3 | Real-time stock update on product page | MEDIUM | No websocket subscription on product detail |
| 4 | "Notify me" button (`/product/[id]`) — no backend yet | MEDIUM | `stock_subscriptions` table exists but route missing |
| 5 | No pagination cap on recently-viewed | LOW | List grows forever in AsyncStorage |
| 6 — | No cart quantity limit per item | LOW | User can add 9999 qty with no max check |
| 7 | Biometric — no web fallback | MEDIUM | `expo-local-authentication` undefined on web |
| 8 | Wrong-app redirect (`wrong-app.tsx`) — not tested cross-platform | MEDIUM | Riders/vendors opening customer URL |
| 9 | No referral code sharing UI (despite `features.referral` flag) | MEDIUM | Flag exists, screen not yet created |
| 10 | Rate-app prompt timing — not event-driven | LOW | `rate-app.tsx` not auto-triggered on delivery |
| 11 | No skeleton loader on search results | LOW | White flash while loading |
| 12 | Chat — no message read receipts | LOW | Sent/delivered/read status not shown |
| 13 | Chat — no image/file sending | MEDIUM | Text-only chat |
| 14 | Van booking — no seat map rendered on web | MEDIUM | Seat layout is `unknown` type — not parsed |
| 15 | No deep link handling for promo codes in QR scanner | LOW | Scanner navigates to product/vendor only |

---

## N2 — Offline Gaps

| # | Gap | Severity |
|---|---|---|
| 1 | Cart validation doesn't work offline | MEDIUM — user can't checkout |
| 2 | Platform config not persisted to AsyncStorage | HIGH — if app opens offline with no cache, features all default to false |
| 3 | Orders list not persisted — empty on first offline open | MEDIUM |
| 4 | No "Retry" button on failed API calls | MEDIUM — must pull-to-refresh manually |

---

---

# O. How to Add a New Screen

---

## Step 1 — Create the Route File

```bash
# Example: adding /rewards screen
touch artifacts/ajkmart/app/rewards/index.tsx
touch artifacts/ajkmart/app/rewards/_Screen.tsx
```

---

## Step 2 — `index.tsx` — Service Guard Wrapper

```typescript
// artifacts/ajkmart/app/rewards/index.tsx
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import { withServiceGuard } from "@/components/ServiceGuard";

export default withErrorBoundary(
  withServiceGuard("referral", () => import("./_Screen")),
);
```

If there's no feature flag, just export the screen directly:
```typescript
export { default } from "./_Screen";
```

---

## Step 3 — `_Screen.tsx` — The Actual Screen

```typescript
// artifacts/ajkmart/app/rewards/_Screen.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual } from "@workspace/i18n";
import Colors from "@/constants/colors";

const C = Colors.light;

export default function RewardsScreen() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const T = (key: any) => tDual(key, language);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rewards</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  title: { fontSize: 24, color: C.text },
});
```

---

## Step 4 — Add Navigation Link

In `/(tabs)/index.tsx` or wherever you want to navigate from:
```typescript
import { router } from "expo-router";
// ...
<TouchableOpacity onPress={() => router.push("/rewards")}>
  <Text>Rewards</Text>
</TouchableOpacity>
```

---

## Step 5 — Add API Call (if needed)

Add the API function in `@workspace/api-client-react` or call directly:
```typescript
const { data, isLoading } = useQuery({
  queryKey: ["rewards", user?.id],
  queryFn: () => fetch(`${API_BASE}/rewards`).then(r => r.json()),
  enabled: !!user,
});
```

---

## Step 6 — Add Translation Keys (if needed)

In `lib/i18n/src/strings.ts`:
```typescript
rewards: { en: "Rewards", ur: "انعامات", roman: "Inaamaat" },
```

---

## Step 7 — Add Feature Flag (if toggleable)

In `PlatformConfigContext.tsx` features interface, add:
```typescript
rewards: boolean,
```

In admin panel Launch Control, the flag `features.rewards` can now be toggled on/off without a code deploy.

---

---

*— End of AJKMart Customer App Documentation —*

> Last updated: 2025 | Customer App version: Expo SDK | Routing: Expo Router (file-based)
> Related: see `ajkmart.md` for full monorepo documentation
