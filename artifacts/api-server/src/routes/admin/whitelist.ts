/**
 * Admin routes for OTP Whitelist management.
 * Mounted at /api/admin/whitelist
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { whitelistUsersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateId } from "../../lib/id.js";
import { adminAuth } from "../admin-shared.js";
import { sendSuccess, sendError, sendNotFound } from "../../lib/response.js";

const router = Router();
router.use(adminAuth);

/* GET /api/admin/whitelist */
router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(whitelistUsersTable)
    .orderBy(desc(whitelistUsersTable.createdAt));
  res.json({ entries: rows });
});

/* POST /api/admin/whitelist */
router.post("/", async (req, res) => {
  const { identifier, label, bypassCode, expiresAt } = req.body;

  if (!identifier) { sendError(res, "identifier (phone or email) is required"); return; }

  const id = generateId();
  try {
    const [row] = await db.insert(whitelistUsersTable).values({
      id,
      identifier: identifier.toLowerCase().trim(),
      label: label || null,
      bypassCode: bypassCode ?? "000000",
      isActive: true,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }).returning();
    sendSuccess(res, { entry: row });
  } catch (err: any) {
    if (err.message?.includes("unique")) {
      sendError(res, "This identifier is already in the whitelist");
      return;
    }
    throw err;
  }
});

/* PATCH /api/admin/whitelist/:id */
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { label, bypassCode, isActive, expiresAt } = req.body;

  const [existing] = await db.select({ id: whitelistUsersTable.id }).from(whitelistUsersTable).where(eq(whitelistUsersTable.id, id!)).limit(1);
  if (!existing) { sendNotFound(res, "Whitelist entry"); return; }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (label      !== undefined) updates["label"]      = label;
  if (bypassCode !== undefined) updates["bypassCode"] = bypassCode;
  if (isActive   !== undefined) updates["isActive"]   = isActive;
  if (expiresAt  !== undefined) updates["expiresAt"]  = expiresAt ? new Date(expiresAt) : null;

  const [updated] = await db.update(whitelistUsersTable).set(updates).where(eq(whitelistUsersTable.id, id!)).returning();
  sendSuccess(res, { entry: updated });
});

/* DELETE /api/admin/whitelist/:id */
router.delete("/:id", async (req, res) => {
  await db.delete(whitelistUsersTable).where(eq(whitelistUsersTable.id, req.params.id!));
  sendSuccess(res, { deleted: true });
});

export default router;
