import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  walletTransactionsTable,
  notificationsTable,
  adminAccountsTable,
} from "@workspace/db/schema";
import { eq, desc, count, sum, and, gte, lte, sql, or, ilike, asc, isNull, isNotNull, avg, ne } from "drizzle-orm";
import {
  stripUser, generateId, getUserLanguage, t,
  getPlatformSettings, adminAuth, getAdminSecret,
  sendUserNotification, logger,
  ORDER_NOTIF_KEYS, RIDE_NOTIF_KEYS, PHARMACY_NOTIF_KEYS, PARCEL_NOTIF_KEYS,
  checkAdminLoginLockout, recordAdminLoginFailure, resetAdminLoginAttempts,
  addAuditEntry, addSecurityEvent, getClientIp,
  signAdminJwt, verifyAdminJwt, invalidateSettingsCache, getCachedSettings,
  ADMIN_TOKEN_TTL_HRS, verifyTotpToken, verifyAdminSecret,
  ensureDefaultRideServices, ensureDefaultLocations, formatSvc,
  type AdminRequest, adminLoginAttempts, ADMIN_MAX_ATTEMPTS,
} from "../admin-shared.js";
import { hashAdminSecret } from "../../services/password.js";
import { generateTotpSecret, verifyTotpToken as verifyTotp, generateQRCodeDataURL, getTotpUri } from "../../services/totp.js";
import { writeAuthAuditLog } from "../../middleware/security.js";
import { sendSuccess, sendError, sendNotFound, sendForbidden, sendUnauthorized, sendValidationError } from "../../lib/response.js";

const router = Router();
router.post("/auth", async (req, res) => {
  const { secret } = req.body;
  const ip = getClientIp(req);
  const ADMIN_SECRET = await getAdminSecret();

  const isLocked = await checkAdminLoginLockout(ip);
  if (isLocked) {
    addSecurityEvent({ type: "admin_login_locked", ip, details: `Locked admin login attempt from ${ip}`, severity: "high" });
    res.status(429).json({ error: `Too many failed attempts. Try again in 15 minute(s).` });
    return;
  }

  /* ── Attempt master secret login ── */
  if (secret === ADMIN_SECRET) {
    resetAdminLoginAttempts(ip);
    const adminToken = signAdminJwt(null, "super", "Super Admin", ADMIN_TOKEN_TTL_HRS);
    addAuditEntry({ action: "admin_login_success", ip, details: "Master admin login — JWT issued", result: "success" });
    writeAuthAuditLog("admin_login", { ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { role: "super" } });
    res.json({ success: true, token: adminToken, expiresIn: `${ADMIN_TOKEN_TTL_HRS}h` });
    return;
  }

  /* ── Attempt sub-admin login via stored secret (bcrypt, legacy scrypt, or plaintext fallback) ── */
  const activeSubs2 = await db.select().from(adminAccountsTable)
    .where(eq(adminAccountsTable.isActive, true));
  const sub = activeSubs2.find((s: { id: string; secret: string; role: string; name: string; isActive: boolean; lastLoginAt: Date | null; permissions: string }) => { try { const bcrypt = require("bcryptjs"); return bcrypt.compareSync(secret || "", s.secret); } catch { return false; } });

  if (sub) {
    resetAdminLoginAttempts(ip);
    const adminToken = signAdminJwt(sub.id, sub.role, sub.name, ADMIN_TOKEN_TTL_HRS);
    await db.update(adminAccountsTable).set({ lastLoginAt: new Date() }).where(eq(adminAccountsTable.id, sub.id));
    addAuditEntry({ action: "admin_login_success", ip, adminId: sub.id, details: `Sub-admin ${sub.name} login — JWT issued`, result: "success" });
    writeAuthAuditLog("admin_login", { ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { adminId: sub.id, role: sub.role } });
    res.json({ success: true, token: adminToken, expiresIn: `${ADMIN_TOKEN_TTL_HRS}h` });
    return;
  }

  recordAdminLoginFailure(ip);
  const rec = adminLoginAttempts.get(ip);
  const remaining = Math.max(0, ADMIN_MAX_ATTEMPTS - (rec?.count ?? 0));
  addAuditEntry({ action: "admin_login_failed", ip, details: "Wrong admin secret", result: "fail" });
  addSecurityEvent({ type: "admin_login_failed", ip, details: `Failed admin login attempt from ${ip}`, severity: "high" });
  if (remaining === 0) {
    res.status(429).json({ error: `Too many failed attempts. Account locked for 15 minutes.` });
  } else {
    res.status(401).json({ error: `Invalid admin password. ${remaining} attempt(s) remaining.` });
  }
});

