import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, walletTransactionsTable } from "@workspace/db/schema";
import { or, sql, desc } from "drizzle-orm";
import { sendSuccess, sendError } from "../lib/response.js";
import { getCachedSettings } from "./admin-shared.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/settings", async (_req, res) => {
  try {
    const s = await getCachedSettings();
    sendSuccess(res, {
      settings: {
        pointsRate:       parseFloat(s["loyalty_points_rate"]         ?? "1"),
        pointsPerOrder:   parseFloat(s["loyalty_points_per_order"]    ?? "10"),
        minRedeemPoints:  parseInt(s["loyalty_min_redeem_points"]     ?? "100"),
        enabled:          s["loyalty_enabled"] !== "false",
        pointsLabel:      s["loyalty_points_label"]                   ?? "Points",
        expiryDays:       parseInt(s["loyalty_points_expiry_days"]    ?? "0"),
      },
    });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] settings error");
    sendError(res, "Failed to fetch loyalty settings", 500);
  }
});

router.get("/leaderboard", async (_req, res) => {
  try {
    const txns = await db
      .select({
        userId: walletTransactionsTable.userId,
        type:   walletTransactionsTable.type,
        amount: walletTransactionsTable.amount,
        reference: walletTransactionsTable.reference,
      })
      .from(walletTransactionsTable)
      .where(
        or(
          sql`${walletTransactionsTable.type} = 'loyalty'`,
          sql`${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%'`,
        )!,
      );

    const perUser = new Map<string, { earned: number; redeemed: number }>();
    for (const t of txns) {
      if (!perUser.has(t.userId)) perUser.set(t.userId, { earned: 0, redeemed: 0 });
      const u = perUser.get(t.userId)!;
      const amt = parseFloat(t.amount ?? "0");
      if (t.reference === "admin_loyalty_debit") {
        u.redeemed += amt;
      } else if (t.type === "loyalty") {
        u.earned += amt;
      } else if (t.type === "credit" && t.reference?.startsWith("loyalty_redeem_")) {
        u.redeemed += amt;
      }
    }

    const topEntries = Array.from(perUser.entries())
      .map(([userId, { earned, redeemed }]) => ({
        userId,
        points: Math.max(0, Math.floor(earned) - Math.floor(redeemed)),
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 20);

    if (topEntries.length === 0) {
      sendSuccess(res, { leaderboard: [] });
      return;
    }

    const users = await db
      .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, avatar: usersTable.avatar })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt));

    const userMap = new Map(users.map(u => [u.id, u]));

    const leaderboard = topEntries.map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
      user: userMap.get(entry.userId) ?? { id: entry.userId, name: null, phone: null, avatar: null },
    }));

    sendSuccess(res, { leaderboard });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] leaderboard error");
    sendError(res, "Failed to fetch leaderboard", 500);
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const txns = await db
      .select({
        userId:    walletTransactionsTable.userId,
        type:      walletTransactionsTable.type,
        amount:    walletTransactionsTable.amount,
        reference: walletTransactionsTable.reference,
      })
      .from(walletTransactionsTable)
      .where(
        or(
          sql`${walletTransactionsTable.type} = 'loyalty'`,
          sql`${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%'`,
        )!,
      );

    let totalIssued = 0;
    let totalRedeemed = 0;
    const earnerIds = new Set<string>();

    for (const t of txns) {
      const amt = parseFloat(t.amount ?? "0");
      if (t.reference === "admin_loyalty_debit") {
        totalRedeemed += amt;
      } else if (t.type === "loyalty") {
        totalIssued += amt;
        earnerIds.add(t.userId);
      } else if (t.type === "credit" && t.reference?.startsWith("loyalty_redeem_")) {
        totalRedeemed += amt;
      }
    }

    sendSuccess(res, {
      stats: {
        totalIssued:    Math.floor(totalIssued),
        totalRedeemed:  Math.floor(totalRedeemed),
        outstanding:    Math.max(0, Math.floor(totalIssued) - Math.floor(totalRedeemed)),
        uniqueEarners:  earnerIds.size,
      },
    });
  } catch (err) {
    logger.error({ err }, "[loyalty-full] stats error");
    sendError(res, "Failed to fetch loyalty stats", 500);
  }
});

export default router;
