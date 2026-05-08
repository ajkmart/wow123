/**
 * Registers the AJKMart PWA service worker on web.
 * No-op on native platforms.
 */
import { Platform } from "react-native";

export function registerServiceWorker() {
  if (Platform.OS !== "web") return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        // Service worker registered successfully
      })
      .catch((err) => {
        if (__DEV__) console.warn("[SW] Registration failed:", err);
      });
  });
}
