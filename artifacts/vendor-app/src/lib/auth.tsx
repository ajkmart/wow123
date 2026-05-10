import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { vendorIsDev } from "./envValidation";

export interface StoreHours { [day: string]: { open: string; close: string; closed?: boolean } }

export interface AuthUser {
  id: string; phone: string; name?: string; email?: string; avatar?: string;
  walletBalance: string;
  roles: string[];
  storeName?: string; storeCategory?: string;
  storeBanner?: string; storeDescription?: string;
  storeHours?: StoreHours | null;
  storeAnnouncement?: string;
  storeMinOrder?: number;
  storeDeliveryTime?: string;
  storeIsOpen: boolean;
  storeLat?: string | null; storeLng?: string | null;
  lastLoginAt?: string; createdAt?: string;
  stats: { todayOrders: number; todayRevenue: number; totalOrders: number; totalRevenue: number };
  cnic?: string; city?: string; address?: string; businessType?: string;
  bankName?: string; bankAccount?: string; bankAccountTitle?: string;
  isVerified?: boolean; status?: string;
}

interface AuthCtx {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: AuthUser, refreshToken?: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

function decodeJwtExp(tok: string): number | null {
  try {
    const parts = tok.split(".");
    if (parts.length !== 3) return null;
    const b64 = (parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser]   = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const logoutCallbackRef = useRef<(() => void) | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleProactiveRefresh = useCallback((tok: string) => {
    clearRefreshTimer();
    const exp = decodeJwtExp(tok);
    if (!exp) return;
    const refreshIn = Math.max((exp * 1000 - Date.now()) - 60_000, 10_000);
    refreshTimerRef.current = setTimeout(async () => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const result = await api.refreshToken();
        if (result === "refreshed") {
          const newToken = api.getToken();
          if (newToken) {
            setToken(newToken);
            scheduleProactiveRefresh(newToken);
          }
        } else if (result === "auth_failed") {
          api.clearTokens();
          setToken(null);
          setUser(null);
        }
      } catch {
        const currentToken = api.getToken();
        if (currentToken) scheduleProactiveRefresh(currentToken);
      } finally {
        refreshingRef.current = false;
      }
    }, refreshIn);
  }, [clearRefreshTimer]);

  useEffect((): (() => void) | void => {
    const controller = new AbortController();

    const initAuth = async () => {
      /* Try in-memory token first (set by module-init migration or after login).
         If absent — e.g. page reload after migration — attempt a silent refresh
         using the HttpOnly vendor cookie set by the server, so sessions survive
         across page reloads once the cookie is issued. */
      let activeToken = api.getToken();

      if (!activeToken) {
        const result = await api.refreshToken();
        if (result !== "refreshed") {
          setLoading(false);
          return;
        }
        activeToken = api.getToken();
        if (!activeToken) {
          setLoading(false);
          return;
        }
      }

      setToken(activeToken);
      try {
        const u: AuthUser = await api.getMe(controller.signal);
        const rawRoles = u.roles;
        const roles: string[] = Array.isArray(rawRoles)
          ? rawRoles
          : typeof (u as unknown as { role?: string }).role === "string"
            ? [(u as unknown as { role: string }).role]
            : [];
        u.roles = roles;
        if (roles.length > 0 && !roles.includes("vendor")) {
          api.clearTokens();
          setToken(null);
          return;
        }
        setUser(u);
        scheduleProactiveRefresh(activeToken);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        api.clearTokens();
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
    return () => { controller.abort(); clearRefreshTimer(); };
  }, [scheduleProactiveRefresh, clearRefreshTimer]);

  useEffect(() => {
    const clearAuth = () => { setToken(null); setUser(null); };
    logoutCallbackRef.current = clearAuth;

    const unregister = api.registerLogoutCallback(clearAuth);

    const handleLogout = () => clearAuth();
    window.addEventListener("ajkmart:logout", handleLogout);
    return () => {
      unregister();
      window.removeEventListener("ajkmart:logout", handleLogout);
    };
  }, []);

  const login = (t: string, u: AuthUser, refreshToken?: string) => {
    const rawRoles = u.roles;
    const roles: string[] = Array.isArray(rawRoles)
      ? rawRoles
      : typeof (u as unknown as { role?: string }).role === "string"
        ? [(u as unknown as { role: string }).role]
        : [];
    u.roles = roles;
    if (roles.length > 0 && !roles.includes("vendor")) {
      throw new Error("This app is for vendors only");
    }
    queryClient.clear();
    api.storeTokens(t, refreshToken);
    setToken(t);
    setUser(u);
    scheduleProactiveRefresh(t);
  };

  const logout = () => {
    clearRefreshTimer();
    const refreshTok = api.getRefreshToken();
    /* Always call server logout so the HttpOnly vendor cookie is revoked even
       when no in-memory refresh token is present (e.g. after a page reload). */
    api.logout(refreshTok || undefined).catch(() => {});
    setToken(null);
    setUser(null);
    queryClient.clear();
  };

  const refreshUser = async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch (e) {
      if (vendorIsDev) console.error("refreshUser failed:", e);
    }
  };

  return <Ctx.Provider value={{ user, token, loading, login, logout, refreshUser }}>{children}</Ctx.Provider>;
}
