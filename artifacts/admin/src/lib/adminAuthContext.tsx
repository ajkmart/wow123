import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  /** Login handle. Returned by every auth response so the popup can prefill it. */
  username?: string;
  role: string;
  /**
   * Legacy "must change password" flag. The forced rotation gate has been
   * removed; the field is still surfaced so legacy callers keep compiling.
   */
  mustChangePassword?: boolean;
  /**
   * True while the admin is still using the seeded default credentials.
   * Drives the OPTIONAL post-login popup that lets the super-admin update
   * their username and/or password. Skipping the popup keeps the defaults
   * working — nothing is gated on this flag.
   */
  usingDefaultCredentials?: boolean;
}

interface AuthState {
  accessToken: string | null;
  user: AdminUser | null;
  isLoading: boolean;
  error: string | null;
  /**
   * Legacy field. Always false now that the forced password-change flow
   * has been removed; kept on the type so existing readers do not break.
   */
  mustChangePassword: boolean;
  /**
   * Mirrors `user.usingDefaultCredentials` from the most recent auth
   * response. The SPA renders the optional credentials popup when this
   * is true and the admin has not yet dismissed it for the session.
   */
  usingDefaultCredentials: boolean;
  /**
   * Set when the user clicks "Skip for now" so the popup does not
   * re-open during the same browser session. Cleared on logout / next
   * login (state is component-local, not persisted).
   */
  defaultCredentialsDismissed: boolean;
}

interface AuthContextType {
  state: AuthState;
  login: (username: string, password: string, totp?: string, tempToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string>;
  /**
   * Submits a password change against POST /api/admin/auth/change-password.
   * Returns the fresh access token; the credential popup uses it directly
   * so any subsequent username PATCH carries the rotated session.
   */
  changePassword: (currentPassword: string, newPassword: string) => Promise<string>;
  /**
   * Marks the credentials popup as dismissed for the rest of the session.
   * "Skip for now" — the default credentials keep working and the dialog
   * stops re-opening until the next login.
   */
  dismissDefaultCredentialsPrompt: () => void;
  /**
   * Patches the current admin's profile (used by the credentials popup
   * to apply a new username and/or display name without going through
   * the password endpoint). Mirrors the response into auth state.
   */
  updateOwnProfile: (input: { username?: string; name?: string }) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INITIAL_STATE: AuthState = {
  accessToken: null,
  user: null,
  isLoading: true,
  error: null,
  mustChangePassword: false,
  usingDefaultCredentials: false,
  defaultCredentialsDismissed: false,
};

/**
 * Decode the `exp` claim from a JWT access token without verifying its
 * signature (the server handles verification). Returns `null` when the
 * token is malformed or the claim is absent.
 */
function getJwtExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** How many milliseconds before expiry to warn the admin. */
const SESSION_WARN_BEFORE_MS = 60_000; // 1 minute

/**
 * Admin Auth Provider
 * Manages authentication state with in-memory access tokens
 * Refresh tokens are stored in HttpOnly cookies (handled by browser automatically)
 */
export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);

  // Use a ref to prevent concurrent refresh requests
  // This persists across renders so concurrent calls share one in-flight promise
  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  // Timer that fires the session-expiry warning toast
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks which token the current timer was set for (avoids duplicate timers)
  const timerTokenRef = useRef<string | null>(null);

  /** Schedule a warning toast 60s before the access token expires. */
  const scheduleExpiryWarning = useCallback((token: string, refreshFn: () => Promise<string>) => {
    if (timerTokenRef.current === token) return; // already scheduled for this token
    if (expiryTimerRef.current) { clearTimeout(expiryTimerRef.current); expiryTimerRef.current = null; }
    timerTokenRef.current = token;

    const expiresAt = getJwtExpiry(token);
    if (!expiresAt) return;

    const msLeft = expiresAt - Date.now() - SESSION_WARN_BEFORE_MS;
    if (msLeft <= 0) return; // already expiring — let the 401 handler deal with it

    expiryTimerRef.current = setTimeout(() => {
      expiryTimerRef.current = null;
      toast({
        title: 'Your session expires in 1 minute',
        description: 'Click "Stay logged in" to continue without interruption.',
        duration: 55_000,
        action: (
          <ToastAction altText="Stay logged in" onClick={() => { refreshFn().catch(() => {}); }}>
            Stay logged in
          </ToastAction>
        ),
      });
    }, msLeft);
  }, []);

  /** Cancel the expiry warning timer (called on logout or successful refresh). */
  const cancelExpiryWarning = useCallback(() => {
    if (expiryTimerRef.current) { clearTimeout(expiryTimerRef.current); expiryTimerRef.current = null; }
    timerTokenRef.current = null;
  }, []);

