/**
 * requireRole — standardized role-guard middleware for user-facing APIs.
 *
 * Usage:
 *   router.get("/my-route", requireRole("rider"), handler)
 *   router.get("/my-route", requireRole(["vendor", "customer"]), handler)
 *
 * This uses the same JWT secret and verifyUserJwt() as the rest of the auth
 * system — it is purely additive and does NOT replace adminAuth.
 *
 * Security guarantees:
 *  - Token must be a valid, non-expired HS256 JWT signed with JWT_SECRET.
 *  - Token's `role` field must match one of the allowed roles.
 *  - Token's `tokenVersion` must match the DB value (checked lazily — the
 *    existing auth flow already bumps tokenVersion on logout/ban, so the
 *    token will fail verifyUserJwt if the version field is stale once the
 *    token is regenerated). For strict real-time revocation use the
 *    /auth/sessions DELETE endpoint which also revokes refresh tokens.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyUserJwt } from "../middleware/security.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userPhone?: string;
  userRole?: string;
  userRoles?: string;
  tokenVersion?: number;
}

/**
 * Build a middleware that accepts one or more allowed roles.
 * Pass a single string or an array of strings.
 */
export function requireRole(allowed: string | string[]) {
  const roles = Array.isArray(allowed) ? allowed : [allowed];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const header = req.headers["authorization"] as string | undefined;
    const raw = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!raw) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const payload = verifyUserJwt(raw);

    if (!payload) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    /* Check role — payload.roles is a comma-separated string e.g. "rider,customer" */
    const payloadRoles = (payload.roles ?? payload.role ?? "").split(",").map((r: string) => r.trim());
    const hasRole = roles.some(r => payloadRoles.includes(r));

    if (!hasRole) {
      res.status(403).json({
        error: "Access denied",
        detail: `Requires role: ${roles.join(" or ")}. Your role: ${payload.role}`,
      });
      return;
    }

    /* Attach to request for downstream handlers */
    req.userId      = payload.userId;
    req.userPhone   = payload.phone;
    req.userRole    = payload.role;
    req.userRoles   = payload.roles ?? payload.role;
    req.tokenVersion = payload.tokenVersion;

    next();
  };
}

/* Convenience shorthands */
export const requireCustomer = requireRole("customer");
export const requireRider    = requireRole("rider");
export const requireVendor   = requireRole("vendor");
export const requireAnyUser  = requireRole(["customer", "rider", "vendor"]);
