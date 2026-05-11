import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  walletTransactionsTable,
  notificationsTable,
  ordersTable, ridesTable, rideBidsTable, rideServiceTypesTable, popularLocationsTable, schoolRoutesTable, schoolSubscriptionsTable, liveLocationsTable, rideEventLogsTable, rideNotifiedRidersTable, locationLogsTable, locationHistoryTable,
  vendorProfilesTable, riderProfilesTable,
} from "@workspace/db/schema";
import { eq, desc, count, sum, and, gte, lte, sql, or, ilike, asc, isNull, isNotNull, avg, ne } from "drizzle-orm";
import {
  stripUser, generateId, getUserLanguage, t,
  getPlatformSettings, adminAuth, getAdminSecret,
  sendUserNotification, logger,
  ORDER_NOTIF_KEYS, RIDE_NOTIF_KEYS, PHARMACY_NOTIF_KEYS, PARCEL_NOTIF_KEYS,
  checkAdminLoginLockout, recordAdminLoginFailure, resetAdminLoginAttempts,
  addAuditEntry, addSecurityEvent, getClientIp,
  signAdminJwt, verifyAdminJwt, invalidateSettingsCache, getCachedSettings,
  ADMIN_TOKEN_TTL_HRS, verifyTotpToken, verifyAdminSecret,
  ensureDefaultRideServices, formatSvc,
  type AdminRequest, auditLog,
} from "../admin-shared.js";
import { emitRideDispatchUpdate, getIO } from "../../lib/socketio.js";
import { emitRideUpdate } from "../../lib/rideEvents.js";
import { RIDE_VALID_STATUSES, getSocketRoom } from "@workspace/service-constants";
import { sendSuccess, sendCreated, sendError, sendNotFound, sendValidationError } from "../../lib/response.js";

const router = Router();
router.get("/rides", async (_req, res) => {
  const rides = await db.select().from(ridesTable).orderBy(desc(ridesTable.createdAt)).limit(200);
  sendSuccess(res, {
    rides: rides.map(r => ({
      ...r,
      fare: parseFloat(r.fare),
      distance: parseFloat(r.distance),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total: rides.length,
  });
});

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending:     ["searching", "bargaining", "accepted", "cancelled"],
  searching:   ["bargaining", "accepted", "cancelled"],
  bargaining:  ["searching", "accepted", "cancelled"],
  accepted:    ["arrived", "in_transit", "cancelled"],
  arrived:     ["in_transit", "cancelled"],
  in_transit:  ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

router.get("/rides-enriched", async (req, res) => {
  const page = Math.max(1, parseInt(req.query["page"] as string || "1", 10));
  const limit = Math.min(500, Math.max(1, parseInt(req.query["limit"] as string || "50", 10)));
  const offset = (page - 1) * limit;
  const statusQ = req.query["status"] as string | undefined;
  const typeQ = req.query["type"] as string | undefined;
  const searchQ = (req.query["search"] as string || "").trim().toLowerCase();
  const customerQ = (req.query["customer"] as string || "").trim().toLowerCase();
  const riderQ = (req.query["rider"] as string || "").trim().toLowerCase();
  const dateFromQ = req.query["dateFrom"] as string | undefined;
  const dateToQ = req.query["dateTo"] as string | undefined;
  const sortByQ = (req.query["sortBy"] as string) === "fare" ? "fare" : "date";
  const sortDirQ = (req.query["sortDir"] as string) === "asc" ? "asc" : "desc";

  const conditions: ReturnType<typeof eq>[] = [];
  if (statusQ && statusQ !== "all") conditions.push(eq(ridesTable.status, statusQ));
  if (typeQ && typeQ !== "all") conditions.push(eq(ridesTable.type, typeQ));
  if (dateFromQ) conditions.push(gte(ridesTable.createdAt, new Date(dateFromQ)) as ReturnType<typeof eq>);
  if (dateToQ) {
    const toDate = new Date(dateToQ);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(ridesTable.createdAt, toDate) as ReturnType<typeof eq>);
  }
  if (searchQ) {
    conditions.push(or(
      ilike(ridesTable.id, `%${searchQ}%`),
      ilike(ridesTable.pickupAddress, `%${searchQ}%`),
      ilike(ridesTable.dropAddress, `%${searchQ}%`),
      ilike(ridesTable.riderName, `%${searchQ}%`),
    )! as ReturnType<typeof eq>);
  }
  if (riderQ) {
    conditions.push(or(
      ilike(ridesTable.riderName, `%${riderQ}%`),
      ilike(ridesTable.riderPhone, `%${riderQ}%`),
    )! as ReturnType<typeof eq>);
  }
  if (customerQ) {
    conditions.push(sql`${ridesTable.userId} IN (SELECT ${usersTable.id} FROM ${usersTable} WHERE LOWER(${usersTable.name}) LIKE ${'%' + customerQ + '%'} OR LOWER(${usersTable.phone}) LIKE ${'%' + customerQ + '%'})` as ReturnType<typeof eq>);
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db.select({ cnt: count() }).from(ridesTable).where(whereClause);
  const total = Number(totalResult?.cnt ?? 0);

  const orderCol = sortByQ === "fare" ? ridesTable.fare : ridesTable.createdAt;
  const orderFn = sortDirQ === "asc" ? asc : desc;
  const rides = await db.select().from(ridesTable).where(whereClause).orderBy(orderFn(orderCol)).limit(limit).offset(offset);

  type RideRow = typeof rides[number];
  const userIds = [...new Set(rides.map((r: RideRow) => r.userId).concat(rides.map((r: RideRow) => r.riderId).filter((id): id is string => id != null)))];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone }).from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map((id: string) => sql`${id}`), sql`, `)}]::text[])`)
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const rideIds = rides.map((r: RideRow) => r.id);
  const bidCounts = rideIds.length > 0
    ? await db.select({ rideId: rideBidsTable.rideId, total: count(rideBidsTable.id) })
        .from(rideBidsTable)
        .where(sql`${rideBidsTable.rideId} = ANY(ARRAY[${sql.join(rideIds.map((id: string) => sql`${id}`), sql`, `)}]::text[])`)
        .groupBy(rideBidsTable.rideId)
    : [];
  const bidCountMap = Object.fromEntries(bidCounts.map(b => [b.rideId, Number(b.total)]));

  sendSuccess(res, {
    rides: rides.map((r: RideRow) => ({
      ...r,
      fare:        parseFloat(r.fare),
      distance:    parseFloat(r.distance),
      offeredFare: r.offeredFare ? parseFloat(r.offeredFare) : null,
      counterFare: r.counterFare ? parseFloat(r.counterFare) : null,
      createdAt:   r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      updatedAt:   r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
      userName:    userMap[r.userId]?.name  || null,
      userPhone:   userMap[r.userId]?.phone || null,
      riderName:   r.riderName || (r.riderId ? userMap[r.riderId]?.name : null) || null,
      riderPhone:  r.riderPhone || (r.riderId ? userMap[r.riderId]?.phone : null) || null,
      totalBids:   bidCountMap[r.id] ?? 0,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.patch("/rides/:id/status", async (req, res) => {
  const { status, riderName, riderPhone } = req.body;

  if (!status || !(RIDE_VALID_STATUSES as readonly string[]).includes(status)) {
    sendValidationError(res, `Invalid ride status "${status}". Valid statuses: ${RIDE_VALID_STATUSES.join(", ")}`);
    return;
  }

  const [existing] = await db.select({ riderId: ridesTable.riderId, status: ridesTable.status, fare: ridesTable.fare, paymentMethod: ridesTable.paymentMethod })
    .from(ridesTable).where(eq(ridesTable.id, req.params["id"]!)).limit(1);
  if (!existing) { sendNotFound(res, "Ride not found"); return; }

  if (existing.status === "completed" || existing.status === "cancelled") {
    sendValidationError(res, `Cannot change status of a ride that is already ${existing.status}`);
    return;
  }

  const allowed = VALID_STATUS_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(status)) {
    sendValidationError(res, `Invalid transition: ${existing.status} → ${status}. ${allowed ? `Allowed: ${allowed.join(", ")}` : "No transitions allowed from this status."}`);
    return;
  }

  if (status === "completed" && !existing.riderId) {
    sendError(res, "Cannot force-complete a ride with no assigned rider. Assign a rider first.", 400);
    return;
  }

  /* Determine wallet side-effects before entering the transaction */
  const fare = parseFloat(existing.fare ?? "0");
  const s = await getPlatformSettings();
  const riderKeepPct = (Number(s["rider_keep_pct"]) || 80) / 100;
  const commissionPct = 1 - riderKeepPct;
  let riderBalance = 0;

  if (status === "completed" && existing.riderId && existing.paymentMethod !== "wallet") {
    const [riderWalletRow] = await db.select({ walletBalance: usersTable.walletBalance })
      .from(usersTable).where(eq(usersTable.id, existing.riderId)).limit(1);
    riderBalance = parseFloat(riderWalletRow?.walletBalance ?? "0");
  }

  /* All mutations (status + wallet) in ONE atomic transaction */
  let ride: typeof ridesTable.$inferSelect;
  try {
    ride = await db.transaction(async (tx) => {
      const now = new Date();
      const updateData: Record<string, unknown> = { status, updatedAt: now };
      if (status === "completed") updateData.completedAt = now;
      if (status === "cancelled") updateData.cancelledAt = now;
      if (riderName) updateData.riderName = riderName;
      if (riderPhone) updateData.riderPhone = riderPhone;

      const [updated] = await tx
        .update(ridesTable)
        .set(updateData)
        .where(eq(ridesTable.id, req.params["id"]!))
        .returning();
      if (!updated) throw new Error("Ride not found");

      /* On completion: credit rider earnings or deduct commission */
      if (status === "completed" && updated.riderId) {
        if (updated.paymentMethod === "wallet") {
          const riderEarning = parseFloat((fare * riderKeepPct).toFixed(2));
          await tx.update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${riderEarning}`, updatedAt: now })
            .where(eq(usersTable.id, updated.riderId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(), userId: updated.riderId, type: "credit",
            amount: String(riderEarning),
            description: `Ride earnings — #${updated.id.slice(-6).toUpperCase()} (${Math.round(riderKeepPct * 100)}%)`,
          });
        } else {
          const commission = parseFloat((fare * commissionPct).toFixed(2));
          if (commission > 0 && riderBalance - commission >= -500) {
            await tx.update(usersTable)
              .set({ walletBalance: sql`wallet_balance - ${commission}`, updatedAt: now })
              .where(eq(usersTable.id, updated.riderId));
            await tx.insert(walletTransactionsTable).values({
              id: generateId(), userId: updated.riderId, type: "debit",
              amount: String(commission),
              description: `Platform commission — #${updated.id.slice(-6).toUpperCase()} (${Math.round(commissionPct * 100)}%)`,
            });
          } else if (commission > 0) {
            logger.warn(`Skipping commission deduction for rider ${updated.riderId}: balance ${riderBalance} - commission ${commission} < -500`);
          }
        }
      }

      /* On cancellation: refund wallet rides atomically.
         Uses WHERE refunded_at IS NULL + .returning() so concurrent status-cancel
         requests can never both credit the wallet — only the one that claims the
         row (returns a result) proceeds to write the wallet transaction. */
      if (status === "cancelled" && updated.paymentMethod === "wallet") {
        const refundAmt = parseFloat(updated.fare);
        const refundClaimed = await tx.update(ridesTable)
          .set({ refundedAt: now })
          .where(and(eq(ridesTable.id, updated.id), isNull(ridesTable.refundedAt)))
          .returning({ id: ridesTable.id });

        if (refundClaimed.length > 0) {
          await tx.update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: now })
            .where(eq(usersTable.id, updated.userId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(), userId: updated.userId, type: "credit",
            amount: refundAmt.toFixed(2),
            description: `Refund — Ride #${updated.id.slice(-6).toUpperCase()} cancelled by admin`,
          });
          updated.refundedAt = now;
        }
      }

      /* Admin audit: persist status change to rideEventLogsTable */
      await tx.insert(rideEventLogsTable).values({
        id: generateId(),
        rideId: updated.id,
        adminId: (req as AdminRequest).adminId,
        event: `admin_status_${status}`,
        notes: `Admin forced status to ${status}`,
      });

      return updated;
    });
  } catch (txErr: unknown) {
    const errMsg = (txErr as Error).message;
    if (errMsg === "Ride not found") { sendNotFound(res, "Ride not found"); return; }
    logger.error("Status update transaction failed for ride", req.params["id"], errMsg);
    sendError(res, "Status update failed: could not complete transaction", 500);
    return;
  }

  /* Non-fatal notifications after successful transaction */
  try {
    const rideNotifKeys = RIDE_NOTIF_KEYS[status];
    if (rideNotifKeys) {
      const rideUserLang = await getUserLanguage(ride.userId);
      await sendUserNotification(ride.userId, t(rideNotifKeys.titleKey, rideUserLang), t(rideNotifKeys.bodyKey, rideUserLang), "ride", rideNotifKeys.icon);
    }
  } catch (notifErr) {
    logger.warn("sendUserNotification failed (non-fatal):", (notifErr as Error).message);
  }

  if (status === "completed" && ride.riderId && ride.paymentMethod === "wallet") {
    try {
      const riderEarning = parseFloat((fare * riderKeepPct).toFixed(2));
      const riderLang = await getUserLanguage(ride.riderId);
      await sendUserNotification(ride.riderId, t("notifRidePaymentReceived", riderLang), t("notifRidePaymentReceivedBody", riderLang).replace("{amount}", String(riderEarning)), "ride", "wallet-outline");
    } catch (notifErr) {
      logger.warn("Rider payment notification failed (non-fatal):", (notifErr as Error).message);
    }
  }

  if (status === "cancelled" && ride.paymentMethod === "wallet") {
    try {
      const refundAmt = parseFloat(ride.fare);
      await sendUserNotification(ride.userId, "Ride Refund 💰", `Rs. ${refundAmt.toFixed(0)} aapki wallet mein refund ho gaya.`, "ride", "wallet-outline");
    } catch (notifErr) {
      logger.warn("Refund notification failed (non-fatal):", (notifErr as Error).message);
    }
  }

  const ioRide = getIO();
  if (ioRide) {
    const ridePayload = { id: ride.id, status: ride.status, updatedAt: ride.updatedAt instanceof Date ? ride.updatedAt.toISOString() : ride.updatedAt };
    ioRide.to(getSocketRoom(ride.id, "ride")).emit("order:update", ridePayload);
    ioRide.to(`user:${ride.userId}`).emit("order:update", ridePayload);
  }
  emitRideUpdate(ride.id);
  emitRideDispatchUpdate({ rideId: ride.id, action: `status_${status}`, status });

  /* Audit: record terminal ride status transitions for compliance trail */
  if (["completed", "cancelled"].includes(status)) {
    addAuditEntry({
      action: `ride_status_${status}`,
      adminId: (req as AdminRequest).adminId,
      ip: getClientIp(req),
      details: `Ride #${ride.id.slice(-6).toUpperCase()} marked ${status}`,
      result: "success",
    });
  }

  sendSuccess(res, { ...ride, fare: parseFloat(ride.fare), distance: parseFloat(ride.distance) });
});
router.get("/ride-services", async (_req, res) => {
  await ensureDefaultRideServices();
  const services = await db.select().from(rideServiceTypesTable).orderBy(asc(rideServiceTypesTable.sortOrder));
  sendSuccess(res, { services: services.map(formatSvc) });
});

