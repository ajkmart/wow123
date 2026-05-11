import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, walletTransactionsTable, notificationsTable, refreshTokensTable, magicLinkTokensTable, rateLimitsTable, pendingOtpsTable, userSessionsTable, loginHistoryTable, riderProfilesTable, vendorProfilesTable } from "@workspace/db/schema";
import { eq, and, sql, lt, or, desc, ilike } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { getPlatformSettings } from "./admin.js";
import {
  checkLockout,
  recordFailedAttempt,
  resetAttempts,
  addAuditEntry,
  addSecurityEvent,
  getClientIp,
  getCachedSettings,
  signUserJwt,
  signAccessToken,
  sign2faChallengeToken,
  verify2faChallengeToken,
  generateRefreshToken,
  hashRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  verifyUserJwt,
  writeAuthAuditLog,
  REFRESH_TOKEN_TTL_DAYS,
  ACCESS_TOKEN_TTL_SEC,
  verifyCaptcha,
  checkAvailableRateLimit,
} from "../middleware/security.js";
import { sendOtpSMS } from "../services/sms.js";
import { sendWhatsAppOTP } from "../services/whatsapp.js";
import { randomBytes, createHash } from "crypto";
import { hashPassword, verifyPassword, validatePasswordStrength, generateSecureOtp } from "../services/password.js";
import { generateTotpSecret, verifyTotpToken, generateQRCodeDataURL, getTotpUri, encryptTotpSecret, decryptTotpSecret } from "../services/totp.js";
import { sendVerificationEmail, sendPasswordResetEmail, sendMagicLinkEmail, alertNewVendor } from "../services/email.js";
import { getUserLanguage, getPlatformDefaultLanguage } from "../lib/getUserLanguage.js";
import { t, type TranslationKey } from "@workspace/i18n";
import { logger } from "../lib/logger.js";
import { clearSpoofHits } from "./rider.js";
import { canonicalizePhone } from "@workspace/phone-utils";
import { validateBody as sharedValidateBody } from "../middleware/validate.js";

/* OTP rate limiting is handled per-account + per-IP inside the route handler
   using the admin-configurable settings (security_otp_max_per_phone,
   security_otp_max_per_ip, security_otp_window_min) via checkAndIncrOtpRateLimit(). */

/* ── OTP TTL ─────────────────────────────────────────────────
   All auth OTPs (phone, email, forgot-password) expire in 5 minutes.
   Account-merge OTPs use a longer 10-minute window.
   ──────────────────────────────────────────────────────────── */
const AUTH_OTP_TTL_MS = 5 * 60 * 1000;

/* ── Auth Zod schemas ─────────────────────────────────────────
   One schema per key endpoint. Extra/unknown fields are stripped.
   ──────────────────────────────────────────────────────────── */
const checkIdentifierSchema = z.object({
  identifier: z.string().min(3, "Identifier must be at least 3 characters"),
  role: z.enum(["customer", "rider", "vendor"]).optional(),
  deviceId: z.string().max(256).optional(),
}).strip();

const phoneSchema = z
  .string()
  .min(7, "Phone number is required")
  .max(20, "Phone number too long")
  .regex(/^[\d\s\-()+]{7,20}$/, "Phone number must contain only digits, spaces, dashes, or parentheses");

const sendOtpSchema = z.object({
  phone: phoneSchema,
  role: z.enum(["customer", "rider", "vendor"]).optional(),
  deviceId: z.string().max(256).optional(),
  preferredChannel: z.enum(["whatsapp", "sms", "email"]).optional(),
  captchaToken: z.string().optional(),
}).strip();

const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6, "OTP must be exactly 6 digits").regex(/^\d{6}$/, "OTP must be 6 digits"),
  deviceFingerprint: z.string().max(512).optional(),
  deviceId: z.string().max(256).optional(),
  role: z.enum(["customer", "rider", "vendor"]).optional(),
}).strip();

const loginSchema = z.object({
  identifier: z.string().min(3, "Identifier (phone, email, or username) is required").optional(),
  username: z.string().min(3).optional(),
  password: z.string().min(1, "Password is required"),
  deviceFingerprint: z.string().max(512).optional(),
  role: z.enum(["customer", "rider", "vendor"]).optional(),
}).strip().refine(d => d.identifier || d.username, {
  message: "Phone, email, or username is required",
  path: ["identifier"],
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10, "refreshToken is required"),
}).strip();

const forgotPasswordSchema = z.object({
  phone: z.string().min(7).optional(),
  email: z.string().email("Invalid email address").optional(),
  identifier: z.string().min(3).optional(),
}).strip().refine(d => d.phone || d.email || d.identifier, {
  message: "Phone, email, or username is required",
  path: ["phone"],
});

const registerSchema = z.object({
  phone: z.string().min(7, "Phone number is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().max(80).optional(),
  role: z.enum(["customer", "rider", "vendor"]).optional(),
  email: z.string().email().optional().or(z.literal("")),
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/, "Username can only contain lowercase letters, numbers, and underscores").optional(),
  cnic: z.string().regex(/^\d{5}-\d{7}-\d{1}$/, "CNIC format must be XXXXX-XXXXXXX-X").optional().or(z.literal("")),
  nationalId: z.string().optional(),
  vehicleType: z.string().optional(),
  vehicleRegNo: z.string().optional(),
  drivingLicense: z.string().optional(),
  address: z.string().max(255).optional(),
  city: z.string().max(80).optional(),
  emergencyContact: z.string().optional(),
  vehiclePlate: z.string().optional(),
  vehiclePhoto: z.string().optional(),
  documents: z.string().optional(),
  businessName: z.string().max(120).optional(),
  businessType: z.string().optional(),
  storeAddress: z.string().max(255).optional(),
  ntn: z.string().optional(),
  storeName: z.string().max(120).optional(),
  captchaToken: z.string().optional(),
}).strip();

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function normalizeVehicleTypeForStorage(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return raw;
  if (v === "bike" || v.startsWith("bike") || v.includes("motorcycle")) return "bike";
  if (v === "car") return "car";
  if (v === "rickshaw" || v.includes("rickshaw") || v.includes("qingqi")) return "rickshaw";
  if (v === "van") return "van";
  if (v === "daba") return "daba";
  if (v === "bicycle") return "bicycle";
  if (v === "on_foot" || v === "on foot") return "on_foot";
  return v;
}

function generateVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}


function isValidCanonicalPhone(phone: string): boolean {
  return /^3\d{9}$/.test(phone);
}

const router: IRouter = Router();

/* ══════════════════════════════════════════════════════════════
   POST /auth/check-identifier
   Unified Auth Gatekeeper — Account Discovery.
   Step 1 of the smart "Continue" login flow.
   Body: { identifier: string, role?: string, deviceId?: string }
   Returns what the client should do next: action + available methods.

   Rate-limited to 10 requests/min/IP to prevent phone number enumeration.
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

  /* ── Normalise identifier — detect phone vs email vs username ── */
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
    const rows = await db.select().from(usersTable).where(eq(usersTable.username, identifier.trim())).limit(1);
    user = rows[0];
  }

  const exists    = !!user;
  const isNewUser = !exists;

  /* ── Phone / email enumeration hardening ─────────────────────────────────
     For phone/email identifiers we must return an IDENTICAL response whether
     the account exists, is banned, is locked, is Google-linked, or doesn't
     exist at all.  Any distinguishable response would let an attacker enumerate
     registered phone numbers.

     Security events are still logged server-side; actual enforcement (banned,
     locked, Google-linked) happens in /auth/verify-otp after OTP proof.

     Exception: username-based identifiers may safely reveal existence (the
     attacker must already know the username) and may show banned/locked there.

     Rule: for phone/email, always use the *request* role, never the DB user's
     role — the latter would differ between existing and non-existing records. ── */

  /* For username path only: surface banned/locked at check time (acceptable) */
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
    /* Phone / email: log security events silently, never gate on them */
    if (user?.isBanned) {
      addSecurityEvent({ type: "banned_user_identifier_check", ip, userId: user.id, details: `Banned user phone/email check: ${identifier}`, severity: "medium" });
    }
  }

  /* ── Build available methods based on admin config + request role ──
     Use userRole (from request) for phone/email — never user?.roles — so the
     response shape is identical for existing and non-existing identifiers. ── */
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

  /* ── Phone / email enumeration hardening ─────────────────────────────────
     For phone and email identifiers we MUST NOT reveal whether an account
     exists.  Return a single generic action ("send_otp") for every phone/email,
     regardless of whether the account is new, existing, Google-linked, etc.
     Account state is only enforced inside /auth/verify-otp (after OTP proof).

     For username-based identifiers the threat model is different (the attacker
     must already know the username), so we can still route to "register" vs
     "login_password" there — but we never return social-linked flags. ── */
  let action: string;
  let responseAvailableMethods: string[] = availableMethods;

  if (looksLikePhone) {
    /* Always say "send OTP" — never distinguish new vs returning user */
    action = phoneOtpEnabled ? "send_phone_otp" : "no_method";
  } else if (looksLikeEmail) {
    if (emailOtpEnabled)       action = "send_email_otp";
    else if (magicLinkEnabled) action = "send_magic_link";
    else                       action = "no_method";
  } else {
    /* Username path: determine action from existence without leaking social links */
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
    } else {
      action = "no_method";
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
    availableMethods: responseAvailableMethods,
    isBanned:  false,
    isLocked:  false,
    otpChannels,
  });
});

/* ─────────────────────────────────────────────────────────────
   POST /auth/send-merge-otp
   Send OTP for linking a new identifier to the authenticated user.
   Stores OTP on the authenticated user's record.
   Body: { identifier }
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
      const smsResult = await sendOtpSMS(phone, otp, settings, lang);
      sent = smsResult.sent;
    }
    const isDev = process.env.NODE_ENV !== "production";
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
   Link a new identifier (phone/email) to an authenticated user.
   Requires: valid JWT + OTP verification for the new identifier.
   Body: { identifier, otp }
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

/* ─────────────────────────────────────────────────────────────
   POST /auth/send-otp
   Atomically upsert user by phone — one account per number.
───────────────────────────────────────────────────────────── */
router.post("/send-otp", verifyCaptcha, sharedValidateBody(sendOtpSchema), async (req, res) => {
  const rawPhone = req.body.phone;
  const deviceId = req.body.deviceId;
  const preferredChannel = req.body.preferredChannel;
  const phone = canonicalizePhone(rawPhone);

  if (!isValidCanonicalPhone(phone)) {
    res.status(400).json({ error: "Invalid phone number. Please enter a valid Pakistani mobile number (e.g. 03001234567).", field: "phone" });
    return;
  }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  const otpEnabled = isAuthMethodEnabled(settings, "auth_phone_otp_enabled");

  /* ── Look up existing user (not exposed in response — only used server-side) ── */
  const existingUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  const effectiveRole = existingUser[0]?.roles ?? ((req.body.role === "rider" || req.body.role === "vendor") ? req.body.role : "customer");
  const otpEnabledForRole = isAuthMethodEnabled(settings, "auth_phone_otp_enabled", effectiveRole);

  /* ── Phone enumeration hardening ─────────────────────────────────────────
     Do NOT return distinguishable errors for banned accounts, Google-linked
     accounts, or registration-closed states — all of these would reveal
     whether a phone number is registered.  Enforcement of these rules happens
     inside /auth/verify-otp (after the caller has proven OTP ownership).

     Exceptions that are acceptable to surface at send-otp:
       • lockout  — rate-limit response, keyed on the phone, not on account existence
       • invalid phone format — rejected before DB lookup
     Everything else: silently write OTP to pending_otps and return generic success. ── */

  /* ── Check lockout before generating new OTP ── */
  const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
  const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);
  const lockoutStatus = await checkLockout(phone, maxAttempts, lockoutMinutes);
  if (lockoutStatus.locked) {
    addSecurityEvent({ type: "locked_account_otp_request", ip, details: `OTP request for locked phone: ${phone}`, severity: "medium" });
    res.status(429).json({
      error: `Account temporarily locked due to too many failed attempts. Please try again in ${lockoutStatus.minutesLeft} minute(s).`,
      lockedMinutes: lockoutStatus.minutesLeft,
    });
    return;
  }

  /* Log security events server-side without blocking the OTP flow */
  if (existingUser[0]?.isBanned) {
    addSecurityEvent({ type: "banned_user_otp_request", ip, details: `Banned user attempted OTP: ${phone}`, severity: "high" });
  }
  const existingGoogleId = existingUser[0]?.googleId;
  if (existingGoogleId && isAuthMethodEnabled(settings, "auth_google_enabled", existingUser[0]?.roles ?? effectiveRole)) {
    addSecurityEvent({ type: "otp_blocked_google_account", ip, details: `OTP attempt on Google-linked account: ${phone}`, severity: "low" });
  }

  /* ── Determine approval status for NEW users ── */
  const isNewUser = existingUser.length === 0;
  const requireApproval = (settings["user_require_approval"] ?? "off") === "on";
  const newUserApprovalStatus = isNewUser && requireApproval ? "pending" : "approved";

  /* ══ OTP DISABLED — return generic "use another method" without revealing account state ══ */
  if (!otpEnabled || !otpEnabledForRole) {
    res.status(403).json({ error: "Phone OTP is currently disabled. Please use another login method or contact support." });
    return;
  }
  /* ── Per-phone OTP resend cooldown (60 s) — prevents SMS bombing ── */
  const otpCooldownMs = parseInt(settings["security_otp_cooldown_sec"] ?? "60", 10) * 1000;
  const existingOtpExpiry = existingUser[0]?.otpExpiry;
  if (existingOtpExpiry) {
    const otpValidityMs = AUTH_OTP_TTL_MS;
    const issuedAgoMs   = otpValidityMs - (existingOtpExpiry.getTime() - Date.now());
    if (issuedAgoMs < otpCooldownMs) {
      const waitSec = Math.ceil((otpCooldownMs - issuedAgoMs) / 1000);
      addSecurityEvent({ type: "otp_resend_throttle", ip, details: `OTP resend too soon for ${phone} — ${waitSec}s remaining`, severity: "low" });
      res.status(429).json({ error: `Please wait ${waitSec} second(s) before requesting a new OTP.`, retryAfterSeconds: waitSec });
      return;
    }
  }

  /* ── Per-account + per-IP OTP rate limit (admin-configurable window) ── */
  const otpRateCheck = await checkAndIncrOtpRateLimit({ identifier: phone, ip, settings });
  if (otpRateCheck.blocked) {
    const label = otpRateCheck.reason === "ip"
      ? "Too many OTP requests from your network"
      : "Too many OTP requests for this account";
    addSecurityEvent({ type: "otp_rate_limit_exceeded", ip, details: `${label} (${phone}) — retry in ${otpRateCheck.retryAfterSeconds}s`, severity: "medium" });
    res.status(429).json({ error: `${label}. Please wait ${otpRateCheck.retryAfterSeconds} second(s) before trying again.`, retryAfterSeconds: otpRateCheck.retryAfterSeconds });
    return;
  }

  const otp       = generateSecureOtp();
  const otpExpiry = new Date(Date.now() + AUTH_OTP_TTL_MS);

  if (isNewUser) {
    /* NEW USERS: store OTP in pending_otps — do NOT create a users record yet.
       The users record is only created after OTP is successfully verified. */
    await db
      .insert(pendingOtpsTable)
      .values({ id: generateId(), phone, otpHash: hashOtp(otp), otpExpiry })
      .onConflictDoUpdate({
        target: pendingOtpsTable.phone,
        set: { otpHash: hashOtp(otp), otpExpiry, attempts: 0 },
      });
  } else {
    /* EXISTING USERS: update OTP in the users table (login / resend flow) */
    await db
      .update(usersTable)
      .set({ otpCode: hashOtp(otp), otpExpiry, otpUsed: false, updatedAt: new Date() })
      .where(eq(usersTable.phone, phone));
  }

  writeAuthAuditLog("otp_sent", { ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { phone } });
  req.log.info({ phone, otp }, "OTP sent");

  const otpUserId = existingUser[0]?.id;
  const otpLang = otpUserId ? await getUserLanguage(otpUserId) : await getPlatformDefaultLanguage();

  const whatsappEnabled = settings["integration_whatsapp"] === "on";
  const emailEnabled    = isAuthMethodEnabled(settings, "auth_email_otp_enabled", effectiveRole);
  const userEmail       = existingUser[0]?.email;

  let deliveryChannel = "none";
  let deliverySuccess = false;
  let deliveryProvider = "";
  const smsEnabled = isAuthMethodEnabled(settings, "auth_phone_otp_enabled", effectiveRole);
  const availableChannels: string[] = [];
  if (whatsappEnabled) availableChannels.push("whatsapp");
  if (smsEnabled) availableChannels.push("sms");
  if (emailEnabled && userEmail) availableChannels.push("email");

  const channelOrder: string[] = [];
  if (preferredChannel && availableChannels.includes(preferredChannel)) {
    channelOrder.push(preferredChannel);
    for (const ch of availableChannels) { if (ch !== preferredChannel) channelOrder.push(ch); }
  } else {
    if (whatsappEnabled) channelOrder.push("whatsapp");
    if (smsEnabled) channelOrder.push("sms");
    if (emailEnabled && userEmail) channelOrder.push("email");
  }

  for (const channel of channelOrder) {
    if (channel === "whatsapp") {
      const waResult = await sendWhatsAppOTP(phone, otp, settings, otpLang);
      if (waResult.sent) { deliveryChannel = "whatsapp"; deliverySuccess = true; deliveryProvider = "whatsapp"; break; }
      req.log.warn({ err: waResult.error }, "WhatsApp OTP failed, trying next channel");
    } else if (channel === "sms") {
      const smsResult = await sendOtpSMS(phone, otp, settings, otpLang);
      if (smsResult.sent) { deliveryChannel = "sms"; deliverySuccess = true; deliveryProvider = smsResult.provider ?? "sms"; break; }
      req.log.warn({ err: smsResult.error }, "SMS OTP failed, trying next channel");
    } else if (channel === "email" && userEmail) {
      const emailLang = otpUserId ? await getUserLanguage(otpUserId) : await getPlatformDefaultLanguage();
      const emailResult = await sendPasswordResetEmail(userEmail, otp, existingUser[0]?.name ?? undefined, emailLang);
      if (emailResult.sent) { deliveryChannel = "email"; deliverySuccess = true; deliveryProvider = "email"; break; }
      req.log.warn({ err: emailResult.reason }, "Email OTP failed");
    }
  }

  const isDev = process.env.NODE_ENV !== "production";
  const userDevOtp = existingUser[0]?.devOtpEnabled === true;
  const globalDevOtp = settings["security_global_dev_otp"] === "on";
  const isConsoleDelivery = deliveryProvider === "console";

  if (!deliverySuccess) {
    if (isDev || userDevOtp || globalDevOtp) {
      deliveryChannel = "dev";
      req.log.warn({ phone }, "All OTP delivery channels failed — returning OTP in dev/devOtp mode");
    } else {
      req.log.error({ phone }, "All OTP delivery channels failed");
      res.status(502).json({ error: "Could not deliver OTP. Please try again or use an alternative login method.", fallbackChannels: availableChannels });
      return;
    }
  }

  const fallbackChannels = availableChannels.filter(ch => ch !== deliveryChannel);
  const response: Record<string, unknown> = {
    otpRequired: true,
    message: "OTP sent successfully",
    channel: deliveryChannel,
    fallbackChannels,
  };

  /* Dev OTP: expose OTP in response when in non-production mode AND any of:
     - admin enabled devOtpEnabled on this specific user (per-user flag in Users page)
     - global Dev OTP Mode platform setting is "on" (Security settings in admin)
     - delivery channel is "dev" (all real channels failed, only dev fallback available)
     - delivery was via console SMS provider (no real SMS configured — dev environment) */
  if (isDev && (userDevOtp || globalDevOtp || deliveryChannel === "dev" || isConsoleDelivery)) {
    response.otp = otp;
    response.devMode = true;
  }

  res.json(response);
});

