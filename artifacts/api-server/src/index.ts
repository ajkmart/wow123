import 'dotenv/config';
import net from 'net';
import { execSync } from 'child_process';
import { createServer, runStartupTasks } from "./app.js";
import { startScheduler, stopScheduler } from "./scheduler.js";

/* ── Sentry error tracking (optional) ───────────────────────────────────────
   Initialized before anything else so it captures startup errors too.
   Only activates when SENTRY_DSN is set; silently skipped otherwise.
   Install:  pnpm --filter @workspace/api-server add @sentry/node
   Then set SENTRY_DSN in the Replit Secrets panel. */
if (process.env.SENTRY_DSN) {
  (async () => {
    try {
      const Sentry = await import("@sentry/node");
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV ?? "development",
        tracesSampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE ?? (process.env.NODE_ENV === "production" ? "0.2" : "0")),
        integrations: [],
      });
      (globalThis as Record<string, unknown>)["__sentryInstance"] = Sentry;
      console.log("[sentry] Initialized successfully");
    } catch {
      console.warn("[sentry] @sentry/node not installed — skipping. Run: pnpm --filter @workspace/api-server add @sentry/node");
    }
  })().catch(() => {});
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("[UnhandledRejection] at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[UncaughtException] Error:", err);
});

// ─── ENV FIRST-RUN CHECK ───────────────────────────────────────────────────
const CRITICAL_VARS = ["DATABASE_URL", "JWT_SECRET", "ENCRYPTION_MASTER_KEY"] as const;
const IMPORTANT_VARS = [
  "ADMIN_ACCESS_TOKEN_SECRET",
  "ADMIN_REFRESH_TOKEN_SECRET",
  "ADMIN_CSRF_SECRET",
  "ERROR_REPORT_HMAC_SECRET",
] as const;

function checkEnv(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const missing = CRITICAL_VARS.filter((k) => !process.env[k]);
  const empty   = IMPORTANT_VARS.filter((k) => !process.env[k]);

  if (missing.length === 0 && empty.length === 0) return;

  const hr  = "═".repeat(66);
  const pad = (s: string) => `║  ${s.padEnd(63)}║`;

  const lines: string[] = [
    `╔${hr}╗`,
    pad("⚠️  AJKMart API — ENVIRONMENT NOT CONFIGURED"),
    `╠${hr}╣`,
  ];

  if (missing.length > 0) {
    lines.push(pad("CRITICAL (server will not function correctly):"));
    for (const k of missing) lines.push(pad(`  ✗ ${k}`));
    lines.push(pad(""));
  }

  if (empty.length > 0) {
    lines.push(pad("MISSING (features may break or be insecure):"));
    for (const k of empty) lines.push(pad(`  ! ${k}`));
    lines.push(pad(""));
  }

  lines.push(`╠${hr}╣`);
  lines.push(pad("To fix:"));
  lines.push(pad(""));
  lines.push(pad("  On Replit:  add secrets in the Secrets panel (padlock icon)"));
  lines.push(pad("  Other envs: set values in your .env file at the project root"));
  lines.push(pad(""));
  lines.push(pad("  Then restart:   pnpm replit-start"));
  lines.push(`╚${hr}╝`);

  console.error("\n" + lines.join("\n") + "\n");

  if (isProduction && missing.length > 0) {
    console.error("[env:check] FATAL — critical vars missing in production. Exiting.");
    process.exit(1);
  }

  if (!isProduction && missing.length > 0) {
    console.warn("[env:check] Development mode — continuing despite missing critical vars.");
    console.warn("[env:check] Add missing secrets in the Replit Secrets panel, then restart.\n");
  }
}

checkEnv();
// ──────────────────────────────────────────────────────────────────────────

// Configuration from environment variables
const PORT = parseInt(process.env.PORT ?? "5000", 10);
const PORT_FALLBACK_ENABLE = (process.env.PORT_FALLBACK_ENABLE ?? "true").toLowerCase() === "true";
const PORT_MAX_RETRIES = parseInt(process.env.PORT_MAX_RETRIES ?? "10", 10);

/**
 * Returns true if a TCP listener is already bound to the port.
 * @param p - Port number to check
 */
function isPortInUse(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.debug(`[port:check] Port ${p} is in use (EADDRINUSE)`);
        resolve(true);
      } else {
        console.warn(`[port:check] Unexpected error checking port ${p}:`, err.code, err.message);
        resolve(false);
      }
    });
    probe.once("listening", () => {
      probe.close(() => {
        console.debug(`[port:check] Port ${p} is available`);
        resolve(false);
      });
    });
    probe.listen(p, "0.0.0.0");
  });
}

/**
 * Try to free the port by killing whatever process is using it.
 * @param p - Port number to free
 * @returns true if a process was killed, false otherwise
 */
