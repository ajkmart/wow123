import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, walletTransactionsTable, loyaltyCampaignsTable, loyaltyRewardsTable } from "@workspace/db/schema";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { generateId } from "../../lib/id.js";
import {
  addAuditEntry, getClientIp, type AdminRequest,
  sendUserNotification,
} from "../admin-shared.js";
import { sendSuccess, sendCreated, sendError, sendNotFound, sendValidationError } from "../../lib/response.js";

const router = Router();

type LoyaltyRow = { amount: string; type: string; reference: string | null };

function computeLoyalty(rows: LoyaltyRow[]) {
  let totalEarned = 0;
  let totalRedeemed = 0;
  for (const r of rows) {
    const amt = parseFloat(r.amount ?? "0");
    if (r.reference === "admin_loyalty_debit") {
      totalRedeemed += amt;
    } else if (r.type === "loyalty") {
      totalEarned += amt;
    } else if (r.type === "credit" && r.reference?.startsWith("loyalty_redeem_")) {
      totalRedeemed += amt;
    }
  }
  const available = Math.max(0, Math.floor(totalEarned) - Math.floor(totalRedeemed));
  return { totalEarned: Math.floor(totalEarned), totalRedeemed: Math.floor(totalRedeemed), available };
}

router.get("/loyalty/users", async (req, res) => {
  const q = ((req.query?.q as string) ?? "").trim();

  const conditions: ReturnType<typeof eq>[] = [
    ilike(usersTable.roles, "%customer%") as ReturnType<typeof eq>,
  ];
  if (q) {
    conditions.push(or(
      ilike(usersTable.name, `%${q}%`),
      ilike(usersTable.phone, `%${q}%`),
      ilike(usersTable.email, `%${q}%`),
    )! as ReturnType<typeof eq>);
  }

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      phone: usersTable.phone,
      email: usersTable.email,
      avatar: usersTable.avatar,
      walletBalance: usersTable.walletBalance,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(and(...conditions))
    .orderBy(desc(usersTable.createdAt));

  const loyaltyTxns = await db
    .select({
      userId: walletTransactionsTable.userId,
      type: walletTransactionsTable.type,
      amount: walletTransactionsTable.amount,
      reference: walletTransactionsTable.reference,
    })
    .from(walletTransactionsTable)
    .where(
      or(
        eq(walletTransactionsTable.type, "loyalty"),
        sql`${walletTransactionsTable.type} = 'credit' AND ${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%'`,
      )!,
    );

  const perUserTxns = new Map<string, LoyaltyRow[]>();
  for (const txn of loyaltyTxns) {
    if (!perUserTxns.has(txn.userId)) perUserTxns.set(txn.userId, []);
    perUserTxns.get(txn.userId)!.push(txn);
  }

  const enrichedUsers = users.map(u => {
    const loyalty = computeLoyalty(perUserTxns.get(u.id) || []);
    return {
      ...u,
      walletBalance: parseFloat(u.walletBalance ?? "0"),
      createdAt: u.createdAt.toISOString(),
      loyaltyPoints: loyalty,
    };
  });

  sendSuccess(res, { users: enrichedUsers, total: enrichedUsers.length });
});

