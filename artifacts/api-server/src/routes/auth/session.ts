import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  checkLockout,
  addSecurityEvent,
  getClientIp,
  getCachedSettings,
  writeAuthAuditLog,
  verifyCaptcha,
} from "../../middleware/security.js";
import { sendOtpSMS } from "../../services/sms.js";
import { sendWhatsAppOTP } from "../../services/whatsapp.js";
import { sendPasswordResetEmail } from "../../services/email.js";
import { getUserLanguage } from "../../lib/getUserLanguage.js";
import { logger } from "../../lib/logger.js";
import { canonicalizePhone } from "@workspace/phone-utils";
import { isAuthMethodEnabled } from "@workspace/auth-utils/server";
import { validateBody as sharedValidateBody } from "../../middleware/validate.js";
import { getWhitelistBypass } from "../../services/smsGateway.js";
import { generateSecureOtp } from "../../services/password.js";
import {
  AUTH_OTP_TTL_MS,
  hashOtp,
  checkIdentifierSchema,
  extractAuthUser,
} from "./helpers.js";
import { generateId } from "../../lib/id.js";

const router: IRouter = Router();

/* ══════════════════════════════════════════════════════════════
   GET /auth/config
══════════════════════════════════════════════════════════════ */
router.get("/config", async (_req, res) => {
  try {
    const settings = await getCachedSettings();

    const otpGlobalDisabledUntilStr = settings["otp_global_disabled_until"];
    const now = new Date();
    let otpBypassActive = false;
    let otpBypassExpiresAt: string | null = null;

    if (otpGlobalDisabledUntilStr) {
      try {
        const disabledUntil = new Date(otpGlobalDisabledUntilStr);
        if (disabledUntil > now) {
          otpBypassActive = true;
          otpBypassExpiresAt = disabledUntil.toISOString();
        }
      } catch (e) {
        logger.error({ error: e }, "[/auth/config] Failed to parse OTP bypass timestamp");
      }
    }

    const bypassMessage = settings["otp_bypass_message"] ?? null;

    res.json({
      auth_mode:             settings["auth_mode"]             ?? "OTP",
      firebase_enabled:      settings["firebase_enabled"]      ?? "off",
      auth_otp_enabled:      settings["auth_otp_enabled"]      ?? "on",
      auth_email_enabled:    settings["auth_email_enabled"]    ?? "on",
      auth_google_enabled:   settings["auth_google_enabled"]   ?? "on",
      auth_facebook_enabled: settings["auth_facebook_enabled"] ?? "off",
      otpBypassActive,
      otpBypassExpiresAt,
      bypassMessage,
    });
  } catch (e) {
    logger.error({ error: e }, "[/auth/config] Failed to get config");
    res.json({
      auth_mode: "OTP",
      firebase_enabled: "off",
      auth_otp_enabled: "on",
      auth_email_enabled: "on",
      auth_google_enabled: "on",
      auth_facebook_enabled: "off",
      otpBypassActive: false,
      otpBypassExpiresAt: null,
      bypassMessage: null,
    });
  }
});

