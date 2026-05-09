/**
 * Payment Gateway Routes
 * Supports: JazzCash, EasyPaisa (API + Manual modes), Bank Transfer, Cash on Delivery
 * ─────────────────────────────────────────────────────────────────────────────
 * All gateway credentials are stored in platform_settings table.
 * Changes take effect instantly without server restart.
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable, usersTable, walletTransactionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getCachedSettings, adminAuth } from "./admin.js";
import { generateId } from "../lib/id.js";
import { customerAuth } from "../middleware/security.js";
import { z } from "zod";
import { sendSuccess, sendCreated, sendError, sendNotFound, sendForbidden, sendValidationError } from "../lib/response.js";
import {
  buildJazzCashHash, buildEasyPaisaHash,
  txnDateTime, txnExpiry,
  getProviderConfig, validatePaymentAmount,
  isSupportedGateway, SUPPORTED_GATEWAYS,
} from "../lib/payment-providers.js";
import { paymentLimiter } from "../middleware/rate-limit.js";

const router: IRouter = Router();

/* Apply payment rate limiter to all routes EXCEPT gateway callbacks.
   Callbacks originate from a small set of provider IPs and must never
   be throttled — a 429 would silently drop a payment confirmation. */
router.use((req, res, next) => {
  if (req.path.startsWith("/callback/")) { next(); return; }
  paymentLimiter(req, res, next);
});

const paymentInitiateSchema = z.object({
  gateway: z.string().min(1, "gateway is required"),
  amount: z.union([z.number().positive(), z.string().min(1)]).transform(v => parseFloat(String(v))).refine(v => !isNaN(v) && v > 0, "Invalid amount"),
  orderId: z.string().min(1, "orderId is required"),
  mobileNumber: z.string().optional(),
});

const PAYMENT_TTL_MS = 30 * 60 * 1000;

async function trackPayment(txnRef: string, orderId?: string) {
  if (orderId) {
    await db.update(ordersTable)
      .set({ txnRef, paymentStatus: "pending", updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));
  }
}

async function resolvePayment(txnRef: string, status: "success" | "failed") {
  await db.update(ordersTable)
    .set({ paymentStatus: status, updatedAt: new Date() })
    .where(eq(ordersTable.txnRef, txnRef));
}

