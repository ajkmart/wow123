#!/usr/bin/env node
import fs, { existsSync, statSync } from "fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const c = {
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow:s => `\x1b[33m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

function log(msg)  { console.log(`[secure-start] ${msg}`); }
function warn(msg) { console.warn(`[secure-start] ${c.yellow(msg)}`); }
function err(msg)  { console.error(`[secure-start] ${c.red(msg)}`); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function run(label, cmd, args, opts = {}) {
  log(label);
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: false, ...opts });
  if (result.status !== 0) {
    err(`${label} failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

function runOptional(label, cmd, args, opts = {}) {
  log(label);
  const result = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: false, ...opts });
  if (result.status !== 0) warn(`${label} exited with ${result.status} — continuing`);
}

function installDeps() {
  const stamp = path.join(root, "node_modules", ".secure-start-stamp");
  const lock  = path.join(root, "pnpm-lock.yaml");
  const stampTime = existsSync(stamp) ? statSync(stamp).mtimeMs : 0;
  const lockTime  = existsSync(lock)  ? statSync(lock).mtimeMs  : Infinity;
  if (!existsSync(path.join(root, "node_modules")) || lockTime > stampTime) {
    run("Installing dependencies", "pnpm", ["install", "--no-frozen-lockfile"]);
    try { fs.writeFileSync(stamp, String(Date.now())); } catch {}
  } else {
    log("node_modules up to date — skipping install");
  }
}

function decryptEnv() {
  if (existsSync(path.join(root, ".env")) && statSync(path.join(root, ".env")).size > 0) {
    log(".env already present — skipping decrypt");
    return;
  }
  if (existsSync(path.join(root, ".env.enc"))) {
    runOptional("Decrypting .env.enc", "pnpm", ["run", "decrypt-env"]);
  } else {
    log("No .env or .env.enc — relying on environment secrets");
  }
}

function pushDb() {
  if (!process.env.DATABASE_URL) {
    warn("DATABASE_URL not set — skipping DB push");
    return;
  }
  runOptional("Pushing DB schema", "pnpm", ["--filter", "@workspace/db", "push"]);
}

// ── Health check ──────────────────────────────────────────────────────────────

async function healthCheck(name, url, retries = 20, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok || res.status < 500) {
        log(`${c.green("✓")} ${name} is up (${url})`);
        return true;
      }
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, delayMs));
  }
  warn(`${name} did not respond at ${url} after ${retries} attempts`);
  return false;
}

// ── Service launcher ──────────────────────────────────────────────────────────

function startService(name, pnpmArgs, env = {}) {
  log(`Starting ${name}…`);
  const proc = spawn("pnpm", pnpmArgs, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    detached: true,
    shell: false,
  });
  proc.on("error", e => err(`[${name}] spawn error: ${e.message}`));
  proc.on("exit", code => {
    if (code !== 0 && code !== null) {
      err(`[${name}] exited with code ${code}`);
      process.exitCode = code;
    }
  });
  proc.unref();
  return proc;
}

// ── Signal handlers ───────────────────────────────────────────────────────────

const children = [];

function shutdown(signal) {
  log(`Received ${signal} — stopping services…`);
  for (const child of children) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
  }
  process.exit(0);
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const apiPort    = process.env.PORT               || "5000";
  const adminPort  = process.env.ADMIN_DEV_PORT    || "23744";
  const vendorPort = process.env.VENDOR_DEV_PORT   || "3002";
  const riderPort  = process.env.RIDER_DEV_PORT    || "3001";
  const ajkPort    = process.env.PORT_AJK           || "19006";
  const domain     = process.env.REPLIT_DEV_DOMAIN || "";
  const expoDomain = process.env.REPLIT_EXPO_DEV_DOMAIN || domain;

  const apiProxy = `http://127.0.0.1:${apiPort}`;

  log("=== AJKMart secure-start ===");

  installDeps();
  decryptEnv();
  // DB schema is applied by the API server's own migration runner on startup.
  // Skipping drizzle-kit push here to avoid interactive prompts.

  const services = [
    {
      name:    "api",
      args:    ["--filter", "@workspace/api-server", "dev"],
      env:     { PORT: apiPort, NODE_ENV: "development", EXPO_DEV_PORT: ajkPort },
      healthUrl: `http://127.0.0.1:${apiPort}/api/health`,
    },
    {
      name:    "admin",
      args:    ["--filter", "@workspace/admin", "dev"],
      env:     { ADMIN_DEV_PORT: adminPort, HOST: "0.0.0.0", BASE_PATH: "/admin/", VITE_API_PROXY_TARGET: apiProxy },
      healthUrl: `http://127.0.0.1:${adminPort}/`,
    },
    {
      name:    "vendor",
      args:    ["--filter", "@workspace/vendor-app", "dev"],
      env:     { VENDOR_DEV_PORT: vendorPort, HOST: "0.0.0.0", BASE_PATH: "/vendor/", VITE_API_PROXY_TARGET: apiProxy },
      healthUrl: `http://127.0.0.1:${vendorPort}/`,
    },
    {
      name:    "rider",
      args:    ["--filter", "@workspace/rider-app", "dev"],
      env:     { RIDER_DEV_PORT: riderPort, HOST: "0.0.0.0", BASE_PATH: "/rider/", VITE_API_PROXY_TARGET: apiProxy },
      healthUrl: `http://127.0.0.1:${riderPort}/`,
    },
    {
      name:    "ajkmart",
      args:    ["--filter", "@workspace/ajkmart", "dev:web"],
      env:     {
        PORT: ajkPort,
        BASE_PATH: "/",
        EXPO_PUBLIC_DOMAIN:      expoDomain || `localhost:${apiPort}`,
        REPLIT_DEV_DOMAIN:       expoDomain || `localhost:${apiPort}`,
        REPLIT_EXPO_DEV_DOMAIN:  expoDomain || `localhost:${apiPort}`,
        REPL_ID: process.env.REPL_ID || "secure-start",
      },
      healthUrl: `http://127.0.0.1:${ajkPort}/`,
    },
  ];

  for (const svc of services) {
    const proc = startService(svc.name, svc.args, svc.env);
    if (proc) children.push(proc);
  }

  log("All services launched — running health checks…");

  await Promise.all(services.map(svc => healthCheck(svc.name, svc.healthUrl)));

  const base     = domain ? `https://${domain}` : `http://localhost:${apiPort}`;
  const expoBase = expoDomain ? `https://${expoDomain}` : `http://localhost:${ajkPort}`;

  console.log("");
  console.log(c.bold("╔══════════════════════════════════════════════════════════╗"));
  console.log(c.bold("║            AJKMart — all services running                ║"));
  console.log(c.bold("╠══════════════════════════════════════════════════════════╣"));
  console.log(`║  API         ${(base + "/api").padEnd(44)} ║`);
  console.log(`║  Admin       ${(base + "/admin/").padEnd(44)} ║`);
  console.log(`║  Vendor      ${(base + "/vendor/").padEnd(44)} ║`);
  console.log(`║  Rider       ${(base + "/rider/").padEnd(44)} ║`);
  console.log(`║  Customer    ${(expoBase + "/").padEnd(44)} ║`);
  console.log(c.bold("╚══════════════════════════════════════════════════════════╝"));
  console.log("");

  await new Promise(() => {});
}

main().catch(e => { err(String(e)); process.exit(1); });
