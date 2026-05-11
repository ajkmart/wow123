#!/usr/bin/env node
/**
 * AJKMart — rotate-secrets
 * ────────────────────────
 * Rotates all JWT / security secrets on a live server with zero downtime.
 *
 * What it does:
 *   1. Generates 11 fresh 64-byte hex secrets (JWT, CSRF, HMAC, AES key).
 *   2. Rebuilds .env.enc — preserving existing optional API keys (--merge).
 *   3. Writes a one-time .env.reload file so the restarting server picks up
 *      the new secrets immediately, even before any shell env is refreshed.
 *   4. Sends SIGHUP to the running API server — triggering a graceful drain
 *      (existing connections finish, new ones are queued) then a clean exit.
 *   5. The workflow / PM2 auto-restarts the process; secure-start.mjs
 *      detects .env.reload on startup and applies the new secrets.
 *   6. Polls /api/health until the server is back up (max 60 s).
 *   7. Reports rotation time and prints new secret previews.
 *
 * On Replit:  .env.reload bridges the gap until you update Replit Secrets.
 *             The script prints exact values ready to paste into the panel.
 * On Local/Codespaces: .env.enc is the source of truth — no manual steps.
 *
 * Usage:
 *   node scripts/rotate-secrets.mjs [options]
 *   pnpm rotate-secrets
 *
 * Options:
 *   --password <pw>   Encryption password (default: ENV_PASSWORD or Khan@123.com)
 *   --no-signal       Update .env.enc only — skip SIGHUP / health-check
 *   --force           Skip confirmation prompt
 *   --help            Show this help
 */

import {
  createCipheriv, createDecipheriv,
  randomBytes, scryptSync,
} from 'node:crypto';
import {
  readFileSync, writeFileSync, existsSync,
  unlinkSync, renameSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, '..');
const ENC_FILE   = path.join(ROOT, '.env.enc');
const RELOAD_FILE = path.join(ROOT, '.env.reload');
const PID_FILE   = '/tmp/ajkmart-api.pid';
const HEALTH_URL = `http://127.0.0.1:${process.env.PORT || 5000}/api/health`;
const ALGORITHM  = 'aes-256-gcm';
const ENC_SALT   = Buffer.from('AJKMart-Env-Salt-2024-v1', 'utf8');

// ── Colours ───────────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};
const col  = (code, s) => `${code}${s}${c.reset}`;
const ok   = s => console.log(col(c.green,  `  ✓  ${s}`));
const warn = s => console.log(col(c.yellow, `  ⚠  ${s}`));
const info = s => console.log(col(c.blue,   `  ℹ  ${s}`));
const die  = s => { console.error(col(c.red, `  ✗  ${s}`)); process.exit(1); };
const head = s => console.log(col(c.bold, s));

// ── CLI args ──────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const hasFlag  = f => args.includes(f);
const flagVal  = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
${col(c.bold, 'AJKMart rotate-secrets')} — zero-downtime secret rotation

${col(c.cyan, 'USAGE')}
  node scripts/rotate-secrets.mjs [options]
  pnpm rotate-secrets

${col(c.cyan, 'OPTIONS')}
  ${col(c.green, '--password <pw>')}  Encryption password (default: ENV_PASSWORD or Khan@123.com)
  ${col(c.green, '--no-signal')}      Update .env.enc only, skip SIGHUP / health-check
  ${col(c.green, '--force')}          Skip confirmation prompt
  ${col(c.green, '--help')}           Show this message
