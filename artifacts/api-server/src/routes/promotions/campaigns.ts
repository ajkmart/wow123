import { Router } from "express";
import { db, campaignsTable, offersTable } from "./helpers.js";
import { eq, desc, asc, count } from "./helpers.js";
import { generateId, adminAuth } from "./helpers.js";
import { sendSuccess, sendCreated, sendNotFound, sendValidationError } from "./helpers.js";
import { nowIso, mapCampaign, mapOffer, marketingAuth } from "./helpers.js";

const router = Router();

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

router.get("/campaigns/:id", adminAuth, async (req, res) => {
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, req.params["id"]!)).limit(1);
  if (!campaign) { sendNotFound(res, "Campaign not found"); return; }

  const offers = await db.select().from(offersTable).where(eq(offersTable.campaignId, campaign.id));

  const participations = await db.select()
    .from((await import("./helpers.js")).campaignParticipationsTable)
    .where(eq((await import("./helpers.js")).campaignParticipationsTable.campaignId, campaign.id));

  sendSuccess(res, { campaign: mapCampaign(campaign), offers: offers.map(mapOffer), participations });
});

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

router.delete("/campaigns/:id", marketingAuth, async (req, res) => {
  await db.delete(campaignsTable).where(eq(campaignsTable.id, req.params["id"]!));
  sendSuccess(res, { success: true });
});

export default router;