/* ─────────────────────────────────────────────────────────────
   POST /auth/verify-otp
   Validates the OTP, checks security settings, returns token.
───────────────────────────────────────────────────────────── */
router.post("/verify-otp", verifyCaptcha, sharedValidateBody(verifyOtpSchema), async (req, res) => {
  const phone = canonicalizePhone(req.body.phone);

  if (!isValidCanonicalPhone(phone)) {
    res.status(400).json({ error: "Invalid phone number format.", field: "phone" });
    return;
  }

  const { otp } = req.body;

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!isAuthMethodEnabled(settings, "auth_phone_otp_enabled")) {
    res.status(403).json({ error: "Phone OTP login is currently disabled." });
    return;
  }

  const maxAttempts    = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
  const lockoutMinutes = parseInt(settings["security_lockout_minutes"]    ?? "30", 10);

  /* ── Lockout check ── */
  const lockoutStatus = await checkLockout(phone, maxAttempts, lockoutMinutes);
  if (lockoutStatus.locked) {
    addAuditEntry({ action: "verify_otp_lockout", ip, details: `Locked account OTP attempt: ${phone}`, result: "fail" });
    res.status(429).json({
      error: `Account temporarily locked. Please try again in ${lockoutStatus.minutesLeft} minute(s).`,
      lockedMinutes: lockoutStatus.minutesLeft,
    });
    return;
  }

  /* ── Fetch user ── */
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, phone))
    .limit(1);

  if (!user) {
    /* ── Cross-role new-user guard ──
       Riders and vendors must register through admin-controlled flows.
       Block auto-registration for these roles to prevent cross-app token issuance. */
    const requestedRoleForNew = req.body.role as string | undefined;
    if (requestedRoleForNew && requestedRoleForNew !== "customer") {
      res.status(403).json({
        error: `No ${requestedRoleForNew} account found for this phone number. Please use the correct registration process or contact admin.`,
        wrongApp: true,
      });
      return;
    }

    /* ── NEW USER REGISTRATION PATH ──────────────────────────────────────────
       If the phone is not yet in usersTable, check pendingOtpsTable.
       This prevents phantom account creation — user records are only
       created AFTER successful OTP verification, not at send-otp time. */
    const [pending] = await db
      .select()
      .from(pendingOtpsTable)
      .where(eq(pendingOtpsTable.phone, phone))
      .limit(1);

    if (!pending) {
      res.status(404).json({ error: "User not found. Please request a new OTP." });
      return;
    }

    /* Verify OTP from pending_otps */
    const otpValid = pending.otpHash === hashOtp(otp) && new Date() < pending.otpExpiry;
    if (!otpValid) {
      /* Increment failed attempts */
      const newAttempts = (pending.attempts ?? 0) + 1;
      await db.update(pendingOtpsTable)
        .set({ attempts: newAttempts })
        .where(eq(pendingOtpsTable.phone, phone));

      if (newAttempts >= maxAttempts) {
        await db.delete(pendingOtpsTable).where(eq(pendingOtpsTable.phone, phone));
        res.status(429).json({ error: `Too many failed attempts. Please request a new OTP.`, lockedMinutes: 1 });
      } else {
        const remaining = maxAttempts - newAttempts;
        res.status(401).json({
          error: `Invalid OTP. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : "Please request a new OTP."}`,
          attemptsRemaining: Math.max(0, remaining),
        });
      }
      return;
    }

    /* OTP valid — create user record now */
    const requireApproval = (settings["user_require_approval"] ?? "off") === "on";
    const deviceId = req.body.deviceId as string | undefined;
    const newUserId = generateId();
    await db.insert(usersTable).values({
      id:             newUserId,
      phone,
      roles:          "customer",
      walletBalance:  "0",
      phoneVerified:  true,
      isActive:       !requireApproval,
      approvalStatus: requireApproval ? "pending" : "approved",
      ...(deviceId ? { deviceId } : {}),
    });

    /* Delete from pending_otps */
    await db.delete(pendingOtpsTable).where(eq(pendingOtpsTable.phone, phone));
    writeAuthAuditLog("otp_verified_new_user", { userId: newUserId, ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { phone } });

    const signupBonus = parseFloat(settings["customer_signup_bonus"] ?? "0");
    if (signupBonus > 0) {
      await db.update(usersTable)
        .set({ walletBalance: sql`wallet_balance + ${signupBonus}` })
        .where(eq(usersTable.id, newUserId));
      await db.insert(walletTransactionsTable).values({
        id: generateId(), userId: newUserId, type: "bonus",
        amount: signupBonus.toFixed(2), description: "Welcome bonus — Thanks for joining!",
      });
    }

    const accessToken = signAccessToken(newUserId, phone, "customer", "customer", 0);
    const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
    await db.insert(refreshTokensTable).values({
      id: generateId(), userId: newUserId, tokenHash: refreshHash,
      authMethod: "phone_otp", expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    });

    res.json({
      token: accessToken,
      refreshToken: refreshRaw,
      expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString(),
      user: { id: newUserId, phone, name: null, email: null, username: null, role: "customer", roles: "customer",
              walletBalance: signupBonus, isActive: !requireApproval, totpEnabled: false },
      ...(requireApproval ? { pendingApproval: true } : {}),
    });
    return;
  }

  if (!isAuthMethodEnabled(settings, "auth_phone_otp_enabled", user.roles || undefined)) {
    res.status(403).json({ error: "Phone OTP login is currently disabled for your account type." });
    return;
  }

  /* ── Cross-role enforcement (non-customer apps only) ──
     For the customer app context, role enforcement happens AFTER OTP proof
     so the user can be offered the "add customer role" flow with a valid token.
     For rider/vendor apps, block immediately if role mismatch. ── */
  const requestedRole = req.body.role as string | undefined;
  const appIdHeader = req.headers["x-app-id"] as string | undefined;
  const appIdQuery = req.query.appId as string | undefined;
  const isCustomerAppContext = requestedRole === "customer" || appIdHeader === "customer" || appIdQuery === "customer";

  if (requestedRole && !isCustomerAppContext) {
    const userRoles = (user.roles || "customer").split(",").map((r: string) => r.trim());
    if (!userRoles.includes(requestedRole)) {
      addSecurityEvent({ type: "cross_role_login_attempt", ip, userId: user.id, details: `User with roles [${user.roles}] tried to log in as ${requestedRole}`, severity: "high" });
      res.status(403).json({ error: "This account is not registered as a " + requestedRole + ". Please use the correct app.", wrongApp: true });
      return;
    }
  }

  /* ── Banned check ── */
  if (user.isBanned) {
    addSecurityEvent({ type: "banned_login_attempt", ip, userId: user.id, details: `Banned user tried to verify OTP: ${phone}`, severity: "high" });
    res.status(403).json({ error: "Your account has been suspended. Please contact support." });
    return;
  }

  /* ── Google-linked account: block OTP hijack ─────────────────────────────
     Enforcement moved here from send-otp to avoid leaking account existence.
     After OTP proof the caller is bound to this phone, so we can safely tell
     them to use Google instead without disclosing anything about other numbers. ── */
  if (user.googleId && isAuthMethodEnabled(await getCachedSettings(), "auth_google_enabled", user.roles || undefined)) {
    addSecurityEvent({ type: "otp_hijack_google_account", ip, userId: user.id, details: `OTP verify attempted on Google-linked account: ${phone}`, severity: "medium" });
    res.status(403).json({ error: "This account is linked to Google. Please sign in with Google.", useGoogle: true });
    return;
  }

  /* ── Inactive check ──
     Pending-approval accounts are isActive=false but should NOT be blocked here;
     they need to pass OTP validation and receive the pendingApproval=true response.
     Check approvalStatus directly — the setting only controls NEW users, not existing pending ones. ── */
  const isPendingApproval = user.approvalStatus === "pending";
  if (!user.isActive && !isPendingApproval) {
    res.status(403).json({ error: "Your account is currently inactive. Please contact support." });
    return;
  }

  /* ── Atomic OTP consumption via a single conditional UPDATE ──
     The WHERE clause combines: correct code + not-yet-used + not-expired.
     Concurrency-safe: only the first concurrent caller gets rows back. ── */
  const signupBonus = parseFloat(settings["customer_signup_bonus"] ?? "0");
  const now = new Date();

  let isActualFirstLogin = false;

  {
    const consumed = await db.transaction(async (tx) => {
      /* Single atomic UPDATE: marks OTP as used ONLY if code matches, unused, and unexpired.
         Returns the row if consumed, empty if already used / wrong code / expired. */
      const rows = await tx
        .update(usersTable)
        .set({ otpCode: null, otpExpiry: null, otpUsed: true, phoneVerified: true, lastLoginAt: now })
        .where(and(
          eq(usersTable.phone, phone),
          eq(usersTable.otpCode, hashOtp(otp)),
          eq(usersTable.otpUsed, false),
          sql`otp_expiry > now()`,
        ))
        .returning({ id: usersTable.id, lastLoginAt: usersTable.lastLoginAt });

      if (rows.length === 0) return null;

      /* This is the first login if lastLoginAt was NULL before we set it now.
         We detect first login by checking if no prior refresh tokens exist. */
      const [existingToken] = await tx.select({ id: refreshTokensTable.id })
        .from(refreshTokensTable)
        .where(eq(refreshTokensTable.userId, rows[0]!.id))
        .limit(1);
      isActualFirstLogin = !existingToken;

      /* Credit signup bonus only on verified first login */
      if (isActualFirstLogin && signupBonus > 0) {
        await tx
          .update(usersTable)
          .set({ walletBalance: sql`wallet_balance + ${signupBonus}` })
          .where(eq(usersTable.id, rows[0]!.id));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(), userId: rows[0]!.id, type: "bonus",
          amount: signupBonus.toFixed(2),
          description: `Welcome bonus — Thanks for joining AJKMart!`,
        });
        const bonusLang = await getUserLanguage(rows[0]!.id);
        await tx.insert(notificationsTable).values({
          id: generateId(), userId: rows[0]!.id,
          title: t("notifWelcomeBonusTitle" as TranslationKey, bonusLang),
          body: t("notifWelcomeBonusBody" as TranslationKey, bonusLang).replace("{amount}", String(signupBonus)),
          type: "wallet", icon: "gift-outline",
        });
      }

      return rows[0];
    });

    if (!consumed) {
      /* OTP was wrong, already used, or expired — determine reason from fresh row */
      const [fresh] = await db.select({ otpUsed: usersTable.otpUsed, otpExpiry: usersTable.otpExpiry })
        .from(usersTable).where(eq(usersTable.phone, phone)).limit(1);

      if (fresh?.otpUsed) {
        writeAuthAuditLog("otp_reuse_attempt", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined });
        res.status(401).json({ error: "This OTP has already been used. Please request a new one." });
      } else if (!fresh?.otpExpiry || new Date() > fresh.otpExpiry) {
        writeAuthAuditLog("otp_expired", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined });
        res.status(401).json({ error: "OTP expired. Please request a new one." });
      } else {
        const updated = await recordFailedAttempt(phone, maxAttempts, lockoutMinutes);
        const remaining = maxAttempts - updated.attempts;
        addAuditEntry({ action: "verify_otp_failed", ip, details: `Wrong OTP for phone: ${phone}, attempt ${updated.attempts}/${maxAttempts}`, result: "fail" });
        writeAuthAuditLog("otp_failed", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined });
        if (updated.locked) {
          addSecurityEvent({ type: "account_locked", ip, userId: user.id, details: `Account locked after ${maxAttempts} failed OTP attempts`, severity: "high" });
          res.status(429).json({ error: `Too many failed attempts. Account locked for ${lockoutMinutes} minutes.`, lockedMinutes: lockoutMinutes });
        } else {
          res.status(401).json({
            error: `Invalid OTP. ${remaining > 0 ? `${remaining} attempt(s) remaining before lockout.` : "Next failure will lock your account."}`,
            attemptsRemaining: Math.max(0, remaining),
          });
        }
      }
      return;
    }
  }

  await resetAttempts(phone);

  /* ── Re-fetch user to get latest data (wallet balance, name, etc.) ── */
  const [freshUser] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  const u = freshUser ?? user;

  /* ── Admin approval check ──
     approvalStatus is the source of truth; the setting only controls NEW user creation. ── */
  if (u.approvalStatus === "pending") {
    addAuditEntry({ action: "user_login_pending", ip, details: `Pending approval login for phone: ${phone}`, result: "pending" });
    const token = signAccessToken(u.id, phone, u.roles ?? "customer", u.roles ?? "customer", u.tokenVersion ?? 0);
    res.json({
      token, pendingApproval: true,
      message: "Aapka account admin approval ke liye bheja gaya hai. Approve hone par aap login kar sakenge.",
      user: { id: u.id, phone: u.phone, name: u.name, role: u.roles, roles: u.roles, approvalStatus: "pending" },
    });
    return;
  }
  if (u.approvalStatus === "rejected") {
    res.status(403).json({ error: "Aapka account reject kar diya gaya hai. Admin se rabta karein.", code: "APPROVAL_REJECTED", approvalStatus: "rejected", rejectionReason: u.approvalNote ?? null });
    return;
  }

  /* ── 2FA challenge ── */
  if (u.totpEnabled && isAuthMethodEnabled(settings, "auth_2fa_enabled", u.roles || undefined)) {
    const deviceFingerprint = req.body.deviceFingerprint ?? "";
    const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
    if (!isDeviceTrusted(u, deviceFingerprint, trustedDays)) {
      const tempToken = sign2faChallengeToken(u.id, u.phone ?? "", u.roles ?? "customer", u.roles ?? u.roles ?? "customer", "phone_otp");
      res.json({ requires2FA: true, tempToken, userId: u.id }); return;
    }
  }

  addAuditEntry({ action: "user_login", ip, details: `Successful login for phone: ${phone} (role: ${u.roles})`, result: "success" });
  writeAuthAuditLog("login_success", { userId: u.id, ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { phone, role: u.roles } });

  /* ── Issue short-lived access token + long-lived refresh token ── */
  const accessToken  = signAccessToken(u.id, phone, u.roles ?? "customer", u.roles ?? u.roles ?? "customer", u.tokenVersion ?? 0);
  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokensTable).values({
    id:        generateId(),
    userId:    u.id,
    tokenHash: refreshHash,
    authMethod: "phone_otp",
    expiresAt: refreshExpiresAt,
  });

  /* Clean up expired refresh tokens for this user (housekeeping) */
  db.delete(refreshTokensTable)
    .where(and(eq(refreshTokensTable.userId, u.id), lt(refreshTokensTable.expiresAt, new Date())))
    .catch(() => {});

  /* ── Post-OTP customer app cross-role check ──
     If the customer app context was detected and the user doesn't have the
     customer role, return a token + canAddCustomerRole flag so the frontend
     can offer the "Add Customer Access" flow from the wrong-app screen. ── */
  const uRoles = (u.roles || u.roles || "customer").split(",").map((r: string) => r.trim());
  if (isCustomerAppContext && !uRoles.includes("customer")) {
    addSecurityEvent({ type: "cross_role_login_attempt", ip, userId: u.id, details: `User with roles [${u.roles}] logged in to customer app context — offering add-role`, severity: "low" });
    res.json({
      token:        accessToken,
      refreshToken: refreshRaw,
      expiresAt:    new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString(),
      sessionDays:  REFRESH_TOKEN_TTL_DAYS,
      canAddCustomerRole: true,
      code: "cross_app_account",
      wrongApp: true,
      user: {
        id:            u.id,
        phone:         u.phone,
        name:          u.name,
        email:         u.email,
        username:      u.username,
        role:          u.roles,
        roles:         u.roles ?? u.roles ?? "customer",
        avatar:        u.avatar,
        walletBalance: parseFloat(u.walletBalance ?? "0"),
        isActive:      u.isActive,
        cnic:          u.cnic,
        city:          u.city,
        totpEnabled:   u.totpEnabled ?? false,
        createdAt:     u.createdAt.toISOString(),
      },
    });
    return;
  }

  res.json({
    token:        accessToken,
    refreshToken: refreshRaw,
    expiresAt:    new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString(),
    sessionDays:  REFRESH_TOKEN_TTL_DAYS,
    user: {
      id:            u.id,
      phone:         u.phone,
      name:          u.name,
      email:         u.email,
      username:      u.username,
      role:          u.roles,
      roles:         u.roles ?? u.roles ?? "customer",
      avatar:        u.avatar,
      walletBalance: parseFloat(u.walletBalance ?? "0"),
      isActive:      u.isActive,
      cnic:          u.cnic,
      city:          u.city,
      totpEnabled:   u.totpEnabled ?? false,
      createdAt:     u.createdAt.toISOString(),
    },
  });
});

