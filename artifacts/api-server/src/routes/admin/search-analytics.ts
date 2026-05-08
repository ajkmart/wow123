import { Router } from "express";
import { db } from "@workspace/db";
import { userInteractionsTable, searchLogsTable } from "@workspace/db/schema";
import { gte, sql, count, eq } from "drizzle-orm";
import { sendSuccess } from "../../lib/response.js";

const router = Router();

/* ── GET /search-analytics/interaction-timeline?days=30 ──
   Returns daily interaction counts for the past N days.
   Used for the "Engagement Over Time" line chart on the Search Analytics page.
─────────────────────────────────────────────────────────── */
router.get("/search-analytics/interaction-timeline", async (req, res) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      date: sql<string>`DATE(${userInteractionsTable.createdAt})`.as("date"),
      interactionType: userInteractionsTable.interactionType,
      total: count(),
    })
    .from(userInteractionsTable)
    .where(gte(userInteractionsTable.createdAt, since))
    .groupBy(
      sql`DATE(${userInteractionsTable.createdAt})`,
      userInteractionsTable.interactionType,
    )
    .orderBy(sql`DATE(${userInteractionsTable.createdAt})`);

  // Pivot into per-day objects: { date, views, cart, purchase, wishlist, total }
  const dayMap = new Map<string, { date: string; view: number; cart: number; purchase: number; wishlist: number; total: number }>();

  for (const row of rows) {
    const d = row.date;
    if (!dayMap.has(d)) {
      dayMap.set(d, { date: d, view: 0, cart: 0, purchase: 0, wishlist: 0, total: 0 });
    }
    const entry = dayMap.get(d)!;
    const type = row.interactionType as string;
    if (type === "view")     entry.view     += row.total;
    if (type === "cart")     entry.cart     += row.total;
    if (type === "purchase") entry.purchase += row.total;
    if (type === "wishlist") entry.wishlist += row.total;
    entry.total += row.total;
  }

  const timeline = Array.from(dayMap.values());
  sendSuccess(res, { timeline, days });
});

/* ── GET /search-analytics/interaction-stats ──
   Returns aggregated interaction type counts and a simple conversion rate.
   Conversion rate = purchase interactions / view interactions (× 100).
─────────────────────────────────────────────────────────── */
router.get("/search-analytics/interaction-stats", async (req, res) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 90);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const stats = await db
    .select({
      interactionType: userInteractionsTable.interactionType,
      total: count(),
    })
    .from(userInteractionsTable)
    .where(gte(userInteractionsTable.createdAt, since))
    .groupBy(userInteractionsTable.interactionType);

  const totals: Record<string, number> = {};
  for (const s of stats) {
    totals[s.interactionType] = s.total;
  }

  const views     = totals["view"]     || 0;
  const carts     = totals["cart"]     || 0;
  const purchases = totals["purchase"] || 0;
  const wishlists = totals["wishlist"] || 0;

  const conversionRate = views > 0 ? parseFloat(((purchases / views) * 100).toFixed(2)) : 0;
  const cartRate       = views > 0 ? parseFloat(((carts     / views) * 100).toFixed(2)) : 0;

  sendSuccess(res, {
    totals,
    views,
    carts,
    purchases,
    wishlists,
    conversionRate,
    cartRate,
    days,
  });
});

/* ── GET /search-analytics/zero-results?days=30&limit=50 ──
   Returns queries that returned 0 results, aggregated by frequency.
─────────────────────────────────────────────────────────── */
router.get("/search-analytics/zero-results", async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 90);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      query: searchLogsTable.query,
      occurrences: sql<number>`count(*)::int`,
      lastSearchedAt: sql<string>`max(${searchLogsTable.createdAt})::text`,
    })
    .from(searchLogsTable)
    .where(
      sql`${searchLogsTable.resultCount} = 0 AND ${searchLogsTable.createdAt} >= ${since}`
    )
    .groupBy(searchLogsTable.query)
    .orderBy(sql`count(*) DESC`)
    .limit(limit);

  sendSuccess(res, { queries: rows, days, total: rows.length });
});

/* ── GET /search-analytics/top-terms?days=30 ──
   Returns most frequent search queries overall (regardless of result count).
─────────────────────────────────────────────────────────── */
router.get("/search-analytics/top-terms", async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 90);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 30, 1), 100);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows = await db
    .select({
      query: searchLogsTable.query,
      occurrences: sql<number>`count(*)::int`,
      zeroResults: sql<number>`sum(case when ${searchLogsTable.resultCount} = 0 then 1 else 0 end)::int`,
    })
    .from(searchLogsTable)
    .where(gte(searchLogsTable.createdAt, since))
    .groupBy(searchLogsTable.query)
    .orderBy(sql`count(*) DESC`)
    .limit(limit);

  sendSuccess(res, { terms: rows, days, total: rows.length });
});

export default router;
