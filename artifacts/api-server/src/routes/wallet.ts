import { randomInt } from "crypto";
import { logger } from "../lib/logger.js";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable, walletTransactionsTable, notificationsTable, adminAccountsTable, idempotencyKeysTable } from "@workspace/db/schema";
import { eq, and, gte, sum, desc, sql } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { adminAuth } from "./admin.js";
import { customerAuth, checkAvailableRateLimit, getClientIp, JWT_SECRET, addAuditEntry, getCachedSettings } from "../middleware/security.js";
import { t } from "@workspace/i18n";
import { getUserLanguage } from "../lib/getUserLanguage.js";
import { getIO } from "../lib/socketio.js";
import { z } from "zod";
import { sendSuccess, sendCreated, sendAccepted, sendError, sendNotFound, sendForbidden, sendValidationError, sendErrorWithData } from "../lib/response.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { verifyTotpToken, decryptTotpSecret } from "../services/totp.js";
import { paymentLimiter } from "../middleware/rate-limit.js";
import { IDEMPOTENCY_TTL_MS as WALLET_IDEMPOTENCY_TTL_MS } from "../lib/cleanupIdempotencyKeys.js";

/* ── IS_PRODUCTION guard — independent of NODE_ENV for simulate-topup hardening ── */
const IS_PRODUCTION = process.env["IS_PRODUCTION"] === "true" || process.env["NODE_ENV"] === "production";

/* ── DB idempotency helpers for wallet operations ───────────────────────────
   Keys are namespaced by operation prefix to prevent cross-route collisions:
     deposit:<rawKey>  |  send:<rawKey>  |  withdraw:<rawKey>
   Stored in the shared idempotency_keys table (same table used by orders.ts).

   ATOMIC ACQUISITION PATTERN (eliminates TOCTOU race):
     1. Attempt INSERT of the in-flight marker.
     2. If the INSERT succeeds (1 row returned) → we exclusively own the key;
        caller should proceed with the financial operation.
     3. If the INSERT returns 0 rows (unique-constraint conflict) → key already
        exists; SELECT it to determine state:
          responseData = "{}"  → another request is in-flight → 409
          responseData = JSON  → prior success → replay the stored response
   On failure (error or validation) the key is deleted so clients can retry. */

type AcquireResult =
  | { acquired: true }
  | { acquired: false; action: "in_flight" | "replay"; statusCode?: number; body?: unknown };