/* ─────────────────────────────────────────────────────────────
   POST /auth/vendor-register
   Vendor signup: after phone OTP verified, submit store info
   and register as a vendor pending admin approval.
───────────────────────────────────────────────────────────── */
router.post("/vendor-register", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) {
    res.status(401).json({ error: "Authentication required. Please verify your phone via OTP first." });
    return;
  }

  const { storeName, storeCategory, name, cnic, address, city, bankName, bankAccount, bankAccountTitle, username } = req.body;
  if (!storeName) {
    res.status(400).json({ error: "Store name is required" });
    return;
  }

  if (username) {
    const normalizedUsername = String(username).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (normalizedUsername.length < 3) {
      res.status(400).json({ error: "Username must be at least 3 characters" });
      return;
    }
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(sql`lower(${usersTable.username}) = ${normalizedUsername} AND ${usersTable.id} != ${auth.userId}`)
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Username is already taken" });
      return;
    }
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  if (!user.phoneVerified) {
    res.status(403).json({ error: "Phone number not verified. Please verify OTP first." });
    return;
  }

  const existingRoles = (user.roles || "").split(",").map((r: string) => r.trim()).filter(Boolean);
  if (existingRoles.includes("vendor")) {
    if (user.approvalStatus === "pending") {
      res.json({ success: true, status: "pending", message: "Your vendor application is already pending admin approval." });
      return;
    }
    if (user.approvalStatus === "approved") {
      res.json({ success: true, status: "approved", message: "You are already approved as a vendor." });
      return;
    }
  }

  const newRoles = existingRoles.includes("vendor") ? existingRoles : [...existingRoles, "vendor"];
  const settings = await getCachedSettings();
  const autoApprove = (settings["vendor_auto_approve"] ?? "off") === "on";

  await db.update(usersTable).set({
    roles: newRoles.join(","),
    name: name || user.name,
    username: username ? String(username).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) : user.username || null,
    cnic: cnic || user.cnic || null,
    address: address || user.address || null,
    city: city || user.city || null,
    bankName: bankName || user.bankName || null,
    bankAccount: bankAccount || user.bankAccount || null,
    bankAccountTitle: bankAccountTitle || user.bankAccountTitle || null,
    approvalStatus: autoApprove ? "approved" : "pending",
    isActive: autoApprove ? true : false,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));

  await db.insert(notificationsTable).values({
    id: generateId(),
    userId: user.id,
    title: autoApprove ? "Welcome, Vendor! 🎉" : "Application Submitted ⏳",
    body: autoApprove
      ? "Your vendor account is approved! Start adding products and manage your store."
      : "Your vendor registration is pending admin approval. We'll notify you once approved.",
    type: "system",
    icon: autoApprove ? "checkmark-circle-outline" : "time-outline",
  }).catch(() => {});

  if (!autoApprove) {
    const admins = await db.select({ id: usersTable.id }).from(usersTable)
      .where(ilike(usersTable.roles, "%admin%"));
    const adminNotifs = admins.map(a => ({
      id: generateId(),
      userId: a.id,
      title: "New Vendor Application 📋",
      body: `${name || user.name || user.phone} has applied to become a vendor with store "${storeName}". Review and approve in the admin panel.`,
      type: "system" as const,
      icon: "storefront-outline",
    }));
    if (adminNotifs.length) {
      db.insert(notificationsTable).values(adminNotifs).catch(() => {});
    }
  }

  if (!autoApprove) {
    alertNewVendor(
      name || user.name || user.phone || "Unknown",
      user.phone || "N/A",
      storeName,
      settings,
    ).catch(() => {});
  }

  res.json({
    success: true,
    status: autoApprove ? "approved" : "pending",
    message: autoApprove
      ? "Your vendor account is approved! You can now log in."
      : "Your application has been submitted. Admin will review and approve your account.",
  });
});

/* ─────────────────────────────────────────────────────────────
   POST /auth/validate-token
   Client can use this to check if their token is still valid.
───────────────────────────────────────────────────────────── */
router.post("/validate-token", async (req, res) => {
  /* Support both body token and Authorization header */
  const authHeader = req.headers.authorization ?? "";
  const bodyToken  = req.body?.token ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : bodyToken;

  if (!token) { res.status(400).json({ error: "token required" }); return; }

  try {
    const payload = verifyUserJwt(token);
    if (!payload) { res.status(401).json({ valid: false, error: "Invalid or expired token" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user)         { res.status(401).json({ valid: false, error: "User not found" }); return; }
    if (user.isBanned) { res.status(403).json({ valid: false, error: "Account suspended" }); return; }
    if (!user.isActive){ res.status(403).json({ valid: false, error: "Account inactive" }); return; }

    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      res.status(401).json({ valid: false, error: "Token revoked" }); return;
    }

    const expiresAt = payload.exp ? new Date(payload.exp * 1000).toISOString() : null;
    res.json({ valid: true, expiresAt, userId: user.id, role: user.roles});
  } catch {
    res.status(401).json({ valid: false, error: "Token validation failed" });
  }
});

/* ─────────────────────────────────────────────────────────────
   POST /auth/refresh
   Exchange a valid refresh token for a new access token.
   Body: { refreshToken }
   On success: returns { token, expiresAt }
   Refresh tokens are rotated on use (old one revoked, new one issued).
───────────────────────────────────────────────────────────── */
async function handleRefreshToken(req: Request, res: any) {
  const { refreshToken } = req.body;
  const ip = getClientIp(req);

  const tokenHash = hashRefreshToken(refreshToken);
  const [rt] = await db.select().from(refreshTokensTable).where(eq(refreshTokensTable.tokenHash, tokenHash)).limit(1);

  if (!rt) {
    writeAuthAuditLog("refresh_failed_not_found", { ip, userAgent: req.headers["user-agent"] ?? undefined });
    res.status(401).json({ error: "Invalid refresh token. Please log in again." });
    return;
  }

  if (rt.revokedAt) {
    /* Token reuse detected — revoke all tokens for this user (possible token theft) */
    await revokeAllUserRefreshTokens(rt.userId);
    writeAuthAuditLog("refresh_token_reuse", { userId: rt.userId, ip, userAgent: req.headers["user-agent"] ?? undefined });
    addSecurityEvent({ type: "refresh_token_reuse", ip, userId: rt.userId, details: "Refresh token reuse detected — all sessions revoked", severity: "high" });
    res.status(401).json({ error: "Session invalidated for security. Please log in again." });
    return;
  }

  if (new Date() > rt.expiresAt) {
    await revokeRefreshToken(tokenHash);
    writeAuthAuditLog("refresh_token_expired", { userId: rt.userId, ip });
    res.status(401).json({ error: "Session expired. Please log in again." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, rt.userId)).limit(1);
  if (!user || user.isBanned || !user.isActive) {
    await revokeRefreshToken(tokenHash);
    res.status(401).json({ error: "Account not available. Please log in again." });
    return;
  }

  const settings = await getCachedSettings();
  const userRole = user.roles?? "customer";

  const methodToSettingsKey: Record<string, string> = {
    phone_otp: "auth_phone_otp_enabled",
    email_otp: "auth_email_otp_enabled",
    password: "auth_username_password_enabled",
    social_google: "auth_google_enabled",
    social_facebook: "auth_facebook_enabled",
    magic_link: "auth_magic_link_enabled",
  };

  const originalMethod = rt.authMethod;
  if (originalMethod && methodToSettingsKey[originalMethod]) {
    const settingsKey = methodToSettingsKey[originalMethod]!;
    const legacyKeys: Record<string, string> = {
      social_google: "auth_social_google",
      social_facebook: "auth_social_facebook",
      magic_link: "auth_magic_link",
    };
    const legacyKey = legacyKeys[originalMethod];
    const isEnabled = legacyKey
      ? isAuthMethodEnabledStrict(settings, settingsKey, legacyKey, userRole)
      : isAuthMethodEnabled(settings, settingsKey, userRole);
    if (!isEnabled) {
      await revokeRefreshToken(tokenHash);
      res.status(403).json({ error: "Your login method has been disabled. Please log in again using an available method." });
      return;
    }
  } else {
    await revokeRefreshToken(tokenHash);
    res.status(403).json({ error: "Session expired. Please log in again." });
    return;
  }

  /* Rotate: revoke old token and issue a new one */
  await revokeRefreshToken(tokenHash);

  const newAccessToken = signAccessToken(user.id, user.phone ?? "", user.roles?? "customer", user.roles ?? "customer", user.tokenVersion ?? 0);
  const { raw: newRefreshRaw, hash: newRefreshHash } = generateRefreshToken();
  const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokensTable).values({
    id:        generateId(),
    userId:    user.id,
    tokenHash: newRefreshHash,
    authMethod: rt.authMethod ?? null,
    expiresAt: newRefreshExpiresAt,
  });

  writeAuthAuditLog("token_refresh", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined });

  res.json({
    token:        newAccessToken,
    refreshToken: newRefreshRaw,
    expiresAt:    new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString(),
  });
}

router.post("/refresh", sharedValidateBody(refreshTokenSchema), handleRefreshToken);
router.post("/refresh-token", sharedValidateBody(refreshTokenSchema), handleRefreshToken);

/* ─────────────────────────────────────────────────────────────
   POST /auth/logout
   Revokes the refresh token and clears OTP. Client must discard tokens.
───────────────────────────────────────────────────────────── */
router.post("/logout", async (req, res) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  const tokenHeader = req.headers["x-auth-token"] as string | undefined;
  const raw = tokenHeader || authHeader?.replace(/^Bearer\s+/i, "");
  const { refreshToken } = req.body ?? {};
  const ip = getClientIp(req);

  if (raw) {
    const payload = verifyUserJwt(raw);
    if (payload) {
      /* Increment tokenVersion to immediately invalidate ALL outstanding access JWTs for this user */
      await db.update(usersTable)
        .set({ otpCode: null, tokenVersion: sql`token_version + 1` })
        .where(eq(usersTable.id, payload.userId));
      /* Clear GPS spoof hit counter so next login starts with a clean session */
      clearSpoofHits(payload.userId);
      addAuditEntry({ action: "user_logout", ip, details: `User logout: ${payload.userId}`, result: "success" });
      writeAuthAuditLog("logout", { userId: payload.userId, ip, userAgent: req.headers["user-agent"] ?? undefined });
    }
  }

  /* Revoke all refresh tokens for this user if refreshToken provided */
  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    await revokeRefreshToken(tokenHash).catch(() => {});
    writeAuthAuditLog("token_revoked", { ip });
  }

  res.json({ success: true, message: "Logged out successfully" });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/check-available
   Check if phone, email, or username is already taken.
   Body: { phone?, email?, username? }
   Returns: { phone: {available,taken}, email: {...}, username: {...} }
