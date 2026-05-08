/**
 * Tiered rate-limit middleware.
 *
 * When REDIS_URL is valid and reachable, counters live in Redis (shared across
 * instances, survive restarts). When Redis is unavailable, express-rate-limit
 * automatically falls back to its built-in in-memory store — no request is
 * ever blocked by a Redis outage.
 *
 * Tiers:
 *   globalLimiter     300 req / 15 min  — all /api traffic
 *   loginLimiter        5 req / 60 s   / IP            — POST /api/auth/login
 *   otpLimiter          3 req / 60 s   / phone (or IP) — OTP send/verify
 *   userApiLimiter    100 req / 60 s   / authenticated user ID
 *   authLimiter        20 req / 15 min  — OTP / login / social-auth (legacy guard)
 *   adminAuthLimiter   10 req / 15 min  — admin login & password-reset
 *   paymentLimiter     30 req / 15 min  — wallet & payment routes
 */
import rateLimit, { type Options, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisClient } from "../lib/redis.js";
import type { Request } from "express";

function makeStore(prefix: string): Store | undefined {
  if (!redisClient) return undefined;
  try {
    return new RedisStore({
      prefix: `rl:${prefix}:`,
      sendCommand: (...args: string[]) => {
        return (redisClient!.call as (...a: string[]) => Promise<unknown>)(...args).catch((err: Error) => {
          if (!err.message.includes("closed")) {
            console.error(`[rate-limit:${prefix}] Redis error:`, err.message);
          }
          throw err;
        }) as ReturnType<import("rate-limit-redis").SendCommandFn>;
      },
    });
  } catch (err) {
    console.error(`[rate-limit] Could not create Redis store for "${prefix}":`, err);
    return undefined;
  }
}

function makeOptions(prefix: string, max: number, windowMs: number, extra?: Partial<Options>): Partial<Options> {
  const store = makeStore(prefix);
  console.log(`[rate-limit] "${prefix}" limiter → ${store ? "Redis" : "in-memory"} store`);
  return {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: "Too many requests",
        retryAfter: Math.ceil(windowMs / 1000),
        code: "RATE_LIMITED",
      });
    },
    ...extra,
  };
}

const WINDOW_15_MIN = 15 * 60 * 1000;
const WINDOW_1_MIN  = 60 * 1000;

/* ── Existing broad limiters ─────────────────────────────────────────── */
export const globalLimiter    = rateLimit(makeOptions("global",     300, WINDOW_15_MIN));
export const authLimiter      = rateLimit(makeOptions("auth",        20, WINDOW_15_MIN));
export const adminAuthLimiter = rateLimit(makeOptions("admin-auth",  10, WINDOW_15_MIN));
export const paymentLimiter   = rateLimit(makeOptions("payment",     30, WINDOW_15_MIN));

/* ── New tight limiters (1-minute windows) ───────────────────────────── */

/**
 * loginLimiter — 5 login attempts / 60 s / IP.
 * Apply to POST /api/auth/login and similar credential-checking endpoints.
 */
export const loginLimiter = rateLimit(makeOptions("login", 5, WINDOW_1_MIN, {
  keyGenerator: (req: Request) =>
    ((req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
     req.socket?.remoteAddress ||
     "unknown"),
}));

/**
 * otpLimiter — 3 OTP send/verify attempts / 60 s / phone number (fallback to IP).
 * Apply to POST /api/auth/send-otp and POST /api/auth/verify-otp.
 */
export const otpLimiter = rateLimit(makeOptions("otp", 3, WINDOW_1_MIN, {
  keyGenerator: (req: Request) => {
    const phone = req.body?.phone ?? req.body?.identifier;
    if (phone && typeof phone === "string" && phone.length > 0) {
      return `phone:${phone.replace(/\s/g, "")}`;
    }
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown"
    );
  },
}));

/**
 * userApiLimiter — 100 requests / 60 s / authenticated user ID (fallback to IP).
 * Apply to authenticated /api/* routes that should be throttled per-user.
 */
export const userApiLimiter = rateLimit(makeOptions("user-api", 100, WINDOW_1_MIN, {
  keyGenerator: (req: Request) => {
    const userId =
      (req as any).userId ??
      (req as any).customerId ??
      (req as any).riderId ??
      (req as any).vendorId ??
      (req as any).user?.id;
    if (userId) return `user:${userId}`;
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown"
    );
  },
  skip: (req: Request) => {
    return req.method === "OPTIONS";
  },
}));