router.post("/loyalty/users/:id/adjust", async (req, res) => {
  const userId = req.params["id"]!;
  const { amount, reason, type } = req.body as { amount?: number; reason?: string; type?: string };

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0 || !Number.isInteger(Number(amount))) {
    sendValidationError(res, "A positive whole number amount is required");
    return;
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    sendValidationError(res, "A reason is required for loyalty point adjustments");
    return;
  }
  if (type !== "credit" && type !== "debit") {
    sendValidationError(res, "Type must be 'credit' or 'debit'");
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    sendNotFound(res, "User not found");
    return;
  }

  const adjustAmount = Number(amount);

  if (type === "debit") {
    const inserted = await db.transaction(async (tx) => {
      const allRows = await tx
        .select({ amount: walletTransactionsTable.amount, type: walletTransactionsTable.type, reference: walletTransactionsTable.reference })
        .from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.userId, userId));

      const loyaltyRows = allRows.filter(r =>
        r.type === "loyalty" ||
        (r.type === "credit" && r.reference?.startsWith("loyalty_redeem_"))
      );
      const { available } = computeLoyalty(loyaltyRows);

      if (adjustAmount > available) {
        return { error: `Cannot debit ${adjustAmount} points. User only has ${available} loyalty points available.` };
      }

      await tx.insert(walletTransactionsTable).values({
        id: generateId(),
        userId,
        type: "loyalty",
        amount: adjustAmount.toFixed(2),
        description: `Admin loyalty debit: ${reason.trim()}`,
        reference: "admin_loyalty_debit",
      });
      return { error: null };
    });

    if (inserted.error) {
      sendError(res, inserted.error, 400);
      return;
    }
  } else {
    await db.insert(walletTransactionsTable).values({
      id: generateId(),
      userId,
      type: "loyalty",
      amount: adjustAmount.toFixed(2),
      description: `Admin loyalty credit: ${reason.trim()}`,
      reference: "admin_loyalty_credit",
    });
  }

  const ip = getClientIp(req);
  addAuditEntry({
    action: `loyalty_${type}`,
    ip: ip || "admin",
    details: `Admin ${type === "credit" ? "credited" : "debited"} ${adjustAmount} loyalty points for user ${user.phone || user.name || userId} — Reason: ${reason.trim()}`,
    result: "success",
  });

  await sendUserNotification(
    userId,
    type === "credit" ? "Loyalty Points Added!" : "Loyalty Points Adjusted",
    type === "credit"
      ? `${adjustAmount} loyalty points have been added to your account.`
      : `${adjustAmount} loyalty points have been deducted from your account.`,
    "system",
    "star-outline",
  );

  const updatedRows = await db
    .select({ amount: walletTransactionsTable.amount, type: walletTransactionsTable.type, reference: walletTransactionsTable.reference })
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, userId));

  const updatedLoyalty = computeLoyalty(updatedRows.filter(r =>
    r.type === "loyalty" ||
    (r.type === "credit" && r.reference?.startsWith("loyalty_redeem_"))
  ));

  sendSuccess(res, {
    success: true,
    loyaltyPoints: updatedLoyalty,
  });
});

function parseDateString(value: unknown, field: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date string`);
  return date.toISOString();
}

function assertRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error();
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error(`${field} must be a valid JSON object`);
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be a valid JSON object`);
  }
  return value as Record<string, unknown>;
}

function validateCampaignInput(payload: any): string[] {
  const errors: string[] = [];
  if (!payload.name || typeof payload.name !== "string" || !payload.name.trim()) {
    errors.push("Campaign name is required");
  }
  if (payload.pointsReward === undefined || !Number.isInteger(payload.pointsReward) || payload.pointsReward < 0) {
    errors.push("pointsReward must be a non-negative integer");
  }
  try {
    parseDateString(payload.startDate, "startDate");
    parseDateString(payload.endDate, "endDate");
  } catch (err: any) {
    errors.push(err.message);
  }
  if (payload.minOrderAmount !== undefined && payload.minOrderAmount !== null && isNaN(Number(payload.minOrderAmount))) {
    errors.push("minOrderAmount must be a valid number");
  }
  return errors;
}

function validateRewardInput(payload: any): string[] {
  const errors: string[] = [];
  if (!payload.name || typeof payload.name !== "string" || !payload.name.trim()) {
    errors.push("Reward name is required");
  }
  if (payload.pointsCost === undefined || !Number.isInteger(payload.pointsCost) || payload.pointsCost < 0) {
    errors.push("pointsCost must be a non-negative integer");
  }
  if (!payload.rewardType || typeof payload.rewardType !== "string" || !payload.rewardType.trim()) {
    errors.push("rewardType is required");
  }
  if (payload.rewardValue === undefined || isNaN(Number(payload.rewardValue))) {
    errors.push("rewardValue must be a valid number");
  }
  if (payload.stock !== undefined && payload.stock !== null && !Number.isInteger(payload.stock)) {
    errors.push("stock must be an integer if provided");
  }
  return errors;
}

