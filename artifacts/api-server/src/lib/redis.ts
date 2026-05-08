/**
 * Shared ioredis client for rate limiting.
 *
 * Handles common copy-paste artifacts in REDIS_URL:
 *  - URL-encoded prefixes  ("%20--tls%20-u%20...")
 *  - Literal shell flags   ("--tls -u redis://...")
 *  - Non-TLS scheme        ("redis://" → "rediss://") for Upstash
 *
 * Uses enableOfflineQueue:true so RedisStore's startup SCRIPT LOAD
 * commands queue safely during the initial TLS handshake.
 *
 * Exports:
 *   redisClient  — ioredis instance, or null when REDIS_URL is absent/invalid
 */
import Redis from "ioredis";

function sanitizeRedisUrl(raw: string): string | null {
  const value = raw.trim().replace(/^["']|["']$/g, "").trim();
  const decoded = (() => {
    try {
      return decodeURIComponent(value).trim();
    } catch {
      return value;
    }
  })();
  const normalized = decoded.startsWith("redis://")
    ? `rediss://${decoded.slice("redis://".length)}`
    : decoded;
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname) return null;
    return normalized;
  } catch {
    return null;
  }
}

let redisClient: Redis | null = null;

const rawUrl = process.env["REDIS_URL"];

if (rawUrl) {
  const url = sanitizeRedisUrl(rawUrl);
  if (url) {
    try {
      redisClient = new Redis(url, {
        enableOfflineQueue: true,
        maxRetriesPerRequest: null,
        connectTimeout: 8000,
        retryStrategy: (times) => {
          if (times >= 4) {
            console.error("[redis] Max reconnect attempts reached — rate limits will use in-memory store");
            return null; // stop retrying; RedisStore will throw and express-rate-limit falls back
          }
          return Math.min(times * 500, 3000);
        },
      });

      redisClient.on("connect", () => console.log("[redis] Connected to Redis"));
      redisClient.on("ready",   () => console.log("[redis] Ready"));
      redisClient.on("error",   (err: Error) => console.error("[redis] Error:", err.message));
      redisClient.on("close",   () => console.warn("[redis] Connection closed"));
    } catch (err) {
      console.error("[redis] Failed to initialise client:", (err as Error).message);
      redisClient = null;
    }
  }
}

export { redisClient };
