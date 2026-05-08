#!/usr/bin/env node
/**
 * Auto-restart wrapper for the API server.
 *
 * - Restarts the server process if it exits with a non-zero code (crash).
 * - Does NOT restart on SIGTERM (clean workflow stop from Replit).
 * - Waits RESTART_DELAY_SECONDS between restarts to prevent tight crash-loops.
 *
 * Uses stdio:'inherit' so tsx output flows directly to the workflow console
 * and Replit's port-scanner can detect the opened port normally.
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import path from "path";

// Load root .env before spawning tsx so secrets (JWT_SECRET, etc.) are available
function loadRootEnv() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(__dirname, "../../../.env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
loadRootEnv();

const _rawDelay = parseInt(process.env.RESTART_DELAY_SECONDS ?? "2", 10);
const RESTART_DELAY_MS = (Number.isFinite(_rawDelay) && _rawDelay >= 0 ? _rawDelay : 2) * 1000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");

let child = null;
let terminated = false;

function startServer() {
  if (terminated) return;

  console.log("[restart-wrapper] Starting API server\u2026");

  // Use local tsx binary from the package's node_modules to avoid PATH issues
  const tsxBin = path.resolve(PKG_ROOT, "node_modules", ".bin", "tsx");
  const tsxCmd = existsSync(tsxBin) ? tsxBin : "tsx";

  child = spawn(
    tsxCmd,
    ["--enable-source-maps", "./src/index.ts"],
    {
      stdio: "inherit",
      cwd: PKG_ROOT,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV ?? "development",
      },
    }
  );

  child.on("exit", (code, signal) => {
    child = null;

    if (terminated) {
      console.log("[restart-wrapper] Clean shutdown \u2014 exiting wrapper");
      process.exit(0);
    }

    if (code === 0) {
      console.log("[restart-wrapper] Server exited cleanly (code 0) \u2014 exiting wrapper");
      process.exit(0);
    }

    console.log(
      `[restart-wrapper] Server crashed (exit code=${code ?? "null"}, signal=${signal ?? "none"}) \u2014 restarting in ${RESTART_DELAY_MS / 1000}s\u2026`
    );
    setTimeout(startServer, RESTART_DELAY_MS);
  });

  child.on("error", (err) => {
    console.error("[restart-wrapper] Failed to spawn server process:", err.message);
    child = null;
    if (terminated) {
      process.exit(0);
    }
    console.log(`[restart-wrapper] Spawn error — retrying in ${RESTART_DELAY_MS / 1000}s\u2026`);
    setTimeout(startServer, RESTART_DELAY_MS);
  });
}

function shutdown(sig) {
  console.log(`[restart-wrapper] ${sig} received \u2014 shutting down (no restart)`);
  terminated = true;
  if (child) {
    child.kill("SIGTERM");
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer();
