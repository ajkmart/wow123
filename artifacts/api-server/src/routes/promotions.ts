import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  campaignsTable, offersTable, offerRedemptionsTable, campaignParticipationsTable,
  offerTemplatesTable, promoCodesTable, ordersTable, adminAccountsTable, usersTable,
} from "@workspace/db/schema";
import { eq, desc, asc, and, gte, lte, count, sum, inArray, SQL, sql } from "drizzle-orm";
import { generateId, adminAuth } from "./admin-shared.js";
import { sendSuccess, sendCreated, sendError, sendNotFound, sendValidationError, sendForbidden } from "../lib/response.js";
import { customerAuth, requireRole } from "../middleware/security.js";

/** Marketing-capable admin check.
 * Super-admins, managers, and admins with the "marketing" permission may manage promotions.
 * Verified roles: super, manager, marketing_manager.
 * Sub-admins need "marketing" in their permissions string. */
async function marketingAuth(req: Request, res: Response, next: NextFunction) {
  adminAuth(req, res, async () => {
    const role: string = req.adminRole ?? "";
    if (role === "super" || role === "manager" || role === "marketing_manager") {
      next();
      return;
    }
    // For other roles, check if they have the "marketing" permission in the DB
    const adminId: string | undefined = req.adminId;
    if (adminId) {
      const [account] = await db.select({ permissions: adminAccountsTable.permissions })
        .from(adminAccountsTable).where(eq(adminAccountsTable.id, adminId)).limit(1);
      if (account) {
        const perms = account.permissions.split(",").map((p: string) => p.trim());
        if (perms.includes("marketing")) { next(); return; }
      }
    }
    sendForbidden(res, "Marketing permission required");
  });
}

/** Manager/super-only auth. Wraps adminAuth + restricts to "super" or "manager" roles. */
function managerAuth(req: Request, res: Response, next: NextFunction) {
  adminAuth(req, res, () => {
    const role: string = req.adminRole ?? "";
    if (role === "super" || role === "manager") { next(); return; }
    sendForbidden(res, "Only managers and super-admins can perform this action");
  });
}

const router = Router();

/* ─── helpers ─── */
function nowIso() { return new Date(); }

type OfferRow = typeof offersTable.$inferSelect;
type CampaignRow = typeof campaignsTable.$inferSelect;
type TemplateRow = typeof offerTemplatesTable.$inferSelect;

function computeOfferStatus(o: Pick<OfferRow, "status" | "startDate" | "endDate" | "usageLimit" | "usedCount">): string {
  const now = nowIso();
  if (o.status === "draft")            return "draft";
  if (o.status === "pending_approval") return "pending_approval";
  if (o.status === "paused")           return "paused";
  if (o.status === "rejected")         return "rejected";
  if (o.startDate > now)               return "scheduled";
  if (o.endDate < now)                 return "expired";
  if (o.usageLimit !== null && o.usedCount >= o.usageLimit) return "exhausted";
  if (o.status === "live")             return "live";
  return o.status;
}

function parseDecimal(v: string | null | undefined): number | null {
  return v != null ? parseFloat(String(v)) : null;
}

function mapOffer(o: OfferRow) {
  return {
    ...o,
    discountPct:    parseDecimal(o.discountPct),
    discountFlat:   parseDecimal(o.discountFlat),
    minOrderAmount: parseDecimal(o.minOrderAmount) ?? 0,
    maxDiscount:    parseDecimal(o.maxDiscount),
    cashbackPct:    parseDecimal(o.cashbackPct),
    cashbackMax:    parseDecimal(o.cashbackMax),
    startDate:      o.startDate instanceof Date ? o.startDate.toISOString() : o.startDate,
    endDate:        o.endDate instanceof Date   ? o.endDate.toISOString()   : o.endDate,
    createdAt:      o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt:      o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    computedStatus: computeOfferStatus(o),
  };
}