async function acquireWalletIdempotency(
  userId: string,
  prefix: string,
  rawKey: string,
): Promise<AcquireResult> {
  const idemKey = `${prefix}:${rawKey}`;
  const ttlCutoff = new Date(Date.now() - WALLET_IDEMPOTENCY_TTL_MS);

  /* Step 1: atomic INSERT — if it succeeds we exclusively own the key. */
  const inserted = await db
    .insert(idempotencyKeysTable)
    .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeysTable.id });

  if (inserted.length > 0) return { acquired: true };

  /* Step 2: INSERT conflicted — SELECT WITHOUT TTL filter to see the real row. */
  const [existing] = await db
    .select()
    .from(idempotencyKeysTable)
    .where(and(
      eq(idempotencyKeysTable.userId, userId),
      eq(idempotencyKeysTable.idempotencyKey, idemKey),
    ))
    .limit(1);

  if (!existing) {
    /* Row was deleted (by cleanup interval) between our INSERT and SELECT.
       Re-try the INSERT once — this closes the race for key-deleted-mid-flight. */
    const retry = await db
      .insert(idempotencyKeysTable)
      .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeysTable.id });
    return retry.length > 0 ? { acquired: true } : { acquired: false, action: "in_flight" };
  }

  /* Step 3: Key exists — is it stale (expired)? */
  if (existing.createdAt < ttlCutoff) {
    /* Delete the stale row by its exact PK so we don't race with a concurrent
       fresh insert that may have just replaced it. */
    await db.delete(idempotencyKeysTable)
      .where(and(
        eq(idempotencyKeysTable.id, existing.id),
        eq(idempotencyKeysTable.userId, userId),
      ));

    /* Re-insert fresh in-flight marker. */
    const reinserted = await db
      .insert(idempotencyKeysTable)
      .values({ id: generateId(), userId, idempotencyKey: idemKey, responseData: "{}" })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeysTable.id });

    if (reinserted.length > 0) return { acquired: true };

    /* Another concurrent request beat us to the re-insert after we deleted the stale key. */
    const [fresh] = await db
      .select()
      .from(idempotencyKeysTable)
      .where(and(
        eq(idempotencyKeysTable.userId, userId),
        eq(idempotencyKeysTable.idempotencyKey, idemKey),
        gte(idempotencyKeysTable.createdAt, ttlCutoff),
      ))
      .limit(1);

    if (!fresh || fresh.responseData === "{}") return { acquired: false, action: "in_flight" };
    const parsedFresh = (() => { try { return JSON.parse(fresh.responseData); } catch { return null; } })();
    if (parsedFresh) {
      const { _sc, ...body } = parsedFresh as { _sc?: number; [k: string]: unknown };
      return { acquired: false, action: "replay", statusCode: _sc ?? 200, body };
    }
    return { acquired: false, action: "in_flight" };
  }

  /* Step 4: Key is valid and within TTL — determine state. */
  if (existing.responseData === "{}") {
    return { acquired: false, action: "in_flight" };
  }

  const parsed = (() => { try { return JSON.parse(existing.responseData); } catch { return null; } })();
  if (parsed) {
    const { _sc, ...body } = parsed as { _sc?: number; [k: string]: unknown };
    return { acquired: false, action: "replay", statusCode: _sc ?? 200, body };
  }
  return { acquired: false, action: "in_flight" };
}

async function resolveWalletIdempotency(
  userId: string,
  prefix: string,
  rawKey: string,
  statusCode: number,
  body: unknown,
): Promise<void> {
  const idemKey = `${prefix}:${rawKey}`;
  const payload = JSON.stringify({ _sc: statusCode, ...(body as object) });
  await db.update(idempotencyKeysTable)
    .set({ responseData: payload })
    .where(and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.idempotencyKey, idemKey)))
    .catch((e: Error) => logger.warn({ userId, idemKey, err: e.message }, "[wallet] idempotency response update failed"));
}

async function deleteWalletIdempotency(userId: string, prefix: string, rawKey: string): Promise<void> {
  const idemKey = `${prefix}:${rawKey}`;
  await db.delete(idempotencyKeysTable)
    .where(and(eq(idempotencyKeysTable.userId, userId), eq(idempotencyKeysTable.idempotencyKey, idemKey)))
    .catch((e: Error) => logger.warn({ userId, idemKey, err: e.message }, "[wallet] idempotency key delete failed"));
}

/* ── Amount decimal precision validator ─────────────────────────────────────
   Rejects amounts with more than 2 decimal places (e.g. 100.001 → 400).
   Uses string representation to avoid floating-point artefacts. */
function hasValidDecimalPrecision(value: number): boolean {
  const str = value.toString();
  const dotIndex = str.indexOf(".");
  if (dotIndex === -1) return true;
  return str.length - dotIndex - 1 <= 2;
}

const amountField = z.union([z.number().positive(), z.string().min(1)])
  .transform(v => parseFloat(String(v)))
  .refine(v => !isNaN(v) && isFinite(v) && v > 0, "Invalid amount")
  .refine(hasValidDecimalPrecision, "Amount must have at most 2 decimal places");

const paymentMethodField = z.string().min(1, "paymentMethod is required")
  .regex(/^[a-z_]+$/, "paymentMethod must be a lowercase identifier");