══════════════════════════════════════════════════════════════ */
router.post("/check-available", async (req, res) => {
  /* ── IP-based rate limit: max 20 checks per 10 minutes per IP ──
     Prevents scraping the entire user registry via phone/email/username probing. */
  const ip = getClientIp(req);
  const rlCheck = await checkAvailableRateLimit(ip, 20, 10);
  if (rlCheck.limited) {
    res.status(429).json({ error: `Too many requests. Try again in ${rlCheck.minutesLeft} minute(s).` }); return;
  }

  const { phone, email, username } = req.body;
  const result: Record<string, { available: boolean; message: string }> = {};

  if (phone) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    result.phone = existing
      ? { available: false, message: "Is number se pehle se ek account bana hua hai" }
      : { available: true,  message: "Available" };
  }

  if (email && email.length > 3) {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim())).limit(1);
    result.email = existing
      ? { available: false, message: "Is email se pehle se ek account bana hua hai" }
      : { available: true,  message: "Available" };
  }

  if (username && username.length > 2) {
    const clean = username.toLowerCase().trim();
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.username}) = ${clean}`).limit(1);
    result.username = existing
      ? { available: false, message: "Yeh username pehle se liya hua hai. Koi aur try karein." }
      : { available: true,  message: "Available" };
  }

  res.json(result);
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/send-email-otp
   Send OTP to email address (only for existing accounts with that email)
   Body: { email }
══════════════════════════════════════════════════════════════ */
router.post("/send-email-otp", verifyCaptcha, async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "Valid email address required" }); return;
  }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!isAuthMethodEnabled(settings, "auth_email_otp_enabled")) {
    res.status(403).json({ error: "Email OTP login is currently disabled." });
    return;
  }
  const normalized = email.toLowerCase().trim();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
  if (!user) {
    const isDev = process.env.NODE_ENV !== "production";
    res.json({ message: "If an account exists with this email, an OTP has been sent.", ...(isDev ? { hint: "No account found" } : {}) });
    return;
  }

  if (!isAuthMethodEnabled(settings, "auth_email_otp_enabled", user.roles?? "customer")) {
    res.status(403).json({ error: "Email OTP login is currently disabled for your account type." });
    return;
  }

  if (user.isBanned) { res.status(403).json({ error: "Your account has been suspended." }); return; }
  const isPendingEmail = user.approvalStatus === "pending";
  if (!user.isActive && !isPendingEmail) { res.status(403).json({ error: "Your account is inactive. Contact support." }); return; }

  /* Lockout check using email as key */
  const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
  const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);
  const lockout = await checkLockout(normalized, maxAttempts, lockoutMinutes);
  if (lockout.locked) {
    res.status(429).json({ error: `Too many attempts. Try again in ${lockout.minutesLeft} minute(s).` }); return;
  }

  /* ── Per-email OTP resend cooldown — prevents inbox flooding ──
     Same 60-second window as the SMS OTP cooldown. */
  const otpCooldownMs   = parseInt(settings["security_otp_cooldown_sec"] ?? "60", 10) * 1000;
  const existingExpiry  = user.emailOtpExpiry;
  if (existingExpiry) {
    const otpValidityMs = AUTH_OTP_TTL_MS;
    const issuedAgoMs   = otpValidityMs - (existingExpiry.getTime() - Date.now());
    if (issuedAgoMs < otpCooldownMs) {
      const waitSec = Math.ceil((otpCooldownMs - issuedAgoMs) / 1000);
      addAuditEntry({ action: "email_otp_throttle", ip, details: `Email OTP resend too soon for ${normalized} — ${waitSec}s remaining`, result: "fail" });
      res.status(429).json({ error: `Please wait ${waitSec} second(s) before requesting a new email OTP.`, retryAfterSeconds: waitSec });
      return;
    }
  }

  /* ── Per-account + per-IP OTP rate limit (admin-configurable window) ── */
  const emailRateCheck = await checkAndIncrOtpRateLimit({ identifier: normalized, ip, settings });
  if (emailRateCheck.blocked) {
    const label = emailRateCheck.reason === "ip"
      ? "Too many OTP requests from your network"
      : "Too many OTP requests for this email";
    addAuditEntry({ action: "email_otp_rate_limit", ip, details: `${label} (${normalized}) — retry in ${emailRateCheck.retryAfterSeconds}s`, result: "fail" });
    res.status(429).json({ error: `${label}. Please wait ${emailRateCheck.retryAfterSeconds} second(s) before trying again.`, retryAfterSeconds: emailRateCheck.retryAfterSeconds });
    return;
  }

  const otp    = generateSecureOtp();
  const expiry = new Date(Date.now() + AUTH_OTP_TTL_MS);

  await db.update(usersTable)
    .set({ emailOtpCode: hashOtp(otp), emailOtpExpiry: expiry, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const isDev = process.env.NODE_ENV !== "production";
  req.log.info({ email: normalized, otp: isDev ? otp : "[hidden]" }, "Email OTP generated");

  /* Send OTP via email service. Falls back gracefully when SMTP is not configured.
     In development, the OTP is also exposed in the response for easy testing. */
  const emailOtpLang = await getUserLanguage(user.id);
  const emailResult = await sendPasswordResetEmail(normalized, otp, user.name ?? undefined, emailOtpLang);

  if (!emailResult.sent) {
    if (isDev) {
      /* In development, log OTP to console so developers can see it */
      console.log(`[EMAIL-OTP DEV] Email OTP for ${normalized}: ${otp} (SMTP not configured: ${emailResult.reason ?? "unknown"})`);
    } else {
      /* In production, use structured logger so the warning is captured properly */
      logger.warn({ email: normalized, reason: emailResult.reason ?? "SMTP not configured" }, "[EMAIL-OTP] Failed to send OTP email");
    }
  }

  addAuditEntry({ action: "email_otp_sent", ip, details: `Email OTP for: ${normalized} (delivered: ${emailResult.sent})`, result: "success" });

  const globalDevOtpEmail = settings["security_global_dev_otp"] === "on";
  const userDevOtpEmail = user.devOtpEnabled === true;
  const emailConsoleFallback = !emailResult.sent;
  res.json({
    message: "OTP aapki email par bhej diya gaya hai",
    channel: emailResult.sent ? "email" : "console",
    ...(isDev && (globalDevOtpEmail || userDevOtpEmail || emailConsoleFallback) ? { otp, devMode: true } : {}),
  });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/verify-email-otp
   Login via email OTP. Body: { email, otp }
══════════════════════════════════════════════════════════════ */
router.post("/verify-email-otp", verifyCaptcha, async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) { res.status(400).json({ error: "Email and OTP are required" }); return; }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!isAuthMethodEnabled(settings, "auth_email_otp_enabled")) {
    res.status(403).json({ error: "Email OTP login is currently disabled." });
    return;
  }
  const normalized = email.toLowerCase().trim();

  const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
  const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);

  const lockout = await checkLockout(normalized, maxAttempts, lockoutMinutes);
  if (lockout.locked) {
    res.status(429).json({ error: `Account locked. Try again in ${lockout.minutesLeft} minute(s).` }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
  if (!user) { res.status(404).json({ error: "Is email se koi account nahi mila." }); return; }

  if (!isAuthMethodEnabled(settings, "auth_email_otp_enabled", user.roles?? "customer")) {
    res.status(403).json({ error: "Email OTP login is currently disabled for your account type." });
    return;
  }

  /* Cross-role enforcement: rider/vendor apps send their role; reject mismatches.
     Customer app context is identified by X-App-Id header or role=customer body field.
     For customer app, enforcement happens post-OTP so user can be issued a token and
     offered the "Add Customer Access" flow from wrong-app screen. */
  const requestedEmailRole = req.body.role as string | undefined;
  const emailAppIdHeader = req.headers["x-app-id"] as string | undefined;
  const emailAppIdQuery = req.query.appId as string | undefined;
  const isEmailCustomerAppCtx = requestedEmailRole === "customer" || emailAppIdHeader === "customer" || emailAppIdQuery === "customer";
  if (requestedEmailRole && !isEmailCustomerAppCtx) {
    const userRolesEmail = (user.roles || "customer").split(",").map((r: string) => r.trim());
    if (!userRolesEmail.includes(requestedEmailRole)) {
      addSecurityEvent({ type: "cross_role_login_attempt", ip, userId: user.id, details: `User with roles [${user.roles}] tried email OTP login as ${requestedEmailRole}`, severity: "high" });
      res.status(403).json({ error: "This account is not registered as a " + requestedEmailRole + ". Please use the correct app.", wrongApp: true }); return;
    }
  }

  if (user.isBanned) { res.status(403).json({ error: "Account suspended. Contact support." }); return; }
  const emailIsPending = user.approvalStatus === "pending";
  if (!user.isActive && !emailIsPending) { res.status(403).json({ error: "Account inactive. Contact support." }); return; }

  /* Check expiry FIRST — prevents timing oracle (attacker learning that an
     expired OTP was correct by observing which error branch fires). */
  if (user.emailOtpExpiry && new Date() > user.emailOtpExpiry) {
    res.status(401).json({ error: "OTP expired. Please request a new one." }); return;
  }

  if (user.emailOtpCode !== hashOtp(otp)) {
    const updated = await recordFailedAttempt(normalized, maxAttempts, lockoutMinutes);
    const remaining = maxAttempts - updated.attempts;
    addAuditEntry({ action: "email_otp_failed", ip, details: `Wrong email OTP for: ${normalized}`, result: "fail" });
    if (updated.locked) {
      res.status(429).json({ error: `Too many failed attempts. Locked for ${lockoutMinutes} minutes.` });
    } else {
      res.status(401).json({ error: `Invalid OTP. ${remaining} attempt(s) remaining.`, attemptsRemaining: remaining });
    }
    return;
  }

  /* Check approval BEFORE touching the DB — a rejected user must not have their OTP cleared */
  if (user.approvalStatus === "rejected") {
    res.status(403).json({ error: "Account rejected. Contact admin.", code: "APPROVAL_REJECTED", approvalStatus: "rejected", rejectionReason: user.approvalNote ?? null }); return;
  }

  /* Clear email OTP + mark email verified + update last login */
  await db.update(usersTable)
    .set({ emailOtpCode: null, emailOtpExpiry: null, emailVerified: true, lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  await resetAttempts(normalized);

  addAuditEntry({ action: "email_login", ip, details: `Email OTP login for: ${normalized}`, result: "success" });

  /* ── 2FA challenge ── */
  if (user.totpEnabled && isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    const deviceFingerprint = req.body.deviceFingerprint ?? "";
    const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
    if (!isDeviceTrusted(user, deviceFingerprint, trustedDays)) {
      const tempToken = sign2faChallengeToken(user.id, user.phone ?? "", user.roles?? "customer", user.roles ?? "customer", "email_otp");
      res.json({ requires2FA: true, tempToken, userId: user.id }); return;
    }
  }

  const isPendingApproval = user.approvalStatus === "pending";

  /* Issue short-lived access token + refresh token (consistent with OTP flow) */
  const accessToken = signAccessToken(user.id, user.phone ?? "", user.roles?? "customer", user.roles ?? "customer", user.tokenVersion ?? 0);
  const expiresAt   = new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString();

  if (isPendingApproval) {
    res.json({
      token: accessToken, expiresAt, pendingApproval: true,
      message: "Aapka account admin approval ke liye bheja gaya hai.",
      user: { id: user.id, phone: user.phone, name: user.name, role: user.roles, roles: user.roles, approvalStatus: "pending" },
    });
    return;
  }

  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokensTable).values({ id: generateId(), userId: user.id, tokenHash: refreshHash, authMethod: "email_otp", expiresAt: refreshExpiresAt });
  db.delete(refreshTokensTable).where(and(eq(refreshTokensTable.userId, user.id), lt(refreshTokensTable.expiresAt, new Date()))).catch(() => {});

  writeAuthAuditLog("login_success", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { method: "email_otp" } });

  /* Post-OTP customer app cross-role check: issue token + wrongApp flag so frontend
     can offer "Add Customer Access" flow from the wrong-app screen */
  const emailUserRoles = (user.roles || "customer").split(",").map((r: string) => r.trim());
  if (isEmailCustomerAppCtx && !emailUserRoles.includes("customer")) {
    addSecurityEvent({ type: "cross_role_login_attempt", ip, userId: user.id, details: `User with roles [${user.roles}] email-logged in to customer app context — offering add-role`, severity: "low" });
    res.json({
      token: accessToken, refreshToken: refreshRaw, expiresAt, sessionDays: REFRESH_TOKEN_TTL_DAYS,
      canAddCustomerRole: true, code: "cross_app_account", wrongApp: true,
      user: { id: user.id, phone: user.phone, name: user.name, email: user.email, username: user.username, role: user.roles, roles: user.roles ?? "customer", avatar: user.avatar, walletBalance: parseFloat(user.walletBalance ?? "0"), emailVerified: true, phoneVerified: user.phoneVerified ?? false },
    });
    return;
  }

  res.json({
    token:        accessToken,
    refreshToken: refreshRaw,
    expiresAt,
    sessionDays:  REFRESH_TOKEN_TTL_DAYS,
    pendingApproval: false,
    user: { id: user.id, phone: user.phone, name: user.name, email: user.email, username: user.username, role: user.roles, roles: user.roles ?? "customer", avatar: user.avatar, walletBalance: parseFloat(user.walletBalance ?? "0"), emailVerified: true, phoneVerified: user.phoneVerified ?? false },
  });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/login/username   (kept for backward-compat)
   POST /auth/login            (new unified endpoint)
   Unified identifier + password login (Binance-style).
   Accepts phone, email, OR username as `identifier` (or `username`).
   Body: { identifier, password } OR { username, password }
══════════════════════════════════════════════════════════════ */
function detectIdentifierType(raw: string): "phone" | "email" | "username" {
  if (raw.includes("@")) return "email";
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (/^\+?92\d{10}$/.test(cleaned) || /^0?3\d{9}$/.test(cleaned)) return "phone";
  if (/^\d{10,}$/.test(cleaned)) return "phone";
  return "username";
}

async function findUserByIdentifier(identifier: string) {
  const clean = identifier.toLowerCase().trim();
  const idType = detectIdentifierType(clean);

  if (idType === "phone") {
    const phone = canonicalizePhone(clean);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
    return { user: user ?? null, idType, lookupKey: phone };
  }
  if (idType === "email") {
    const [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${clean}`).limit(1);
    return { user: user ?? null, idType, lookupKey: clean };
  }
  const [user] = await db.select().from(usersTable).where(sql`lower(${usersTable.username}) = ${clean}`).limit(1);
  return { user: user ?? null, idType, lookupKey: clean };
}

async function handleUnifiedLogin(req: Request, res: any) {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({ error: first?.message ?? "Invalid request body", field: first?.path?.[0] ?? undefined });
    return;
  }
  const identifier = (parsed.data.identifier || parsed.data.username || "").trim();
  const { password } = parsed.data;
  if (!identifier) { res.status(400).json({ error: "Identifier and password required" }); return; }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!isAuthMethodEnabled(settings, "auth_username_password_enabled")) {
    res.status(403).json({ error: "Password login is currently disabled." });
    return;
  }

  const { user, idType, lookupKey } = await findUserByIdentifier(identifier);

  const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
  const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);

  const lockoutKey = user ? `uid:${user.id}` : lookupKey;

  const lockout = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
  if (lockout.locked) {
    res.status(429).json({ error: `Account locked. Try again in ${lockout.minutesLeft} minute(s).` }); return;
  }

  if (!user || !user.passwordHash) {
    await recordFailedAttempt(lockoutKey, maxAttempts, lockoutMinutes);
    addAuditEntry({ action: "unified_login_failed", ip, details: `Not found or no password (${idType}): ${lookupKey}`, result: "fail" });
    res.status(401).json({ error: "Invalid credentials" }); return;
  }

  if (!isAuthMethodEnabled(settings, "auth_username_password_enabled", user.roles?? "customer")) {
    res.status(403).json({ error: "Password login is currently disabled for your account type." });
    return;
  }

  /* ── Cross-role enforcement ── */
  const requestedRoleLogin = parsed.data.role;
  if (requestedRoleLogin) {
    const userRolesLogin = (user.roles || "customer").split(",").map((r: string) => r.trim());
    if (!userRolesLogin.includes(requestedRoleLogin)) {
      addSecurityEvent({ type: "cross_role_login_attempt", ip, userId: user.id, details: `User with roles [${user.roles}] tried to log in as ${requestedRoleLogin}`, severity: "high" });
      res.status(403).json({ error: "This account is not registered as a " + requestedRoleLogin + ". Please use the correct app.", wrongApp: true }); return;
    }
  }

  if (user.isBanned) { res.status(403).json({ error: "Account suspended. Contact support." }); return; }
  const isPendingApproval = user.approvalStatus === "pending";
  if (!user.isActive && !isPendingApproval) { res.status(403).json({ error: "Account inactive. Contact support." }); return; }

  const passwordOk = verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    const updated = await recordFailedAttempt(lockoutKey, maxAttempts, lockoutMinutes);
    addAuditEntry({ action: "unified_login_failed", ip, details: `Wrong password (${idType}): ${lookupKey}`, result: "fail" });
    if (updated.locked) {
      res.status(429).json({ error: `Too many failed attempts. Locked for ${lockoutMinutes} minutes.` });
    } else {
      res.status(401).json({ error: `Invalid credentials. ${maxAttempts - updated.attempts} attempt(s) remaining.` });
    }
    return;
  }

  if (user.approvalStatus === "rejected") {
    res.status(403).json({ error: "Account rejected. Contact admin.", code: "APPROVAL_REJECTED", approvalStatus: "rejected", rejectionReason: user.approvalNote ?? null }); return;
  }

  await resetAttempts(lockoutKey);
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  addAuditEntry({ action: "unified_login", ip, details: `Login via ${idType}: ${lookupKey}`, result: "success" });

  if (user.totpEnabled && isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    const deviceFingerprint = req.body.deviceFingerprint ?? "";
    const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
    if (!isDeviceTrusted(user, deviceFingerprint, trustedDays)) {
      const tempToken = sign2faChallengeToken(user.id, user.phone ?? "", user.roles?? "customer", user.roles ?? "customer", "password");
      res.json({ requires2FA: true, tempToken, userId: user.id }); return;
    }
  }

  const accessToken = signAccessToken(user.id, user.phone ?? "", user.roles?? "customer", user.roles ?? "customer", user.tokenVersion ?? 0);
  const expiresAt   = new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString();

  if (isPendingApproval) {
    res.json({
      token: accessToken, expiresAt, pendingApproval: true,
      message: "Aapka account admin approval ke liye bheja gaya hai.",
      user: { id: user.id, phone: user.phone, name: user.name, role: user.roles, roles: user.roles, approvalStatus: "pending" },
    });
    return;
  }

  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokensTable).values({ id: generateId(), userId: user.id, tokenHash: refreshHash, authMethod: "password", expiresAt: refreshExpiresAt });
  db.delete(refreshTokensTable).where(and(eq(refreshTokensTable.userId, user.id), lt(refreshTokensTable.expiresAt, new Date()))).catch(() => {});

  writeAuthAuditLog("login_success", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { method: `password_${idType}`, identifier: lookupKey } });

  res.json({
    token:        accessToken,
    refreshToken: refreshRaw,
    expiresAt,
    sessionDays:  REFRESH_TOKEN_TTL_DAYS,
    pendingApproval: false,
    identifierType: idType,
    user: { id: user.id, phone: user.phone, name: user.name, email: user.email, username: user.username, role: user.roles, roles: user.roles, avatar: user.avatar, walletBalance: parseFloat(user.walletBalance ?? "0"), emailVerified: user.emailVerified ?? false, phoneVerified: user.phoneVerified ?? false },
  });
}

