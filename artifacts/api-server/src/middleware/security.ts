import { logger } from "../lib/logger.js";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable, authAuditLogTable, rateLimitsTable, adminActionAuditLogTable } from "@workspace/db/schema";
import { eq, and, lt, gt, like, sql, isNull } from "drizzle-orm";
import { getPlatformSettings } from "../routes/admin.js";
import { generateId } from "../lib/id.js";

/* ══════════════════════════════════════════════════════════════
   JWT CONFIGURATION — fail-fast if secret is absent or too short
   ══════════════════════════════════════════════════════════════ */
const _jwtSecret = process.env["JWT_SECRET"];
if (!_jwtSecret || _jwtSecret.length < 32) {
  const msg = !_jwtSecret
    ? "[AUTH] FATAL: JWT_SECRET environment variable is not set. Minimum 32 characters required."
    : `[AUTH] FATAL: JWT_SECRET too short (${_jwtSecret.length} chars, need ≥32).`;
  logger.error(msg);
  process.exit(1);
}
export const JWT_SECRET: string = _jwtSecret;

/* Access token TTL defaults — overridden at runtime by platform settings jwt_access_ttl_sec / jwt_refresh_ttl_days */
export const ACCESS_TOKEN_TTL_SEC = 900;      /* 15 minutes */
export const REFRESH_TOKEN_TTL_DAYS = 7;       /* 7 days */

function safeInt(val: string | undefined, fallback: number, min = 1): number {
  const n = parseInt(val ?? String(fallback), 10);
  return Number.isFinite(n) ? Math.max(min, n) : fallback;
}

export function getRefreshTokenTtlDays(): number {
  return safeInt(settingsCache["jwt_refresh_ttl_days"], REFRESH_TOKEN_TTL_DAYS, 1);
}

export function getAccessTokenTtlSec(): number {
  return safeInt(settingsCache["jwt_access_ttl_sec"], ACCESS_TOKEN_TTL_SEC, 60);
}

/* ══════════════════════════════════════════════════════════════
   ADMIN JWT CONFIGURATION — separate from user JWT
   ══════════════════════════════════════════════════════════════ */
const _adminJwtSecret = process.env["ADMIN_JWT_SECRET"];
if (!_adminJwtSecret || _adminJwtSecret.length < 32) {
  const msg = !_adminJwtSecret
    ? "[AUTH] FATAL: ADMIN_JWT_SECRET environment variable is not set. Minimum 32 characters required."
    : `[AUTH] FATAL: ADMIN_JWT_SECRET too short (${_adminJwtSecret.length} chars, need ≥32).`;
  logger.error(msg);
  process.exit(1);
}
export const ADMIN_JWT_SECRET: string = _adminJwtSecret;
export const ADMIN_TOKEN_TTL_HRS = 24;

/* ══════════════════════════════════════════════════════════════
   TOR EXIT NODE DETECTION
   Startup uses a bundled static fallback list so the server never
   blocks on an external network call at boot time. The live list
   from torproject.org is fetched as a non-blocking background task
   and then refreshed on the normal TTL interval afterwards.
   ══════════════════════════════════════════════════════════════ */

/**
 * Minimal static fallback — a curated sample of historically
 * persistent Tor exit relays that remain stable across refreshes.
 * This list is intentionally small; it only guards the window
 * between process start and the first successful live refresh.
 * Do NOT rely on this for exhaustive coverage.
 */
const TOR_STATIC_FALLBACK: readonly string[] = [
  "109.70.100.2",
  "109.70.100.18",
  "109.70.100.34",
  "109.70.100.50",
  "185.220.101.1",
  "185.220.101.2",
  "185.220.101.3",
  "185.220.101.4",
  "185.220.101.5",
  "185.220.101.33",
  "185.220.101.34",
  "185.220.101.35",
  "185.220.101.44",
  "185.220.101.45",
  "185.220.101.46",
  "185.220.101.47",
  "185.220.102.8",
  "185.220.103.5",
  "185.220.103.7",
  "199.249.230.65",
  "199.249.230.66",
  "199.249.230.68",
  "199.249.230.76",
];

let torExitNodes: Set<string> = new Set(TOR_STATIC_FALLBACK);
let torListFetchedAt = 0; /* 0 = only the static fallback is loaded */
let TOR_LIST_TTL_MS = 60 * 60 * 1000;

