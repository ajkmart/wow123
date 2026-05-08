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
    addAuditEntry({ action: "wallet_topup", adminId: (req as any).adminId, ip: getClientIp(req), details: `Admin topup Rs. ${topupAmt} via ${method || "admin_topup"} for user ${userId}`, result: "success", affectedUserId: userId });
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

/* ── POST /wallet/deposit — Submit a manual deposit request (customer) ───── */
router.post("/deposit", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  const ip = getClientIp(req);

  const depositLimit = await checkAvailableRateLimit(`deposit:${ip}:${userId}`, 10, 15);
  if (depositLimit.limited) {
    sendError(res, `Too many deposit requests. Try again in ${depositLimit.minutesLeft} minute(s).`, 429); return;
  }

  try {
    const [depositUser] = await db.select({ blockedServices: usersTable.blockedServices }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (depositUser && isWalletFrozen(depositUser)) { sendForbidden(res, "wallet_frozen", "Your wallet has been temporarily frozen. Contact support."); return; }
  } catch (e: unknown) {
    logger.error("[wallet /deposit] DB error checking frozen:", e);
    sendError(res, "Something went wrong, please try again.", 500); return;
  }

  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid input";
    sendValidationError(res, firstError); return;
  }

  const { amount: amt, paymentMethod, transactionId, idempotencyKey, accountNumber, note } = parsed.data;

  const enabledMethods = await getEnabledPaymentMethods();
  if (!enabledMethods.includes(paymentMethod)) {
    sendValidationError(res, `Payment method '${paymentMethod}' is not currently enabled`); return;
  }

  const idemResult = await acquireWalletIdempotency(userId, "deposit", idempotencyKey);
  if (!idemResult.acquired) {
    if (idemResult.action === "replay") {
      res.status(idemResult.statusCode ?? 200).json(idemResult.body);
      return;
    }
    sendError(res, "Duplicate request — this deposit is already being processed.", 409);
    return;
  }

  /* ── Duplicate Transaction ID check ──
     Normalize TxID (trim + uppercase) both on check and on storage
     to prevent bypass via whitespace/casing variations. */
  const normalizedTxId = transactionId.trim().toUpperCase().replace(/\s+/g, "");
  if (!normalizedTxId) {
    await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
    sendValidationError(res, "transactionId cannot be empty"); return;
  }

  const txidSuffix = `:txid:${normalizedTxId}`;
  try {
    const existingDeposit = await db.select({ id: walletTransactionsTable.id })
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.type, "deposit"),
        sql`${walletTransactionsTable.reference} LIKE ${'%' + txidSuffix}`,
        sql`RIGHT(${walletTransactionsTable.reference}, ${txidSuffix.length}) = ${txidSuffix}`,
      ))
      .limit(1);

    if (existingDeposit.length > 0) {
      await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
      sendError(res, "This Transaction ID has already been used. Please check your transaction history or use a different TxID.", 409);
      return;
    }
  } catch (e: unknown) {
    await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
    logger.error("[wallet /deposit] DB error checking duplicate TxID:", e);
    sendError(res, "Something went wrong, please try again.", 500); return;
  }

  const s = await getCachedSettings();
  const walletEnabled = (s["feature_wallet"] ?? "on") === "on";
  const minTopup      = parseFloat(s["wallet_min_topup"]   ?? "100");
  const maxTopup      = parseFloat(s["wallet_max_topup"]   ?? "25000");
  const autoApproveThreshold = Math.max(0, parseFloat(s["wallet_deposit_auto_approve"] ?? "0"));

  if (!walletEnabled) { await deleteWalletIdempotency(userId, "deposit", idempotencyKey); sendError(res, "Wallet service is currently disabled", 503); return; }
  if (amt < minTopup) { await deleteWalletIdempotency(userId, "deposit", idempotencyKey); sendValidationError(res, `Minimum deposit is Rs. ${minTopup}`); return; }
  if (amt > maxTopup) { await deleteWalletIdempotency(userId, "deposit", idempotencyKey); sendValidationError(res, `Maximum single deposit is Rs. ${maxTopup}`); return; }

  /* ── KYC gating for deposits (admin Setting: wallet_kyc_required) ── */
  if ((s["wallet_kyc_required"] ?? "off") === "on") {
    const [kycRow] = await db.select({ kycStatus: usersTable.kycStatus }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!kycRow || kycRow.kycStatus !== "verified") {
      await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
      sendForbidden(res, "kyc_required", "KYC verification is required before you can top up your wallet. Please complete KYC from your profile.");
      return;
    }
  }

  const txId = generateId();
  const desc = [
    `Manual deposit — ${paymentMethod}`,
    transactionId ? `TxID: ${transactionId}` : null,
    accountNumber ? `Sender: ${accountNumber}` : null,
    note ? `Note: ${note}` : null,
  ].filter(Boolean).join(" · ");

  const shouldAutoApprove = autoApproveThreshold > 0 && amt <= autoApproveThreshold;

  if (shouldAutoApprove) {
    const maxBalance = parseFloat(s["wallet_max_balance"] ?? "50000");

    try {
      await db.transaction(async (tx) => {
        /* Lock the user row to prevent concurrent deposits from racing past the balance cap */
        const [lockedUser] = await tx.select({ id: usersTable.id, walletBalance: usersTable.walletBalance })
          .from(usersTable).where(eq(usersTable.id, userId)).limit(1).for("update");
        if (!lockedUser) throw new Error("User not found");

        /* Atomic conditional credit: only succeeds if resulting balance stays within cap */
        const [credited] = await tx.update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${amt.toFixed(2)}` })
          .where(and(eq(usersTable.id, userId), sql`CAST(wallet_balance AS numeric) + ${amt} <= ${maxBalance}`))
          .returning({ walletBalance: usersTable.walletBalance });
        if (!credited) {
          throw new Error(`Wallet limit (Rs. ${maxBalance}) exceed ho jayega. Deposit nahi ho sakta.`);
        }

        await tx.insert(walletTransactionsTable).values({
          id: txId, userId, type: "deposit",
          amount: amt.toFixed(2),
          description: desc,
          reference: `approved:auto:txid:${normalizedTxId}`,
          paymentMethod,
        });
      });
    } catch (e: unknown) {
      await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
      const msg = (e as Error).message ?? "";
      if (msg.startsWith("Wallet limit")) {
        sendValidationError(res, msg);
      } else {
        logger.error("[wallet /deposit auto-approve] DB error:", e);
        sendError(res, "Something went wrong, please try again.", 500);
      }
      return;
    }

    const depositLang = await getUserLanguage(userId);
    await db.insert(notificationsTable).values({
      id: generateId(), userId,
      title: t("notifWalletCredited", depositLang) + " ✅",
      body: t("notifWalletCreditedBody", depositLang).replace("{amount}", amt.toFixed(0)),
      type: "wallet", icon: "wallet-outline",
    }).catch(e => logger.error("customer deposit notif insert failed:", e));

    const [freshUser] = await db.select({ walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (freshUser) broadcastWalletUpdate(userId, parseFloat(freshUser.walletBalance ?? "0"));

    addAuditEntry({ action: "wallet_deposit_approved", ip: getClientIp(req), details: `Auto-approved deposit Rs. ${amt} via ${paymentMethod} (txId: ${txId})`, result: "success", affectedUserId: userId });
    const autoBody = { txId, status: "approved:auto", amount: amt };
    await resolveWalletIdempotency(userId, "deposit", idempotencyKey, 200, autoBody);
    sendSuccess(res, autoBody);
  } else {
    try {
      await db.insert(walletTransactionsTable).values({
        id: txId, userId, type: "deposit",
        amount: amt.toFixed(2),
        description: desc,
        reference: `pending:txid:${normalizedTxId}`,
        paymentMethod,
      });
    } catch (e: unknown) {
      await deleteWalletIdempotency(userId, "deposit", idempotencyKey);
      logger.error("[wallet /deposit pending] DB error:", e);
      sendError(res, "Something went wrong, please try again.", 500); return;
    }

    const pendingLang = await getUserLanguage(userId);
    await db.insert(notificationsTable).values({
      id: generateId(), userId,
      title: t("notifWalletPending", pendingLang) + " ✅",
      body: t("notifWalletPendingBody", pendingLang).replace("{amount}", amt.toFixed(0)),
      type: "wallet", icon: "wallet-outline",
    }).catch(e => logger.error("customer deposit notif insert failed:", e));

    addAuditEntry({ action: "wallet_deposit_pending", ip: getClientIp(req), details: `Deposit queued for review Rs. ${amt} via ${paymentMethod} (txId: ${txId})`, result: "pending", affectedUserId: userId });
    const pendingBody = { txId, status: "pending", amount: amt };
    await resolveWalletIdempotency(userId, "deposit", idempotencyKey, 202, pendingBody);
    sendAccepted(res, pendingBody);
  }
});

/* ── GET /wallet/deposits — Customer deposit history ────────────────────── */
router.get("/deposits", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const deposits = await db.select()
      .from(walletTransactionsTable)
      .where(and(eq(walletTransactionsTable.userId, userId), eq(walletTransactionsTable.type, "deposit")))
      .orderBy(desc(walletTransactionsTable.createdAt));

    const mapped = deposits.map(d => {
      const ref = d.reference ?? "pending";
      const isPending = ref === "pending" || ref.startsWith("pending:");
      const status = isPending ? "pending" : ref.startsWith("approved:") ? "approved" : ref.startsWith("rejected:") ? "rejected" : ref;
      const refNo = ref.startsWith("approved:") || ref.startsWith("rejected:") ? ref.split(":").slice(1).join(":") : "";
      return { ...d, amount: parseFloat(String(d.amount)), status, refNo };
    });

    sendSuccess(res, { deposits: mapped });
  } catch (e: unknown) {
    logger.error("[wallet /deposits] DB error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── POST /wallet/resolve-phone — resolve by phone OR AJK ID ────────────── */
const resolvePhoneSchema = z.object({
  phone: z.string().optional().transform(v => {
    if (!v) return undefined;
    const trimmed = v.trim();
    if (/^03\d{9}$/.test(trimmed)) return trimmed.slice(1);
    return trimmed;
  }),
  ajkId: z.string().optional(),
}).refine(d => d.phone || d.ajkId, { message: "phone or ajkId is required" });

router.post("/resolve-phone", customerAuth, async (req, res) => {
  const parsed = resolvePhoneSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid input";
    sendValidationError(res, firstError); return;
  }

  const userId = req.customerId!;
  const resolveLimit = await checkAvailableRateLimit(`resolve-phone:${userId}`, 10, 1);
  if (resolveLimit.limited) {
    sendError(res, `Too many lookup requests. Try again in ${resolveLimit.minutesLeft} minute(s).`, 429); return;
  }

  try {
    const { phone, ajkId } = parsed.data;
    let user: { name: string | null; phone: string | null; ajkId: string | null } | undefined;
    if (ajkId) {
      const [found] = await db.select({ name: usersTable.name, phone: usersTable.phone, ajkId: usersTable.ajkId })
        .from(usersTable).where(eq(usersTable.ajkId, ajkId.trim().toUpperCase())).limit(1);
      user = found;
    } else if (phone) {
      const normalized = phone.startsWith("0") ? phone.slice(1) : phone;
      const [found] = await db.select({ name: usersTable.name, phone: usersTable.phone, ajkId: usersTable.ajkId })
        .from(usersTable).where(eq(usersTable.phone, normalized)).limit(1);
      user = found;
    }
    if (!user) { sendSuccess(res, { found: false, name: null }); return; }
    sendSuccess(res, { found: true, name: user.name || null, phone: user.phone, ajkId: user.ajkId });
  } catch (e: unknown) {
    logger.error("[wallet /resolve-phone] DB error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── POST /wallet/send ───────────────────────────────────────────────────── */
router.post("/send", customerAuth, requireWalletPin, async (req, res) => {
  const senderUserId = req.customerId!;

  const sendRateLimit = await checkAvailableRateLimit(`send:${senderUserId}`, 5, 1);
  if (sendRateLimit.limited) {
    sendError(res, `Too many transfer requests. Try again in ${sendRateLimit.minutesLeft} minute(s).`, 429); return;
  }

  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid input";
    sendValidationError(res, firstError); return;
  }

  const { receiverPhone: rawPhone, ajkId: rawAjkId, amount: sendAmt, note } = parsed.data;

  /* Idempotency for /send — accept key from Idempotency-Key header (preferred) or body field */
  const idempotencyKey =
    (req.headers["idempotency-key"] as string | undefined) ??
    (typeof req.body["idempotencyKey"] === "string" ? req.body["idempotencyKey"] : undefined);

  if (idempotencyKey) {
    const idemResult = await acquireWalletIdempotency(senderUserId, "send", idempotencyKey);
    if (!idemResult.acquired) {
      if (idemResult.action === "replay") {
        res.status(idemResult.statusCode ?? 200).json(idemResult.body);
        return;
      }
      sendError(res, "Duplicate request — this transfer is already being processed.", 409);
      return;
    }
  }

  const s = await getCachedSettings();
  const walletEnabled  = (s["feature_wallet"]      ?? "on") === "on";
  const p2pEnabled     = (s["wallet_p2p_enabled"]   ?? "on") === "on";
  const minWithdrawal  = parseFloat(s["wallet_min_withdrawal"]   ?? "200");
  const maxWithdrawal  = parseFloat(s["wallet_max_withdrawal"]   ?? "10000");
  const dailyLimit     = parseFloat(s["wallet_daily_limit"]      ?? "20000");
  const p2pDailyLimit  = parseFloat(s["wallet_p2p_daily_limit"]  ?? "10000");
  const p2pFeePct      = Math.max(0, Math.min(50, parseFloat(s["wallet_p2p_fee_pct"] ?? "0")));

  const clearKey = async () => { if (idempotencyKey) await deleteWalletIdempotency(senderUserId, "send", idempotencyKey); };

  if (!p2pEnabled) {
    await clearKey();
    sendForbidden(res, "P2P money transfers are currently disabled by admin."); return;
  }
  if (!walletEnabled) {
    await clearKey();
    sendError(res, "Wallet service is currently disabled", 503); return;
  }
  if (sendAmt < minWithdrawal) {
    await clearKey();
    sendValidationError(res, `Minimum transfer is Rs. ${minWithdrawal}`); return;
  }
  if (sendAmt > maxWithdrawal) {
    await clearKey();
    sendValidationError(res, `Maximum single transfer is Rs. ${maxWithdrawal}`); return;
  }

  /* ── KYC gating for P2P transfers (admin Setting: wallet_kyc_required) ── */
  if ((s["wallet_kyc_required"] ?? "off") === "on") {
    const [kycRow] = await db.select({ kycStatus: usersTable.kycStatus }).from(usersTable).where(eq(usersTable.id, senderUserId)).limit(1);
    if (!kycRow || kycRow.kycStatus !== "verified") {
      await clearKey();
      sendForbidden(res, "kyc_required", "KYC verification is required before you can transfer money. Please complete KYC from your profile.");
      return;
    }
  }

  const maxBalance = parseFloat(s["wallet_max_balance"] ?? "50000");

  const autoFlagThreshold = parseFloat(s["wallet_p2p_auto_flag_amount"] ?? "5000");

  try {
    /* Resolve receiver by AJK ID or phone */
    let receiverPre: { id: string; name: string | null; phone: string | null; ajkId: string | null; blockedServices: string } | undefined;
    if (rawAjkId) {
      const [found] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, ajkId: usersTable.ajkId, blockedServices: usersTable.blockedServices })
        .from(usersTable).where(eq(usersTable.ajkId, rawAjkId.trim().toUpperCase())).limit(1);
      receiverPre = found;
    } else {
      const normalizedPhone = rawPhone!.trim().startsWith("0") ? rawPhone!.trim().slice(1) : rawPhone!.trim();
      const [found] = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, ajkId: usersTable.ajkId, blockedServices: usersTable.blockedServices })
        .from(usersTable).where(eq(usersTable.phone, normalizedPhone)).limit(1);
      receiverPre = found;
    }
    const receiverPhone = receiverPre?.phone ?? rawPhone ?? "";
    if (!receiverPre) { await clearKey(); sendNotFound(res, rawAjkId ? `No account found with AJK ID ${rawAjkId}` : "Receiver not found. Phone number check karein."); return; }
    if (receiverPre.id === senderUserId) { await clearKey(); sendValidationError(res, "Apne aap ko transfer nahi kar sakte"); return; }
    if (isWalletFrozen(receiverPre)) { await clearKey(); sendErrorWithData(res, "Receiver's wallet is currently frozen. Transfer cannot be completed.", { walletFrozen: true }, 403); return; }
    /* P2P-specific freeze: check blockedServices for "wallet_p2p" */
    if (receiverPre.blockedServices?.split(",").map(s => s.trim()).includes("wallet_p2p")) { await clearKey(); sendErrorWithData(res, "Receiver's P2P transfers are restricted.", { walletFrozen: true }, 403); return; }

    const result = await db.transaction(async (tx) => {
      /* Lock sender row first */
      const [sender] = await tx.select().from(usersTable).where(eq(usersTable.id, senderUserId)).limit(1).for("update");
      if (!sender) throw new Error("Sender not found");
      if (isWalletFrozen(sender)) throw Object.assign(new Error("Your wallet has been temporarily frozen. Contact support."), { walletFrozen: true });
      /* P2P-specific freeze for sender */
      if (sender.blockedServices?.split(",").map((x: string) => x.trim()).includes("wallet_p2p")) throw Object.assign(new Error("Your P2P transfers have been restricted. Please contact support."), { walletFrozen: true });

      /* Re-validate frozen check inside transaction so mid-flight admin freeze is caught */
      if (isWalletFrozen(sender)) {
        throw Object.assign(new Error("Your wallet has been temporarily frozen. Contact support."), { walletFrozen: "sender" });
      }

      const feeAmt = p2pFeePct > 0 ? Math.round(sendAmt * p2pFeePct) / 100 : 0;
      const totalDebit = sendAmt + feeAmt;

      const senderBalance = parseFloat(sender.walletBalance ?? "0");
      if (senderBalance < totalDebit) throw new Error(feeAmt > 0 ? `Insufficient balance. Amount Rs. ${sendAmt} + Fee Rs. ${feeAmt.toFixed(2)} = Rs. ${totalDebit.toFixed(2)}` : "Insufficient wallet balance");

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const [todayDebits] = await tx
        .select({ total: sum(walletTransactionsTable.amount) })
        .from(walletTransactionsTable)
        .where(and(
          eq(walletTransactionsTable.userId, senderUserId),
          eq(walletTransactionsTable.type, "debit"),
          gte(walletTransactionsTable.createdAt, todayStart),
        ));
      const todayTotal = parseFloat(String(todayDebits?.total ?? "0")) || 0;
      if (todayTotal + totalDebit > p2pDailyLimit) {
        throw new Error(`Daily P2P transfer limit is Rs. ${p2pDailyLimit}. Aaj Rs. ${todayTotal.toFixed(0)} transfer ho chuke hain.`);
      }
      if (todayTotal + totalDebit > dailyLimit) {
        throw new Error(`Daily wallet limit is Rs. ${dailyLimit}. Aaj aap ne Rs. ${todayTotal.toFixed(0)} kharch kiye hain.`);
      }

      /* Lock receiver row before any read/write */
      const [receiver] = await tx.select().from(usersTable).where(eq(usersTable.id, receiverPre.id)).limit(1).for("update");
      if (!receiver) throw new Error("Receiver not found");
      if (isWalletFrozen(receiver)) throw Object.assign(new Error("Receiver's wallet is currently frozen. Transfer cannot be completed."), { walletFrozen: "receiver" });

      const [deducted] = await tx.update(usersTable)
        .set({ walletBalance: sql`wallet_balance - ${totalDebit.toFixed(2)}` })
        .where(and(eq(usersTable.id, senderUserId), gte(usersTable.walletBalance, totalDebit.toFixed(2))))
        .returning({ walletBalance: usersTable.walletBalance });
      if (!deducted) throw new Error("Insufficient wallet balance");

      const [credited] = await tx.update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${sendAmt.toFixed(2)}` })
        .where(and(eq(usersTable.id, receiver.id), sql`CAST(wallet_balance AS numeric) + ${sendAmt} <= ${maxBalance}`))
        .returning({ walletBalance: usersTable.walletBalance });
      if (!credited) {
        throw new Error(`Receiver wallet limit (Rs. ${maxBalance}) exceed ho jayega. Transfer nahi ho sakta.`);
      }

      const displayReceiver = rawAjkId ? `${rawAjkId} (${receiverPhone})` : receiverPhone;
      const displaySender   = rawAjkId ? sender.phone : sender.phone;
      const desc    = note ? `Transfer to ${displayReceiver} — ${note}` : `Transfer to ${displayReceiver}`;
      const recvDesc = note ? `Received from ${displaySender} — ${note}` : `Received from ${displaySender}`;

      const shouldFlag = sendAmt >= autoFlagThreshold;
      const debitId  = generateId();
      const creditId = generateId();

      await tx.execute(sql`
        INSERT INTO wallet_transactions (id, user_id, type, amount, description, peer_id, peer_phone, flagged)
        VALUES (${debitId}, ${senderUserId}, 'debit', ${sendAmt.toFixed(2)}, ${desc}, ${receiver.id}, ${receiverPhone}, ${shouldFlag})
      `);
      await tx.execute(sql`
        INSERT INTO wallet_transactions (id, user_id, type, amount, description, peer_id, peer_phone, flagged)
        VALUES (${creditId}, ${receiver.id}, 'credit', ${sendAmt.toFixed(2)}, ${recvDesc}, ${senderUserId}, ${sender.phone}, ${shouldFlag})
      `);

      if (feeAmt > 0) {
        await tx.insert(walletTransactionsTable).values({
          id: generateId(), userId: senderUserId, type: "debit",
          amount: feeAmt.toFixed(2), description: `P2P Transfer Fee (${p2pFeePct}%)`,
        });
      }

      return { newBalance: parseFloat(deducted.walletBalance ?? "0"), receiverName: receiver.name || receiverPhone, receiverId: receiver.id, senderName: sender.name || sender.phone, amount: sendAmt, fee: feeAmt };
    });

    broadcastWalletUpdate(senderUserId, result.newBalance);
    const [rcvBal] = await db.select({ walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.id, result.receiverId)).limit(1);
    if (rcvBal) broadcastWalletUpdate(result.receiverId, parseFloat(rcvBal.walletBalance ?? "0"));

    const sendLang = await getUserLanguage(result.receiverId);
    db.insert(notificationsTable).values({
      id: generateId(), userId: result.receiverId,
      title: t("notifWalletCredited", sendLang) + " 💰",
      body: t("notifWalletReceivedBody", sendLang).replace("{amount}", result.amount.toFixed(0)).replace("{sender}", result.senderName ?? ""),
      type: "wallet", icon: "wallet-outline",
    }).catch(e => logger.error("receiver send notif insert failed:", e));

    const { receiverId: _rid, senderName: _sn, ...responseData } = result;
    addAuditEntry({ action: "wallet_send", ip: getClientIp(req), details: `P2P transfer Rs. ${result.amount}${result.fee > 0 ? ` + fee Rs. ${result.fee}` : ""} to ${result.receiverId}`, result: "success", affectedUserId: senderUserId });
    if (idempotencyKey) await resolveWalletIdempotency(senderUserId, "send", idempotencyKey, 200, responseData);
    sendSuccess(res, responseData);
  } catch (e: unknown) {
    await clearKey();
    const err = e as any;
    if (err.walletFrozen === "sender") {
      sendForbidden(res, "wallet_frozen", err.message); return;
    }
    if (err.walletFrozen === "receiver") {
      sendErrorWithData(res, err.message, { walletFrozen: true }, 403); return;
    }
    const knownErrors = [
      "Insufficient", "Daily", "Sender not found", "Receiver not found",
      "limit", "Apne aap", "transfer nahi"
    ];
    const isKnown = knownErrors.some(k => (err.message ?? "").includes(k));
    if (isKnown) {
      sendValidationError(res, err.message);
    } else {
      logger.error("[wallet /send] Unexpected error:", e);
      sendError(res, "Something went wrong, please try again.", 500);
    }
  }
});