/* POST /admin/ride-services — create custom service */
router.post("/ride-services", async (req, res) => {
  const { key, name, nameUrdu, icon, description, color, baseFare, perKm, minFare, maxPassengers, allowBargaining, sortOrder } = req.body;
  if (!key || !name || !icon) { sendValidationError(res, "key, name, icon are required"); return; }
  const existing = await db.select({ id: rideServiceTypesTable.id }).from(rideServiceTypesTable).where(eq(rideServiceTypesTable.key, String(key))).limit(1);
  if (existing.length > 0) { sendError(res, `Service key "${key}" already exists`, 409); return; }
  const [created] = await db.insert(rideServiceTypesTable).values({
    id: `svc_${generateId()}`,
    key: String(key).toLowerCase().replace(/\s+/g, "_"),
    name: String(name),
    nameUrdu:      nameUrdu      || null,
    icon:          String(icon),
    description:   description   || null,
    color:         color         || "#6B7280",
    isEnabled:     true,
    isCustom:      true,
    baseFare:      String(baseFare  ?? 15),
    perKm:         String(perKm     ?? 8),
    minFare:       String(minFare   ?? 50),
    maxPassengers: Number(maxPassengers ?? 1),
    allowBargaining: allowBargaining !== false,
    sortOrder:     Number(sortOrder ?? 99),
  }).returning();
  sendCreated(res, { service: formatSvc(created) });
});

/* PATCH /admin/ride-services/:id — update any field */
router.patch("/ride-services/:id", async (req, res) => {
  const svcId = req.params["id"]!;
  const [existing] = await db.select().from(rideServiceTypesTable).where(eq(rideServiceTypesTable.id, svcId)).limit(1);
  if (!existing) { sendNotFound(res, "Service not found"); return; }
  const { name, nameUrdu, icon, description, color, isEnabled, baseFare, perKm, minFare, maxPassengers, allowBargaining, sortOrder } = req.body;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name          !== undefined) patch["name"]           = String(name);
  if (nameUrdu      !== undefined) patch["nameUrdu"]       = nameUrdu;
  if (icon          !== undefined) patch["icon"]           = String(icon);
  if (description   !== undefined) patch["description"]    = description;
  if (color         !== undefined) patch["color"]          = String(color);
  if (isEnabled     !== undefined) patch["isEnabled"]      = Boolean(isEnabled);
  if (baseFare      !== undefined) patch["baseFare"]       = String(baseFare);
  if (perKm         !== undefined) patch["perKm"]          = String(perKm);
  if (minFare       !== undefined) patch["minFare"]        = String(minFare);
  if (maxPassengers !== undefined) patch["maxPassengers"]  = Number(maxPassengers);
  if (allowBargaining !== undefined) patch["allowBargaining"] = Boolean(allowBargaining);
  if (sortOrder     !== undefined) patch["sortOrder"]      = Number(sortOrder);
  const [updated] = await db.update(rideServiceTypesTable).set(patch as any).where(eq(rideServiceTypesTable.id, svcId)).returning();
  sendSuccess(res, { service: formatSvc(updated) });
});

