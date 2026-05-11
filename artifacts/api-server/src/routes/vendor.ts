import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { db } from "@workspace/db";
import { usersTable, ordersTable, productsTable, promoCodesTable, walletTransactionsTable, notificationsTable, reviewsTable, liveLocationsTable, deliveryWhitelistTable, deliveryAccessRequestsTable, riderProfilesTable, vendorProfilesTable, vendorSchedulesTable, stockSubscriptionsTable, orderAuditLogTable, productStockHistoryTable } from "@workspace/db/schema";
import { eq, desc, and, sql, count, sum, gte, or, ilike, isNull, avg, lte } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { getCachedSettings } from "./admin.js";
import { requireRole } from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";
import { t } from "@workspace/i18n";
import { getUserLanguage } from "../lib/getUserLanguage.js";
import { getIO, emitRiderNewRequest } from "../lib/socketio.js";
import { sendSuccess, sendCreated, sendError, sendNotFound, sendForbidden, sendValidationError } from "../lib/response.js";
import { sendPushToUsers, sendPushToUser } from "../lib/webpush.js";

const router: IRouter = Router();

/* ── Auth: replaced duplicated vendorAuth with the shared requireRole factory ── */
router.use(requireRole("vendor", { vendorApprovalCheck: true }));

/* ── Vendor PATCH schemas ── */
const patchProfileSchema = z.object({
  name:             z.string().min(1).max(100).optional(),
  email:            z.string().email().optional(),
  cnic:             z.string().max(20).optional(),
  address:          z.string().max(300).optional(),
  city:             z.string().max(100).optional(),
  bankName:         z.string().max(100).optional(),
  bankAccount:      z.string().max(50).optional(),
  bankAccountTitle: z.string().max(100).optional(),
  businessType:     z.string().max(50).optional(),
}).strict();

const patchStoreSchema = z.object({
  storeName:         z.string().min(1).max(100).optional(),
  storeCategory:     z.string().max(50).optional(),
  storeBanner:       z.string().url().optional().nullable(),
  storeDescription:  z.string().max(1000).optional(),
  storeAnnouncement: z.string().max(500).optional(),
  storeDeliveryTime: z.string().max(50).optional(),
  storeIsOpen:       z.boolean().optional(),
  storeMinOrder:     z.number().min(0).optional(),
  storeAddress:      z.string().max(300).optional(),
  storeHours:        z.any().optional(),
  storeLat:          z.union([z.string(), z.number()]).optional().nullable(),
  storeLng:          z.union([z.string(), z.number()]).optional().nullable(),
});

function safeNum(v: any, def = 0) { return parseFloat(String(v ?? def)) || def; }
function formatUser(user: any) {
  return {
    id: user.id, phone: user.phone, name: user.name, email: user.email,
    username: user.username,
    avatar: user.avatar,
    storeName: user.storeName, storeCategory: user.storeCategory,
    storeBanner: user.storeBanner, storeDescription: user.storeDescription,
    storeHours: user.storeHours ? (typeof user.storeHours === "string" ? (() => { try { return JSON.parse(user.storeHours); } catch { return null; } })() : user.storeHours) : null,
    storeAnnouncement: user.storeAnnouncement,
    storeMinOrder: safeNum(user.storeMinOrder),
    storeDeliveryTime: user.storeDeliveryTime,
    storeIsOpen: user.storeIsOpen ?? true,
    storeLat: user.storeLat, storeLng: user.storeLng,
    walletBalance: safeNum(user.walletBalance),
    cnic: user.cnic, address: user.address, city: user.city, area: user.area,
    bankName: user.bankName, bankAccount: user.bankAccount, bankAccountTitle: user.bankAccountTitle,
    businessType: user.businessType,
    accountLevel: user.accountLevel, kycStatus: user.kycStatus,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

/* ── GET /vendor/me ── */
router.get("/me", async (req, res) => {
  const user = req.vendorUser!;
  const vendorId = user.id;
  const today = new Date(); today.setHours(0,0,0,0);

  const s = await getCachedSettings();
  const vendorShare = 1 - (parseFloat(s["vendor_commission_pct"] ?? "15") / 100);

  const [todayOrders, todayRev, totalOrders, totalRev] = await Promise.all([
    db.select({ c: count() }).from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, today), isNull(ordersTable.deletedAt))),
    db.select({ s: sum(ordersTable.total) }).from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, today), or(eq(ordersTable.status, "delivered"), eq(ordersTable.status, "completed")), isNull(ordersTable.deletedAt))),
    db.select({ c: count() }).from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), isNull(ordersTable.deletedAt))),
    db.select({ s: sum(ordersTable.total) }).from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), or(eq(ordersTable.status, "delivered"), eq(ordersTable.status, "completed")), isNull(ordersTable.deletedAt))),
  ]);
  sendSuccess(res, {
    ...formatUser(user),
    stats: {
      todayOrders:  todayOrders[0]?.c ?? 0,
      todayRevenue: parseFloat((safeNum(todayRev[0]?.s) * vendorShare).toFixed(2)),
      totalOrders:  totalOrders[0]?.c ?? 0,
      totalRevenue: parseFloat((safeNum(totalRev[0]?.s) * vendorShare).toFixed(2)),
    },
  });
});