router.post("/campaigns", async (req, res) => {
  const body = {
    name: req.body.name,
    description: req.body.description ?? "",
    pointsReward: req.body.pointsReward,
    minOrderAmount: req.body.minOrderAmount ?? null,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    isActive: req.body.isActive ?? true,
  };

  const errors = validateCampaignInput(body);
  if (errors.length > 0) {
    sendValidationError(res, errors.join("; "));
    return;
  }

  const startDate = parseDateString(body.startDate, "startDate");
  const endDate = parseDateString(body.endDate, "endDate");
  if (!startDate || !endDate) {
    sendValidationError(res, "startDate and endDate are required and must be valid dates");
    return;
  }

  const [campaign] = await db.insert(loyaltyCampaignsTable).values({
    id: generateId(),
    name: String(body.name).trim(),
    description: String(body.description),
    type: "bonus_multiplier",
    bonusMultiplier: body.pointsReward != null ? String(Number(body.pointsReward)) : "1.00",
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    status: body.isActive !== false ? "active" : "inactive",
  }).returning();

  addAuditEntry({
    action: "loyalty_campaign_create",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Created loyalty campaign: ${campaign.name}`,
    result: "success",
  });

  sendCreated(res, { campaign });
});

router.put("/campaigns/:id", async (req, res) => {
  const id = req.params["id"];
  const [existing] = await db.select().from(loyaltyCampaignsTable).where(eq(loyaltyCampaignsTable.id, id)).limit(1);
  if (!existing) {
    sendNotFound(res, "Campaign not found");
    return;
  }

  const body = {
    name: req.body.name ?? existing.name,
    description: req.body.description ?? existing.description,
    pointsReward: req.body.pointsReward ?? existing.bonusMultiplier,
    minOrderAmount: req.body.minOrderAmount ?? null,
    startDate: req.body.startDate ?? existing.startDate,
    endDate: req.body.endDate ?? existing.endDate,
    isActive: req.body.isActive ?? (existing.status === "active"),
  };

  const errors = validateCampaignInput(body);
  if (errors.length > 0) {
    sendValidationError(res, errors.join("; "));
    return;
  }

  const startDate = parseDateString(body.startDate, "startDate");
  const endDate = parseDateString(body.endDate, "endDate");
  if (!startDate || !endDate) {
    sendValidationError(res, "startDate and endDate are required and must be valid dates");
    return;
  }

  const [campaign] = await db.update(loyaltyCampaignsTable).set({
    name: String(body.name).trim(),
    description: String(body.description),
    bonusMultiplier: body.pointsReward != null ? String(Number(body.pointsReward)) : "1.00",
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    status: body.isActive !== false ? "active" : "inactive",
    updatedAt: new Date(),
  }).where(eq(loyaltyCampaignsTable.id, id)).returning();

  addAuditEntry({
    action: "loyalty_campaign_update",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Updated loyalty campaign: ${existing.name}`,
    result: "success",
  });

  sendSuccess(res, { campaign });
});

router.delete("/campaigns/:id", async (req, res) => {
  const id = req.params["id"];
  const [existing] = await db.select().from(loyaltyCampaignsTable).where(eq(loyaltyCampaignsTable.id, id)).limit(1);
  if (!existing) {
    sendNotFound(res, "Campaign not found");
    return;
  }

  await db.delete(loyaltyCampaignsTable).where(eq(loyaltyCampaignsTable.id, id));

  addAuditEntry({
    action: "loyalty_campaign_delete",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Deleted loyalty campaign: ${existing.name}`,
    result: "success",
  });

  sendSuccess(res, { success: true });
});

router.post("/rewards", async (req, res) => {
  const body = {
    name: req.body.name,
    description: req.body.description ?? "",
    pointsCost: req.body.pointsCost,
    rewardType: req.body.rewardType,
    rewardValue: req.body.rewardValue,
    isActive: req.body.isActive ?? true,
    stock: req.body.stock,
  };

  const errors = validateRewardInput(body);
  if (errors.length > 0) {
    sendValidationError(res, errors.join("; "));
    return;
  }

  const [reward] = await db.insert(loyaltyRewardsTable).values({
    id: generateId(),
    name: String(body.name).trim(),
    description: String(body.description),
    pointsCost: Number(body.pointsCost),
    rewardType: String(body.rewardType).trim(),
    rewardValue: Number(body.rewardValue).toFixed(2),
    isActive: Boolean(body.isActive),
    stock: body.stock !== undefined && body.stock !== null ? Number(body.stock) : null,
  }).returning();

  addAuditEntry({
    action: "loyalty_reward_create",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Created loyalty reward: ${reward.name}`,
    result: "success",
  });

  sendCreated(res, { reward });
});

