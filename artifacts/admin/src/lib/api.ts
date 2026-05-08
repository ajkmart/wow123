/**
 * Admin API Bridge Layer
 * 
 * This module bridges the old sessionStorage-based auth API to the new
 * Bearer token + CSRF + auto-refresh system (adminFetcher).
 * 
 * All existing components continue to work without modification, but requests
 * now use the Binance-grade auth system under the hood.
 * 
 * Migration path: Components gradually switch from calling these functions
 * to using adminFetcher/useAdminAuth directly.
 */

import { fetchAdmin, fetchAdminAbsolute, fetchAdminAbsoluteResponse, getAdminAccessToken, setupAdminFetcherHandlers } from './adminFetcher.js';
export { fetchAdminAbsoluteResponse };

export { getAdminAccessToken } from './adminFetcher.js';

// ============================================================================
// Legacy Auth State (now no-ops - state is in adminAuthContext)
// ============================================================================

export const getApiBase = () => {
  return `${window.location.origin}/api/admin`;
};

const ADMIN_TOKEN_KEY = "ajkmart_admin_token";

/**
 * @deprecated Use useAdminAuth() from adminAuthContext instead
 * Kept for backward compatibility - now returns null (tokens are in-memory only)
 */
export const getToken = () => {
  // Tokens are stored in-memory in adminAuthContext, not sessionStorage
  return null;
};

/**
 * @deprecated Use useAdminAuth() from adminAuthContext instead
 * Kept for backward compatibility - no-op (use new auth system)
 */
export const setToken = (token: string) => {
  // No-op - tokens managed by adminAuthContext
};

/**
 * @deprecated Use useAdminAuth().logout() from adminAuthContext instead
 * Kept for backward compatibility - no-op
 */
export const clearToken = () => {
  // No-op - tokens managed by adminAuthContext
};

/**
 * @deprecated Use useAdminAuth() from adminAuthContext instead
 * Kept for backward compatibility - returns false (tokens validated server-side now)
 */
export function isTokenExpired(): boolean {
  // No-op - Token validation happens server-side with auto-refresh
  // Old logic checked expiry before request; new system just does 401 + refresh
  return false;
}

// ============================================================================
// Image Upload - Bridged to new fetcher
// ============================================================================

/**
 * Upload an admin image using the new auth system
 * Automatically includes Bearer token, CSRF protection, and handles auto-refresh
 */
export const uploadAdminImage = async (file: File): Promise<string> => {
  try {
    // Create FormData with file
    const formData = new FormData();
    formData.append('file', file);

    const endpoint = '/uploads/admin';
    const csrfToken = getCsrfFromCookie();
    
    // Build the request with proper auth headers
    // The getAccessTokenFromContext() will be populated by setupAdminFetcherHandlers
    let response = await fetch(`/api/admin${endpoint}`, {
      method: 'POST',
      headers: {
        // Authorization header set dynamically if token available
        ...(await getAuthHeadersForUpload()),
      },
      credentials: 'include',
      body: formData,
    });

    // Handle 401 - try to refresh and retry
    if (response.status === 401) {
      try {
        // If we have the refresh handler, use it
        if (tokenRefresher) {
          await tokenRefresher();
          // Retry with new token
          response = await fetch(`/api/admin${endpoint}`, {
            method: 'POST',
            headers: {
              ...(await getAuthHeadersForUpload()),
            },
            credentials: 'include',
            body: formData,
          });
        }
      } catch (err) {
        console.error('Token refresh failed for upload:', err);
        window.location.href = `${import.meta.env.BASE_URL || '/'}login`;
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed with status ${response.status}`);
    }

    const json = await response.json();
    const data = json.data !== undefined ? json.data : json;
    return data.url as string;
  } catch (err) {
    console.error('Image upload failed:', err);
    throw err;
  }
};

/**
 * Upload an admin image with progress reporting.
 * Uses XMLHttpRequest because fetch() cannot expose upload progress today.
 * Calls `onProgress(percent)` (0-100) as bytes are sent.
 */
export const uploadAdminImageWithProgress = async (
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> => {
  const send = async (): Promise<{ ok: boolean; status: number; body: unknown }> => {
    const formData = new FormData();
    formData.append('file', file);
    const csrfToken = getCsrfFromCookie();
    void csrfToken;
    const headers = await getAuthHeadersForUpload();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/admin/uploads/admin`, true);
      xhr.withCredentials = true;
      Object.entries(headers).forEach(([k, v]) => {
        if (typeof v === 'string') xhr.setRequestHeader(k, v);
      });
      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
          }
        };
      }
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.onload = () => {
        let parsed: unknown = null;
        try { parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { parsed = null; }
        resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: parsed });
      };
      xhr.send(formData);
    });
  };

  let result = await send();
  if (result.status === 401 && tokenRefresher) {
    try {
      await tokenRefresher();
      result = await send();
    } catch (err) {
      console.error('Token refresh failed for upload:', err);
      throw err;
    }
  }
  if (!result.ok) {
    const errorMsg = (result.body as { error?: string } | null)?.error ?? `Upload failed with status ${result.status}`;
    throw new Error(errorMsg);
  }
  const json = result.body as { data?: { url?: string }; url?: string } | null;
  const url = json?.data?.url ?? json?.url;
  if (typeof url !== 'string') throw new Error('Upload response missing url');
  return url;
};