/* ── PATCH /vendor/profile ── */
router.patch("/profile", validateBody(patchProfileSchema), async (req, res) => {
  const vendorId = req.vendorId!;
  const { name, email, cnic, address, city, bankName, bankAccount, bankAccountTitle, businessType } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name             !== undefined) updates.name             = name;
  if (email            !== undefined) updates.email            = email;
  if (cnic             !== undefined) updates.cnic             = cnic;
  if (address          !== undefined) updates.address          = address;
  if (city             !== undefined) updates.city             = city;
  if (bankName         !== undefined) updates.bankName         = bankName;
  if (bankAccount      !== undefined) updates.bankAccount      = bankAccount;
  if (bankAccountTitle !== undefined) updates.bankAccountTitle = bankAccountTitle;
  if (businessType     !== undefined) updates.businessType     = businessType;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, vendorId)).returning();
  sendSuccess(res, formatUser(user));
});

/* ── GET /vendor/profile/quick-replies ── */
router.get("/profile/quick-replies", async (req, res) => {
  const vendorId = req.vendorId!;
  const [profile] = await db
    .select({ quickReplies: vendorProfilesTable.quickReplies })
    .from(vendorProfilesTable)
    .where(eq(vendorProfilesTable.userId, vendorId));
  let shortcuts: string[] = [];
  if (profile?.quickReplies) {
    try {
      const parsed = JSON.parse(profile.quickReplies);
      if (Array.isArray(parsed) && parsed.every(s => typeof s === "string")) {
        shortcuts = parsed;
      }
    } catch (e) {
      logger.warn({ vendorId, err: (e as Error).message }, "[vendor/quick-replies] corrupted quickReplies data, returning empty array");
    }
  }
  sendSuccess(res, { quickReplies: shortcuts });
});

/* ── PATCH /vendor/profile/quick-replies ── */
const patchQuickRepliesSchema = z.object({
  quickReplies: z.array(z.string().max(120)).max(8),
});

router.patch("/profile/quick-replies", validateBody(patchQuickRepliesSchema), async (req, res) => {
  const vendorId = req.vendorId!;
  const { quickReplies } = req.body as { quickReplies: string[] };
  const serialized = JSON.stringify(quickReplies.slice(0, 8));
  await db
    .insert(vendorProfilesTable)
    .values({ userId: vendorId, quickReplies: serialized })
    .onConflictDoUpdate({
      target: vendorProfilesTable.userId,
      set: { quickReplies: serialized, updatedAt: new Date() },
    });
  sendSuccess(res, { quickReplies });
});

/* ── GET /vendor/store ── */
router.get("/store", async (req, res) => {
  const user = req.vendorUser!;
  sendSuccess(res, formatUser(user));
});

/* ── PATCH /vendor/store ── */
router.patch("/store", validateBody(patchStoreSchema), async (req, res) => {
  const vendorId = req.vendorId!;
  const body = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const fields = ["storeName","storeCategory","storeBanner","storeDescription","storeAnnouncement","storeDeliveryTime","storeIsOpen","storeMinOrder","storeAddress"];
  for (const f of fields) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (body.storeHours !== undefined) updates.storeHours = typeof body.storeHours === "string" ? body.storeHours : JSON.stringify(body.storeHours);
  if (body.storeLat !== undefined && body.storeLat !== null) updates.storeLat = String(body.storeLat);
  if (body.storeLng !== undefined && body.storeLng !== null) updates.storeLng = String(body.storeLng);
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, vendorId)).returning();
  sendSuccess(res, formatUser(user));
});