  /**
   * Refresh access token using refresh token cookie
   * Browser automatically sends refresh_token cookie with request
   */
  const refreshAccessToken = useCallback(async (): Promise<string> => {
    // If a refresh is already in progress, return the pending promise
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        const response = await fetch('/api/admin/auth/refresh', {
          method: 'POST',
          credentials: 'include', // Include cookies (refresh_token, csrf_token)
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            // Refresh token expired or invalid - clear auth
            cancelExpiryWarning();
            setState({ ...INITIAL_STATE, isLoading: false, error: 'Session expired. Please log in again.' });
            throw new Error('Session expired');
          }
          throw new Error('Failed to refresh token');
        }

        const data = await response.json();
        setState((prev) => ({
          ...prev,
          accessToken: data.accessToken,
          user: data.user
            ? {
                ...(prev.user ?? { id: '', name: '', email: '', role: '' }),
                ...data.user,
              }
            : prev.user,
          mustChangePassword: !!data.mustChangePassword,
          usingDefaultCredentials: !!data.usingDefaultCredentials,
          // Preserve session-scoped dismissal so refresh does not re-open the popup.
          error: null,
        }));

        return data.accessToken;
      } catch (err) {
        console.error('Token refresh failed:', err);
        throw err;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [cancelExpiryWarning]);

  // Schedule the expiry warning whenever the token changes
  useEffect(() => {
    if (state.accessToken) {
      scheduleExpiryWarning(state.accessToken, refreshAccessToken);
    } else {
      cancelExpiryWarning();
    }
  }, [state.accessToken, scheduleExpiryWarning, cancelExpiryWarning, refreshAccessToken]);

  /**
   * On mount, attempt to restore session by refreshing access token
   * This allows users to stay logged in across page reloads.
   *
   * Optimization: skip the refresh call entirely when the host-readable
   * `csrf_token` cookie is absent. The only paths that issue a refresh
   * cookie (login, MFA, refresh) also set `csrf_token`, and logout clears
   * both — so an absent CSRF cookie reliably means "no session". Skipping
   * the call avoids a noisy 401 in browser DevTools on first-time visits.
   */
  useEffect(() => {
    const restoreSession = async () => {
      if (!readCsrfFromCookie()) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: null,
        }));
        return;
      }

