import { Router } from "express";
import { db } from "@workspace/db";
import { dataExportLogsTable } from "@workspace/db/schema";
import { desc, count } from "drizzle-orm";
import { adminAuth } from "../admin-shared.js";
import { logger } from "../../lib/logger.js";
import { sendSuccess, sendError } from "../../lib/response.js";

const router = Router();

/* ══════════════════════════════════════════════════════════════════
   GET /admin/security/data-exports
   Returns a paginated list of data export audit records.
   Requires admin auth (mounted via admin.ts → adminAuth).
══════════════════════════════════════════════════════════════════ */
router.get("/security/data-exports", adminAuth, async (req, res) => {
  const limit  = Math.min(parseInt(String(req.query["limit"]  ?? "50"),  10), 200);
  const offset = Math.max(0, parseInt(String(req.query["offset"] ?? "0"), 10));

  try {
    const [rows, [totRow]] = await Promise.all([
      db.select()
        .from(dataExportLogsTable)
        .orderBy(desc(dataExportLogsTable.requestedAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(dataExportLogsTable),
    ]);

    sendSuccess(res, {
      exports: rows.map(r => ({
        id:          r.id,
        userId:      r.userId,
        maskedPhone: r.maskedPhone,
        ip:          r.ip,
        userAgent:   r.userAgent,
        requestedAt: r.requestedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        success:     r.success,
      })),
      total:  totRow?.total ?? 0,
      limit,
      offset,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, "[security/data-exports] DB query failed");
    sendError(res, "Failed to load data export logs", 500);
  }
});

export default router;
