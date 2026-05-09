import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { conditionRulesTable, conditionSettingsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { sendSuccess, sendError, sendNotFound, sendValidationError } from "../lib/response.js";
import { logger } from "../lib/logger.js";

const router = Router();

const ruleCreateSchema = z.object({
  name:          z.string().min(1, "name is required").max(200),
  description:   z.string().max(500).optional().nullable(),
  targetRole:    z.string().min(1, "targetRole is required"),
  metric:        z.string().min(1, "metric is required"),
  operator:      z.enum([">", "<", ">=", "<=", "==", "!="]),
  threshold:     z.union([z.string().min(1), z.number()]),
  conditionType: z.string().min(1, "conditionType is required"),
  severity:      z.string().optional(),
  cooldownHours: z.number().int().min(0).optional(),
  modeApplicability: z.string().optional(),
  isActive:      z.boolean().optional(),
});

const ruleUpdateSchema = ruleCreateSchema.partial();

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

router.post("/", async (req, res) => {
  const p = ruleCreateSchema.safeParse(req.body ?? {});
  if (!p.success) {
    sendValidationError(res, p.error.errors.map(e => e.message).join("; "));
    return;
  }

  try {
    const { name, description, targetRole, metric, operator, threshold, conditionType, severity, cooldownHours, modeApplicability, isActive } = p.data;

    const [created] = await db.insert(conditionRulesTable).values({
      id: generateId(),
      name,
      description: description ?? null,
      targetRole,
      metric,
      operator,
      threshold: String(threshold),
      conditionType: conditionType as any,
      severity: (severity ?? "warning") as any,
      cooldownHours: cooldownHours ?? 24,
      modeApplicability: modeApplicability ?? "default,ai_recommended,custom",
      isActive: isActive ?? true,
    } as any).returning();

    sendSuccess(res, { rule: created });
  } catch (err) {
    logger.error({ err }, "[business-rules] create error");
    sendError(res, "Failed to create business rule", 500);
  }
});

router.put("/:id", async (req, res) => {
  const p = ruleUpdateSchema.safeParse(req.body ?? {});
  if (!p.success) {
    sendValidationError(res, p.error.errors.map(e => e.message).join("; "));
    return;
  }

  try {
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(conditionRulesTable)
      .where(eq(conditionRulesTable.id, id))
      .limit(1);

    if (!existing) { sendNotFound(res, "Business rule not found"); return; }

    const updates: Record<string, unknown> = { ...p.data, updatedAt: new Date() };
    if (updates.threshold !== undefined) updates.threshold = String(updates.threshold);
    if (updates.cooldownHours !== undefined) updates.cooldownHours = Number(updates.cooldownHours);

    const [updated] = await db
      .update(conditionRulesTable)
      .set(updates as any)
      .where(eq(conditionRulesTable.id, id))
      .returning();

    sendSuccess(res, { rule: updated });
  } catch (err) {
    logger.error({ err }, "[business-rules] update error");
    sendError(res, "Failed to update business rule", 500);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db
      .select()
      .from(conditionRulesTable)
      .where(eq(conditionRulesTable.id, id))
      .limit(1);

    if (!existing) { sendNotFound(res, "Business rule not found"); return; }

    await db
      .update(conditionRulesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(conditionRulesTable.id, id));

    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error({ err }, "[business-rules] delete error");
    sendError(res, "Failed to delete business rule", 500);
  }
});

router.post("/validate", async (req, res) => {
  const { metric, value, role, conditionType, threshold, operator } = req.body ?? {};

  if (!metric || value === undefined) {
    sendValidationError(res, "metric and value are required");
    return;
  }

  try {
    let matched: Array<{ id: string; name: string; conditionType: string; severity: string }> = [];

    if (threshold !== undefined && operator) {
      const thresholdNum = parseFloat(String(threshold));
      const val = parseFloat(String(value));

      if (!isNaN(thresholdNum) && !isNaN(val)) {
        let triggered = false;
        switch (operator) {
          case ">":  triggered = val > thresholdNum; break;
          case "<":  triggered = val < thresholdNum; break;
          case ">=": triggered = val >= thresholdNum; break;
          case "<=": triggered = val <= thresholdNum; break;
          case "==": triggered = val === thresholdNum; break;
          case "!=": triggered = val !== thresholdNum; break;
        }

        if (triggered) {
          matched = [{
            id: "dry-run",
            name: "Dry-run rule",
            conditionType: conditionType ?? "warning_l1",
            severity: "warning",
          }];
        }
      }
    } else {
      const rules = await db
        .select()
        .from(conditionRulesTable)
        .where(eq(conditionRulesTable.isActive, true));

      matched = rules
        .filter(r => {
          if (r.metric !== metric) return false;
          if (role && r.targetRole !== "all" && r.targetRole !== role) return false;

          const t = parseFloat(String(r.threshold));
          const v = parseFloat(String(value));
          if (isNaN(t) || isNaN(v)) return false;

          switch (r.operator) {
            case ">":  return v > t;
            case "<":  return v < t;
            case ">=": return v >= t;
            case "<=": return v <= t;
            case "==": return v === t;
            case "!=": return v !== t;
            default:   return false;
          }
        })
        .map(r => ({ id: r.id, name: r.name, conditionType: r.conditionType, severity: r.severity }));
    }

    sendSuccess(res, {
      triggered: matched.length > 0,
      matchedRules: matched,
      dryRun: true,
    });
  } catch (err) {
    logger.error({ err }, "[business-rules] validate error");
    sendError(res, "Failed to validate rule", 500);
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