function mapCampaign(c: CampaignRow) {
  return {
    ...c,
    budgetCap:   parseDecimal(c.budgetCap),
    budgetSpent: parseDecimal(c.budgetSpent) ?? 0,
    startDate:   c.startDate instanceof Date ? c.startDate.toISOString() : c.startDate,
    endDate:     c.endDate instanceof Date   ? c.endDate.toISOString()   : c.endDate,
    createdAt:   c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt:   c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

function mapTemplate(t: TemplateRow) {
  return {
    ...t,
    discountPct:    parseDecimal(t.discountPct),
    discountFlat:   parseDecimal(t.discountFlat),
    minOrderAmount: parseDecimal(t.minOrderAmount) ?? 0,
    maxDiscount:    parseDecimal(t.maxDiscount),
    cashbackPct:    parseDecimal(t.cashbackPct),
    cashbackMax:    parseDecimal(t.cashbackMax),
    createdAt:      t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt:      t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

/* ─────────────────────────────────────────────────────────────
   PUBLIC CUSTOMER ENDPOINTS (no auth required for browsing)
───────────────────────────────────────────────────────────── */

/* GET /promotions/public — live offers for customers */
router.get("/public", async (req, res) => {
  const now = nowIso();
  const type = req.query["type"] as string | undefined;

  const offers = await db
    .select()
    .from(offersTable)
    .where(
      and(
        eq(offersTable.status, "live"),
        lte(offersTable.startDate, now),
        gte(offersTable.endDate, now),
      )
    )
    .orderBy(asc(offersTable.sortOrder), desc(offersTable.createdAt));

  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(
      and(
        eq(campaignsTable.status, "live"),
        lte(campaignsTable.startDate, now),
        gte(campaignsTable.endDate, now),
      )
    )
    .orderBy(asc(campaignsTable.priority));

  let filteredOffers = offers;
  if (type && type !== "all") {
    filteredOffers = offers.filter(o => o.type === type || o.appliesTo === "all" || o.appliesTo === type);
  }

  const groupedOffers = {
    flashDeals:      filteredOffers.filter(o => o.type === "flash_deal" || o.type === "percentage"),
    freeDelivery:    filteredOffers.filter(o => o.freeDelivery || o.type === "free_delivery"),
    categoryOffers:  filteredOffers.filter(o => o.type === "category" || o.type === "flat_discount"),
    newUserSpecials: filteredOffers.filter(o => {
      const rules = (o.targetingRules ?? {}) as Record<string, unknown>;
      return rules["newUsersOnly"] === true || o.type === "first_order";
    }),
    bogoDeals:       filteredOffers.filter(o => o.type === "bogo"),
    cashback:        filteredOffers.filter(o => o.type === "cashback"),
    happyHour:       filteredOffers.filter(o => o.type === "happy_hour"),
    bundles:         filteredOffers.filter(o => o.type === "combo"),
  };

  sendSuccess(res, {
    offers: filteredOffers.map(mapOffer),
    campaigns: campaigns.map(mapCampaign),
    grouped: {
      flashDeals:      groupedOffers.flashDeals.map(mapOffer),
      freeDelivery:    groupedOffers.freeDelivery.map(mapOffer),
      categoryOffers:  groupedOffers.categoryOffers.map(mapOffer),
      newUserSpecials: groupedOffers.newUserSpecials.map(mapOffer),
      bogoDeals:       groupedOffers.bogoDeals.map(mapOffer),
      cashback:        groupedOffers.cashback.map(mapOffer),
      happyHour:       groupedOffers.happyHour.map(mapOffer),
      bundles:         groupedOffers.bundles.map(mapOffer),
    },
  });
});

/* GET /promotions/for-you — personalized recommendations */
router.get("/for-you", customerAuth, async (req: Request, res) => {
  const userId: string | undefined = req.customerId ?? undefined;
  if (!userId) { sendValidationError(res, "auth required"); return; }

  const now = nowIso();
  const liveOffers = await db
    .select()
    .from(offersTable)
    .where(
      and(
        eq(offersTable.status, "live"),
        lte(offersTable.startDate, now),
        gte(offersTable.endDate, now),
      )
    )
    .limit(20);

  const userOrders = await db
    .select({ type: ordersTable.type, total: ordersTable.total, createdAt: ordersTable.createdAt })
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(20);

  const isNewUser = userOrders.length === 0;
  const totalSpent = userOrders.reduce((sum, o) => sum + parseFloat(String(o.total || "0")), 0);
  const serviceFreq: Record<string, number> = {};
  for (const o of userOrders) {
    const t = o.type ?? "mart";
    serviceFreq[t] = (serviceFreq[t] || 0) + 1;
  }
  const topService = Object.entries(serviceFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mart";

  const scored = liveOffers.map(o => {
    const rules = (o.targetingRules ?? {}) as Record<string, unknown>;
    let score = 50;
    if (isNewUser && (rules["newUsersOnly"] || o.type === "first_order")) score += 40;
    if (!isNewUser && rules["returningUsersOnly"]) score += 20;
    if (o.appliesTo === topService || o.appliesTo === "all") score += 15;
    if (totalSpent > 5000 && rules["highValueUser"]) score += 10;
    return { ...o, relevanceScore: score };
  });
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  sendSuccess(res, {
    offers: scored.slice(0, 10).map(o => mapOffer(o)),
    context: { isNewUser, topService, totalSpent },
  });
});

/* POST /promotions/auto-apply — find and return the best applicable offer for a cart */
router.post("/auto-apply", customerAuth, async (req: Request, res) => {
  const userId = req.customerId!;
  const { orderTotal, orderType } = req.body as { orderTotal?: unknown; orderType?: string };
  const total = parseFloat(String(orderTotal ?? "0"));
  const svcType = (orderType ?? "mart").toLowerCase().trim();
  const now = nowIso();

  /* Load live offers eligible for this cart (no code required = automatic) */
  const candidateOffers = await db
    .select()
    .from(offersTable)
    .where(
      and(
        eq(offersTable.status, "live"),
        lte(offersTable.startDate, now),
        gte(offersTable.endDate, now),
      )
    )
    .limit(50);

  /* Fetch user context for targeting */
  const [userRow] = await db.select({ createdAt: usersTable.createdAt }).from(usersTable)
    .where(eq(usersTable.id, userId)).limit(1);
  const [orderCountRow] = await db.select({ c: count() }).from(ordersTable)
    .where(eq(ordersTable.userId, userId));
  const [spendRow] = await db.select({ s: sum(ordersTable.total) }).from(ordersTable)
    .where(eq(ordersTable.userId, userId));

  const isNewUser = userRow ? (Date.now() - userRow.createdAt.getTime()) < 30 * 24 * 60 * 60 * 1000 : false;
  const totalOrders = Number(orderCountRow?.c ?? 0);
  const totalSpend = parseFloat(String(spendRow?.s ?? "0"));

  /* Score and filter eligible offers */
  type ScoredOffer = { offer: typeof offersTable.$inferSelect; discount: number; score: number };
  const eligible: ScoredOffer[] = [];

  for (const offer of candidateOffers) {
    /* Skip code-gated offers — auto-apply only serves codeless offers */
    if (offer.code) continue;

    /* Skip globally exhausted offers */
    if (offer.usageLimit !== null && offer.usedCount >= (offer.usageLimit ?? Infinity)) continue;

    const minAmt = parseFloat(String(offer.minOrderAmount ?? "0"));
    if (total < minAmt) continue;

    const appliesTo = (offer.appliesTo ?? "all").toLowerCase().trim();
    if (appliesTo !== "all" && appliesTo !== svcType) continue;

    const rules = (offer.targetingRules ?? {}) as Record<string, unknown>;
    if (rules.newUsersOnly && !isNewUser) continue;
    if (rules.returningUsersOnly && totalOrders === 0) continue;
    if (rules.highValueUser && totalSpend < 5000) continue;

    /* Per-user usage check (exclude bookmark records where orderId IS NULL and discount=0) */
    const usagePerUser = offer.usagePerUser ? Number(offer.usagePerUser) : null;
    if (usagePerUser !== null && usagePerUser > 0) {
      const [redemptionRow] = await db.select({ c: count() }).from(offerRedemptionsTable)
        .where(and(
          eq(offerRedemptionsTable.offerId, offer.id),
          eq(offerRedemptionsTable.userId, userId),
          sql`${offerRedemptionsTable.orderId} IS NOT NULL`,
        ));
      if (Number(redemptionRow?.c ?? 0) >= usagePerUser) continue;
    }

    /* Calculate discount */
    let discount = 0;
    if (offer.freeDelivery) {
      discount = 0; /* delivery waiver — score by minOrder */
    }
    if (offer.discountPct) {
      discount = Math.round(total * parseFloat(String(offer.discountPct)) / 100);
      if (offer.maxDiscount) discount = Math.min(discount, parseFloat(String(offer.maxDiscount)));
    } else if (offer.discountFlat) {
      discount = parseFloat(String(offer.discountFlat));
    }
    discount = Math.min(discount, total);

    eligible.push({ offer, discount, score: discount });
  }

  /* Sort by highest discount value (best for user) */
  eligible.sort((a, b) => b.score - a.score);
  const best = eligible[0];

  if (!best) {
    sendSuccess(res, { applied: false, offer: null, discount: 0, freeDelivery: false });
    return;
  }

  sendSuccess(res, {
    applied: true,
    offer: mapOffer(best.offer),
    discount: best.discount,
    freeDelivery: best.offer.freeDelivery ?? false,
    savingsMessage: best.discount > 0
      ? `Best offer applied: save Rs. ${best.discount}`
      : best.offer.freeDelivery
        ? "Free delivery applied automatically"
        : "Offer applied",
  });
});

type ValidatedEntry = {
  type: "offer" | "promo_code";
  offerId?: string;
  promoId?: string;
  code?: string;
  name?: string;
  description?: string;
  offerType?: string;
  discount: number;
  freeDelivery?: boolean;
};

/* POST /promotions/validate — validate and calculate offer discount */
router.post("/validate", customerAuth, async (req: Request, res) => {
  const { code, offerIds, orderTotal, orderType } = req.body as {
    code?: string;
    offerIds?: unknown[];
    orderTotal?: unknown;
    orderType?: string;
  };
  const userId: string | undefined = req.customerId ?? undefined;
  const total = parseFloat(String(orderTotal ?? "0"));
  const now = nowIso();

  const validatedOffers: ValidatedEntry[] = [];
  let totalDiscount = 0;
  let freeDelivery = false;
  const errors: string[] = [];

  /* Collect raw offer rows to validate */
  type OfferRow = typeof offersTable.$inferSelect;
  const offersToValidate: OfferRow[] = [];

  if (code) {
    const upperCode = code.toUpperCase().trim();
    const [offerByCode] = await db.select().from(offersTable)
      .where(and(eq(offersTable.code, upperCode), eq(offersTable.status, "live")))
      .limit(1);
    if (offerByCode) {
      offersToValidate.push(offerByCode);
    } else {
      const [promo] = await db.select().from(promoCodesTable)
        .where(eq(promoCodesTable.code, upperCode)).limit(1);
      if (promo) {
        if (!promo.isActive) { errors.push("This code is not active."); }
        else if (promo.expiresAt && now > promo.expiresAt) { errors.push("This code has expired."); }
        else if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) { errors.push("This code has reached its usage limit."); }
        else {
          let discount = 0;
          if (promo.discountPct) {
            discount = Math.round(total * parseFloat(String(promo.discountPct)) / 100);
            if (promo.maxDiscount) discount = Math.min(discount, parseFloat(String(promo.maxDiscount)));
          } else if (promo.discountFlat) {
            discount = parseFloat(String(promo.discountFlat));
          }
          discount = Math.min(discount, total);
          totalDiscount += discount;
          validatedOffers.push({ type: "promo_code", promoId: promo.id, code: promo.code ?? undefined, discount, description: promo.description ?? undefined });
        }
      } else {
        errors.push("Code not found.");
      }
    }
  }

  /* Deduplicate offerIds to prevent duplicate-offer discount inflation */
  if (offerIds && Array.isArray(offerIds)) {
    const uniqueIds = [...new Set(offerIds.filter((id): id is string => typeof id === "string"))];
    if (uniqueIds.length > 0) {
      const rows = await db.select().from(offersTable).where(inArray(offersTable.id, uniqueIds));
      for (const row of rows) {
        offersToValidate.push(row);
      }
    }
  }

  /* Pre-check: if any non-stackable offer alongside others, enforce exclusivity */
  const nonStackableCount = offersToValidate.filter(o => !o.stackable).length;
  if (nonStackableCount > 0 && offersToValidate.length > 1) {
    errors.push("One or more offers cannot be combined with other discounts. Please apply a single offer.");
    sendSuccess(res, { valid: false, totalDiscount: 0, freeDelivery: false, offers: [], errors });
    return;
  }

  for (const offer of offersToValidate) {
    const computed = computeOfferStatus(offer);
    if (computed !== "live") { errors.push(`Offer "${offer.name}" is not currently available.`); continue; }
    if (total < parseFloat(String(offer.minOrderAmount ?? "0"))) {
      errors.push(`Offer "${offer.name}" requires a minimum order of Rs. ${offer.minOrderAmount}.`); continue;
    }
    const rules = (offer.targetingRules ?? {}) as Record<string, unknown>;

    /* Targeting: new users only */
    if (rules["newUsersOnly"] && userId) {
      const [orderCount] = await db.select({ c: count() }).from(ordersTable).where(eq(ordersTable.userId, userId));
      if (Number(orderCount?.c ?? 0) > 0) { errors.push(`Offer "${offer.name}" is for new users only.`); continue; }
    }

    /* Targeting: order type / service restriction */
    if (rules["serviceTypes"] && Array.isArray(rules["serviceTypes"]) && orderType) {
      if (!(rules["serviceTypes"] as string[]).includes(orderType)) {
        errors.push(`Offer "${offer.name}" is not valid for ${orderType} orders.`); continue;
      }
    }

    /* Targeting: minimum previous orders count for loyalty offers */
    if (rules["minOrders"] != null && userId) {
      const [orderCount] = await db.select({ c: count() }).from(ordersTable).where(eq(ordersTable.userId, userId));
      if (Number(orderCount?.c ?? 0) < Number(rules["minOrders"])) {
        errors.push(`Offer "${offer.name}" requires at least ${rules["minOrders"]} previous orders.`); continue;
      }
    }

    /* Per-user usage limit (exclude bookmark records) */
    if (userId) {
      const [userUsage] = await db.select({ c: count() }).from(offerRedemptionsTable)
        .where(and(
          eq(offerRedemptionsTable.offerId, offer.id),
          eq(offerRedemptionsTable.userId, userId),
          sql`${offerRedemptionsTable.orderId} IS NOT NULL`,
        ));
      const usagePerUser = offer.usagePerUser ?? 1;
      if (Number(userUsage?.c ?? 0) >= usagePerUser) { errors.push(`You have already used offer "${offer.name}".`); continue; }
    }

    /* Stackability guard: if we already have a non-stackable offer applied, block further stacking */
    if (!offer.stackable && validatedOffers.length > 0) {
      errors.push(`Offer "${offer.name}" cannot be combined with other discounts.`); continue;
    }

    let discount = 0;
    if (offer.freeDelivery || offer.type === "free_delivery") {
      freeDelivery = true;
    }
    if (offer.discountPct) {
      discount = Math.round(total * parseFloat(String(offer.discountPct)) / 100);
      if (offer.maxDiscount) discount = Math.min(discount, parseFloat(String(offer.maxDiscount)));
    } else if (offer.discountFlat) {
      discount = parseFloat(String(offer.discountFlat));
    }
    discount = Math.min(discount, total - totalDiscount); /* never exceed remaining order value */
    totalDiscount += discount;
    validatedOffers.push({ type: "offer", offerId: offer.id, name: offer.name, offerType: offer.type, discount, freeDelivery: offer.freeDelivery ?? false });
  }

  sendSuccess(res, {
    valid: errors.length === 0 || validatedOffers.length > 0,
    totalDiscount,
    freeDelivery,
    offers: validatedOffers,
    errors,
  });
});

/* ─────────────────────────────────────────────────────────────
   VENDOR ENDPOINTS
───────────────────────────────────────────────────────────── */

/* GET /promotions/vendor/campaigns — vendor sees active campaigns to request participation */
router.get("/vendor/campaigns", requireRole("vendor"), async (req: Request, res) => {
  const vendorId = req.vendorId as string;
  const now = nowIso();

  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.status, "live"), gte(campaignsTable.endDate, now)))
    .orderBy(asc(campaignsTable.priority));

  const participations = await db.select().from(campaignParticipationsTable)
    .where(eq(campaignParticipationsTable.vendorId, vendorId));

  const partMap = Object.fromEntries(participations.map(p => [p.campaignId, p]));

  sendSuccess(res, {
    campaigns: campaigns.map(c => ({
      ...mapCampaign(c),
      participation: partMap[c.id] ?? null,
    })),
  });
});

/* POST /promotions/vendor/campaigns/:id/participate — vendor requests campaign participation */
router.post("/vendor/campaigns/:id/participate", requireRole("vendor"), async (req: Request, res) => {
  const vendorId = req.vendorId as string;
  const campaignId = req.params["id"]!;
  const { notes } = req.body;

  const [existing] = await db.select().from(campaignParticipationsTable)
    .where(and(eq(campaignParticipationsTable.campaignId, campaignId), eq(campaignParticipationsTable.vendorId, vendorId)))
    .limit(1);
  if (existing) { sendError(res, "Already requested participation", 409); return; }

  const [participation] = await db.insert(campaignParticipationsTable).values({
    id: generateId(),
    campaignId,
    vendorId,
    status: "pending",
    notes: notes || null,
  }).returning();
  sendCreated(res, participation);
});

/* ─────────────────────────────────────────────────────────────
   ADMIN ENDPOINTS — Campaigns
───────────────────────────────────────────────────────────── */

/* GET /promotions/campaigns */
router.get("/campaigns", adminAuth, async (_req, res) => {
  const campaigns = await db.select().from(campaignsTable).orderBy(desc(campaignsTable.createdAt));

  const offerCounts = await db
    .select({ campaignId: offersTable.campaignId, count: count() })
    .from(offersTable)
    .groupBy(offersTable.campaignId);
  const countMap = Object.fromEntries(offerCounts.map(r => [r.campaignId, r.count]));

  const now = nowIso();
  sendSuccess(res, {
    campaigns: campaigns.map(c => ({
      ...mapCampaign(c),
      offerCount: countMap[c.id] ?? 0,
      computedStatus: !c.status || c.status === "draft" ? "draft"
        : c.status === "paused" ? "paused"
        : c.startDate > now ? "scheduled"
        : c.endDate < now ? "expired"
        : c.status,
    })),
  });
});

/* GET /promotions/campaigns/:id */
router.get("/campaigns/:id", adminAuth, async (req, res) => {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, req.params["id"]!)).limit(1);
  if (!campaign) { sendNotFound(res, "Campaign not found"); return; }

  const offers = await db.select().from(offersTable).where(eq(offersTable.campaignId, campaign.id));
  const participations = await db.select().from(campaignParticipationsTable).where(eq(campaignParticipationsTable.campaignId, campaign.id));

  sendSuccess(res, { campaign: mapCampaign(campaign), offers: offers.map(mapOffer), participations });
});

