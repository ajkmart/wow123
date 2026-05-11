/**
 * AJKMart Admin Panel — Button / Endpoint Audit Script
 * =====================================================
 * Yeh script admin panel ke saare GET endpoints ko test karta hai
 * aur jo bhi 404 ya 500 de, unhe Roman Urdu mein report karta hai.
 *
 * Usage:
 *   node scripts/admin-button-audit.mjs
 *   node scripts/admin-button-audit.mjs --verbose
 *   node scripts/admin-button-audit.mjs --json
 */

import { readFileSync } from "fs";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.AUDIT_BASE_URL
  || `http://127.0.0.1:${process.env.PORT || 5000}/api`;

const ADMIN_USERNAME = process.env.AUDIT_ADMIN_USERNAME || "superadmin";
const ADMIN_PASSWORD = process.env.AUDIT_ADMIN_PASSWORD || "Admin@123";
const VERBOSE        = process.argv.includes("--verbose");
const JSON_OUTPUT    = process.argv.includes("--json");
const TIMEOUT_MS     = 10_000;

// ─── COLOR HELPERS ───────────────────────────────────────────────────────────
const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
};
const color = (c, s) => JSON_OUTPUT ? s : `${c}${s}${C.reset}`;

// ─── ALL ADMIN GET ENDPOINTS TO TEST ─────────────────────────────────────────
//
// Format: { path, prefix, label }
//   prefix = the /api/... mount point
//   path   = sub-route after prefix
//   label  = Roman Urdu description shown in report
//
const ENDPOINTS = [
  // ── Auth & Session ────────────────────────────────────────────────────────
  { prefix: "/admin/auth", path: "/me",              label: "Admin ka profile / login status" },
  { prefix: "/admin/auth", path: "/sessions",        label: "Active sessions list" },
  // MFA status — only exists as POST (2fa verify), no GET status endpoint yet
  // { prefix: "/admin/auth", path: "/mfa/status",  label: "2FA status check" },

  // ── Dashboard & Stats ─────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/dashboard-export",label: "Main dashboard stats (correct path)" },
  { prefix: "/admin",      path: "/pending-counts",  label: "Pending items count (badge)" },
  { prefix: "/admin",      path: "/app-overview",    label: "App overview / version info" },
  { prefix: "/admin",      path: "/stats",            label: "General stats" },

  // ── Users ─────────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/users",            label: "Users list" },
  { prefix: "/admin",      path: "/users/pending",    label: "Pending approval users" },
  { prefix: "/admin",      path: "/users/search?q=test", label: "User search" },
  { prefix: "/admin",      path: "/users/search-riders?q=test", label: "Rider search" },

  // ── Orders ────────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/orders",           label: "Orders list" },
  { prefix: "/admin",      path: "/orders-stats",     label: "Orders stats" },

  // ── Rides / Fleet ─────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/rides",            label: "Rides list" },
  { prefix: "/admin",      path: "/rides-enriched",   label: "Detailed rides list" },
  { prefix: "/admin",      path: "/riders",           label: "Riders list" },
  { prefix: "/admin",      path: "/live-riders",      label: "Live riders map data" },
  { prefix: "/admin",      path: "/fleet-analytics",  label: "Fleet analytics" },
  { prefix: "/admin",      path: "/dispatch-monitor", label: "Dispatch monitor" },
  { prefix: "/admin",      path: "/ride-services",    label: "Ride service types" },

  // ── Vendors ───────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/vendors",               label: "Vendors list" },
  { prefix: "/admin",      path: "/vendor-ratings",        label: "Vendor ratings" },
  { prefix: "/admin",      path: "/launch/vendor-plans",   label: "Vendor subscription plans (correct path)" },
  { prefix: "/admin",      path: "/fleet/vendors",         label: "Fleet vendors" },

  // ── Products & Categories ─────────────────────────────────────────────────
  { prefix: "/admin",      path: "/products",         label: "Products list" },
  { prefix: "/admin",      path: "/products/pending", label: "Pending products" },
  { prefix: "/admin",      path: "/categories",       label: "Categories list" },
  { prefix: "/admin",      path: "/categories/tree",  label: "Category tree" },

  // ── Finance & Wallet ──────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/wallet/stats",     label: "Wallet stats" },
  { prefix: "/admin",      path: "/wallet/p2p-transactions", label: "P2P transactions" },
  { prefix: "/admin",      path: "/transactions",     label: "Transactions list" },
  { prefix: "/admin",      path: "/transactions-enriched", label: "Detailed transactions" },
  { prefix: "/admin",      path: "/revenue-analytics", label: "Revenue analytics" },
  { prefix: "/admin",      path: "/revenue-trend",    label: "Revenue trend" },
  { prefix: "/admin",      path: "/deposit-requests", label: "Deposit requests" },
  { prefix: "/admin",      path: "/withdrawal-requests", label: "Withdrawal requests" },
  { prefix: "/admin",      path: "/export/financial", label: "Financial export" },
  { prefix: "/admin",      path: "/export/orders",    label: "Orders export" },
  { prefix: "/admin",      path: "/export/users",     label: "Users export" },
  { prefix: "/admin",      path: "/export/riders",    label: "Riders export" },
  { prefix: "/admin",      path: "/export/rides",     label: "Rides export" },
  { prefix: "/admin",      path: "/export/vendors",   label: "Vendors export" },

  // ── Promo / Marketing ─────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/promo-codes",      label: "Promo codes list" },
  { prefix: "/admin",      path: "/flash-deals",      label: "Flash deals" },
  { prefix: "/admin",      path: "/banners",          label: "Banners list" },
  { prefix: "/admin",      path: "/popups",           label: "Popups list" },
  { prefix: "/admin",      path: "/popups/templates", label: "Popup templates" },
  { prefix: "/promotions", path: "/campaigns",        label: "Marketing campaigns" },
  { prefix: "/promotions", path: "/offers",           label: "Promotion offers" },
  { prefix: "/promotions", path: "/analytics",        label: "Promotions analytics" },
  { prefix: "/promotions", path: "/ai-recommendations", label: "AI promo recommendations" },

  // ── Reviews & Feedback ────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/reviews",          label: "Reviews list" },
  { prefix: "/admin",      path: "/reviews/export",   label: "Reviews export" },
  { prefix: "/admin",      path: "/reviews/moderation-queue", label: "Reviews moderation queue" },

  // ── KYC ──────────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/kyc",              label: "KYC list (admin)" },

  // ── Pharmacy & Parcel ─────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/pharmacy-enriched", label: "Pharmacy orders" },
  { prefix: "/admin",      path: "/parcel-enriched",  label: "Parcel bookings" },

  // ── Broadcasts & Notifications ────────────────────────────────────────────
  { prefix: "/admin",      path: "/broadcasts",       label: "Broadcasts list" },
  { prefix: "/admin",      path: "/broadcast/recipients/count", label: "Broadcast recipient count" },
  { prefix: "/admin",      path: "/all-notifications", label: "All notifications" },

  // ── Support Chat ──────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/support-chat/conversations", label: "Support chat conversations (correct path)" },

  // ── Communication (WhatsApp/SMS/Email) ────────────────────────────────────
  { prefix: "/admin",      path: "/communication/dashboard", label: "Communication dashboard" },
  { prefix: "/admin",      path: "/communication/conversations", label: "Communication conversations" },
  { prefix: "/admin",      path: "/communication/flags", label: "Flagged messages" },
  { prefix: "/admin",      path: "/communication/roles", label: "Communication roles" },
  { prefix: "/admin",      path: "/communication/settings", label: "Communication settings" },
  { prefix: "/admin",      path: "/whatsapp/delivery-log",       label: "WhatsApp delivery log (correct path)" },
  { prefix: "/admin",      path: "/whatsapp/delivery-log/stats", label: "WhatsApp delivery stats (correct path)" },

  // ── SMS Gateways ──────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/otp/channels",     label: "OTP / SMS gateway channels" },
  { prefix: "/admin",      path: "/otp/status",       label: "OTP service status" },
  { prefix: "/admin",      path: "/otp/audit",        label: "OTP audit log" },

  // ── Security ─────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/security-dashboard", label: "Security dashboard" },
  { prefix: "/admin",      path: "/security-events",  label: "Security events log" },
  { prefix: "/admin",      path: "/blocked-ips",      label: "Blocked IPs list" },
  { prefix: "/admin",      path: "/login-lockouts",   label: "Login lockouts" },
  { prefix: "/admin",      path: "/audit-logs",       label: "Admin audit logs" },
  { prefix: "/admin",      path: "/auth-audit-log",   label: "Auth audit log" },
  { prefix: "/admin",      path: "/audit-log",        label: "System audit log" },
  { prefix: "/admin",      path: "/whitelist",        label: "IP whitelist" },
  { prefix: "/admin",      path: "/delivery-access",  label: "Delivery access zones" },
  { prefix: "/admin",      path: "/delivery-access/requests", label: "Delivery access requests" },

  // ── System & Settings ─────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/platform-settings",    label: "Platform settings" },
  { prefix: "/admin",      path: "/launch/settings",     label: "App launch settings (correct path)" },
  { prefix: "/admin",      path: "/system/diagnostics", label: "System diagnostics" },
  { prefix: "/admin",      path: "/system/health-dashboard", label: "Health dashboard" },
  { prefix: "/admin",      path: "/system/admin-ip-lockouts", label: "Admin IP lockouts" },
  { prefix: "/admin",      path: "/maintenance-schedule", label: "Maintenance schedule" },
  { prefix: "/admin",      path: "/retention-policies", label: "Data retention policies" },
  { prefix: "/admin",      path: "/release-notes",    label: "Release notes" },
  { prefix: "/admin",      path: "/integration-history", label: "Integration test history" },

  // ── Roles & Permissions ───────────────────────────────────────────────────
  { prefix: "/admin",      path: "/system/rbac/roles",       label: "Roles list (correct path)" },
  { prefix: "/admin",      path: "/system/rbac/permissions",  label: "All permissions (correct path)" },
  { prefix: "/admin",      path: "/launch/role-presets",      label: "Role presets (correct path)" },
  { prefix: "/admin",      path: "/admin-accounts",           label: "Admin accounts list" },

  // ── Deep Links ────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/deep-links",       label: "Deep links list" },

  // ── QR Codes ─────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/qr-codes",         label: "QR codes list" },

  // ── Experiments / A-B Testing ─────────────────────────────────────────────
  { prefix: "/admin",      path: "/experiments",      label: "A/B experiments list" },

  // ── Business Rules ────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/conditions",       label: "Conditions list" },
  { prefix: "/admin",      path: "/condition-rules",  label: "Condition rules" },
  { prefix: "/admin",      path: "/condition-settings", label: "Condition settings" },

  // ── SOS Alerts ───────────────────────────────────────────────────────────
  { prefix: "/sos",        path: "/alerts",           label: "SOS alerts list" },

  // ── Loyalty ───────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/loyalty/users",    label: "Loyalty users list" },
  { prefix: "/admin",      path: "/leaderboard",      label: "Loyalty leaderboard" },

  // ── Search Analytics ──────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/search-analytics/top-terms?days=7&limit=30", label: "Search top terms" },
  { prefix: "/admin",      path: "/search-analytics/zero-results?days=7&limit=50", label: "Search zero-result terms" },
  { prefix: "/admin",      path: "/search-analytics/interaction-stats?days=7", label: "Search interaction stats" },
  { prefix: "/admin",      path: "/search-analytics/interaction-timeline?days=7", label: "Search interaction timeline" },

  // ── Wishlist ──────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/wishlist-analytics", label: "Wishlist analytics" },
  { prefix: "/admin",      path: "/wishlist-analytics/timeline", label: "Wishlist timeline" },

  // ── Legal / Consent ───────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/consent-log",      label: "User consent log" },
  { prefix: "/legal",      path: "/terms-versions",   label: "Terms & conditions versions" },

  // ── Maps / Location ───────────────────────────────────────────────────────
  { prefix: "/maps",       path: "/config?app=admin", label: "Map config" },
  { prefix: "/admin",      path: "/customer-locations", label: "Customer locations" },

  // ── Webhooks ─────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/webhooks",         label: "Webhooks list" },

  // ── FAQs ─────────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/faqs",             label: "FAQs list" },

  // ── Launch / Onboarding ───────────────────────────────────────────────────
  { prefix: "/admin",      path: "/launch/settings",  label: "Launch settings" },
  { prefix: "/admin",      path: "/launch/role-presets", label: "Launch role presets" },
  { prefix: "/admin",      path: "/launch/vendor-plans", label: "Launch vendor plans" },

  // ── Van / Inter-city ─────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/van/schedules",    label: "Van / inter-city schedules" },

  // ── School Transport ─────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/school-routes",    label: "School transport routes" },
  { prefix: "/admin",      path: "/school-subscriptions", label: "School subscriptions" },

  // ── Inventory Settings ────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/inventory-settings", label: "Vendor inventory settings" },

  // ── Weather ───────────────────────────────────────────────────────────────
  { prefix: "/admin",      path: "/weather-config",   label: "Weather config" },

  // ── Public Health Check ───────────────────────────────────────────────────
  { prefix: "",            path: "/health",           label: "API health check" },
  { prefix: "/stats",      path: "/public",           label: "Public platform stats" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function pad(str, n) {
  return String(str).padEnd(n);
}

// ─── STEP 1: LOGIN (with token caching to avoid rate-limit) ─────────────────

const TOKEN_CACHE_FILE = "/tmp/.ajkmart-audit-token.json";

async function login() {
  // Try cached token first (avoids re-logging in and hitting rate limit)
  try {
    const { readFileSync } = await import("fs");
    const cached = JSON.parse(readFileSync(TOKEN_CACHE_FILE, "utf8"));
    if (cached.token && cached.expiresAt > Date.now()) {
      console.log(color(C.green, `✓ Cached token use ho raha hai (${cached.token.slice(0, 20)}...)`));
      return { token: cached.token, cookies: cached.cookies || "" };
    }
  } catch { /* no cache */ }

  const loginUrl = `${BASE_URL}/admin/auth/login`;
  console.log(color(C.cyan, `\n[1/3] Admin login ho raha hai → ${loginUrl}`));
  let res;
  try {
    res = await fetchWithTimeout(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    });
  } catch (err) {
    console.error(color(C.red, `✗ Login request fail ho gayi: ${err.message}`));
    console.error(color(C.yellow, `  API server chal raha hai? PORT=${process.env.PORT || 5000}`));
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const parsed = JSON.parse(body || "{}");
    if (res.status === 429) {
      const wait = parsed.retryAfter ? `${Math.ceil(parsed.retryAfter / 60)} minute` : "15 minute";
      console.error(color(C.red, `✗ Rate limit — ${wait} baad dobara try karein`));
      console.error(color(C.yellow, `  Ya: node scripts/admin-button-audit.mjs --no-cache`));
    } else {
      console.error(color(C.red, `✗ Login fail — HTTP ${res.status}`));
      console.error(color(C.yellow, `  Credentials: AUDIT_ADMIN_USERNAME / AUDIT_ADMIN_PASSWORD`));
      if (body) console.error(color(C.gray, `  Response: ${body.slice(0, 200)}`));
    }
    process.exit(1);
  }

  const data = await res.json();
  const token = data?.accessToken || data?.token || data?.data?.accessToken || data?.data?.token;
  if (!token) {
    console.error(color(C.red, "✗ Login hua magar token nahi mila."));
    console.error(color(C.gray, `  Response keys: ${Object.keys(data).join(", ")}`));
    process.exit(1);
  }

  const cookies = res.headers.get("set-cookie") || "";

  // Cache token for 12 hours to avoid repeated logins
  try {
    const { writeFileSync } = await import("fs");
    writeFileSync(TOKEN_CACHE_FILE, JSON.stringify({
      token, cookies,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    }));
  } catch { /* cache write failed, ignore */ }

  console.log(color(C.green, `✓ Login kamyab! Token mila (${token.slice(0, 20)}...)`));
  return { token, cookies };
}

// ─── STEP 2: TEST ENDPOINTS ───────────────────────────────────────────────────

async function testEndpoint(ep, token, cookies) {
  const url = `${BASE_URL}${ep.prefix}${ep.path}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
  };
  if (cookies) headers["Cookie"] = cookies;

  let status, error, latency;
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, { headers });
    latency = Date.now() - start;
    status = res.status;
  } catch (err) {
    latency = Date.now() - start;
    error = err.name === "AbortError" ? "TIMEOUT" : err.message;
    status = 0;
  }

  return { ...ep, url, status, error, latency };
}

// ─── STEP 3: REPORT ──────────────────────────────────────────────────────────

function printReport(results) {
  const ok       = results.filter(r => r.status >= 200 && r.status < 400);
  const notFound = results.filter(r => r.status === 404);
  const serverErr= results.filter(r => r.status === 500);
  const otherErr = results.filter(r => r.status !== 0 && r.status !== 404 && r.status !== 500 && (r.status < 200 || r.status >= 400));
  const timeouts = results.filter(r => r.status === 0 && r.error === "TIMEOUT");
  const networkE = results.filter(r => r.status === 0 && r.error !== "TIMEOUT");

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ ok, notFound, serverErr, otherErr, timeouts, networkErrors: networkE }, null, 2));
    return;
  }

  const bar = "═".repeat(70);
  console.log(`\n${color(C.bold, bar)}`);
  console.log(color(C.bold, "       AJKMART ADMIN PANEL — ENDPOINT AUDIT REPORT"));
  console.log(`${color(C.bold, bar)}\n`);

  // ── Summary ──
  console.log(color(C.bold, "📊 SUMMARY (Kul nateeja):"));
  console.log(`  ${color(C.green,  "✓ Theek kaam kar rahe:")}  ${ok.length}`);
  console.log(`  ${color(C.red,    "✗ 404 (Route nahi mila):")} ${notFound.length}`);
  console.log(`  ${color(C.red,    "✗ 500 (Server error):")}   ${serverErr.length}`);
  console.log(`  ${color(C.yellow, "⚠ Other errors:")}        ${otherErr.length}`);
  console.log(`  ${color(C.gray,   "⏱ Timeouts:")}            ${timeouts.length}`);
  console.log(`  ${color(C.gray,   "⛔ Network errors:")}     ${networkE.length}`);
  console.log(`  ${"Total tested:"}              ${results.length}\n`);

  // ── 404 Errors ──
  if (notFound.length > 0) {
    console.log(color(C.red + C.bold, `\n❌ 404 ERRORS — Yeh routes exist nahi karte (${notFound.length}):`));
    console.log(color(C.gray, "  Matlab: Admin panel mein button hai, magar API route nahi bana."));
    notFound.forEach(r => {
      console.log(`  ${color(C.red, "✗")} ${pad(r.status, 4)} ${pad(r.label, 40)} ${color(C.gray, r.url)}`);
    });
  }

  // ── 500 Errors ──
  if (serverErr.length > 0) {
    console.log(color(C.red + C.bold, `\n💥 500 ERRORS — Server crash ho raha hai (${serverErr.length}):`));
    console.log(color(C.gray, "  Matlab: Route hai magar andar code mein koi masla hai."));
    serverErr.forEach(r => {
      console.log(`  ${color(C.red, "✗")} ${pad(r.status, 4)} ${pad(r.label, 40)} ${color(C.gray, r.url)}`);
    });
  }

  // ── Other Errors ──
  if (otherErr.length > 0) {
    console.log(color(C.yellow + C.bold, `\n⚠ OTHER ERRORS (${otherErr.length}):`));
    otherErr.forEach(r => {
      console.log(`  ${color(C.yellow, "!")} ${pad(r.status, 4)} ${pad(r.label, 40)} ${color(C.gray, r.url)}`);
    });
  }

  // ── Timeouts ──
  if (timeouts.length > 0) {
    console.log(color(C.yellow + C.bold, `\n⏱ TIMEOUTS — 10 second mein response nahi aaya (${timeouts.length}):`));
    timeouts.forEach(r => {
      console.log(`  ${color(C.yellow, "⏱")} ${"TOUT"} ${pad(r.label, 40)} ${color(C.gray, r.url)}`);
    });
  }

  // ── Network Errors ──
  if (networkE.length > 0) {
    console.log(color(C.gray, `\n⛔ NETWORK ERRORS — Server se connection nahi hua (${networkE.length}):`));
    networkE.forEach(r => {
      console.log(`  ${color(C.gray, "⛔")} ${pad(r.label, 40)} — ${r.error}`);
    });
  }

  // ── Working endpoints (verbose only) ──
  if (VERBOSE && ok.length > 0) {
    console.log(color(C.green + C.bold, `\n✅ WORKING ENDPOINTS (${ok.length}):`));
    ok.forEach(r => {
      console.log(`  ${color(C.green, "✓")} ${pad(r.status, 4)} ${pad(r.label, 40)} ${color(C.gray, `${r.latency}ms`)}`);
    });
  }

  // ── Roman Urdu Action Guide ──
  console.log(`\n${color(C.bold, "─".repeat(70))}`);
  console.log(color(C.bold, "📋 KYA KARNA HAI (Action Guide):"));
  console.log();

  if (notFound.length === 0 && serverErr.length === 0) {
    console.log(color(C.green, "  🎉 Mubarak! Koi 404 ya 500 error nahi mila. Sab theek hai!"));
  } else {
    if (notFound.length > 0) {
      console.log(color(C.red, "  404 errors ke liye:"));
      console.log("    → artifacts/api-server/src/routes/admin/ mein nayi route file banayein");
      console.log("    → Ya existing route file mein missing endpoint add karein");
      console.log("    → Phir artifacts/api-server/src/routes/index.ts mein register karein");
      console.log();
    }
    if (serverErr.length > 0) {
      console.log(color(C.red, "  500 errors ke liye:"));
      console.log("    → API server ke logs dekhein: pnpm --filter @workspace/api-server dev");
      console.log("    → Database query ya middleware mein error hogi — stack trace dhundhein");
      console.log();
    }
  }

  if (!VERBOSE) {
    console.log(color(C.gray, "  Tip: --verbose flag se saare working endpoints bhi dekhein"));
    console.log(color(C.gray, "  Tip: --json flag se machine-readable output milega"));
  }

  console.log(`${color(C.bold, "─".repeat(70))}\n`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(color(C.bold + C.cyan, `
╔══════════════════════════════════════════════════════════════╗
║       AJKMart Admin Panel — Button & Endpoint Audit         ║
╚══════════════════════════════════════════════════════════════╝`));
  console.log(color(C.gray, `  Base URL : ${BASE_URL}`));
  console.log(color(C.gray, `  Endpoints: ${ENDPOINTS.length} GET routes`));
  console.log(color(C.gray, `  Timeout  : ${TIMEOUT_MS}ms per request\n`));

  // Step 1: Login
  const { token, cookies } = await login();

  // Step 2: Test all endpoints (parallel batches of 10)
  console.log(color(C.cyan, `\n[2/3] ${ENDPOINTS.length} endpoints test ho rahe hain...\n`));

  // Batch size 5 + 300ms delay to avoid rate-limiter (global limit = 100req/min)
  const BATCH = 5;
  const DELAY_MS = 350;
  const results = [];
  for (let i = 0; i < ENDPOINTS.length; i += BATCH) {
    const batch = ENDPOINTS.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(ep => testEndpoint(ep, token, cookies)));
    results.push(...batchResults);

    // Progress indicator
    const done = Math.min(i + BATCH, ENDPOINTS.length);
    const icons = batchResults.map(r => {
      if (r.status >= 200 && r.status < 400) return color(C.green, "✓");
      if (r.status === 404) return color(C.red, "4");
      if (r.status === 500) return color(C.red, "5");
      if (r.status === 429) return color(C.yellow, "R");
      if (r.status === 0)   return color(C.gray, "T");
      return color(C.yellow, "?");
    }).join("");
    process.stdout.write(`  [${String(done).padStart(3)}/${ENDPOINTS.length}] ${icons}\n`);

    // Throttle between batches to respect rate limits
    if (i + BATCH < ENDPOINTS.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Step 3: Report
  console.log(color(C.cyan, `\n[3/3] Report tayyar ho rahi hai...\n`));
  printReport(results);
}

main().catch(err => {
  console.error(color(C.red, `\nScript fail ho gaya: ${err.message}`));
  process.exit(1);
});