// ============================================================================
// API Fetchers - Bridged to new fetcher
// ============================================================================

/**
 * Main fetcher function
 * Delegates to adminFetcher which handles:
 * - Bearer token inclusion
 * - CSRF token validation
 * - Automatic token refresh on 401
 * - Retry failed requests after refresh
 */
export const fetcher = async (endpoint: string, options: RequestInit = {}) => {
  try {
    const result = await fetchAdmin(endpoint, options);
    return result.data !== undefined ? result.data : result;
  } catch (err) {
    console.error('API error:', err);
    throw err;
  }
};

/**
 * Fetcher that returns full response with metadata
 * Used when consumers need paging info, counts, etc.
 */
export const fetcherWithMeta = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: unknown; total?: number; [key: string]: unknown }> => {
  try {
    const result = await fetchAdmin(endpoint, options);
    return result;
  } catch (err) {
    console.error('API error:', err);
    throw err;
  }
};

/**
 * Alias for fetcher (for backward compatibility)
 */
export const apiFetch = fetcher;

/**
 * Admin-authenticated fetch against an absolute API path
 * (e.g. `/api/kyc/admin/...`, `/api/payments/...`, `/api/maps/admin/...`).
 * Use this for admin endpoints that live OUTSIDE `/api/admin/*`.
 */
export const apiAbsoluteFetch = async (path: string, options: RequestInit = {}) => {
  try {
    const result = await fetchAdminAbsolute(path, options);
    return result?.data !== undefined ? result.data : result;
  } catch (err) {
    console.error('API error:', err);
    throw err;
  }
};

/** Like apiAbsoluteFetch but returns the full response envelope (no data unwrap). */
export const apiAbsoluteFetchRaw = async (path: string, options: RequestInit = {}) => {
  return fetchAdminAbsolute(path, options);
};

// ============================================================================
// HTTP Verb Helpers (delegated to adminFetcher)
// ============================================================================

/**
 * Get helper
 */
export async function apiGet(endpoint: string) {
  return fetcher(endpoint, { method: 'GET' });
}

/**
 * Post helper
 */
export async function apiPost(endpoint: string, data: any) {
  return fetcher(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Put helper
 */
export async function apiPut(endpoint: string, data: any) {
  return fetcher(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Patch helper
 */
export async function apiPatch(endpoint: string, data: any) {
  return fetcher(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

/**
 * Delete helper
 */
export async function apiDelete(endpoint: string) {
  return fetcher(endpoint, { method: 'DELETE' });
}

// ============================================================================
// Utility Functions (Private)
// ============================================================================

// Global token handlers set up by App.tsx via setupAdminFetcherHandlers
let tokenGetter: (() => string | null) | null = null;
let tokenRefresher: (() => Promise<string>) | null = null;

/**
 * Set token handlers from adminFetcher
 * Called during App initialization
 */
export function setTokenHandlers(
  getter: () => string | null,
  refresher: () => Promise<string>
) {
  tokenGetter = getter;
  tokenRefresher = refresher;
}

/**
 * Read CSRF token from cookie. Defensive — never throws even if the
 * cookie is missing, malformed, or contains a bad %-escape sequence.
 */
function getCsrfFromCookie(): string {
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
    /* ignore */
  }
  return '';
}

/**
 * Get authorization headers for upload
 * Returns object with Authorization and X-CSRF-Token if token is available
 */
async function getAuthHeadersForUpload(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  
  const token = tokenGetter?.();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const csrf = getCsrfFromCookie();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }
  
  return headers;
}

/**
 * Get access token from context (for fallback/manual operations)
 * This is a temporary measure for uploadAdminImage; prefer using adminFetcher
 */
function getAccessTokenFromContext(): string {
  // Try to extract from current request context or return empty
  // The adminFetcher handlers will be set up by App.tsx
  return '';
}
