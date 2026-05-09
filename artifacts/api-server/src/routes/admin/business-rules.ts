import { Router } from "express";
import { db } from "@workspace/db";
import { businessRulesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { generateId, addAuditEntry, getClientIp, type AdminRequest } from "../admin-shared.js";
import { sendSuccess, sendCreated, sendNotFound, sendValidationError } from "../../lib/response.js";

const router = Router();

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonField(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function validateBusinessRule(payload: Record<string, unknown>, requireTrigger = true): string[] {
  const errors: string[] = [];
  const trigger = payload.trigger;
  const conditions = payload.conditions;
  const actions = payload.actions;
  const name = payload.name;
  const priority = payload.priority;
  const isActive = payload.isActive;

  if (requireTrigger && (!trigger || typeof trigger !== "string" || !trigger.trim())) {
    errors.push("trigger is required and must be a non-empty string");
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    errors.push("name must be a non-empty string");
  }
  if (conditions !== undefined && !isJsonObject(conditions)) {
    errors.push("conditions must be a JSON object");
  }
  if (actions !== undefined && !isJsonObject(actions)) {
    errors.push("actions must be a JSON object");
  }
  if (priority !== undefined && priority !== null) {
    const numericPriority = Number(priority);
    if (!Number.isInteger(numericPriority) || numericPriority < 0) {
      errors.push("priority must be a non-negative integer");
    }
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    errors.push("isActive must be a boolean");
  }

  return errors;
}

router.get("/", async (req, res) => {
  const rules = await db.select().from(businessRulesTable).orderBy(businessRulesTable.priority);
  sendSuccess(res, { rules });
});

router.post("/", async (req, res) => {
  const body = {
    name: req.body.name,
    description: req.body.description,
    trigger: req.body.trigger,
    conditions: parseJsonField(req.body.conditions),
    actions: parseJsonField(req.body.actions),
    priority: req.body.priority ?? 0,
    isActive: req.body.isActive ?? true,
  };

  const errors = validateBusinessRule(body);
  if (errors.length > 0) {
    sendValidationError(res, "Invalid business rule payload", JSON.stringify(errors));
    return;
  }

  const id = generateId();
  const [created] = await db.insert(businessRulesTable).values({
    id,
    name: String(body.name ?? ""),
    description: String(body.description ?? ""),
    trigger: String(body.trigger ?? ""),
    conditions: body.conditions as Record<string, unknown>,
    actions: body.actions as Record<string, unknown>,
    priority: Number(body.priority),
    isActive: Boolean(body.isActive),
  }).returning();

  addAuditEntry({
    action: "business_rule_create",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Created business rule: ${created.name}`,
    result: "success",
  });

  sendCreated(res, { rule: created });
});

router.put("/:id", async (req, res) => {
  const id = req.params.id;
  const body = {
    name: req.body.name,
    description: req.body.description,
    trigger: req.body.trigger,
    conditions: req.body.conditions !== undefined ? parseJsonField(req.body.conditions) : undefined,
    actions: req.body.actions !== undefined ? parseJsonField(req.body.actions) : undefined,
    priority: req.body.priority,
    isActive: req.body.isActive,
  };

  const errors = validateBusinessRule(body, false);
  if (errors.length > 0) {
    sendValidationError(res, "Invalid business rule payload", JSON.stringify(errors));
    return;
  }

  const [existing] = await db.select().from(businessRulesTable).where(eq(businessRulesTable.id, id)).limit(1);
  if (!existing) {
    sendNotFound(res, "Business rule not found");
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = String(body.name ?? "");
  if (body.description !== undefined) updates.description = String(body.description ?? "");
  if (body.trigger !== undefined) updates.trigger = String(body.trigger ?? "");
  if (body.conditions !== undefined) updates.conditions = body.conditions as Record<string, unknown>;
  if (body.actions !== undefined) updates.actions = body.actions as Record<string, unknown>;
  if (body.priority !== undefined) updates.priority = Number(body.priority);
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

  const [updated] = await db.update(businessRulesTable).set(updates).where(eq(businessRulesTable.id, id)).returning();

  addAuditEntry({
    action: "business_rule_update",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Updated business rule: ${existing.name}`,
    result: "success",
  });

  sendSuccess(res, { rule: updated });
});

router.delete("/:id", async (req, res) => {
  const id = req.params.id;
  const [existing] = await db.select().from(businessRulesTable).where(eq(businessRulesTable.id, id)).limit(1);
  if (!existing) {
    sendNotFound(res, "Business rule not found");
    return;
  }

  await db.delete(businessRulesTable).where(eq(businessRulesTable.id, id));

  addAuditEntry({
    action: "business_rule_delete",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Deleted business rule: ${existing.name}`,
    result: "success",
  });

  sendSuccess(res, { success: true });
});

router.post("/validate", async (req, res) => {
  const payload = {
    trigger: req.body.trigger,
    conditions: parseJsonField(req.body.conditions),
    actions: parseJsonField(req.body.actions),
    name: req.body.name,
    priority: req.body.priority,
    isActive: req.body.isActive,
  };
  const errors = validateBusinessRule(payload);
  sendSuccess(res, { valid: errors.length === 0, errors });
});

export default router;
