/**
 * Sentry error monitoring — Web-only for Expo.
 * For native mobile, use @sentry/react-native with the expo plugin.
 */
import { Platform } from "react-native";

let _initialized = false;

declare global {
  interface Window {
    Sentry?: {
      init: (opts: Record<string, unknown>) => void;
      captureException: (err: unknown) => void;
      setUser: (user: { id?: string; email?: string } | null) => void;
    };
  }
}

export async function initSentry(
  dsn: string,
  environment: string,
  sampleRate: number,
): Promise<void> {
  if (!dsn || _initialized || Platform.OS !== "web") return;
  _initialized = true;

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src =
      "https://browser.sentry-cdn.com/8.0.0/bundle.min.js";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      try {
        window.Sentry?.init({
          dsn,
          environment: environment || "production",
          sampleRate: sampleRate ?? 1.0,
          tracesSampleRate: 0.1,
        });
      } catch (e) {
        if (__DEV__) console.warn("[Sentry] init error:", e);
      }
      resolve();
    };
    script.onerror = () => {
      _initialized = false;
      resolve();
    };
    document.head.appendChild(script);
  });
}

export function captureError(err: unknown): void {
  if (!_initialized || Platform.OS !== "web") return;
  window.Sentry?.captureException(err);
}

export function setSentryUser(id: string, email?: string): void {
  if (!_initialized || Platform.OS !== "web") return;
  window.Sentry?.setUser({ id, email });
}

export function clearSentryUser(): void {
  if (!_initialized || Platform.OS !== "web") return;
  window.Sentry?.setUser(null);
}