async function confirmOrder(orderId: string): Promise<void> {
  await db.update(ordersTable)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GET /api/payments/methods
//  Public — returns all ACTIVE payment methods with full details
//  Respects: cod_enabled, bank_enabled, jazzcash_enabled, easypaisa_enabled,
//            feature_wallet, jazzcash_type (api/manual), easypaisa_type
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/methods", async (req, res) => {
  const s = await getCachedSettings();
  const serviceType = (req.query.serviceType as string | undefined)?.toLowerCase();
  const validServices = ["mart", "food", "pharmacy", "parcel", "rides"];
  const filterService = serviceType && validServices.includes(serviceType) ? serviceType : null;

  const isAllowedForService = (prefix: string): boolean => {
    if (!filterService) return true;
    return (s[`${prefix}_allowed_${filterService}`] ?? "on") === "on";
  };

  const codEnabled    = (s["cod_enabled"]       ?? "on")  === "on";
  const walletEnabled = (s["feature_wallet"]    ?? "on")  === "on";
  const jcEnabled     = (s["jazzcash_enabled"]  ?? "off") === "on";
  const epEnabled     = (s["easypaisa_enabled"] ?? "off") === "on";
  const bankEnabled   = (s["bank_enabled"]      ?? "off") === "on";

  const methods: Array<Record<string, unknown>> = [];

  /* ── Cash on Delivery ── */
  if (codEnabled && isAllowedForService("cod")) {
    methods.push({
      id:          "cash",
      label:       "Cash on Delivery",
      logo:        "cash",
      available:   true,
      mode:        "live",
      description: s["cod_notes"] || "Delivery par cash dein",
      maxAmount:   parseFloat(s["cod_max_amount"] ?? "5000"),
      fee:         parseFloat(s["cod_fee_amount"] ?? s["cod_fee"] ?? "0"),
      freeAbove:   parseFloat(s["cod_free_above"] ?? "2000"),
    });
  }

  /* ── AJK Wallet ── */
  if (walletEnabled && isAllowedForService("wallet")) {
    methods.push({
      id:          "wallet",
      label:       "AJK Wallet",
      logo:        "wallet",
      available:   true,
      mode:        "live",
      description: "Apni wallet se instant payment karein",
      minTopup:    parseFloat(s["wallet_min_topup"]    ?? "100"),
      maxTopup:    parseFloat(s["wallet_max_topup"]    ?? "25000"),
      maxBalance:  parseFloat(s["wallet_max_balance"]  ?? "50000"),
    });
  }

  /* ── JazzCash ── */
  if (jcEnabled && isAllowedForService("jazzcash")) {
    const jcType = s["jazzcash_type"] ?? "manual";
    const entry: Record<string, unknown> = {
      id:           "jazzcash",
      label:        "JazzCash",
      logo:         "jazzcash",
      available:    true,
      mode:         jcType === "api" ? (s["jazzcash_mode"] ?? "sandbox") : "manual",
      type:         jcType,
      description:  "JazzCash mobile wallet",
      proofRequired:(s["jazzcash_proof_required"] ?? "off") === "on",
      minAmount:    parseFloat(s["jazzcash_min_amount"] ?? "10"),
      maxAmount:    parseFloat(s["jazzcash_max_amount"] ?? "100000"),
    };
    if (jcType === "manual") {
      entry["manualName"]         = s["jazzcash_manual_name"]         ?? "";
      entry["manualNumber"]       = s["jazzcash_manual_number"]       ?? "";
      entry["manualInstructions"] = s["jazzcash_manual_instructions"] ?? "Number par payment bhejein aur transaction ID hum se share karein.";
    }
    methods.push(entry);
  }

  /* ── EasyPaisa ── */
  if (epEnabled && isAllowedForService("easypaisa")) {
    const epType = s["easypaisa_type"] ?? "manual";
    const entry: Record<string, unknown> = {
      id:           "easypaisa",
      label:        "EasyPaisa",
      logo:         "easypaisa",
      available:    true,
      mode:         epType === "api" ? (s["easypaisa_mode"] ?? "sandbox") : "manual",
      type:         epType,
      description:  "EasyPaisa mobile wallet",
      proofRequired:(s["easypaisa_proof_required"] ?? "off") === "on",
      minAmount:    parseFloat(s["easypaisa_min_amount"] ?? "10"),
      maxAmount:    parseFloat(s["easypaisa_max_amount"] ?? "100000"),
    };
    if (epType === "manual") {
      entry["manualName"]         = s["easypaisa_manual_name"]         ?? "";
      entry["manualNumber"]       = s["easypaisa_manual_number"]       ?? "";
      entry["manualInstructions"] = s["easypaisa_manual_instructions"] ?? "Number par payment bhejein aur transaction ID share karein.";
    }
    methods.push(entry);
  }

  /* ── Bank Transfer ── */
  if (bankEnabled && isAllowedForService("bank")) {
    methods.push({
      id:              "bank",
      label:           "Bank Transfer",
      logo:            "bank",
      available:       true,
      mode:            "manual",
      type:            "manual",
      description:     "Direct bank account transfer",
      bankName:        s["bank_name"]            ?? "",
      accountTitle:    s["bank_account_title"]   ?? "",
      accountNumber:   s["bank_account_number"]  ?? "",
      iban:            s["bank_iban"]             ?? "",
      branchCode:      s["bank_branch_code"]      ?? "",
      swiftCode:       s["bank_swift_code"]       ?? "",
      instructions:    s["bank_instructions"]     ?? "Bank account mein transfer karein aur receipt hum se share karein.",
      proofRequired:   (s["bank_proof_required"]  ?? "on") === "on",
      minAmount:       parseFloat(s["bank_min_amount"]       ?? "0"),
      processingHours: parseInt(s["bank_processing_hours"]   ?? "24"),
    });
  }

  sendSuccess(res, {
    methods,
    currency:          "PKR",
    minAmount:         parseFloat(s["payment_min_online"]          ?? "50"),
    maxAmount:         parseFloat(s["payment_max_online"]          ?? "100000"),
    timeoutMins:       parseInt(s["payment_timeout_mins"]          ?? "15"),
    receiptRequired:   (s["payment_receipt_required"]              ?? "off") === "on",
    verifyWindowHours: parseInt(s["payment_verify_window_hours"]   ?? "24"),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GET /api/payments/test-connection/:gateway
//  Admin only — validates credentials and generates test hash
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/test-connection/:gateway", adminAuth, async (req, res) => {
  const s = await getCachedSettings();
  const gw = req.params["gateway"];

  if (gw === "jazzcash") {
    const jcType = s["jazzcash_type"] ?? "manual";
    if (jcType === "manual") {
      const name   = s["jazzcash_manual_name"]   ?? "";
      const number = s["jazzcash_manual_number"] ?? "";
      if (!name || !number) {
        sendSuccess(res, { ok: false, message: "Manual mode: account name aur Jazz number add karein." }); return;
      }
      sendSuccess(res, { ok: true, message: `JazzCash Manual mode — ${number} (${name}) ✅` }); return;
    }
    const merchantId = s["jazzcash_merchant_id"] ?? "";
    const password   = s["jazzcash_password"]    ?? "";
    const salt       = s["jazzcash_salt"]         ?? "";
    if (!merchantId || !password || !salt) {
      sendSuccess(res, { ok: false, message: "API mode: Merchant ID, Password aur Salt darj karein." }); return;
    }
    const testParams = { pp_MerchantID: merchantId, pp_Password: password, pp_TxnRefNo: `T${Date.now()}`, pp_Amount: "100", pp_TxnCurrency: "PKR", pp_TxnDateTime: txnDateTime() };
    const hash = buildJazzCashHash(testParams, salt);
    const mode = s["jazzcash_mode"] ?? "sandbox";
    sendSuccess(res, { ok: true, mode, message: `JazzCash API ready — ${mode.toUpperCase()} ✅ Hash: ${hash.slice(0,10)}...` }); return;
  }

  if (gw === "easypaisa") {
    const epType = s["easypaisa_type"] ?? "manual";
    if (epType === "manual") {
      const name   = s["easypaisa_manual_name"]   ?? "";
      const number = s["easypaisa_manual_number"] ?? "";
      if (!name || !number) {
        sendSuccess(res, { ok: false, message: "Manual mode: account name aur EasyPaisa number add karein." }); return;
      }
      sendSuccess(res, { ok: true, message: `EasyPaisa Manual mode — ${number} (${name}) ✅` }); return;
    }
    const storeId = s["easypaisa_store_id"] ?? "";
    const hashKey = s["easypaisa_hash_key"] ?? "";
    if (!storeId || !hashKey) {
      sendSuccess(res, { ok: false, message: "API mode: Store ID aur Hash Key darj karein." }); return;
    }
    const testHash = buildEasyPaisaHash([storeId, "100", "PKR"], hashKey);
    const mode = s["easypaisa_mode"] ?? "sandbox";
    sendSuccess(res, { ok: true, mode, message: `EasyPaisa API ready — ${mode.toUpperCase()} ✅ Hash: ${testHash.slice(0,10)}...` }); return;
  }

  sendValidationError(res, "Unknown gateway. Use: jazzcash, easypaisa");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  POST /api/payments/initiate
//  Requires auth. Verifies orderId belongs to the calling user.
//  Body: { gateway, amount, orderId, mobileNumber?, returnUrl? }
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/initiate", customerAuth, async (req, res) => {
  const callerId = req.customerId!;

  const parsed = paymentInitiateSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Invalid input";
    sendValidationError(res, firstError); return;
  }

  const { gateway, amount, orderId, mobileNumber } = parsed.data;

  if (!isSupportedGateway(gateway)) {
    sendValidationError(res, `Unsupported gateway. Supported: ${SUPPORTED_GATEWAYS.join(", ")}`); return;
  }

  /* Verify the order belongs to the authenticated user */
  const [order] = await db.select({ userId: ordersTable.userId })
    .from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) { sendNotFound(res, "Order not found"); return; }
  if (order.userId !== callerId) { sendForbidden(res, "Access denied — order does not belong to you"); return; }

  const s = await getCachedSettings();
  const amountPaisa = Math.round(amount * 100);

  const providerCfg = getProviderConfig(s, gateway);

  /* ── JazzCash ── */
  if (gateway === "jazzcash") {
    const amountErr = providerCfg ? validatePaymentAmount(providerCfg, amount, "JazzCash") : "JazzCash is not configured";
    if (amountErr) {
      sendError(res, amountErr, providerCfg?.enabled === false ? 503 : 400); return;
    }
    const jcType = providerCfg!.type;

    if (jcType === "manual") {
      sendSuccess(res, {
        gateway:    "jazzcash",
        mode:       "manual",
        type:       "manual",
        name:       s["jazzcash_manual_name"]         ?? "",
        number:     s["jazzcash_manual_number"]       ?? "",
        instructions: s["jazzcash_manual_instructions"] ?? "Number par payment bhejein aur transaction ID share karein.",
        amount:     amount,
        orderId,
      });
      return;
    }

    // API mode
    const merchantId  = s["jazzcash_merchant_id"] ?? "";
    const password    = s["jazzcash_password"]    ?? "";
    const salt        = s["jazzcash_salt"]         ?? "";
    const currency    = s["jazzcash_currency"]     ?? "PKR";
    const mode        = s["jazzcash_mode"]         ?? "sandbox";
    const timeoutMins = parseInt(s["payment_timeout_mins"] ?? "15");

    if (mode !== "sandbox" && (!merchantId || !password || !salt)) {
      sendSuccess(res, {
        gateway: "jazzcash", mode: "pending_manual", type: "pending",
        status: "pending_manual_verification",
        message: "JazzCash digital payment is temporarily unavailable. Please pay via bank transfer or contact support to complete your order.",
        orderId,
        amount: amount,
        supportNote: "Your order will be processed once payment is confirmed by admin.",
      }); return;
    }

    const txnRef     = `AJKM${Date.now()}`;
    const params: Record<string, string> = {
      pp_Version:           "1.1",
      pp_TxnType:           "MWALLET",
      pp_Language:          "EN",
      pp_MerchantID:        merchantId,
      pp_SubMerchantID:     "",
      pp_Password:          password,
      pp_BankID:            "TBANK",
      pp_ProductID:         "RETL",
      pp_TxnRefNo:          txnRef,
      pp_Amount:            String(amountPaisa),
      pp_TxnCurrency:       currency,
      pp_TxnDateTime:       txnDateTime(),
      pp_BillReference:     orderId,
      pp_Description:       `AJKMart Order ${orderId.slice(-6).toUpperCase()}`,
      pp_TxnExpiryDateTime: txnExpiry(timeoutMins),
      pp_ReturnURL:         s["jazzcash_return_url"] || `${req.protocol}://${req.get("host")}/api/payments/callback/jazzcash`,
      ppmpf_1:              mobileNumber || "",
      ppmpf_2: "", ppmpf_3: "", ppmpf_4: "", ppmpf_5: "",
    };
    params["pp_SecureHash"] = buildJazzCashHash(params, salt || "sandbox_salt");

    const isSandbox = mode === "sandbox";
    await trackPayment(txnRef, orderId);
    sendSuccess(res, {
      gateway: "jazzcash", mode, type: "api", txnRef, orderId,
      gatewayUrl: isSandbox
        ? "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/"
        : "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
      params,
      instructions: isSandbox
        ? "Sandbox mode — payment simulate hogi."
        : `JazzCash app pe notification aayegi — approve karein.`,
      simulateUrl: isSandbox ? `/api/payments/simulate/jazzcash/${txnRef}/${orderId}` : null,
    });
    return;
  }

  /* ── EasyPaisa ── */
  if (gateway === "easypaisa") {
    const amountErr = providerCfg ? validatePaymentAmount(providerCfg, amount, "EasyPaisa") : "EasyPaisa is not configured";
    if (amountErr) {
      sendError(res, amountErr, providerCfg?.enabled === false ? 503 : 400); return;
    }
    const epType = providerCfg!.type;

    if (epType === "manual") {
      sendSuccess(res, {
        gateway:    "easypaisa",
        mode:       "manual",
        type:       "manual",
        name:       s["easypaisa_manual_name"]         ?? "",
        number:     s["easypaisa_manual_number"]       ?? "",
        instructions: s["easypaisa_manual_instructions"] ?? "Number par payment bhejein aur transaction ID share karein.",
        amount:     amount,
        orderId,
      });
      return;
    }

    // API mode
    const storeId    = s["easypaisa_store_id"]  ?? "";
    const hashKey    = s["easypaisa_hash_key"]  ?? "";
    const username   = s["easypaisa_username"]  ?? "";
    const epPassword = s["easypaisa_password"]  ?? "";
    const mode       = s["easypaisa_mode"]      ?? "sandbox";

    const isSandbox = mode === "sandbox";
    if (!isSandbox && (!storeId || !hashKey)) {
      sendSuccess(res, {
        gateway: "easypaisa", mode: "pending_manual", type: "pending",
        status: "pending_manual_verification",
        message: "EasyPaisa digital payment is temporarily unavailable. Please pay via bank transfer or contact support to complete your order.",
        orderId,
        amount: amount,
        supportNote: "Your order will be processed once payment is confirmed by admin.",
      }); return;
    }

    const txnRef    = `EP${Date.now()}`;
    const amountStr = amount.toFixed(2);
    const hash      = buildEasyPaisaHash([storeId, txnRef, amountStr, "PKR", mobileNumber || ""], hashKey || "sandbox_key");

    const payload = {
      orderId: txnRef, storeId,
      transactionAmount: amountStr,
      transactionType: "MA",
      mobileAccountNo: mobileNumber || "",
      transactionCurrency: "PKR",
      paymentExpiryDate: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      enabledPaymentMethods: 0,
      postBackURL: `${req.protocol}://${req.get("host")}/api/payments/callback/easypaisa`,
      encryptedHashRequest: hash,
    };

    if (!isSandbox && username && epPassword) {
      try {
        const authHeader = "Basic " + Buffer.from(`${username}:${epPassword}`).toString("base64");
        const epRes = await fetch("https://easypay.easypaisa.com.pk/easypay-service/rest/v4/initTransaction", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": authHeader, "Credentials": authHeader },
          body: JSON.stringify(payload),
        });
        const epData = await epRes.json() as { responseCode?: string; responseDesc?: string; token?: string };
        if (epData?.responseCode === "0000") {
          await trackPayment(txnRef, orderId);
          sendSuccess(res, { gateway: "easypaisa", mode: "live", type: "api", txnRef, token: epData.token, orderId,
            instructions: `Mobile ${mobileNumber} pe notification aayegi — approve karein.` });
          return;
        }
        sendError(res, `EasyPaisa error: ${epData?.responseDesc || "Unknown error"}`, 502); return;
      } catch (e: unknown) {
        sendError(res, `EasyPaisa API unreachable: ${(e as Error).message}`, 502); return;
      }
    }

    await trackPayment(txnRef, orderId);
    sendSuccess(res, {
      gateway: "easypaisa", mode, type: "api", txnRef, orderId, payload,
      instructions: isSandbox ? "Sandbox mode — payment simulate hogi." : `EasyPaisa notification aayegi — approve karein.`,
      simulateUrl: isSandbox ? `/api/payments/simulate/easypaisa/${txnRef}/${orderId}` : null,
    });
    return;
  }

  sendValidationError(res, "Unsupported gateway. Use: jazzcash, easypaisa");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  POST /api/payments/verify-manual
