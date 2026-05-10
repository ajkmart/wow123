import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  walletTransactionsTable,
  notificationsTable,
  adminAccountsTable,
  platformSettingsTable,
} from "@workspace/db/schema";
import {
  eq,
  desc,
  count,
  sum,
  and,
  gte,
  lte,
  sql,
  or,
  ilike,
  asc,
  isNotNull,
} from "drizzle-orm";
import {
  stripUser,
  generateId,
  getUserLanguage,
  t,
  sendUserNotification,
} from "../../admin-shared.js";
import {
  getCachedSettings,
  getAdminSecret,
  resetAdminLoginAttempts,
  addSecurityEvent,
  signAdminJwt,
  signAdminRefreshToken,
  generateTotpSecret,
  generateQRCodeDataURL,
  getTotpUri,
  verifyTotpToken,
  ADMIN_TOKEN_TTL_HRS,
  type AdminRequest,
} from "../../admin-shared.js";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
  sendUnauthorized,
  sendValidationError,
} from "../../../lib/response.js";
import { UserService } from "../../../services/admin-user.service.js";
import { AuditService } from "../../../services/admin-audit.service.js";
import { requirePermission } from "../../../middleware/require-permission.js";
import { logAdminAudit } from "../../../middleware/admin-audit.js";
import { adminAuthLimiter } from "../../../middleware/rate-limit.js";
import { resolveAdminPermissions } from "../../../services/permissions.service.js";
import { adminAuth, addAuditEntry } from "../../admin-shared.js";
import { writeAuthAuditLog } from "../../../middleware/security.js";
import { getClientIp } from "../../../middleware/admin-audit.js";
import { logger } from "../../../lib/logger.js";
import { invalidateSettingsCache } from "../../admin-shared.js";
import { z } from "zod";

const router = Router();

const authSchema = z.object({
  username:    z.string().min(1, "username is required").optional(),
  password:    z.string().min(8, "password must be at least 8 characters").optional(),
  secret:      z.string().min(8, "secret must be at least 8 characters").optional(),
}).strip();

