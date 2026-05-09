import { Router } from "express";
import { db } from "@workspace/db";
import { abExperimentsTable, abAssignmentsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { sendSuccess, sendNotFound, sendValidationError } from "../lib/response.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const experiments = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.status, "active"));
    sendSuccess(res, { experiments });
  } catch (err) {
    logger.error({ err }, "[experiments] list error");
    sendSuccess(res, { experiments: [] });
  }
});

router.post("/assign", async (req, res) => {
  const { userId, experimentId } = req.body ?? {};
  if (!userId || !experimentId) {
    sendValidationError(res, "userId and experimentId are required");
    return;
  }

  try {
    const [experiment] = await db
      .select()
      .from(abExperimentsTable)
      .where(and(eq(abExperimentsTable.id, experimentId), eq(abExperimentsTable.status, "active")))
      .limit(1);

    if (!experiment) {
      sendNotFound(res, "Experiment not found or not active");
      return;
    }

    const [existing] = await db
      .select()
      .from(abAssignmentsTable)
      .where(and(eq(abAssignmentsTable.experimentId, experimentId), eq(abAssignmentsTable.userId, userId)))
      .limit(1);

    if (existing) {
      sendSuccess(res, { assignment: existing, isNew: false });
      return;
    }

    const variants = experiment.variants as Array<{ name: string; weight: number }>;
    const totalWeight = variants.reduce((s, v) => s + (v.weight ?? 1), 0);
    let rand = Math.random() * totalWeight;
    let assignedVariant = variants[0]?.name ?? "control";
    for (const v of variants) {
      rand -= v.weight ?? 1;
      if (rand <= 0) { assignedVariant = v.name; break; }
    }

    const [created] = await db.insert(abAssignmentsTable).values({
      id: generateId(),
      experimentId,
      userId,
      variant: assignedVariant,
      converted: false,
    }).returning();

    sendSuccess(res, { assignment: created, isNew: true });
  } catch (err) {
    logger.error({ err }, "[experiments] assign error");
    sendSuccess(res, { assignment: null, isNew: false });
  }
});

export default router;
