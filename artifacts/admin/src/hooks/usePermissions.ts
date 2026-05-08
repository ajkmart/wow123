/**
 * usePermissions / useHasPermission — frontend permission gating.
 *
 * Decodes the `perms` claim from the in-memory access JWT and exposes
 * helpers for hiding UI a user cannot use. Backend routes still enforce
 * the permission via requirePermission middleware — UI gating is UX only.
 */
import { useMemo } from "react";
import { useAdminAuth } from "../lib/adminAuthContext";

interface JwtPayload {
  sub?: string;
  role?: string;
  name?: string;
  perms?: string[];
  exp?: number;
}

function base64UrlDecode(str: string): string {
  const pad = str.length % 4;
  const padded = pad ? str + "=".repeat(4 - pad) : str;
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(b64);
  } catch {
    return "";
  }
}

function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]!)) as JwtPayload;
  } catch {
    return null;
  }
}

export interface PermissionContext {
  /** Effective permission ids granted to the current admin. */
  permissions: string[];
  /** Role string from the token (e.g. 'super', 'manager', 'finance'). */
  role: string | null;
  /** Super admins implicitly bypass all permission checks. */
  isSuper: boolean;
  /** True when the JWT included no perms claim (legacy token). */
  legacyToken: boolean;
  has: (perm: string) => boolean;
  hasAny: (perms: string[]) => boolean;
  hasAll: (perms: string[]) => boolean;
}

export function usePermissions(): PermissionContext {
  const { state } = useAdminAuth();
  return useMemo(() => {
    const payload = decodeJwt(state.accessToken);
    const role = payload?.role ?? state.user?.role ?? null;
    const isSuper = role === "super";
    const permissions: string[] = Array.isArray(payload?.perms) ? payload!.perms! : [];
    const legacyToken = !payload || payload.perms === undefined;

    const has = (perm: string) => isSuper || permissions.includes(perm);
    const hasAny = (perms: string[]) =>
      isSuper || perms.some(p => permissions.includes(p));
    const hasAll = (perms: string[]) =>
      isSuper || perms.every(p => permissions.includes(p));

    return { permissions, role, isSuper, legacyToken, has, hasAny, hasAll };
  }, [state.accessToken, state.user?.role]);
}

export function useHasPermission(permission: string): boolean {
  return usePermissions().has(permission);
}

/**
 * <PermissionGate perm="users.delete">…</PermissionGate>
 * Renders children only if the current admin has the named permission.
 */
export interface PermissionGateProps {
  perm?: string;
  anyOf?: string[];
  allOf?: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}
export function PermissionGate({
  perm, anyOf, allOf, fallback = null, children,
}: PermissionGateProps) {
  const { has, hasAny, hasAll } = usePermissions();
  let allowed = true;
  if (perm) allowed = allowed && has(perm);
  if (anyOf?.length) allowed = allowed && hasAny(anyOf);
  if (allOf?.length) allowed = allowed && hasAll(allOf);
  return allowed ? (children as React.ReactElement) : (fallback as React.ReactElement);
}