async function refreshTorExitNodes(): Promise<void> {
  try {
    const resp = await fetch("https://check.torproject.org/torbulkexitlist", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      const msg = `TOR list HTTP error ${resp.status}`;
      logger.warn(`[TOR] Failed to refresh exit node list: ${msg}`);
      addSecurityEvent({ type: "tor_list_refresh_failed", ip: "server", details: msg, severity: "low" });
      return;
    }
    const text = await resp.text();
    const ips = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    torExitNodes = new Set(ips);
    torListFetchedAt = Date.now();
    logger.info(`[TOR] Refreshed exit node list: ${torExitNodes.size} nodes`);
  } catch (err: any) {
    const msg = err?.message ?? "unknown error";
    logger.warn(`[TOR] Failed to fetch exit node list: ${msg}`);
    addSecurityEvent({ type: "tor_list_refresh_failed", ip: "server", details: `TOR list fetch error: ${msg}`, severity: "low" });
  }
}

/* Non-blocking background refresh — runs after startup, never delays boot */
setImmediate(() => {
  refreshTorExitNodes().catch(() => {});
  setInterval(() => { refreshTorExitNodes().catch(() => {}); }, TOR_LIST_TTL_MS);
});

async function isTorExitNode(ip: string): Promise<boolean> {
  /* If the live list has never been fetched (torListFetchedAt === 0) the static
     fallback set is already active — no need to await a live refresh here. */
  if (torListFetchedAt > 0 && Date.now() - torListFetchedAt > TOR_LIST_TTL_MS) {
    /* List is stale — trigger a background refresh; use the existing set for now */
    refreshTorExitNodes().catch(() => {});
  }
  return torExitNodes.has(ip);
}

/* ══════════════════════════════════════════════════════════════
   VPN / PROXY DETECTION
   ══════════════════════════════════════════════════════════════ */
const vpnCache: Map<string, { isVpn: boolean; cachedAt: number }> = new Map();
let VPN_CACHE_TTL_MS = 10 * 60 * 1000;

async function isVpnOrProxy(ip: string): Promise<boolean> {
  const cached = vpnCache.get(ip);
  if (cached && Date.now() - cached.cachedAt < VPN_CACHE_TTL_MS) {
    return cached.isVpn;
  }

  if (ip === "unknown" || ip.startsWith("127.") || ip.startsWith("::1") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.")) {
    return false;
  }

  try {
    const resp = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) {
      logger.warn(`[VPN] Check failed for IP ${ip}: HTTP ${resp.status} — flagging as check_failed`);
      addSecurityEvent({ type: "vpn_check_failed", ip, details: `VPN check HTTP error ${resp.status}`, severity: "low" });
      return false;
    }
    interface IpApiResponse { status?: string; proxy?: boolean; hosting?: boolean; }
    const data = await resp.json() as IpApiResponse;
    const isVpn = data.status === "success" && (data.proxy === true || data.hosting === true);
    vpnCache.set(ip, { isVpn, cachedAt: Date.now() });
    return isVpn;
  } catch (err: any) {
    logger.warn(`[VPN] Check failed for IP ${ip}: ${err?.message ?? "unknown error"} — flagging as check_failed`);
    addSecurityEvent({ type: "vpn_check_failed", ip, details: `VPN check error: ${err?.message ?? "unknown"}`, severity: "low" });
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════
   BLOCKED-IP CACHE  (backed by rate_limits DB table)
   ══════════════════════════════════════════════════════════════ */
const blockedIPsCache = new Set<string>();

async function loadBlockedIPs() {
  try {
    const rows = await db.select({ key: rateLimitsTable.key })
      .from(rateLimitsTable)
      .where(like(rateLimitsTable.key, "blocked_ip:%"));
    for (const row of rows) blockedIPsCache.add(row.key.replace("blocked_ip:", ""));
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "[security] loadBlockedIPs DB query failed");
  }
}
loadBlockedIPs().catch((e: Error) => logger.warn({ err: e.message }, "[security] loadBlockedIPs failed"));

