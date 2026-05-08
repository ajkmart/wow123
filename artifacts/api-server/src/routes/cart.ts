import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { cartSnapshotsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { customerAuth } from "../middleware/security.js";
import { sendSuccess, sendError } from "../lib/response.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

/* ── GET /api/cart/snapshot — fetch the user's saved cart snapshot ── */
router.get("/snapshot", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const [row] = await db
      .select()
      .from(cartSnapshotsTable)
      .where(eq(cartSnapshotsTable.userId, userId))
      .limit(1);

    sendSuccess(res, { items: row?.items ?? [] });
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId }, "[cart] failed to fetch snapshot");
    sendError(res, "Failed to fetch cart snapshot", 500);
  }
});

/* ── PUT /api/cart/snapshot — upsert the user's cart snapshot ── */
router.put("/snapshot", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  const { items } = req.body;

  if (!Array.isArray(items)) {
    sendError(res, "items must be an array", 400);
    return;
  }

  try {
    await db
      .insert(cartSnapshotsTable)
      .values({ userId, items, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: cartSnapshotsTable.userId,
        set: {
          items,
          updatedAt: sql`NOW()`,
        },
      });

    sendSuccess(res, { saved: true });
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId }, "[cart] failed to save snapshot");
    sendError(res, "Failed to save cart snapshot", 500);
  }
});

/* ── DELETE /api/cart/snapshot — clear the user's cart snapshot ── */
router.delete("/snapshot", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    await db
      .delete(cartSnapshotsTable)
      .where(eq(cartSnapshotsTable.userId, userId));

    sendSuccess(res, { cleared: true });
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId }, "[cart] failed to clear snapshot");
    sendError(res, "Failed to clear cart snapshot", 500);
  }
});

export default router;
