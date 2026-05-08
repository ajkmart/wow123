import { Router } from "express";
import {
  db, ridesTable, usersTable, walletTransactionsTable, notificationsTable,
  and, eq, sql, or, isNull, asc, count,
  generateId, getCachedSettings, logger,
  getUserLanguage, t,
  emitRideUpdate, emitRideDispatchUpdate,
  broadcastRide, cleanupNotifiedRiders,
} from "./helpers.js";

const router = Router();

let dispatchCycleRunning = false;
async function runDispatchCycle() {
  if (dispatchCycleRunning) return;
  dispatchCycleRunning = true;
  try {
    const s = await getCachedSettings();
    const totalTimeoutSec = parseInt(s["dispatch_broadcast_timeout_sec"] ?? "90", 10);

    const pendingRides = await db.select().from(ridesTable)
      .where(and(
        or(eq(ridesTable.status, "searching"), eq(ridesTable.status, "bargaining")),
        isNull(ridesTable.riderId),
      ))
      .orderBy(asc(ridesTable.createdAt))
      .limit(50);

    if (pendingRides.length === 0) {
      await db.delete(rideNotifiedRidersTable)
        .where(sql`ride_id NOT IN (SELECT id FROM rides WHERE status IN ('searching', 'bargaining') AND rider_id IS NULL)`)
        .catch((e: Error) => logger.warn({ err: e.message }, "[dispatch-engine] orphan notified-riders cleanup failed"));
      return;
    }

    await db.delete(rideNotifiedRidersTable)
      .where(sql`ride_id NOT IN (SELECT id FROM rides WHERE status IN ('searching', 'bargaining') AND rider_id IS NULL)`)
      .catch((e: Error) => logger.warn({ err: e.message }, "[dispatch-engine] orphan notified-riders cleanup failed"));

    const DISPATCH_ROUND_INTERVAL_SEC = 45;
    const MAX_DISPATCH_ROUNDS = 3;

    for (const ride of pendingRides) {
      try {
        const createdMs = new Date(ride.createdAt!).getTime();
        const elapsedSec = (Date.now() - createdMs) / 1000;

        if (elapsedSec > totalTimeoutSec) {
          await db.transaction(async (tx) => {
            const [upd] = await tx.update(ridesTable)
              .set({ status: "expired", updatedAt: new Date() })
              .where(and(eq(ridesTable.id, ride.id), isNull(ridesTable.riderId)))
              .returning({ id: ridesTable.id });
            if (!upd) return;

            if (ride.paymentMethod === "wallet") {
              const rideRef = `ride:${ride.id}`;
              const txns = await tx.select({ type: walletTransactionsTable.type, amount: walletTransactionsTable.amount })
                .from(walletTransactionsTable)
                .where(and(
                  eq(walletTransactionsTable.userId, ride.userId),
                  eq(walletTransactionsTable.reference, rideRef),
                ));
              let netDebit = 0;
              for (const t of txns) {
                const a = parseFloat(t.amount);
                if (t.type === "debit") netDebit += a; else if (t.type === "credit") netDebit -= a;
              }
              if (netDebit > 0) {
                await tx.update(usersTable)
                  .set({ walletBalance: sql`wallet_balance + ${netDebit.toFixed(2)}`, updatedAt: new Date() })
                  .where(eq(usersTable.id, ride.userId));
                await tx.insert(walletTransactionsTable).values({
                  id: generateId(), userId: ride.userId, type: "credit",
                  amount: netDebit.toFixed(2),
                  description: `Ride expired — auto-refund #${ride.id.slice(-6).toUpperCase()}`,
                  reference: rideRef,
                });
              }
            }
          });

          const expLang = await getUserLanguage(ride.userId);
          await db.insert(notificationsTable).values({
            id: generateId(),
            userId: ride.userId,
            title: t("searching", expLang),
            body: t("noRequests", expLang),
            type: "ride",
            icon: "close-circle-outline",
          }).catch((e: Error) => logger.warn({ rideId: ride.id, userId: ride.userId, err: e.message }, "[dispatch-engine] expired-ride notification insert failed"));

          emitRideUpdate(ride.id);
          await cleanupNotifiedRiders(ride.id);
          continue;
        }

        const currentRound = Math.floor(elapsedSec / DISPATCH_ROUND_INTERVAL_SEC);
        const loopCount = ride.dispatchLoopCount ?? 0;

        if (currentRound >= MAX_DISPATCH_ROUNDS) {
          await db.transaction(async (tx) => {
            const [upd] = await tx.update(ridesTable)
              .set({ status: "no_riders", updatedAt: new Date() })
              .where(and(eq(ridesTable.id, ride.id), isNull(ridesTable.riderId)))
              .returning({ id: ridesTable.id });
            if (!upd) return;

            if (ride.paymentMethod === "wallet") {
              const rideRef = `ride:${ride.id}`;
              const txns = await tx.select({ type: walletTransactionsTable.type, amount: walletTransactionsTable.amount })
                .from(walletTransactionsTable)
                .where(and(
                  eq(walletTransactionsTable.userId, ride.userId),
                  eq(walletTransactionsTable.reference, rideRef),
                ));
              let netDebit = 0;
              for (const t of txns) {
                const a = parseFloat(t.amount);
                if (t.type === "debit") netDebit += a; else if (t.type === "credit") netDebit -= a;
              }
              if (netDebit > 0) {
                await tx.update(usersTable)
                  .set({ walletBalance: sql`wallet_balance + ${netDebit.toFixed(2)}`, updatedAt: new Date() })
                  .where(eq(usersTable.id, ride.userId));
                await tx.insert(walletTransactionsTable).values({
                  id: generateId(), userId: ride.userId, type: "credit",
                  amount: netDebit.toFixed(2),
                  description: `No riders found — auto-refund #${ride.id.slice(-6).toUpperCase()}`,
                  reference: rideRef,
                });
              }
            }
          });
          const noRiderLang = await getUserLanguage(ride.userId);
          await db.insert(notificationsTable).values({
            id: generateId(), userId: ride.userId,
            title: t("noRequests", noRiderLang),
            body: t("searching_driver", noRiderLang),
            type: "ride", icon: "close-circle-outline",
          }).catch((e: Error) => logger.warn({ rideId: ride.id, userId: ride.userId, err: e.message }, "[dispatch-engine] no-riders notification insert failed"));
          emitRideUpdate(ride.id);
          await cleanupNotifiedRiders(ride.id);
          continue;
        }

        if (currentRound > loopCount) {
          await db.update(ridesTable)
            .set({ dispatchLoopCount: currentRound, updatedAt: new Date() })
            .where(and(eq(ridesTable.id, ride.id), isNull(ridesTable.riderId)));
        }

        await broadcastRide(ride.id);
      } catch (rideErr) {
        logger.error(`[dispatch-engine] Error processing ride ${ride.id}:`, rideErr);
      }
    }
  } catch (err) {
    logger.error("[dispatch-engine] cycle error:", err);
  } finally {
    dispatchCycleRunning = false;
  }
}

