import { boolean, check, decimal, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id:              text("id").primaryKey(),
  phone:           text("phone").unique(),
  name:            text("name"),
  email:           text("email").unique(),
  roles:           text("roles").notNull().default("customer"),
  avatar:          text("avatar"),
  walletBalance:   decimal("wallet_balance", { precision: 10, scale: 2 }).notNull().default("0"),
  /* ── OTP fields (phone verification) ── */
  otpCode:         text("otp_code"),
  otpExpiry:       timestamp("otp_expiry"),
  otpUsed:         boolean("otp_used").notNull().default(false),
  /* ── Email OTP (separate from phone OTP) ── */
  emailOtpCode:    text("email_otp_code"),
  emailOtpExpiry:  timestamp("email_otp_expiry"),
  /* ── Username + password login ── */
  username:        text("username").unique(),
  passwordHash:    text("password_hash"),
  requirePasswordChange: boolean("require_password_change").notNull().default(false),
  /* ── Verification status ── */
  phoneVerified:   boolean("phone_verified").notNull().default(false),
  emailVerified:   boolean("email_verified").notNull().default(false),
  /* ── Admin approval ── */
  approvalStatus:  text("approval_status").notNull().default("approved"), /* pending | approved | rejected */
  approvalNote:    text("approval_note"),
  /* ── Account status ── */
  isActive:        boolean("is_active").notNull().default(true),
  isBanned:        boolean("is_banned").notNull().default(false),
  banReason:       text("ban_reason"),
  blockedServices: text("blocked_services").notNull().default(""),
  securityNote:    text("security_note"),
  isOnline:          boolean("is_online").notNull().default(false),
  /* ── Extended profile fields (shared across roles) ── */
  cnic:              text("cnic"),
  address:           text("address"),
  city:              text("city"),
  area:              text("area"),
  latitude:          text("latitude"),
  longitude:         text("longitude"),
  kycStatus:         text("kyc_status").notNull().default("none"),
  accountLevel:      text("account_level").notNull().default("bronze"),
  emergencyContact:  text("emergency_contact"),
  bankName:          text("bank_name"),
  bankAccount:       text("bank_account"),
  bankAccountTitle:  text("bank_account_title"),
  nationalId:        text("national_id"),
  biometricEnabled:  boolean("biometric_enabled").notNull().default(false),
  /* ── Wallet MPIN security ── */
  walletPinHash:       text("wallet_pin_hash"),
  walletPinAttempts:   integer("wallet_pin_attempts").notNull().default(0),
  walletPinLockedUntil: timestamp("wallet_pin_locked_until"),
  walletHidden:        boolean("wallet_hidden").notNull().default(false),
  /* ── MPIN forgot-flow cooldown (SIM-swap protection) ──
     When TOTP is not enabled, a reset request stores the new hashed MPIN here
     and sets mpinResetPendingAt. The hash is only promoted to walletPinHash
     after a 24-hour cooldown elapses. This prevents instant SIM-swap drain. */
  mpinResetPendingAt:     timestamp("mpin_reset_pending_at"),
  mpinResetNewHashPending: text("mpin_reset_new_hash_pending"),
  /* ── 2FA / TOTP fields ── */
  totpSecret:        text("totp_secret"),
  totpEnabled:       boolean("totp_enabled").notNull().default(false),
  backupCodes:       text("backup_codes"),
  trustedDevices:    text("trusted_devices"),
  /* ── Firebase Auth ── */
  firebaseUid:       text("firebase_uid").unique(),
  /* ── Social login fields ── */
  googleId:          text("google_id").unique(),
  facebookId:        text("facebook_id").unique(),
  /* ── Dispatch tracking ── */
  cancelCount:     integer("cancel_count").notNull().default(0),
  ignoreCount:     integer("ignore_count").notNull().default(0),
  isRestricted:    boolean("is_restricted").notNull().default(false),
  cancellationDebt: decimal("cancellation_debt", { precision: 10, scale: 2 }).notNull().default("0"),
  /* ── Merge OTP fields (separate from login OTP to avoid race conditions) ── */
  mergeOtpCode:    text("merge_otp_code"),
  mergeOtpExpiry:  timestamp("merge_otp_expiry"),
  /* ── Pending merge identifier — binds merge-OTP to a specific identifier ── */
  pendingMergeIdentifier: text("pending_merge_identifier"),
  /* ── Device fingerprinting — for multi-account abuse detection ── */
  deviceId:        text("device_id"),
  /* ── Token version — incremented on logout/ban/role change to invalidate access JWTs ── */
  tokenVersion:    integer("token_version").notNull().default(0),
  /* ── Dev OTP mode — admin-controlled per-user OTP display in response ── */
  devOtpEnabled:   boolean("dev_otp_enabled").notNull().default(false),
  /* ── OTP bypass — admin-set window during which OTP verification is skipped ── */
  otpBypassUntil:  timestamp("otp_bypass_until"),
  /* ── User metrics — aggregated for admin condition engine ── */
  cancellationRate:    decimal("cancellation_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  fraudIncidents:      integer("fraud_incidents").notNull().default(0),
  abuseReports:        integer("abuse_reports").notNull().default(0),
  missIgnoreRate:      decimal("miss_ignore_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  orderCompletionRate: decimal("order_completion_rate", { precision: 5, scale: 2 }).notNull().default("100"),
  avgRating:           decimal("avg_rating", { precision: 3, scale: 2 }),
  /* ── Auto-suspension tracking ── */
  autoSuspendedAt: timestamp("auto_suspended_at"),
  autoSuspendReason: text("auto_suspend_reason"),
  adminOverrideSuspension: boolean("admin_override_suspension").notNull().default(false),
  commissionOverride: text("commission_override"),
  ajkId:             text("ajk_id").unique(),
  chatMuted:         boolean("chat_muted").notNull().default(false),
  commBlocked:       boolean("comm_blocked").notNull().default(false),
  lastLoginAt:         timestamp("last_login_at"),
  lastActive:          timestamp("last_active"),
  acceptedTermsVersion: text("accepted_terms_version"),
  /* ── PII encryption columns (AES-256-GCM, dual-write alongside plaintext) ── */
  encryptedPhone:  text("encrypted_phone"),
  encryptedEmail:  text("encrypted_email"),
  deletedAt:       timestamp("deleted_at", { withTimezone: true }),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  /* DB-level floor: wallet can never go below zero.
     Application layer already enforces this; the DB constraint is the final guard. */
  check("users_wallet_non_negative", sql`${t.walletBalance} >= 0`),
  /* Performance indexes for fleet/admin queries that filter by roles and/or online status */
  index("users_roles_idx").on(t.roles),
  index("users_is_online_idx").on(t.isOnline),
  index("users_roles_is_online_idx").on(t.roles, t.isOnline),
  index("users_ajk_id_idx").on(t.ajkId),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