export async function blockIP(ip: string) {
  blockedIPsCache.add(ip);
  try {
    await db.insert(rateLimitsTable).values({
      key: `blocked_ip:${ip}`,
      attempts: 0,
      windowStart: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  } catch (e) {
    logger.error({ ip, err: (e as Error).message }, "[security] blockIP DB insert failed");
  }
}

export async function unblockIP(ip: string) {
  blockedIPsCache.delete(ip);
  try {
    await db.delete(rateLimitsTable).where(eq(rateLimitsTable.key, `blocked_ip:${ip}`));
  } catch (err) {
    logger.warn({ ip, err: err instanceof Error ? err.message : String(err) }, "[security] unblockIP DB delete failed");
  }
}

export async function isIPBlocked(ip: string): Promise<boolean> {
  if (blockedIPsCache.has(ip)) return true;
  try {
    const [row] = await db.select({ key: rateLimitsTable.key }).from(rateLimitsTable)
      .where(eq(rateLimitsTable.key, `blocked_ip:${ip}`)).limit(1);
    if (row) {
      blockedIPsCache.add(ip);
      return true;
    }
  } catch (err) {
    logger.warn({ ip, err: err instanceof Error ? err.message : String(err) }, "[security] isIPBlocked DB query failed");
  }
  return false;
}

export async function getBlockedIPList(): Promise<string[]> {
  try {
    const rows = await db.select({ key: rateLimitsTable.key })
      .from(rateLimitsTable)
      .where(like(rateLimitsTable.key, "blocked_ip:%"));
    const ips = rows.map(r => r.key.replace("blocked_ip:", ""));
    for (const ip of ips) blockedIPsCache.add(ip);
    return ips;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[security] getBlockedIPList DB query failed, returning cache");
    return Array.from(blockedIPsCache);
  }
}

export async function getActiveLockouts(): Promise<Array<{ key: string; attempts: number; lockedUntil: string | null; minutesLeft: number | null }>> {
  try {
    const now = new Date();
    const rows = await db.select().from(rateLimitsTable)
      .where(and(
        gt(rateLimitsTable.attempts, 0),
      ));
    return rows
      .filter(r => !r.key.startsWith("blocked_ip:") && !r.key.startsWith("check-avail:") && !r.key.startsWith("ip_rate:"))
      .map(r => {
        const lockedUntilMs = r.lockedUntil?.getTime() ?? null;
        const minutesLeft = lockedUntilMs && lockedUntilMs > now.getTime()
          ? Math.ceil((lockedUntilMs - now.getTime()) / 60000)
          : null;
        return {
          key: r.key,
          attempts: r.attempts,
          lockedUntil: r.lockedUntil ? r.lockedUntil.toISOString() : null,
          minutesLeft,
        };
      });
  } catch {
    return [];
  }
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  adminId?: string;
  adminName?: string;
  ip: string;
  details: string;
  result: "success" | "fail" | "warn" | "pending";
  affectedUserId?: string;
  affectedUserName?: string;
  affectedUserRole?: string;
}
export const auditLog: AuditEntry[] = [];

export interface SecurityEvent {
  timestamp: string;
  type: string;
  ip: string;
  userId?: string;
  details: string;
  severity: "low" | "medium" | "high" | "critical";
}
export const securityEvents: SecurityEvent[] = [];

/* ══════════════════════════════════════════════════════════════
   IP HELPERS
   ══════════════════════════════════════════════════════════════ */
export function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/* ══════════════════════════════════════════════════════════════
   AUDIT LOG (in-memory ring buffer + async DB persistence)
   ══════════════════════════════════════════════════════════════ */
export function addAuditEntry(entry: Omit<AuditEntry, "timestamp">) {
  if (settingsCache["security_audit_log"] === "off") return;
  const timestamp = new Date().toISOString();
  auditLog.unshift({ ...entry, timestamp });
  if (auditLog.length > 2000) auditLog.splice(2000);

  // Persist to DB asynchronously — never blocks the request
  db.insert(adminActionAuditLogTable).values({
    id:               generateId(),
    adminId:          entry.adminId ?? null,
    adminName:        entry.adminName ?? null,
    ip:               entry.ip,
    action:           entry.action,
    result:           entry.result,
    details:          entry.details ?? null,
    affectedUserId:   entry.affectedUserId ?? null,
    affectedUserName: entry.affectedUserName ?? null,
    affectedUserRole: entry.affectedUserRole ?? null,
  }).catch((err: unknown) => {
    logger.warn({ err, action: entry.action }, "[audit] DB persist failed (in-memory copy retained)");
  });
}

export function addSecurityEvent(event: Omit<SecurityEvent, "timestamp">) {
  securityEvents.unshift({ ...event, timestamp: new Date().toISOString() });
  if (securityEvents.length > 2000) securityEvents.splice(2000);
}

/* ══════════════════════════════════════════════════════════════
   PERSISTENT AUTH AUDIT LOG
   Writes to the auth_audit_log DB table for cross-session durability.
   ══════════════════════════════════════════════════════════════ */
export async function writeAuthAuditLog(
  event: string,
  opts: {
    userId?: string;
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    await db.insert(authAuditLogTable).values({
      id:        generateId(),
      userId:    opts.userId ?? null,
      event,
      ip:        opts.ip ?? "unknown",
      userAgent: opts.userAgent ?? null,
      metadata:  opts.metadata ? JSON.stringify(opts.metadata) : null,
    });
  } catch {
    /* Non-fatal — never let audit log writes crash the main flow */
  }
}

/* ══════════════════════════════════════════════════════════════
   JWT HELPERS — HS256 pinned, iat validation, algorithm confusion prevention
   ══════════════════════════════════════════════════════════════ */
export interface JwtUserPayload {
  userId: string;
  phone: string;
  role: string;
  roles: string;
  tokenVersion?: number;
  jti?: string;
  exp?: number;
  iat?: number;
}

export function signUserJwt(
  userId: string,
  phone: string,
  role: string,
  roles: string,
  sessionDays: number,
): string {
  return jwt.sign(
    { sub: userId, phone, role, roles },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: `${sessionDays}d` },
  );
}

/** Sign a short-lived access token, embedding tokenVersion + jti for revocation checks.
 *  TTL is read from cached platform settings (jwt_access_ttl_sec), falling back to ACCESS_TOKEN_TTL_SEC.
 *  jti (JWT ID) is a random UUID used for Redis-backed blacklisting on logout. */
export function signAccessToken(userId: string, phone: string, role: string, roles: string, tokenVersion = 0): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    { sub: userId, phone, role, roles, tokenVersion, type: "access", jti },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: getAccessTokenTtlSec() },
  );
}