`);
  process.exit(0);
}

const OPT_NO_SIGNAL = hasFlag('--no-signal');
const OPT_FORCE     = hasFlag('--force');
const PASSWORD      = flagVal('--password') || process.env.ENV_PASSWORD || 'Khan@123.com';
const IS_REPLIT     = !!process.env.REPL_ID;
const API_PORT      = parseInt(process.env.PORT || '5000', 10);

// ── Secrets to regenerate ─────────────────────────────────────────────────────
const SECRET_KEYS = [
  'JWT_SECRET',
  'ADMIN_JWT_SECRET',
  'ADMIN_ACCESS_TOKEN_SECRET',
  'ADMIN_REFRESH_TOKEN_SECRET',
  'ADMIN_CSRF_SECRET',
  'ADMIN_REFRESH_SECRET',
  'ADMIN_SECRET',
  'VENDOR_JWT_SECRET',
  'RIDER_JWT_SECRET',
  'ENCRYPTION_MASTER_KEY',
  'ERROR_REPORT_HMAC_SECRET',
];

// ── Optional keys to preserve from existing .env.enc ─────────────────────────
const PRESERVE_KEYS = [
  'DATABASE_URL',
  'ADMIN_SEED_USERNAME', 'ADMIN_SEED_PASSWORD', 'ADMIN_SEED_EMAIL', 'ADMIN_SEED_NAME',
  'PORT', 'PORT_FALLBACK_ENABLE', 'PORT_MAX_RETRIES',
  'ADMIN_DEV_PORT', 'ADMIN_PORT_OVERRIDE', 'VENDOR_DEV_PORT', 'RIDER_DEV_PORT',
  'APP_BASE_URL', 'ADMIN_BASE_URL', 'FRONTEND_URL', 'CLIENT_URL', 'ALLOWED_ORIGINS',
  'ADMIN_LEGACY_AUTH_DISABLED', 'ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN',
  'LOG_LEVEL', 'NODE_ENV', 'JWT_ISSUER',
  'EXPO_PUBLIC_DOMAIN', 'VITE_API_BASE_URL', 'VITE_API_PROXY_TARGET',
  'GEMINI_API_KEY',
  'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER',
  'SENDGRID_API_KEY', 'SMTP_HOST',
  'GOOGLE_MAPS_API_KEY', 'OSRM_API_URL',
  'REDIS_URL', 'SENTRY_DSN', 'SENTRY_WEBHOOK_SECRET',
  'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_CONTACT_EMAIL',
  'STORAGE_BUCKET_URL', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY',
  'STORAGE_BUCKET_NAME', 'STORAGE_ENDPOINT', 'STORAGE_REGION',
  'VITE_TURN_SERVER_URL', 'VITE_TURN_USERNAME', 'VITE_TURN_CREDENTIAL',
  'ALLOWED_DOMAINS', 'DB_POOL_MAX',
];

// ── Crypto ────────────────────────────────────────────────────────────────────
const deriveKey = pw => scryptSync(pw, ENC_SALT, 32);

function encryptData(plain, pw) {
  const key = deriveKey(pw);
  const iv  = randomBytes(16);
  const ci  = createCipheriv(ALGORITHM, key, iv);
  let enc   = ci.update(plain, 'utf8', 'hex');
  enc      += ci.final('hex');
  return { encrypted: enc, iv: iv.toString('hex'), authTag: ci.getAuthTag().toString('hex') };
}

function decryptData(payload, pw) {
  const key = deriveKey(pw);
  const dc  = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'hex'));
  dc.setAuthTag(Buffer.from(payload.authTag, 'hex'));
  let d  = dc.update(payload.encrypted, 'hex', 'utf8');
  d     += dc.final('utf8');
  return d;
}

function loadExistingEnc() {
  if (!existsSync(ENC_FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(ENC_FILE, 'utf8'));
    return JSON.parse(decryptData(raw, PASSWORD));
  } catch { return {}; }
}

// ── Health check ──────────────────────────────────────────────────────────────
async function isHealthy() {
  try {
    const res = await fetch(`http://127.0.0.1:${API_PORT}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch { return false; }
}

async function waitForHealth(maxMs = 60_000, intervalMs = 2_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

// ── Readline confirm ──────────────────────────────────────────────────────────
function confirm(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, ans => { rl.close(); resolve(ans.trim().toLowerCase()); });
  });
}