const depositSchema = z.object({
  amount: amountField,
  paymentMethod: paymentMethodField,
  transactionId: z.string().min(1, "transactionId required"),
  idempotencyKey: z.string().uuid("idempotencyKey must be a UUID"),
  accountNumber: z.string().optional(),
  note: z.string().max(200).optional(),
});

const sendSchema = z.object({
  receiverPhone: z.string().optional(),
  ajkId: z.string().optional(),
  amount: amountField,
  note: z.string().max(200).optional(),
}).refine(d => d.receiverPhone || d.ajkId, {
  message: "receiverPhone or ajkId is required",
});

const withdrawSchema = z.object({
  amount: amountField,
  paymentMethod: paymentMethodField,
  accountNumber: z.string().min(1, "accountNumber required"),
  note: z.string().max(200).optional(),
});

async function getEnabledPaymentMethods(): Promise<string[]> {
  const s = await getCachedSettings();
  const methods: string[] = [];
  if ((s["jazzcash_enabled"] ?? "off") === "on") methods.push("jazzcash");
  if ((s["easypaisa_enabled"] ?? "off") === "on") methods.push("easypaisa");
  if ((s["bank_enabled"] ?? "off") === "on") methods.push("bank");
  return methods;
}

function broadcastWalletUpdate(userId: string, newBalance: number) {
  const io = getIO();
  if (!io) return;
  io.to(`user:${userId}`).emit("wallet:update", { balance: newBalance });
}

const router: IRouter = Router();

router.use(paymentLimiter);

/* ── deriveStatus — reads structured status prefix stored at the start of reference ──
   Format: "<status>:<rest>" where status is one of: approved | rejected | pending
   This is robust against admin note text that might contain the word "approved" etc. */
function deriveStatus(reference: string | null): "pending" | "approved" | "rejected" {
  const ref = (reference ?? "").split(":")[0] ?? "";
  if (ref === "approved") return "approved";
  if (ref === "rejected") return "rejected";
  return "pending";
}

function mapTx(t: typeof walletTransactionsTable.$inferSelect) {
  return {
    id: t.id,
    type: t.type,
    amount: parseFloat(t.amount),
    description: t.description,
    reference: t.reference,
    status: deriveStatus(t.reference),
    createdAt: t.createdAt.toISOString(),
  };
}

function isWalletFrozen(user: { blockedServices: string }): boolean {
  return (user.blockedServices || "").split(",").map(s => s.trim()).filter(Boolean).includes("wallet");
}