/**
 * Blacklist a JWT by its jti in Redis.
 * TTL is set to the remaining lifetime of the token so Redis auto-expires the entry.
 */
export async function blacklistJti(jti: string, expiresAt: number): Promise<void> {
  try {
    const { redisClient } = await import("../lib/redis.js");
    if (!redisClient) return;
    const ttlSec = Math.max(1, Math.ceil((expiresAt * 1000 - Date.now()) / 1000));
    await redisClient.set(`jwt:bl:${jti}`, "1", "EX", ttlSec);
  } catch (err) {
    logger.warn({ jti, err: err instanceof Error ? err.message : String(err) }, "[auth] blacklistJti Redis error");
  }
}

/**
 * Check if a JWT jti is blacklisted.
 * Returns false (allow) when Redis is unavailable so a Redis outage never blocks auth.
 */
export async function isJtiBlacklisted(jti: string): Promise<boolean> {
  try {
    const { redisClient } = await import("../lib/redis.js");
    if (!redisClient) return false;
    const result = await redisClient.exists(`jwt:bl:${jti}`);
    return result === 1;
  } catch {
    return false;
  }
}

/**
 * Write a per-user revocation fence to Redis.
 * Any access token whose `iat` (issue time) predates this fence is rejected
 * by all auth middlewares via `isTokenIssuedBeforeRevocation`.
 * TTL mirrors the access-token lifetime (default 900 s) so the key
 * auto-expires as soon as old tokens would have expired anyway.
 *
 * Used by:
 *  - revokeAllUserRefreshTokens  (force-logout of all sessions)
 *  - admin revoke-family endpoint (surgical per-family revoke)
 *
 * Degrades gracefully: if Redis is unavailable the write is a no-op
 * and the tokenVersion bump (for force-logout) still blocks new requests.
 */
export async function setUserRevocationTimestamp(userId: string): Promise<void> {
  try {
    const { redisClient } = await import("../lib/redis.js");
    if (!redisClient) return;
    const ttlSec = safeInt(settingsCache["access_token_ttl_sec"], 900, 60);
    await redisClient.set(`revoke:user:${userId}`, String(Date.now()), "EX", ttlSec);
  } catch (err) {
    logger.warn(
      { userId, err: err instanceof Error ? err.message : String(err) },
      "[auth] setUserRevocationTimestamp Redis error",
    );
  }
}

/**
 * Returns true when the given access token was issued BEFORE the
 * per-user revocation fence stored in Redis, meaning it should be rejected.
 * Returns false (allow) when Redis is unavailable — a Redis outage never
 * blocks legitimate auth; only the tokenVersion DB check provides a
 * Redis-free guarantee for force-logout.
 */