/* DELETE /admin/ride-services/:id — only custom services */
router.delete("/ride-services/:id", async (req, res) => {
  const svcId = req.params["id"]!;
  const [existing] = await db.select().from(rideServiceTypesTable).where(eq(rideServiceTypesTable.id, svcId)).limit(1);
  if (!existing) { sendNotFound(res, "Service not found"); return; }
  if (!existing.isCustom) { sendValidationError(res, "Built-in services cannot be deleted. Disable them instead."); return; }
  await db.delete(rideServiceTypesTable).where(eq(rideServiceTypesTable.id, svcId));
  sendSuccess(res);
});

/* ══════════════════════════════════════════════════════
   POPULAR LOCATIONS — Admin CRUD
   GET  /admin/locations
   POST /admin/locations
   PATCH /admin/locations/:id
   DELETE /admin/locations/:id
══════════════════════════════════════════════════════ */

const DEFAULT_LOCATIONS = [
  { name: "Muzaffarabad Chowk",      nameUrdu: "مظفرآباد چوک",      lat: 34.3697, lng: 73.4716, category: "chowk",   icon: "🏙️", sortOrder: 1 },
  { name: "Kohala Bridge",           nameUrdu: "کوہالہ پل",         lat: 34.2021, lng: 73.3791, category: "landmark", icon: "🌉", sortOrder: 2 },
  { name: "Mirpur City Centre",      nameUrdu: "میرپور سٹی سینٹر",  lat: 33.1413, lng: 73.7508, category: "chowk",   icon: "🏙️", sortOrder: 3 },
  { name: "Rawalakot Bazar",         nameUrdu: "راولاکوٹ بازار",    lat: 33.8572, lng: 73.7613, category: "bazar",   icon: "🛍️", sortOrder: 4 },
  { name: "Bagh City",               nameUrdu: "باغ شہر",           lat: 33.9732, lng: 73.7729, category: "general",  icon: "🌆", sortOrder: 5 },
  { name: "Kotli Main Chowk",        nameUrdu: "کوٹلی مین چوک",     lat: 33.5152, lng: 73.9019, category: "chowk",   icon: "🏙️", sortOrder: 6 },
  { name: "Poonch City",             nameUrdu: "پونچھ شہر",         lat: 33.7700, lng: 74.0954, category: "general",  icon: "🌆", sortOrder: 7 },
  { name: "Neelum Valley",           nameUrdu: "نیلم ویلی",         lat: 34.5689, lng: 73.8765, category: "landmark", icon: "🏔️", sortOrder: 8 },
  { name: "AJK University",          nameUrdu: "یونیورسٹی آف آزاد کشمیر", lat: 34.3601, lng: 73.5088, category: "school",  icon: "🎓", sortOrder: 9 },
  { name: "District Headquarters Hospital", nameUrdu: "ضلعی ہیڈکوارٹر ہسپتال", lat: 34.3712, lng: 73.4730, category: "hospital", icon: "🏥", sortOrder: 10 },
  { name: "Muzaffarabad Bus Stand",  nameUrdu: "مظفرآباد بس اڈہ",  lat: 34.3664, lng: 73.4726, category: "landmark", icon: "🚏", sortOrder: 11 },
  { name: "Hattian Bala",            nameUrdu: "ہٹیاں بالا",        lat: 34.0949, lng: 73.8185, category: "general",  icon: "🌆", sortOrder: 12 },
];

