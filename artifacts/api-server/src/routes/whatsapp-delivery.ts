import { Router } from "express";
import { Pool } from "pg";
import { buildPgPoolConfig } from "@workspace/db/connection-url";
import { sendSuccess, sendError } from "../lib/response.js";
import { logger } from "../lib/logger.js";

const router = Router();

let _pool: Pool | null = null;

function getPool(): Pool | null {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) return null;
  if (!_pool) {
    _pool = new Pool({ ...buildPgPoolConfig(databaseUrl), max: 3 });
    _pool.on("error", (err) => {
      logger.error("[whatsapp-delivery pool] Unexpected error:", err.message);
    });
  }
  return _pool;
}

router.get("/status", async (_req, res) => {
  const pool = getPool();
  if (!pool) { sendError(res, "Database not configured", 503); return; }

  try {
    const result = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM whatsapp_message_log
      GROUP BY status
      ORDER BY count DESC
    `);
    sendSuccess(res, { stats: result.rows });
  } catch (err) {
    logger.error({ err }, "[whatsapp-delivery] stats error");
    sendSuccess(res, { stats: [] });
  }
});

router.get("/messages", async (req, res) => {
  const pool = getPool();
  if (!pool) { sendError(res, "Database not configured", 503); return; }

  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
  const limit = Math.min(100, parseInt(String(req.query["limit"] ?? "50")));
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT * FROM whatsapp_message_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM whatsapp_message_log`);
    sendSuccess(res, {
      messages: result.rows,
      total: parseInt(String(countResult.rows[0]?.count ?? "0")),
      page,
      limit,
    });
  } catch (err) {
    logger.error({ err }, "[whatsapp-delivery] messages error");
    sendSuccess(res, { messages: [], total: 0, page, limit });
  }
});

router.get("/health", async (_req, res) => {
  const pool = getPool();
  if (!pool) { sendSuccess(res, { healthy: false, reason: "no_database" }); return; }

  try {
    await pool.query("SELECT 1");
    sendSuccess(res, { healthy: true });
  } catch {
    sendSuccess(res, { healthy: false, reason: "db_error" });
  }
});

export default router;
