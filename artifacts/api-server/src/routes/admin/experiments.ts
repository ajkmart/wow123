import { Router } from "express";
import { db } from "@workspace/db";
import { abExperimentsTable, abAssignmentsTable } from "@workspace/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { generateId, addAuditEntry, getClientIp, type AdminRequest } from "../admin-shared.js";
import { sendSuccess, sendNotFound, sendValidationError } from "../../lib/response.js";

const router = Router();

router.get("/experiments", async (_req, res) => {
  const experiments = await db.select().from(abExperimentsTable).orderBy(desc(abExperimentsTable.createdAt));
  sendSuccess(res, { experiments });
});

router.post("/experiments", async (req, res) => {
  const { name, description, variants, trafficPct } = req.body;
  if (!name) { sendValidationError(res, "Name is required"); return; }
  if (!variants || !Array.isArray(variants) || variants.length < 2) {
    sendValidationError(res, "At least 2 variants are required"); return;
  }

  for (const v of variants) {
    if (!v.name || typeof v.name !== "string" || !v.name.trim()) {
      sendValidationError(res, "All variants must have a non-empty name"); return;
    }
    if (typeof v.weight !== "number" || v.weight < 0 || isNaN(v.weight)) {
      sendValidationError(res, "All variant weights must be non-negative numbers"); return;
    }
  }

  const names = variants.map((v: any) => v.name.trim());
  if (new Set(names).size !== names.length) {
    sendValidationError(res, "Variant names must be unique"); return;
  }

  const id = generateId();
  const [created] = await db.insert(abExperimentsTable).values({
    id,
    name,
    description: description || "",
    variants,
    trafficPct: trafficPct ?? 100,
    status: "active",
  }).returning();

  addAuditEntry({ action: "experiment_create", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Created experiment: ${name}`, result: "success" });
  sendSuccess(res, { experiment: created });
});

router.patch("/experiments/:id/status", async (req, res) => {
  const id = req.params["id"]!;
  const { status } = req.body;
  if (!["active", "paused", "completed", "draft"].includes(status)) {
    sendValidationError(res, "Invalid status"); return;
  }

  const [existing] = await db.select().from(abExperimentsTable).where(eq(abExperimentsTable.id, id)).limit(1);
  if (!existing) { sendNotFound(res, "Experiment not found"); return; }

  await db.update(abExperimentsTable).set({ status, updatedAt: new Date() }).where(eq(abExperimentsTable.id, id));
  addAuditEntry({ action: "experiment_status", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Updated experiment ${existing.name} to ${status}`, result: "success" });
  sendSuccess(res, { success: true });
});

router.get("/experiments/:id/results", async (req, res) => {
  const id = req.params["id"]!;
  const [experiment] = await db.select().from(abExperimentsTable).where(eq(abExperimentsTable.id, id)).limit(1);
  if (!experiment) { sendNotFound(res, "Experiment not found"); return; }

  const results = await db
    .select({
      variant: abAssignmentsTable.variant,
      total: sql<number>`count(*)::int`,
      converted: sql<number>`sum(case when ${abAssignmentsTable.converted} then 1 else 0 end)::int`,
    })
    .from(abAssignmentsTable)
    .where(eq(abAssignmentsTable.experimentId, id))
    .groupBy(abAssignmentsTable.variant);

  sendSuccess(res, { experiment, results });
});

router.post("/experiments/:id/convert", async (req, res) => {
  const experimentId = req.params["id"]!;
  const { userId } = req.body;
  if (!userId) { sendValidationError(res, "userId is required"); return; }

  const [experiment] = await db.select().from(abExperimentsTable).where(eq(abExperimentsTable.id, experimentId)).limit(1);
  if (!experiment) { sendNotFound(res, "Experiment not found"); return; }

  const [assignment] = await db.select().from(abAssignmentsTable)
    .where(and(eq(abAssignmentsTable.experimentId, experimentId), eq(abAssignmentsTable.userId, userId)))
    .limit(1);

  if (!assignment) { sendNotFound(res, "No assignment found for this user in this experiment"); return; }
  if (assignment.converted) { sendSuccess(res, { alreadyConverted: true }); return; }

  await db.update(abAssignmentsTable)
    .set({ converted: true })
    .where(eq(abAssignmentsTable.id, assignment.id));

  sendSuccess(res, { converted: true, variant: assignment.variant });
});

router.delete("/experiments/:id", async (req, res) => {
  const id = req.params["id"]!;
  const [existing] = await db.select().from(abExperimentsTable).where(eq(abExperimentsTable.id, id)).limit(1);
  if (!existing) { sendNotFound(res, "Experiment not found"); return; }

  await db.delete(abAssignmentsTable).where(eq(abAssignmentsTable.experimentId, id));
  await db.delete(abExperimentsTable).where(eq(abExperimentsTable.id, id));
  addAuditEntry({ action: "experiment_delete", ip: getClientIp(req), adminId: (req as AdminRequest).adminId, details: `Deleted experiment: ${existing.name}`, result: "success" });
  sendSuccess(res, { success: true });
});

export default router;