let dispatchInterval: ReturnType<typeof setInterval> | null = null;
export function startDispatchEngine() {
  if (dispatchInterval) return;
  dispatchInterval = setInterval(runDispatchCycle, 10_000);
  logger.info("[dispatch-engine] started (every 10s)");
  runDispatchCycle();
}

export function stopDispatchEngine() {
  if (dispatchInterval) {
    clearInterval(dispatchInterval);
    dispatchInterval = null;
    logger.info("[dispatch-engine] stopped");
  }
}

export async function dispatchScheduledRides(): Promise<void> {
  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 15 * 60_000);
    const readyRides = await db.select({ id: ridesTable.id })
      .from(ridesTable)
      .where(and(
        eq(ridesTable.status, "scheduled"),
        sql`scheduled_at IS NOT NULL`,
        sql`scheduled_at <= ${windowEnd.toISOString()}`,
        sql`scheduled_at >= ${now.toISOString()}`,
      ));
    for (const ride of readyRides) {
      await db.update(ridesTable)
        .set({ status: "searching", updatedAt: new Date() })
        .where(and(eq(ridesTable.id, ride.id), eq(ridesTable.status, "scheduled")));
      broadcastRide(ride.id);
      emitRideDispatchUpdate({ rideId: ride.id, action: "scheduled_dispatch", status: "searching" });
      emitRideUpdate(ride.id);
      logger.info({ rideId: ride.id }, "[scheduled-dispatch] ride activated");
    }
  } catch (e) {
    logger.error({ err: e }, "[scheduled-dispatch] error");
  }
}

export default router;
