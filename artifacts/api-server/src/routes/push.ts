import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { anyUserAuth } from "../middleware/security.js";
import { getVapidPublicKey } from "../lib/webpush.js";
import { z } from "zod/v4";
import { sendSuccess, sendError, sendValidationError } from "../lib/response.js";

const router: IRouter = Router();

const ROLE_PRIORITY = ["admin", "vendor", "rider", "customer"] as const;
type AllowedRole = typeof ROLE_PRIORITY[number];

/**
 * Derive the subscription role from the authenticated user's actual DB roles.
 * If the client provided a requested role hint, it is only accepted when the
 * user genuinely holds that role — preventing privilege escalation via a
 * forged `role` field in the request body.
 */
function resolveRole(userRolesStr: string | null, requestedRole?: string): AllowedRole {
  const userRoles = new Set(
    (userRolesStr || "customer").split(",").map((r) => r.trim().toLowerCase()),
  );
  if (requestedRole && ROLE_PRIORITY.includes(requestedRole as AllowedRole)) {
    if (userRoles.has(requestedRole)) return requestedRole as AllowedRole;
  }
  for (const role of ROLE_PRIORITY) {
    if (userRoles.has(role)) return role;
  }
  return "customer";
}

const vapidSubscribeSchema = z.object({
  type:     z.literal("vapid").optional(),
  endpoint: z.string().url(),
  p256dh:   z.string().min(1),
  auth:     z.string().min(1),
  role:     z.enum(["customer", "rider", "vendor", "admin"]).optional(),
});

const fcmSubscribeSchema = z.object({
  type:  z.literal("fcm"),
  token: z.string().min(1),
  role:  z.enum(["customer", "rider", "vendor", "admin"]).optional(),
});

const subscribeSchema = z.union([vapidSubscribeSchema, fcmSubscribeSchema]);

router.get("/vapid-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) { sendError(res, "Push notifications not configured", 503); return; }
  sendSuccess(res, { publicKey: key });
});

router.post("/subscribe", anyUserAuth, async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) { sendValidationError(res, parsed.error.issues[0]?.message ?? "Invalid subscription data"); return; }
  const userId = req.customerId!;
  const user   = req.customerUser!;
  const data   = parsed.data;

  /* Derive role server-side from the user's actual roles; validate any hint. */
  const role = resolveRole(user.roles ?? null, data.role);

  if (data.type === "fcm") {
    const { token } = data;
    /* Upsert by token value so multiple devices stay registered simultaneously.
       Deleting ALL FCM rows for user+role would wipe tokens from other devices
       the moment a second device registers, causing ~50% missed notifications
       for vendors using the app on more than one device.
       Strategy:
         1. If this exact token is already registered → return 409 (idempotent).
         2. Otherwise insert it as a new row.
       Stale/invalid tokens are purged lazily by sendPushToUser() when FCM
       responds with NotRegistered/InvalidRegistration, so we don't need to
       pro-actively delete here. */
    const [existing] = await db.select({ id: pushSubscriptionsTable.id })
      .from(pushSubscriptionsTable)
      .where(and(
        eq(pushSubscriptionsTable.userId, userId),
        eq(pushSubscriptionsTable.tokenType, "fcm"),
        eq(pushSubscriptionsTable.endpoint, token),
      ))
      .limit(1);
    if (existing) {
      sendSuccess(res, { id: existing.id });
      return;
    }
    const id = generateId();
    await db.insert(pushSubscriptionsTable).values({
      id, userId, role, tokenType: "fcm", endpoint: token, p256dh: null, authKey: null,
    });
    sendSuccess(res, { id });
  } else {
    const { endpoint, p256dh, auth } = data;
    await db.delete(pushSubscriptionsTable)
      .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));
    const id = generateId();
    await db.insert(pushSubscriptionsTable).values({
      id, userId, role, tokenType: "vapid", endpoint, p256dh, authKey: auth,
    });
    sendSuccess(res, { id });
  }
});

router.delete("/unsubscribe", anyUserAuth, async (req, res) => {
  const userId = req.customerId!;
  const { endpoint } = req.body as { endpoint?: string };
  if (endpoint) {
    await db.delete(pushSubscriptionsTable)
      .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));
  } else {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
  }
  sendSuccess(res);
});

export default router;
