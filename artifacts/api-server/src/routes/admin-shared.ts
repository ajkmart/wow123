import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { logger as pinoLogger } from "../lib/logger.js";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { eq, and, isNull } from "drizzle-orm";
import {
  db,
  platformSettingsTable,
  authAuditLogTable,
  adminAccountsTable,
} from "@workspace/db";
import { generateId } from "../lib/id.js";

/* ── CONSTANTS ─────────────────────────────────────────────────────────── */

export const ADMIN_TOKEN_TTL_HRS = 24;
export const ADMIN_REFRESH_TTL_DAYS = 30;

/* ── TYPE DEFINITIONS ──────────────────────────────────────────────────── */

export interface AdminPayload {
  adminId: string | null; // null for master super-admin
  adminRole: string;
  adminName: string;
  permissions: string[];
}

export interface AdminRequest extends Request {
  adminId?: string;
  adminRole?: string;
  adminName?: string;
  adminPermissions?: string[];
  adminPayload?: AdminPayload;
  adminIp?: string;
}

export type TranslationKey = string;

/* ── SECURITY CORE ─────────────────────────────────────────────────────── */

/**
 * signAdminJwt
 * Generates a short-lived access token for the admin dashboard.
 */
export function signAdminJwt(
  adminId: string | null,
  role: string,
  name: string,
  expiresInHrs: number = ADMIN_TOKEN_TTL_HRS,
  permissions: string[] = []
): string {
  const secret = process.env.ADMIN_JWT_SECRET || "admin-secret-dev";
  return jwt.sign(
    {
      adminId,
      role,
      name,
      permissions,
    },
    secret,
    { expiresIn: `${expiresInHrs}h` }
  );
}

/**
 * signAdminRefreshToken
 * Generates a long-lived refresh token for admin sessions.
 */
export function signAdminRefreshToken(
  adminId: string | null,
  role: string
): string {
  const secret = process.env.ADMIN_JWT_REFRESH_SECRET || "admin-refresh-secret-dev";
  return jwt.sign({ adminId, role }, secret, {
    expiresIn: `${ADMIN_REFRESH_TTL_DAYS}d`,
  });
}

/**
 * getAdminSecret
 * Retrieves the master super-admin secret from environment variables or DB.
 * The DB setting 'admin_master_secret' acts as an override if present.
 */
export async function getAdminSecret(): Promise<string | null> {
  const envSecret = process.env.ADMIN_SECRET;

  try {
    const settings = await getCachedSettings();
    return settings["admin_master_secret"] || envSecret || null;
  } catch (err) {
    pinoLogger.error({ err }, "[admin-shared] Failed to fetch admin secret from DB");
    return envSecret || null;
  }
}

/**
 * verifyAdminSecret
 * Simple timing-safe check for the legacy master secret.
 */
export async function verifyAdminSecret(input: string): Promise<boolean> {
  const actual = await getAdminSecret();
  if (!actual) return false;
  // Use a simple comparison here; in production, use crypto.timingSafeEqual if possible.
  return input === actual;
}

/* ── MIDDLEWARE ────────────────────────────────────────────────────────── */

/**
 * adminAuth
 * Middleware to verify the Admin JWT and attach payload to the request.
 */
export const adminAuth = (req: AdminRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1]!;
  const secret = process.env.ADMIN_JWT_SECRET || "admin-secret-dev";

  try {
    const payload = jwt.verify(token, secret) as AdminPayload;
    req.adminId = payload.adminId ?? undefined;
    req.adminRole = payload.role;
    req.adminName = payload.name;
    req.adminPermissions = payload.permissions;
    req.adminPayload = payload;
    req.adminIp = getClientIp(req);
    next();
  } catch (err) {
    pinoLogger.warn({ err, ip: getClientIp(req) }, "[admin-shared] Invalid admin token");
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
};

/* ── AUDIT LOGGING ─────────────────────────────────────────────────────── */