/* ── GET /vendor/stats ── */
router.get("/stats", async (req, res) => {
  const vendorId = req.vendorId!;
  const today = new Date(); today.setHours(0,0,0,0);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);

  const s = await getCachedSettings();
  const vendorShare = 1 - (parseFloat(s["vendor_commission_pct"] ?? "15") / 100);

  const [tData, wData, mData, pending, lowStock] = await Promise.all([
    db.select({ c: count(), s: sum(ordersTable.total) }).from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, today), isNull(ordersTable.deletedAt))),
    db.select({ c: count(), s: sum(ordersTable.total) }).from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, weekAgo), isNull(ordersTable.deletedAt))),
    db.select({ c: count(), s: sum(ordersTable.total) }).from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), gte(ordersTable.createdAt, monthAgo), isNull(ordersTable.deletedAt))),
    db.select({ c: count() }).from(ordersTable).where(and(eq(ordersTable.vendorId, vendorId), eq(ordersTable.status, "pending"), isNull(ordersTable.deletedAt))),
    getCachedSettings().then(cfg => {
      const threshold = parseInt(cfg["low_stock_threshold"] ?? "10", 10) || 10;
      return db.select({ c: count() }).from(productsTable).where(and(eq(productsTable.vendorId, vendorId), isNull(productsTable.deletedAt), sql`stock IS NOT NULL AND stock < ${threshold} AND stock > 0`));
    }),
  ]);
  sendSuccess(res, {
    today:    { orders: tData[0]?.c??0, revenue: parseFloat((safeNum(tData[0]?.s)*vendorShare).toFixed(2)) },
    week:     { orders: wData[0]?.c??0, revenue: parseFloat((safeNum(wData[0]?.s)*vendorShare).toFixed(2)) },
    month:    { orders: mData[0]?.c??0, revenue: parseFloat((safeNum(mData[0]?.s)*vendorShare).toFixed(2)) },
    pending:  pending[0]?.c ?? 0,
    lowStock: lowStock[0]?.c ?? 0,
  });
});

/* ── GET /vendor/orders ── */
router.get("/orders", async (req, res) => {
  const vendorId = req.vendorId!;
  const status = req.query["status"] as string | undefined;
  const conditions: any[] = [eq(ordersTable.vendorId, vendorId), isNull(ordersTable.deletedAt)];
  if (status && status !== "all") {
    if (status === "new") conditions.push(or(eq(ordersTable.status, "pending"), eq(ordersTable.status, "confirmed")));
    else if (status === "active") conditions.push(or(eq(ordersTable.status, "preparing"), eq(ordersTable.status, "ready"), eq(ordersTable.status, "picked_up"), eq(ordersTable.status, "out_for_delivery")));
    else conditions.push(eq(ordersTable.status, status));
  }
  const orders = await db.select({
    order: ordersTable,
    riderName: usersTable.name,
    riderPhone: usersTable.phone,
  }).from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.riderId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt))
    .limit(100);
  sendSuccess(res, { orders: orders.map(row => ({ ...row.order, total: safeNum(row.order.total), riderName: row.riderName ?? undefined, riderPhone: row.riderPhone ?? undefined })) });
});

