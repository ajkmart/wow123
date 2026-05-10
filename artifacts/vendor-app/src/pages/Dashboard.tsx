import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "../lib/auth";
import type { StoreHours } from "../lib/auth";
import { api } from "../lib/api";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual } from "@workspace/i18n";
import { useState, useRef, useCallback } from "react";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { useOfflineQueue } from "../hooks/useOfflineQueue";
import { fc, CARD, STAT_VAL, STAT_LBL, DEFAULT_COMMISSION_PCT, errMsg, fd } from "../lib/ui";
import { Truck } from "lucide-react";

function typeIcon(type: string) {
  if (type === "order")  return "📦";
  if (type === "wallet") return "💰";
  if (type === "promo")  return "🎟️";
  if (type === "system") return "⚙️";
  if (type === "alert")  return "⚠️";
  return "🔔";
}

function QuickActions() {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-xs font-extrabold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</p>
      <div className="grid grid-cols-3 gap-3">
        <Link href="/orders"
          className="flex flex-col items-center gap-2 p-3 bg-green-50 rounded-2xl active:scale-95 transition-transform text-center">
          <span className="text-2xl">✅</span>
          <span className="text-xs font-bold text-green-700 leading-tight">Accept Orders</span>
        </Link>
        <Link href="/chat"
          className="flex flex-col items-center gap-2 p-3 bg-blue-50 rounded-2xl active:scale-95 transition-transform text-center">
          <span className="text-2xl">💬</span>
          <span className="text-xs font-bold text-blue-700 leading-tight">Open Chat</span>
        </Link>
        <Link href="/products"
          className="flex flex-col items-center gap-2 p-3 bg-orange-50 rounded-2xl active:scale-95 transition-transform text-center">
          <span className="text-2xl">🛒</span>
          <span className="text-xs font-bold text-orange-700 leading-tight">Manage Products</span>
        </Link>
      </div>
    </div>
  );
}

interface DashNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead?: boolean;
  createdAt: string;
}

function NotificationsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["vendor-notifications"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const markAllMut = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor-notifications"] }); qc.invalidateQueries({ queryKey: ["vendor-notifs-count"] }); },
  });

  const notifs: DashNotification[] = (data?.notifications || []).slice(0, 5);
  const unread: number = data?.unread || 0;

  return (
    <div className={CARD}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🔔</span>
          <p className="font-bold text-gray-800 text-sm">Recent Notifications</p>
          {unread > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unread} unread</span>}
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={() => markAllMut.mutate()} disabled={markAllMut.isPending}
              className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-lg">
              ✓ Mark all read
            </button>
          )}
          <Link href="/notifications" className="text-[11px] font-bold text-gray-400 hover:text-orange-500">View all →</Link>
        </div>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 skeleton rounded-xl"/>)}
        </div>
      ) : notifs.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <p className="text-3xl mb-2">🔔</p>
          <p className="text-sm font-bold text-gray-500">All caught up!</p>
          <p className="text-xs text-gray-400 mt-1">No new notifications</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {notifs.map(n => (
            <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${!n.isRead ? "bg-orange-50/30" : ""}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base ${!n.isRead ? "bg-orange-100" : "bg-gray-100"}`}>
                {typeIcon(n.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold leading-snug ${!n.isRead ? "text-gray-900" : "text-gray-700"}`}>{n.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed line-clamp-1">{n.body}</p>
                <p className="text-[10px] text-gray-400 mt-1">{fd(n.createdAt)}</p>
              </div>
              {!n.isRead && <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0 mt-1.5"/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_STORE_HOURS: StoreHours = {
  mon: { open: "08:00", close: "22:00" },
  tue: { open: "08:00", close: "22:00" },
  wed: { open: "08:00", close: "22:00" },
  thu: { open: "08:00", close: "22:00" },
  fri: { open: "08:00", close: "22:00" },
  sat: { open: "08:00", close: "22:00" },
  sun: { open: "10:00", close: "20:00" },
};

function ScheduleEditor({ storeHours, onSave, saving }: {
  storeHours: StoreHours | null | undefined;
  onSave: (hours: StoreHours) => Promise<void>;
  saving: boolean;
}) {
  const initHours: StoreHours = storeHours && Object.keys(storeHours).length > 0 ? storeHours : DEFAULT_STORE_HOURS;
  const [hours, setHours] = useState<StoreHours>(initHours);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const update = (day: string, field: "open" | "close" | "closed", val: string | boolean) => {
    setHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: val },
    }));
    setDirty(true);
  };

  if (!expanded) {
    return (
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-bold text-gray-800 text-sm">Weekly Schedule</p>
            <p className="text-xs text-gray-500 mt-0.5">Set your open/close hours per day</p>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="h-9 px-4 bg-orange-50 text-orange-600 font-bold rounded-xl text-sm"
          >
            Edit Schedule
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-bold text-gray-800 text-sm">Weekly Schedule</p>
        <button onClick={() => setExpanded(false)} className="text-gray-400 text-lg leading-none">×</button>
      </div>
      <div className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const day = hours[key] ?? { open: "08:00", close: "22:00" };
          const isClosed = day.closed === true;
          return (
            <div key={key} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
              <div className="w-20 flex-shrink-0">
                <p className="text-xs font-semibold text-gray-700">{label.slice(0, 3)}</p>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                <div
                  onClick={() => update(key, "closed", !isClosed)}
                  className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${isClosed ? "bg-gray-300" : "bg-green-400"}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-all ${isClosed ? "left-0.5" : "left-5"}`} />
                </div>
                <span className={`text-[10px] font-bold ${isClosed ? "text-gray-400" : "text-green-600"}`}>
                  {isClosed ? "Closed" : "Open"}
                </span>
              </label>
              {!isClosed && (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="time"
                    value={day.open || "08:00"}
                    onChange={e => update(key, "open", e.target.value)}
                    className="flex-1 h-8 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-orange-400"
                  />
                  <span className="text-gray-400 text-xs">–</span>
                  <input
                    type="time"
                    value={day.close || "22:00"}
                    onChange={e => update(key, "close", e.target.value)}
                    className="flex-1 h-8 px-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-orange-400"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => { setHours(initHours); setDirty(false); setExpanded(false); }}
          className="flex-1 h-9 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm"
        >
          Cancel
        </button>
        <button
          onClick={async () => { await onSave(hours); setDirty(false); setExpanded(false); }}
          disabled={!dirty || saving}
          className="flex-1 h-9 bg-orange-500 text-white font-bold rounded-xl text-sm disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Schedule"}
        </button>
      </div>
    </div>
  );
}

function VendorNoticeBanner({ message }: { message: string }) {
  const key = `vendor_notice_dismissed_${message.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)}`;
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(key) === "1");
  if (dismissed) return null;
  const dismiss = () => { sessionStorage.setItem(key, "1"); setDismissed(true); };
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-start gap-3 mb-2">
      <span className="text-blue-500 text-base flex-shrink-0 mt-0.5">📌</span>
      <p className="text-sm text-blue-700 font-medium leading-snug flex-1">{message}</p>
      <button onClick={dismiss} className="text-blue-400 hover:text-blue-600 text-lg leading-none flex-shrink-0">×</button>
    </div>
  );
}

function LiveTrackingNotice({ liveTracking, T }: { liveTracking: boolean; T: (k: Parameters<typeof tDual>[0]) => string }) {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("live_tracking_notice_dismissed") === "1");
  if (liveTracking || dismissed) return null;
  return (
    <div className="fixed bottom-24 left-4 right-4 z-40 bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg md:max-w-sm md:left-auto md:right-6">
      <span className="text-lg">📍</span>
      <div className="flex-1">
        <p className="text-xs font-bold text-amber-800">{T("liveTrackingDisabled")}</p>
        <p className="text-xs text-amber-600">{T("liveTrackingUnavailable")}</p>
      </div>
      <button onClick={() => { sessionStorage.setItem("live_tracking_notice_dismissed", "1"); setDismissed(true); }} className="text-amber-500 hover:text-amber-700 text-lg leading-none flex-shrink-0">×</button>
    </div>
  );
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);
  const qc = useQueryClient();
  const { isOnline, pendingProductCount } = useOfflineQueue();
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(new Set());
  const [cancelDialog, setCancelDialog] = useState<{ orderId: string } | null>(null);
  const [acceptDialog, setAcceptDialog] = useState<{ orderId: string; total: number } | null>(null);
  const cancelReasonRef = useRef("");

  const { data: stats, isLoading } = useQuery({ queryKey: ["vendor-stats"], queryFn: () => api.getStats(), refetchInterval: 30000 });
  const { data: ordersData } = useQuery({ queryKey: ["vendor-orders", "all"], queryFn: () => api.getOrders(), refetchInterval: 20000 });
  const { data: daStatus } = useQuery({ queryKey: ["vendor-delivery-access"], queryFn: () => api.getDeliveryAccessStatus(), refetchInterval: 60000 });
  const requestDeliveryMut = useMutation({
    mutationFn: (data: { serviceType?: string; reason?: string }) => api.requestDeliveryAccess(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor-delivery-access"] }); showToast("✅ Delivery access request submitted"); },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (isOpen: boolean) => api.updateStore({ storeIsOpen: isOpen }),
    onSuccess: () => { refreshUser(); qc.invalidateQueries({ queryKey: ["vendor-stats"] }); },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const [schedSaving, setSchedSaving] = useState(false);
  const saveSchedule = async (hours: StoreHours) => {
    setSchedSaving(true);
    try {
      await api.updateStore({ storeHours: hours });
      await refreshUser();
      showToast("✅ Schedule saved");
    } catch (e: any) {
      showToast("❌ " + errMsg(e));
    } finally {
      setSchedSaving(false);
    }
  };

  const orderActionMut = useMutation({
    mutationFn: ({ orderId, status, reason }: { orderId: string; status: string; reason?: string }) => {
      setPendingOrderIds(s => new Set(s).add(orderId));
      return api.updateOrder(orderId, status, reason);
    },
    onSuccess: (_, { orderId, status }) => {
      setPendingOrderIds(s => { const n = new Set(s); n.delete(orderId); return n; });
      qc.invalidateQueries({ queryKey: ["vendor-orders"] });
      qc.invalidateQueries({ queryKey: ["vendor-stats"] });
      showToast(status === "confirmed" ? `✅ ${T("orderAcceptedMsg")}` : `❌ ${T("orderCancelledMsg")}`);
    },
    onError: (e: Error, { orderId }) => {
      setPendingOrderIds(s => { const n = new Set(s); n.delete(orderId); return n; });
      showToast("❌ " + errMsg(e));
    },
  });

  const allOrders = ordersData?.orders || [];
  const pendingOrders = allOrders.filter((o: any) => o.status === "pending");
  const activeOrders  = allOrders.filter((o: any) => ["confirmed","preparing","ready"].includes(o.status));

  const statItems = [
    { label: T("todaysOrders"),   value: isLoading ? "—" : String(stats?.today?.orders ?? 0),  color: "text-orange-500", bg: "bg-orange-50",  icon: "📦" },
    { label: T("todaysRevenue"),  value: isLoading ? "—" : fc(stats?.today?.revenue ?? 0),      color: "text-amber-600",  bg: "bg-amber-50",   icon: "💰" },
    { label: T("weeklyRevenue"),  value: isLoading ? "—" : fc(stats?.week?.revenue ?? 0),       color: "text-blue-600",   bg: "bg-blue-50",    icon: "📅" },
    { label: T("monthlyRevenue"), value: isLoading ? "—" : fc(stats?.month?.revenue ?? 0),      color: "text-purple-600", bg: "bg-purple-50",  icon: "📈" },
  ];

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["vendor-stats"] }),
      qc.invalidateQueries({ queryKey: ["vendor-orders"] }),
    ]);
  }, [qc]);

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-screen bg-gray-50 md:bg-transparent">
      {/* ── Offline Banner ── */}
      {!isOnline && (
        <div className="bg-red-500 text-white text-center text-xs font-bold py-2 px-4">
          📴 You're offline — data may be out of date
        </div>
      )}
      {/* ── Header ── */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span>{user?.storeName || "Dashboard"}</span>
            {user?.isVerified && (
              <span className="text-[11px] font-bold bg-green-100 text-green-700 md:bg-white/20 md:text-white px-2 py-0.5 rounded-full">✓ Verified</span>
            )}
          </span>
        }
        subtitle={user?.storeCategory ? `${user.storeCategory} · ${config.platform.appName} Partner` : `${config.platform.appName} Vendor Portal`}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden md:block text-sm text-gray-500 font-medium">{T("store")}:</span>
            <button
              onClick={() => toggleMut.mutate(!user?.storeIsOpen)}
              disabled={toggleMut.isPending}
              className={`relative h-8 w-14 rounded-full transition-all duration-300 flex-shrink-0 focus:outline-none
                ${user?.storeIsOpen ? "bg-green-400" : "bg-gray-300"}`}
            >
              <div className={`w-6 h-6 bg-white rounded-full absolute top-1 shadow-md transition-all duration-300 ${user?.storeIsOpen ? "left-7" : "left-1"}`} />
            </button>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${user?.storeIsOpen ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              {user?.storeIsOpen ? T("openLabel") : T("closedLabel")}
            </span>
          </div>
        }
        mobileContent={
          <div className="flex items-center justify-between bg-white/20 rounded-2xl px-4 py-2.5">
            <div>
              <p className="text-orange-100 text-xs font-medium">{T("walletBalance")}</p>
              <p className="text-2xl font-extrabold text-white">{fc(user?.walletBalance ?? "0")}</p>
            </div>
            <div className="text-right">
              <p className="text-orange-100 text-xs font-medium">{T("storeStatus")}</p>
              <button onClick={() => toggleMut.mutate(!user?.storeIsOpen)} disabled={toggleMut.isPending}
                className={`w-14 h-7 rounded-full relative transition-all duration-300 block mt-1 ${user?.storeIsOpen ? "bg-green-400" : "bg-white/30"}`}>
                <div className={`w-5 h-5 bg-white rounded-full absolute top-1 shadow transition-all duration-300 ${user?.storeIsOpen ? "left-8" : "left-1"}`} />
              </button>
            </div>
          </div>
        }
      />

      <div className="px-4 py-4 space-y-4 md:px-0 md:py-0 md:space-y-0">
        {/* Active Tracker Banner — top position */}
        {config.content.trackerBannerEnabled && config.content.trackerBannerPosition === "top" && activeOrders.length > 0 && (
          <Link href="/orders"
            className="block bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl px-4 py-3.5 shadow-lg shadow-orange-200 active:scale-[0.98] transition-transform mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-white tracking-tight">
                  {activeOrders.length} Active Order{activeOrders.length > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-white/70 mt-0.5 truncate">
                  {activeOrders.map((o: any) => `#${o.id?.slice(-6).toUpperCase()}`).join(" · ")}
                </p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm text-white font-extrabold text-xs px-3 py-2 rounded-xl flex-shrink-0">
                Track →
              </div>
            </div>
          </Link>
        )}

        {/* Vendor Notice Banner */}
        {config.content.vendorNotice && (
          <VendorNoticeBanner message={config.content.vendorNotice} />
        )}
        {/* Desktop wallet bar */}
        <div className="hidden md:flex items-center gap-4 px-6 py-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl text-white shadow-sm mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-orange-100 text-xs font-medium">{T("walletBalance")}</p>
              {user?.isVerified && (
                <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-full">✓ Verified</span>
              )}
            </div>
            <p className="text-3xl font-extrabold">{fc(user?.walletBalance ?? "0")}</p>
          </div>
          <div className="text-center border-l border-white/20 pl-4">
            <p className="text-orange-100 text-xs font-medium">{T("commission")}</p>
            <p className="text-3xl font-extrabold">{Math.round(100 - (config.platform.vendorCommissionPct ?? DEFAULT_COMMISSION_PCT))}%</p>
          </div>
          <div className="text-right border-l border-white/20 pl-4">
            <p className="text-orange-100 text-xs font-medium">{T("allTimeEarned")}</p>
            <p className="text-xl font-extrabold">{fc(user?.stats?.totalRevenue || 0)}</p>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:mb-6">
          {statItems.map(s => (
            <div key={s.label} className={`${CARD} p-4 md:p-5`}>
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center text-xl mb-3`}>{s.icon}</div>
              <p className={`${STAT_VAL} ${s.color} text-xl md:text-2xl`}>{s.value}</p>
              <p className={`${STAT_LBL}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Low Stock Alert */}
        {(stats?.lowStock ?? 0) > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 md:mb-6">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-red-700 text-sm">{stats.lowStock} Products Low on Stock</p>
              <p className="text-red-500 text-xs mt-0.5">Go to Products → update stock</p>
            </div>
          </div>
        )}

        {/* Pending Product Sync Badge */}
        {pendingProductCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 md:mb-6">
            <span className="text-2xl">⏳</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-amber-800 text-sm">
                {pendingProductCount} product change{pendingProductCount > 1 ? "s" : ""} pending sync
              </p>
              <p className="text-amber-600 text-xs mt-0.5">Go online to sync your product updates</p>
            </div>
            <span className="text-xs font-bold bg-amber-200 text-amber-800 px-2.5 py-1 rounded-full flex-shrink-0">
              {pendingProductCount}
            </span>
          </div>
        )}

        {/* Delivery Access Status */}
        {(() => {
          const da = daStatus?.data ?? daStatus;
          if (!da || da.mode === "all") return null;
          const statuses: Record<string, { active: boolean; deliveryLabel?: string }> = da.statuses || {};
          const pendingReqs: any[] = da.pendingRequests || [];
          const pendingServiceTypes = new Set(pendingReqs.map((r: any) => r.serviceType || "all"));
          const anyActive = Object.values(statuses).some(s => s.active);
          const allPending = Object.keys(statuses).length > 0 &&
            !anyActive &&
            Object.keys(statuses).every(svc => pendingServiceTypes.has(svc) || pendingServiceTypes.has("all"));

          if (allPending) {
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 md:mb-6">
                <Truck className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm text-blue-800">Your delivery access request is under review</p>
                  <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">Admin is reviewing your request. You'll be notified once approved — no action needed right now.</p>
                </div>
              </div>
            );
          }

          return (
            <div className={`rounded-2xl overflow-hidden md:mb-6 ${
              anyActive ? "border border-blue-200" : "border border-amber-200"
            }`}>
              <div className={`px-4 py-3 flex items-center gap-3 ${
                anyActive ? "bg-blue-50" : "bg-amber-50"
              }`}>
                <Truck className={`w-5 h-5 ${anyActive ? "text-blue-600" : "text-amber-600"}`} />
                <p className={`font-bold text-sm flex-1 ${anyActive ? "text-blue-700" : "text-amber-700"}`}>
                  Delivery Access
                </p>
              </div>
              <div className="divide-y divide-gray-100 bg-white">
                {Object.entries(statuses).map(([svc, info]) => {
                  const hasPendingForService = pendingServiceTypes.has(svc) || pendingServiceTypes.has("all");
                  return (
                    <div key={svc} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-sm capitalize font-medium text-gray-700 flex-1">{svc}</span>
                      {info.active ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                          Active{info.deliveryLabel ? ` · ${info.deliveryLabel}` : ""}
                        </span>
                      ) : hasPendingForService ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                          ⏳ Pending review
                        </span>
                      ) : (
                        <button
                          onClick={() => requestDeliveryMut.mutate({ serviceType: svc, reason: `Requesting ${svc} delivery access` })}
                          disabled={requestDeliveryMut.isPending}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-60"
                        >
                          Request
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Quick Actions */}
        <QuickActions />

        {/* Weekly Store Schedule Editor */}
        <ScheduleEditor
          storeHours={(user as any)?.storeHours}
          onSave={saveSchedule}
          saving={schedSaving}
        />

        {/* ── Desktop: 2-column layout for orders ── */}
        <div className="md:grid md:grid-cols-2 md:gap-6 space-y-4 md:space-y-0">
          {/* Pending Orders */}
          <div>
            {pendingOrders.length > 0 ? (
              <div className={CARD}>
                <div className="px-4 py-3.5 border-b border-orange-100 bg-orange-50 flex items-center gap-2">
                  <span className="text-lg">🔔</span>
                  <div>
                    <p className="font-bold text-orange-800 text-sm">{pendingOrders.length} {T("newOrders")}!</p>
                    <p className="text-orange-500 text-xs">{T("acceptWithinTime")}</p>
                  </div>
                </div>
                <div className="divide-y divide-gray-50">
                  {pendingOrders.map((o: any) => {
                    const isOrderPending = pendingOrderIds.has(o.id);
                    return (
                    <div key={o.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-xl flex-shrink-0">
                        {o.type === "food" ? "🍔" : "🛒"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-800 capitalize">{o.type}</p>
                        <p className="text-xs text-gray-400 font-mono">#{o.id.slice(-6).toUpperCase()} · {fc(o.total)}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => setAcceptDialog({ orderId: o.id, total: o.total })} disabled={isOrderPending}
                          className="h-9 px-4 bg-green-500 text-white text-xs font-bold rounded-xl android-press min-h-0 disabled:opacity-60">✓ Accept</button>
                        <button onClick={() => { cancelReasonRef.current = ""; setCancelDialog({ orderId: o.id }); }} disabled={isOrderPending}
                          className="h-9 px-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl android-press min-h-0 disabled:opacity-60">✕</button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={`${CARD} px-4 py-10 text-center`}>
                <p className="text-4xl mb-2">📋</p>
                <p className="font-bold text-gray-500 text-sm">{T("noNewOrders")}</p>
                <p className="text-xs text-gray-400 mt-1">{T("newOrdersAppearHere")}</p>
              </div>
            )}
          </div>

          {/* Active Orders */}
          <div>
            {activeOrders.length > 0 ? (
              <div className={CARD}>
                <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-bold text-gray-800 text-sm">{activeOrders.length} {T("activeOrders")}</p>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{T("inProgress")}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {activeOrders.map((o: any) => (
                    <div key={o.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-gray-800 capitalize">{o.type}</p>
                        <p className="text-xs text-gray-400 font-mono">#{o.id.slice(-6).toUpperCase()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm text-gray-800">{fc(o.total)}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          o.status === "preparing" ? "bg-purple-100 text-purple-700" :
                          o.status === "ready" ? "bg-indigo-100 text-indigo-700" : "bg-blue-100 text-blue-700"
                        }`}>{o.status.toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`${CARD} px-4 py-10 text-center`}>
                <p className="text-4xl mb-2">🍳</p>
                <p className="font-bold text-gray-500 text-sm">{T("noActiveOrdersLabel")}</p>
                <p className="text-xs text-gray-400 mt-1">{T("activeOrdersShowHere")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Commission Banner — mobile only (desktop shows in header) */}
        <div className="md:hidden bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-4 text-white shadow-sm">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-orange-100 font-medium">{T("yourCommission")}</p>
              <p className="text-4xl font-extrabold">{Math.round(100 - (config.platform.vendorCommissionPct ?? DEFAULT_COMMISSION_PCT))}%</p>
              <p className="text-xs text-orange-100 mt-0.5">{T("ofEveryOrder")}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-orange-100">{T("allTimeEarned")}</p>
              <p className="text-2xl font-extrabold">{fc(user?.stats?.totalRevenue || 0)}</p>
            </div>
          </div>
        </div>

        {/* Notifications Section */}
        <NotificationsSection />

        {/* Active Tracker Banner — bottom position */}
        {config.content.trackerBannerEnabled && config.content.trackerBannerPosition === "bottom" && activeOrders.length > 0 && (
          <Link href="/orders"
            className="block bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl px-4 py-3.5 shadow-lg shadow-orange-200 active:scale-[0.98] transition-transform mt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-white tracking-tight">
                  {activeOrders.length} Active Order{activeOrders.length > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-white/70 mt-0.5 truncate">
                  {activeOrders.map((o: any) => `#${o.id?.slice(-6).toUpperCase()}`).join(" · ")}
                </p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm text-white font-extrabold text-xs px-3 py-2 rounded-xl flex-shrink-0">
                Track →
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Live Tracking disabled notice — dismissable once per session */}
      <LiveTrackingNotice liveTracking={config.features.liveTracking} T={T} />

      {/* Accept order confirmation dialog */}
      {acceptDialog && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setAcceptDialog(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-gray-800 mb-1">{T("acceptOrder")}?</h3>
            <p className="text-sm text-gray-500 mb-4">{T("reviewConfirm")} ({fc(acceptDialog.total)})</p>
            <div className="flex gap-3">
              <button onClick={() => setAcceptDialog(null)} className="flex-1 h-11 border-2 border-gray-200 text-gray-600 font-bold rounded-xl text-sm">← {T("back")}</button>
              <button
                onClick={() => {
                  orderActionMut.mutate({ orderId: acceptDialog.orderId, status: "confirmed" });
                  setAcceptDialog(null);
                }}
                className="flex-1 h-11 bg-green-500 text-white font-bold rounded-xl text-sm">
                ✓ {T("confirmLabel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel order dialog with reason */}
      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setCancelDialog(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-extrabold text-gray-800 mb-1">{T("cancelOrder")}</h3>
            <p className="text-sm text-gray-500 mb-4">{T("cancelConfirmMsg")}</p>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-1.5">{T("reason")} ({T("noteOptional")})</label>
            <textarea
              rows={3}
              defaultValue={cancelReasonRef.current}
              onChange={e => { cancelReasonRef.current = e.target.value; }}
              placeholder="e.g. Item not available, store closing..."
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 resize-none mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setCancelDialog(null)} className="flex-1 h-11 border-2 border-gray-200 text-gray-600 font-bold rounded-xl text-sm">← {T("back")}</button>
              <button
                onClick={() => {
                  orderActionMut.mutate({ orderId: cancelDialog.orderId, status: "cancelled", reason: cancelReasonRef.current || undefined });
                  setCancelDialog(null);
                }}
                className="flex-1 h-11 bg-red-500 text-white font-bold rounded-xl text-sm">
                ✕ {T("cancelConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Support FAB (only when feature_chat is on) */}
      {config.features.chat && (
        <a href={`https://wa.me/${config.platform.supportPhone.replace(/^0/, "92")}`} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-24 right-4 z-50 w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all active:scale-95 md:bottom-6"
          title={config.content.supportMsg || "Live Support"}>
          💬
        </a>
      )}

      {toast && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center toast-in"
          style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)", paddingLeft: "16px", paddingRight: "16px" }}>
          <div className="bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl max-w-sm w-full text-center">{toast}</div>
        </div>
      )}
    </PullToRefresh>
  );
}
