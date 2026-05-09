import { Router } from "express";
import { db } from "@workspace/db";
import { conditionRulesTable, conditionSettingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { sendSuccess, sendError } from "../lib/response.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const rules = await db
      .select()
      .from(conditionRulesTable)
      .where(eq(conditionRulesTable.isActive, true))
      .orderBy(desc(conditionRulesTable.createdAt));
    sendSuccess(res, { rules });
  } catch (err) {
    logger.error({ err }, "[business-rules] list error");
    sendError(res, "Failed to fetch business rules", 500);
  }
});

router.get("/settings", async (_req, res) => {
  try {
    const settings = await db.select().from(conditionSettingsTable).limit(1);
    sendSuccess(res, { settings: settings[0] ?? {} });
  } catch (err) {
    logger.error({ err }, "[business-rules] settings error");
    sendSuccess(res, { settings: {} });
  }
});

router.post("/evaluate", async (req, res) => {
  const { metric, value, role } = req.body ?? {};
  if (!metric || value === undefined) {
    sendError(res, "metric and value are required", 400);
    return;
  }

  try {
    const rules = await db
      .select()
      .from(conditionRulesTable)
      .where(eq(conditionRulesTable.isActive, true));

    const matched = rules.filter(r => {
      if (r.metric !== metric) return false;
      if (role && r.targetRole !== "all" && r.targetRole !== role) return false;

      const threshold = parseFloat(String(r.threshold));
      const val = parseFloat(String(value));
      if (isNaN(threshold) || isNaN(val)) return false;

      switch (r.operator) {
        case ">":  return val > threshold;
        case "<":  return val < threshold;
        case ">=": return val >= threshold;
        case "<=": return val <= threshold;
        case "==": return val === threshold;
        case "!=": return val !== threshold;
        default:   return false;
      }
    });

    sendSuccess(res, {
      triggered: matched.length > 0,
      matchedRules: matched.map(r => ({
        id: r.id,
        name: r.name,
        conditionType: r.conditionType,
        severity: r.severity,
      })),
    });
  } catch (err) {
    logger.error({ err }, "[business-rules] evaluate error");
    sendError(res, "Failed to evaluate rules", 500);
  }
});

export default router;