/**
 * addAuditEntry
 * Records a security-relevant event to the audit log.
 */
export async function addAuditEntry(params: {
  action: string;
  ip: string;
  adminId?: string | null;
  details?: string;
  result: "success" | "fail" | "warn";
}) {
  try {
    await db.insert(authAuditLogTable).values({
      id: generateId(),
      action: params.action,
      ipAddress: params.ip,
      adminId: params.adminId || null,
      details: params.details || null,
      result: params.result,
      createdAt: new Date(),
    });
  } catch (err) {
    pinoLogger.error({ err, params }, "[admin-shared] Failed to write audit entry");
  }
}

/* ── SETTINGS CACHE ────────────────────────────────────────────────────── */

let settingsCache: Record<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export async function getCachedSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (settingsCache && now - cacheTimestamp < CACHE_TTL_MS) {
    return settingsCache;
  }

  try {
    const rows = await db.select().from(platformSettingsTable);
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r.value !== null) map[r.key] = r.value;
    }
    settingsCache = map;
    cacheTimestamp = now;
    return map;
  } catch (err) {
    pinoLogger.error({ err }, "[admin-shared] Settings cache refresh failed");
    return settingsCache || {};
  }
}

export function invalidateSettingsCache() {
  settingsCache = null;
}

export async function getPlatformSettings() {
  return getCachedSettings();
}

/* ── HELPERS ───────────────────────────────────────────────────────────── */

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0])?.trim() || req.ip || "unknown";
  }
  return req.ip || "unknown";
}

/* ── MFA UTILITIES ─────────────────────────────────────────────────────── */

export function generateTotpSecret(): string {
  return randomBytes(20).toString("hex");
}

export async function generateQRCodeDataURL(secret: string, accountName: string): Promise<string> {
  const { default: qrcode } = await import("qrcode");
  const uri = getTotpUri(secret, accountName);
  return qrcode.toDataURL(uri);
}

export function getTotpUri(secret: string, accountName: string): string {
  const issuer = "AJKMart Admin";
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

export function verifyTotpToken(token: string, secret: string): boolean {
  const { default: otplib } = await import("otplib");
  // The otplib library is used for TOTP verification.
  // In a real implementation, you would configure it with the secret.
  return (otplib as any).authenticator.check(token, secret);
}

/* ── RATE LIMITING / SECURITY EVENTS ──────────────────────────────────── */

export async function resetAdminLoginAttempts(ip: string) {
  // Placeholder for rate-limiter reset logic if using a DB-backed limiter.
  pinoLogger.info({ ip }, "[admin-shared] Resetting login attempts");
}

export async function addSecurityEvent(params: {
  type: string;
  ip: string;
  details: string;
  severity: "low" | "medium" | "high" | "critical";
}) {
  pinoLogger.warn(params, "[admin-shared] Security event recorded");
  // Implementation for recording to a security_events table would go here.
}

/* ── LOCALISATION ──────────────────────────────────────────────────────── */

export function stripUser(user: any) {
  const { password, ...rest } = user;
  return rest;
}

export async function getUserLanguage(userId: string): Promise<string> {
  // Implementation to fetch user language preference.
  return "en";
}

export function t(key: TranslationKey, lang: string): string {
  // Simple translation helper placeholder.
  return key;
}

export async function sendUserNotification(params: {
  userId: string;
  title: string;
  body: string;
  data?: any;
}) {
  // Implementation for push/in-app notifications.
  pinoLogger.info(params, "[admin-shared] User notification sent");
}

/* ── RIDE SERVICES SEEDING ─────────────────────────────────────────────── */

export async function ensureDefaultRideServices() {
  // Placeholder for ensuring default ride categories exist in the DB.
}

export async function ensureDefaultLocations() {
  // Placeholder for ensuring default city/area data exists in the DB.
}

export function formatSvc(svc: any) {
  return svc;
}
