import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bannersTable } from "@workspace/db/schema";
import { eq, and, or, lte, gte, isNull, desc, asc } from "drizzle-orm";
import { sendSuccess, sendInternalError } from "../lib/response.js";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const placement = (req.query["placement"] as string) || "home";
  const service = req.query["service"] as string | undefined;
  const now = new Date();

  try {
    const banners = await db
      .select()
      .from(bannersTable)
      .where(and(
        eq(bannersTable.isActive, true),
        eq(bannersTable.placement, placement),
        or(isNull(bannersTable.startDate), lte(bannersTable.startDate, now)),
        or(isNull(bannersTable.endDate), gte(bannersTable.endDate, now)),
      ))
      .orderBy(asc(bannersTable.sortOrder), desc(bannersTable.createdAt));

    const filtered = service
      ? banners.filter(b => !b.targetService || b.targetService === service || b.targetService === "all")
      : banners;

    sendSuccess(res, {
      banners: filtered.map(b => ({
        id: b.id,
        title: b.title,
        subtitle: b.subtitle,
        imageUrl: b.imageUrl,
        linkType: b.linkType,
        linkValue: b.linkValue,
        linkUrl: b.linkType === "url" ? b.linkValue
               : b.linkType === "product" ? `/product/${b.linkValue}`
               : b.linkType === "category" ? `/category/${b.linkValue}`
               : null,
        placement: b.placement,
        targetService: b.targetService,
        gradient1: b.colorFrom,
        gradient2: b.colorTo,
        icon: b.icon,
        sortOrder: b.sortOrder,
        isActive: b.isActive,
      })),
      total: filtered.length,
    });
  } catch (e: unknown) {
    console.error("[banners GET /] DB error:", e);
    sendInternalError(res);
  }
});

export default router;
