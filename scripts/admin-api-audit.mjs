#!/usr/bin/env node
/**
 * AJKMart Admin Panel — Comprehensive API Audit Script
 * Tests every admin API endpoint extracted from the frontend source.
 * Reports 404 and 500 errors with full details.
 *
 * Usage:  node scripts/admin-api-audit.mjs
 */

import { setTimeout as sleep } from "node:timers/promises";

const BASE = "http://localhost:5000";
const ADMIN_API = `${BASE}/api/admin`;

const USERNAME = process.env.AUDIT_USER ?? "superadmin";
const PASSWORD = process.env.AUDIT_PASS ?? "Admin@123";

/* ── colour helpers ─────────────────────────────────────── */
const c = {
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

/* ── auth ───────────────────────────────────────────────── */
async function login() {
  const r = await fetch(`${ADMIN_API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const json = await r.json().catch(() => ({}));
  const token = json?.data?.accessToken ?? json?.accessToken ?? json?.token;
  if (!token) throw new Error(`Login failed (${r.status}): ${JSON.stringify(json)}`);
  return token;
}

/* ── http helper ────────────────────────────────────────── */
async function hit(method, url, token, body) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-csrf-bypass": "audit",
  };
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    let text = "";
    try { text = await res.text(); } catch {}
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: String(e) };
  }
}

/* ─────────────────────────────────────────────────────────
   ENDPOINT DEFINITIONS
   Format: [METHOD, path_after_/api/admin, body?, description]
   "?" suffix on path = skip if returns 404 (expected for no data)
   ───────────────────────────────────────────────────────── */
const ENDPOINTS = [
  /* ── AUTH ── */
  ["GET",   "/auth/sessions",                        null,             "Admin auth sessions list"],
  ["GET",   "/app-overview",                         null,             "App overview"],
  ["GET",   "/me/preferences",                       null,             "Admin preferences"],

  /* ── USERS ── */
  ["GET",   "/users?page=1&limit=20",                null,             "Users list"],
  ["GET",   "/users/pending",                        null,             "Pending users"],
  ["GET",   "/users/search-riders?q=test",           null,             "Search riders"],

  /* ── ORDERS ── */
  ["GET",   "/orders?page=1&limit=20",               null,             "Orders list"],
  ["GET",   "/orders-stats",                         null,             "Orders stats"],
  ["GET",   "/parcel-enriched",                      null,             "Parcel enriched"],
  ["GET",   "/pharmacy-enriched",                    null,             "Pharmacy enriched"],
  ["GET",   "/parcel-bookings?page=1&limit=20",      null,             "Parcel bookings"],
  ["GET",   "/pharmacy-orders?page=1&limit=20",      null,             "Pharmacy orders"],

  /* ── PRODUCTS ── */
  ["GET",   "/products?page=1&limit=20",             null,             "Products list"],
  ["GET",   "/products/pending",                     null,             "Pending products"],

  /* ── VENDORS ── */
  ["GET",   "/vendors?page=1&limit=20",              null,             "Vendors list"],

  /* ── RIDES ── */
  ["GET",   "/rides?page=1&limit=20",                null,             "Rides list"],
  ["GET",   "/ride-services",                        null,             "Ride services"],
  ["GET",   "/leaderboard",                          null,             "Rider leaderboard"],
  ["GET",   "/live-riders",                          null,             "Live riders"],
  ["GET",   "/dispatch-monitor",                     null,             "Dispatch monitor"],
  ["GET",   "/customer-locations",                   null,             "Customer locations"],
  ["GET",   "/locations",                            null,             "Locations"],
  ["GET",   "/fleet-analytics?from=2024-01-01&to=2024-12-31", null,   "Fleet analytics"],
  ["GET",   "/fleet/dashboard-export",               null,             "Fleet dashboard export"],
  ["GET",   "/fleet/vendors",                        null,             "Fleet vendors"],

  /* ── FINANCE ── */
  ["GET",   "/transactions-enriched?page=1&limit=20",null,             "Transactions enriched"],
  ["GET",   "/deposit-requests?page=1&limit=20",     null,             "Deposit requests"],
  ["GET",   "/withdrawal-requests?page=1&limit=20",  null,             "Withdrawal requests"],
  ["GET",   "/wallet/stats",                         null,             "Wallet stats"],
  ["GET",   "/wallet/p2p-transactions?page=1&limit=20",null,           "P2P transactions"],
  ["GET",   "/revenue-analytics",                    null,             "Revenue analytics"],
  ["GET",   "/revenue-trend",                        null,             "Revenue trend"],
  ["GET",   "/stats",                                null,             "Stats"],

  /* ── RIDERS ── */
  ["GET",   "/riders?page=1&limit=20",               null,             "Riders list"],

  /* ── CONTENT ── */
  ["GET",   "/banners",                              null,             "Banners list"],
  ["GET",   "/categories",                           null,             "Categories list"],
  ["GET",   "/categories/tree",                      null,             "Categories tree"],
  ["GET",   "/flash-deals",                          null,             "Flash deals"],
  ["GET",   "/promo-codes",                          null,             "Promo codes"],
  ["GET",   "/broadcasts",                           null,             "Broadcasts"],
  ["GET",   "/broadcast/recipients/count",           null,             "Broadcast recipient count"],

  /* ── SETTINGS / SYSTEM ── */
  ["GET",   "/platform-settings",                    null,             "Platform settings"],
  ["GET",   "/platform-settings/backup",             null,             "Platform settings backup"],
  ["GET",   "/inventory-settings",                   null,             "Inventory settings"],
  ["GET",   "/all-notifications?role=admin",         null,             "All notifications"],
  ["GET",   "/audit-log?page=1&limit=20",            null,             "Audit log"],
  ["GET",   "/system/diagnostics",                   null,             "System diagnostics"],
  ["GET",   "/system/health-dashboard",              null,             "Health dashboard"],
  ["GET",   "/system/admin-ip-lockouts?page=1",      null,             "Admin IP lockouts"],
  ["GET",   "/sms-gateways",                         null,             "SMS gateways"],
  ["GET",   "/weather-config",                       null,             "Weather config"],

  /* ── ROLES / RBAC ── */
  ["GET",   "/system/rbac/roles",                    null,             "RBAC roles"],
  ["GET",   "/system/rbac/permissions",              null,             "RBAC permissions"],

  /* ── REVIEWS ── */
  ["GET",   "/reviews?page=1&limit=20",              null,             "Reviews list"],
  ["GET",   "/reviews/moderation-queue",             null,             "Reviews moderation queue"],
  ["GET",   "/reviews/import",                       null,             "Reviews import (check)"],
  ["GET",   "/vendor-ratings?page=1&limit=20",       null,             "Vendor ratings"],

  /* ── DELIVERY ACCESS ── */
  ["GET",   "/delivery-access",                      null,             "Delivery access status"],
  ["GET",   "/delivery-access/requests",             null,             "Delivery access requests"],
  ["GET",   "/delivery-access/whitelist",            null,             "Delivery access whitelist"],
  ["GET",   "/delivery-access/audit",                null,             "Delivery access audit"],

  /* ── WHITELIST ── */
  ["GET",   "/whitelist",                            null,             "Admin whitelist"],

  /* ── CONDITIONS / RULES ── */
  ["GET",   "/conditions?page=1&limit=20",           null,             "Conditions list"],
  ["GET",   "/condition-rules",                      null,             "Condition rules"],
  ["GET",   "/condition-settings",                   null,             "Condition settings"],

  /* ── POPUPS ── */
  ["GET",   "/popups",                               null,             "Popups campaigns"],
  ["GET",   "/popups/templates",                     null,             "Popups templates"],

  /* ── PROMOTIONS ── */
  ["GET",   "/promotions/campaigns",                 null,             "Promotions campaigns"],
  ["GET",   "/promotions/offers",                    null,             "Promotions offers"],
  ["GET",   "/promotions/offers/pending",            null,             "Promotions offers pending"],
  ["GET",   "/promotions/analytics",                 null,             "Promotions analytics"],
  ["GET",   "/promotions/ai-recommendations",        null,             "Promotions AI recommendations"],

  /* ── SOS ── */
  ["GET",   "/sos/alerts?status=pending",            null,             "SOS alerts"],

  /* ── COMMUNICATION ── */
  ["GET",   "/communication/dashboard",              null,             "Communication dashboard"],
  ["GET",   "/communication/conversations?page=1&limit=20&search=", null, "Communication conversations"],
  ["GET",   "/communication/roles",                  null,             "Communication roles"],
  ["GET",   "/communication/roles/ai-status",        null,             "Communication AI status"],
  ["GET",   "/communication/settings",               null,             "Communication settings"],
  ["GET",   "/communication/calls?page=1&limit=20",  null,             "Communication calls"],
  ["GET",   "/communication/ai-logs?page=1&limit=20",null,             "Communication AI logs"],
  ["GET",   "/communication/flags?status=open",      null,             "Communication flags"],
  ["GET",   "/communication/users/search?q=test",    null,             "Communication user search"],
  ["GET",   "/communication/ajk-ids?page=1&limit=20",null,            "AJK IDs list"],

  /* ── CHAT MONITOR ── */
  ["GET",   "/chat-monitor/conversations?limit=200", null,             "Chat monitor conversations"],
  ["GET",   "/chat-monitor/reports?status=open",     null,             "Chat monitor reports"],

  /* ── LOYALTY ── */
  ["GET",   "/loyalty/users?page=1&limit=20",        null,             "Loyalty users"],

  /* ── WALLET TRANSFERS ── */
  ["GET",   "/wallet/p2p-transactions?page=1&limit=20",null,           "Wallet P2P transfers"],

  /* ── SEARCH ANALYTICS ── */
  ["GET",   "/search-analytics/interaction-timeline?days=7",null,      "Search analytics timeline"],
  ["GET",   "/search-analytics/interaction-stats?days=7",null,         "Search analytics stats"],
  ["GET",   "/search-analytics/zero-results?days=7&limit=50",null,     "Search analytics zero results"],
  ["GET",   "/search-analytics/top-terms?days=7&limit=30",null,        "Search analytics top terms"],

  /* ── ANALYTICS ── */
  ["GET",   "/wishlist-analytics",                   null,             "Wishlist analytics"],

  /* ── ERROR MONITOR ── */
  ["GET",   "/error-reports?page=1&limit=20",        null,             "Error reports list"],
  ["GET",   "/error-reports/auto-resolve-settings",  null,             "Auto-resolve settings"],
  ["GET",   "/error-reports/auto-resolve-log?limit=50",null,           "Auto-resolve log"],
  ["GET",   "/error-reports/file-scan/latest",       null,             "File scan latest"],
  ["GET",   "/error-reports/file-scan/history",      null,             "File scan history"],
  ["GET",   "/error-reports/customer-reports?page=1&limit=20",null,    "Customer reports"],

  /* ── LAUNCH CONTROL ── */
  ["GET",   "/launch/settings",                      null,             "Launch settings"],
  ["GET",   "/launch/vendor-plans",                  null,             "Vendor plans"],
  ["GET",   "/launch/role-presets",                  null,             "Role presets"],

  /* ── APP MANAGEMENT ── */
  ["GET",   "/admin-accounts",                       null,             "Admin accounts"],
  ["GET",   "/release-notes",                        null,             "Release notes"],

  /* ── EXPERIMENTS ── */
  ["GET",   "/experiments",                          null,             "Experiments list"],

  /* ── QR CODES ── */
  ["GET",   "/qr-codes",                             null,             "QR codes list"],

  /* ── DEEP LINKS ── */
  ["GET",   "/deep-links",                           null,             "Deep links list"],

  /* ── WEBHOOKS ── */
  ["GET",   "/webhooks",                             null,             "Webhooks list"],

  /* ── SECURITY ── */
  ["GET",   "/security/data-exports?page=1&limit=20",null,             "Security data exports"],

  /* ── SCHOOL ROUTES ── */
  ["GET",   "/school-routes",                        null,             "School routes"],
  ["GET",   "/school-subscriptions",                 null,             "School subscriptions"],

  /* ── SERVICE ZONES ── */
  ["GET",   "/service-zones",                        null,             "Service zones"],

  /* ── LEGAL ── */
  ["GET",   "/legal/terms-versions",                 null,             "Terms versions"],
  ["GET",   "/legal/consent-log?page=1&limit=20",    null,             "Consent log"],

  /* ── KYC ── */
  ["GET",   "/users?kycStatus=pending&page=1&limit=20",null,           "KYC pending users"],

  /* ── JOBS ── */
  ["POST",  "/jobs/rating-suspension",               {},               "Rating suspension job (POST dry-run)"],

  /* ── WEATHER ── */
  ["GET",   "/weather-config",                       null,             "Weather config (duplicate check)"],

  /* ── WHATSAPP ── */
  ["GET",   "/whatsapp/delivery-log",                null,             "WhatsApp delivery log (admin path)"],

  /* ── VAN ── */
  ["GET",   "/van/schedules?page=1&limit=20",        null,             "Van schedules"],

  /* ── BUSINESS RULES ── */
  ["GET",   "/business-rules",                       null,             "Business rules"],
];

/* ── Extra: hit the non-admin paths that frontend uses via adminAbsoluteFetch ── */
const ABSOLUTE_ENDPOINTS = [
  ["GET",  `${BASE}/api/webhooks/whatsapp/delivery-log?page=1&limit=20`, "WhatsApp delivery log (webhook path)"],
  ["GET",  `${BASE}/api/health`,                                          "API health check"],
];

/* ─────────────────────────────────────────────────────────
   RUNNER
   ───────────────────────────────────────────────────────── */
async function main() {
  console.log(c.bold("\n╔══════════════════════════════════════════════════╗"));
  console.log(c.bold("║   AJKMart Admin Panel — API Audit Script         ║"));
  console.log(c.bold("╚══════════════════════════════════════════════════╝\n"));

  console.log(c.cyan(`▸ Logging in as ${USERNAME}…`));
  let token;
  try {
    token = await login();
    console.log(c.green("✓ Login successful\n"));
  } catch (e) {
    console.error(c.red(`✗ Login failed: ${e.message}`));
    process.exit(1);
  }

  const errors   = [];   /* 404/500 */
  const warnings = [];   /* unexpected 4xx */
  const ok       = [];   /* 200/201/202/204 */
  const total    = ENDPOINTS.length + ABSOLUTE_ENDPOINTS.length;
  let   done     = 0;

  /* ── admin endpoints ── */
  for (const [method, path, body, label] of ENDPOINTS) {
    const url = `${ADMIN_API}${path}`;
    const { status, text } = await hit(method, url, token, body);
    done++;

    const pct  = String(Math.round((done / total) * 100)).padStart(3);
    const icon = status >= 500 ? "✗" : status === 404 ? "✗" : status === 0 ? "✗" : status >= 400 ? "!" : "✓";
    const col  = status >= 500 ? c.red : status === 404 ? c.red : status === 0 ? c.red : status >= 400 ? c.yellow : c.green;

    process.stdout.write(`${c.dim(`[${pct}%]`)} ${col(icon)} ${String(status || "ERR").padEnd(4)} ${method.padEnd(7)} ${path.padEnd(55)} ${c.dim(label)}\n`);

    if (status === 404 || status >= 500 || status === 0) {
      let snippet = "";
      try { snippet = JSON.parse(text)?.error ?? JSON.parse(text)?.message ?? text.slice(0, 120); } catch { snippet = text.slice(0, 120); }
      errors.push({ method, url: path, status, label, snippet });
    } else if (status >= 400) {
      warnings.push({ method, url: path, status, label });
    } else {
      ok.push({ method, url: path, status });
    }

    await sleep(40); /* gentle rate-limit */
  }

  /* ── absolute endpoints ── */
  for (const [method, url, label] of ABSOLUTE_ENDPOINTS) {
    const { status, text } = await hit(method, url, token, null);
    done++;
    const pct  = String(Math.round((done / total) * 100)).padStart(3);
    const icon = status >= 500 ? "✗" : status === 404 ? "✗" : status === 0 ? "✗" : "✓";
    const col  = status >= 500 ? c.red : status === 404 ? c.red : status === 0 ? c.red : c.green;
    process.stdout.write(`${c.dim(`[${pct}%]`)} ${col(icon)} ${String(status || "ERR").padEnd(4)} ${method.padEnd(7)} ${url.replace(BASE, "").padEnd(55)} ${c.dim(label)}\n`);
    if (status === 404 || status >= 500 || status === 0) {
      let snippet = "";
      try { snippet = JSON.parse(text)?.error ?? text.slice(0, 120); } catch { snippet = text.slice(0, 120); }
      errors.push({ method, url: url.replace(BASE, ""), status, label, snippet });
    } else if (status >= 400) {
      warnings.push({ method, url: url.replace(BASE, ""), status, label });
    } else {
      ok.push({ method, url: url.replace(BASE, ""), status });
    }
  }

  /* ── REPORT ── */
  console.log("\n" + c.bold("═".repeat(65)));
  console.log(c.bold("  AUDIT REPORT"));
  console.log(c.bold("═".repeat(65)));

  console.log(`\n  ${c.green(`✓ Passed : ${ok.length}`)}`);
  console.log(`  ${c.yellow(`! Warnings: ${warnings.length} (unexpected 4xx, not 404/500)`)}`);
  console.log(`  ${c.red(`✗ Failed  : ${errors.length} (404 or 500)`)}`);
  console.log(`  Total tested: ${total}\n`);

  if (warnings.length) {
    console.log(c.bold(c.yellow("── WARNINGS (unexpected 4xx) ──────────────────────────")));
    for (const w of warnings) {
      console.log(`  ${c.yellow("!")} ${w.status}  ${w.method.padEnd(7)} ${w.url}`);
      console.log(c.dim(`       ${w.label}`));
    }
    console.log();
  }

  if (errors.length === 0) {
    console.log(c.bold(c.green("  All endpoints responded correctly — no 404 or 500 errors!\n")));
  } else {
    console.log(c.bold(c.red("── ERRORS (404 / 500) ─────────────────────────────────")));
    for (const e of errors) {
      const badLabel = e.status === 0 ? "CONNECTION ERROR" : e.status === 404 ? "NOT FOUND" : "SERVER ERROR";
      console.log(`\n  ${c.red("✗")} ${c.bold(`${e.status} ${badLabel}`)}`);
      console.log(`    Method : ${e.method}`);
      console.log(`    Path   : ${e.url}`);
      console.log(`    Label  : ${e.label}`);
      if (e.snippet) console.log(`    Error  : ${c.dim(e.snippet)}`);
    }
    console.log();
    console.log(c.red(`  → ${errors.length} endpoint(s) need fixing.\n`));
  }

  /* ── write JSON report ── */
  const report = {
    auditedAt: new Date().toISOString(),
    total,
    passed: ok.length,
    warnings: warnings.length,
    failed: errors.length,
    errors,
    warnList: warnings,
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync("admin-audit-report.json", JSON.stringify(report, null, 2));
  console.log(c.dim("  Full report saved → admin-audit-report.json\n"));

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(c.red(`Fatal: ${e.message}`));
  process.exit(1);
});