//  Manual payment verification — admin confirms a manual transfer
//  Body: { orderId, gateway, transactionId, amount }
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/verify-manual", adminAuth, async (req, res) => {
  const { orderId, gateway, transactionId } = req.body;
  if (!orderId) { sendValidationError(res, "orderId required"); return; }
  await confirmOrder(orderId);
  sendSuccess(res, { orderId, gateway, transactionId }, "Manual payment verified — order confirmed ✅");
});

router.post("/reconcile", adminAuth, async (req, res) => {
  const { orderId, txnRef, status: forcedStatus, gateway, notes } = req.body;
  if (!orderId && !txnRef) {
    sendValidationError(res, "orderId or txnRef is required");
    return;
  }

  const whereClause = orderId
    ? eq(ordersTable.id, orderId)
    : eq(ordersTable.txnRef, txnRef);

  const [order] = await db.select({
    id: ordersTable.id,
    status: ordersTable.status,
    paymentStatus: ordersTable.paymentStatus,
    paymentMethod: ordersTable.paymentMethod,
    txnRef: ordersTable.txnRef,
    total: ordersTable.total,
  }).from(ordersTable).where(whereClause).limit(1);

  if (!order) {
    sendNotFound(res, "Order not found");
    return;
  }

  if (!forcedStatus || !["success", "failed"].includes(forcedStatus)) {
    sendValidationError(res, "status is required and must be 'success' or 'failed'");
    return;
  }
  const newPaymentStatus = forcedStatus as "success" | "failed";
  const updates: Record<string, unknown> = {
    paymentStatus: newPaymentStatus,
    updatedAt: new Date(),
  };

  if (newPaymentStatus === "success" && order.status === "pending") {
    updates["status"] = "confirmed";
  }

  await db.update(ordersTable).set(updates).where(eq(ordersTable.id, order.id));

  sendSuccess(res, {
    orderId: order.id,
    txnRef: order.txnRef,
    previousPaymentStatus: order.paymentStatus,
    newPaymentStatus,
    orderStatus: updates["status"] ?? order.status,
    gateway: gateway ?? order.paymentMethod,
    notes: notes ?? null,
  }, `Payment reconciled — ${newPaymentStatus} ✅`);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GET /api/payments/simulate/:gateway/:txnRef/:orderId
//  Sandbox simulation — marks order confirmed (ONLY in sandbox/dev mode)
//  Uses centralized adminAuth middleware.
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/simulate/:gateway/:txnRef/:orderId", adminAuth, async (req, res) => {
  const s = await getCachedSettings();
  const gw = req.params["gateway"];
  const orderId = req.params["orderId"]!;
  const mode = gw === "jazzcash" ? (s["jazzcash_mode"] ?? "sandbox") : (s["easypaisa_mode"] ?? "sandbox");

  if (mode !== "sandbox") {
    sendForbidden(res, "Simulation only available in sandbox mode"); return;
  }

  await confirmOrder(orderId);
  await resolvePayment(req.params["txnRef"]!, "success");
  sendSuccess(res, { status: "success", txnRef: req.params["txnRef"], orderId, gateway: gw }, "Sandbox payment simulated ✅ — Order confirmed");
});

