/**
 * Admin routes for SMS Gateway management.
 * Mounted at /api/admin/sms-gateways
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { smsGatewaysTable } from "@workspace/db/schema";
import { eq, asc } from "drizzle-orm";
import { generateId } from "../../lib/id.js";
import { adminAuth } from "../admin-shared.js";
import { sendSuccess, sendError, sendNotFound } from "../../lib/response.js";

const router = Router();
router.use(adminAuth);

/* GET /api/admin/sms-gateways — list all gateways */
router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(smsGatewaysTable)
    .orderBy(asc(smsGatewaysTable.priority));

  /* Strip sensitive credentials from list view */
  res.json({
    gateways: rows.map(g => ({
      id: g.id,
      name: g.name,
      provider: g.provider,
      priority: g.priority,
      isActive: g.isActive,
      senderId: g.senderId,
      fromNumber: g.fromNumber,
      hasCredentials: !!(g.accountSid || g.msg91Key || g.apiKey),
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    })),
  });
});

/* POST /api/admin/sms-gateways — create gateway */
router.post("/", async (req, res) => {
  const { name, provider, priority, isActive, accountSid, authToken, fromNumber, msg91Key, senderId, apiKey, apiUrl } = req.body;

  if (!name || !provider) {
    sendError(res, "name and provider are required");
    return;
  }

  const id = generateId();
  const [row] = await db.insert(smsGatewaysTable).values({
    id, name, provider,
    priority: priority ?? 10,
    isActive: isActive ?? true,
    accountSid: accountSid || null,
    authToken: authToken || null,
    fromNumber: fromNumber || null,
    msg91Key: msg91Key || null,
    senderId: senderId || null,
    apiKey: apiKey || null,
    apiUrl: apiUrl || null,
  }).returning();

  sendSuccess(res, { gateway: row });
});

/* PATCH /api/admin/sms-gateways/:id — update gateway */
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, provider, priority, isActive, accountSid, authToken, fromNumber, msg91Key, senderId, apiKey, apiUrl } = req.body;

  const [existing] = await db.select({ id: smsGatewaysTable.id }).from(smsGatewaysTable).where(eq(smsGatewaysTable.id, id!)).limit(1);
  if (!existing) { sendNotFound(res, "Gateway"); return; }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name        !== undefined) updates["name"]       = name;
  if (provider    !== undefined) updates["provider"]   = provider;
  if (priority    !== undefined) updates["priority"]   = priority;
  if (isActive    !== undefined) updates["isActive"]   = isActive;
  if (accountSid  !== undefined) updates["accountSid"] = accountSid || null;
  if (authToken   !== undefined) updates["authToken"]  = authToken || null;
  if (fromNumber  !== undefined) updates["fromNumber"] = fromNumber || null;
  if (msg91Key    !== undefined) updates["msg91Key"]   = msg91Key || null;
  if (senderId    !== undefined) updates["senderId"]   = senderId || null;
  if (apiKey      !== undefined) updates["apiKey"]     = apiKey || null;
  if (apiUrl      !== undefined) updates["apiUrl"]     = apiUrl || null;

  const [updated] = await db.update(smsGatewaysTable).set(updates).where(eq(smsGatewaysTable.id, id!)).returning();
  sendSuccess(res, { gateway: updated });
});

/* DELETE /api/admin/sms-gateways/:id — delete gateway */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  if (id === "default-console") {
    sendError(res, "Cannot delete the default console gateway");
    return;
  }
  await db.delete(smsGatewaysTable).where(eq(smsGatewaysTable.id, id!));
  sendSuccess(res, { deleted: true });
});

/* PATCH /api/admin/sms-gateways/:id/toggle — quick toggle isActive */
router.patch("/:id/toggle", async (req, res) => {
  const { id } = req.params;
  const [gw] = await db.select().from(smsGatewaysTable).where(eq(smsGatewaysTable.id, id!)).limit(1);
  if (!gw) { sendNotFound(res, "Gateway"); return; }
  const [updated] = await db.update(smsGatewaysTable)
    .set({ isActive: !gw.isActive, updatedAt: new Date() })
    .where(eq(smsGatewaysTable.id, id!))
    .returning();
  sendSuccess(res, { gateway: updated });
});

export default router;