router.post("/login/username", verifyCaptcha, handleUnifiedLogin);
router.post("/login", verifyCaptcha, handleUnifiedLogin);

/* ══════════════════════════════════════════════════════════════
   POST /auth/complete-profile
   Set name, email, username, password for first-time setup.
   Requires valid JWT. Body: { token, name, email?, username?, password? }
══════════════════════════════════════════════════════════════ */
router.post("/complete-profile", async (req, res) => {
  /* Accept token from body OR Authorization: Bearer header */
  const authHeader = req.headers["authorization"] as string | undefined;
  const rawToken = req.body?.token || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
  const { name, email, username, password, currentPassword, cnic, address, city, area, latitude, longitude } = req.body;
  if (!rawToken) { res.status(401).json({ error: "Token required" }); return; }

  /* Verify JWT to get userId */
  const payload = verifyUserJwt(rawToken);
  if (!payload) { res.status(401).json({ error: "Invalid or expired token. Please log in again." }); return; }
  const userId = payload.userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user)         { res.status(404).json({ error: "User not found" }); return; }
  if (user.isBanned) { res.status(403).json({ error: "Account suspended. Contact support." }); return; }
  if (!user.isActive && user.approvalStatus !== "pending") {
    res.status(403).json({ error: "Account inactive. Contact support." }); return;
  }

  const updates: Record<string, any> = { updatedAt: new Date() };

  if (name && name.trim().length > 1) {
    updates.name = name.trim();
  }

  if (email && email.includes("@")) {
    const normalized = email.toLowerCase().trim();
    /* Check email uniqueness (skip if it's already this user's email) */
    if (normalized !== user.email) {
      const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
      if (existing && existing.id !== userId) {
        res.status(409).json({ error: "Is email se pehle se ek account bana hua hai" }); return;
      }
    }
    updates.email = normalized;
  }

  if (username && username.length > 2) {
    const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, "").trim();
    if (clean.length < 3) { res.status(400).json({ error: "Username must be at least 3 characters (letters, numbers, underscore only)" }); return; }
    if (clean !== user.username) {
      const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.username}) = ${clean}`).limit(1);
      if (existing && existing.id !== userId) {
        res.status(409).json({ error: "Yeh username pehle se liya hua hai" }); return;
      }
    }
    updates.username = clean;
  }

  if (cnic && cnic.trim()) {
    const cnicClean = cnic.trim();
    if (CNIC_REGEX.test(cnicClean)) {
      updates.cnic = cnicClean;
      updates.nationalId = cnicClean;
    }
  }

  if (address && typeof address === "string" && address.trim()) {
    updates.address = address.trim();
  }
  if (city && typeof city === "string" && city.trim()) {
    updates.city = city.trim();
  }
  if (area && typeof area === "string" && area.trim()) {
    updates.area = area.trim();
  }
  if (latitude && typeof latitude === "string") {
    updates.latitude = latitude;
  }
  if (longitude && typeof longitude === "string") {
    updates.longitude = longitude;
  }

  if (password && password.length >= 8) {
    if (user.passwordHash) {
      if (!currentPassword) {
        res.status(400).json({ error: "Current password required to change password" }); return;
      }
      if (!verifyPassword(currentPassword, user.passwordHash)) {
        res.status(401).json({ error: "Current password galat hai" }); return;
      }
    }
    const check = validatePasswordStrength(password);
    if (!check.ok) { res.status(400).json({ error: check.message }); return; }
    updates.passwordHash = hashPassword(password);
  }

  const hasName = updates.name || user.name;
  const hasEmail = updates.email || user.email;
  const hasAddress = updates.address || user.address;
  const hasCity = updates.city || user.city;
  const hasCnic = updates.cnic || user.cnic;
  const hasPassword = updates.passwordHash || user.passwordHash;
  const filledCount = [hasName, hasEmail, hasAddress, hasCity, hasCnic, hasPassword].filter(Boolean).length;
  let newLevel = "bronze";
  if (filledCount >= 5 && hasCnic) newLevel = "gold";
  else if (filledCount >= 3) newLevel = "silver";
  updates.accountLevel = newLevel;

  if (Object.keys(updates).length === 1) {
    res.status(400).json({ error: "Koi update nahi kiya — name, email, username ya password provide karein" }); return;
  }

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();

  const accessToken = signAccessToken(updated!.id, updated!.phone ?? "", updated!.roles ?? "customer", updated!.roles ?? "customer", updated!.tokenVersion ?? 0);
  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokensTable).values({
    id:        generateId(),
    userId:    updated!.id,
    tokenHash: refreshHash,
    authMethod: "password",
    expiresAt: refreshExpiresAt,
  });

  db.delete(refreshTokensTable)
    .where(and(eq(refreshTokensTable.userId, updated!.id), lt(refreshTokensTable.expiresAt, new Date())))
    .catch(() => {});

  res.json({
    success: true,
    message: "Profile update ho gaya",
    token: accessToken,
    refreshToken: refreshRaw,
    user: { id: updated!.id, phone: updated!.phone, name: updated!.name, email: updated!.email, username: updated!.username, role: updated!.roles, roles: updated!.roles, avatar: updated!.avatar, cnic: updated!.cnic, city: updated!.city, area: updated!.area, address: updated!.address, latitude: updated!.latitude, longitude: updated!.longitude, kycStatus: updated!.kycStatus, accountLevel: updated!.accountLevel, totpEnabled: updated!.totpEnabled ?? false, emailVerified: updated!.emailVerified, phoneVerified: updated!.phoneVerified, walletBalance: parseFloat(updated!.walletBalance ?? "0"), isActive: updated!.isActive, createdAt: updated!.createdAt.toISOString() },
  });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/set-password
   Set or change password. Body: { token, password, currentPassword? }
══════════════════════════════════════════════════════════════ */
router.post("/set-password", async (req, res) => {
  /* Accept token from body OR Authorization: Bearer header */
  const authHeader = req.headers["authorization"] as string | undefined;
  const rawToken = req.body?.token || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
  const { password, currentPassword } = req.body;
  if (!rawToken || !password) { res.status(400).json({ error: "Token and password required" }); return; }

  const payload = verifyUserJwt(rawToken);
  if (!payload) { res.status(401).json({ error: "Invalid or expired token. Please log in again." }); return; }
  const userId = payload.userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user)         { res.status(404).json({ error: "User not found" }); return; }
  if (user.isBanned) { res.status(403).json({ error: "Account suspended. Contact support." }); return; }
  if (!user.isActive){ res.status(403).json({ error: "Account inactive. Contact support." }); return; }

  /* If user already has a password, ALWAYS require the current password — no bypass */
  if (user.passwordHash) {
    if (!currentPassword) {
      res.status(400).json({ error: "Current password required to change password" }); return;
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: "Current password galat hai" }); return;
    }
  }

  const check = validatePasswordStrength(password);
  if (!check.ok) { res.status(400).json({ error: check.message }); return; }

  /* Bump tokenVersion to invalidate all outstanding JWTs on password change */
  await db.update(usersTable).set({
    passwordHash: hashPassword(password),
    tokenVersion: sql`token_version + 1`,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, userId));
  writeAuthAuditLog("password_changed", { userId, ip: getClientIp(req), userAgent: req.headers["user-agent"] ?? undefined });
  res.json({ success: true, message: "Password set ho gaya" });
});

function isAuthMethodEnabled(settings: Record<string, string>, key: string, role?: string): boolean {
  const val = settings[key];
  if (!val) return false;
  if (val === "on") return true;
  if (val === "off") return false;
  try {
    const parsed = JSON.parse(val) as Record<string, string>;
    if (role) return (parsed[role] ?? "off") === "on";
    /* No role given — return true if at least one role has it enabled */
    return Object.values(parsed).some(v => v === "on");
  } catch {
    return val === "on";
  }
}

/* ══════════════════════════════════════════════════════════════════════
   OTP Rate Limiter — per account (phone/email) + per IP address
   Uses rateLimitsTable with sliding window (resets after window expires).
   Keys: otp_acct:<identifier>  and  otp_ip:<ip>
══════════════════════════════════════════════════════════════════════ */
async function checkAndIncrOtpRateLimit(params: {
  identifier: string;
  ip:         string;
  settings:   Record<string, string>;
}): Promise<{ blocked: true; retryAfterSeconds: number; reason: "account" | "ip" } | { blocked: false }> {
  const maxPerAcct = Math.max(1, parseInt(params.settings["security_otp_max_per_phone"] ?? "5",  10));
  const maxPerIp   = Math.max(1, parseInt(params.settings["security_otp_max_per_ip"]    ?? "10", 10));
  const windowMin  = Math.max(1, parseInt(params.settings["security_otp_window_min"]     ?? "60", 10));
  const windowMs   = windowMin * 60 * 1000;
  const now        = new Date();

  async function checkOne(
    key: string,
    max: number,
  ): Promise<{ blocked: true; retryAfterSeconds: number } | { blocked: false }> {
    const rows = await db.select().from(rateLimitsTable).where(eq(rateLimitsTable.key, key)).limit(1);
    const row  = rows[0];
    const windowExpired = !row || (now.getTime() - row.windowStart.getTime()) >= windowMs;

    if (windowExpired) {
      /* Reset (or create) the window and count this as 1 request */
      await db
        .insert(rateLimitsTable)
        .values({ key, attempts: 1, windowStart: now, updatedAt: now })
        .onConflictDoUpdate({
          target: rateLimitsTable.key,
          set:    { attempts: 1, windowStart: now, updatedAt: now },
        });
      return { blocked: false };
    }

    if (row.attempts >= max) {
      const windowEndsAt       = row.windowStart.getTime() + windowMs;
      const retryAfterSeconds  = Math.max(1, Math.ceil((windowEndsAt - now.getTime()) / 1000));
      return { blocked: true, retryAfterSeconds };
    }

    await db
      .update(rateLimitsTable)
      .set({ attempts: row.attempts + 1, updatedAt: now })
      .where(eq(rateLimitsTable.key, key));
    return { blocked: false };
  }

  /* 1. Per-account limit */
  const acctResult = await checkOne(`otp_acct:${params.identifier}`, maxPerAcct);
  if (acctResult.blocked) return { blocked: true, retryAfterSeconds: acctResult.retryAfterSeconds, reason: "account" };

  /* 2. Per-IP limit */
  const ipResult = await checkOne(`otp_ip:${params.ip}`, maxPerIp);
  if (ipResult.blocked) return { blocked: true, retryAfterSeconds: ipResult.retryAfterSeconds, reason: "ip" };

  return { blocked: false };
}

function isAuthMethodEnabledStrict(settings: Record<string, string>, newKey: string, legacyKey: string, role?: string): boolean {
  const newVal = settings[newKey];
  if (newVal) {
    try {
      const parsed = JSON.parse(newVal) as Record<string, string>;
      if (role && role in parsed) return parsed[role] === "on";
      if (!role) return false;
      return false;
    } catch {
      return newVal === "on";
    }
  }
  const legacyVal = settings[legacyKey];
  if (legacyVal) return legacyVal === "on";
  return false;
}

const CNIC_REGEX = /^\d{5}-\d{7}-\d{1}$/;
const PHONE_REGEX = /^0?3\d{9}$/;

router.post("/register", verifyCaptcha, sharedValidateBody(registerSchema), async (req, res) => {
  const { phone, password, name, role, cnic, nationalId, email, username,
          vehicleType, vehicleRegNo, drivingLicense,
          address, city, emergencyContact, vehiclePlate, vehiclePhoto, documents,
          businessName, businessType, storeAddress, ntn, storeName } = req.body;

  const ip = getClientIp(req);
  const settings = await getCachedSettings();
  const userRole = (role === "rider" || role === "vendor") ? role : "customer";

  if (settings["feature_new_users"] === "off") {
    res.status(403).json({ error: "New user registration is currently disabled." });
    return;
  }

  if (!isAuthMethodEnabled(settings, "auth_phone_otp_enabled", userRole)) {
    res.status(403).json({ error: "Phone registration is currently disabled for this role." });
    return;
  }

  if (!phone) {
    res.status(400).json({ error: "Phone number is required" });
    return;
  }
  const cleanedPhone = phone.replace(/[\s\-()]/g, "");
  if (!PHONE_REGEX.test(cleanedPhone)) {
    res.status(400).json({ error: "Invalid phone number. Use format: 03XXXXXXXXX" });
    return;
  }

  if (!password) {
    res.status(400).json({ error: "Password is required" });
    return;
  }
  const pwCheck = validatePasswordStrength(password);
  if (!pwCheck.ok) {
    res.status(400).json({ error: pwCheck.message });
    return;
  }

  const cnicValue = cnic || nationalId;
  if (cnicValue && !CNIC_REGEX.test(cnicValue)) {
    res.status(400).json({ error: "CNIC format must be XXXXX-XXXXXXX-X" });
    return;
  }

  if (userRole === "rider") {
    if (!cnicValue) { res.status(400).json({ error: "CNIC is required for rider registration" }); return; }
    if (!vehicleType) { res.status(400).json({ error: "Vehicle type is required for rider registration" }); return; }
  }

  if (userRole === "vendor") {
    if (!businessName && !storeName) { res.status(400).json({ error: "Business/store name is required for vendor registration" }); return; }
  }

  const normalizedPhone = canonicalizePhone(phone);
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, normalizedPhone)).limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with this phone number already exists" });
    return;
  }

  if (email) {
    const normalizedEmail = email.toLowerCase().trim();
    const [existingEmail] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
    if (existingEmail) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
  }

  let cleanUsername: string | null = null;
  if (username) {
    cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (cleanUsername !== null && cleanUsername.length >= 3) {
      const [existingUsername] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.username}) = ${cleanUsername}`).limit(1);
      if (existingUsername) {
        res.status(409).json({ error: "This username is already taken" });
        return;
      }
    } else {
      cleanUsername = null;
    }
  }

  const requireApproval = (settings["user_require_approval"] ?? "off") === "on";
  const autoApproveRider = userRole === "rider" && settings["rider_auto_approve"] === "on";
  const autoApproveVendor = userRole === "vendor" && settings["vendor_auto_approve"] === "on";
  const needsApproval = requireApproval && !autoApproveRider && !autoApproveVendor;

  const otp = generateSecureOtp();
  const otpExpiry = new Date(Date.now() + AUTH_OTP_TTL_MS);
  const userId = generateId();

  const ajkChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let ajkId = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    ajkId = "AJK-";
    for (let i = 0; i < 6; i++) ajkId += ajkChars.charAt(Math.floor(Math.random() * ajkChars.length));
    const [dup] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.ajkId, ajkId)).limit(1);
    if (!dup) break;
    if (attempt === 9) throw new Error("Failed to generate unique AJK ID after 10 attempts");
  }

  await db.insert(usersTable).values({
    id: userId,
    phone: normalizedPhone,
    name: name?.trim() || null,
    email: email ? email.toLowerCase().trim() : null,
    username: cleanUsername,
    roles: userRole,
    passwordHash: hashPassword(password),
    otpCode: hashOtp(otp),
    otpExpiry,
    otpUsed: false,
    walletBalance: "0",
    isActive: !needsApproval,
    approvalStatus: needsApproval ? "pending" : "approved",
    ajkId,
    cnic: cnicValue || null,
    nationalId: cnicValue || null,
    address: address || null,
    city: city || null,
    emergencyContact: emergencyContact || null,
  });

  if (userRole === "rider" && (vehicleType || vehicleRegNo || vehiclePlate || drivingLicense || vehiclePhoto || documents)) {
    await db.insert(riderProfilesTable).values({
      userId,
      vehicleType: vehicleType ? normalizeVehicleTypeForStorage(vehicleType) : null,
      vehicleRegNo: vehicleRegNo || null,
      vehiclePlate: vehiclePlate || vehicleRegNo || null,
      drivingLicense: drivingLicense || null,
      vehiclePhoto: vehiclePhoto || null,
      documents: documents || null,
    }).onConflictDoUpdate({ target: riderProfilesTable.userId, set: {
      vehicleType: vehicleType ? normalizeVehicleTypeForStorage(vehicleType) : null,
      vehicleRegNo: vehicleRegNo || null,
      vehiclePlate: vehiclePlate || vehicleRegNo || null,
      drivingLicense: drivingLicense || null,
    }});
  }

  if (userRole === "vendor" && (storeName || businessName || businessType || storeAddress || ntn)) {
    await db.insert(vendorProfilesTable).values({
      userId,
      storeName: storeName || businessName || null,
      businessName: businessName || storeName || null,
      businessType: businessType || null,
      storeAddress: storeAddress || null,
      ntn: ntn || null,
    }).onConflictDoUpdate({ target: vendorProfilesTable.userId, set: {
      storeName: storeName || businessName || null,
      businessName: businessName || storeName || null,
    }});
  }

  const registerLang = await getUserLanguage(userId);
  const smsResult = await sendOtpSMS(normalizedPhone, otp, settings, registerLang);
  if (settings["integration_whatsapp"] === "on") {
    sendWhatsAppOTP(normalizedPhone, otp, settings, registerLang).catch(err =>
      req.log.warn({ err: err.message }, "WhatsApp OTP send failed (non-fatal)")
    );
  }

  writeAuthAuditLog("register", { ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { phone: normalizedPhone, role: userRole } });

  const isDev = process.env.NODE_ENV !== "production";
  res.status(201).json({
    message: "Registration successful. Please verify your phone with the OTP sent.",
    userId,
    role: userRole,
    pendingApproval: needsApproval,
    channel: smsResult.sent ? smsResult.provider : "console",
  });
});