      try {
        await refreshAccessToken();
        setState((prev) => ({
          ...prev,
          isLoading: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: null, // Don't show error on initial load if no session
        }));
      }
    };

    restoreSession();
  }, [refreshAccessToken]);

  /**
   * Login with credentials
   * Supports both password-only and MFA flow
   */
  const login = useCallback(
    async (username: string, password: string, totp?: string, tempToken?: string) => {
      setState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
      }));

      try {
        // If TOTP is provided, use the 2FA endpoint
        if (totp && tempToken) {
          const response = await fetch('/api/admin/auth/2fa', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tempToken,
              totp,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'MFA verification failed');
          }

          const data = await response.json();
          setState({
            accessToken: data.accessToken,
            user: data.user,
            isLoading: false,
            error: null,
            mustChangePassword: !!data.mustChangePassword,
            usingDefaultCredentials: !!data.usingDefaultCredentials,
            // Each fresh login resets the dismissal so the popup gets a chance again.
            defaultCredentialsDismissed: false,
          });
          return;
        }

        // Initial login with username/password
        const response = await fetch('/api/admin/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username,
            password,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Login failed');
        }

        const data = await response.json();

        // If MFA is required, throw a special error that includes the tempToken
        if (data.requiresMfa) {
          const mfaError: any = new Error(data.message || 'MFA required');
          mfaError.requiresMfa = true;
          mfaError.tempToken = data.tempToken;
          throw mfaError;
        }

        // Login successful
        setState({
          accessToken: data.accessToken,
          user: data.user,
          isLoading: false,
          error: null,
          mustChangePassword: !!data.mustChangePassword,
          usingDefaultCredentials: !!data.usingDefaultCredentials,
          defaultCredentialsDismissed: false,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Login failed';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw err;
      }
    },
    []
  );

  /**
   * Logout and revoke session
   */
  const logout = useCallback(async () => {
    cancelExpiryWarning();
    setState((prev) => ({
      ...prev,
      isLoading: true,
    }));

    try {
      if (state.accessToken) {
        // Try to notify backend of logout
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${state.accessToken}`,
            'X-CSRF-Token': readCsrfFromCookie(),
            'Content-Type': 'application/json',
          },
        }).catch(() => {
          // Logout failure is acceptable - cookies will be cleared anyway
        });
      }

      setState({ ...INITIAL_STATE, isLoading: false });
    } catch (err) {
      console.error('Logout error:', err);
      // Clear state anyway
      setState({ ...INITIAL_STATE, isLoading: false });
    }
  }, [state.accessToken, cancelExpiryWarning]);

  /**
   * Submit a password change against POST /api/admin/auth/change-password.
   * Returns the rotated access token so the credentials popup can chain
   * a username PATCH against the fresh session.
   */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<string> => {
      if (!state.accessToken) throw new Error('Not authenticated');
      const response = await fetch('/api/admin/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.accessToken}`,
          'X-CSRF-Token': readCsrfFromCookie(),
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to change password');
      }

      const data = await response.json();
      const nextToken = data.accessToken ?? state.accessToken;
      setState((prev) => ({
        ...prev,
        accessToken: nextToken,
        user: data.user
          ? { ...(prev.user ?? { id: '', name: '', email: '', role: '' }), ...data.user }
          : prev.user,
        mustChangePassword: false,
        usingDefaultCredentials: false,
        error: null,
      }));
      return nextToken;
    },
    [state.accessToken],
  );

  const dismissDefaultCredentialsPrompt = useCallback(() => {
    setState((prev) => ({ ...prev, defaultCredentialsDismissed: true }));
  }, []);

  /**
   * PATCH /api/admin/system/admin-accounts/:id for the currently
   * authenticated admin. The backend clears `defaultCredentials` on
   * self-edit so the popup never reopens after the user picks a custom
   * username.
   */
  const updateOwnProfile = useCallback(
    async (input: { username?: string; name?: string }) => {
      const adminId = state.user?.id;
      if (!adminId) throw new Error('Not authenticated');
      if (!state.accessToken) throw new Error('Not authenticated');

      const response = await fetch(`/api/admin/system/admin-accounts/${adminId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.accessToken}`,
          'X-CSRF-Token': readCsrfFromCookie(),
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to update profile');
      }

      const data = await response.json();
      const updated = data?.account ?? data;
      setState((prev) => ({
        ...prev,
        user: prev.user
          ? {
              ...prev.user,
              ...(updated?.username !== undefined ? { username: updated.username } : {}),
              ...(updated?.name !== undefined ? { name: updated.name } : {}),
            }
          : prev.user,
        usingDefaultCredentials: false,
      }));
    },
    [state.user?.id, state.accessToken],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        state,
        login,
        logout,
        refreshAccessToken,
        changePassword,
        dismissDefaultCredentialsPrompt,
        updateOwnProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 */
export function useAdminAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
}

/**
 * Read CSRF token from cookie. Defensive against:
 * - document being undefined (SSR / build-time evaluation)
 * - malformed cookies (decodeURIComponent throws on bad %-escapes)
 * - cookies that contain '=' in their value
 */
export function readCsrfFromCookie(): string {
  if (typeof document === "undefined" || !document.cookie) return "";
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const trimmed = cookie.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      const rawValue = trimmed.slice(eqIdx + 1);
      if (key === 'csrf_token') {
        try {
          return decodeURIComponent(rawValue);
        } catch {
          return rawValue;
        }
      }
    }
  } catch {
    /* ignore - fall through to empty string */
  }
  return '';
}

/* ─────────────────────────────────────────────────────────────────
 * Selector hooks
 *
 * Components that only need a slice of auth state should use these
 * narrow selectors instead of `useAdminAuth()` so they don't re-render
 * on unrelated context changes (e.g. token rotation refreshing
 * `accessToken` should not re-render a component that only reads the
 * current admin's display name).
 *
 * This is the lightweight, incremental form of the broader
 * "Context-Based State Architecture" refactor in `bugs.md` —
 * selector hooks now exist for the highest-traffic slices and pages
 * can opt in without touching the provider.
 * ───────────────────────────────────────────────────────────────── */

/** Returns the current admin user (or `null` when logged out). */
export function useAdminUser(): AdminUser | null {
  return useAdminAuth().state.user;
}

/** Returns just the access token; `null` when not authenticated. */
export function useAdminAccessToken(): string | null {
  return useAdminAuth().state.accessToken;
}

/** Returns the auth-ready boolean (true once bootstrap is no longer loading). */
export function useAdminAuthReady(): boolean {
  return !useAdminAuth().state.isLoading;
}

/** Returns true when the user is authenticated and ready to make calls. */
export function useIsAdminAuthenticated(): boolean {
  const { state } = useAdminAuth();
  return !!state.accessToken && !!state.user;
}