router.get("/simulate/:gateway/:txnRef", adminAuth, async (req, res) => {
  const s = await getCachedSettings();
  const gw = req.params["gateway"];
  const mode = gw === "jazzcash" ? (s["jazzcash_mode"] ?? "sandbox") : (s["easypaisa_mode"] ?? "sandbox");

  if (mode !== "sandbox") {
    sendForbidden(res, "Simulation only available in sandbox mode"); return;
  }

  sendSuccess(res, { status: "success", txnRef: req.params["txnRef"], orderId: null, gateway: gw }, "Sandbox payment simulated ✅");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  POST /api/payments/callback/jazzcash
//  JazzCash posts payment result here (Return URL)
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/callback/jazzcash", async (req, res) => {
  const s      = await getCachedSettings();
  const salt   = s["jazzcash_salt"] ?? "";
  const mode   = s["jazzcash_mode"] ?? "sandbox";
  const params = req.body as Record<string, string>;

  /* ── Hash verification ──
     Live mode: salt MUST be configured and hash MUST match — no bypass allowed.
     Sandbox mode: skip hash check (sandbox credentials aren't real keys). ── */
  if (mode !== "sandbox") {
    if (!salt) {
      sendError(res, "JazzCash salt not configured — cannot verify callback", 500); return;
    }
    const receivedHash      = params["pp_SecureHash"];
    const paramsWithoutHash = { ...params };
    delete paramsWithoutHash["pp_SecureHash"];
    const computedHash = buildJazzCashHash(paramsWithoutHash, salt);
    if (receivedHash !== computedHash) {
      sendValidationError(res, "Hash mismatch — possible tampering"); return;
    }
  }

  const responseCode = params["pp_ResponseCode"];
  const txnRef       = params["pp_TxnRefNo"];
  const orderId      = params["pp_BillReference"];

  if (responseCode === "000") {
    if (orderId) await confirmOrder(orderId);
    if (txnRef) await resolvePayment(txnRef, "success");
    sendSuccess(res, { txnRef, orderId }, "JazzCash payment confirmed — order updated ✅");
  } else {
    if (txnRef) await resolvePayment(txnRef, "failed");
    sendSuccess(res, { txnRef, responseCode }, "JazzCash payment failed or cancelled");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  POST /api/payments/callback/easypaisa
//  EasyPaisa posts transaction result here (postBackURL)
// ═══════════════════════════════════════════════════════════════════════════════
router.post("/callback/easypaisa", async (req, res) => {
  const s        = await getCachedSettings();
  const hashKey  = s["easypaisa_hash_key"] ?? "";
  const storeId  = s["easypaisa_store_id"] ?? "";
  const mode     = s["easypaisa_mode"] ?? "sandbox";
  const body     = req.body as Record<string, string>;

  const receivedHash = body["encryptedHashRequest"];
  const orderId      = body["orderId"];
  const responseCode = body["responseCode"];
  const txnRefNo     = body["transactionReferenceNumber"];
  const amount       = body["transactionAmount"];

  /* ── Hash verification ──
     Live mode: hashKey MUST be configured and hash MUST match — no bypass allowed.
     Sandbox mode: skip hash check (sandbox credentials aren't real keys). ── */
  if (mode !== "sandbox") {
    if (!hashKey) {
      sendError(res, "EasyPaisa hash key not configured — cannot verify callback", 500); return;
    }
    const computedHash = buildEasyPaisaHash([storeId, orderId, amount, "PKR", ""], hashKey);
    if (receivedHash !== computedHash) {
      sendValidationError(res, "Hash mismatch — verify EasyPaisa credentials"); return;
    }
  }

  if (responseCode === "0000") {
    if (orderId) {
      const [order] = await db.select({ id: ordersTable.id }).from(ordersTable).where(eq(ordersTable.txnRef, orderId)).limit(1);
      if (order) await confirmOrder(order.id);
      await resolvePayment(orderId, "success");
    }
    sendSuccess(res, { txnRefNo }, "EasyPaisa payment confirmed ✅");
  } else {
    if (orderId) await resolvePayment(orderId, "failed");
    sendSuccess(res, { txnRefNo, responseCode }, "EasyPaisa payment failed");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GET /api/payments/status/:txnRef
//  Poll payment status by transaction reference
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/status/:txnRef", async (req, res) => {
  const txnRef = req.params["txnRef"]!;
  const [order] = await db.select({
    id: ordersTable.id,
    paymentStatus: ordersTable.paymentStatus,
    updatedAt: ordersTable.updatedAt,
    total: ordersTable.total,
  }).from(ordersTable).where(eq(ordersTable.txnRef, txnRef)).limit(1);

  if (!order) {
    sendSuccess(res, { txnRef, status: "pending" }, "Awaiting payment confirmation from gateway");
    return;
  }

  let status = order.paymentStatus || "pending";
  const elapsed = Date.now() - order.updatedAt.getTime();
  if (status === "pending" && elapsed > PAYMENT_TTL_MS) {
    status = "expired";
    await db.update(ordersTable).set({ paymentStatus: "expired", updatedAt: new Date() }).where(eq(ordersTable.txnRef, txnRef));
  }

  const messages: Record<string, string> = {
    pending: "Awaiting payment confirmation from gateway",
    success: "Payment confirmed",
    failed: "Payment failed or was cancelled",
    expired: "Payment session expired",
  };

  sendSuccess(res, { txnRef, status, amount: order?.total ? parseFloat(String(order.total)) : null }, messages[status] || status);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GET /api/payments/:orderId/status   (C-06 fix: path the customer app uses)
//  GET /api/payments/order-status/:orderId   (legacy path, kept for compat)
// ═══════════════════════════════════════════════════════════════════════════════
async function handleOrderPaymentStatus(req: import("express").Request, res: import("express").Response) {
  const orderId = req.params["orderId"]!;
  const callerId = req.customerId!;

  const [order] = await db.select({
    id: ordersTable.id,
    userId: ordersTable.userId,
    status: ordersTable.status,
    paymentMethod: ordersTable.paymentMethod,
    paymentStatus: ordersTable.paymentStatus,
    total: ordersTable.total,
    txnRef: ordersTable.txnRef,
    updatedAt: ordersTable.updatedAt,
  }).from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);

  if (!order) {
    sendNotFound(res, "Order not found");
    return;
  }
  if (order.userId !== callerId) {
    sendForbidden(res, "Access denied");
    return;
  }

  let paymentStatus = order.paymentStatus || "pending";
  if (order.txnRef && paymentStatus === "pending") {
    const elapsed = Date.now() - order.updatedAt.getTime();
    if (elapsed > PAYMENT_TTL_MS) {
      paymentStatus = "expired";
      await db.update(ordersTable).set({ paymentStatus: "expired", updatedAt: new Date() }).where(eq(ordersTable.id, orderId));
    }
  }

  const isWalletOrCash = order.paymentMethod === "wallet" || order.paymentMethod === "cash";
  const effectivePaymentStatus = isWalletOrCash
    ? (order.status === "cancelled" ? "refunded" : "settled")
    : paymentStatus;

  sendSuccess(res, {
    orderId: order.id,
    orderStatus: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: effectivePaymentStatus,
    status: effectivePaymentStatus,
    total: order.total ? parseFloat(String(order.total)) : null,
    txnRef: order.txnRef,
    confirmed: order.status !== "pending" || isWalletOrCash,
  }, effectivePaymentStatus === "settled" || effectivePaymentStatus === "success"
    ? "Payment confirmed" : effectivePaymentStatus === "expired"
    ? "Payment session expired" : effectivePaymentStatus === "failed"
    ? "Payment failed or was cancelled" : "Awaiting payment confirmation");
}

router.get("/:orderId/status", customerAuth, handleOrderPaymentStatus);
router.get("/order-status/:orderId", customerAuth, handleOrderPaymentStatus);

export default router;