export async function ensureDefaultLocations() {
  const existing = await db.select({ c: count() }).from(popularLocationsTable);
  if ((existing[0]?.c ?? 0) === 0) {
    await db.insert(popularLocationsTable).values(
      DEFAULT_LOCATIONS.map(l => ({
        id:        `loc_${l.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        name:      l.name,
        nameUrdu:  l.nameUrdu,
        lat:       l.lat.toFixed(6),
        lng:       l.lng.toFixed(6),
        category:  l.category,
        icon:      l.icon,
        isActive:  true,
        sortOrder: l.sortOrder,
      }))
    ).onConflictDoNothing();
  }
}

router.get("/locations", async (_req, res) => {
  await ensureDefaultLocations();
  const locs = await db.select().from(popularLocationsTable)
    .orderBy(asc(popularLocationsTable.sortOrder), asc(popularLocationsTable.name));
  sendSuccess(res, {
    locations: locs.map(l => ({
      ...l,
      lat: parseFloat(String(l.lat)),
      lng: parseFloat(String(l.lng)),
    })),
  });
});

router.post("/locations", async (req, res) => {
  const { name, nameUrdu, lat, lng, category = "general", icon = "📍", isActive = true, sortOrder = 0 } = req.body;
  if (!name || !lat || !lng) { sendValidationError(res, "name, lat, lng required"); return; }
  const [loc] = await db.insert(popularLocationsTable).values({
    id: generateId(), name, nameUrdu: nameUrdu || null,
    lat: String(lat), lng: String(lng), category, icon,
    isActive: Boolean(isActive), sortOrder: Number(sortOrder),
  }).returning();
  sendCreated(res, { ...loc, lat: parseFloat(String(loc!.lat)), lng: parseFloat(String(loc!.lng)) });
});

router.patch("/locations/:id", async (req, res) => {
  const { name, nameUrdu, lat, lng, category, icon, isActive, sortOrder } = req.body;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name      !== undefined) patch.name      = name;
  if (nameUrdu  !== undefined) patch.nameUrdu  = nameUrdu || null;
  if (lat       !== undefined) patch.lat       = String(lat);
  if (lng       !== undefined) patch.lng       = String(lng);
  if (category  !== undefined) patch.category  = category;
  if (icon      !== undefined) patch.icon      = icon;
  if (isActive  !== undefined) patch.isActive  = Boolean(isActive);
  if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder);
  const [updated] = await db.update(popularLocationsTable).set(patch).where(eq(popularLocationsTable.id, req.params["id"]!)).returning();
  if (!updated) { sendNotFound(res, "Location not found"); return; }
  sendSuccess(res, { ...updated, lat: parseFloat(String(updated.lat)), lng: parseFloat(String(updated.lng)) });
});

router.delete("/locations/:id", async (req, res) => {
  const [existing] = await db.select({ id: popularLocationsTable.id })
    .from(popularLocationsTable).where(eq(popularLocationsTable.id, req.params["id"]!)).limit(1);
  if (!existing) { sendNotFound(res, "Location not found"); return; }
  await db.delete(popularLocationsTable).where(eq(popularLocationsTable.id, req.params["id"]!));
  sendSuccess(res);
});

/* ══════════════════════════════════════════════════════
   SCHOOL ROUTES — Admin CRUD + Subscriptions view
   GET  /admin/school-routes
   POST /admin/school-routes
   PATCH /admin/school-routes/:id
   DELETE /admin/school-routes/:id
   GET  /admin/school-subscriptions
══════════════════════════════════════════════════════ */

function fmtRoute(r: Record<string, unknown>) {
  return {
    ...r,
    monthlyPrice:  parseFloat(String(r.monthlyPrice ?? "0")),
    fromLat:       r.fromLat ? parseFloat(String(r.fromLat)) : null,
    fromLng:       r.fromLng ? parseFloat(String(r.fromLng)) : null,
    toLat:         r.toLat   ? parseFloat(String(r.toLat))   : null,
    toLng:         r.toLng   ? parseFloat(String(r.toLng))   : null,
    createdAt:     r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt:     r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

router.get("/school-routes", async (_req, res) => {
  const routes = await db.select().from(schoolRoutesTable)
    .orderBy(asc(schoolRoutesTable.sortOrder), asc(schoolRoutesTable.schoolName));
  sendSuccess(res, { routes: routes.map(fmtRoute) });
});

router.post("/school-routes", async (req, res) => {
  const {
    routeName, schoolName, schoolNameUrdu, fromArea, fromAreaUrdu, toAddress,
    fromLat, fromLng, toLat, toLng, monthlyPrice, morningTime, afternoonTime,
    capacity = 30, vehicleType = "school_shift", notes, isActive = true, sortOrder = 0,
  } = req.body;
  if (!routeName || !schoolName || !fromArea || !toAddress || !monthlyPrice) {
    sendValidationError(res, "routeName, schoolName, fromArea, toAddress, monthlyPrice required"); return;
  }
  const [route] = await db.insert(schoolRoutesTable).values({
    id: generateId(), routeName, schoolName, schoolNameUrdu: schoolNameUrdu || null,
    fromArea, fromAreaUrdu: fromAreaUrdu || null, toAddress,
    fromLat: fromLat ? String(fromLat) : null, fromLng: fromLng ? String(fromLng) : null,
    toLat:   toLat   ? String(toLat)   : null, toLng:   toLng   ? String(toLng)   : null,
    monthlyPrice: String(parseFloat(monthlyPrice)),
    morningTime: morningTime || "7:30 AM",
    afternoonTime: afternoonTime || null,
    capacity: Number(capacity), enrolledCount: 0,
    vehicleType, notes: notes || null,
    isActive: Boolean(isActive), sortOrder: Number(sortOrder),
  }).returning();
  sendCreated(res, fmtRoute(route!));
});

router.patch("/school-routes/:id", async (req, res) => {
  const routeId = req.params["id"]!;
  const {
    routeName, schoolName, schoolNameUrdu, fromArea, fromAreaUrdu, toAddress,
    fromLat, fromLng, toLat, toLng, monthlyPrice, morningTime, afternoonTime,
    capacity, vehicleType, notes, isActive, sortOrder,
  } = req.body;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (routeName      !== undefined) patch.routeName      = routeName;
  if (schoolName     !== undefined) patch.schoolName     = schoolName;
  if (schoolNameUrdu !== undefined) patch.schoolNameUrdu = schoolNameUrdu || null;
  if (fromArea       !== undefined) patch.fromArea       = fromArea;
  if (fromAreaUrdu   !== undefined) patch.fromAreaUrdu   = fromAreaUrdu || null;
  if (toAddress      !== undefined) patch.toAddress      = toAddress;
  if (fromLat        !== undefined) patch.fromLat        = fromLat ? String(fromLat) : null;
  if (fromLng        !== undefined) patch.fromLng        = fromLng ? String(fromLng) : null;
  if (toLat          !== undefined) patch.toLat          = toLat   ? String(toLat)   : null;
  if (toLng          !== undefined) patch.toLng          = toLng   ? String(toLng)   : null;
  if (monthlyPrice   !== undefined) patch.monthlyPrice   = String(parseFloat(monthlyPrice));
  if (morningTime    !== undefined) patch.morningTime    = morningTime;
  if (afternoonTime  !== undefined) patch.afternoonTime  = afternoonTime || null;
  if (capacity       !== undefined) patch.capacity       = Number(capacity);
  if (vehicleType    !== undefined) patch.vehicleType    = vehicleType;
  if (notes          !== undefined) patch.notes          = notes || null;
  if (isActive       !== undefined) patch.isActive       = Boolean(isActive);
  if (sortOrder      !== undefined) patch.sortOrder      = Number(sortOrder);
  const [updated] = await db.update(schoolRoutesTable).set(patch).where(eq(schoolRoutesTable.id, routeId)).returning();
  if (!updated) { sendNotFound(res, "Route not found"); return; }
  sendSuccess(res, fmtRoute(updated));
});

router.delete("/school-routes/:id", async (req, res) => {
  const routeId = req.params["id"]!;
  /* Only delete if no active subscriptions */
  const [activeSub] = await db.select({ id: schoolSubscriptionsTable.id })
    .from(schoolSubscriptionsTable)
    .where(and(eq(schoolSubscriptionsTable.routeId, routeId), eq(schoolSubscriptionsTable.status, "active")))
    .limit(1);
  if (activeSub) {
    sendError(res, "Cannot delete route with active subscriptions. Disable it instead.", 409); return;
  }
  const [existing] = await db.select({ id: schoolRoutesTable.id })
    .from(schoolRoutesTable).where(eq(schoolRoutesTable.id, routeId)).limit(1);
  if (!existing) { sendNotFound(res, "Route not found"); return; }
  await db.delete(schoolRoutesTable).where(eq(schoolRoutesTable.id, routeId));
  sendSuccess(res);
});

router.get("/school-subscriptions", async (req, res) => {
  const routeIdFilter = req.query["routeId"] as string | undefined;
  const query = routeIdFilter
    ? db.select().from(schoolSubscriptionsTable).where(eq(schoolSubscriptionsTable.routeId, routeIdFilter))
    : db.select().from(schoolSubscriptionsTable);
  const subs = await query.orderBy(desc(schoolSubscriptionsTable.createdAt));
  /* Enrich with user info */
  const enriched = await Promise.all(subs.map(async sub => {
    const [user] = await db.select({ name: usersTable.name, phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, sub.userId)).limit(1);
    const [route] = await db.select({ routeName: schoolRoutesTable.routeName, schoolName: schoolRoutesTable.schoolName })
      .from(schoolRoutesTable).where(eq(schoolRoutesTable.id, sub.routeId)).limit(1);
    return {
      ...sub,
      monthlyAmount:   parseFloat(String(sub.monthlyAmount ?? "0")),
      userName:        user?.name  || null,
      userPhone:       user?.phone || null,
      routeName:       route?.routeName   || null,
      schoolName:      route?.schoolName  || null,
      startDate:       sub.startDate instanceof Date       ? sub.startDate.toISOString()       : sub.startDate,
      nextBillingDate: sub.nextBillingDate instanceof Date ? sub.nextBillingDate.toISOString() : sub.nextBillingDate,
      createdAt:       sub.createdAt instanceof Date       ? sub.createdAt.toISOString()       : sub.createdAt,
    };
  }));
  sendSuccess(res, { subscriptions: enriched, total: enriched.length });
});

/* ══════════════════════════════════════════════════════════
   GET /admin/live-riders
   Returns all riders who have recently sent GPS updates,
   enriched with their name, phone and online status.
   "Fresh" = updated within last 5 minutes.
══════════════════════════════════════════════════════════ */
router.get("/live-riders", async (_req, res) => {
  const settings = await getPlatformSettings();
  const staleTimeoutSec = parseInt(settings["gps_stale_timeout_sec"] ?? "300", 10);
  const STALE_MS = staleTimeoutSec * 1000;
  const cutoff   = new Date(Date.now() - STALE_MS);

  /* Single JOIN query — eliminates N+1 per-rider lookups */
  const locs = await db
    .select({
      userId:       liveLocationsTable.userId,
      latitude:     liveLocationsTable.latitude,
      longitude:    liveLocationsTable.longitude,
      action:       liveLocationsTable.action,
      updatedAt:    liveLocationsTable.updatedAt,
      batteryLevel: liveLocationsTable.batteryLevel,
      lastSeen:     liveLocationsTable.lastSeen,
      onlineSince:  liveLocationsTable.onlineSince,
      name:         usersTable.name,
      phone:        usersTable.phone,
      isOnline:     usersTable.isOnline,
      vehicleType:  riderProfilesTable.vehicleType,
      city:         usersTable.city,
      roles:        usersTable.roles,
      lastActive:   usersTable.lastActive,
    })
    .from(liveLocationsTable)
    .leftJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
    .leftJoin(riderProfilesTable, eq(liveLocationsTable.userId, riderProfilesTable.userId))
    .where(or(eq(liveLocationsTable.role, "rider"), eq(liveLocationsTable.role, "service_provider")));

  const enriched = locs.map(loc => {
    const updatedAt  = loc.updatedAt instanceof Date ? loc.updatedAt : new Date(loc.updatedAt);
    const ageSeconds = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
    const isFresh    = updatedAt >= cutoff;
    return {
      userId:       loc.userId,
      name:         loc.name        ?? "Unknown Rider",
      phone:        loc.phone       ?? null,
      isOnline:     loc.isOnline    ?? false,
      vehicleType:  loc.vehicleType ?? null,
      city:         loc.city        ?? null,
      role:         loc.roles       ?? "rider",
      batteryLevel: loc.batteryLevel ?? null,
      lastSeen:     loc.lastSeen    instanceof Date ? loc.lastSeen.toISOString()    : (loc.lastSeen    ?? null),
      onlineSince:  loc.onlineSince instanceof Date ? loc.onlineSince.toISOString() : (loc.onlineSince ?? null),
      lastActive:   loc.lastActive  instanceof Date ? loc.lastActive.toISOString()  : (loc.lastActive  ?? null),
      lat:          parseFloat(String(loc.latitude)),
      lng:          parseFloat(String(loc.longitude)),
      action:       loc.action      ?? null,
      updatedAt:    updatedAt.toISOString(),
      ageSeconds,
      isFresh,
    };
  });

  /* Sort: online first, then by freshness */
  enriched.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    return a.ageSeconds - b.ageSeconds;
  });

  sendSuccess(res, {
    riders: enriched,
    total: enriched.length,
    freshCount: enriched.filter(r => r.isFresh).length,
    staleTimeoutSec,
  });
});

/* ══════════════════════════════════════════════════════════
   GET /admin/customer-locations
   Returns customers who sent a GPS update (ride booking or
   order placement). Shows their identity + last position.
   "Fresh" = updated within last 2 hours.
══════════════════════════════════════════════════════════ */
router.get("/customer-locations", async (_req, res) => {
  const STALE_MS = 2 * 60 * 60 * 1000; /* 2 hours */
  const cutoff   = new Date(Date.now() - STALE_MS);

  /* Single JOIN query — eliminates N+1 per-customer lookups */
  const locs = await db
    .select({
      userId:    liveLocationsTable.userId,
      latitude:  liveLocationsTable.latitude,
      longitude: liveLocationsTable.longitude,
      action:    liveLocationsTable.action,
      updatedAt: liveLocationsTable.updatedAt,
      name:      usersTable.name,
      phone:     usersTable.phone,
      email:     usersTable.email,
    })
    .from(liveLocationsTable)
    .leftJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
    .where(eq(liveLocationsTable.role, "customer"))
    .orderBy(desc(liveLocationsTable.updatedAt));

  const enriched = locs.map(loc => {
    const updatedAt  = loc.updatedAt instanceof Date ? loc.updatedAt : new Date(loc.updatedAt as string);
    const ageSeconds = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
    const isFresh    = updatedAt >= cutoff;
    return {
      userId:    loc.userId,
      name:      loc.name  ?? "Unknown User",
      phone:     loc.phone ?? null,
      email:     loc.email ?? null,
      lat:       parseFloat(String(loc.latitude)),
      lng:       parseFloat(String(loc.longitude)),
      action:    loc.action ?? null,
      updatedAt: updatedAt.toISOString(),
      ageSeconds,
      isFresh,
    };
  });

  sendSuccess(res, { customers: enriched, total: enriched.length, freshCount: enriched.filter(c => c.isFresh).length });
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /admin/search?q=query
   Global search across users, rides, orders, pharmacy, parcels
   Returns max 5 results per category, sorted by relevance (recency)
══════════════════════════════════════════════════════════════════════════════ */
router.patch("/riders/:id/online", async (req, res) => {
  const { isOnline } = req.body as { isOnline: boolean };
  const [rider] = await db.update(usersTable)
    .set({ isOnline, updatedAt: new Date() } as any)
    .where(eq(usersTable.id, req.params["id"]!))
    .returning();
  if (!rider) { sendNotFound(res, "Rider not found"); return; }
  addAuditEntry({ action: "rider_online_toggle", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Rider ${req.params["id"]} set ${isOnline ? "online" : "offline"} by admin`, result: "success" });
  sendSuccess(res, { isOnline });
});

/* ── GET /admin/revenue-trend — 7-day rolling revenue + counts for dashboard sparklines ── */
router.get("/revenue-trend", async (_req, res) => {
  const now = new Date();
  const dayPromises = Array.from({ length: 7 }, (_, idx) => {
    const i = 6 - idx;
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const from = new Date(d); from.setHours(0, 0, 0, 0);
    const to   = new Date(d); to.setHours(23, 59, 59, 999);
    const dateStr = d.toISOString().slice(0, 10);
    return Promise.all([
      db.select({ total: sum(ordersTable.total) })
        .from(ordersTable)
        .where(and(eq(ordersTable.status, "delivered"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to))),
      db.select({ total: sum(ridesTable.fare) })
        .from(ridesTable)
        .where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, from), lte(ridesTable.createdAt, to))),
      db.select({ cnt: count() })
        .from(ordersTable)
        .where(and(eq(ordersTable.status, "delivered"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to))),
      db.select({ cnt: count() })
        .from(ridesTable)
        .where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, from), lte(ridesTable.createdAt, to))),
      /* SOS alerts created on this day (regardless of resolution status) */
      db.select({ cnt: count() })
        .from(notificationsTable)
        .where(and(eq(notificationsTable.type, "sos"), gte(notificationsTable.createdAt, from), lte(notificationsTable.createdAt, to))),
    ]).then(([[orderRev], [rideRev], [orderCnt], [rideCnt], [sosCnt]]) => ({
      date: dateStr,
      revenue: parseFloat(orderRev?.total ?? "0") + parseFloat(rideRev?.total ?? "0"),
      orderCount: orderCnt?.cnt ?? 0,
      rideCount:  rideCnt?.cnt  ?? 0,
      sosCount:   sosCnt?.cnt   ?? 0,
    }));
  });
  const days = await Promise.all(dayPromises);
  sendSuccess(res, { trend: days });
});