/* ── GET /wallet ─────────────────────────────────────────────────────────── */
router.get("/", customerAuth, async (req, res) => {
  const userId = req.customerId!;

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }

    if (isWalletFrozen(user)) { sendForbidden(res, "wallet_frozen", "Your wallet has been temporarily frozen. Contact support."); return; }

    const { buildCursorPage, decodeCursor } = await import("../lib/pagination/cursor.js");
    const limit  = Math.min(parseInt(String(req.query["limit"] || "50")), 200);
    const after  = req.query["after"] as string | undefined;
    const cursor = after ? decodeCursor(after) : null;

    const rows = await db
      .select()
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.userId, userId),
        ...(cursor ? [sql`${walletTransactionsTable.createdAt} < ${cursor}::timestamptz`] : []),
      ))
      .orderBy(desc(walletTransactionsTable.createdAt))
      .limit(limit + 1);

    const page = buildCursorPage({
      data: rows,
      limit,
      getCursorValue: (t) => t.createdAt.toISOString(),
    });

    sendSuccess(res, {
      balance: parseFloat(user.walletBalance ?? "0"),
      transactions: page.data.map(mapTx),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      pinSetup: !!user.walletPinHash,
      walletHidden: !!user.walletHidden,
    });
  } catch (e: unknown) {
    logger.error("[wallet GET /] DB error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── POST /wallet/topup — ADMIN ONLY ────────────────────────────────────────
   Restricted to admin panel. Uses centralized adminAuth middleware.
   Body: { userId, amount, method? }
   Customers cannot self-credit — all credits must go through payment verification.
─────────────────────────────────────────────────────────────────────────── */
router.post("/topup", adminAuth, async (req, res) => {

  const { userId, amount, method } = req.body;
  if (!userId) { sendValidationError(res, "userId required"); return; }
  if (!amount) { sendValidationError(res, "amount required"); return; }

  const topupAmt = parseFloat(amount);
  if (isNaN(topupAmt) || !isFinite(topupAmt) || topupAmt <= 0) {
    sendValidationError(res, "Invalid amount"); return;
  }
  if (!hasValidDecimalPrecision(topupAmt)) {
    sendValidationError(res, "Amount must have at most 2 decimal places"); return;
  }

  const s = await getCachedSettings();
  const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
  const minTopup      = parseFloat(s["wallet_min_topup"]   ?? "100");
  const maxTopup      = parseFloat(s["wallet_max_topup"]   ?? "25000");
  const maxBalance    = parseFloat(s["wallet_max_balance"] ?? "50000");

  if (!walletEnabled) {
    sendError(res, "Wallet service is currently disabled", 503); return;
  }
  if (topupAmt < minTopup) {
    sendValidationError(res, `Minimum top-up is Rs. ${minTopup}`); return;
  }
  if (topupAmt > maxTopup) {
    sendValidationError(res, `Maximum single top-up is Rs. ${maxTopup}`); return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      /* Lock the user row for update to prevent concurrent top-up races */
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1).for("update");
      if (!user) throw new Error("User not found");

      /* Atomic conditional increment: only succeeds if balance + amount <= maxBalance.
         The WHERE clause is the enforcement gate; the pre-check above is an early exit
         for a clearer error message. Both must agree to prevent overflow. */
      const currentBalance = parseFloat(user.walletBalance ?? "0");
      if (currentBalance + topupAmt > maxBalance) {
        throw new Error(`Wallet balance limit is Rs. ${maxBalance}. Current: Rs. ${currentBalance}`);
      }

      const [updated] = await tx.update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${topupAmt.toFixed(2)}` })
        .where(and(eq(usersTable.id, userId), sql`CAST(wallet_balance AS numeric) + ${topupAmt} <= ${maxBalance}`))
        .returning({ walletBalance: usersTable.walletBalance });
      if (!updated) throw new Error(`Wallet balance limit is Rs. ${maxBalance}. Top-up would exceed the limit.`);

      await tx.insert(walletTransactionsTable).values({
        id: generateId(), userId, type: "credit",
        amount: topupAmt.toFixed(2),
        description: method ? `Wallet top-up via ${method}` : "Wallet top-up",
      });
      return parseFloat(updated.walletBalance ?? "0");
    });

    broadcastWalletUpdate(userId, result);
    const io = getIO();
    if (io) io.to("admin-fleet").emit("wallet:admin-topup", { userId, amount: topupAmt, balance: result, method: method || "admin_topup" });
    addAuditEntry({ action: "wallet_topup", adminId: req.adminId, ip: getClientIp(req), details: `Admin topup Rs. ${topupAmt} via ${method || "admin_topup"} for user ${userId}`, result: "success", affectedUserId: userId });
    const transactions = await db.select().from(walletTransactionsTable).where(eq(walletTransactionsTable.userId, userId));
    sendSuccess(res, { balance: result, transactions: transactions.map(mapTx) });
  } catch (e: unknown) {
    const msg = (e as Error).message ?? "";
    /* Known business rule errors bubble up as-is; unexpected errors are sanitized */
    if (msg.startsWith("Wallet balance limit") || msg === "User not found") {
      sendValidationError(res, msg);
    } else {
      logger.error("[wallet /topup] Unexpected error:", e);
      sendError(res, "Something went wrong, please try again.", 500);
    }
  }
});

/* ... Rest of the file ... */
export default router;
