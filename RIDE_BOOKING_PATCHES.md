# Ride Booking Module — QA Audit & Production Hardening Patch Notes

**Date:** 2026-04-03
**Scope:** Customer App (ajkmart), Rider App, Admin Panel, API Server
**Goal:** Zero production-blocking bugs, all security vulnerabilities patched

---

## Security Patches

### [SEC-01] Rate Limiting — Booking & Fare Estimate Endpoints (CRITICAL)
**File:** `artifacts/api-server/src/routes/rides.ts`

`POST /rides/` (book) and `POST /rides/estimate` had no rate limiter applied, enabling a
malicious actor to flood the server with booking or routing requests at zero cost.

- Added `bookRideLimiter`: 10 requests/IP/minute on `POST /rides/`
- Added `estimateLimiter`: 30 requests/IP/minute on `POST /rides/estimate`
- Both use `validate: { xForwardedForHeader: false }` consistent with existing limiters

### [SEC-02] Rate Limiting — Rider Action Endpoints (HIGH)
**File:** `artifacts/api-server/src/routes/rider.ts`

Ride-acceptance, bid-counter, ride-status-update, and OTP-verification endpoints had no
rate limiters, enabling the following attacks:
- Accept-spam: a single rider repeatedly hammering `accept` to win races
- Bid flooding: circumventing the 3-bid-per-ride cap via rapid-fire counters
- Status replay: sending repeated status transitions to corrupt ride state
- OTP brute-force: trying all 10,000 four-digit codes

Added the following per-rider rate limiters (keyed on `req.riderId`):
- `rideAcceptLimiter`: 10 accepts/rider/minute on `POST /rider/rides/:id/accept`
- `rideBidLimiter`: 15 bids/rider/minute on `POST /rider/rides/:id/counter`
- `rideStatusLimiter`: 20 status updates/rider/minute on `PATCH /rider/rides/:id/status`
- `otpLimiter`: 5 OTP attempts/rider/minute on `POST /rider/rides/:id/verify-otp`

---

## Audit Confirmation — Issues Already Patched (No Code Change Required)

### [AUD-01] IDOR Protection — Confirmed Solid
All mutating ride endpoints apply either `requireRideOwner("userId")` or
`requireRideOwner("riderId")` after `loadRide()`. The `GET /:id` endpoint performs its own
inline ownership check: `isCustomer || isRider`, preventing cross-user data leakage.

### [AUD-02] Duplicate Booking — Patched (this PR)
Both wallet and cash/bargain booking paths previously used `SELECT ... FROM rides ... FOR UPDATE`
to re-check for active rides. This is insufficient: when no active ride row exists yet, the lock
applies to an empty result set — two concurrent transactions can both pass the check and both
insert a new active ride for the same user.

**Fix applied:** Both transaction paths now first lock the user's row via
`SELECT ... FROM users WHERE id = userId FOR UPDATE`. This serializes all concurrent booking
attempts for the same user at the database level, making the subsequent active-ride check safe
regardless of whether a ride row exists yet. The user-row lock is also naturally held through
the wallet deduction step, ensuring balance checks and ride creation are fully atomic.

### [AUD-03] Payment Bypass — Confirmed Atomic
Wallet deductions happen inside the same DB transaction as the ride insert/accept.
For ride acceptance, the wallet deduction fails atomically if balance is insufficient at
deduction time, rolling back the entire accept — the race-winning rider cannot be charged
after the balance was already depleted by a concurrent request.

### [AUD-04] Script Injection — Confirmed Patched
All free-text fields (addresses, notes, bargainNote, receiverName, receiverPhone,
packageType) pass through `stripHtml()` via Zod `.transform(stripHtml)`. Raw HTML tags
in user input are stripped before storage.

### [AUD-05] Bid Cap Abuse — Confirmed Enforced
`MAX_BIDS_PER_RIDER_PER_RIDE = 3` is enforced inside a `SELECT ... FOR UPDATE` transaction
on the ride row, preventing concurrent bids from circumventing the cap via race conditions.

### [AUD-06] OTP Gate — Confirmed Enforced
The `in_transit` status transition is gated on `ride.otpVerified === true`, which is only
set by `POST /rider/rides/:id/verify-otp` after a matching `ride.tripOtp` comparison.
The server-stored OTP is never sent to the rider — only to the customer via `emitRideOtp`.

### [AUD-07] Proximity Spoofing — Confirmed Server-Side
The `arrived` status transition uses only the server-stored live location (from
`liveLocationsTable`), not the client-supplied `lat/lng` in the request body. Locations
older than 2 minutes are rejected. The client-supplied coordinates are accepted but ignored
for proximity verification.

### [AUD-08] Admin Real-Time Sync — Confirmed Working
All key ride events (`new`, `accepted`, `cancel`, `status-change`, `otp-verified`)
emit `ride:dispatch-update` to the `admin-fleet` Socket.io room. The Admin Panel
subscribes via `socket.on("ride:dispatch-update", ...)` and invalidates both
`admin-dispatch-monitor` and `admin-rides-enriched` React Query caches for live updates.

### [AUD-09] Dispatch Engine — Confirmed Safe
`dispatchCycleRunning` flag prevents overlapping dispatch cycles. The engine runs every
10 seconds, broadcasts to riders in rounds (45s/round, max 3 rounds), then marks
`no_riders` and issues an automatic wallet refund. Expired rides are also auto-refunded.

### [AUD-10] Cancellation Fee — Confirmed Atomic
The cancellation path applies `requireRideState(["searching","bargaining","accepted","arrived"])`.
It does NOT allow customer cancellation once `in_transit` has begun. The cancellation fee
deduction and optional wallet refund happen inside a DB transaction.

### [AUD-11] UI Double-Submit Protection — Confirmed Present
- `RideBookingForm`: `setBooking(true)` on submit, button is disabled while `booking===true`
- `NegotiationScreen`: `setAcceptBidId(bidId)` on accept, all accept buttons disabled while
  `acceptBidId !== null`; `updateOfferLoading` guards the customer counter-offer button

---

## Summary of Changes

| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/rides.ts` | Added `bookRideLimiter` (10/min) on `POST /`, `estimateLimiter` (30/min) on `POST /estimate` |
| `artifacts/api-server/src/routes/rides.ts` | Fixed duplicate booking race: both wallet and cash paths now lock user row (`FOR UPDATE`) before active-ride check |
| `artifacts/api-server/src/routes/rider.ts` | Added `rideAcceptLimiter` (10/min), `rideBidLimiter` (15/min), `rideStatusLimiter` (20/min), `otpLimiter` (5/min) on respective ride-action endpoints |

---

## Production Readiness Assessment

| Category | Status |
|----------|--------|
| IDOR / access control | PASS |
| Duplicate booking prevention | PATCHED (this PR) |
| Payment integrity | PASS |
| Script injection | PASS |
| Bid cap enforcement | PASS |
| OTP gate for trip start | PASS |
| Rate limiting — booking | PATCHED (this PR) |
| Rate limiting — rider actions | PATCHED (this PR) |
| OTP brute-force protection | PATCHED (this PR) |
| Admin real-time sync | PASS |
| Dispatch engine safety | PASS |
| Cancellation integrity | PASS |
| UI double-submit protection | PASS |

**All production-blocking security issues have been resolved.**