export async function isTokenIssuedBeforeRevocation(userId: string, iatSec: number): Promise<boolean> {
  try {
    const { redisClient } = await import("../lib/redis.js");
    if (!redisClient) return false;
    const val = await redisClient.get(`revoke:user:${userId}`);
    if (!val) return false;
    return iatSec * 1000 < parseInt(val, 10);
  } catch {
    return false;
  }
}

export function sign2faChallengeToken(userId: string, phone: string, role: string, roles: string, authMethod?: string): string {
  return jwt.sign(
    { sub: userId, phone, role, roles, type: "2fa_challenge", authMethod: authMethod ?? undefined },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: safeInt(settingsCache["jwt_2fa_challenge_sec"], 300, 30) },
  );
}

export interface TwoFaChallengePayload {
  userId: string;
  phone: string;
  role: string;
  roles: string;
  authMethod?: string;
}

export function verify2faChallengeToken(token: string): TwoFaChallengePayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if ((payload as Record<string, unknown>)["type"] !== "2fa_challenge") return null;
    if (!payload.sub) return null;
    return {
      userId: payload["sub"] as string,
      phone: payload["phone"] as string ?? "",
      role: payload["role"] as string ?? "customer",
      roles: payload["roles"] as string ?? "customer",
      authMethod: (payload["authMethod"] as string) || undefined,
    };
  } catch {
    return null;
  }
}

/** Sign a refresh token (opaque random value). Returns the raw token and its hash. */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(40).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashRefreshToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function verifyUserJwt(token: string): JwtUserPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if (!payload.sub) return null;

    if ((payload as Record<string, unknown>)["type"] === "2fa_challenge") return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.iat === "number" && payload.iat > nowSec + 60) {
      return null;
    }

    return {
      userId:       payload["sub"] as string,
      phone:        payload["phone"] as string ?? "",
      role:         payload["role"]  as string ?? "customer",
      roles:        payload["roles"] as string ?? "customer",
      tokenVersion: typeof payload["tokenVersion"] === "number" ? payload["tokenVersion"] : undefined,
      jti:          typeof payload["jti"] === "string" ? payload["jti"] : undefined,
      exp:          typeof payload.exp === "number" ? payload.exp : undefined,
      iat:          typeof payload.iat === "number" ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}

/* ── Legacy decode: kept for internal callers ── */
export function decodeUserToken(token: string): { userId: string; phone: string; issuedAt: number } | null {
  const v = verifyUserJwt(token);
  if (!v) return null;
  const raw = jwt.decode(token) as { iat?: number } | null;
  return { userId: v.userId, phone: v.phone, issuedAt: (raw?.iat ?? 0) * 1000 };
}

/**
 * TTL-based session expiry check for legacy session-day tokens.
 * For access JWTs, revocation is handled via `tokenVersion` in `riderAuth`:
 * whenever a user changes password or logs out, `tokenVersion` is incremented
 * in the DB, and any JWT carrying a stale version is immediately rejected.
 * This function covers the additional wall-clock TTL guard for older-style
 * session tokens that may not carry a `tokenVersion` claim.
 */
export function isTokenExpired(issuedAt: number, sessionDays: number): boolean {
  const issuedAtMs = issuedAt < 1e12 ? issuedAt * 1000 : issuedAt;
  const expiryMs = issuedAtMs + sessionDays * 24 * 60 * 60 * 1000;
  return Date.now() > expiryMs;
}

/* ══════════════════════════════════════════════════════════════
   ADMIN JWT HELPERS — time-limited signed tokens (4-hour TTL)
   ══════════════════════════════════════════════════════════════ */
export interface AdminJwtPayload {
  adminId: string | null;
  role: string;
  name: string;
  iat?: number;
  exp?: number;
}

export function signAdminJwt(adminId: string | null, role: string, name: string, ttlHrs = ADMIN_TOKEN_TTL_HRS): string {
  return jwt.sign(
    { adminId, role, name, type: "admin" },
    ADMIN_JWT_SECRET,
    { algorithm: "HS256", expiresIn: `${ttlHrs}h` },
  );
}

export function verifyAdminJwt(token: string): AdminJwtPayload | null {
  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
    if ((payload as Record<string, unknown>)["type"] !== "admin") return null;
    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.iat === "number" && payload.iat > nowSec + 60) {
      return null;
    }
    return {
      adminId: payload["adminId"] as string | null,
      role:    payload["role"]    as string,
      name:    payload["name"]    as string,
      iat:     payload.iat,
      exp:     payload.exp,
    };
  } catch {
    return null;
  }
}