/* ── GET /admin/leaderboard — top-5 vendors and riders ── */
router.get("/leaderboard", async (_req, res) => {
  const vendors = await db.select({
    id:     usersTable.id,
    name:   vendorProfilesTable.storeName,
    phone:  usersTable.phone,
    totalOrders: sql<number>`count(${ordersTable.id})`,
    totalRevenue: sql<number>`coalesce(sum(${ordersTable.total}),0)`,
  })
  .from(usersTable)
  .leftJoin(vendorProfilesTable, eq(usersTable.id, vendorProfilesTable.userId))
  .leftJoin(ordersTable, and(eq(ordersTable.vendorId, usersTable.id), eq(ordersTable.status, "delivered")))
  .where(ilike(usersTable.roles, "%vendor%"))
  .groupBy(usersTable.id, vendorProfilesTable.storeName)
  .orderBy(sql`coalesce(sum(${ordersTable.total}),0) desc`)
  .limit(5);

  const riders = await db.select({
    id:   usersTable.id,
    name: usersTable.name,
    phone: usersTable.phone,
    completedTrips: sql<number>`count(${ridesTable.id})`,
    totalEarned: sql<number>`coalesce(sum(${ridesTable.fare}),0)`,
  })
  .from(usersTable)
  .leftJoin(ridesTable, and(eq(ridesTable.riderId, usersTable.id), eq(ridesTable.status, "completed")))
  .where(ilike(usersTable.roles, "%rider%"))
  .groupBy(usersTable.id)
  .orderBy(sql`count(${ridesTable.id}) desc`)
  .limit(5);

  sendSuccess(res, {
    vendors: vendors.map(v => ({ ...v, totalRevenue: parseFloat(String(v.totalRevenue)), totalOrders: Number(v.totalOrders) })),
    riders:  riders.map(r  => ({ ...r,  totalEarned: parseFloat(String(r.totalEarned)),  completedTrips: Number(r.completedTrips) })),
  });
});

/* ── GET /admin/dashboard-export — export dashboard stats + 7-day trend as JSON ── */
router.get("/dashboard-export", async (_req, res) => {
  const now = new Date();
  const [[userCount], [orderCount], [rideCount], [revenue], [rideRev]] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(ordersTable),
    db.select({ count: count() }).from(ridesTable),
    db.select({ total: sum(ordersTable.total) }).from(ordersTable).where(eq(ordersTable.status, "delivered")),
    db.select({ total: sum(ridesTable.fare) }).from(ridesTable).where(eq(ridesTable.status, "completed")),
  ]);

  const trendPromises = Array.from({ length: 7 }, (_, idx) => {
    const i = 6 - idx;
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const from = new Date(d); from.setHours(0, 0, 0, 0);
    const to   = new Date(d); to.setHours(23, 59, 59, 999);
    const dateStr = d.toISOString().slice(0, 10);
    return Promise.all([
      db.select({ total: sum(ordersTable.total) }).from(ordersTable)
        .where(and(eq(ordersTable.status, "delivered"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to))),
      db.select({ total: sum(ridesTable.fare) }).from(ridesTable)
        .where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, from), lte(ridesTable.createdAt, to))),
      db.select({ cnt: count() }).from(ordersTable)
        .where(and(eq(ordersTable.status, "delivered"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to))),
      db.select({ cnt: count() }).from(ridesTable)
        .where(and(eq(ridesTable.status, "completed"), gte(ridesTable.createdAt, from), lte(ridesTable.createdAt, to))),
      db.select({ cnt: count() }).from(notificationsTable)
        .where(and(eq(notificationsTable.type, "sos"), gte(notificationsTable.createdAt, from), lte(notificationsTable.createdAt, to))),
    ]).then(([[o], [r], [oCnt], [rCnt], [sosCnt]]) => ({
      date: dateStr,
      revenue: parseFloat(o?.total ?? "0") + parseFloat(r?.total ?? "0"),
      orderCount: oCnt?.cnt ?? 0,
      rideCount:  rCnt?.cnt  ?? 0,
      sosCount:   sosCnt?.cnt ?? 0,
    }));
  });
  const trend = await Promise.all(trendPromises);

  const snapshot = {
    exportedAt: now.toISOString(),
    users: userCount?.count ?? 0,
    orders: orderCount?.count ?? 0,
    rides: rideCount?.count ?? 0,
    totalRevenue: parseFloat(revenue?.total ?? "0") + parseFloat(rideRev?.total ?? "0"),
    orderRevenue: parseFloat(revenue?.total ?? "0"),
    rideRevenue:  parseFloat(rideRev?.total ?? "0"),
    trend,
  };
  res.setHeader("Content-Disposition", `attachment; filename="dashboard-${now.toISOString().slice(0, 10)}.json"`);
  sendSuccess(res, snapshot);
});

/* ══════════════════════════════════════════════════════════════════════════════
   RIDE MANAGEMENT MODULE — Admin ride actions with full audit logging
══════════════════════════════════════════════════════════════════════════════ */

