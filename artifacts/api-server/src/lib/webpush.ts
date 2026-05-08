import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import { sendFcmToTokens } from "./fcm.js";

let vapidInitialized = false;

export function initVapid() {
  if (vapidInitialized) return;
  const pub  = process.env["VAPID_PUBLIC_KEY"]  ?? "";
  const priv = process.env["VAPID_PRIVATE_KEY"] ?? "";
  const mail = process.env["VAPID_CONTACT_EMAIL"] ?? "mailto:admin@ajkmart.app";
  if (!pub || !priv) {
    console.warn("[webpush] VAPID keys not set — web push disabled");
    return;
  }
  webpush.setVapidDetails(mail, pub, priv);
  vapidInitialized = true;
  console.log("[webpush] VAPID initialized");
}

export function getVapidPublicKey(): string {
  return process.env["VAPID_PUBLIC_KEY"] ?? "";
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
  await sendPushToSubs(subs, payload);
}

export async function sendPushToRole(role: string, payload: PushPayload): Promise<void> {
  const subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.role, role));
  await sendPushToSubs(subs, payload);
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  const subs = await db.select().from(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.userId, userIds));
  await sendPushToSubs(subs, payload);
}

async function sendPushToSubs(subs: typeof pushSubscriptionsTable.$inferSelect[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;

  const vapidSubs = subs.filter(s => s.tokenType === "vapid");
  const fcmSubs   = subs.filter(s => s.tokenType === "fcm");

  const staleIds: string[] = [];

  const fcmDataPayload: Record<string, string> = {};
  if (payload.data) {
    for (const [k, v] of Object.entries(payload.data)) {
      fcmDataPayload[k] = String(v);
    }
  }

  const [, fcmResult] = await Promise.all([
    vapidInitialized ? sendVapidSubs(vapidSubs, payload, staleIds) : Promise.resolve(),
    fcmSubs.length > 0
      ? sendFcmToTokens(
          fcmSubs.map(s => s.endpoint),
          {
            title: payload.title,
            body: payload.body,
            icon: payload.icon,
            tag: payload.tag,
            data: Object.keys(fcmDataPayload).length > 0 ? fcmDataPayload : undefined,
          },
        )
      : Promise.resolve({ stale: [] as string[] }),
  ]);

  if (fcmResult && fcmResult.stale.length > 0) {
    const staleTokens = new Set(fcmResult.stale);
    for (const sub of fcmSubs) {
      if (staleTokens.has(sub.endpoint)) staleIds.push(sub.id);
    }
  }

  if (staleIds.length > 0) {
    await db.delete(pushSubscriptionsTable)
      .where(inArray(pushSubscriptionsTable.id, staleIds))
      .catch((err: unknown) => { console.error("[webpush] Stale subscription cleanup failed:", err); });
  }
}

async function sendVapidSubs(
  subs: typeof pushSubscriptionsTable.$inferSelect[],
  payload: PushPayload,
  staleIds: string[],
): Promise<void> {
  if (subs.length === 0) return;
  const json = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      if (!sub.p256dh || !sub.authKey) return;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
          json,
        );
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          staleIds.push(sub.id);
        } else {
          console.warn("[webpush] send failed:", err?.message);
        }
      }
    }),
  );
}