// ── Format elapsed ────────────────────────────────────────────────────────────
function elapsed(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  console.log('');
  head('╔══════════════════════════════════════════════════════════╗');
  head('║          AJKMart  rotate-secrets                         ║');
  head('║          Zero-downtime JWT / security secret rotation    ║');
  head('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  if (IS_REPLIT) {
    info('Replit environment detected');
    info('.env.reload will bridge until you update Replit Secrets');
  }
  if (OPT_NO_SIGNAL) warn('--no-signal: will update .env.enc only, no SIGHUP sent');

  // ── Confirm ─────────────────────────────────────────────────────────────────
  if (!OPT_FORCE) {
    warn('This will rotate all JWT/security secrets and trigger a server reload.');
    warn('Active sessions will remain valid until tokens expire naturally.');
    const ans = await confirm(col(c.yellow, '  Continue? (yes/no): '));
    if (!['yes', 'y'].includes(ans)) {
      info('Aborted — no changes made.');
      process.exit(0);
    }
  }

  // ── Step 1: Load existing for merge ─────────────────────────────────────────
  console.log('');
  head('  Step 1 — Loading existing config…');
  const existing = loadExistingEnc();
  const existingCount = Object.keys(existing).length;
  if (existingCount > 0) {
    ok(`Loaded ${existingCount} vars from existing .env.enc`);
  } else {
    warn('No existing .env.enc — using defaults for config vars');
  }

  // ── Step 2: Generate new secrets ────────────────────────────────────────────
  console.log('');
  head('  Step 2 — Generating cryptographically-strong secrets…');
  const newSecrets = {};
  for (const key of SECRET_KEYS) {
    const bytes = key === 'ENCRYPTION_MASTER_KEY' ? 32 : 64;
    newSecrets[key] = randomBytes(bytes).toString('hex');
  }
  ok(`Generated ${SECRET_KEYS.length} new secrets (${SECRET_KEYS.length * 128}-bit entropy)`);

  // ── Step 3: Build final env and write .env.enc ───────────────────────────────
  console.log('');
  head('  Step 3 — Rebuilding .env.enc…');

  const finalEnv = {
    ...Object.fromEntries(PRESERVE_KEYS.map(k => [k, existing[k] ?? ''])),
    ...newSecrets,
  };

  // Backup + write
  if (existsSync(ENC_FILE)) {
    renameSync(ENC_FILE, ENC_FILE + '.bak');
    info('Old .env.enc backed up → .env.enc.bak');
  }
  writeFileSync(ENC_FILE, JSON.stringify(encryptData(JSON.stringify(finalEnv, null, 2), PASSWORD), null, 2));

  // Self-validate
  try {
    const raw    = JSON.parse(readFileSync(ENC_FILE, 'utf8'));
    const decoded = JSON.parse(decryptData(raw, PASSWORD));
    const mismatch = SECRET_KEYS.find(k => decoded[k] !== newSecrets[k]);
    if (mismatch) throw new Error(`Secret mismatch for ${mismatch}`);
    ok(`.env.enc written + self-validated (${Object.keys(finalEnv).length} vars)`);
  } catch (e) {
    die(`Self-validation FAILED: ${e.message}`);
  }

  // ── Step 4: Write .env.reload ────────────────────────────────────────────────
  console.log('');
  head('  Step 4 — Writing .env.reload…');
  const reloadLines = SECRET_KEYS.map(k => `${k}=${newSecrets[k]}`).join('\n') + '\n';
  writeFileSync(RELOAD_FILE, reloadLines);
  ok(`.env.reload written (${SECRET_KEYS.length} secrets, one-time use)`);

  if (OPT_NO_SIGNAL) {
    console.log('');
    warn('Skipping SIGHUP (--no-signal). Restart the server manually to apply.');
    printSummary(newSecrets, startTime);
    return;
  }

  // ── Step 5: Find API PID and send SIGHUP ─────────────────────────────────────
  console.log('');
  head('  Step 5 — Signalling API server…');

  let pid = null;
  if (existsSync(PID_FILE)) {
    try {
      const raw = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (Number.isFinite(raw) && raw > 0) {
        process.kill(raw, 0); // throws if not alive
        pid = raw;
      }
    } catch { /* stale */ }
  }

  // Fallback: try fuser
  if (!pid) {
    try {
      const out = execSync(`fuser ${API_PORT}/tcp 2>/dev/null`, { encoding: 'utf8' }).trim();
      const parsed = parseInt(out.trim().split(/\s+/)[0], 10);
      if (Number.isFinite(parsed) && parsed > 0) pid = parsed;
    } catch { /* ignore */ }
  }

  if (!pid) {
    warn(`Could not find API server PID — is it running on port ${API_PORT}?`);
    warn('.env.reload written. Start the server to apply new secrets.');
    printSummary(newSecrets, startTime);
    return;
  }

  info(`Found API server at PID ${pid}`);

  // Confirm server is currently healthy before signalling
  const wasHealthy = await isHealthy();
  if (!wasHealthy) {
    warn('API server is not responding to health checks — proceeding anyway');
  }

  try {
    process.kill(pid, 'SIGHUP');
    ok(`SIGHUP sent to PID ${pid} — graceful drain + reload initiated`);
  } catch (e) {
    die(`Failed to send SIGHUP to PID ${pid}: ${e.message}`);
  }

  // ── Step 6: Wait for restart ──────────────────────────────────────────────────
  console.log('');
  head('  Step 6 — Waiting for server to restart…');

  // Brief pause — server needs a moment to start shutting down
  await new Promise(r => setTimeout(r, 1500));

  // Wait until unhealthy (shutdown in progress)
  const downStart = Date.now();
  let downConfirmed = false;
  for (let i = 0; i < 15; i++) {
    if (!(await isHealthy())) { downConfirmed = true; break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (downConfirmed) {
    info(`Server went down after ${elapsed(Date.now() - downStart)}`);
  } else {
    warn('Server still up after drain timeout — it may have ignored the signal');
  }

  // Now wait for it to come back
  info('Waiting for server to come back up (max 60s)…');
  const upStart = Date.now();
  const isUp = await waitForHealth(60_000, 2_000);

  if (isUp) {
    ok(`Server back up in ${elapsed(Date.now() - upStart)}`);
  } else {
    warn('Server did not come back within 60s — check workflow logs');
    warn('.env.reload should be applied on next successful restart');
  }

  printSummary(newSecrets, startTime, !isUp);
}

// ── Summary ───────────────────────────────────────────────────────────────────
function printSummary(newSecrets, startTime, partial = false) {
  const totalMs = Date.now() - startTime;
  console.log('');
  head('╔══════════════════════════════════════════════════════════╗');
  head(partial
    ? '║  Rotation partially complete — server restart pending    ║'
    : '║  Rotation complete                                       ║');
  head(`║  Total time: ${elapsed(totalMs).padEnd(44)}║`);
  head('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  console.log(col(c.bold, '  New secrets (first 20 chars shown):'));
  for (const key of SECRET_KEYS) {
    const val = newSecrets[key];
    console.log(`  ${col(c.cyan, key.padEnd(35))} ${col(c.green, val.slice(0, 20))}…`);
  }

  if (IS_REPLIT) {
    console.log('');
    warn('Replit detected — update these in the Replit Secrets panel');
    warn('to make the rotation permanent across future restarts:');
    console.log('');
    for (const key of SECRET_KEYS) {
      console.log(`  ${col(c.yellow, key)}`);
      console.log(`  ${col(c.dim, newSecrets[key])}`);
      console.log('');
    }
  }
  console.log('');
}

main().catch(e => die(`Unexpected error: ${e.message}`));