function tryKillPort(p: number): boolean {
  try {
    // fuser is available via psmisc (declared in nix packages in .replit)
    execSync(`fuser -k ${p}/tcp`, { stdio: "ignore" });
    console.log(`[port:kill] Freed port ${p} using fuser`);
    return true;
  } catch {
    console.debug(`[port:kill] fuser: no process on port ${p}`);
    return false;
  }
}

/**
 * Find the next available port starting from `start`.
 * @param start - Starting port number
 * @param maxAttempts - Maximum number of ports to try
 * @returns Available port number
 * @throws Error if no available port is found
 */
async function findAvailablePort(start: number, maxAttempts: number): Promise<number> {
  console.log(`[port:search] Searching for available port starting from ${start} (max ${maxAttempts} attempts)`);
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = start + i;
    const inUse = await isPortInUse(candidate);
    if (!inUse) {
      console.log(`[port:search] Found available port: ${candidate}`);
      return candidate;
    }
  }
  const error = `No available port found in range ${start}–${start + maxAttempts - 1}`;
  console.error(`[port:search] ${error}`);
  throw new Error(error);
}

/**
 * Main server startup function with production-grade port handling.
 */
async function main() {
  let listenPort = PORT;

  console.log(`[port:init] Primary port: ${PORT}, fallback enabled: ${PORT_FALLBACK_ENABLE}, max retries: ${PORT_MAX_RETRIES}`);

  // Check if primary port is available
  const occupied = await isPortInUse(PORT);
  if (occupied) {
    console.warn(`[port:conflict] Port ${PORT} is already in use`);

    if (!PORT_FALLBACK_ENABLE) {
      console.error(`[port:conflict] Port fallback is disabled — refusing to continue`);
      process.exit(1);
    }

    // Try to free the port
    console.log(`[port:conflict] Attempting to free port ${PORT}…`);
    const killed = tryKillPort(PORT);
    if (killed) {
      // Give the OS a moment to release the port
      await new Promise((r) => setTimeout(r, 500));
      const stillOccupied = await isPortInUse(PORT);
      if (stillOccupied) {
        console.warn(`[port:conflict] Port ${PORT} still occupied after killing process — falling back`);
        listenPort = await findAvailablePort(PORT + 1, PORT_MAX_RETRIES);
        console.log(`[port:fallback] Using fallback port ${listenPort} instead of primary port ${PORT}`);
      } else {
        console.log(`[port:conflict] Port ${PORT} successfully freed — using primary port`);
        listenPort = PORT;
      }
    } else {
      console.log(`[port:conflict] Could not free port ${PORT} (no process to kill) — falling back`);
      listenPort = await findAvailablePort(PORT + 1, PORT_MAX_RETRIES);
      console.log(`[port:fallback] Using fallback port ${listenPort} instead of primary port ${PORT}`);
    }
  } else {
    console.log(`[port:check] Primary port ${PORT} is available`);
  }

  const server = createServer();

  // Open the port FIRST so the platform's port detector sees a live listener
  // quickly. Migrations + RBAC seeding run immediately after; if they fail,
  // we exit non-zero so the platform restarts us.
  const httpServer = server.listen(listenPort, "0.0.0.0", () => {
    const addr = httpServer.address();
    console.log(`[server:listen] Server listening on port ${listenPort} (addr=${JSON.stringify(addr)})`);

    runStartupTasks()
      .then(() => {
        console.log("[startup] migrations + RBAC ready — serving requests");
        startScheduler();
        console.log("[startup] background scheduler started");
      })
      .catch((err: Error) => {
        console.error("[startup] fatal — refusing to continue:", err);
        process.exit(1);
      });
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`[server:error] Failed to bind port ${listenPort}:`, {
      code: err.code,
      message: err.message,
      errno: err.errno
    });
    process.exit(1);
  });

  /* ── Graceful shutdown ────────────────────────────────────────────────────
     On SIGTERM (container stop / platform restart) or SIGINT (Ctrl-C):
       1. Stop accepting new connections.
       2. Call stopScheduler() — clears all cleanup job timers and stops the
          ride dispatch engine, allowing in-flight DB queries to settle.
       3. Close existing HTTP connections, then exit cleanly.
  ───────────────────────────────────────────────────────────────────────── */
  const gracefulShutdown = (signal: string) => {
    console.log(`[shutdown] ${signal} received — initiating graceful shutdown`);
    stopScheduler();
    httpServer.close((closeErr) => {
      if (closeErr) {
        console.error("[shutdown] error closing HTTP server:", closeErr);
        process.exit(1);
      } else {
        console.log("[shutdown] HTTP server closed — exiting");
        process.exit(0);
      }
    });
    /* Safety net: force-exit after 10 s if connections don't drain */
    setTimeout(() => {
      console.error("[shutdown] graceful shutdown timed out — force exiting");
      process.exit(1);
    }, 10_000).unref();
  };

  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT",  () => gracefulShutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[startup] Unrecoverable error:", err);
  process.exit(1);
});