/* ── GET /wallet/deposit-methods — Dynamic deposit methods from admin settings ── */
router.get("/deposit-methods", customerAuth, async (_req, res) => {
  try {
    const s = await getCachedSettings();
    const methods: Array<Record<string, unknown>> = [];

    if ((s["jazzcash_enabled"] ?? "off") === "on") {
      const jcType = s["jazzcash_type"] ?? "manual";
      const entry: Record<string, unknown> = {
        id: "jazzcash",
        label: "JazzCash",
        logo: "jazzcash",
        available: true,
        mode: jcType === "api" ? (s["jazzcash_mode"] ?? "sandbox") : "manual",
        type: jcType,
        description: "JazzCash mobile wallet",
        proofRequired: (s["jazzcash_proof_required"] ?? "off") === "on",
        minAmount: parseFloat(s["jazzcash_min_amount"] ?? "10"),
        maxAmount: parseFloat(s["jazzcash_max_amount"] ?? "100000"),
      };
      if (jcType === "manual") {
        entry["manualName"] = s["jazzcash_manual_name"] ?? "";
        entry["manualNumber"] = s["jazzcash_manual_number"] ?? "";
        entry["manualInstructions"] = s["jazzcash_manual_instructions"] ?? "Number par payment bhejein aur transaction ID hum se share karein.";
      }
      methods.push(entry);
    }

    if ((s["easypaisa_enabled"] ?? "off") === "on") {
      const epType = s["easypaisa_type"] ?? "manual";
      const entry: Record<string, unknown> = {
        id: "easypaisa",
        label: "EasyPaisa",
        logo: "easypaisa",
        available: true,
        mode: epType === "api" ? (s["easypaisa_mode"] ?? "sandbox") : "manual",
        type: epType,
        description: "EasyPaisa mobile wallet",
        proofRequired: (s["easypaisa_proof_required"] ?? "off") === "on",
        minAmount: parseFloat(s["easypaisa_min_amount"] ?? "10"),
        maxAmount: parseFloat(s["easypaisa_max_amount"] ?? "100000"),
      };
      if (epType === "manual") {
        entry["manualName"] = s["easypaisa_manual_name"] ?? "";
        entry["manualNumber"] = s["easypaisa_manual_number"] ?? "";
        entry["manualInstructions"] = s["easypaisa_manual_instructions"] ?? "Number par payment bhejein aur transaction ID share karein.";
      }
      methods.push(entry);
    }

    if ((s["bank_enabled"] ?? "off") === "on") {
      methods.push({
        id: "bank",
        label: "Bank Transfer",
        logo: "bank",
        available: true,
        mode: "manual",
        type: "manual",
        description: "Direct bank account transfer",
        bankName: s["bank_name"] ?? "",
        accountTitle: s["bank_account_title"] ?? "",
        accountNumber: s["bank_account_number"] ?? "",
        iban: s["bank_iban"] ?? "",
        branchCode: s["bank_branch_code"] ?? "",
        swiftCode: s["bank_swift_code"] ?? "",
        instructions: s["bank_instructions"] ?? "Bank account mein transfer karein aur receipt hum se share karein.",
        proofRequired: (s["bank_proof_required"] ?? "on") === "on",
        minAmount: parseFloat(s["bank_min_amount"] ?? "0"),
        processingHours: parseInt(s["bank_processing_hours"] ?? "24"),
      });
    }

    sendSuccess(res, { methods });
  } catch (e: unknown) {
    logger.error("[wallet /deposit-methods] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

router.get("/withdrawal-methods", customerAuth, async (_req, res) => {
  try {
    const s = await getCachedSettings();
    const methods: Array<{ id: string; label: string; placeholder: string }> = [];
    if ((s["jazzcash_enabled"] ?? "off") === "on") {
      methods.push({ id: "jazzcash", label: "JazzCash", placeholder: "03XX-XXXXXXX" });
    }
    if ((s["easypaisa_enabled"] ?? "off") === "on") {
      methods.push({ id: "easypaisa", label: "EasyPaisa", placeholder: "03XX-XXXXXXX" });
    }
    if ((s["bank_enabled"] ?? "off") === "on") {
      methods.push({ id: "bank", label: "Bank Transfer", placeholder: "PKXX XXXX XXXX XXXX XXXX (IBAN)" });
    }
    sendSuccess(res, { methods });
  } catch (e: unknown) {
    logger.error("[wallet /withdrawal-methods] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── POST /wallet/withdraw — Customer requests a withdrawal ─────────────── */
router.post("/withdraw", customerAuth, requireWalletPin, async (req, res) => {
  const userId = req.customerId!;

  const withdrawRateLimit = await checkAvailableRateLimit(`withdraw:${userId}`, 3, 10);
  if (withdrawRateLimit.limited) {
    sendError(res, `Too many withdrawal requests. Try again in ${withdrawRateLimit.minutesLeft} minute(s).`, 429); return;
  }

  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid input";
    sendValidationError(res, firstError); return;
  }

  const { amount: amt, paymentMethod, accountNumber, note } = parsed.data;

  const enabledWithdrawMethods = await getEnabledPaymentMethods();
  if (!enabledWithdrawMethods.includes(paymentMethod)) {
    sendValidationError(res, `Withdrawal method '${paymentMethod}' is not currently enabled`); return;
  }

  /* Idempotency for /withdraw — accept key from Idempotency-Key header (preferred) or body field */
  const idempotencyKey =
    (req.headers["idempotency-key"] as string | undefined) ??
    (typeof req.body["idempotencyKey"] === "string" ? req.body["idempotencyKey"] : undefined);

  if (idempotencyKey) {
    const idemResult = await acquireWalletIdempotency(userId, "withdraw", idempotencyKey);
    if (!idemResult.acquired) {
      if (idemResult.action === "replay") {
        res.status(idemResult.statusCode ?? 200).json(idemResult.body);
        return;
      }
      sendError(res, "Duplicate request — this withdrawal is already being processed.", 409);
      return;
    }
  }

  const clearKey = async () => { if (idempotencyKey) await deleteWalletIdempotency(userId, "withdraw", idempotencyKey); };

  let withdrawUser: { blockedServices: string; walletBalance: string } | undefined;
  try {
    const [u] = await db.select({ blockedServices: usersTable.blockedServices, walletBalance: usersTable.walletBalance })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!u) { await clearKey(); sendNotFound(res, "User not found"); return; }
    withdrawUser = u;
  } catch (e: unknown) {
    await clearKey();
    logger.error("[wallet /withdraw] DB error fetching user:", e);
    sendError(res, "Something went wrong, please try again.", 500); return;
  }

  if (isWalletFrozen(withdrawUser)) { await clearKey(); sendForbidden(res, "wallet_frozen", "Your wallet has been temporarily frozen. Contact support."); return; }

  const s = await getCachedSettings();
  const walletEnabled  = (s["feature_wallet"]        ?? "on") === "on";
  const minWithdrawal  = parseFloat(s["wallet_min_withdrawal"] ?? "200");
  const maxWithdrawal  = parseFloat(s["wallet_max_withdrawal"] ?? "10000");

  if (!walletEnabled) { await clearKey(); sendError(res, "Wallet service is currently disabled", 503); return; }
  if (amt < minWithdrawal) { await clearKey(); sendValidationError(res, `Minimum withdrawal is Rs. ${minWithdrawal}`); return; }
  if (amt > maxWithdrawal) { await clearKey(); sendValidationError(res, `Maximum single withdrawal is Rs. ${maxWithdrawal}`); return; }

  /* ── KYC gating (admin Setting: wallet_kyc_required) ── */
  if ((s["wallet_kyc_required"] ?? "off") === "on") {
    const [kycRow] = await db.select({ kycStatus: usersTable.kycStatus }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!kycRow || kycRow.kycStatus !== "verified") {
      await clearKey();
      sendForbidden(res, "kyc_required", "KYC verification is required before you can withdraw. Please complete KYC from your profile.");
      return;
    }
  }

  /* ── Daily wallet spend limit (covers both withdrawals and debits) ── */
  const dailyLimit = parseFloat(s["wallet_daily_limit"] ?? "20000");
  if (dailyLimit > 0) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const [todayDebits] = await db
      .select({ total: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.userId, userId),
        sql`${walletTransactionsTable.type} IN ('debit', 'withdrawal')`,
        gte(walletTransactionsTable.createdAt, todayStart),
      ));
    const todayTotal = parseFloat(String(todayDebits?.total ?? "0")) || 0;
    if (todayTotal + amt > dailyLimit) {
      await clearKey();
      sendValidationError(res, `Daily wallet limit is Rs. ${dailyLimit}. Aaj aap ne Rs. ${todayTotal.toFixed(0)} kharch kiye hain.`);
      return;
    }
  }

  const balance = parseFloat(String(withdrawUser.walletBalance ?? "0"));
  if (balance < amt) {
    await clearKey();
    sendValidationError(res, `Insufficient wallet balance. Available: Rs. ${balance.toFixed(0)}`); return;
  }

  const txId = generateId();
  const desc = [
    `Withdrawal request — ${paymentMethod}`,
    `Account: ${accountNumber}`,
    note ? `Note: ${note}` : null,
  ].filter(Boolean).join(" · ");

  try {
    await db.transaction(async (tx) => {
      const [deducted] = await tx.update(usersTable)
        .set({ walletBalance: sql`wallet_balance - ${amt.toFixed(2)}`, updatedAt: new Date() })
        .where(and(eq(usersTable.id, userId), gte(usersTable.walletBalance, amt.toFixed(2))))
        .returning({ id: usersTable.id });
      if (!deducted) throw new Error(`Insufficient wallet balance. Available: Rs. ${balance.toFixed(0)}`);
      await tx.insert(walletTransactionsTable).values({
        id: txId, userId, type: "withdrawal",
        amount: amt.toFixed(2),
        description: desc,
        reference: "pending",
        paymentMethod,
      });
    });
  } catch (e: unknown) {
    await clearKey();
    const msg = (e instanceof Error) ? e.message : "";
    if (msg.startsWith("Insufficient") || msg.includes("frozen") || msg.includes("limit")) {
      sendValidationError(res, msg);
    } else {
      logger.error("[wallet /withdraw] Unexpected error:", e);
      sendError(res, "Something went wrong, please try again.", 500);
    }
    return;
  }

  const withdrawLang = await getUserLanguage(userId);
  await db.insert(notificationsTable).values({
    id: generateId(), userId,
    title: t("notifWithdrawalPending", withdrawLang),
    body: t("notifWithdrawalPendingBody", withdrawLang).replace("{amount}", amt.toFixed(0)),
    type: "wallet", icon: "wallet-outline",
  }).catch(e => logger.error("withdrawal notif insert failed:", e));

  const responseBody = { txId, status: "pending", amount: amt };
  if (idempotencyKey) await resolveWalletIdempotency(userId, "withdraw", idempotencyKey, 200, responseBody);
  sendSuccess(res, responseBody);
});

/* ── POST /wallet/simulate-topup — Customer self-service simulated top-up
   For demo/testing purposes. Allowed amounts: 500, 1000, 2000, 5000 PKR.
   Daily limit: Rs. 10,000. Labeled clearly as simulated.
   Hardened: blocked in IS_PRODUCTION regardless of NODE_ENV.
──────────────────────────────────────────────────────────────────────── */
const SIMULATE_ALLOWED = [500, 1000, 2000, 5000];
const SIMULATE_DAILY_LIMIT = 10000;

router.post("/simulate-topup", customerAuth, async (req, res) => {
  if (IS_PRODUCTION) {
    logger.warn("[SECURITY] /wallet/simulate-topup hit on production instance — blocked");
    sendForbidden(res, "Not available in production"); return;
  }
  const userId = req.customerId!;
  const amount = parseInt(String(req.body["amount"] ?? ""), 10);

  if (!SIMULATE_ALLOWED.includes(amount)) {
    sendValidationError(res, `Invalid amount. Choose from: ${SIMULATE_ALLOWED.join(", ")}`); return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }
    if (isWalletFrozen(user)) { sendForbidden(res, "wallet_frozen", "Your wallet has been temporarily frozen. Contact support."); return; }

    /* Check daily simulated topup total */
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTxns = await db.select({ s: sum(walletTransactionsTable.amount) })
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.userId, userId),
        eq(walletTransactionsTable.type, "simulated_topup"),
        gte(walletTransactionsTable.createdAt, todayStart),
      ));
    const todayTotal = parseFloat(todayTxns[0]?.s ?? "0") || 0;
    if (todayTotal + amount > SIMULATE_DAILY_LIMIT) {
      sendError(res, `Daily simulation limit is Rs. ${SIMULATE_DAILY_LIMIT}. You have Rs. ${SIMULATE_DAILY_LIMIT - todayTotal} remaining today.`, 429); return;
    }

    const newBalance = await db.transaction(async (tx) => {
      const [updated] = await tx.update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${amount}`, updatedAt: new Date() })
        .where(eq(usersTable.id, userId))
        .returning({ walletBalance: usersTable.walletBalance });
      await tx.insert(walletTransactionsTable).values({
        id: generateId(), userId, type: "simulated_topup",
        amount: amount.toFixed(2),
        description: `Simulated top-up — Rs. ${amount} (Demo Mode)`,
        reference: `sim:${Date.now()}`,
        paymentMethod: "simulation",
      });
      return parseFloat(updated?.walletBalance ?? "0");
    });

    broadcastWalletUpdate(userId, newBalance);
    sendSuccess(res, { amount, newBalance });
  } catch (e: unknown) {
    logger.error("[wallet /simulate-topup] Unexpected error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── GET /wallet/pending-topups — Customer pending topup count ────────── */
router.get("/pending-topups", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const pending = await db.select()
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.userId, userId),
        eq(walletTransactionsTable.type, "deposit"),
        sql`(${walletTransactionsTable.reference} = 'pending' OR ${walletTransactionsTable.reference} LIKE 'pending:%')`,
      ));
    sendSuccess(res, { count: pending.length, total: pending.reduce((s, t) => s + parseFloat(t.amount), 0) });
  } catch (e: unknown) {
    logger.error("[wallet /pending-topups] DB error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   MPIN Security System
   ══════════════════════════════════════════════════════════════════════════ */

const MPIN_MAX_ATTEMPTS = 5;
const MPIN_LOCK_DURATION_MS = 30 * 60 * 1000;
const MPIN_BCRYPT_ROUNDS = 10;
const WALLET_ACTION_TOKEN_TTL_SEC = 5 * 60;

const mpinSchema = z.string().regex(/^\d{4}$/, "MPIN must be exactly 4 digits");

const revokedWalletTokens = new Set<string>();

function signWalletActionToken(userId: string): string {
  const jti = generateId();
  return jwt.sign(
    { sub: userId, scope: "wallet-action", jti, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: WALLET_ACTION_TOKEN_TTL_SEC },
  );
}

function verifyWalletActionToken(
  token: string,
  expectedUserId: string,
  pinChangedAt?: Date | null,
): { valid: true; jti: string } | { valid: false; reason: string } {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (payload.scope !== "wallet-action") return { valid: false, reason: "Invalid token scope" };
    if (payload.sub !== expectedUserId) return { valid: false, reason: "Token user mismatch" };
    if (!payload.jti) return { valid: false, reason: "Missing token identifier" };
    if (revokedWalletTokens.has(payload.jti)) return { valid: false, reason: "Token already used" };
    if (pinChangedAt && payload.iat && payload.iat < Math.floor(pinChangedAt.getTime() / 1000)) {
      return { valid: false, reason: "Token issued before PIN change" };
    }
    return { valid: true, jti: payload.jti };
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === "TokenExpiredError") return { valid: false, reason: "Token expired" };
    return { valid: false, reason: "Invalid token" };
  }
}

async function requireWalletPin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.customerId!;

  const s = await getCachedSettings();
  if ((s["wallet_mpin_enabled"] ?? "on") !== "on") {
    next();
    return;
  }

  const [user] = await db.select({
    walletPinHash: usersTable.walletPinHash,
    updatedAt: usersTable.updatedAt,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.walletPinHash) {
    next();
    return;
  }

  const pinToken = req.headers["x-wallet-pin-token"] as string | undefined;
  if (!pinToken) {
    sendForbidden(res, "pin_required", "MPIN verification required for this transaction");
    return;
  }

  const result = verifyWalletActionToken(pinToken, userId, user.updatedAt);
  if (!result.valid) {
    sendForbidden(res, "pin_expired", result.reason === "Token expired"
      ? "MPIN verification expired. Please verify again."
      : `MPIN verification failed: ${result.reason}`);
    return;
  }

  revokedWalletTokens.add(result.jti);
  next();
}

function isWalletPinLocked(user: { walletPinLockedUntil: Date | null }): boolean {
  if (!user.walletPinLockedUntil) return false;
  return user.walletPinLockedUntil.getTime() > Date.now();
}

router.post("/pin/setup", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }
    if (user.walletPinHash) { sendError(res, "MPIN already set. Use change PIN instead.", 409); return; }

    const parsed = mpinSchema.safeParse(req.body.pin);
    if (!parsed.success) { sendValidationError(res, "MPIN must be exactly 4 digits"); return; }

    const hash = await bcrypt.hash(parsed.data, MPIN_BCRYPT_ROUNDS);
    await db.update(usersTable).set({
      walletPinHash: hash,
      walletPinAttempts: 0,
      walletPinLockedUntil: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));

    sendCreated(res, { message: "MPIN created successfully", pinSetup: true });
  } catch (e: unknown) {
    logger.error("[wallet /pin/setup] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

router.post("/pin/verify", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }
    if (!user.walletPinHash) { sendError(res, "MPIN not set up yet", 400); return; }

    if (isWalletPinLocked(user)) {
      const remainMin = Math.ceil((user.walletPinLockedUntil!.getTime() - Date.now()) / 60000);
      sendForbidden(res, "pin_locked", `MPIN locked. Try again in ${remainMin} minute(s).`);
      return;
    }

    const parsed = mpinSchema.safeParse(req.body.pin);
    if (!parsed.success) { sendValidationError(res, "MPIN must be exactly 4 digits"); return; }

    const valid = await bcrypt.compare(parsed.data, user.walletPinHash);
    if (!valid) {
      const newAttempts = (user.walletPinAttempts ?? 0) + 1;
      const locked = newAttempts >= MPIN_MAX_ATTEMPTS;
      await db.update(usersTable).set({
        walletPinAttempts: newAttempts,
        walletPinLockedUntil: locked ? new Date(Date.now() + MPIN_LOCK_DURATION_MS) : null,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, userId));

      if (locked) {
        sendForbidden(res, "pin_locked", "Too many wrong attempts. MPIN locked for 30 minutes.");
      } else {
        sendError(res, `Wrong MPIN. ${MPIN_MAX_ATTEMPTS - newAttempts} attempt(s) remaining.`, 401);
      }
      return;
    }

    await db.update(usersTable).set({
      walletPinAttempts: 0,
      walletPinLockedUntil: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));

    const pinToken = signWalletActionToken(userId);

    sendSuccess(res, { verified: true, pinToken });
  } catch (e: unknown) {
    logger.error("[wallet /pin/verify] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

router.post("/pin/change", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }
    if (!user.walletPinHash) { sendError(res, "MPIN not set up yet", 400); return; }

    if (isWalletPinLocked(user)) {
      sendForbidden(res, "pin_locked", "MPIN is locked. Try again later.");
      return;
    }

    const oldParsed = mpinSchema.safeParse(req.body.oldPin);
    const newParsed = mpinSchema.safeParse(req.body.newPin);
    if (!oldParsed.success || !newParsed.success) {
      sendValidationError(res, "Both old and new MPIN must be exactly 4 digits");
      return;
    }

    if (oldParsed.data === newParsed.data) {
      sendValidationError(res, "New MPIN must be different from old MPIN");
      return;
    }

    const valid = await bcrypt.compare(oldParsed.data, user.walletPinHash);
    if (!valid) {
      sendError(res, "Current MPIN is incorrect", 401);
      return;
    }

    const hash = await bcrypt.hash(newParsed.data, MPIN_BCRYPT_ROUNDS);
    await db.update(usersTable).set({
      walletPinHash: hash,
      walletPinAttempts: 0,
      walletPinLockedUntil: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));

    sendSuccess(res, { message: "MPIN changed successfully" });
  } catch (e: unknown) {
    logger.error("[wallet /pin/change] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── MPIN reset cooldown duration (SIM-swap protection) ── */
const MPIN_RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000; /* 24 hours */

router.post("/pin/forgot", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }
    if (!user.walletPinHash) { sendError(res, "MPIN not set up yet", 400); return; }
    if (!user.phone) { sendError(res, "No phone number linked to this account", 400); return; }

    const rateLimited = await checkAvailableRateLimit(`pin-forgot:${userId}`, 3, 5);
    if (rateLimited.limited) {
      sendError(res, `Too many requests. Try again in ${rateLimited.minutesLeft} minute(s).`, 429);
      return;
    }

    const otp = String(randomInt(100000, 1000000));
    const otpHash = await import("crypto").then(c => c.createHash("sha256").update(otp).digest("hex"));
    await db.update(usersTable).set({
      otpCode: otpHash,
      otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
      otpUsed: false,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));

    if (process.env.NODE_ENV === "development" && process.env["LOG_OTP"] === "1") {
      logger.info(`[wallet /pin/forgot] OTP for ${user.phone}: ${otp}`);
    }

    const responseData: Record<string, unknown> = {
      message: "OTP sent to your phone number",
      phone: user.phone.replace(/^(\d{2})\d+(\d{2})$/, "$1****$2"),
      /* Inform the client whether TOTP verification will be required at reset-confirm */
      requiresTotp: !!(user.totpEnabled && user.totpSecret),
      /* Inform the client whether a 24-hour cooldown applies (no TOTP on account) */
      cooldownApplies: !(user.totpEnabled && user.totpSecret),
    };

    sendSuccess(res, responseData);
  } catch (e: unknown) {
    logger.error("[wallet /pin/forgot] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

router.post("/pin/reset-confirm", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }

    const { otp, newPin, totpCode } = req.body;
    if (!otp || typeof otp !== "string") { sendValidationError(res, "OTP is required"); return; }

    const newParsed = mpinSchema.safeParse(newPin);
    if (!newParsed.success) { sendValidationError(res, "New MPIN must be exactly 4 digits"); return; }

    if (!user.otpCode || !user.otpExpiry || user.otpUsed) {
      sendError(res, "No active OTP found. Request a new one.", 400);
      return;
    }
    if (user.otpExpiry.getTime() < Date.now()) {
      sendError(res, "OTP has expired. Request a new one.", 400);
      return;
    }

    const otpHash = await import("crypto").then(c => c.createHash("sha256").update(otp).digest("hex"));
    if (otpHash !== user.otpCode) {
      sendError(res, "Invalid OTP", 401);
      return;
    }

    const hasTotpEnabled = !!(user.totpEnabled && user.totpSecret);

    if (hasTotpEnabled) {
      /* ── Path A: TOTP-enabled accounts ──
         Require the TOTP code alongside the OTP. If both verify, reset immediately. */
      if (!totpCode || typeof totpCode !== "string") {
        sendValidationError(res, "TOTP code is required for accounts with two-factor authentication enabled");
        return;
      }
      let decryptedSecret: string;
      try {
        decryptedSecret = decryptTotpSecret(user.totpSecret!);
      } catch {
        logger.error(`[wallet /pin/reset-confirm] TOTP decrypt failed for user ${userId}`);
        sendError(res, "Two-factor authentication configuration error. Contact support.", 500);
        return;
      }
      if (!verifyTotpToken(totpCode, decryptedSecret)) {
        sendError(res, "Invalid TOTP code. Please check your authenticator app and try again.", 401);
        return;
      }

      /* Both OTP + TOTP verified — reset immediately */
      const hash = await bcrypt.hash(newParsed.data, MPIN_BCRYPT_ROUNDS);
      await db.update(usersTable).set({
        walletPinHash: hash,
        walletPinAttempts: 0,
        walletPinLockedUntil: null,
        mpinResetPendingAt: null,
        mpinResetNewHashPending: null,
        otpUsed: true,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, userId));

      sendSuccess(res, { message: "MPIN reset successfully", pinSetup: true, cooldown: false });
    } else {
      /* ── Path B: No TOTP — mandatory 24-hour cooldown (SIM-swap protection) ──
         Store the new hashed MPIN as pending and set the cooldown timestamp.
         The actual walletPinHash is NOT updated yet. An admin notification is
         emitted so the security team can manually review if needed.
         The client must call POST /wallet/pin/reset-activate after cooldown elapses. */
      const hash = await bcrypt.hash(newParsed.data, MPIN_BCRYPT_ROUNDS);
      const pendingAt = new Date();
      await db.update(usersTable).set({
        mpinResetPendingAt: pendingAt,
        mpinResetNewHashPending: hash,
        otpUsed: true,
        updatedAt: new Date(),
      }).where(eq(usersTable.id, userId));

      /* Notify all admins for manual review */
      const admins = await db
        .select({ id: adminAccountsTable.id })
        .from(adminAccountsTable)
        .limit(20);
      if (admins.length > 0) {
        const adminNotifs = admins.map(a => ({
          id: generateId(),
          userId: a.id,
          title: "⚠️ MPIN Reset Pending Review",
          body: `User ${user.phone ?? userId} requested a wallet MPIN reset (no 2FA). It will activate in 24 hours unless cancelled.`,
          type: "security",
          icon: "shield-outline",
        }));
        db.insert(notificationsTable).values(adminNotifs).catch(e =>
          logger.error("[wallet /pin/reset-confirm] admin notif insert failed:", e)
        );
      }
      logger.warn(`[wallet /pin/reset-confirm] MPIN reset cooldown started for user ${userId} (phone: ${user.phone})`);

      const activatesAt = new Date(pendingAt.getTime() + MPIN_RESET_COOLDOWN_MS);
      sendSuccess(res, {
        message: "MPIN reset initiated. Your new MPIN will activate in 24 hours as a security measure. You will be notified when it is ready.",
        pinSetup: true,
        cooldown: true,
        activatesAt: activatesAt.toISOString(),
      });
    }
  } catch (e: unknown) {
    logger.error("[wallet /pin/reset-confirm] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

/* ── POST /wallet/pin/reset-activate — Promote pending MPIN after cooldown ── */
router.post("/pin/reset-activate", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { sendNotFound(res, "User not found"); return; }

    if (!user.mpinResetPendingAt || !user.mpinResetNewHashPending) {
      sendError(res, "No pending MPIN reset found. Please initiate a new reset.", 400);
      return;
    }

    const cooldownEndsAt = new Date(user.mpinResetPendingAt.getTime() + MPIN_RESET_COOLDOWN_MS);
    if (Date.now() < cooldownEndsAt.getTime()) {
      const msLeft = cooldownEndsAt.getTime() - Date.now();
      const hoursLeft = Math.ceil(msLeft / (60 * 60 * 1000));
      sendError(res, `Your new MPIN will be ready in approximately ${hoursLeft} hour(s). Please try again after the cooldown period.`, 425);
      return;
    }

    await db.update(usersTable).set({
      walletPinHash: user.mpinResetNewHashPending,
      walletPinAttempts: 0,
      walletPinLockedUntil: null,
      mpinResetPendingAt: null,
      mpinResetNewHashPending: null,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));

    logger.info(`[wallet /pin/reset-activate] MPIN cooldown complete, activated for user ${userId}`);
    sendSuccess(res, { message: "Your new MPIN is now active.", pinSetup: true });
  } catch (e: unknown) {
    logger.error("[wallet /pin/reset-activate] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

router.patch("/visibility", customerAuth, async (req, res) => {
  const userId = req.customerId!;
  try {
    const hidden = req.body.hidden;
    if (typeof hidden !== "boolean") { sendValidationError(res, "hidden must be a boolean"); return; }

    await db.update(usersTable).set({
      walletHidden: hidden,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, userId));

    sendSuccess(res, { walletHidden: hidden });
  } catch (e: unknown) {
    logger.error("[wallet /visibility] error:", e);
    sendError(res, "Something went wrong, please try again.", 500);
  }
});

export { requireWalletPin };

export default router;
