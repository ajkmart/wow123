import React from 'react';
import { readCsrfFromCookie } from './adminAuthContext.js';
import { safeSessionSet } from './safeStorage';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

/**
 * Typed Error for non-2xx admin fetcher responses. Replaces the previous
 * `(error as any).status = …` pattern so callers can `instanceof`
 * narrow and read the HTTP status without `any`.
 */
export class AdminFetchError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AdminFetchError';
    this.status = status;
  }
}

/**
 * Typed error for requests that exceeded the timeout window.
 * Callers can `instanceof TimeoutError` to show specific UX.
 */
export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** Abort requests that take longer than this (milliseconds). */
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Returns an AbortSignal that fires after `ms` milliseconds.
 * Merges with an optional external signal so either side can abort.
 */
function timeoutSignal(ms: number, externalSignal?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(new TimeoutError()), ms);

  // Clear the timer if the controller's own signal fires first
  controller.signal.addEventListener('abort', () => clearTimeout(timerId), { once: true });

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener(
        'abort',
        () => { clearTimeout(timerId); controller.abort(externalSignal.reason); },
        { once: true },
      );
    }
  }

  return controller.signal;
}

/**
 * If the error is specifically a TimeoutError thrown by our internal timer,
 * show a toast so the user knows the request hung.
 * External aborts (e.g. component unmount via AbortController) are silently
 * swallowed — they are not user-facing errors.
 *
 * @param err   - The caught error (only fires when it is a TimeoutError)
 * @param retry - Optional callback wired to the toast "Retry" action so
 *                the user can re-send the request without a page reload.
 */
function handleTimeoutError(err: unknown, retry?: () => void): void {
  if (!(err instanceof TimeoutError)) return;
  toast({
    title: 'Request timed out',
    description: 'The server took too long to respond. Check your connection and try again.',
    variant: 'destructive',
    action: retry
      ? <ToastAction altText="Retry" onClick={retry}>Retry</ToastAction>
      : undefined,
  });
}

// Global handlers set by the app
let getAccessToken: (() => string | null) | null = null;
let refreshToken: (() => Promise<string>) | null = null;

/**
 * Set up global token handlers
 * Called from the App component to connect the fetcher to the auth context
 */
export function setupAdminFetcherHandlers(
  tokenGetter: () => string | null,
  tokenRefresher: () => Promise<string>
) {
  getAccessToken = tokenGetter;
  refreshToken = tokenRefresher;
}

/**
 * Admin API fetcher with auto-refresh, CSRF protection, and 30-second timeout.
 * - Automatically includes Authorization header with access token
 * - Automatically includes X-CSRF-Token header by reading from cookie
 * - Automatically refreshes token on 401 and retries
 * - Redirects to login on repeated 401
 * - Aborts and shows a toast after FETCH_TIMEOUT_MS
 */
