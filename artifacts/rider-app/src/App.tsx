import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./lib/auth";
import { usePlatformConfig, getRiderModules } from "./lib/useConfig";
import { useLanguage, LanguageProvider } from "./lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { SocketProvider } from "./lib/socket";
import { registerDrainHandler, setGpsQueueMax, setDismissedRequestTtlSec, type QueuedPing } from "./lib/gpsQueue";
import { registerActionExecutor, syncQueue, type QueuedAction } from "./lib/offline/queueManager";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { registerPush, consumePendingNotificationTap } from "./lib/push";
import { Capacitor } from "@capacitor/core";
import { initSentry, setSentryUser } from "./lib/sentry";
import { initAnalytics, trackEvent, identifyUser } from "./lib/analytics";
import { initErrorReporter } from "./lib/error-reporter";
import { api, apiFetch, setApiTimeoutMs } from "./lib/api";
import { setGeofencePolygon, setMaxSpeedKmh } from "./lib/gps/validation";
import { riderEnv } from "./lib/envValidation";
import { BottomNav } from "./components/BottomNav";
import { AnnouncementBar } from "./components/AnnouncementBar";
import { PwaInstallBanner } from "./components/PwaInstallBanner";
import { PopupEngine } from "./components/PopupEngine";
import { MaintenanceScreen } from "./components/MaintenanceScreen";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Home from "./pages/Home";
import Active from "./pages/Active";
import Profile from "./pages/Profile";
import NotFound from "./pages/not-found";

/* PF4 / R3: Lazy-load the heavy / less-frequent routes so first paint doesn't
   download Wallet, VanDriver, Chat (with WebRTC plumbing), Notifications,
   History, Earnings, SecuritySettings. Home / Active / Login / Profile remain
   eager because they're the rider's hot path. */
const History         = lazy(() => import("./pages/History"));
const Earnings        = lazy(() => import("./pages/Earnings"));
const Wallet          = lazy(() => import("./pages/Wallet"));
const Notifications   = lazy(() => import("./pages/Notifications"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const VanDriver       = lazy(() => import("./pages/VanDriver"));
const Chat            = lazy(() => import("./pages/Chat"));
const Reviews         = lazy(() => import("./pages/Reviews"));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, networkMode: 'offlineFirst' } } });

/* PWA5: Capacitor-aware base resolution. `BASE_URL` may be `./` or a
   `capacitor://` URL on native; resolving against `window.location.origin`
   normalises it to a usable pathname for wouter regardless of platform. */
function getRouterBase(): string {
  try {
    const raw = riderEnv.baseUrl || "/";
    const u = new URL(raw, window.location.origin);
    return u.pathname.replace(/\/$/, "");
  } catch {
    return "";
  }
}

/* U5: Splash deadline — if `getMe` hangs longer than this, the splash screen
   surfaces a retry CTA so the user is never stuck on the spinner forever. */
const SPLASH_DEADLINE_MS = 30_000;

/* P4: Track once-per-tab whether we've already requested notification
   permission so we don't re-prompt on every `user` change. The browser will
   silently no-op after a "denied" decision, but the call still emits a console
   warning that the error reporter would otherwise capture (PF1).
   We persist this flag in sessionStorage (rather than a module-level let) so
   that HMR reloads in dev and React StrictMode double-invocations don't
   accidentally re-prompt within the same browser tab session. */
const NOTIF_ASKED_KEY = "_ajkm_notifPermissionAsked";

function PageFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppRoutes() {
  const { user, loading, storageError, logout } = useAuth();
  const { config } = usePlatformConfig();
  const modules = getRiderModules(config);
  const { language } = useLanguage();
  const qc = useQueryClient();
  const T = (key: TranslationKey) => tDual(key, language);

  useEffect(() => {
    return registerDrainHandler(async (pings: QueuedPing[]) => {
      await api.batchLocation(pings.map(({ id, ...rest }) => rest));
    });
  }, []);

  useEffect(() => {
    registerActionExecutor(async (action: QueuedAction) => {
      /* Pass X-Idempotency-Key so the server can de-duplicate replayed offline
         actions. The action UUID is stable across retries and survives tab close
         via IndexedDB persistence. */
      const idemHdr = { "X-Idempotency-Key": action.id };
      switch (action.type) {
        case "accept_order":
          await apiFetch(`/rider/orders/${action.entityId}/accept`, { method: "POST", body: "{}", headers: idemHdr });
          break;
        case "accept_ride":
          await apiFetch(`/rider/rides/${action.entityId}/accept`, { method: "POST", body: "{}", headers: idemHdr });
          break;
        case "update_order": {
          const { status, proofPhoto } = action.payload as { status: string; proofPhoto?: string };
          await apiFetch(`/rider/orders/${action.entityId}/status`, { method: "PATCH", body: JSON.stringify({ status, ...(proofPhoto ? { proofPhoto } : {}) }), headers: idemHdr });
          break;
        }
        case "update_ride": {
          const { status, lat, lng } = action.payload as { status: string; lat?: number; lng?: number };
          const loc = lat !== undefined && lng !== undefined ? { lat, lng } : {};
          await apiFetch(`/rider/rides/${action.entityId}/status`, { method: "PATCH", body: JSON.stringify({ status, ...loc }), headers: idemHdr });
          break;
        }
        case "complete_trip": {
          /* complete_trip is enqueued by VanDriver when a van trip completion
             fails offline. entityId = scheduleId, payload.date = trip date. */
          const { date } = action.payload as { date: string };
          await apiFetch(`/van/driver/schedules/${action.entityId}/date/${date}/complete`, { method: "PATCH", body: "{}", headers: idemHdr });
          break;
        }
        case "board_passenger": {
          /* board_passenger is enqueued by VanDriver when a boarding PATCH
             fails offline. entityId = bookingId, payload.boardedAt = ISO timestamp. */
          const { boardedAt } = action.payload as { boardedAt: string };
          await apiFetch(`/van/driver/bookings/${action.entityId}/board`, { method: "PATCH", body: JSON.stringify({ boarded: true, boardedAt }), headers: idemHdr });
          break;
        }

      }
    });
    syncQueue().catch(() => {});
  }, []);

  useEffect(() => { initErrorReporter(); }, []);

  /* ── Apply network/retry settings from platform config on startup ── */
  useEffect(() => {
    const net = config?.network;
    if (!net) return;
    if (typeof net.apiTimeoutMs === "number")                setApiTimeoutMs(net.apiTimeoutMs);
    if (typeof net.riderGpsQueueMax === "number")            setGpsQueueMax(net.riderGpsQueueMax);
    if (typeof net.riderDismissedRequestTtlSec === "number") setDismissedRequestTtlSec(net.riderDismissedRequestTtlSec);
  }, [config]);

  /* ── Wire platform-config geofence + speed threshold into GPS validation ── */
  useEffect(() => {
    const poly = config?.geofence?.polygon;
    if (Array.isArray(poly) && poly.length >= 3) {
      setGeofencePolygon(poly);
    } else {
      setGeofencePolygon(null);
    }
    /* Reset to default (200 km/h) when platform config does not supply a value
       so stale thresholds from a previous config load don't carry over. */
    setMaxSpeedKmh(config?.security?.maxSpeedKmh ?? 200);
  }, [config?.geofence, config?.security?.maxSpeedKmh]);

  /* ── Sentry + Analytics init from platform config ── */
  useEffect(() => {
    const integ = config?.integrations;
    if (!integ) return;
    if (integ.sentry && integ.sentryDsn) {
      initSentry(integ.sentryDsn, integ.sentryEnvironment, integ.sentrySampleRate, integ.sentryTracesSampleRate);
    }
    if (integ.analytics && integ.analyticsTrackingId) {
      initAnalytics(integ.analyticsPlatform, integ.analyticsTrackingId, integ.analyticsDebug ?? false);
    }
  }, [config?.integrations]);

  /* ── Cold-start notification tap: consume any tap captured before auth loaded ──
     Handles two cases:
     (a) pushNotificationActionPerformed fired at module-load (killed-app tap)
         → drained from _pendingTapData via consumePendingNotificationTap.
     (b) getDeliveredNotifications reveals a notification the rider hasn't
         dismissed yet (backgrounded app case on some Android builds).
     Routes based on data.type so future push types (wallet, etc.) land
     on the correct screen rather than always going to /active. */
  useEffect(() => {
    if (!user) return;
    const routeByData = (data: Record<string, string>) => {
      const type = data.type ?? "";
      if (type === "wallet") { navigate("/wallet"); return; }
      if (type === "ai_chat") { navigate("/chat?tab=ai"); return; }
      if (data.rideId || data.orderId || type === "ride_request" || type === "order_request" || type === "new_order") {
        navigate("/active");
      }
    };
    const pending = consumePendingNotificationTap();
    if (pending && Object.keys(pending).length > 0) {
      routeByData(pending);
      return;
    }
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/push-notifications").then(({ PushNotifications }) => {
        PushNotifications.getDeliveredNotifications().then(({ notifications }) => {
          const first = notifications[0];
          if (first?.data) routeByData(first.data as Record<string, string>);
        }).catch(() => {});
      }).catch(() => {});
    }
  }, [user?.id]);

  /* ── FCM foreground notification banner ── */
  const [fcmNotif, setFcmNotif] = useState<{ title: string; body: string } | null>(null);
  const fcmCleanupRef = useRef<{ remove: () => void } | null>(null);
  const fcmDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, navigate] = useLocation();

  /* P4: Only request notification permission when it's still in the "default"
     state. After the user has explicitly granted or denied it, we never re-ask
     — modern browsers silently no-op anyway and the call would emit warnings
     that the global error reporter (PF1) would amplify. We also gate by a
     module-level flag so back-to-back logins/logouts in the same tab don't
     re-prompt on each `user` change.
     On native Capacitor builds registerPush() uses FCM directly and handles
     permission prompts itself — the Notification API guard is bypassed via the
     Capacitor.isNativePlatform() check inside push.ts. */
  useEffect(() => {
    if (!user) return undefined;
    const onForeground = (title: string, body: string) => {
      setFcmNotif({ title, body });
      if (fcmDismissTimer.current) clearTimeout(fcmDismissTimer.current);
      fcmDismissTimer.current = setTimeout(() => setFcmNotif(null), 5000);
    };
    /* When the rider taps a push notification (background / killed app), navigate
       to the Active screen so they can accept the ride immediately. */
    const onNotificationTap = (data: Record<string, string>) => {
      const type = data.type ?? "";
      if (type === "ai_chat") { navigate("/chat?tab=ai"); return; }
      if (data.rideId || data.orderId) {
        navigate("/active");
      }
    };
    if (Capacitor.isNativePlatform()) {
      registerPush(onForeground, onNotificationTap).then(cleanup => {
        if (cleanup) fcmCleanupRef.current = cleanup;
      }).catch(() => {});
      return () => {
        fcmCleanupRef.current?.remove();
        if (fcmDismissTimer.current) clearTimeout(fcmDismissTimer.current);
      };
    }
    if (typeof Notification === "undefined" || !Notification.requestPermission) return undefined;
    if (sessionStorage.getItem(NOTIF_ASKED_KEY)) return undefined;
    if (Notification.permission !== "default") {
      if (Notification.permission === "granted") registerPush().catch(() => {});
      return undefined;
    }
    sessionStorage.setItem(NOTIF_ASKED_KEY, "1");
    Notification.requestPermission().then(perm => {
      if (perm === "granted") registerPush().catch(() => {});
    }).catch(() => {});
    return undefined;
  }, [user?.id]);

  /* Show a subtle toast whenever refreshUser fails persistently */
  const [refreshFailToast, setRefreshFailToast] = useState(false);
  const refreshFailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = () => {
      setRefreshFailToast(true);
      if (refreshFailTimer.current) clearTimeout(refreshFailTimer.current);
      refreshFailTimer.current = setTimeout(() => setRefreshFailToast(false), 4000);
    };
    window.addEventListener("ajkmart:refresh-user-failed", handler);
    return () => {
      window.removeEventListener("ajkmart:refresh-user-failed", handler);
      if (refreshFailTimer.current) clearTimeout(refreshFailTimer.current);
    };
  }, []);

  /* PWA6: Global offline event surfaces a hint to the user immediately rather
     than waiting for the per-request 30s timeout to fire. Offline-aware pages
     (Active.tsx) maintain their own AbortControllers; this listener is purely
     for user feedback and does not abort cross-page requests (which would
     cause double-fire bugs in a single-page-app context). */
  const [offlineHint, setOfflineHint] = useState(false);
  useEffect(() => {
    const onOffline = () => setOfflineHint(true);
    const onOnline  = () => setOfflineHint(false);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online",  onOnline);
    setOfflineHint(typeof navigator !== "undefined" && navigator.onLine === false);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online",  onOnline);
    };
  }, []);

  /* U5: Splash deadline — if loading remains true past SPLASH_DEADLINE_MS,
     show a retry button. We don't unblock automatically because `loading=true`
     might mean a legitimately slow `getMe`; we just give the user an escape. */
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) { setSplashTimedOut(false); return; }
    const id = setTimeout(() => setSplashTimedOut(true), SPLASH_DEADLINE_MS);
    return () => clearTimeout(id);
  }, [loading]);

  if (storageError) return (
    <div className="min-h-screen bg-gradient-to-br from-red-700 to-rose-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Secure Storage Unavailable</h2>
        <p className="text-gray-500 text-sm leading-relaxed mb-6">
          Your device's secure storage could not be accessed. This is required to safely store your
          login credentials. Please clear the app's data or reinstall and try again.
        </p>
        <button onClick={() => window.location.reload()}
          className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors">
          Retry
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-emerald-800 flex items-center justify-center">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">🏍️</div>
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-white mt-3 font-medium">{T("loadingRiderPortal")}</p>
        {splashTimedOut && (
          <div className="mt-6 bg-white/10 rounded-2xl p-4 text-white text-sm space-y-3 max-w-xs mx-auto">
            <p>Couldn't reach server. Please check your connection.</p>
            <button onClick={() => window.location.reload()}
              className="w-full py-2 rounded-xl bg-white text-emerald-700 font-semibold text-sm hover:bg-gray-100 transition-colors">
              {T("retry")}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  if (!user) return (
    <Switch>
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route><Login /></Route>
    </Switch>
  );

  /* S-Sec10: When entering a non-active branch (pending / rejected /
     maintenance) clear cached query data so a brief route swap can't read
     the previous active session's `rider-active` cache. We do this in a
     module-scope effect so it runs once per branch entry. */
  const supportPhone = (config.content as { supportPhone?: string } | undefined)?.supportPhone;

  /* ── Approval status guard — shown after session rehydration if still pending/rejected ── */
  if (user.approvalStatus === "pending") {
    qc.clear(); /* S-Sec10 */
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">⏳</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Account Under Review</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-6">Your rider account is pending admin approval. You will be able to access the app once your account is approved.</p>
          {/* U6: Contact support CTA on approval/rejection screens */}
          {supportPhone && (
            <a href={`tel:${supportPhone}`}
              className="block w-full py-3 mb-2 rounded-2xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors">
              {T("contactSupport")}
            </a>
          )}
          {/* A8: Use auth.logout() (which awaits the server-side revoke) instead of
              local-only api.clearTokens(). The reload happens in onSettled. */}
          <button onClick={async () => { try { logout(); } finally { window.location.reload(); } }}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors">
            {T("signOutLabel")}
          </button>
        </div>
      </div>
    );
  }

  if (user.approvalStatus === "rejected") {
    qc.clear(); /* S-Sec10 */
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Account Rejected</h2>
          <p className="text-gray-500 text-sm leading-relaxed mb-2">Your rider account application was not approved.</p>
          {user.rejectionReason && <p className="text-red-600 text-sm font-medium mb-6">{T("reason")}: {user.rejectionReason}</p>}
          {supportPhone && (
            <a href={`tel:${supportPhone}`}
              className="block w-full py-3 mb-2 rounded-2xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors">
              {T("contactSupport")}
            </a>
          )}
          <button onClick={async () => { try { logout(); } finally { window.location.reload(); } }}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors">
            {T("signOutLabel")}
          </button>
        </div>
      </div>
    );
  }

  if (config.platform.appStatus === "maintenance") {
    qc.clear(); /* S-Sec10 */
    return <MaintenanceScreen message={config.content.maintenanceMsg} appName={config.platform.appName} />;
  }

  const isLimited = config.platform.appStatus === "limited";

  const userRoles: string[] = Array.isArray(user.roles) ? user.roles : [];
  const isVanDriver = userRoles.includes("van_driver");

  if (isVanDriver) {
    return (
      <div className="max-w-md mx-auto relative flex flex-col min-h-screen">
        {isLimited && (
          <div className="fixed top-0 inset-x-0 z-50 bg-orange-400 text-white text-center py-2 px-4 text-xs font-bold shadow pointer-events-none">
            ⚠️ Limited service — some features may be temporarily unavailable
          </div>
        )}
        {refreshFailToast && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg pointer-events-none">
            {/* U1: At minimum the dynamic data piece is i18n-aware via T("offline"); the
                static refresh-failure phrase is platform-config copy that follows
                the rest of admin-driven content (config.content), not the bundled
                i18n keys. We keep the English string here intentionally rather than
                add a new bundled key just for this one toast. */}
            Connection issue — profile sync failed
          </div>
        )}
        {offlineHint && (
          <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[9999] bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg pointer-events-none">
            {T("offline")}
          </div>
        )}
        {fcmNotif && (
          <button onClick={() => setFcmNotif(null)} className="fixed top-4 left-4 right-4 z-[10000] bg-emerald-700 text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl text-left">
            <div className="font-bold truncate">{fcmNotif.title}</div>
            <div className="text-xs opacity-90 truncate">{fcmNotif.body}</div>
          </button>
        )}
        <div className="flex-1">
          <Suspense fallback={<PageFallback />}>
            <VanDriver />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto relative flex flex-col min-h-screen">
      {isLimited && (
        <div className="fixed top-0 inset-x-0 z-50 bg-orange-400 text-white text-center py-2 px-4 text-xs font-bold shadow pointer-events-none">
          ⚠️ Limited service — some features may be temporarily unavailable
        </div>
      )}
      {refreshFailToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg pointer-events-none">
          Connection issue — profile sync failed
        </div>
      )}
      {offlineHint && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[9999] bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg pointer-events-none">
          {T("offline")}
        </div>
      )}
      {fcmNotif && (
        <button onClick={() => setFcmNotif(null)} className="fixed top-4 left-4 right-4 z-[10000] bg-emerald-700 text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl text-left">
          <div className="font-bold truncate">{fcmNotif.title}</div>
          <div className="text-xs opacity-90 truncate">{fcmNotif.body}</div>
        </button>
      )}

      {/* U2: Cap the announcement bar at a compact strip; long messages scroll
          internally rather than consuming a third of the viewport. */}
      <div className="sticky top-0 z-50 flex flex-col max-h-[80px] overflow-y-auto">
        <AnnouncementBar message={config.content.announcement} />
      </div>
      <PopupEngine />

      <div className="flex-1" style={{ paddingBottom: "calc(64px + max(8px, env(safe-area-inset-bottom, 8px)))" }}>
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/active" component={Active} />
            {modules.history && <Route path="/history" component={History} />}
            {modules.earnings && <Route path="/earnings" component={Earnings} />}
            {modules.wallet && <Route path="/wallet" component={Wallet} />}
            <Route path="/notifications" component={Notifications} />
            <Route path="/profile" component={Profile} />
            <Route path="/settings/security" component={SecuritySettings} />
            <Route path="/security" component={SecuritySettings} />
            <Route path="/van" component={VanDriver} />
            <Route path="/van-driver" component={VanDriver} />
            <Route path="/chat" component={Chat} />
            <Route path="/chat/:id" component={Chat} />
            <Route path="/reviews" component={Reviews} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </div>
      <BottomNav />
    </div>
  );
}

function VersionCheckInit() {
  useVersionCheck();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <VersionCheckInit />
        <LanguageProvider>
          <AuthProvider>
            <SocketProvider>
              <WouterRouter base={getRouterBase()}>
                <AppRoutes />
              </WouterRouter>
              <PwaInstallBanner />
            </SocketProvider>
          </AuthProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