router.post("/forgot-password", verifyCaptcha, sharedValidateBody(forgotPasswordSchema), async (req, res) => {
  let { phone, email, identifier } = req.body;
  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (identifier && !phone && !email) {
    const resolved = await findUserByIdentifier(identifier);
    if (resolved.user) {
      if (resolved.idType === "phone") {
        phone = resolved.user.phone ?? undefined;
      } else if (resolved.idType === "email") {
        email = resolved.user.email ?? undefined;
      } else if (resolved.idType === "username") {
        if (resolved.user.email) {
          email = resolved.user.email ?? undefined;
        } else if (resolved.user.phone) {
          phone = resolved.user.phone ?? undefined;
        }
      }
    }
  }

  if (!phone && !email) {
    res.status(400).json({ error: "Phone, email, or username is required" });
    return;
  }

  if (phone && !isAuthMethodEnabled(settings, "auth_phone_otp_enabled")) {
    res.status(403).json({ error: "Phone-based password reset is currently disabled" });
    return;
  }
  if (email && !phone && !isAuthMethodEnabled(settings, "auth_email_otp_enabled")) {
    res.status(403).json({ error: "Email-based password reset is currently disabled" });
    return;
  }

  let user;
  if (phone) {
    const canonPhone = canonicalizePhone(phone);
    const [found] = await db.select().from(usersTable).where(eq(usersTable.phone, canonPhone)).limit(1);
    user = found;
  } else {
    const normalized = email!.toLowerCase().trim();
    const [found] = await db.select().from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
    user = found;
  }

  const isDev = process.env.NODE_ENV !== "production";
  if (!user) {
    res.json({ message: "If an account exists, a reset code has been sent.", ...(isDev ? { hint: "No account found" } : {}) });
    return;
  }

  const forgotRole = user.roles?? "customer";
  if (phone && !isAuthMethodEnabled(settings, "auth_phone_otp_enabled", forgotRole)) {
    res.status(403).json({ error: "Phone-based password reset is currently disabled for your account type." });
    return;
  }
  if (email && !phone && !isAuthMethodEnabled(settings, "auth_email_otp_enabled", forgotRole)) {
    res.status(403).json({ error: "Email-based password reset is currently disabled for your account type." });
    return;
  }

  if (user.isBanned) { res.status(403).json({ error: "Account suspended." }); return; }
  if (!user.isActive) { res.status(403).json({ error: "Account inactive." }); return; }

  const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
  const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);
  const lockoutKey = `reset:${user.id}`;
  const lockout = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
  if (lockout.locked) {
    res.status(429).json({ error: `Too many attempts. Try again in ${lockout.minutesLeft} minute(s).` });
    return;
  }

  const otp = generateSecureOtp();
  const otpExpiry = new Date(Date.now() + AUTH_OTP_TTL_MS);

  const forgotLang = await getUserLanguage(user.id);

  if (phone) {
    await db.update(usersTable)
      .set({ otpCode: hashOtp(otp), otpExpiry, otpUsed: false, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const targetPhone = canonicalizePhone(phone);
    await sendOtpSMS(targetPhone, otp, settings, forgotLang);
    if (settings["integration_whatsapp"] === "on") {
      sendWhatsAppOTP(targetPhone, otp, settings, forgotLang).catch(() => {});
    }
  } else {
    await db.update(usersTable)
      .set({ emailOtpCode: hashOtp(otp), emailOtpExpiry: otpExpiry, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    await sendPasswordResetEmail(email!, otp, user.name ?? undefined, forgotLang);
  }

  writeAuthAuditLog("forgot_password", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined });

  res.json({
    message: "If an account exists, a reset code has been sent.",
  });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/verify-reset-otp
   Pre-verify the OTP before allowing the user to set a new password.
   Body: { phone?, email?, otp }
   Returns: { valid: true } or 400/422 with error
══════════════════════════════════════════════════════════════ */
router.post("/verify-reset-otp", verifyCaptcha, async (req, res) => {
  let { phone, email, otp } = req.body;
  const ip = getClientIp(req);

  if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ error: "OTP must be exactly 6 digits" });
    return;
  }
  if (!phone && !email) {
    res.status(400).json({ error: "Phone or email is required" });
    return;
  }

  let user: (typeof usersTable.$inferSelect) | undefined;
  if (phone) {
    const canonPhone = canonicalizePhone(phone);
    const [found] = await db.select().from(usersTable).where(eq(usersTable.phone, canonPhone)).limit(1);
    user = found;
  } else {
    const normalized = (email as string).toLowerCase().trim();
    const [found] = await db.select().from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
    user = found;
  }

  if (!user) {
    res.status(422).json({ error: "Invalid or expired code" });
    return;
  }

  const hashed = hashOtp(otp);
  const now = new Date();

  if (phone) {
    if (!user.otpCode || user.otpCode !== hashed) {
      res.status(422).json({ error: "Invalid verification code" });
      return;
    }
    if (!user.otpExpiry || user.otpExpiry < now) {
      res.status(422).json({ error: "Verification code has expired. Please request a new one." });
      return;
    }
    if (user.otpUsed) {
      res.status(422).json({ error: "This code has already been used. Please request a new one." });
      return;
    }
  } else {
    if (!user.emailOtpCode || user.emailOtpCode !== hashed) {
      res.status(422).json({ error: "Invalid verification code" });
      return;
    }
    if (!user.emailOtpExpiry || user.emailOtpExpiry < now) {
      res.status(422).json({ error: "Verification code has expired. Please request a new one." });
      return;
    }
  }

  writeAuthAuditLog("verify_reset_otp", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined });
  res.json({ valid: true });
});

router.post("/reset-password", verifyCaptcha, async (req, res) => {
  let { phone, email, identifier, otp, newPassword, totpCode } = req.body;
  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ error: "OTP must be exactly 6 digits" });
    return;
  }
  if (!newPassword) {
    res.status(400).json({ error: "New password is required" });
    return;
  }

  if (identifier && !phone && !email) {
    const resolved = await findUserByIdentifier(identifier);
    if (resolved.user) {
      if (resolved.idType === "phone") {
        phone = resolved.user.phone ?? undefined;
      } else if (resolved.idType === "email") {
        email = resolved.user.email ?? undefined;
      } else if (resolved.idType === "username") {
        if (resolved.user.email) {
          email = resolved.user.email ?? undefined;
        } else if (resolved.user.phone) {
          phone = resolved.user.phone ?? undefined;
        }
      }
    }
  }

  if (!phone && !email) {
    res.status(400).json({ error: "Phone, email, or username is required" });
    return;
  }

  const pwCheck = validatePasswordStrength(newPassword);
  if (!pwCheck.ok) {
    res.status(400).json({ error: pwCheck.message });
    return;
  }

  let user;
  if (phone) {
    const canonPhone = canonicalizePhone(phone);
    const [found] = await db.select().from(usersTable).where(eq(usersTable.phone, canonPhone)).limit(1);
    user = found;
  } else {
    const normalized = email!.toLowerCase().trim();
    const [found] = await db.select().from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
    user = found;
  }

  if (!user) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const userRole = user.roles?? "customer";

  if (phone && !isAuthMethodEnabled(settings, "auth_phone_otp_enabled", userRole)) {
    res.status(403).json({ error: "Phone-based password reset is currently disabled for your account type." });
    return;
  }
  if (email && !phone && !isAuthMethodEnabled(settings, "auth_email_otp_enabled", userRole)) {
    res.status(403).json({ error: "Email-based password reset is currently disabled for your account type." });
    return;
  }

  if (user.isBanned) { res.status(403).json({ error: "Account suspended." }); return; }

  const maxAttempts = parseInt(settings["security_login_max_attempts"] ?? "5", 10);
  const lockoutMinutes = parseInt(settings["security_lockout_minutes"] ?? "30", 10);
  const lockoutKey = `reset:${user.id}`;
  const lockout = await checkLockout(lockoutKey, maxAttempts, lockoutMinutes);
  if (lockout.locked) {
    res.status(429).json({ error: `Too many attempts. Try again in ${lockout.minutesLeft} minute(s).` });
    return;
  }

  let otpValid = false;
  if (phone) {
    otpValid = user.otpCode === hashOtp(otp) && !user.otpUsed && user.otpExpiry != null && new Date() < user.otpExpiry;
  } else {
    otpValid = user.emailOtpCode === hashOtp(otp) && user.emailOtpExpiry != null && new Date() < user.emailOtpExpiry;
  }

  if (!otpValid) {
    await recordFailedAttempt(lockoutKey, maxAttempts, lockoutMinutes);
    addAuditEntry({ action: "reset_password_failed", ip, details: `Invalid OTP for password reset: ${user.id}`, result: "fail" });
    res.status(401).json({ error: "Invalid or expired OTP" });
    return;
  }

  if (user.totpEnabled && isAuthMethodEnabled(settings, "auth_2fa_enabled", userRole)) {
    if (!totpCode) {
      res.status(400).json({ error: "Two-factor authentication code required", requires2FA: true });
      return;
    }
    if (!/^\d{6}$/.test(totpCode)) {
      res.status(400).json({ error: "TOTP code must be 6 digits" });
      return;
    }
    if (!user.totpSecret) {
      res.status(400).json({ error: "2FA is not properly configured for this account. Please contact support." });
      return;
    }
    const { verifyTotpCode } = await import("../services/password.js");
    const decryptedSecret = decryptTotpSecret(user.totpSecret);
    if (!verifyTotpCode(decryptedSecret, totpCode)) {
      await recordFailedAttempt(lockoutKey, maxAttempts, lockoutMinutes);
      addAuditEntry({ action: "reset_password_2fa_failed", ip, details: `Invalid TOTP for password reset: ${user.id}`, result: "fail" });
      res.status(401).json({ error: "Invalid two-factor authentication code" });
      return;
    }
  }

  await db.update(usersTable).set({
    passwordHash: hashPassword(newPassword),
    otpCode: null,
    otpExpiry: null,
    otpUsed: true,
    emailOtpCode: null,
    emailOtpExpiry: null,
    tokenVersion: sql`token_version + 1`,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));

  await resetAttempts(lockoutKey);

  writeAuthAuditLog("password_reset", { userId: user.id, ip, userAgent: req.headers["user-agent"] ?? undefined });

  res.json({ success: true, message: "Password has been reset successfully. Please login with your new password." });
});

router.post("/email-register", verifyCaptcha, async (req, res) => {
  const { email, password, name, role, phone, username, cnic, vehicleType, vehicleRegNo, vehicleRegistration, drivingLicense,
          address, city, emergencyContact, vehiclePlate, vehiclePhoto, documents } = req.body;
  const ip = getClientIp(req);
  const settings = await getCachedSettings();
  const userRole = (role === "rider" || role === "vendor") ? role : "customer";

  if (!isAuthMethodEnabled(settings, "auth_email_register_enabled", userRole)) {
    res.status(403).json({ error: "Email registration is currently disabled" });
    return;
  }

  if (settings["feature_new_users"] === "off") {
    res.status(403).json({ error: "New user registration is currently disabled." });
    return;
  }

  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "Valid email address is required" });
    return;
  }
  if (!password) {
    res.status(400).json({ error: "Password is required" });
    return;
  }

  const pwCheck = validatePasswordStrength(password);
  if (!pwCheck.ok) {
    res.status(400).json({ error: pwCheck.message });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  let cleanUsername: string | null = null;
  if (username) {
    cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (cleanUsername !== null && cleanUsername.length >= 3) {
      const [existingUsername] = await db.select({ id: usersTable.id }).from(usersTable).where(sql`lower(${usersTable.username}) = ${cleanUsername}`).limit(1);
      if (existingUsername) {
        res.status(409).json({ error: "This username is already taken" });
        return;
      }
    } else {
      cleanUsername = null;
    }
  }

  const requireApproval = (settings["user_require_approval"] ?? "off") === "on";
  const userId = generateId();
  const tempPhone = `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const rawToken = generateVerificationToken();
  const tokenHash = hashVerificationToken(rawToken);
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const resolvedPhone = phone?.trim() || tempPhone;
  const resolvedVehicleRegNo = vehicleRegNo || vehicleRegistration || null;

  await db.insert(usersTable).values({
    id: userId,
    phone: resolvedPhone,
    name: name?.trim() || null,
    email: normalizedEmail,
    username: cleanUsername,    roles: userRole,
    passwordHash: hashPassword(password),
    walletBalance: "0",
    isActive: !requireApproval,
    approvalStatus: requireApproval ? "pending" : "approved",
    emailVerified: false,
    emailOtpCode: tokenHash,
    emailOtpExpiry: verificationExpiry,
    ...(cnic ? { cnic: cnic.trim() } : {}),
    ...(vehicleType ? { vehicleType: normalizeVehicleTypeForStorage(vehicleType) } : {}),
    ...(resolvedVehicleRegNo ? { vehicleRegNo: resolvedVehicleRegNo.trim() } : {}),
    ...(drivingLicense ? { drivingLicense: drivingLicense.trim() } : {}),
    ...(address ? { address: address.trim() } : {}),
    ...(city ? { city: city.trim() } : {}),
    ...(emergencyContact ? { emergencyContact: emergencyContact.trim() } : {}),
    ...(vehiclePlate ? { vehiclePlate: vehiclePlate.trim() } : {}),
    ...(vehiclePhoto ? { vehiclePhoto } : {}),
    ...(documents ? { documents } : {}),
  });

  const domain = process.env["REPLIT_DEV_DOMAIN"] || process.env["APP_DOMAIN"] || "localhost";
  const verificationLink = `https://${domain}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(normalizedEmail)}`;

  const verifyLang = await getUserLanguage(userId);
  const emailResult = await sendVerificationEmail(normalizedEmail, verificationLink, name, verifyLang);

  writeAuthAuditLog("email_register", { userId, ip, userAgent: req.headers["user-agent"] ?? undefined, metadata: { email: normalizedEmail, role: userRole, emailSent: emailResult.sent } });

  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    req.log.info({ email: normalizedEmail, emailSent: emailResult.sent }, "Email verification token generated");
  }

  res.status(201).json({
    message: emailResult.sent
      ? "Registration successful. Please check your email to verify your account."
      : "Registration successful. Please check your email to verify your account. (Email delivery pending — contact support if not received.)",
    userId,
    role: userRole,
    pendingApproval: requireApproval,
    emailSent: emailResult.sent,
    verificationLink: isDev ? verificationLink : undefined,
    ...(isDev ? { verificationToken: rawToken } : {}),
  });
});