/* ══════════════════════════════════════════════════════════════
   GET /auth/otp-status?phone=...
══════════════════════════════════════════════════════════════ */
router.get("/otp-status", async (req, res) => {
  try {
    const rawPhone = (req.query.phone as string | undefined) ?? "";
    if (!rawPhone || rawPhone.length < 7) {
      res.status(400).json({ error: "phone query parameter is required" });
      return;
    }

    const phone = canonicalizePhone(rawPhone);
    const settings = await getCachedSettings();
    const now = new Date();

    let bypassActive = false;
    let bypassExpiresAt: string | null = null;
    let message: string | null = (settings["otp_bypass_message"] as string | undefined) ?? null;

    const [userRow] = await db
      .select({ otpBypassUntil: usersTable.otpBypassUntil })
      .from(usersTable)
      .where(eq(usersTable.phone, phone))
      .limit(1);

    if (userRow?.otpBypassUntil && userRow.otpBypassUntil > now) {
      bypassActive = true;
      bypassExpiresAt = userRow.otpBypassUntil.toISOString();
    }

    if (!bypassActive && settings["security_otp_bypass"] === "on") {
      bypassActive = true;
      bypassExpiresAt = null;
    }

    if (!bypassActive) {
      const disabledUntilStr = settings["otp_global_disabled_until"];
      if (disabledUntilStr) {
        const disabledUntil = new Date(disabledUntilStr);
        if (disabledUntil > now) {
          bypassActive = true;
          bypassExpiresAt = disabledUntil.toISOString();
        }
      }
    }

    if (!bypassActive) {
      const whitelistCode = await getWhitelistBypass(phone);
      if (whitelistCode !== null) {
        bypassActive = true;
        bypassExpiresAt = null;
        message = null;
      }
    }

    res.json({ bypassActive, bypassExpiresAt, message });
  } catch (e) {
    logger.error({ error: e }, "[/auth/otp-status] Failed");
    res.json({ bypassActive: false, bypassExpiresAt: null, message: null });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/check-identifier
══════════════════════════════════════════════════════════════ */
const checkIdentifierLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many identifier checks. Please wait a minute before trying again." },
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => getClientIp(req),
});

router.post("/check-identifier", checkIdentifierLimiter, sharedValidateBody(checkIdentifierSchema), async (req, res) => {
  const { identifier, role, deviceId } = req.body;

  const ip          = getClientIp(req);
  const settings    = await getCachedSettings();
  const userRole    = (role === "rider" || role === "vendor") ? role : "customer";
  const registrationOpen = settings["feature_new_users"] !== "off";

  let user: (typeof usersTable.$inferSelect) | undefined;

  const looksLikePhone = /^[\d\s\-+()]{7,15}$/.test(identifier.trim());
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());

  if (looksLikePhone) {
    const phone = canonicalizePhone(identifier);
    const rows = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    user = rows[0];
  } else if (looksLikeEmail) {
    const rows = await db.select().from(usersTable).where(eq(usersTable.email, identifier.trim().toLowerCase())).limit(1);
    user = rows[0];
  } else {
    const rows = await db.select().from(usersTable).where(sql`lower(${usersTable.username}) = ${identifier.trim().toLowerCase()}`).limit(1);
    user = rows[0];
  }

  const exists    = !!user;
  const isNewUser = !exists;

  if (!looksLikePhone && !looksLikeEmail) {
    if (user?.isBanned) {
      addSecurityEvent({ type: "banned_user_identifier_check", ip, userId: user.id, details: `Banned user check: ${identifier}`, severity: "medium" });
      res.json({ isBanned: true, action: "blocked", availableMethods: [] });
      return;
    }
    const maxAttempts    = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
    const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);
    const lockoutKey     = identifier.trim();
    const lockout        = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
    if (lockout.locked) {
      res.json({ isLocked: true, lockedMinutes: lockout.minutesLeft, action: "locked", availableMethods: [] });
      return;
    }
  } else {
    if (user?.isBanned) {
      addSecurityEvent({ type: "banned_user_identifier_check", ip, userId: user.id, details: `Banned user phone/email check: ${identifier}`, severity: "medium" });
    }
  }

  const effectiveCheckRole = (looksLikePhone || looksLikeEmail) ? userRole : (user?.roles ?? userRole);
  const googleEnabled    = isAuthMethodEnabled(settings, "auth_google_enabled", effectiveCheckRole);
  const facebookEnabled  = isAuthMethodEnabled(settings, "auth_facebook_enabled", effectiveCheckRole);
  const phoneOtpEnabled  = isAuthMethodEnabled(settings, "auth_phone_otp_enabled", effectiveCheckRole);
  const emailOtpEnabled  = isAuthMethodEnabled(settings, "auth_email_otp_enabled", effectiveCheckRole);
  const passwordEnabled  = isAuthMethodEnabled(settings, "auth_username_password_enabled", effectiveCheckRole);
  const magicLinkEnabled = isAuthMethodEnabled(settings, "auth_magic_link_enabled", effectiveCheckRole);

  const availableMethods: string[] = [];
  if (phoneOtpEnabled)  availableMethods.push("phone_otp");
  if (emailOtpEnabled)  availableMethods.push("email_otp");
  if (passwordEnabled)  availableMethods.push("password");
  if (googleEnabled)    availableMethods.push("google");
  if (facebookEnabled)  availableMethods.push("facebook");
  if (magicLinkEnabled) availableMethods.push("magic_link");

  let action: string;
  let noMethodReason: string | undefined;
  let responseAvailableMethods: string[] = availableMethods;

  if (looksLikePhone) {
    if (phoneOtpEnabled) {
      action = "send_phone_otp";
    } else {
      action = "no_method";
      noMethodReason = "phone_disabled";
    }
  } else if (looksLikeEmail) {
    if (emailOtpEnabled)       action = "send_email_otp";
    else if (magicLinkEnabled) action = "send_magic_link";
    else { action = "no_method"; noMethodReason = "email_disabled"; }
  } else {
    const usableMethods = availableMethods.filter(m => {
      if (m === "password") return !!user?.passwordHash;
      return true;
    });
    responseAvailableMethods = exists ? usableMethods : availableMethods;

    if (!registrationOpen && !exists) {
      action = "registration_closed";
    } else if (!exists) {
      action = "register";
    } else if (passwordEnabled && user?.passwordHash) {
      action = "login_password";
    } else if (usableMethods.length > 0) {
      const first = usableMethods[0]!;
      action = first === "password" ? "login_password"
             : first === "phone_otp" ? "send_phone_otp"
             : first === "email_otp" ? "send_email_otp"
             : first === "magic_link" ? "send_magic_link"
             : "no_method";
      if (action === "no_method") noMethodReason = "all_disabled";
    } else {
      action = "no_method";
      noMethodReason = exists && !user?.passwordHash ? "password_disabled" : "all_disabled";
    }
  }

  const whatsappOn = settings["integration_whatsapp"] === "on";
  const smsOn      = phoneOtpEnabled;
  const otpChannels: string[] = [];
  if (whatsappOn) otpChannels.push("whatsapp");
  if (smsOn)      otpChannels.push("sms");

  res.json({
    registrationOpen,
    action,
    reason: noMethodReason,
    availableMethods: responseAvailableMethods,
    isBanned:  false,
    isLocked:  false,
    otpChannels,
  });
});