/* POST /promotions/campaigns */
router.post("/campaigns", marketingAuth, async (req, res) => {
  const { name, description, theme, colorFrom, colorTo, bannerImage, priority, budgetCap, startDate, endDate, status } = req.body;
  if (!name || !startDate || !endDate) { sendValidationError(res, "name, startDate, endDate required"); return; }

  const [campaign] = await db.insert(campaignsTable).values({
    id:          generateId(),
    name,
    description: description || null,
    theme:       theme || "general",
    colorFrom:   colorFrom || "#7C3AED",
    colorTo:     colorTo || "#4F46E5",
    bannerImage: bannerImage || null,
    priority:    priority ?? 0,
    budgetCap:   budgetCap ? String(budgetCap) : null,
    startDate:   new Date(startDate),
    endDate:     new Date(endDate),
    status:      status || "draft",
  }).returning();
  sendCreated(res, mapCampaign(campaign));
});

/* PATCH /promotions/campaigns/:id */
router.patch("/campaigns/:id", marketingAuth, async (req, res) => {
  const id = req.params["id"]!;
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const fields = ["name","description","theme","colorFrom","colorTo","bannerImage","priority","status"];
  for (const f of fields) { if (body[f] !== undefined) updates[f] = body[f]; }
  if (body.budgetCap !== undefined) updates.budgetCap = body.budgetCap ? String(body.budgetCap) : null;
  if (body.startDate !== undefined) updates.startDate = new Date(String(body.startDate));
  if (body.endDate   !== undefined) updates.endDate   = new Date(String(body.endDate));

  const [campaign] = await db.update(campaignsTable).set(updates).where(eq(campaignsTable.id, id)).returning();
  if (!campaign) { sendNotFound(res, "Campaign not found"); return; }
  sendSuccess(res, mapCampaign(campaign));
});