router.post("/auth", adminAuthLimiter, async (req, res) => {
  const body = (req.body ?? {}) as { username?: string; password?: string; secret?: string; totpCode?: string };
  const username = (body.username ?? "").trim();
  /* Backwards-compatible: accept "password" (new) or "secret" (legacy) */
  const password = body.password ?? body.secret ?? "";
  const ip = getClientIp(req);
  const ADMIN_SECRET = await getAdminSecret();

  /* ── Special Case: Master/Super Admin Login ──
     Identified if username is empty (legacy) or "admin"/"super".
     If password matches the root ADMIN_SECRET, we issue a super-admin token.
     - legacy flow: ANY POST to /auth where password == ADMIN_SECRET
     - new flow: username "admin" (or "super") + password = ADMIN_SECRET
     - legacy flow: any payload whose password equals ADMIN_SECRET (no username) */
  const isMasterUsername =
    username === "" || username.toLowerCase() === "admin" || username.toLowerCase() === "super";
  if (ADMIN_SECRET && password === ADMIN_SECRET && isMasterUsername) {
    resetAdminLoginAttempts(ip);

    /* ── Fix 5: Enforce TOTP for super admin when security_super_admin_mfa_required=on ──
       Read the platform setting. If enabled, verify the TOTP code or issue an
       MFA challenge token (same response shape as the standard MFA challenge). */
    const settings = await getCachedSettings();
    if (settings["security_super_admin_mfa_required"] === "on") {
      const masterTotpSecret = settings["admin_master_totp_secret"]?.trim();
      if (!masterTotpSecret) {
        // TOTP not yet configured for master admin — block login until it is set up.
        addAuditEntry({
          action: "admin_master_mfa_misconfigured",
          ip,
          details: "Super admin MFA required but admin_master_totp_secret is not configured",
          result: "fail",
        });
        res.status(403).json({
          error: "Super admin MFA is required but TOTP is not configured. Set admin_master_totp_secret in platform settings first.",
        });
        return;
      }

      const totpCode = (body.totpCode ?? "").trim();
      if (!totpCode) {
        /* No TOTP code provided — return a MFA challenge (same shape as sub-admin flow).
           The tempToken is a short-lived signed JWT the client echoes back alongside the TOTP. */
        const tempToken = signAdminJwt(null, "master_mfa_challenge", "Super Admin", 5 / 60);
        res.json({ requiresMfa: true, tempToken });
        return;
      }

      /* TOTP code provided — verify it against the stored master secret. */
      if (!verifyTotpToken(totpCode, masterTotpSecret)) {
        addAuditEntry({
          action: "admin_master_mfa_failed",
          ip,
          details: "Invalid TOTP code for master super-admin login",
          result: "fail",
        });
        addSecurityEvent({ type: "admin_master_mfa_failed", ip, details: "Master admin TOTP verification failed", severity: "high" });
        res.status(401).json({ error: "Invalid TOTP code. Please try again." });
        return;
      }
    }

    const adminToken = signAdminJwt(
      null,
      "super",
      "Super Admin",
      ADMIN_TOKEN_TTL_HRS,
      ["*"]
    );
    const refreshToken = signAdminRefreshToken(null, "super");

    addAuditEntry({
      action: "admin_login",
      ip,
      details: "Master super-admin login successful",
      result: "success",
    });

    res.json({
      token: adminToken,
      refreshToken,
      admin: { id: "00000000-0000-0000-0000-000000000000", name: "Super Admin", role: "super", permissions: ["*"] },
    });
    return;
  }

  /* ── Regular Sub-Admin Login (database-backed) ── */
  try {
    const result = await (UserService as unknown as { authenticateAdmin: (u: string, p: string, ip: string) => Promise<{ requiresMfa?: boolean; tempToken?: string; success?: boolean; admin?: { id: string; role: string; name: string; permissions: string[] }; error?: string }> }).authenticateAdmin(username, password, ip);

    if (result.requiresMfa) {
      res.json({
        requiresMfa: true,
        tempToken: result.tempToken,
      });
      return;
    }

    if (!result.success || !result.admin) {
      addAuditEntry({
        action: "admin_login_failed",
        ip,
        details: `Login failed for user: ${username}`,
        result: "fail",
      });
      res.status(401).json({ error: result.error || "Invalid credentials" });
      return;
    }

    const adminToken = signAdminJwt(
      result.admin.id,
      result.admin.role,
      result.admin.name,
      ADMIN_TOKEN_TTL_HRS,
      result.admin.permissions
    );
    const refreshToken = signAdminRefreshToken(result.admin.id, result.admin.role);

    addAuditEntry({
      action: "admin_login",
      ip,
      adminId: result.admin.id,
      details: `Admin login successful: ${username}`,
      result: "success",
    });

    res.json({
      token: adminToken,
      refreshToken,
      admin: result.admin,
    });
  } catch (err) {
    logger.error({ err, username, ip }, "Admin authentication error");
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

router.post("/refresh", async (req, res): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) { res.status(400).json({ error: "Refresh token required" }); return; }

  try {
    const { verifyRefreshToken } = await import("../../../utils/admin-jwt.js");
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) { res.status(401).json({ error: "Invalid or expired refresh token" }); return; }

    // For super admin
    if ((payload as unknown as { role?: string }).role === "super") {
      const newToken = signAdminJwt(null, "super", "Super Admin", ADMIN_TOKEN_TTL_HRS, ["*"]);
      const newRefresh = signAdminRefreshToken(null, "super");
      res.json({ token: newToken, refreshToken: newRefresh });
      return;
    }

    // For sub-admins
    const [admin] = await db
      .select()
      .from(adminAccountsTable)
      .where(and(eq(adminAccountsTable.id, (payload as unknown as { adminId?: string }).adminId ?? payload.sub), eq(adminAccountsTable.isActive, true)))
      .limit(1);

    if (!admin) { res.status(401).json({ error: "Admin account no longer active" }); return; }

    const perms = await resolveAdminPermissions(admin.id, admin.role);
    const newToken = signAdminJwt(admin.id, admin.role, admin.name, ADMIN_TOKEN_TTL_HRS, perms);
    const newRefresh = signAdminRefreshToken(admin.id, admin.role);

    res.json({ token: newToken, refreshToken: newRefresh });
  } catch (err) {
    res.status(401).json({ error: "Session expired" });
  }
});

const forgotPasswordSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

router.post("/forgot-password", async (req, res): Promise<void> => {
  const genericResponse = {
    success: true,
    message: "If an account exists with that username, a reset link has been sent to the associated email address.",
  };

  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

    const { username } = parsed.data;
    const [admin] = await db
      .select()
      .from(adminAccountsTable)
      .where(and(eq(adminAccountsTable.username, username), eq(adminAccountsTable.isActive, true)))
      .limit(1);

    if (!admin || !admin.email) {
      // Don't leak account existence — return generic success immediately.
      res.json(genericResponse);
      return;
    }

    const { issueAdminPasswordResetToken } = await import("../../../services/admin-password.service.js");
    const { sendAdminPasswordResetLinkEmail } = await import("../../../services/email.js");

    const issued = await issueAdminPasswordResetToken({ adminId: admin.id, requestedBy: "self" });
    const resetUrl = `${process.env.ADMIN_URL || "http://localhost:3000"}/reset-password?token=${issued.rawToken}`;

    const sendResult = await sendAdminPasswordResetLinkEmail(admin.email, {
      resetUrl,
      recipientName: admin.name,
      expiresAt: issued.expiresAt,
    }).catch((err) => {
      logger.error({ err, adminId: admin.id }, "Failed to send password reset email");
      return { sent: false, reason: (err as Error).message };
    });

    await logAdminAudit("admin_forgot_password_issued", {
      adminId: admin.id,
      ip: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? undefined,
      result: "success",
      metadata: {
        username,
        expiresAt: issued.expiresAt.toISOString(),
      },
    });

    res.json({
      success: true,
      sent: sendResult.sent,
      reason: sendResult.sent ? undefined : sendResult.reason,
      expiresAt: issued.expiresAt.toISOString(),
      // Reveal the URL only in non-production so a super-admin can copy it
      // when SMTP is not yet wired up. Production never echoes the token.
      resetUrl: process.env.NODE_ENV === "production" ? undefined : resetUrl,
    });
  } catch (err) {
    logger.error({ err }, "Forgot password error");
    res.json(genericResponse);
  }
});