router.use(adminAuth);
router.get("/admin-accounts", async (_req, res) => {
  const accounts = await db.select({
    id: adminAccountsTable.id,
    name: adminAccountsTable.name,
    role: adminAccountsTable.role,
    permissions: adminAccountsTable.permissions,
    isActive: adminAccountsTable.isActive,
    lastLoginAt: adminAccountsTable.lastLoginAt,
    createdAt: adminAccountsTable.createdAt,
  }).from(adminAccountsTable).orderBy(desc(adminAccountsTable.createdAt));
  res.json({
    accounts: accounts.map(a => ({
      ...a,
      lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

router.post("/admin-accounts", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  if (!body.name || !body.secret) { res.status(400).json({ error: "name and secret required" }); return; }
  if (body.secret === getAdminSecret()) { res.status(400).json({ error: "Cannot use the master secret" }); return; }
  try {
    const [account] = await db.insert(adminAccountsTable).values({
      id:          generateId(),
      name:        body.name as string,
      secret:      hashAdminSecret(body.secret as string),
      role:        (body.role as string)        || "manager",
      permissions: (body.permissions as string) || "",
      isActive:    body.isActive !== false,
    }).returning();
    res.status(201).json({ ...account, secret: "••••••", createdAt: account.createdAt.toISOString() });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "23505") { res.status(409).json({ error: "Secret already in use" }); return; }
    throw e;
  }
});

router.patch("/admin-accounts/:id", async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, any> = {};
  if (body.name        !== undefined) updates.name        = body.name;
  if (body.role        !== undefined) updates.role        = body.role;
  if (body.permissions !== undefined) updates.permissions = body.permissions;
  if (body.isActive    !== undefined) updates.isActive    = body.isActive;
  if (body.secret      !== undefined) {
    if (body.secret === getAdminSecret()) { res.status(400).json({ error: "Cannot use the master secret" }); return; }
    updates.secret = hashAdminSecret(body.secret as string);
  }
  const [account] = await db.update(adminAccountsTable).set(updates).where(eq(adminAccountsTable.id, req.params["id"]!)).returning();
  if (!account) { res.status(404).json({ error: "Admin account not found" }); return; }
  res.json({ ...account, secret: "••••••", createdAt: account.createdAt.toISOString() });
});

router.delete("/admin-accounts/:id", async (req, res) => {
  await db.delete(adminAccountsTable).where(eq(adminAccountsTable.id, req.params["id"]!));
  res.json({ success: true });
});

/* ── POST /admin-accounts/:id/send-reset-link
   Generates a password reset token for an admin account.
   Since legacy admin-accounts use a shared secret (not email/password),
   this returns a one-time reset URL the super-admin can share manually. */
router.post("/admin-accounts/:id/send-reset-link", adminAuth, async (req, res) => {
  try {
    const adminRole = (req as AdminRequest).adminRole;
    if (adminRole !== "super") {
      res.status(403).json({ error: "Only super admin can send reset links." });
      return;
    }
    const [account] = await db.select().from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, req.params["id"]!)).limit(1);
    if (!account) { res.status(404).json({ error: "Admin account not found" }); return; }

    const crypto = await import("node:crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const resetUrl = `${process.env["APP_BASE_URL"] || process.env["ADMIN_BASE_URL"] || ""}/admin/set-new-password?token=${token}&account=${account.id}`;

    addAuditEntry({
      action: "admin_reset_link_sent",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Reset link generated for admin account ${account.name} (${account.id})`,
      result: "success",
    });

    res.json({ success: true, resetUrl, message: "Reset link generated. Share this URL with the admin user directly." });
  } catch (e) {
    res.status(500).json({ error: "Failed to generate reset link" });
  }
});

/* ── App Management ── */
router.post("/rotate-secret", adminAuth, (req, res) => {
  const adminRole = (req as AdminRequest).adminRole;
  if (adminRole !== "super") {
    res.status(403).json({ error: "Only super admin can rotate the master secret." });
    return;
  }

  /* The new secret must be provided in the request body.
     The actual env var rotation must be done by the operator, but this
     endpoint validates the new secret and returns guidance. */
  const { newSecret } = req.body;
  if (!newSecret || newSecret.length < 32) {
    res.status(400).json({ error: "New secret must be at least 32 characters." });
    return;
  }

  const ip = getClientIp(req);
  addAuditEntry({ action: "admin_secret_rotation_requested", ip, details: "Admin requested secret rotation", result: "success" });
  writeAuthAuditLog("admin_secret_rotation", { ip, metadata: { note: "Secret rotation requested — update ADMIN_SECRET env var" } });

  res.json({
    success: true,
    message: "Set the new secret as the ADMIN_SECRET environment variable and restart the server to apply the rotation.",
    instructions: "New secret validated — it meets the minimum length requirement (32+ chars).",
  });
});

router.get("/me/language", adminAuth, async (req, res) => {
  const adminId = req.adminId;
  if (!adminId) {
    res.json({ language: null });
    return;
  }
  const [admin] = await db.select({ language: adminAccountsTable.language }).from(adminAccountsTable).where(eq(adminAccountsTable.id, adminId)).limit(1);
  res.json({ language: admin?.language ?? null });
});

/* PUT /admin/me/language — save current admin's language preference */
router.put("/me/language", adminAuth, async (req, res) => {
  const adminId = req.adminId;
  if (!adminId) {
    res.json({ success: false, note: "Super admin language is managed locally" });
    return;
  }
  const { language } = req.body as { language?: string };
  if (!language) { res.status(400).json({ error: "language required" }); return; }
  const VALID = new Set(["en", "ur", "roman", "en_roman", "en_ur"]);
  if (!VALID.has(language)) { res.status(400).json({ error: "Invalid language" }); return; }
  await db.update(adminAccountsTable).set({ language }).where(eq(adminAccountsTable.id, adminId));
  res.json({ success: true, language });
});

/* GET /admin/mfa/status — check if MFA is set up for the current sub-admin */
router.get("/mfa/status", adminAuth, async (req, res) => {
  const adminId = req.adminId!;
  if (!adminId) {
    res.json({ mfaEnabled: false, note: "Super admin does not use TOTP." });
    return;
  }
  const [admin] = await db.select().from(adminAccountsTable).where(eq(adminAccountsTable.id, adminId)).limit(1);
  if (!admin) { res.status(404).json({ error: "Admin account not found" }); return; }
  res.json({
    mfaEnabled: admin.totpEnabled,
    totpConfigured: !!admin.totpSecret,
  });
});

/* POST /admin/mfa/setup — generate a TOTP secret and QR code (step 1 of MFA setup) */
router.post("/mfa/setup", adminAuth, async (req, res) => {
  const adminId   = req.adminId!;
  const adminName = req.adminName! ?? "Admin";
  if (!adminId) {
    res.status(400).json({ error: "Super admin does not need TOTP setup." });
    return;
  }

  const secret    = generateTotpSecret();
  const qrCodeUrl = await generateQRCodeDataURL(secret, adminName);
  const otpUri    = getTotpUri(secret, adminName);

  /* Store secret but don't enable TOTP yet — must be verified first */
  await db.update(adminAccountsTable)
    .set({ totpSecret: secret, totpEnabled: false })
    .where(eq(adminAccountsTable.id, adminId));

  addAuditEntry({ action: "mfa_setup_initiated", ip: req.adminIp!, adminId, details: `MFA setup started for ${adminName}`, result: "success" });

  res.json({
    secret,
    otpUri,
    qrCodeDataUrl: qrCodeUrl,
    instructions: "Scan the QR code with Google Authenticator or Authy. Then call POST /admin/mfa/verify with a valid token to activate MFA.",
  });
});

/* POST /admin/mfa/verify — verify a TOTP token to activate MFA */
router.post("/mfa/verify", adminAuth, async (req, res) => {
  const adminId   = req.adminId!;
  const adminName = req.adminName! ?? "Admin";
  if (!adminId) {
    res.status(400).json({ error: "Super admin does not use TOTP." });
    return;
  }

  const { token } = req.body as { token: string };
  if (!token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  const [admin] = await db.select().from(adminAccountsTable).where(eq(adminAccountsTable.id, adminId)).limit(1);
  if (!admin || !admin.totpSecret) {
    res.status(400).json({ error: "TOTP not set up yet. Call POST /admin/mfa/setup first." });
    return;
  }

  if (admin.totpEnabled) {
    res.json({ success: true, message: "MFA is already active." });
    return;
  }

  const valid = verifyTotpToken(token, admin.totpSecret);
  if (!valid) {
    addAuditEntry({ action: "mfa_verify_failed", ip: req.adminIp!, adminId, details: `MFA verify failed for ${adminName}`, result: "fail" });
    res.status(401).json({ error: "Invalid TOTP token. Please try again." });
    return;
  }

  await db.update(adminAccountsTable)
    .set({ totpEnabled: true })
    .where(eq(adminAccountsTable.id, adminId));

  addAuditEntry({ action: "mfa_activated", ip: req.adminIp!, adminId, details: `MFA activated for ${adminName}`, result: "success" });

  res.json({ success: true, message: "MFA successfully activated. You must now provide x-admin-totp with every request when global MFA is enabled." });
});

/* DELETE /admin/mfa/disable — disable MFA (requires current valid TOTP or super admin) */
router.delete("/mfa/disable", adminAuth, async (req, res) => {
  const adminId   = req.adminId!;
  const adminName = req.adminName! ?? "Admin";
  if (!adminId) {
    res.status(400).json({ error: "Super admin does not use TOTP." });
    return;
  }

  const { token } = req.body as { token?: string };
  const [admin]   = await db.select().from(adminAccountsTable).where(eq(adminAccountsTable.id, adminId)).limit(1);
  if (!admin) { res.status(404).json({ error: "Admin not found" }); return; }

  if (admin.totpEnabled && admin.totpSecret) {
    if (!token || !verifyTotpToken(token, admin.totpSecret)) {
      res.status(401).json({ error: "Valid TOTP token required to disable MFA." });
      return;
    }
  }

  await db.update(adminAccountsTable)
    .set({ totpSecret: null, totpEnabled: false })
    .where(eq(adminAccountsTable.id, adminId));

  addAuditEntry({ action: "mfa_disabled", ip: req.adminIp!, adminId, details: `MFA disabled for ${adminName}`, result: "warn" });

  res.json({ success: true, message: "MFA has been disabled for your account." });
});



export default router;
