import { Router } from "express";
import { db } from "@workspace/db";
import { webhookRegistrationsTable, webhookLogsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateId, addAuditEntry, getClientIp, type AdminRequest } from "../admin-shared.js";
import { sendSuccess, sendNotFound, sendValidationError } from "../../lib/response.js";
import crypto from "crypto";

const SUPPORTED_EVENTS = [
  "order_placed", "order_delivered", "ride_completed",
  "user_registered", "payment_received",
];

function isValidWebhookUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (host === "0.0.0.0" || host.startsWith("10.") || host.startsWith("192.168.")) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (host === "169.254.169.254" || host.endsWith(".internal") || host.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

const router = Router();

router.get("/webhooks", async (_req, res) => {
  const webhooks = await db.select().from(webhookRegistrationsTable).orderBy(desc(webhookRegistrationsTable.createdAt));
  const sanitized = webhooks.map(({ secret, ...rest }) => rest);
  sendSuccess(res, { webhooks: sanitized });
});

router.post("/webhooks", async (req, res) => {
  const { url, events, description } = req.body;
  if (!url) { sendValidationError(res, "URL is required"); return; }
  if (!isValidWebhookUrl(url)) {
    sendValidationError(res, "URL must be HTTPS and must not point to private/internal networks"); return;
  }
  if (!events || !Array.isArray(events) || events.length === 0) {
    sendValidationError(res, "At least one event is required"); return;
  }

  const invalidEvents = events.filter((e: string) => !SUPPORTED_EVENTS.includes(e));
  if (invalidEvents.length > 0) {
    sendValidationError(res, `Invalid events: ${invalidEvents.join(", ")}. Supported: ${SUPPORTED_EVENTS.join(", ")}`); return;
  }

  const id = generateId();
  const secret = crypto.randomBytes(32).toString("hex");

  const [created] = await db.insert(webhookRegistrationsTable).values({
    id,
    url,
    events,
    secret,
    description: description || "",
    isActive: true,
  }).returning();

  addAuditEntry({ action: "webhook_create", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Created webhook: ${url}`, result: "success" });
  sendSuccess(res, { webhook: created });
});

router.patch("/webhooks/:id/toggle", async (req, res) => {
  const id = req.params["id"]!;
  const [existing] = await db.select().from(webhookRegistrationsTable).where(eq(webhookRegistrationsTable.id, id)).limit(1);
  if (!existing) { sendNotFound(res, "Webhook not found"); return; }

  const newState = !existing.isActive;
  await db.update(webhookRegistrationsTable).set({ isActive: newState, updatedAt: new Date() }).where(eq(webhookRegistrationsTable.id, id));
  addAuditEntry({ action: "webhook_toggle", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `${newState ? "Enabled" : "Disabled"} webhook: ${existing.url}`, result: "success" });
  sendSuccess(res, { success: true, isActive: newState });
});

router.post("/webhooks/:id/test", async (req, res) => {
  const id = req.params["id"]!;
  const [webhook] = await db.select().from(webhookRegistrationsTable).where(eq(webhookRegistrationsTable.id, id)).limit(1);
  if (!webhook) { sendNotFound(res, "Webhook not found"); return; }

  const testPayload = {
    event: "test_ping",
    timestamp: new Date().toISOString(),
    data: { message: "This is a test ping from AJKMart" },
  };

  const logId = generateId();
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Secret": webhook.secret || "",
        "X-Webhook-Event": "test_ping",
      },
      body: JSON.stringify(testPayload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const durationMs = Date.now() - startTime;
    const responseText = await response.text().catch(() => "");

    await db.insert(webhookLogsTable).values({
      id: logId,
      webhookId: id,
      event: "test_ping",
      url: webhook.url,
      status: response.status,
      requestBody: testPayload,
      responseBody: responseText.slice(0, 2000),
      success: response.ok,
      durationMs,
    });

    sendSuccess(res, { success: response.ok, status: response.status, durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await db.insert(webhookLogsTable).values({
      id: logId,
      webhookId: id,
      event: "test_ping",
      url: webhook.url,
      status: 0,
      requestBody: testPayload,
      success: false,
      error: err.message || "Unknown error",
      durationMs,
    });
    sendSuccess(res, { success: false, error: err.message, durationMs });
  }
});

router.delete("/webhooks/:id", async (req, res) => {
  const id = req.params["id"]!;
  const [existing] = await db.select().from(webhookRegistrationsTable).where(eq(webhookRegistrationsTable.id, id)).limit(1);
  if (!existing) { sendNotFound(res, "Webhook not found"); return; }

  await db.delete(webhookLogsTable).where(eq(webhookLogsTable.webhookId, id));
  await db.delete(webhookRegistrationsTable).where(eq(webhookRegistrationsTable.id, id));
  addAuditEntry({ action: "webhook_delete", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Deleted webhook: ${existing.url}`, result: "success" });
  sendSuccess(res, { success: true });
});

router.get("/webhooks/:id/logs", async (req, res) => {
  const id = req.params["id"]!;
  const logs = await db.select().from(webhookLogsTable)
    .where(eq(webhookLogsTable.webhookId, id))
    .orderBy(desc(webhookLogsTable.createdAt))
    .limit(50);
  sendSuccess(res, { logs });
});

export default router;