/* ─────────────────────────────────────────────────────────────
   POST /auth/send-merge-otp
───────────────────────────────────────────────────────────── */
router.post("/send-merge-otp", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const { identifier } = req.body;
  if (!identifier) { res.status(400).json({ error: "Identifier is required" }); return; }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  const looksLikePhone = /^[\d\s\-+()]{7,15}$/.test(identifier.trim());
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());

  if (!looksLikePhone && !looksLikeEmail) {
    res.status(400).json({ error: "Identifier must be a phone number or email address" });
    return;
  }

  if (looksLikePhone) {
    const phone = canonicalizePhone(identifier);
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existing) { res.status(409).json({ error: "This phone number is already linked to another account" }); return; }
  } else {
    const email = identifier.trim().toLowerCase();
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) { res.status(409).json({ error: "This email is already linked to another account" }); return; }
  }

  const otp = generateSecureOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  const normalizedIdentifier = looksLikePhone ? canonicalizePhone(identifier) : identifier.trim().toLowerCase();
  await db.update(usersTable).set({ mergeOtpCode: hashOtp(otp), mergeOtpExpiry: otpExpiry, pendingMergeIdentifier: normalizedIdentifier, updatedAt: new Date() }).where(eq(usersTable.id, auth.userId));

  if (looksLikePhone) {
    const phone = canonicalizePhone(identifier);
    const lang = await getUserLanguage(auth.userId);
    const whatsappEnabled = settings["integration_whatsapp"] === "on";
    let sent = false;
    if (whatsappEnabled) {
      const waResult = await sendWhatsAppOTP(phone, otp, settings, lang);
      if (waResult.sent) sent = true;
    }
    if (!sent) {
      await sendOtpSMS(phone, otp, settings, lang);
    }
    res.json({ message: "OTP sent to phone" });
  } else {
    const email = identifier.trim().toLowerCase();
    const lang = await getUserLanguage(auth.userId);
    const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
    await sendPasswordResetEmail(email, otp, user?.name ?? undefined, lang);
    res.json({ message: "OTP sent to email" });
  }

  writeAuthAuditLog("merge_otp_sent", { ip, userId: auth.userId, userAgent: req.headers["user-agent"] ?? undefined, metadata: { identifier } });
});

/* ─────────────────────────────────────────────────────────────
   POST /auth/merge-account
───────────────────────────────────────────────────────────── */
router.post("/merge-account", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const { identifier, otp } = req.body;
  if (!identifier || !otp) { res.status(400).json({ error: "Identifier and OTP are required" }); return; }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  const looksLikePhone = /^[\d\s\-+()]{7,15}$/.test(identifier.trim());
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());

  if (!looksLikePhone && !looksLikeEmail) {
    res.status(400).json({ error: "Identifier must be a phone number or email address" });
    return;
  }

  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
  if (!currentUser) { res.status(404).json({ error: "User not found" }); return; }

  const normalizedIdentifier = looksLikePhone ? canonicalizePhone(identifier) : identifier.trim().toLowerCase();

  if (currentUser.mergeOtpCode !== hashOtp(otp) || !currentUser.mergeOtpExpiry || currentUser.mergeOtpExpiry < new Date()) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  if (currentUser.pendingMergeIdentifier !== normalizedIdentifier) {
    res.status(400).json({ error: "OTP was not issued for this identifier" });
    return;
  }

  if (looksLikePhone) {
    const phone = normalizedIdentifier;
    if (currentUser.phone === phone) { res.status(400).json({ error: "This phone is already linked to your account" }); return; }

    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    if (existing) { res.status(409).json({ error: "This phone number is already linked to another account" }); return; }

    await db.update(usersTable).set({ phone, mergeOtpCode: null, mergeOtpExpiry: null, phoneVerified: true, pendingMergeIdentifier: null, updatedAt: new Date() }).where(eq(usersTable.id, auth.userId));

    writeAuthAuditLog("account_merge_phone", { ip, userId: auth.userId, userAgent: req.headers["user-agent"] ?? undefined, metadata: { phone } });
    res.json({ success: true, message: "Phone number linked successfully", linked: "phone" });
  } else {
    const email = normalizedIdentifier;
    if (currentUser.email === email) { res.status(400).json({ error: "This email is already linked to your account" }); return; }

    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) { res.status(409).json({ error: "This email is already linked to another account" }); return; }

    await db.update(usersTable).set({ email, mergeOtpCode: null, mergeOtpExpiry: null, emailVerified: true, pendingMergeIdentifier: null, updatedAt: new Date() }).where(eq(usersTable.id, auth.userId));

    writeAuthAuditLog("account_merge_email", { ip, userId: auth.userId, userAgent: req.headers["user-agent"] ?? undefined, metadata: { email } });
    res.json({ success: true, message: "Email linked successfully", linked: "email" });
  }
});

export default router;