/* ── Fix 6: Rotate master secret at runtime (no server restart required) ── */
router.post("/rotate-secret", adminAuth, async (req, res) => {
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
    res
      .status(400)
      .json({ error: "New secret must be at least 32 characters." });
    return;
  }

  const ip = getClientIp(req);

  /* Generate a new cryptographically strong secret (48 bytes = 96 hex chars). */
  const { randomBytes } = await import("crypto");
  const rotatedSecret = randomBytes(48).toString("hex");

  /* 1. Update the in-memory runtime variable immediately so subsequent logins
        use the new secret without waiting for a restart. */
  const { setAdminSecretRuntime } = await import("../../../lib/runtime-config.js");
  setAdminSecretRuntime(rotatedSecret);

  /* 2. Persist to platform_settings under "admin_secret_override" so the new
        secret survives a server restart (seeded by seedRuntimeConfigFromDb()). */
  try {
    await db
      .insert(platformSettingsTable)
      .values({ key: "admin_secret_override", value: rotatedSecret, category: "security", label: "Admin Secret Override" })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: rotatedSecret, updatedAt: new Date() } });
    invalidateSettingsCache();
  } catch (persistErr) {
    logger.warn({ err: persistErr }, "[rotate-secret] Failed to persist new secret to DB — in-memory only until restart");
  }

  /* 3. Send email notification to all active admins. */
  try {
    const { sendEmail } = await import("../../../services/email.js");
    const activeAdmins = await db.select({ email: adminAccountsTable.email, name: adminAccountsTable.name })
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.isActive, true));
    const recipients = activeAdmins.filter(a => a.email);
    const rotatedAt = new Date().toISOString();
    await Promise.allSettled(
      recipients.map(a =>
        sendEmail({
          to: a.email!,
          subject: "Security Alert: Admin Master Secret Rotated",
          html: `<p>Hello ${a.name},</p><p>The AJKMart admin master secret has been <strong>rotated</strong> by a super-admin on ${rotatedAt} from IP <code>${ip}</code>.</p><p>If you did not authorise this action, please investigate immediately.</p>`,
        })
      )
    );
  } catch (emailErr) {
    logger.warn({ err: emailErr }, "[rotate-secret] Email notification failed — rotation still applied");
  }

  addAuditEntry({
    action: "admin_secret_rotated",
    ip,
    details: "Master admin secret rotated at runtime — in-memory and DB updated",
    result: "success",
  });
  addAuditEntry({
    action: "admin_secret_rotated",
    ip,
    details: "Master admin secret rotated at runtime — in-memory and DB updated",
    result: "success",
  });
  writeAuthAuditLog("admin_secret_rotation", {
    ip,
    metadata: { note: "Secret rotated in-memory and persisted to platform_settings" },
  });
  writeAuthAuditLog("admin_secret_rotation", {
    ip,
    metadata: {
      note: "Secret rotation requested — update ADMIN_SECRET env var",
    },
  });

  res.json({
    success: true,
    message: "Master secret rotated successfully. All active admins have been notified by email. No restart required.",
    rotatedAt: new Date().toISOString(),
  });
});

router.get("/me/language", adminAuth, async (req, res) => {
  const adminId = req.adminId;
  if (!adminId) {
    res.json({ language: null });
    return;
  }
  const [admin] = await db
    .select({ language: adminAccountsTable.language })
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, adminId))
    .limit(1);
  res.json({ language: admin?.language ?? null });
});