export async function fetchAdmin(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  if (!getAccessToken || !refreshToken) {
    throw new Error('Admin fetcher not initialized. Call setupAdminFetcherHandlers first.');
  }

  let token = getAccessToken();

  // If no token, try to refresh
  if (!token) {
    try {
      token = await refreshToken();
    } catch (err) {
      // Refresh failed - need to redirect to login
      console.error('Token refresh failed (no token):', err);
      const loginUrl = `${import.meta.env.BASE_URL || '/'}login`;
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = loginUrl;
      throw err;
    }
  }

  const csrf = readCsrfFromCookie();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-CSRF-Token': csrf,
    ...(options.headers as Record<string, string> | undefined),
  };

  const makeRequest = async (accessToken: string) => {
    const signal = timeoutSignal(FETCH_TIMEOUT_MS, options.signal as AbortSignal | undefined);

    let response: Response;
    try {
      response = await fetch(`/api/admin${endpoint}`, {
        ...options,
        signal,
        headers: {
          ...headers,
          'Authorization': `Bearer ${accessToken}`,
        },
        credentials: 'include', // Include cookies (refresh_token, csrf_token)
      });
    } catch (err) {
      // Only show toast for our own timeout — not for external aborts
      // (e.g. component unmount). The AbortController abort reason is set to
      // a TimeoutError instance, so we can distinguish them cleanly.
      // We also rethrow as TimeoutError so callers can `instanceof` it reliably.
      const retryFn = () => { fetchAdmin(endpoint, options).catch(() => {}); };
      const reason = (signal as AbortSignal & { reason?: unknown }).reason;
      const timeoutErr = err instanceof TimeoutError ? err : reason instanceof TimeoutError ? reason : null;
      if (timeoutErr) {
        handleTimeoutError(timeoutErr, retryFn);
        throw timeoutErr;
      }
      throw err;
    }

    // Handle 401 Unauthorized
    if (response.status === 401) {
      // Try to refresh token once
      // Hoist retrySignal so the catch block can inspect .reason (the browser
      // surfaces an AbortError / DOMException, not a TimeoutError, when fetch
      // is aborted by the controller — only signal.reason reveals our intent).
      let retrySignal!: AbortSignal;
      try {
        const newToken = await refreshToken!();
        headers['Authorization'] = `Bearer ${newToken}`;

        retrySignal = timeoutSignal(FETCH_TIMEOUT_MS);
        // Retry the request with new token
        const retryResponse = await fetch(`/api/admin${endpoint}`, {
          ...options,
          signal: retrySignal,
          headers,
          credentials: 'include',
        });

        if (!retryResponse.ok) {
          throw new Error(`HTTP ${retryResponse.status}`);
        }

        return retryResponse;
      } catch (err) {
        // A timeout on the retry should surface a toast, not force logout.
        // Only genuine auth failures (401/403 from the server) should redirect.
        const retryReason = retrySignal
          ? (retrySignal as AbortSignal & { reason?: unknown }).reason
          : undefined;
        const timeoutErr =
          err instanceof TimeoutError ? err
          : retryReason instanceof TimeoutError ? retryReason
          : null;
        if (timeoutErr) {
          handleTimeoutError(timeoutErr, () => { fetchAdmin(endpoint, options).catch(() => {}); });
          throw timeoutErr;
        }
        console.error('Token refresh failed:', err);
        const loginUrl = `${import.meta.env.BASE_URL || '/'}login`;
        safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
        window.location.href = loginUrl;
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new AdminFetchError(errorData.error || `HTTP ${response.status}`, response.status);
    }

    return response;
  };

  const response = await makeRequest(token);
  return response.json();
}

/**
 * Same as fetchAdmin but takes an absolute API path (e.g. `/api/kyc/...`,
 * `/api/payments/...`) instead of being scoped to `/api/admin`.
 * Use this for admin-authenticated routes that live outside `/api/admin/*`.
 */