router.get("/verify-email", async (req, res) => {
  const { token, email } = req.query as { token?: string; email?: string };
  const ip = getClientIp(req);

  if (!token || !email) {
    res.status(400).json({ error: "Invalid verification link" });
    return;
  }

  const normalizedEmail = decodeURIComponent(email).toLowerCase().trim();
  const verifyKey = `email_verify:${normalizedEmail}`;

  const lockout = await checkLockout(verifyKey, 5, 15);
  if (lockout.locked) {
    res.status(429).json({ error: `Too many verification attempts. Try again in ${lockout.minutesLeft} minute(s).` });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);

  if (!user) {
    await recordFailedAttempt(verifyKey, 5, 15);
    res.status(400).json({ error: "Invalid or expired verification link" });
    return;
  }

  if (user.emailVerified) {
    res.json({ message: "Email already verified. You can log in." });
    return;
  }

  if (user.emailOtpExpiry && new Date() > user.emailOtpExpiry) {
    res.status(401).json({ error: "Verification link has expired. Please register again." });
    return;
  }

  const incomingHash = hashVerificationToken(decodeURIComponent(token));
  if (!user.emailOtpCode || user.emailOtpCode !== incomingHash) {
    await recordFailedAttempt(verifyKey, 5, 15);
    addAuditEntry({ action: "email_verify_failed", ip, details: `Invalid verification token for ${normalizedEmail}`, result: "fail" });
    res.status(401).json({ error: "Invalid or expired verification link" });
    return;
  }

  await db.update(usersTable).set({
    emailVerified: true,
    emailOtpCode: null,
    emailOtpExpiry: null,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));

  await resetAttempts(verifyKey);
  writeAuthAuditLog("email_verified", { userId: user.id, ip });

  res.json({ message: "Email verified successfully. You can now log in." });
});

/* ══════════════════════════════════════════════════════════════
   HELPER: Extract authenticated user from JWT (Authorization header)
══════════════════════════════════════════════════════════════ */
function extractAuthUser(req: Request): { userId: string; phone: string; role: string } | null {
  const authHeader = req.headers["authorization"] as string | undefined;
  const raw = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : (req.body?.token ?? null);
  if (!raw) return null;
  const payload = verifyUserJwt(raw);
  if (!payload) return null;
  return { userId: payload.userId, phone: payload.phone, role: payload.role };
}

/* ══════════════════════════════════════════════════════════════
   HELPER: Issue tokens & build response for a given user
══════════════════════════════════════════════════════════════ */
function parseUserAgent(ua?: string): { deviceName: string; browser: string; os: string } {
  if (!ua) return { deviceName: "Unknown", browser: "Unknown", os: "Unknown" };
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera/")) browser = "Opera";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";
  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";
  const deviceName = `${browser} on ${os}`;
  return { deviceName, browser, os };
}

async function issueTokensForUser(user: any, ip: string, method: string, userAgent?: string) {
  const accessToken = signAccessToken(user.id, user.phone ?? "", user.roles?? "customer", user.roles ?? "customer", user.tokenVersion ?? 0);
  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const refreshTokenId = generateId();
  await db.insert(refreshTokensTable).values({ id: refreshTokenId, userId: user.id, tokenHash: refreshHash, authMethod: method, expiresAt: refreshExpiresAt });
  db.delete(refreshTokensTable).where(and(eq(refreshTokensTable.userId, user.id), lt(refreshTokensTable.expiresAt, new Date()))).catch((err) => { console.error("[auth] Expired token cleanup failed:", err); });
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  writeAuthAuditLog("login_success", { userId: user.id, ip, userAgent, metadata: { method } });

  const parsed = parseUserAgent(userAgent);
  const tokenHash = crypto.createHash("sha256").update(accessToken).digest("hex");
  try {
    await db.insert(userSessionsTable).values({
      id: generateId(),
      userId: user.id,
      tokenHash,
      refreshTokenId,
      deviceName: parsed.deviceName,
      browser: parsed.browser,
      os: parsed.os,
      ip,
    });
  } catch (err) { console.error("[auth] Session record insert failed:", err); }

  try {
    await db.insert(loginHistoryTable).values({
      id: generateId(),
      userId: user.id,
      ip,
      deviceName: parsed.deviceName,
      browser: parsed.browser,
      os: parsed.os,
      success: true,
      method,
    });
  } catch (err) { console.error("[auth] Login history insert failed:", err); }

  return {
    token: accessToken,
    refreshToken: refreshRaw,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString(),
    sessionDays: REFRESH_TOKEN_TTL_DAYS,
    user: {
      id: user.id, phone: user.phone, name: user.name, email: user.email,
      role: user.roles, roles: user.roles, avatar: user.avatar,
      walletBalance: parseFloat(user.walletBalance ?? "0"),
      isActive: user.isActive, cnic: user.cnic, city: user.city,
      emailVerified: user.emailVerified ?? false, phoneVerified: user.phoneVerified ?? false,
      totpEnabled: user.totpEnabled ?? false,
      needsProfileCompletion: !user.cnic || !user.name,
    },
  };
}