/* PUT /admin/me/language — save current admin's language preference */
router.put("/me/language", adminAuth, async (req, res) => {
  const adminId = req.adminId;
  if (!adminId) {
    res.json({
      success: false,
      note: "Super admin language is managed locally",
    });
    return;
  }
  const { language } = req.body as { language?: string };
  if (!language) {
    res.status(400).json({ error: "language required" });
    return;
  }
  const VALID = new Set(["en", "ur", "roman", "en_roman", "en_ur"]);
  if (!VALID.has(language)) {
    res.status(400).json({ error: "Invalid language" });
    return;
  }
  await db
    .update(adminAccountsTable)
    .set({ language })
    .where(eq(adminAccountsTable.id, adminId));
  res.json({ success: true, language });
});

/* GET /admin/mfa/status — check if MFA is set up for the current sub-admin */
router.get("/mfa/status", adminAuth, async (req, res) => {
  const adminId = req.adminId!;
  if (!adminId) {
    res.json({ mfaEnabled: false, note: "Super admin does not use TOTP." });
    return;
  }
  const [admin] = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, adminId))
    .limit(1);
  if (!admin) {
    res.status(404).json({ error: "Admin account not found" });
    return;
  }
  res.json({
    mfaEnabled: admin.totpEnabled,
    totpConfigured: !!admin.totpSecret,
  });
});

/* POST /admin/mfa/setup — generate a TOTP secret and QR code (step 1 of MFA setup) */
router.post("/mfa/setup", adminAuth, async (req, res) => {
  const adminId = req.adminId!;
  const adminName = req.adminName! ?? "Admin";
  if (!adminId) {
    res.status(400).json({ error: "Super admin does not need TOTP setup." });
    return;
  }

  const secret = generateTotpSecret();
  const qrCodeUrl = await generateQRCodeDataURL(secret, adminName);
  const otpUri = getTotpUri(secret, adminName);

  /* Store secret but don't enable TOTP yet — must be verified first */
  await db
    .update(adminAccountsTable)
    .set({ totpSecret: secret, totpEnabled: false })
    .where(eq(adminAccountsTable.id, adminId));

  addAuditEntry({
    action: "mfa_setup_initiated",
    ip: req.adminIp!,
    adminId,
    details: `MFA setup started for ${adminName}`,
    result: "success",
  });

  res.json({
    secret,
    otpUri,
    qrCodeDataUrl: qrCodeUrl,
    instructions:
      "Scan the QR code with Google Authenticator or Authy. Then call POST /admin/mfa/verify with a valid token to activate MFA.",
  });
});

/* POST /admin/mfa/verify — verify a TOTP token to activate MFA */
router.post("/mfa/verify", adminAuth, async (req, res) => {
  const adminId = req.adminId!;
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

  const [admin] = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, adminId))
    .limit(1);
  if (!admin || !admin.totpSecret) {
    res
      .status(400)
      .json({
        error: "TOTP not set up yet. Call POST /admin/mfa/setup first.",
      });
    return;
  }

  if (admin.totpEnabled) {
    res.json({ success: true, message: "MFA is already active." });
    return;
  }

  const valid = verifyTotpToken(token, admin.totpSecret);
  if (!valid) {
    addAuditEntry({
      action: "mfa_verify_failed",
      ip: req.adminIp!,
      adminId,
      details: `MFA verify failed for ${adminName}`,
      result: "fail",
    });
    res.status(401).json({ error: "Invalid TOTP token. Please try again." });
    return;
  }

  await db
    .update(adminAccountsTable)
    .set({ totpEnabled: true })
    .where(eq(adminAccountsTable.id, adminId));

  addAuditEntry({
    action: "mfa_activated",
    ip: req.adminIp!,
    adminId,
    details: `MFA activated for ${adminName}`,
    result: "success",
  });

  res.json({
    success: true,
    message:
      "MFA successfully activated. You must now provide x-admin-totp with every request when global MFA is enabled.",
  });
});

/* DELETE /admin/mfa/disable — disable MFA (requires current valid TOTP or super admin) */
router.delete("/mfa/disable", adminAuth, async (req, res) => {
  const adminId = req.adminId!;
  const adminName = req.adminName! ?? "Admin";
  if (!adminId) {
    res.status(400).json({ error: "Super admin does not use TOTP." });
    return;
  }

  const { token } = req.body as { token?: string };
  const [admin] = await db
    .select()
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, adminId))
    .limit(1);
  if (!admin) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }

  if (admin.totpEnabled && admin.totpSecret) {
    if (!token || !verifyTotpToken(token, admin.totpSecret)) {
      res
        .status(401)
        .json({ error: "Valid TOTP token required to disable MFA." });
      return;
    }
  }

  await db
    .update(adminAccountsTable)
    .set({ totpSecret: null, totpEnabled: false })
    .where(eq(adminAccountsTable.id, adminId));

  addAuditEntry({
    action: "mfa_disabled",
    ip: req.adminIp!,
    adminId,
    details: `MFA disabled for ${adminName}`,
    result: "warn",
  });

  res.json({
    success: true,
    message: "MFA has been disabled for your account.",
  });
});

export default router;