/* ── PATCH /vendor/orders/:id/status ── */
router.patch("/orders/:id/status", async (req, res) => {
  const vendorId = req.vendorId!;
  /* Strict: only status and note accepted — reject price/total etc. explicitly */
  const allowedKeys = new Set(["status", "note"]);
  const extraKeys = Object.keys(req.body).filter(k => !allowedKeys.has(k));
  if (extraKeys.length > 0) {
    sendValidationError(res, `Unexpected fields: ${extraKeys.join(", ")}. Only "status" and "note" are accepted.`);
    return;
  }
  const { status, note } = req.body as { status?: string; note?: string };
  const validStatuses = ["confirmed","preparing","ready","cancelled"];
  if (!status || !validStatuses.includes(status)) { sendValidationError(res, "Invalid status"); return; }
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, req.params["id"]!), eq(ordersTable.vendorId, vendorId))).limit(1);
  if (!order) { sendNotFound(res, "Order not found"); return; }

  /* ── Cancellation time window: vendor can only cancel within 5 minutes ── */
  if (status === "cancelled") {
    const msSincePlaced = Date.now() - new Date(order.createdAt).getTime();
    if (msSincePlaced > 5 * 60 * 1000) {
      sendForbidden(res, "Cancellation window has passed. Orders can only be cancelled within 5 minutes of being placed.");
      return;
    }
  }

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    pending:   ["confirmed", "cancelled"],
    confirmed: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready:     [],
    delivered: [],
    cancelled: [],
    completed: [],
  };
  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    sendValidationError(res, `Cannot change order from "${order.status}" to "${status}". Allowed: ${allowed.join(", ") || "none"}.`);
    return;
  }

  const orderId = req.params["id"]!;
  const custLang = await getUserLanguage(order.userId);
  const msgs: Record<string, { title: string; body: string }> = {
    confirmed: { title: t("notifOrderConfirmed", custLang) + " ✅", body: t("notifOrderConfirmedBody", custLang) },
    preparing: { title: t("notifOrderPreparing", custLang) + " 🍳",  body: t("notifOrderPreparingBody", custLang) },
    ready:     { title: t("notifOrderReady", custLang) + " 📦",    body: t("notifOrderReadyBody", custLang) },
    cancelled: { title: t("notifOrderCancelled", custLang) + " ❌", body: t("notifOrderCancelledBody", custLang) },
  };

  let updated: typeof order;

  if (status === "confirmed") {
    /*
     * SINGLE-DECREMENT DESIGN — DO NOT RE-INTRODUCE STOCK DECREMENT HERE.
     *
     * Stock was already decremented atomically at order placement time inside
     * the `decrementStock()` call in orders.ts (within the placement db.transaction).
     * That path uses SELECT FOR UPDATE row-locking and writes a full audit record
     * to product_stock_history with quantityDelta and orderId.
     *
     * Adding a second decrement here would silently halve vendor stock on every
     * confirmed order, causing vendors to run out of inventory at double the real
     * rate. The confirmation step only needs to advance the order status.
     *
     * If you need to guard against oversell at confirmation time, add a
     * stock-check READ (no UPDATE) here and return 409 if stock has somehow
     * gone negative — but do NOT decrement again.
     */

    /* Informational audit entries — quantityDelta is 0 to make clear no stock moved */
    const confirmItems = Array.isArray(order.items) ? (order.items as Array<{ productId?: string; quantity?: number }>) : [];
    const confirmItemsWithProducts = confirmItems.filter(it => it.productId);

    try {
      const [result] = await db.update(ordersTable)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
        .returning();
      if (!result) { sendNotFound(res, "Order not found"); return; }
      updated = result;

      /* Informational audit entries — quantityDelta is 0 to make clear no stock moved */
      for (const item of confirmItemsWithProducts) {
        const [prod] = await db.select({ id: productsTable.id, stock: productsTable.stock })
          .from(productsTable)
          .where(and(eq(productsTable.id, item.productId!), eq(productsTable.vendorId, vendorId)))
          .limit(1);
        if (!prod) continue;
        await db.insert(productStockHistoryTable).values({
          id: generateId(), productId: prod.id, vendorId,
          previousStock: prod.stock,
          newStock: prod.stock,
          quantityDelta: 0,
          reason: "order_confirmed",
          orderId,
          source: `confirm:${orderId}`,
        }).catch(() => {});
      }
    } catch (e: unknown) {
      const err = e as Error;
      sendNotFound(res, err.message || "Failed to confirm order");
      return;
    }
  } else if (status === "cancelled" && order.paymentMethod === "wallet") {
    /* Atomic: status update + wallet credit + refund stamp in one tx.
       WHERE refunded_at IS NULL guard prevents double-credit under concurrent requests. */
    const refundAmt = safeNum(order.total);
    const now = new Date();
    const txResult = await db.transaction(async (tx) => {
      const result = await tx.update(ordersTable)
        .set({ status, refundedAt: now, refundedAmount: refundAmt.toFixed(2), paymentStatus: "refunded", updatedAt: now })
        .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId), isNull(ordersTable.refundedAt)))
        .returning();
      if (result.length === 0) throw new Error("ALREADY_REFUNDED");
      await tx.update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: now })
        .where(eq(usersTable.id, order.userId));
      await tx.insert(walletTransactionsTable).values({
        id: generateId(), userId: order.userId, type: "credit",
        amount: refundAmt.toFixed(2),
        description: `Refund — Order #${orderId.slice(-6).toUpperCase()} cancelled by store`,
      });
      return result[0];
    }).catch((err: Error) => {
      if (err.message === "ALREADY_REFUNDED") return null;
      throw err;
    });
    if (!txResult) { sendError(res, "Order has already been refunded", 409); return; }
    updated = txResult;
    await db.insert(notificationsTable).values({ id: generateId(), userId: order.userId, title: t("notifRefundProcessed", custLang) + " 💰", body: t("notifRefundProcessedBody", custLang).replace("{amount}", safeNum(order.total).toFixed(0)), type: "wallet", icon: "wallet-outline" }).catch((e: Error) => logger.warn({ orderId, userId: order.userId, err: e.message }, "[vendor/order-status] refund notification insert failed"));
  } else {
    /* Non-wallet or non-cancel: plain status update — vendorId in WHERE closes TOCTOU window */
    const [result] = await db.update(ordersTable)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.vendorId, vendorId)))
      .returning();
    if (!result) { sendNotFound(res, "Order not found"); return; }
    updated = result;
  }

  /* ── Audit trail: record every status transition ── */
  await db.insert(orderAuditLogTable).values({
    id: generateId(), orderId, vendorId,
    fromStatus: order.status, toStatus: status,
    note: note || null,
  }).catch((e: Error) => logger.warn({ orderId, vendorId, err: e.message }, "[vendor/order-status] audit log insert failed"));

  if (msgs[status]) {
    await db.insert(notificationsTable).values({ id: generateId(), userId: order.userId, title: msgs[status]!.title, body: msgs[status]!.body, type: "order", icon: "bag-outline" }).catch((e: Error) => logger.warn({ orderId, userId: order.userId, status, err: e.message }, "[vendor/order-status] status notification insert failed"));
  }

  /* ── Push notification to customer ── */
  (async () => {
    try {
      const { sendPushToUsers } = await import("../lib/webpush.js");
      if (msgs[status]) {
        await sendPushToUsers([order.userId], {
          title: msgs[status]!.title,
          body: msgs[status]!.body,
          tag: `order-${orderId}-${status}`,
          data: { orderId, type: status === "cancelled" ? "order_cancelled" : "order_status", status },
        });
      }
    } catch (e) {
      logger.warn({ orderId, err: (e as Error).message }, "[vendor/order-status] push notification failed");
    }
  })();

  const io = getIO();
  if (io) {
    const mapped = { ...updated, total: safeNum(updated.total) };
    io.to("admin-fleet").emit("order:update", mapped);
    io.to(`vendor:${vendorId}`).emit("order:update", mapped);
    if (updated.riderId) io.to(`rider:${updated.riderId}`).emit("order:update", mapped);
  }

  if (status === "ready" && !updated.riderId) {
    (async () => {
      try {
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
        const onlineRiders = await db
          .select({ userId: liveLocationsTable.userId })
          .from(liveLocationsTable)
          .innerJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
          .where(and(
            eq(liveLocationsTable.role, "rider"),
            ilike(usersTable.roles, "%rider%"),
            eq(usersTable.isOnline, true),
            gte(liveLocationsTable.updatedAt, tenMinAgo),
          ));
        for (const { userId } of onlineRiders) {
          emitRiderNewRequest(userId, { type: "order", requestId: orderId, summary: order.type });
        }
      } catch (err) {
        logger.warn({ orderId, err: (err as Error).message }, "[vendor/order-status] rider notification failed");
      }
    })();
  }
  sendSuccess(res, { ...updated, total: safeNum(updated.total) });
});

/* ... Rest of the file ... */
export default router;