/* ══════════════════════════════════════════════════════════════
   HELPER: Check trusted device
══════════════════════════════════════════════════════════════ */
function isDeviceTrusted(user: any, deviceFingerprint: string, trustedDays: number): boolean {
  if (!user.trustedDevices || !deviceFingerprint) return false;
  try {
    const devices: Array<{ fp: string; expiresAt: number }> = JSON.parse(user.trustedDevices);
    const now = Date.now();
    return devices.some(d => d.fp === deviceFingerprint && d.expiresAt > now);
  } catch {
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════
   POST /auth/social/google
   Verify Google ID token, match or create user, return JWT.
   Body: { idToken, deviceFingerprint? }
══════════════════════════════════════════════════════════════ */
router.post("/social/google", async (req, res) => {
  const { idToken, deviceFingerprint } = req.body;
  if (!idToken) { res.status(400).json({ error: "idToken required" }); return; }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!isAuthMethodEnabledStrict(settings, "auth_google_enabled", "auth_social_google")) {
    res.status(403).json({ error: "Google login is currently disabled" }); return;
  }

  let googlePayload: any;
  try {
    const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error("Invalid token");
    googlePayload = await resp.json();
  } catch {
    addSecurityEvent({ type: "social_google_invalid_token", ip, details: "Invalid Google ID token", severity: "medium" });
    res.status(401).json({ error: "Invalid Google token" }); return;
  }

  const googleId = googlePayload.sub;
  const email = googlePayload.email?.toLowerCase?.() ?? null;
  const name = googlePayload.name ?? null;
  const avatar = googlePayload.picture ?? null;

  if (!googleId) { res.status(401).json({ error: "Google token missing sub" }); return; }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.googleId, googleId)).limit(1);

  if (!user && email) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (user) {
      await db.update(usersTable).set({ googleId, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
      user.googleId = googleId;
    }
  }

  const isNewUser = !user;

  /* ── Cross-role guard for social login ──
     If the caller specifies a role (rider/vendor), enforce that the existing account
     includes that role. Block new user creation for non-customer roles via social auth. */
  const requestedSocialRole = (req.body?.role as string | undefined) ?? null;
  if (requestedSocialRole && requestedSocialRole !== "customer") {
    if (user) {
      const userRoles = (user.roles || "").split(",").map((r: string) => r.trim());
      if (!userRoles.includes(requestedSocialRole)) {
        addSecurityEvent({ type: "cross_role_social_login_attempt", ip, details: `Social Google cross-role: requested=${requestedSocialRole} user.roles=${user.roles}`, severity: "medium" });
        res.status(403).json({ error: `No ${requestedSocialRole} account found for this Google account. Please use the correct app.`, wrongApp: true }); return;
      }
    } else {
      /* No user found — cannot auto-create non-customer accounts via social auth */
      res.status(403).json({ error: `No ${requestedSocialRole} account found for this Google account. Please use the correct registration process or contact admin.`, wrongApp: true }); return;
    }
  }

  const googleEffectiveRole = user?.roles ?? "customer";
  if (!isAuthMethodEnabledStrict(settings, "auth_google_enabled", "auth_social_google", googleEffectiveRole)) {
    res.status(403).json({ error: "Google login is currently disabled for your account type." }); return;
  }

  if (!user) {
    if (settings["feature_new_users"] === "off") {
      res.status(403).json({ error: "New user registration is currently disabled" }); return;
    }
    const requireApproval = settings["user_require_approval"] === "on";
    const id = generateId();
    [user] = await db.insert(usersTable).values({
      id, name, email, avatar, googleId, roles: "customer", walletBalance: "0",
      emailVerified: !!email,
      isActive: !requireApproval, approvalStatus: requireApproval ? "pending" : "approved",
    }).returning();
  }

  if (user!.isBanned) { res.status(403).json({ error: "Account suspended" }); return; }
  if (!user!.isActive && user!.approvalStatus !== "pending") { res.status(403).json({ error: "Account inactive" }); return; }

  if (user!.totpEnabled && isAuthMethodEnabled(settings, "auth_2fa_enabled", user!.roles || undefined)) {
    const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
    if (!isDeviceTrusted(user!, deviceFingerprint, trustedDays)) {
      const tempToken = sign2faChallengeToken(user!.id, user!.phone ?? "", user!.roles ?? "customer", user!.roles ?? "customer", "social_google");
      res.json({ requires2FA: true, tempToken, userId: user!.id }); return;
    }
  }

  addAuditEntry({ action: "social_google_login", ip, details: `Google login: ${email ?? googleId}`, result: "success" });
  const result = await issueTokensForUser(user!, ip, "social_google", req.headers["user-agent"] as string);
  res.json({ ...result, isNewUser, needsProfileCompletion: isNewUser || !user!.cnic || !user!.name });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/social/facebook
   Verify Facebook access token, match or create user, return JWT.
   Body: { accessToken, deviceFingerprint? }
══════════════════════════════════════════════════════════════ */
router.post("/social/facebook", async (req, res) => {
  const { accessToken: fbToken, deviceFingerprint } = req.body;
  if (!fbToken) { res.status(400).json({ error: "accessToken required" }); return; }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!isAuthMethodEnabledStrict(settings, "auth_facebook_enabled", "auth_social_facebook")) {
    res.status(403).json({ error: "Facebook login is currently disabled" }); return;
  }

  let fbPayload: any;
  try {
    const resp = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(fbToken)}`, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) throw new Error("Invalid token");
    fbPayload = await resp.json();
  } catch {
    addSecurityEvent({ type: "social_facebook_invalid_token", ip, details: "Invalid Facebook access token", severity: "medium" });
    res.status(401).json({ error: "Invalid Facebook token" }); return;
  }

  const facebookId = fbPayload.id;
  const email = fbPayload.email?.toLowerCase?.() ?? null;
  const name = fbPayload.name ?? null;
  const avatar = fbPayload.picture?.data?.url ?? null;

  if (!facebookId) { res.status(401).json({ error: "Facebook token missing id" }); return; }

  let [user] = await db.select().from(usersTable).where(eq(usersTable.facebookId, facebookId)).limit(1);

  if (!user && email) {
    [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (user) {
      await db.update(usersTable).set({ facebookId, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
      user.facebookId = facebookId;
    }
  }

  const isNewUser = !user;

  /* ── Cross-role guard for social login ──
     If the caller specifies a role (rider/vendor), enforce that the existing account
     includes that role. Block new user creation for non-customer roles via social auth. */
  const requestedFbSocialRole = (req.body?.role as string | undefined) ?? null;
  if (requestedFbSocialRole && requestedFbSocialRole !== "customer") {
    if (user) {
      const userRoles = (user.roles || "").split(",").map((r: string) => r.trim());
      if (!userRoles.includes(requestedFbSocialRole)) {
        addSecurityEvent({ type: "cross_role_social_login_attempt", ip, details: `Social Facebook cross-role: requested=${requestedFbSocialRole} user.roles=${user.roles}`, severity: "medium" });
        res.status(403).json({ error: `No ${requestedFbSocialRole} account found for this Facebook account. Please use the correct app.`, wrongApp: true }); return;
      }
    } else {
      /* No user found — cannot auto-create non-customer accounts via social auth */
      res.status(403).json({ error: `No ${requestedFbSocialRole} account found for this Facebook account. Please use the correct registration process or contact admin.`, wrongApp: true }); return;
    }
  }

  const fbEffectiveRole = user?.roles ?? "customer";
  if (!isAuthMethodEnabledStrict(settings, "auth_facebook_enabled", "auth_social_facebook", fbEffectiveRole)) {
    res.status(403).json({ error: "Facebook login is currently disabled for your account type." }); return;
  }

  if (!user) {
    if (settings["feature_new_users"] === "off") {
      res.status(403).json({ error: "New user registration is currently disabled" }); return;
    }
    const requireApproval = settings["user_require_approval"] === "on";
    const id = generateId();
    [user] = await db.insert(usersTable).values({
      id, name, email, avatar, facebookId, roles: "customer", walletBalance: "0",
      emailVerified: !!email,
      isActive: !requireApproval, approvalStatus: requireApproval ? "pending" : "approved",
    }).returning();
  }

  if (user!.isBanned) { res.status(403).json({ error: "Account suspended" }); return; }
  if (!user!.isActive && user!.approvalStatus !== "pending") { res.status(403).json({ error: "Account inactive" }); return; }

  if (user!.totpEnabled && isAuthMethodEnabled(settings, "auth_2fa_enabled", user!.roles || undefined)) {
    const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
    if (!isDeviceTrusted(user!, deviceFingerprint, trustedDays)) {
      const tempToken = sign2faChallengeToken(user!.id, user!.phone ?? "", user!.roles ?? "customer", user!.roles ?? "customer", "social_facebook");
      res.json({ requires2FA: true, tempToken, userId: user!.id }); return;
    }
  }

  addAuditEntry({ action: "social_facebook_login", ip, details: `Facebook login: ${email ?? facebookId}`, result: "success" });
  const result = await issueTokensForUser(user!, ip, "social_facebook", req.headers["user-agent"] as string);
  res.json({ ...result, isNewUser, needsProfileCompletion: isNewUser || !user!.cnic || !user!.name });
});

/* ══════════════════════════════════════════════════════════════
   GET /auth/2fa/setup
   Generate TOTP secret + QR code URI. Requires valid JWT.
══════════════════════════════════════════════════════════════ */
router.get("/2fa/setup", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const settings = await getCachedSettings();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    res.status(403).json({ error: "Two-factor authentication is currently disabled" }); return;
  }
  if (user.totpEnabled) { res.status(409).json({ error: "2FA is already enabled" }); return; }

  const secret = generateTotpSecret();
  const label = user.email ?? user.phone ?? user.name ?? auth.userId;
  const uri = getTotpUri(secret, label);

  const encryptedSecret = encryptTotpSecret(secret);
  await db.update(usersTable).set({ totpSecret: encryptedSecret, updatedAt: new Date() }).where(eq(usersTable.id, auth.userId));

  let qrDataUrl: string | null = null;
  try { qrDataUrl = await generateQRCodeDataURL(secret, label); } catch (err) { console.error("[2fa/setup] QR code generation failed:", err); }

  res.json({ secret, uri, qrDataUrl });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/2fa/verify-setup
   Confirm first TOTP code, activate 2FA, return backup codes.
   Body: { code }
══════════════════════════════════════════════════════════════ */
router.post("/2fa/verify-setup", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const { code } = req.body;
  if (!code) { res.status(400).json({ error: "TOTP code required" }); return; }

  const settings = await getCachedSettings();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    res.status(403).json({ error: "Two-factor authentication is currently disabled" }); return;
  }
  if (user.totpEnabled) { res.status(409).json({ error: "2FA is already enabled" }); return; }
  if (!user.totpSecret) { res.status(400).json({ error: "Please call /auth/2fa/setup first" }); return; }

  const secret = decryptTotpSecret(user.totpSecret);
  if (!verifyTotpToken(code, secret)) {
    res.status(401).json({ error: "Invalid TOTP code. Please try again." }); return;
  }

  const backupCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const raw = crypto.randomBytes(4).toString("hex");
    backupCodes.push(raw);
    hashedCodes.push(hashPassword(raw));
  }

  await db.update(usersTable).set({
    totpEnabled: true,
    backupCodes: JSON.stringify(hashedCodes),
    updatedAt: new Date(),
  }).where(eq(usersTable.id, auth.userId));

  const ip = getClientIp(req);
  writeAuthAuditLog("2fa_enabled", { userId: auth.userId, ip, userAgent: req.headers["user-agent"] as string });
  addAuditEntry({ action: "2fa_enabled", ip, details: `2FA enabled for user ${auth.userId}`, result: "success" });

  res.json({ success: true, backupCodes, message: "2FA activated. Save your backup codes securely — they cannot be shown again." });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/2fa/verify
   Verify TOTP code during login flow.
   Body: { tempToken, code, deviceFingerprint? }
══════════════════════════════════════════════════════════════ */
router.post("/2fa/verify", async (req, res) => {
  const { tempToken, code, deviceFingerprint } = req.body;
  if (!tempToken || !code) { res.status(400).json({ error: "tempToken and code required" }); return; }

  const challengePayload = verify2faChallengeToken(tempToken);
  if (!challengePayload) { res.status(401).json({ error: "Invalid or expired 2FA challenge token" }); return; }

  const settings = await getCachedSettings();
  const ip = getClientIp(req);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, challengePayload.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    res.status(403).json({ error: "Two-factor authentication has been disabled by admin." }); return;
  }

  if (!user.totpEnabled || !user.totpSecret) { res.status(400).json({ error: "2FA is not enabled" }); return; }

  const secret = decryptTotpSecret(user.totpSecret);
  if (!verifyTotpToken(code, secret)) {
    addSecurityEvent({ type: "2fa_verify_failed", ip, userId: user.id, details: "Invalid 2FA code on login", severity: "medium" });
    res.status(401).json({ error: "Invalid 2FA code" }); return;
  }

  writeAuthAuditLog("2fa_verified", { userId: user.id, ip, userAgent: req.headers["user-agent"] as string });
  const originalMethod = challengePayload.authMethod ?? "phone_otp";
  const result = await issueTokensForUser(user, ip, originalMethod, req.headers["user-agent"] as string);
  res.json(result);
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/2fa/disable
   Disable 2FA for the authenticated user. Body: { code }
══════════════════════════════════════════════════════════════ */
router.post("/2fa/disable", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const { code } = req.body;
  if (!code) { res.status(400).json({ error: "TOTP code required to disable 2FA" }); return; }

  const settings = await getCachedSettings();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    res.status(403).json({ error: "Two-factor authentication has been disabled by admin." }); return;
  }

  if (!user.totpEnabled || !user.totpSecret) { res.status(400).json({ error: "2FA is not enabled" }); return; }

  const secret = decryptTotpSecret(user.totpSecret);
  if (!verifyTotpToken(code, secret)) {
    res.status(401).json({ error: "Invalid TOTP code" }); return;
  }

  await db.update(usersTable).set({
    totpEnabled: false, totpSecret: null, backupCodes: null, trustedDevices: null, updatedAt: new Date(),
  }).where(eq(usersTable.id, auth.userId));

  const ip = getClientIp(req);
  writeAuthAuditLog("2fa_disabled", { userId: auth.userId, ip, userAgent: req.headers["user-agent"] as string });
  addAuditEntry({ action: "2fa_disabled", ip, details: `2FA disabled by user ${auth.userId}`, result: "success" });

  res.json({ success: true, message: "Two-factor authentication has been disabled" });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/2fa/recovery
   Use a single-use backup code. Body: { tempToken, backupCode }
══════════════════════════════════════════════════════════════ */
router.post("/2fa/recovery", async (req, res) => {
  const { tempToken, backupCode } = req.body;
  if (!tempToken || !backupCode) { res.status(400).json({ error: "tempToken and backupCode required" }); return; }

  const challengePayload = verify2faChallengeToken(tempToken);
  if (!challengePayload) { res.status(401).json({ error: "Invalid or expired 2FA challenge token" }); return; }

  const ip = getClientIp(req);

  const settings = await getCachedSettings();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, challengePayload.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    res.status(403).json({ error: "Two-factor authentication has been disabled by admin." }); return;
  }

  if (!user.totpEnabled || !user.backupCodes) { res.status(400).json({ error: "2FA is not enabled or no backup codes available" }); return; }

  let storedCodes: string[];
  try { storedCodes = JSON.parse(user.backupCodes); if (!Array.isArray(storedCodes)) storedCodes = []; } catch { storedCodes = []; }

  let matchIdx = -1;
  for (let i = 0; i < storedCodes.length; i++) {
    if (verifyPassword(backupCode, storedCodes[i]!)) { matchIdx = i; break; }
  }

  if (matchIdx === -1) {
    addSecurityEvent({ type: "2fa_recovery_failed", ip, userId: user.id, details: "Invalid backup code attempt", severity: "high" });
    res.status(401).json({ error: "Invalid backup code" }); return;
  }

  storedCodes.splice(matchIdx, 1);
  await db.update(usersTable).set({ backupCodes: JSON.stringify(storedCodes), updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  writeAuthAuditLog("2fa_recovery_used", { userId: user.id, ip, userAgent: req.headers["user-agent"] as string, metadata: { codesRemaining: storedCodes.length } });
  addAuditEntry({ action: "2fa_recovery_used", ip, details: `Backup code used for user ${user.id}, ${storedCodes.length} codes remaining`, result: "success" });

  const recoveryOrigMethod = challengePayload.authMethod ?? "phone_otp";
  const result = await issueTokensForUser(user, ip, recoveryOrigMethod, req.headers["user-agent"] as string);
  res.json({ ...result, codesRemaining: storedCodes.length });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/2fa/trust-device
   Store device fingerprint for trusted device bypass.
   Body: { deviceFingerprint }
══════════════════════════════════════════════════════════════ */
router.post("/2fa/trust-device", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const { deviceFingerprint } = req.body;
  if (!deviceFingerprint || typeof deviceFingerprint !== "string" || deviceFingerprint.length < 8) {
    res.status(400).json({ error: "Valid deviceFingerprint required (min 8 chars)" }); return;
  }

  const settings = await getCachedSettings();
  const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    res.status(403).json({ error: "Two-factor authentication has been disabled by admin." }); return;
  }

  if (!user.totpEnabled) { res.status(400).json({ error: "2FA is not enabled" }); return; }

  let devices: Array<{ fp: string; expiresAt: number }> = [];
  try { if (user.trustedDevices) devices = JSON.parse(user.trustedDevices); } catch {}

  const now = Date.now();
  devices = devices.filter(d => d.expiresAt > now && d.fp !== deviceFingerprint);
  devices.push({ fp: deviceFingerprint, expiresAt: now + trustedDays * 24 * 60 * 60 * 1000 });

  if (devices.length > 10) devices = devices.slice(-10);

  await db.update(usersTable).set({ trustedDevices: JSON.stringify(devices), updatedAt: new Date() }).where(eq(usersTable.id, auth.userId));

  const ip = getClientIp(req);
  writeAuthAuditLog("device_trusted", { userId: auth.userId, ip, userAgent: req.headers["user-agent"] as string });

  res.json({ success: true, message: `Device trusted for ${trustedDays} days`, trustedDevices: devices.length });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/magic-link/send
   Send a magic link to the user's email. Rate limited: 3 per email per 10 min.
   Body: { email }
══════════════════════════════════════════════════════════════ */
const magicLinkRateMap = new Map<string, { count: number; windowStart: number }>();

router.post("/magic-link/send", async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) { res.status(400).json({ error: "Valid email address required" }); return; }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!isAuthMethodEnabledStrict(settings, "auth_magic_link_enabled", "auth_magic_link")) {
    res.status(403).json({ error: "Magic link login is currently disabled" }); return;
  }

  const normalized = email.toLowerCase().trim();

  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const rlKey = `ml:${normalized}`;
  const rl = magicLinkRateMap.get(rlKey);
  if (rl && now - rl.windowStart < windowMs) {
    if (rl.count >= 3) {
      const waitMin = Math.ceil((rl.windowStart + windowMs - now) / 60000);
      res.status(429).json({ error: `Too many magic link requests. Try again in ${waitMin} minute(s).` }); return;
    }
    rl.count++;
  } else {
    magicLinkRateMap.set(rlKey, { count: 1, windowStart: now });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
  if (!user) {
    res.json({ message: "If an account exists with this email, a magic link has been sent." }); return;
  }

  const effectiveMagicRole = user.roles?? ((req.body?.role === "rider" || req.body?.role === "vendor") ? req.body.role : "customer");
  if (!isAuthMethodEnabledStrict(settings, "auth_magic_link_enabled", "auth_magic_link", effectiveMagicRole)) {
    res.status(403).json({ error: "Magic link login is currently disabled for your account type." }); return;
  }

  if (user.isBanned) { res.status(403).json({ error: "Account suspended" }); return; }
  if (!user.isActive) { res.status(403).json({ error: "Account inactive" }); return; }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashPassword(rawToken);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SEC * 1000);

  await db.insert(magicLinkTokensTable).values({
    id: generateId(),
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const magicLinkLang = await getUserLanguage(user.id);
  await sendMagicLinkEmail(normalized, rawToken, settings, magicLinkLang);

  addAuditEntry({ action: "magic_link_sent", ip, details: `Magic link sent to: ${normalized}`, result: "success" });
  writeAuthAuditLog("magic_link_sent", { ip, metadata: { email: normalized } });

  const isDev = process.env.NODE_ENV !== "production";
  res.json({
    message: "If an account exists with this email, a magic link has been sent.",
    ...(isDev ? { token: rawToken } : {}),
  });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/magic-link/verify
   Validate magic link token, handle 2FA guard.
   Body: { token, totpCode?, deviceFingerprint? }
══════════════════════════════════════════════════════════════ */
router.post("/magic-link/verify", async (req, res) => {
  const { token, totpCode, deviceFingerprint } = req.body;
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();

  if (!isAuthMethodEnabledStrict(settings, "auth_magic_link_enabled", "auth_magic_link")) {
    res.status(403).json({ error: "Magic link login is currently disabled" }); return;
  }

  const allTokens = await db.select().from(magicLinkTokensTable)
    .where(sql`${magicLinkTokensTable.usedAt} IS NULL AND ${magicLinkTokensTable.expiresAt} > now()`)
    .limit(50);

  let matchedRow: typeof allTokens[0] | null = null;
  for (const row of allTokens) {
    if (verifyPassword(token, row.tokenHash)) { matchedRow = row; break; }
  }

  if (!matchedRow) {
    addSecurityEvent({ type: "magic_link_invalid", ip, details: "Invalid or expired magic link token", severity: "medium" });
    res.status(401).json({ error: "Invalid or expired magic link. Please request a new one." }); return;
  }

  await db.update(magicLinkTokensTable).set({ usedAt: new Date() }).where(eq(magicLinkTokensTable.id, matchedRow.id));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, matchedRow.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.isBanned) { res.status(403).json({ error: "Account suspended" }); return; }
  if (!user.isActive) { res.status(403).json({ error: "Account inactive" }); return; }

  if (!isAuthMethodEnabledStrict(settings, "auth_magic_link_enabled", "auth_magic_link", user.roles?? "customer")) {
    res.status(403).json({ error: "Magic link login is currently disabled for your account type." }); return;
  }

  if (user.totpEnabled && isAuthMethodEnabled(settings, "auth_2fa_enabled", user.roles || undefined)) {
    const trustedDays = parseInt(settings["auth_trusted_device_days"] ?? "30", 10);
    if (!isDeviceTrusted(user, deviceFingerprint ?? "", trustedDays)) {
      if (!totpCode) {
        const tempToken = sign2faChallengeToken(user.id, user.phone ?? "", user.roles?? "customer", user.roles ?? "customer", "magic_link");
        res.json({ requires2FA: true, tempToken, userId: user.id }); return;
      }
      const secret = decryptTotpSecret(user.totpSecret!);
      if (!verifyTotpToken(totpCode, secret)) {
        res.status(401).json({ error: "Invalid 2FA code" }); return;
      }
    }
  }

  await db.update(usersTable).set({ emailVerified: true, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  addAuditEntry({ action: "magic_link_login", ip, details: `Magic link login: ${user.email ?? matchedRow.userId}`, result: "success" });
  const result = await issueTokensForUser(user, ip, "magic_link", req.headers["user-agent"] as string);
  res.json(result);
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/change-phone/request
   Send OTP to a new phone number for phone change flow.
   Body: { newPhone }
══════════════════════════════════════════════════════════════ */
router.post("/change-phone/request", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const { newPhone } = req.body;
  if (!newPhone || typeof newPhone !== "string") {
    res.status(400).json({ error: "New phone number is required" }); return;
  }

  const phone = canonicalizePhone(newPhone);
  if (!/^3\d{9}$/.test(phone)) {
    res.status(400).json({ error: "Invalid Pakistani phone number format" }); return;
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing) {
    res.status(409).json({ error: "This phone number is already registered to another account" }); return;
  }

  const ip = getClientIp(req);
  const settings = await getCachedSettings();
  const otp = generateSecureOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  await db.update(usersTable).set({
    mergeOtpCode: hashOtp(otp),
    mergeOtpExpiry: otpExpiry,
    pendingMergeIdentifier: phone,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, auth.userId));

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

  writeAuthAuditLog("phone_change_requested", { userId: auth.userId, ip, userAgent: req.headers["user-agent"] as string, metadata: { newPhone: phone } });

  res.json({ success: true, message: "OTP sent to new phone number" });
});

/* ══════════════════════════════════════════════════════════════
   POST /auth/change-phone/confirm
   Verify OTP and update phone number.
   Body: { newPhone, otp }
══════════════════════════════════════════════════════════════ */
router.post("/change-phone/confirm", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const { newPhone, otp } = req.body;
  if (!newPhone || !otp) {
    res.status(400).json({ error: "New phone number and OTP are required" }); return;
  }

  const phone = canonicalizePhone(newPhone);
  const ip = getClientIp(req);

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (user.pendingMergeIdentifier !== phone) {
    res.status(400).json({ error: "OTP was not requested for this phone number" }); return;
  }

  if (user.mergeOtpCode !== hashOtp(otp) || !user.mergeOtpExpiry || user.mergeOtpExpiry < new Date()) {
    res.status(400).json({ error: "Invalid or expired OTP" }); return;
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing) {
    res.status(409).json({ error: "This phone number is already registered to another account" }); return;
  }

  await db.update(usersTable).set({
    phone,
    phoneVerified: true,
    mergeOtpCode: null,
    mergeOtpExpiry: null,
    pendingMergeIdentifier: null,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, auth.userId));

  writeAuthAuditLog("phone_changed", { userId: auth.userId, ip, userAgent: req.headers["user-agent"] as string, metadata: { newPhone: phone } });

  res.json({ success: true, message: "Phone number updated successfully", phone });
});

/* ══════════════════════════════════════════════════════════════
   GET /auth/login-history
   Return last 20 login attempts for authenticated user.
══════════════════════════════════════════════════════════════ */
router.get("/login-history", async (req, res) => {
  const auth = extractAuthUser(req);
  if (!auth) { res.status(401).json({ error: "Authentication required" }); return; }

  const history = await db.select().from(loginHistoryTable)
    .where(eq(loginHistoryTable.userId, auth.userId))
    .orderBy(desc(loginHistoryTable.createdAt))
    .limit(20);

  res.json({
    history: history.map(h => ({
      id: h.id,
      ip: h.ip,
      deviceName: h.deviceName,
      browser: h.browser,
      os: h.os,
      location: h.location,
      success: h.success,
      method: h.method,
      createdAt: h.createdAt.toISOString(),
    })),
  });
});

export default router;
