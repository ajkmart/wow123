import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { refreshTokensTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { addSecurityEvent, getClientIp, verifyUserJwt, writeAuthAuditLog } from "./security.js";

/**
 * verifyTokenFamily — Express middleware that checks whether the authenticated
 * user's token family has been revoked due to a detected breach.
 *
 * It decodes the bearer JWT (no full re-verify needed — verifyUserJwt() already
 * validated the signature upstream), extracts `jti` / `tokenFamilyId`, and checks
 * whether ANY member of that family has `revokedReason = 'FAMILY_BREACH_DETECTED'`.
 *
 * If a breach is found → HTTP 401 with a clear re-login message.
 * If the check fails (DB error, missing claims) → passes through to not
 * block legitimate users when the feature is degraded.
 */
export async function verifyTokenFamily(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers["authorization"] as string | undefined;
    const tokenHeader = req.headers["x-auth-token"] as string | undefined;
    const raw = tokenHeader || authHeader?.replace(/^Bearer\s+/i, "");

    if (!raw) {
      next();
      return;
    }

    const payload = verifyUserJwt(raw);
    if (!payload || !payload.userId) {
      next();
      return;
    }

    const tokenFamilyId = (payload as unknown as Record<string, unknown>)["tokenFamilyId"] as string | undefined;

    if (!tokenFamilyId) {
      next();
      return;
    }

    const [breachedMember] = await db
      .select({ id: refreshTokensTable.id, revokedReason: refreshTokensTable.revokedReason })
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.tokenFamilyId, tokenFamilyId))
      .limit(1);

    if (breachedMember?.revokedReason === "FAMILY_BREACH_DETECTED") {
      const ip = getClientIp(req);

      logger.warn(
        { userId: payload.userId, tokenFamilyId, ip },
        "[SECURITY] Revoked-family access attempt blocked.",
      );

      addSecurityEvent({
        type: "revoked_family_access_attempt",
        ip,
        userId: payload.userId,
        details: `Access attempt on revoked token family ${tokenFamilyId}`,
        severity: "critical",
      });

      writeAuthAuditLog("revoked_family_access_attempt", {
        userId: payload.userId,
        ip,
        metadata: { tokenFamilyId, url: req.url },
      }).catch(() => {});

      res.status(401).json({ error: "Account compromised. Please login again." });
      return;
    }

    next();
  } catch (err) {
    logger.warn({ err }, "[verifyTokenFamily] Check failed — passing through");
    next();
  }
}