/* DELETE /promotions/campaigns/:id */
router.delete("/campaigns/:id", marketingAuth, async (req, res) => {
  await db.delete(campaignsTable).where(eq(campaignsTable.id, req.params["id"]!));
  sendSuccess(res, { success: true });
});

/* ─────────────────────────────────────────────────────────────
   ADMIN ENDPOINTS — Offers
───────────────────────────────────────────────────────────── */

/* GET /promotions/offers */
router.get("/offers", adminAuth, async (req, res) => {
  const campaignId = req.query["campaignId"] as string | undefined;
  const type       = req.query["type"] as string | undefined;
  const status     = req.query["status"] as string | undefined;

  const conditions: SQL[] = [];
  if (campaignId) conditions.push(eq(offersTable.campaignId, campaignId));
  if (type)       conditions.push(eq(offersTable.type, type));

  const offers = await db
    .select()
    .from(offersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(offersTable.sortOrder), desc(offersTable.createdAt));

  let mapped = offers.map(mapOffer);
  if (status) mapped = mapped.filter(o => o.computedStatus === status || o.status === status);

  sendSuccess(res, { offers: mapped, total: mapped.length });
});

/* GET /promotions/offers/pending — list offers pending approval (manager/super only) */
router.get("/offers/pending", managerAuth, async (_req: Request, res) => {
  const pending = await db.select().from(offersTable)
    .where(eq(offersTable.status, "pending_approval"))
    .orderBy(asc(offersTable.createdAt));
  sendSuccess(res, { offers: pending.map(o => mapOffer(o)) });
});