router.post("/rides/:id/cancel", async (req, res) => {
  const rideId = req.params["id"]!;
  const { reason } = req.body as { reason?: string };
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) { sendNotFound(res, "Ride not found"); return; }
  if (["completed", "cancelled"].includes(ride.status)) {
    sendValidationError(res, `Cannot cancel a ride that is already ${ride.status}`); return;
  }

  const isWallet = ride.paymentMethod === "wallet";
  const refundAmt = parseFloat(ride.fare);
  let refunded = false;

  try {
    await db.transaction(async (tx) => {
      await tx.update(ridesTable)
        .set({ status: "cancelled", cancellationReason: reason || null, updatedAt: new Date() })
        .where(eq(ridesTable.id, rideId));

      await tx.update(rideBidsTable)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(and(eq(rideBidsTable.rideId, rideId), eq(rideBidsTable.status, "pending")));

      if (isWallet) {
        /* Atomic conditional update: only marks refundedAt if it is still NULL.
           If two concurrent cancel requests pass the pre-flight check above, only
           the first one will match this WHERE clause — the second will update 0 rows
           and skip the wallet credit entirely. */
        const refundResult = await tx.update(ridesTable)
          .set({ refundedAt: new Date() })
          .where(and(eq(ridesTable.id, rideId), isNull(ridesTable.refundedAt)))
          .returning({ id: ridesTable.id });

        if (refundResult.length > 0) {
          await tx.update(usersTable)
            .set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: new Date() })
            .where(eq(usersTable.id, ride.userId));
          await tx.insert(walletTransactionsTable).values({
            id: generateId(), userId: ride.userId, type: "credit",
            amount: refundAmt.toFixed(2),
            description: `Refund — Ride #${rideId.slice(-6).toUpperCase()} cancelled by admin`,
          });
          refunded = true;
        }
      }
    });
  } catch (txErr: unknown) {
    addAuditEntry({ action: "ride_cancel", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Ride ${rideId} cancel failed — transaction error: ${(txErr as Error).message}`, result: "fail" });
    sendError(res, "Cancellation failed: could not complete transaction", 500);
    return;
  }

  try {
    if (refunded) {
      await sendUserNotification(ride.userId, "Ride Cancelled & Refunded 💰", `Rs. ${refundAmt.toFixed(0)} refund ho gaya. ${reason ? `Reason: ${reason}` : ""}`, "ride", "wallet-outline");
    } else {
      await sendUserNotification(ride.userId, "Ride Cancelled ❌", `Your ride has been cancelled by admin. ${reason ? `Reason: ${reason}` : ""}`, "ride", "close-circle-outline");
    }
    if (ride.riderId) {
      await sendUserNotification(ride.riderId, "Ride Cancelled ❌", `Ride #${rideId.slice(-6).toUpperCase()} admin ne cancel ki.`, "ride", "close-circle-outline");
    }
  } catch (notifErr) {
    logger.warn("Cancel notifications failed (non-fatal):", (notifErr as Error).message);
  }

  try {
    await db.insert(rideEventLogsTable).values({
      id: generateId(),
      rideId,
      adminId: (req as AdminRequest).adminId,
      event: refunded ? "admin_cancel_refunded" : "admin_cancel",
      notes: `Admin cancelled ride${reason ? ` — ${reason}` : ""}${refunded ? ` (wallet refunded Rs. ${refundAmt.toFixed(2)})` : ""}`,
    });
  } catch (logErr) {
    logger.warn("rideEventLog insert failed for cancel (non-fatal):", (logErr as Error).message);
  }
  addAuditEntry({ action: "ride_cancel", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Admin cancelled ride ${rideId}${reason ? ` — ${reason}` : ""}${refunded ? " (wallet refunded)" : ""}`, result: "success" });
  emitRideUpdate(rideId);
  emitRideDispatchUpdate({ rideId, action: "cancel", status: "cancelled" });
  const ioCan = getIO();
  if (ioCan) {
    const cancelPayload = { id: rideId, status: "cancelled", updatedAt: new Date().toISOString() };
    ioCan.to(getSocketRoom(rideId, "ride")).emit("order:update", cancelPayload);
    ioCan.to(`user:${ride.userId}`).emit("order:update", cancelPayload);
  }
  sendSuccess(res, { rideId, refunded });
});

router.post("/rides/:id/refund", async (req, res) => {
  const rideId = req.params["id"]!;
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) { sendNotFound(res, "Ride not found"); return; }

  /* Only allow refunds on cancelled or completed rides */
  if (!["cancelled", "completed"].includes(ride.status)) {
    sendValidationError(res, `Cannot refund a ride in status "${ride.status}". Refunds are only allowed for cancelled or completed rides.`); return;
  }

  /* Optimistic pre-check for fast rejection; idempotency is enforced atomically below */
  if (ride.refundedAt) {
    sendValidationError(res, "This ride has already been refunded. Duplicate refunds are not allowed."); return;
  }

  const refundAmt = amount ?? parseFloat(ride.fare);
  if (refundAmt <= 0 || !isFinite(refundAmt)) { sendValidationError(res, "Invalid refund amount"); return; }

  try {
    await db.transaction(async (tx) => {
      /* Atomic conditional set: only succeeds if refunded_at is still NULL.
         Uses .returning() so the row count is deterministic regardless of the
         underlying DB driver — no rowCount/rowsAffected ambiguity.
         If two requests race past the pre-check, only one gets a row back. */
      const refundRows = await tx.update(ridesTable)
        .set({ refundedAt: new Date() })
        .where(and(eq(ridesTable.id, rideId), isNull(ridesTable.refundedAt)))
        .returning({ id: ridesTable.id });

      if (refundRows.length === 0) {
        throw new Error("ALREADY_REFUNDED");
      }

      await tx.update(usersTable).set({ walletBalance: sql`wallet_balance + ${refundAmt}`, updatedAt: new Date() }).where(eq(usersTable.id, ride.userId));
      await tx.insert(walletTransactionsTable).values({
        id: generateId(), userId: ride.userId, type: "credit",
        amount: refundAmt.toFixed(2),
        description: `Admin refund — Ride #${rideId.slice(-6).toUpperCase()}${reason ? ` (${reason})` : ""}`,
      });
      await tx.insert(rideEventLogsTable).values({
        id: generateId(),
        rideId,
        adminId: (req as AdminRequest).adminId,
        event: "admin_refund",
        notes: `Admin issued refund Rs. ${refundAmt.toFixed(2)}${reason ? ` — ${reason}` : ""}`,
      });
    });
  } catch (txErr: unknown) {
    const errMsg = (txErr as Error).message;
    if (errMsg === "ALREADY_REFUNDED") {
      sendValidationError(res, "This ride has already been refunded. Duplicate refunds are not allowed."); return;
    }
    addAuditEntry({ action: "ride_refund", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Ride ${rideId} refund failed — transaction error: ${errMsg}`, result: "fail" });
    sendError(res, "Refund failed: could not complete transaction", 500);
    return;
  }

  try {
    await sendUserNotification(ride.userId, "Ride Refund 💰", `Rs. ${refundAmt.toFixed(0)} aapki wallet mein refund ho gaya.`, "ride", "wallet-outline");
  } catch (notifErr) {
    logger.warn("Refund notification failed (non-fatal):", (notifErr as Error).message);
  }
  addAuditEntry({ action: "ride_refund", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Admin refunded Rs. ${refundAmt} for ride ${rideId}${reason ? ` — ${reason}` : ""}`, result: "success" });
  emitRideDispatchUpdate({ rideId, action: "refund", status: ride.status });
  sendSuccess(res, { rideId, refundedAmount: refundAmt });
});