router.put("/rewards/:id", async (req, res) => {
  const id = req.params["id"];
  const [existing] = await db.select().from(loyaltyRewardsTable).where(eq(loyaltyRewardsTable.id, id)).limit(1);
  if (!existing) {
    sendNotFound(res, "Reward not found");
    return;
  }

  const body = {
    name: req.body.name ?? existing.name,
    description: req.body.description ?? existing.description,
    pointsCost: req.body.pointsCost ?? existing.pointsCost,
    rewardType: req.body.rewardType ?? existing.rewardType,
    rewardValue: req.body.rewardValue ?? existing.rewardValue,
    isActive: req.body.isActive ?? existing.isActive,
    stock: req.body.stock ?? existing.stock,
  };

  const errors = validateRewardInput(body);
  if (errors.length > 0) {
    sendValidationError(res, errors.join("; "));
    return;
  }

  const [reward] = await db.update(loyaltyRewardsTable).set({
    name: String(body.name).trim(),
    description: String(body.description),
    pointsCost: Number(body.pointsCost),
    rewardType: String(body.rewardType).trim(),
    rewardValue: Number(body.rewardValue).toFixed(2),
    isActive: Boolean(body.isActive),
    stock: body.stock !== undefined && body.stock !== null ? Number(body.stock) : null,
    updatedAt: new Date(),
  }).where(eq(loyaltyRewardsTable.id, id)).returning();

  addAuditEntry({
    action: "loyalty_reward_update",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Updated loyalty reward: ${existing.name}`,
    result: "success",
  });

  sendSuccess(res, { reward });
});

router.delete("/rewards/:id", async (req, res) => {
  const id = req.params["id"];
  const [existing] = await db.select().from(loyaltyRewardsTable).where(eq(loyaltyRewardsTable.id, id)).limit(1);
  if (!existing) {
    sendNotFound(res, "Reward not found");
    return;
  }

  await db.delete(loyaltyRewardsTable).where(eq(loyaltyRewardsTable.id, id));

  addAuditEntry({
    action: "loyalty_reward_delete",
    ip: getClientIp(req),
    adminId: (req as AdminRequest).adminId,
    details: `Deleted loyalty reward: ${existing.name}`,
    result: "success",
  });

  sendSuccess(res, { success: true });
});

router.get("/stats", async (req, res) => {
  const rows = await db
    .select({
      userId: walletTransactionsTable.userId,
      totalEarned: sql<string>`COALESCE(sum(case when ${walletTransactionsTable.type} = 'loyalty' then ${walletTransactionsTable.amount} else 0 end), 0)`,
      totalRedeemed: sql<string>`COALESCE(sum(case when ${walletTransactionsTable.type} = 'credit' AND ${walletTransactionsTable.reference} LIKE 'loyalty_redeem_%' then ${walletTransactionsTable.amount} when ${walletTransactionsTable.type} = 'loyalty' AND ${walletTransactionsTable.reference} = 'admin_loyalty_debit' then ${walletTransactionsTable.amount} else 0 end), 0)`,
    })
    .from(walletTransactionsTable)
    .groupBy(walletTransactionsTable.userId);

  const totalPointsIssued = rows.reduce((sum, row) => sum + parseFloat(row.totalEarned ?? "0"), 0);
  const totalPointsRedeemed = rows.reduce((sum, row) => sum + parseFloat(row.totalRedeemed ?? "0"), 0);
  const userBalances = rows.map((row) => ({
    userId: row.userId,
    available: Math.max(parseFloat(row.totalEarned ?? "0") - parseFloat(row.totalRedeemed ?? "0"), 0),
  }));
  const activeUsers = userBalances.filter((row) => row.available > 0).length;

  const topUsers = userBalances
    .sort((a, b) => b.available - a.available)
    .slice(0, 5)
    .filter((row) => row.available > 0);

  const topUserIds = topUsers.map((row) => row.userId);
  const userRows = topUserIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(inArray(usersTable.id, topUserIds))
    : [];

  const usersById = new Map(userRows.map((user) => [user.id, user]));
  const topEarners = topUsers.map((row) => ({
    userId: row.userId,
    points: row.available,
    name: usersById.get(row.userId)?.name ?? null,
    phone: usersById.get(row.userId)?.phone ?? null,
  }));

  sendSuccess(res, {
    totalPointsIssued: Math.round(totalPointsIssued),
    totalPointsRedeemed: Math.round(totalPointsRedeemed),
    activeUsers,
    topEarners,
  });
});

export default router;