/* GET /promotions/offers/:id */
router.get("/offers/:id", adminAuth, async (req, res) => {
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, req.params["id"]!)).limit(1);
  if (!offer) { sendNotFound(res, "Offer not found"); return; }

  const redemptions = await db.select().from(offerRedemptionsTable)
    .where(and(eq(offerRedemptionsTable.offerId, offer.id), sql`${offerRedemptionsTable.orderId} IS NOT NULL`))
    .orderBy(desc(offerRedemptionsTable.createdAt))
    .limit(100);

  const [analytics] = await db
    .select({ totalDiscount: sum(offerRedemptionsTable.discount), totalRedemptions: count() })
    .from(offerRedemptionsTable)
    .where(and(eq(offerRedemptionsTable.offerId, offer.id), sql`${offerRedemptionsTable.orderId} IS NOT NULL`));

  sendSuccess(res, {
    offer: mapOffer(offer),
    analytics: {
      totalRedemptions: analytics?.totalRedemptions ?? 0,
      totalDiscount: analytics?.totalDiscount ? parseFloat(String(analytics.totalDiscount)) : 0,
    },
    recentRedemptions: redemptions,
  });
});

/* POST /promotions/offers */
router.post("/offers", marketingAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body.name || !body.type || !body.startDate || !body.endDate) {
    sendValidationError(res, "name, type, startDate, endDate required"); return;
  }

  const [offer] = await db.insert(offersTable).values({
    id:             generateId(),
    campaignId:     body.campaignId     ? String(body.campaignId) : null,
    name:           String(body.name),
    description:    body.description    ? String(body.description) : null,
    type:           String(body.type),
    code:           body.code           ? String(body.code).toUpperCase().trim() : null,
    discountPct:    body.discountPct    ? String(body.discountPct)    : null,
    discountFlat:   body.discountFlat   ? String(body.discountFlat)   : null,
    minOrderAmount: body.minOrderAmount ? String(body.minOrderAmount) : "0",
    maxDiscount:    body.maxDiscount    ? String(body.maxDiscount)    : null,
    buyQty:         body.buyQty         ? Number(body.buyQty)         : null,
    getQty:         body.getQty         ? Number(body.getQty)         : null,
    cashbackPct:    body.cashbackPct    ? String(body.cashbackPct)    : null,
    cashbackMax:    body.cashbackMax    ? String(body.cashbackMax)    : null,
    freeDelivery:   body.freeDelivery   === true,
    targetingRules: (body.targetingRules as object) || {},
    stackable:      body.stackable      === true,
    usageLimit:     body.usageLimit     ? Number(body.usageLimit)     : null,
    usagePerUser:   body.usagePerUser   ? Number(body.usagePerUser)   : 1,
    appliesTo:      body.appliesTo      ? String(body.appliesTo) : "all",
    vendorId:       body.vendorId       ? String(body.vendorId) : null,
    status:         (() => {
      const requested = body.status ? String(body.status) : "draft";
      const role = req.adminRole ?? "";
      const isManager = role === "super" || role === "manager";
      const safeStatuses = ["draft", "pending_approval"];
      if (!isManager && !safeStatuses.includes(requested)) return "draft";
      return requested;
    })(),
    startDate:      new Date(String(body.startDate)),
    endDate:        new Date(String(body.endDate)),
    sortOrder:      body.sortOrder != null ? Number(body.sortOrder) : 0,
  }).returning();
  sendCreated(res, mapOffer(offer));
});

/* PATCH /promotions/offers/:id */
router.patch("/offers/:id", marketingAuth, async (req, res) => {
  const id   = req.params["id"]!;
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const strFields = ["name","description","type","appliesTo","vendorId","createdBy","approvedBy"];
  for (const f of strFields) { if (body[f] !== undefined) updates[f] = body[f]; }
  if (body.status !== undefined) {
    const requested = String(body.status);
    const role = req.adminRole ?? "";
    const isManager = role === "super" || role === "manager";
    const safeStatuses = ["draft", "pending_approval"];
    updates.status = (!isManager && !safeStatuses.includes(requested)) ? "draft" : requested;
  }
  if (body.campaignId    !== undefined) updates.campaignId    = body.campaignId || null;
  if (body.code          !== undefined) updates.code          = body.code ? String(body.code).toUpperCase().trim() : null;
  if (body.discountPct   !== undefined) updates.discountPct   = body.discountPct   ? String(body.discountPct)   : null;
  if (body.discountFlat  !== undefined) updates.discountFlat  = body.discountFlat  ? String(body.discountFlat)  : null;
  if (body.minOrderAmount!== undefined) updates.minOrderAmount= String(body.minOrderAmount || "0");
  if (body.maxDiscount   !== undefined) updates.maxDiscount   = body.maxDiscount   ? String(body.maxDiscount)   : null;
  if (body.cashbackPct   !== undefined) updates.cashbackPct   = body.cashbackPct   ? String(body.cashbackPct)   : null;
  if (body.cashbackMax   !== undefined) updates.cashbackMax   = body.cashbackMax   ? String(body.cashbackMax)   : null;
  if (body.buyQty        !== undefined) updates.buyQty        = body.buyQty        ? Number(body.buyQty)        : null;
  if (body.getQty        !== undefined) updates.getQty        = body.getQty        ? Number(body.getQty)        : null;
  if (body.freeDelivery  !== undefined) updates.freeDelivery  = Boolean(body.freeDelivery);
  if (body.stackable     !== undefined) updates.stackable     = Boolean(body.stackable);
  if (body.targetingRules!== undefined) updates.targetingRules= body.targetingRules;
  if (body.usageLimit    !== undefined) updates.usageLimit    = body.usageLimit    ? Number(body.usageLimit)    : null;
  if (body.usagePerUser  !== undefined) updates.usagePerUser  = Number(body.usagePerUser) || 1;
  if (body.sortOrder     !== undefined) updates.sortOrder     = Number(body.sortOrder);
  if (body.startDate     !== undefined) updates.startDate     = new Date(String(body.startDate));
  if (body.endDate       !== undefined) updates.endDate       = new Date(String(body.endDate));

  const [offer] = await db.update(offersTable).set(updates).where(eq(offersTable.id, id)).returning();
  if (!offer) { sendNotFound(res, "Offer not found"); return; }
  sendSuccess(res, mapOffer(offer));
});

/* POST /promotions/offers/bulk — bulk status update */
router.post("/offers/bulk", marketingAuth, async (req, res) => {
  const { ids, action } = req.body as { ids: string[]; action: string };
  if (!Array.isArray(ids) || !action) { sendValidationError(res, "ids and action required"); return; }
  const statusMap: Record<string, string> = { pause: "paused", activate: "live", archive: "expired" };
  const newStatus = statusMap[action];
  if (!newStatus) { sendValidationError(res, "invalid action"); return; }
  await db.update(offersTable).set({ status: newStatus, updatedAt: new Date() }).where(inArray(offersTable.id, ids));
  sendSuccess(res, { success: true, updated: ids.length });
});