router.post("/rides/:id/reassign", async (req, res) => {
  const rideId = req.params["id"]!;
  const { riderId, riderName, riderPhone } = req.body as { riderId?: string; riderName?: string; riderPhone?: string };
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) { sendNotFound(res, "Ride not found"); return; }
  if (["completed", "cancelled"].includes(ride.status)) {
    sendValidationError(res, `Cannot reassign a ride that is ${ride.status}`); return;
  }

  if (!riderId) { sendValidationError(res, "riderId is required to reassign"); return; }

  const [riderUser] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, roles: usersTable.roles, isActive: usersTable.isActive, approvalStatus: usersTable.approvalStatus, isOnline: usersTable.isOnline })
    .from(usersTable).where(eq(usersTable.id, riderId)).limit(1);
  if (!riderUser) { sendNotFound(res, "Rider not found"); return; }
  if (!(riderUser.roles ?? "").includes("rider")) { sendValidationError(res, "Selected user is not a rider"); return; }
  if (riderUser.isActive === false) { sendValidationError(res, "Cannot assign ride to a deactivated rider account"); return; }
  if (riderUser.approvalStatus === "rejected") { sendValidationError(res, "Cannot assign ride to a rejected/blocked rider"); return; }
  if (riderUser.isOnline === false) { sendValidationError(res, "Cannot assign ride to an offline rider. Rider must be online to receive assignments."); return; }

  const oldRiderId = ride.riderId;
  const resolvedName = riderName || riderUser.name;
  const resolvedPhone = riderPhone || riderUser.phone;
  const updateData: Record<string, any> = {
    riderId,
    riderName: resolvedName,
    riderPhone: resolvedPhone,
    updatedAt: new Date(),
  };
  if (!ride.riderId) updateData.status = "accepted";

  /* Cancel all open bids so no competing rider can still accept */
  await db.update(rideBidsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(eq(rideBidsTable.rideId, rideId), eq(rideBidsTable.status, "pending")));

  const [updated] = await db.update(ridesTable).set(updateData).where(eq(ridesTable.id, rideId)).returning();

  try {
    if (oldRiderId && oldRiderId !== riderId) {
      await sendUserNotification(oldRiderId, "Ride Reassigned", `Ride #${rideId.slice(-6).toUpperCase()} doosre rider ko assign ho gayi.`, "ride", "swap-horizontal-outline");
    }
    if (riderId) {
      await sendUserNotification(riderId, "New Ride Assigned 🚗", `Ride #${rideId.slice(-6).toUpperCase()} aapko assign ho gayi!`, "ride", "car-outline");
    }
    await sendUserNotification(ride.userId, "Rider Changed", `Aapki ride ka rider change ho gaya hai${resolvedName ? ` — ${resolvedName}` : ""}.`, "ride", "swap-horizontal-outline");
  } catch (notifErr) {
    logger.warn("Reassign notifications failed (non-fatal):", (notifErr as Error).message);
  }

  try {
    await db.insert(rideEventLogsTable).values({
      id: generateId(),
      rideId,
      adminId: (req as AdminRequest).adminId,
      event: "admin_reassign",
      notes: `Admin reassigned from ${oldRiderId ?? "none"} to ${riderId} (${resolvedName})`,
    });
  } catch (logErr) {
    logger.warn("rideEventLog insert failed for reassign (non-fatal):", (logErr as Error).message);
  }
  addAuditEntry({ action: "ride_reassign", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Admin reassigned ride ${rideId} from ${oldRiderId ?? "none"} to ${riderId} (${resolvedName})`, result: "success" });
  emitRideUpdate(rideId);
  emitRideDispatchUpdate({ rideId, action: "reassign", status: updated!.status });
  const ioReassign = getIO();
  if (ioReassign) {
    const reassignPayload = { id: rideId, status: updated!.status, riderId, riderName: resolvedName, updatedAt: updated!.updatedAt instanceof Date ? updated!.updatedAt.toISOString() : updated!.updatedAt };
    ioReassign.to(getSocketRoom(rideId, "ride")).emit("order:update", reassignPayload);
    ioReassign.to(`user:${ride.userId}`).emit("order:update", reassignPayload);
  }
  sendSuccess(res, { ride: { ...updated, fare: parseFloat(updated!.fare), distance: parseFloat(updated!.distance) } });
});

router.get("/rides/:id/audit-trail", async (req, res) => {
  const rideId = req.params["id"]!;
  const shortId = rideId.slice(-6).toUpperCase();
  const trail = auditLog.filter(e => e.details?.includes(rideId) || e.details?.includes(shortId)).map(e => ({
    action: e.action,
    details: e.details,
    ip: e.ip,
    adminId: e.adminId,
    result: e.result,
    timestamp: e.timestamp,
  }));
  trail.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  sendSuccess(res, { trail, rideId });
});

router.get("/rides/:id/detail", async (req, res) => {
  const rideId = req.params["id"]!;
  const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
  if (!ride) { sendNotFound(res, "Ride not found"); return; }

  const [customer] = await db.select({ name: usersTable.name, phone: usersTable.phone, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, ride.userId)).limit(1);
  let rider = null;
  if (ride.riderId) {
    const [r] = await db.select({ name: usersTable.name, phone: usersTable.phone, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, ride.riderId)).limit(1);
    rider = r ?? null;
  }

  const eventLogs = await db.select().from(rideEventLogsTable).where(eq(rideEventLogsTable.rideId, rideId)).orderBy(asc(rideEventLogsTable.createdAt));

  const bidRows = await db.select().from(rideBidsTable).where(eq(rideBidsTable.rideId, rideId)).orderBy(desc(rideBidsTable.createdAt));

  const notifiedCount = await db.select({ cnt: count() }).from(rideNotifiedRidersTable).where(eq(rideNotifiedRidersTable.rideId, rideId));

  const s = await getPlatformSettings();
  const gstEnabled = (s["finance_gst_enabled"] ?? "off") === "on";
  const gstPct = parseFloat(s["finance_gst_pct"] ?? "17");
  const surgeEnabled = (s["ride_surge_enabled"] ?? "off") === "on";
  const surgeMultiplier = surgeEnabled ? parseFloat(s["ride_surge_multiplier"] ?? "1.5") : 1;
  const fare = parseFloat(ride.fare);
  const gstAmount = gstEnabled ? parseFloat(((fare * gstPct) / (100 + gstPct)).toFixed(2)) : 0;
  const baseFare = fare - gstAmount;

  sendSuccess(res, {
    ride: {
      ...ride,
      fare,
      distance: parseFloat(ride.distance),
      offeredFare: ride.offeredFare ? parseFloat(ride.offeredFare) : null,
      counterFare: ride.counterFare ? parseFloat(ride.counterFare) : null,
      createdAt: ride.createdAt.toISOString(),
      updatedAt: ride.updatedAt.toISOString(),
      acceptedAt:   ride.acceptedAt   ? ride.acceptedAt.toISOString()   : null,
      dispatchedAt: ride.dispatchedAt ? ride.dispatchedAt.toISOString() : null,
      arrivedAt:    ride.arrivedAt    ? ride.arrivedAt.toISOString()    : null,
      startedAt:    ride.startedAt    ? ride.startedAt.toISOString()    : null,
      completedAt:  ride.completedAt  ? ride.completedAt.toISOString()  : null,
      cancelledAt:  ride.cancelledAt  ? ride.cancelledAt.toISOString()  : null,
      tripOtp:      ride.tripOtp ?? null,
      otpVerified:  ride.otpVerified ?? false,
      isParcel:     ride.isParcel ?? false,
      receiverName: ride.receiverName ?? null,
      receiverPhone:ride.receiverPhone ?? null,
      packageType:  ride.packageType ?? null,
    },
    customer: customer ?? null,
    rider: rider ?? null,
    fareBreakdown: { baseFare, gstAmount, gstPct: gstEnabled ? gstPct : 0, surgeMultiplier, total: fare },
    eventLogs: eventLogs.map(e => ({
      ...e,
      lat: e.lat ? parseFloat(e.lat) : null,
      lng: e.lng ? parseFloat(e.lng) : null,
      createdAt: e.createdAt.toISOString(),
    })),
    bids: bidRows.map(b => ({
      ...b,
      fare: parseFloat(b.fare),
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })),
    notifiedRiderCount: Number(notifiedCount[0]?.cnt ?? 0),
  });
});

router.get("/dispatch-monitor", async (_req, res) => {
  const activeRides = await db.select().from(ridesTable)
    .where(or(eq(ridesTable.status, "searching"), eq(ridesTable.status, "bargaining")))
    .orderBy(desc(ridesTable.createdAt));

  const rideIds = activeRides.map(r => r.id);
  let notifiedCounts: Record<string, number> = {};
  if (rideIds.length > 0) {
    const counts = await db.select({ rideId: rideNotifiedRidersTable.rideId, cnt: count() })
      .from(rideNotifiedRidersTable)
      .where(sql`${rideNotifiedRidersTable.rideId} IN (${sql.join(rideIds.map(id => sql`${id}`), sql`, `)})`)
      .groupBy(rideNotifiedRidersTable.rideId);
    notifiedCounts = Object.fromEntries(counts.map(c => [c.rideId, Number(c.cnt)]));
  }

  const userIds = [...new Set(activeRides.map(r => r.userId))];
  let userMap: Record<string, { name: string | null; phone: string | null }> = {};
  if (userIds.length > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(sql`${usersTable.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
    userMap = Object.fromEntries(users.map(u => [u.id, { name: u.name, phone: u.phone }]));
  }

  const bidCounts = rideIds.length > 0
    ? await db.select({ rideId: rideBidsTable.rideId, total: count(rideBidsTable.id) })
        .from(rideBidsTable)
        .where(sql`${rideBidsTable.rideId} IN (${sql.join(rideIds.map(id => sql`${id}`), sql`, `)})`)
        .groupBy(rideBidsTable.rideId)
    : [];
  const bidCountMap = Object.fromEntries(bidCounts.map(b => [b.rideId, Number(b.total)]));

  sendSuccess(res, {
    rides: activeRides.map(r => ({
      id: r.id,
      type: r.type,
      status: r.status,
      pickupAddress: r.pickupAddress,
      dropAddress: r.dropAddress,
      pickupLat: r.pickupLat ? parseFloat(r.pickupLat) : null,
      pickupLng: r.pickupLng ? parseFloat(r.pickupLng) : null,
      fare: parseFloat(r.fare),
      offeredFare: r.offeredFare ? parseFloat(r.offeredFare) : null,
      customerName: userMap[r.userId]?.name ?? "Unknown",
      customerPhone: userMap[r.userId]?.phone ?? null,
      notifiedRiders: notifiedCounts[r.id] ?? 0,
      totalBids: bidCountMap[r.id] ?? 0,
      elapsedSeconds: Math.floor((Date.now() - r.createdAt.getTime()) / 1000),
      createdAt: r.createdAt.toISOString(),
      bargainStatus: r.bargainStatus,
    })),
    total: activeRides.length,
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   GET /admin/fleet-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
   Returns:
   - heatmap: array of { lat, lng, weight } from location_logs in date range
   - avgResponseTime: average minutes between ride/order creation and acceptance
   - peakZones: top location clusters by ping density
   - riderDistances: total estimated distance per rider (haversine over log trail)
══════════════════════════════════════════════════════════════════════════════ */
router.get("/fleet-analytics", async (req, res) => {
  const fromParam = req.query["from"] as string | undefined;
  const toParam   = req.query["to"]   as string | undefined;

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const from = (fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam))
    ? new Date(`${fromParam}T00:00:00.000Z`)
    : defaultFrom;
  const to   = (toParam   && /^\d{4}-\d{2}-\d{2}$/.test(toParam))
    ? new Date(`${toParam}T23:59:59.999Z`)
    : now;

  /* Heatmap data: all rider pings in the date range */
  const heatPoints = await db
    .select({
      latitude:  locationLogsTable.latitude,
      longitude: locationLogsTable.longitude,
    })
    .from(locationLogsTable)
    .where(and(
      eq(locationLogsTable.role, "rider"),
      gte(locationLogsTable.createdAt, from),
      lte(locationLogsTable.createdAt, to),
    ))
    .limit(10000);

  const heatmap = heatPoints.map(p => ({
    lat: parseFloat(String(p.latitude)),
    lng: parseFloat(String(p.longitude)),
    weight: 1,
  }));

  /* Average response time: time from request creation to first acceptance, across rides AND orders */
  const [ridesResponseRow] = await db.select({
    avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)) * 1000)`,
  }).from(ridesTable).where(and(
    sql`accepted_at IS NOT NULL`,
    gte(ridesTable.createdAt, from),
    lte(ridesTable.createdAt, to),
  ));

  /* Orders: estimate acceptance time as time between created_at and updated_at
     when riderId is assigned. This is an approximation since orders lack an acceptedAt column. */
  const [ordersResponseRow] = await db.select({
    avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) * 1000)`,
  }).from(ordersTable).where(and(
    sql`rider_id IS NOT NULL`,
    gte(ordersTable.createdAt, from),
    lte(ordersTable.createdAt, to),
    /* Filter outliers: ignore if acceptance took >60 min (likely a stale update) */
    sql`EXTRACT(EPOCH FROM (updated_at - created_at)) < 3600`,
  ));

  /* Weighted average: prefer rides (more precise) but blend in orders when available */
  const ridesAvgMs = ridesResponseRow?.avgMs ? Number(ridesResponseRow.avgMs) : null;
  const ordersAvgMs = ordersResponseRow?.avgMs ? Number(ordersResponseRow.avgMs) : null;
  const blendedMs = ridesAvgMs != null && ordersAvgMs != null
    ? (ridesAvgMs + ordersAvgMs) / 2
    : ridesAvgMs ?? ordersAvgMs;
  const avgResponseTimeMin = blendedMs != null
    ? Math.round(blendedMs / 60000 * 10) / 10
    : null;

  /* Per-rider distance estimation from location logs */
  const riderLogs = await db
    .select({
      userId:    locationLogsTable.userId,
      latitude:  locationLogsTable.latitude,
      longitude: locationLogsTable.longitude,
      createdAt: locationLogsTable.createdAt,
    })
    .from(locationLogsTable)
    .where(and(
      eq(locationLogsTable.role, "rider"),
      gte(locationLogsTable.createdAt, from),
      lte(locationLogsTable.createdAt, to),
    ))
    .orderBy(asc(locationLogsTable.userId), asc(locationLogsTable.createdAt))
    .limit(50000);

  const riderDistanceMap = new Map<string, number>();
  let prevByRider = new Map<string, { lat: number; lng: number }>();

  for (const log of riderLogs) {
    const lat = parseFloat(String(log.latitude));
    const lng = parseFloat(String(log.longitude));
    const prev = prevByRider.get(log.userId);
    if (prev) {
      const R = 6371;
      const dLat = (lat - prev.lat) * Math.PI / 180;
      const dLng = (lng - prev.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(prev.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      riderDistanceMap.set(log.userId, (riderDistanceMap.get(log.userId) ?? 0) + distKm);
    }
    prevByRider.set(log.userId, { lat, lng });
  }

  /* Enrich rider distances with rider names */
  const riderIds = [...riderDistanceMap.keys()];
  const riderNames = riderIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(riderIds.map(id => sql`${id}`), sql`, `)}])`)
    : [];
  const nameMap = new Map(riderNames.map(r => [r.id, r.name ?? "Unknown"]));

  const riderDistances = [...riderDistanceMap.entries()]
    .map(([userId, distKm]) => ({
      userId,
      name: nameMap.get(userId) ?? "Unknown",
      distanceKm: Math.round(distKm * 10) / 10,
    }))
    .sort((a, b) => b.distanceKm - a.distanceKm)
    .slice(0, 20);

  /* Peak zones: bin pings into ~500 m grid cells, return top clusters */
  const GRID_DEG = 0.005; /* ~500 m resolution */
  const cellCounts = new Map<string, { lat: number; lng: number; count: number }>();
  for (const p of heatmap) {
    const cellLat = Math.round(p.lat / GRID_DEG) * GRID_DEG;
    const cellLng = Math.round(p.lng / GRID_DEG) * GRID_DEG;
    const key = `${cellLat.toFixed(4)},${cellLng.toFixed(4)}`;
    const existing = cellCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      cellCounts.set(key, { lat: cellLat, lng: cellLng, count: 1 });
    }
  }
  const peakZones = [...cellCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(z => ({ lat: z.lat, lng: z.lng, pings: z.count }));

  sendSuccess(res, {
    heatmap,
    avgResponseTimeMin,
    riderDistances,
    peakZones,
    totalPings: heatmap.length,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
});

/* ── GET /admin/riders/:userId/route?date=YYYY-MM-DD&sinceOnline=true — fleet history for admin ──
   When sinceOnline=true (or no date), the trail is scoped to the rider's current login session:
   it uses the rider's live_locations.lastSeen timestamp as the session start boundary,
   giving "current shift to now" semantics rather than calendar midnight. */
router.get("/riders/:userId/route", async (req, res) => {
  const { userId } = req.params;
  const dateParam   = req.query["date"]        as string | undefined;
  const sinceOnline = req.query["sinceOnline"]  === "true";

  let startOfDay: Date;
  let endOfDay: Date;

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    /* Historic date requested — use full calendar day */
    startOfDay = new Date(`${dateParam}T00:00:00.000Z`);
    endOfDay   = new Date(`${dateParam}T23:59:59.999Z`);
  } else if (sinceOnline) {
    /* Session-scoped: use onlineSince (set once when rider goes online, never overwritten by heartbeat).
       This gives stable "current session start" semantics, unlike lastSeen which moves on every heartbeat. */
    const [liveLoc] = await db
      .select({ onlineSince: liveLocationsTable.onlineSince })
      .from(liveLocationsTable)
      .where(eq(liveLocationsTable.userId, userId))
      .limit(1);
    const sessionStart = liveLoc?.onlineSince ? new Date(liveLoc.onlineSince) : null;
    /* Fallback: 8-hour shift window (covers most shifts even without a logged session start) */
    startOfDay = sessionStart ?? new Date(Date.now() - 8 * 60 * 60 * 1000);
    endOfDay   = new Date();
  } else {
    const now = new Date();
    startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }

  /* location_history stores smart-filtered waypoints (significant movement only, ≥ threshold metres).
     This gives the admin a clean path trace rather than raw GPS noise from location_logs. */
  const logs = await db
    .select()
    .from(locationHistoryTable)
    .where(
      and(
        eq(locationHistoryTable.userId, userId),
        gte(locationHistoryTable.createdAt, startOfDay),
        lte(locationHistoryTable.createdAt, endOfDay),
      )
    )
    .orderBy(asc(locationHistoryTable.createdAt));

  const points = logs.map(l => ({
    latitude:  (l.coords as { lat: number; lng: number }).lat,
    longitude: (l.coords as { lat: number; lng: number }).lng,
    speed:     l.speed   != null ? parseFloat(String(l.speed))   : null,
    heading:   l.heading != null ? parseFloat(String(l.heading)) : null,
    createdAt: l.createdAt.toISOString(),
  }));

  const loginLocation  = points[0] ?? null;
  const lastLocation   = points[points.length - 1] ?? null;

  sendSuccess(res, { userId, date: dateParam ?? "today", loginLocation, lastLocation, route: points, total: points.length });
});

/* ══════════════════════════════════════════════════════════════
   Admin — Review Management
   ══════════════════════════════════════════════════════════════ */

/* ── GET /admin/reviews — paginated list of all reviews (order reviews + ride ratings) ── */

export default router;
