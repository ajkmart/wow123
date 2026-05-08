import { db } from "@workspace/db";
import { otpAttemptsTable, rideBidsTable } from "@workspace/db/schema";
import { sql, lt } from "drizzle-orm";
import { logger } from "./lib/logger.js";
import { purgeExpiredIdempotencyKeys } from "./lib/cleanupIdempotencyKeys.js";
import { stopDispatchEngine } from "./routes/rides/dispatch.js";

/* ══════════════════════════════════════════════════════════════════════════
   scheduler.ts
   Central registry for all recurring background cleanup jobs.
   Call startScheduler() once at server startup (from index.ts).
   Call stopScheduler() in SIGTERM / SIGINT handlers to cleanly drain timers.

   Jobs managed here:
     1. Idempotency key expiry  — purge rows older than TTL (every 5 min)
     2. OTP attempt cleanup     — delete expired otp_attempts rows (every 5 min)
     3. Ride bid map cleanup    — delete stale ride_bids for non-pending rides (every 30 min)
══════════════════════════════════════════════════════════════════════════ */

const _timers: ReturnType<typeof setInterval>[] = [];

function register(
  label: string,
  fn: () => Promise<void>,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  const handle = setInterval(async () => {
    try {
      await fn();
    } catch (e: unknown) {
      logger.warn({ err: (e as Error).message, job: label }, "[scheduler] cleanup job failed");
    }
  }, intervalMs);
  _timers.push(handle);
  return handle;
}

/* ── Job implementations ─────────────────────────────────────────────────── */

async function purgeExpiredOtpAttempts(): Promise<void> {
  await db
    .delete(otpAttemptsTable)
    .where(sql`expires_at < now()`);
  logger.debug("[scheduler] otp-attempt cleanup ran");
}

async function purgeStaleRideBids(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(rideBidsTable)
    .where(lt(rideBidsTable.createdAt, cutoff))
    .returning({ id: rideBidsTable.id });
  if (deleted.length > 0) {
    logger.info({ count: deleted.length }, "[scheduler] purged stale ride bid rows");
  }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export function startScheduler(): void {
  register("idempotency-key-expiry", purgeExpiredIdempotencyKeys, 5 * 60_000);
  register("otp-attempt-cleanup",    purgeExpiredOtpAttempts,     5 * 60_000);
  register("ride-bid-map-cleanup",   purgeStaleRideBids,          30 * 60_000);
  logger.info(
    { jobs: ["idempotency-key-expiry", "otp-attempt-cleanup", "ride-bid-map-cleanup"] },
    "[scheduler] started",
  );
}

export function stopScheduler(): void {
  for (const handle of _timers) {
    clearInterval(handle);
  }
  _timers.length = 0;
  stopDispatchEngine();
  logger.info("[scheduler] all timers cleared");
}