/* POST /promotions/offers/:id/clone */
router.post("/offers/:id/clone", marketingAuth, async (req, res) => {
  const [original] = await db.select().from(offersTable).where(eq(offersTable.id, req.params["id"]!)).limit(1);
  if (!original) { sendNotFound(res, "Offer not found"); return; }

  const [cloned] = await db.insert(offersTable).values({
    ...original,
    id:        generateId(),
    name:      `${original.name} (Copy)`,
    code:      original.code ? `${original.code}_COPY` : null,
    status:    "draft",
    usedCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  sendCreated(res, mapOffer(cloned));
});

/* DELETE /promotions/offers/:id */
router.delete("/offers/:id", marketingAuth, async (req, res) => {
  await db.delete(offersTable).where(eq(offersTable.id, req.params["id"]!));
  sendSuccess(res, { success: true });
});

/* ─────────────────────────────────────────────────────────────
   ADMIN — Offer Templates
───────────────────────────────────────────────────────────── */

/* GET /promotions/templates */
router.get("/templates", adminAuth, async (_req, res) => {
  const templates = await db.select().from(offerTemplatesTable).orderBy(asc(offerTemplatesTable.sortOrder), desc(offerTemplatesTable.createdAt));
  sendSuccess(res, { templates, total: templates.length });
});

/* GET /promotions/templates/:id */
router.get("/templates/:id", adminAuth, async (req, res) => {
  const [tpl] = await db.select().from(offerTemplatesTable).where(eq(offerTemplatesTable.id, req.params["id"]!)).limit(1);
  if (!tpl) { sendNotFound(res, "Template not found"); return; }
  sendSuccess(res, tpl);
});

/* POST /promotions/templates */
router.post("/templates", marketingAuth, async (req: Request, res) => {
  const body = req.body as Record<string, unknown>;
  const { name, type } = body;
  if (!name || !type) { sendValidationError(res, "name and type required"); return; }

  const [tpl] = await db.insert(offerTemplatesTable).values({
    id:             generateId(),
    name:           String(name),
    description:    body.description ? String(body.description) : null,
    type:           String(type),
    code:           body.code ? String(body.code).toUpperCase().trim() : null,
    discountPct:    body.discountPct    ? String(body.discountPct)    : null,
    discountFlat:   body.discountFlat   ? String(body.discountFlat)   : null,
    minOrderAmount: body.minOrderAmount ? String(body.minOrderAmount) : "0",
    maxDiscount:    body.maxDiscount    ? String(body.maxDiscount)    : null,
    buyQty:         body.buyQty         ? Number(body.buyQty)         : null,
    getQty:         body.getQty         ? Number(body.getQty)         : null,
    cashbackPct:    body.cashbackPct    ? String(body.cashbackPct)    : null,
    cashbackMax:    body.cashbackMax    ? String(body.cashbackMax)    : null,
    freeDelivery:   body.freeDelivery   === true,
    targetingRules: (body.targetingRules as object) || {},
    stackable:      body.stackable      === true,
    usageLimit:     body.usageLimit     ? Number(body.usageLimit)     : null,
    usagePerUser:   body.usagePerUser   ? Number(body.usagePerUser)   : 1,
    appliesTo:      body.appliesTo ? String(body.appliesTo) : "all",
    sortOrder:      body.sortOrder      ? Number(body.sortOrder)      : 0,
    createdBy:      req.adminId ?? null,
  }).returning();
  sendCreated(res, tpl);
});

/* PATCH /promotions/templates/:id */
router.patch("/templates/:id", marketingAuth, async (req, res) => {
  const id   = req.params["id"]!;
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const strFields = ["name","description","type","appliesTo","code"];
  for (const f of strFields) { if (body[f] !== undefined) updates[f] = body[f]; }
  if (body.discountPct    !== undefined) updates.discountPct    = body.discountPct    ? String(body.discountPct)    : null;
  if (body.discountFlat   !== undefined) updates.discountFlat   = body.discountFlat   ? String(body.discountFlat)   : null;
  if (body.minOrderAmount !== undefined) updates.minOrderAmount = String(body.minOrderAmount || "0");
  if (body.maxDiscount    !== undefined) updates.maxDiscount    = body.maxDiscount    ? String(body.maxDiscount)    : null;
  if (body.cashbackPct    !== undefined) updates.cashbackPct    = body.cashbackPct    ? String(body.cashbackPct)    : null;
  if (body.cashbackMax    !== undefined) updates.cashbackMax    = body.cashbackMax    ? String(body.cashbackMax)    : null;
  if (body.buyQty         !== undefined) updates.buyQty         = body.buyQty         ? Number(body.buyQty)         : null;
  if (body.getQty         !== undefined) updates.getQty         = body.getQty         ? Number(body.getQty)         : null;
  if (body.freeDelivery   !== undefined) updates.freeDelivery   = Boolean(body.freeDelivery);
  if (body.stackable      !== undefined) updates.stackable      = Boolean(body.stackable);
  if (body.targetingRules !== undefined) updates.targetingRules = body.targetingRules;
  if (body.usageLimit     !== undefined) updates.usageLimit     = body.usageLimit     ? Number(body.usageLimit)     : null;
  if (body.usagePerUser   !== undefined) updates.usagePerUser   = Number(body.usagePerUser) || 1;
  if (body.sortOrder      !== undefined) updates.sortOrder      = Number(body.sortOrder);

  const [tpl] = await db.update(offerTemplatesTable).set(updates).where(eq(offerTemplatesTable.id, id)).returning();
  if (!tpl) { sendNotFound(res, "Template not found"); return; }
  sendSuccess(res, tpl);
});

/* DELETE /promotions/templates/:id */
router.delete("/templates/:id", marketingAuth, async (req, res) => {
  await db.delete(offerTemplatesTable).where(eq(offerTemplatesTable.id, req.params["id"]!));
  sendSuccess(res, { success: true });
});

/* POST /promotions/templates/:id/instantiate — create an offer from this template */
router.post("/templates/:id/instantiate", marketingAuth, async (req: Request, res) => {
  const [tpl] = await db.select().from(offerTemplatesTable).where(eq(offerTemplatesTable.id, req.params["id"]!)).limit(1);
  if (!tpl) { sendNotFound(res, "Template not found"); return; }

  const body = req.body as Record<string, unknown>;
  if (!body.startDate || !body.endDate) { sendValidationError(res, "startDate and endDate required"); return; }

  const [offer] = await db.insert(offersTable).values({
    id:             generateId(),
    campaignId:     body.campaignId ? String(body.campaignId) : null,
    name:           body.name ? String(body.name) : tpl.name,
    description:    tpl.description,
    type:           tpl.type,
    code:           body.code ? String(body.code).toUpperCase().trim() : tpl.code,
    discountPct:    tpl.discountPct,
    discountFlat:   tpl.discountFlat,
    minOrderAmount: tpl.minOrderAmount,
    maxDiscount:    tpl.maxDiscount,
    buyQty:         tpl.buyQty,
    getQty:         tpl.getQty,
    cashbackPct:    tpl.cashbackPct,
    cashbackMax:    tpl.cashbackMax,
    freeDelivery:   tpl.freeDelivery,
    targetingRules: tpl.targetingRules,
    stackable:      tpl.stackable,
    usageLimit:     tpl.usageLimit,
    usagePerUser:   tpl.usagePerUser,
    appliesTo:      tpl.appliesTo,
    vendorId:       body.vendorId ? String(body.vendorId) : null,
    status:         "draft",
    startDate:      new Date(String(body.startDate)),
    endDate:        new Date(String(body.endDate)),
    sortOrder:      tpl.sortOrder,
    createdBy:      req.adminId ?? null,
  }).returning();
  sendCreated(res, mapOffer(offer));
});

/* ─────────────────────────────────────────────────────────────
   ADMIN — Analytics
───────────────────────────────────────────────────────────── */

/* GET /promotions/analytics */
router.get("/analytics", adminAuth, async (req, res) => {
  const campaignId = req.query["campaignId"] as string | undefined;

  const conditions: SQL[] = [sql`${offerRedemptionsTable.orderId} IS NOT NULL`];
  if (campaignId) {
    const offersInCampaign = await db
      .select({ id: offersTable.id })
      .from(offersTable)
      .where(eq(offersTable.campaignId, campaignId));
    const offerIds = offersInCampaign.map(o => o.id);
    if (offerIds.length > 0) conditions.push(inArray(offerRedemptionsTable.offerId, offerIds));
  }

  const [totals] = await db
    .select({ totalRedemptions: count(), totalDiscount: sum(offerRedemptionsTable.discount) })
    .from(offerRedemptionsTable)
    .where(and(...conditions));

  const topOffers = await db
    .select({
      offerId: offerRedemptionsTable.offerId,
      redemptions: count(),
      discountGiven: sum(offerRedemptionsTable.discount),
    })
    .from(offerRedemptionsTable)
    .where(and(...conditions))
    .groupBy(offerRedemptionsTable.offerId)
    .orderBy(desc(count()))
    .limit(5);

  const offerDetails = topOffers.length > 0
    ? await db.select({ id: offersTable.id, name: offersTable.name, type: offersTable.type })
        .from(offersTable)
        .where(inArray(offersTable.id, topOffers.map(o => o.offerId)))
    : [];
  const offerMap = Object.fromEntries(offerDetails.map(o => [o.id, o]));

  const activeCampaigns = await db.select({ count: count() }).from(campaignsTable).where(eq(campaignsTable.status, "live"));
  const activeOffers    = await db.select({ count: count() }).from(offersTable).where(eq(offersTable.status, "live"));

  sendSuccess(res, {
    totals: {
      redemptions: totals?.totalRedemptions ?? 0,
      discountGiven: totals?.totalDiscount ? parseFloat(String(totals.totalDiscount)) : 0,
    },
    topOffers: topOffers.map(o => ({
      ...o,
      discountGiven: o.discountGiven ? parseFloat(String(o.discountGiven)) : 0,
      offer: offerMap[o.offerId] ?? null,
    })),
    activeCampaigns: activeCampaigns[0]?.count ?? 0,
    activeOffers: activeOffers[0]?.count ?? 0,
  });
});

/* GET /promotions/ai-recommendations */
router.get("/ai-recommendations", adminAuth, async (_req, res) => {
  const now = nowIso();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentOrders = await db
    .select({ type: ordersTable.type, total: ordersTable.total, createdAt: ordersTable.createdAt })
    .from(ordersTable)
    .where(gte(ordersTable.createdAt, thirtyDaysAgo))
    .limit(500);

  const ordersByType: Record<string, number[]> = {};
  const ordersByHour: number[] = Array(24).fill(0);
  for (const o of recentOrders) {
    const t = o.type ?? "mart";
    if (!ordersByType[t]) ordersByType[t] = [];
    ordersByType[t].push(parseFloat(String(o.total || "0")));
    const hour = new Date(o.createdAt).getHours();
    ordersByHour[hour]++;
  }

  const peakHours = ordersByHour
    .map((c, h) => ({ hour: h, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(({ hour }) => hour);

  const activeOffers = await db.select({ type: offersTable.type }).from(offersTable).where(eq(offersTable.status, "live"));
  const coveredTypes = new Set(activeOffers.map(o => o.type));

  const recommendations: {
    id: string; type: string; title: string; description: string;
    impact: string; suggestedDiscount: number;
    suggestedTimes?: number[]; targetService?: string;
  }[] = [];

  if (!coveredTypes.has("happy_hour") && peakHours.length > 0) {
    recommendations.push({
      id: "happy_hour_suggestion",
      type: "happy_hour",
      title: "Happy Hour Opportunity",
      description: `Peak order times are around ${peakHours.map(h => `${h}:00`).join(", ")}. A 15-20% happy hour discount during these times could boost order volume significantly.`,
      impact: "high",
      suggestedDiscount: 15,
      suggestedTimes: peakHours,
    });
  }

  const topService = Object.entries(ordersByType).sort((a, b) => b[1].length - a[1].length)[0];
  if (topService && !coveredTypes.has("category")) {
    const [svcName, orders] = topService;
    const avgOrder = orders.reduce((s, v) => s + v, 0) / orders.length;
    recommendations.push({
      id: "top_service_boost",
      type: "percentage",
      title: `Boost ${svcName.charAt(0).toUpperCase() + svcName.slice(1)} Orders`,
      description: `${svcName} is your top service with ${orders.length} orders (avg Rs.${Math.round(avgOrder)}). A 10% discount for orders above Rs.${Math.round(avgOrder * 0.8)} could increase frequency.`,
      impact: "medium",
      suggestedDiscount: 10,
      targetService: svcName,
    });
  }

  const newUserOffers = activeOffers.filter(o => o.type === "first_order");
  if (newUserOffers.length === 0) {
    recommendations.push({
      id: "first_order_offer",
      type: "first_order",
      title: "New User Acquisition",
      description: "No first-order discount is currently active. A Rs.100 off or 20% discount for first-time users could significantly improve conversion rates.",
      impact: "high",
      suggestedDiscount: 20,
    });
  }

  if (!coveredTypes.has("free_delivery")) {
    recommendations.push({
      id: "free_delivery_threshold",
      type: "free_delivery",
      title: "Free Delivery Offer",
      description: "Free delivery above a threshold (e.g., Rs.500) is proven to increase cart values. Consider running this during weekends.",
      impact: "medium",
      suggestedDiscount: 0,
    });
  }

  sendSuccess(res, { recommendations });
});

/* PATCH /promotions/vendor/participations/:id — admin approves/rejects */
router.patch("/vendor/participations/:id", adminAuth, async (req, res) => {
  const { status, notes } = req.body;
  if (!status) { sendValidationError(res, "status required"); return; }
  const [participation] = await db.update(campaignParticipationsTable)
    .set({ status, notes: notes || null })
    .where(eq(campaignParticipationsTable.id, req.params["id"]!))
    .returning();
  if (!participation) { sendNotFound(res, "Participation not found"); return; }
  sendSuccess(res, participation);
});

/* GET /promotions/vendor/participations — admin views all requests */
router.get("/vendor/participations", adminAuth, async (req, res) => {
  const campaignId = req.query["campaignId"] as string | undefined;
  const conditions: SQL[] = [];
  if (campaignId) conditions.push(eq(campaignParticipationsTable.campaignId, campaignId));
  const participations = await db.select().from(campaignParticipationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(campaignParticipationsTable.createdAt));
  sendSuccess(res, { participations });
});

/* DELETE /promotions/vendor/participations/:id — vendor withdraws pending participation request */
router.delete("/vendor/participations/:id", requireRole("vendor"), async (req: Request, res) => {
  const vendorId = req.vendorId as string;
  const [participation] = await db.select().from(campaignParticipationsTable)
    .where(eq(campaignParticipationsTable.id, req.params["id"]!))
    .limit(1);
  if (!participation) { sendNotFound(res, "Participation not found"); return; }
  if (participation.vendorId !== vendorId) { sendError(res, "Not authorized", 403); return; }
  if (participation.status !== "pending") { sendError(res, "Only pending participations can be withdrawn", 400); return; }
  await db.delete(campaignParticipationsTable).where(eq(campaignParticipationsTable.id, req.params["id"]!));
  sendSuccess(res, { message: "Participation withdrawn" });
});

/* ── Offer Bookmarks (Save-for-Later) ─────────────────────────────────────── */

/* POST /promotions/bookmarks/:offerId — bookmark/unbookmark an offer */
router.post("/bookmarks/:offerId", customerAuth, async (req: Request, res) => {
  const userId = req.customerId!;
  const { offerId } = req.params as { offerId: string };

  const [offer] = await db.select({ id: offersTable.id }).from(offersTable).where(eq(offersTable.id, offerId)).limit(1);
  if (!offer) { sendNotFound(res, "Offer not found"); return; }

  /* Use a simple DB-level upsert via a raw query since we don't have a schema table for bookmarks.
     We store bookmarks as a special "bookmark" offer_redemption record with discount=0 and orderId=null.
     This avoids schema migration while persisting data durably. */
  const existingBookmark = await db.select({ id: offerRedemptionsTable.id })
    .from(offerRedemptionsTable)
    .where(and(
      eq(offerRedemptionsTable.offerId, offerId),
      eq(offerRedemptionsTable.userId, userId),
      sql`${offerRedemptionsTable.orderId} IS NULL`,
      sql`${offerRedemptionsTable.discount} = '0'`,
    ))
    .limit(1);

  if (existingBookmark.length > 0) {
    /* Already bookmarked — remove it (toggle off) */
    await db.delete(offerRedemptionsTable).where(eq(offerRedemptionsTable.id, existingBookmark[0]!.id));
    sendSuccess(res, { bookmarked: false });
  } else {
    /* Create bookmark */
    await db.insert(offerRedemptionsTable).values({
      id: generateId(),
      offerId,
      userId,
      orderId: null,
      discount: "0",
    });
    sendSuccess(res, { bookmarked: true });
  }
});

/* GET /promotions/bookmarks — list user's bookmarked offers */
router.get("/bookmarks", customerAuth, async (req: Request, res) => {
  const userId = req.customerId!;

  const bookmarkRows = await db.select({ offerId: offerRedemptionsTable.offerId })
    .from(offerRedemptionsTable)
    .where(and(
      eq(offerRedemptionsTable.userId, userId),
      sql`${offerRedemptionsTable.orderId} IS NULL`,
      sql`${offerRedemptionsTable.discount} = '0'`,
    ));

  if (bookmarkRows.length === 0) {
    sendSuccess(res, { offers: [] });
    return;
  }

  const offerIds = bookmarkRows.map(r => r.offerId);
  const offers = await db.select().from(offersTable).where(inArray(offersTable.id, offerIds));
  sendSuccess(res, { offers: offers.map(o => mapOffer(o)) });
});

/* ── Admin Approval Workflow ──────────────────────────────────────────────── */

/* POST /promotions/offers/:id/submit — submit draft offer for approval */
router.post("/offers/:id/submit", marketingAuth, async (req: Request, res) => {
  const { id } = req.params as { id: string };
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
  if (!offer) { sendNotFound(res, "Offer not found"); return; }
  if (offer.status !== "draft") {
    sendError(res, "Only draft offers can be submitted for approval", 400); return;
  }
  await db.update(offersTable).set({ status: "pending_approval", updatedAt: new Date() }).where(eq(offersTable.id, id));
  sendSuccess(res, { id, status: "pending_approval" });
});

/* POST /promotions/offers/:id/approve — approve a pending offer (manager/super only) */
router.post("/offers/:id/approve", managerAuth, async (req: Request, res) => {
  const { id } = req.params as { id: string };
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
  if (!offer) { sendNotFound(res, "Offer not found"); return; }
  if (offer.status !== "pending_approval") {
    sendError(res, "Only offers pending approval can be approved", 400); return;
  }
  await db.update(offersTable)
    .set({ status: "scheduled", approvedBy: req.adminId, updatedAt: new Date() })
    .where(eq(offersTable.id, id));
  sendSuccess(res, { id, status: "scheduled", approvedBy: req.adminId });
});

/* POST /promotions/offers/:id/reject — reject a pending offer (manager/super only) */
router.post("/offers/:id/reject", managerAuth, async (req: Request, res) => {
  const { id } = req.params as { id: string };
  const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
  if (!offer) { sendNotFound(res, "Offer not found"); return; }
  if (offer.status !== "pending_approval") {
    sendError(res, "Only offers pending approval can be rejected", 400); return;
  }
  const { reason } = req.body as { reason?: string };
  await db.update(offersTable)
    .set({ status: "rejected", approvedBy: req.adminId, updatedAt: new Date() })
    .where(eq(offersTable.id, id));
  sendSuccess(res, { id, status: "rejected", reason: reason ?? null });
});

export default router;