export async function fetchAdminAbsolute(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  if (!getAccessToken || !refreshToken) {
    throw new Error('Admin fetcher not initialized. Call setupAdminFetcherHandlers first.');
  }
  if (!path.startsWith('/')) {
    throw new Error(`fetchAdminAbsolute requires an absolute path starting with "/", got: ${path}`);
  }

  let token = getAccessToken();
  if (!token) {
    try {
      token = await refreshToken();
    } catch (err) {
      console.error('Token refresh failed (no token, absolute):', err);
      const loginUrl = `${import.meta.env.BASE_URL || '/'}login`;
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = loginUrl;
      throw err;
    }
  }

  const csrf = readCsrfFromCookie();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-CSRF-Token': csrf,
    ...(options.headers as Record<string, string> | undefined),
  };

  const retryAbsoluteFn = () => { fetchAdminAbsolute(path, options).catch(() => {}); };
  let response: Response;
  {
    const signal = timeoutSignal(FETCH_TIMEOUT_MS, options.signal as AbortSignal | undefined);
    try {
      response = await fetch(path, {
        ...options,
        signal,
        headers: { ...headers, 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
    } catch (err) {
      // Check if this was our internal timeout (signal.reason is a TimeoutError)
      const reason = (signal as AbortSignal & { reason?: unknown }).reason;
      const timeoutErr = err instanceof TimeoutError ? err : reason instanceof TimeoutError ? reason : null;
      if (timeoutErr) {
        handleTimeoutError(timeoutErr, retryAbsoluteFn);
        throw timeoutErr;
      }
      throw err;
    }
  }

  if (response.status === 401) {
    let absRetrySignal!: AbortSignal;
    try {
      const newToken = await refreshToken!();
      headers['Authorization'] = `Bearer ${newToken}`;
      absRetrySignal = timeoutSignal(FETCH_TIMEOUT_MS);
      response = await fetch(path, { ...options, signal: absRetrySignal, headers, credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      const retryReason = absRetrySignal
        ? (absRetrySignal as AbortSignal & { reason?: unknown }).reason
        : undefined;
      const timeoutErr =
        err instanceof TimeoutError ? err
        : retryReason instanceof TimeoutError ? retryReason
        : null;
      if (timeoutErr) {
        handleTimeoutError(timeoutErr, () => { fetchAdminAbsolute(path, options).catch(() => {}); });
        throw timeoutErr;
      }
      console.error('Token refresh failed (absolute):', err);
      const loginUrl = `${import.meta.env.BASE_URL || '/'}login`;
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = loginUrl;
      throw new Error('Session expired. Please log in again.');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new AdminFetchError(errorData.error || `HTTP ${response.status}`, response.status);
  }

  return response.json();
}

/**
 * Same as fetchAdminAbsolute but returns the raw Response (not parsed JSON).
 * Use for binary downloads (blobs, CSV exports) while still benefiting from
 * Bearer + CSRF + auto-refresh.
 */
export async function fetchAdminAbsoluteResponse(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  if (!getAccessToken || !refreshToken) {
    throw new Error('Admin fetcher not initialized. Call setupAdminFetcherHandlers first.');
  }
  if (!path.startsWith('/')) {
    throw new Error(`fetchAdminAbsoluteResponse requires an absolute path starting with "/", got: ${path}`);
  }

  let token = getAccessToken();
  if (!token) {
    try { token = await refreshToken(); }
    catch (err) {
      console.error('Token refresh failed (no token, response):', err);
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = `${import.meta.env.BASE_URL || '/'}login`;
      throw err;
    }
  }

  const csrf = readCsrfFromCookie();
  const baseHeaders: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'X-CSRF-Token': csrf,
    ...(options.headers as Record<string, string> | undefined),
  };

  const retryResponseFn = () => { fetchAdminAbsoluteResponse(path, options).catch(() => {}); };
  let response: Response;
  {
    const signal = timeoutSignal(FETCH_TIMEOUT_MS, options.signal as AbortSignal | undefined);
    try {
      response = await fetch(path, { ...options, signal, headers: baseHeaders, credentials: 'include' });
    } catch (err) {
      const reason = (signal as AbortSignal & { reason?: unknown }).reason;
      const timeoutErr = err instanceof TimeoutError ? err : reason instanceof TimeoutError ? reason : null;
      if (timeoutErr) {
        handleTimeoutError(timeoutErr, retryResponseFn);
        throw timeoutErr;
      }
      throw err;
    }
  }

  if (response.status === 401) {
    let respRetrySignal!: AbortSignal;
    try {
      const newToken = await refreshToken!();
      baseHeaders['Authorization'] = `Bearer ${newToken}`;
      respRetrySignal = timeoutSignal(FETCH_TIMEOUT_MS);
      response = await fetch(path, { ...options, signal: respRetrySignal, headers: baseHeaders, credentials: 'include' });
    } catch (err) {
      const retryReason = respRetrySignal
        ? (respRetrySignal as AbortSignal & { reason?: unknown }).reason
        : undefined;
      const timeoutErr =
        err instanceof TimeoutError ? err
        : retryReason instanceof TimeoutError ? retryReason
        : null;
      if (timeoutErr) {
        handleTimeoutError(timeoutErr, () => { fetchAdminAbsoluteResponse(path, options).catch(() => {}); });
        throw timeoutErr;
      }
      console.error('Token refresh failed (response):', err);
      safeSessionSet('admin_session_expired', 'Your session has expired. Please log in again.');
      window.location.href = `${import.meta.env.BASE_URL || '/'}login`;
      throw new Error('Session expired. Please log in again.');
    }
  }

  return response;
}

/**
 * Read the current in-memory access token (or null). Useful for non-fetch
 * call sites such as Socket.IO `auth` payloads.
 */
export function getAdminAccessToken(): string | null {
  return getAccessToken ? getAccessToken() : null;
}

/**
 * Convenience methods for common HTTP verbs
 */
export async function adminGet(endpoint: string): Promise<any> {
  return fetchAdmin(endpoint, { method: 'GET' });
}

export async function adminPost(endpoint: string, data?: any): Promise<any> {
  return fetchAdmin(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function adminPut(endpoint: string, data?: any): Promise<any> {
  return fetchAdmin(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function adminDelete(endpoint: string): Promise<any> {
  return fetchAdmin(endpoint, { method: 'DELETE' });
}

export async function adminPatch(endpoint: string, data?: any): Promise<any> {
  return fetchAdmin(endpoint, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  });
}
