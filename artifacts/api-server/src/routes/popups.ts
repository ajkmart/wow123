import { Router, type IRouter, type Request } from "express";
import { db } from "@workspace/db";
import {
  popupCampaignsTable,
  popupImpressionsTable,
  ordersTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, or, isNull, lte, gte, count, sql, desc } from "drizzle-orm";
import { verifyUserJwt } from "../middleware/security.js";
import { sendSuccess, sendValidationError } from "../lib/response.js";
import { generateId } from "../lib/id.js";

const router: IRouter = Router();

function getUserFromRequest(req: Request): { userId: string; role: string } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const payload = verifyUserJwt(token);
  if (!payload) return null;
  return { userId: payload.userId, role: payload.role };
}

async function evaluateTargeting(
  campaign: typeof popupCampaignsTable.$inferSelect,
  user: { userId: string; role: string } | null
): Promise<boolean> {
  interface TargetingRules {
    roles?: string[];
    userIds?: string[];
    cities?: string[];
    newUsers?: boolean;
    minOrderCount?: number;
    maxOrderCount?: number;
    minOrderValue?: number;
    maxOrderValue?: number;
  }

  const raw = campaign.targeting ?? {};
  const targeting: TargetingRules = raw as TargetingRules;

  if (!targeting || Object.keys(targeting).length === 0) return true;

  if (targeting.roles?.length) {
    const userRole = user?.role ?? "customer";
    if (!targeting.roles.includes(userRole) && !targeting.roles.includes("all")) return false;
  }

  if (targeting.userIds?.length) {
    if (!user?.userId) return false;
    if (!targeting.userIds.includes(user.userId)) return false;
  }

  if (targeting.cities?.length) {
    if (!user?.userId) return false;
    const [userRow] = await db
      .select({ city: usersTable.city })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .limit(1);
    const userCity = userRow?.city;
    if (!userCity) return false;
    const normalizedCity = userCity.toLowerCase().trim();
    if (!targeting.cities.some(c => c.toLowerCase().trim() === normalizedCity)) return false;
  }

  if (user?.userId) {
    if (targeting.newUsers === true) {
      const [firstOrder] = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(eq(ordersTable.userId, user.userId))
        .limit(1);
      if (firstOrder) return false;
    }

    if (typeof targeting.minOrderCount === "number" || typeof targeting.maxOrderCount === "number") {
      const [orderCountRow] = await db
        .select({ count: count() })
        .from(ordersTable)
        .where(eq(ordersTable.userId, user.userId));
      const orderCount = orderCountRow?.count ?? 0;
      if (typeof targeting.minOrderCount === "number" && Number(orderCount) < targeting.minOrderCount) return false;
      if (typeof targeting.maxOrderCount === "number" && Number(orderCount) > targeting.maxOrderCount) return false;
    }

    if (typeof targeting.minOrderValue === "number" || typeof targeting.maxOrderValue === "number") {
      const [avgRow] = await db
        .select({ avg: sql<string>`coalesce(avg(${ordersTable.total}), '0')` })
        .from(ordersTable)
        .where(eq(ordersTable.userId, user.userId));
      const avgValue = parseFloat(avgRow?.avg ?? "0");
      if (typeof targeting.minOrderValue === "number" && avgValue < targeting.minOrderValue) return false;
      if (typeof targeting.maxOrderValue === "number" && avgValue > targeting.maxOrderValue) return false;
    }
  }

  return true;
}

router.get("/active", async (req, res) => {
  const user = getUserFromRequest(req);
  const userRole = user ? (user.role || "customer") : "customer";
  const sessionId = req.query["sessionId"] as string | undefined;
  const now = new Date();

  const activeCampaigns = await db
    .select()
    .from(popupCampaignsTable)
    .where(and(
      eq(popupCampaignsTable.status, "live"),
      or(isNull(popupCampaignsTable.startDate), lte(popupCampaignsTable.startDate, now)),
      or(isNull(popupCampaignsTable.endDate), gte(popupCampaignsTable.endDate, now)),
    ))
    .orderBy(desc(popupCampaignsTable.priority));

  const eligible: typeof activeCampaigns = [];

  for (const campaign of activeCampaigns) {
    const userObj = user ?? { userId: "guest", role: userRole };

    const passes = await evaluateTargeting(campaign, userObj);
    if (!passes) continue;

    if (campaign.maxTotalImpressions) {
      const [totalViews] = await db.select({ count: count() }).from(popupImpressionsTable).where(and(eq(popupImpressionsTable.popupId, campaign.id), eq(popupImpressionsTable.action, "view")));
      if (Number(totalViews?.count ?? 0) >= campaign.maxTotalImpressions) continue;
    }

    if (user?.userId) {
      const maxPerUser = campaign.maxImpressionsPerUser ?? 1;
      const frequency = campaign.displayFrequency ?? "once";

      const conditions = [
        eq(popupImpressionsTable.popupId, campaign.id),
        eq(popupImpressionsTable.userId, user.userId),
        eq(popupImpressionsTable.action, "view"),
      ];

      if (frequency === "daily") {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        conditions.push(gte(popupImpressionsTable.seenAt, dayStart));
      } else if (frequency === "every_session" && sessionId) {
        conditions.push(eq(popupImpressionsTable.sessionId, sessionId));
      }

      const [viewCount] = await db.select({ count: count() }).from(popupImpressionsTable).where(and(...conditions));
      if (Number(viewCount?.count ?? 0) >= maxPerUser) continue;
    }

    eligible.push(campaign);
  }

  sendSuccess(res, {
    popups: eligible.map(c => ({
      id: c.id,
      title: c.title,
      body: c.body,
      mediaUrl: c.mediaUrl,
      ctaText: c.ctaText,
      ctaLink: c.ctaLink,
      popupType: c.popupType,
      displayFrequency: c.displayFrequency,
      priority: c.priority,
      colorFrom: c.colorFrom,
      colorTo: c.colorTo,
      textColor: c.textColor,
      animation: c.animation,
      stylePreset: c.stylePreset,
    })),
    total: eligible.length,
  });
});

router.post("/impression", async (req, res) => {
  const user = getUserFromRequest(req);
  const { popupId, action, sessionId } = req.body as { popupId: string; action: string; sessionId?: string };
  if (!popupId) { sendValidationError(res, "popupId is required"); return; }
  const validActions = ["view", "click", "dismiss"];
  if (!validActions.includes(action)) { sendValidationError(res, "action must be view, click, or dismiss"); return; }

  const [campaign] = await db
    .select({ id: popupCampaignsTable.id })
    .from(popupCampaignsTable)
    .where(eq(popupCampaignsTable.id, popupId))
    .limit(1);
  if (!campaign) { sendValidationError(res, "Invalid popupId"); return; }

  const userId = user?.userId ?? "guest";

  await db.insert(popupImpressionsTable).values({
    id: generateId(),
    popupId,
    userId,
    action,
    sessionId: sessionId || null,
  }).catch(() => {});

  sendSuccess(res, { success: true });
});

export default router;
