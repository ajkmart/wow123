import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Bell, Package, Wallet, Bike, Settings, AlertTriangle,
  RefreshCw, CheckCheck, ChevronRight, Check, Inbox,
  Clock, Sparkles, Eye, Filter, Zap, Shield,
  TrendingUp, X,
} from "lucide-react";
import { api } from "../lib/api";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PullToRefresh } from "../components/PullToRefresh";

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded-xl ${className || ""}`} />;
}

function SkeletonNotifications() {
  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-green-500/[0.04]"/>
        <div className="absolute bottom-10 -left-16 w-56 h-56 rounded-full bg-white/[0.02]"/>
        <div className="relative flex items-center justify-between mb-4">
          <div className="space-y-2">
            <SkeletonBlock className="h-7 w-36 !bg-white/10" />
            <SkeletonBlock className="h-4 w-28 !bg-white/10" />
          </div>
          <div className="flex gap-2">
            <SkeletonBlock className="w-10 h-10 rounded-xl !bg-white/[0.06]" />
            <SkeletonBlock className="w-24 h-10 rounded-xl !bg-white/[0.06]" />
          </div>
        </div>
        <div className="relative grid grid-cols-4 gap-2.5 mt-3">
          {[1,2,3,4].map(i => (
            <SkeletonBlock key={i} className="h-20 rounded-2xl !bg-white/[0.06]" />
          ))}
        </div>
      </div>
      <div className="px-4 py-4 space-y-3">
        <div className="flex gap-2">
          {[1,2,3,4,5].map(i => (
            <SkeletonBlock key={i} className="h-10 w-24 flex-shrink-0 rounded-full" />
          ))}
        </div>
        {[1,2,3,4,5].map(i => (
          <div key={i} className="bg-white rounded-3xl border border-gray-100 p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex-shrink-0"/>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-3/4"/>
                <div className="h-3 bg-gray-50 rounded w-full"/>
                <div className="flex gap-2">
                  <div className="h-3 bg-gray-50 rounded w-16"/>
                  <div className="h-3 bg-gray-50 rounded w-12"/>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const fd = (d: string | Date) => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(d).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

type DateGroupKey = "today" | "yesterday" | "thisWeek" | "earlier";
function dateGroupKey(d: string): DateGroupKey {
  const now = new Date();
  const dt  = new Date(d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (dt >= today) return "today";
  if (dt >= yesterday) return "yesterday";
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  if (dt >= weekAgo) return "thisWeek";
  return "earlier";
}

type NFilter = "all" | "order" | "wallet" | "ride" | "system";

type NotifRecord = {
  id: string; type: string; title: string; body: string;
  isRead: boolean; createdAt: string; status?: string;
};

type NotifQueryData = {
  notifications: NotifRecord[];
  unread: number;
  total?: number;
};

type TypeInfo = {
  icon: React.ReactElement;
  label: string;
  gradient: string;
  badge: string;
  iconBg: string;
  dotColor: string;
};

function typeInfo(type: string): TypeInfo {
  if (type === "order")  return { icon: <Package  size={20} className="text-white"/>,   label: "Order",  gradient: "from-blue-500 to-indigo-600",   badge: "bg-blue-100 text-blue-700",   iconBg: "bg-gradient-to-br from-blue-500 to-indigo-600",   dotColor: "bg-blue-500"  };
  if (type === "wallet") return { icon: <Wallet   size={20} className="text-white"/>,  label: "Wallet", gradient: "from-green-500 to-emerald-600",  badge: "bg-green-100 text-green-700",  iconBg: "bg-gradient-to-br from-green-500 to-emerald-600",  dotColor: "bg-green-500" };
  if (type === "ride")   return { icon: <Bike     size={20} className="text-white"/>, label: "Ride",   gradient: "from-purple-500 to-violet-600", badge: "bg-purple-100 text-purple-700", iconBg: "bg-gradient-to-br from-purple-500 to-violet-600", dotColor: "bg-purple-500"};
  if (type === "system") return { icon: <Settings size={20} className="text-white"/>,   label: "System", gradient: "from-gray-500 to-slate-600",    badge: "bg-gray-100 text-gray-600",    iconBg: "bg-gradient-to-br from-gray-500 to-slate-600",    dotColor: "bg-gray-500"  };
  if (type === "alert")  return { icon: <AlertTriangle size={20} className="text-white"/>, label: "Alert", gradient: "from-amber-500 to-orange-600", badge: "bg-amber-100 text-amber-700", iconBg: "bg-gradient-to-br from-amber-500 to-orange-600", dotColor: "bg-amber-500" };
  return                        { icon: <Bell     size={20} className="text-white"/>,   label: "Other",  gradient: "from-gray-500 to-slate-600",    badge: "bg-gray-100 text-gray-600",    iconBg: "bg-gradient-to-br from-gray-500 to-slate-600",    dotColor: "bg-gray-500"  };
}

function navTarget(type: string, status?: string): string | null {
  /* Completed order/ride notifications → history; active → active */
  const isCompleted = status === "delivered" || status === "completed" || status === "cancelled";
  if (type === "order")  return isCompleted ? "/history" : "/active";
  if (type === "ride")   return isCompleted ? "/history" : "/active";
  if (type === "wallet") return "/wallet";
  return null;
}

const STAT_CONFIGS = [
  { label: "Total",  key: "total",  icon: <Bell size={14} className="text-white/50"/> },
  { label: "Orders", key: "order",  icon: <Package size={14} className="text-blue-300"/> },
  { label: "Wallet", key: "wallet", icon: <Wallet size={14} className="text-green-300"/> },
  { label: "Rides",  key: "ride",   icon: <Bike size={14} className="text-purple-300"/> },
];

export default function Notifications() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<NFilter>("all");
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rider-notifications"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 30000,
  });

  const notifs: NotifRecord[] = data?.notifications || [];
  const unread: number = data?.unread || 0;

  const [toast, setToast] = useState("");
  const [toastIsError, setToastIsError] = useState(false);
  const showToast = (m: string, isError = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(m); setToastIsError(isError);
    toastTimerRef.current = setTimeout(() => setToast(""), 3000);
  };

  const markAllMut = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rider-notifications"] });
      qc.invalidateQueries({ queryKey: ["rider-notifs-count"] });
      showToast("All notifications marked as read");
    },
    onError: (err: Error) => showToast(err.message || "Failed to mark all as read", true),
  });

  const markOneMut = useMutation({
    mutationFn: (id: string) => api.markOneRead(id),
    onMutate: async (id: string) => {
      /* Optimistic cache update: mark notification as read immediately */
      await qc.cancelQueries({ queryKey: ["rider-notifications"] });
      const prev = qc.getQueryData<NotifQueryData>(["rider-notifications"]);
      if (prev) {
        qc.setQueryData<NotifQueryData>(["rider-notifications"], (old) => {
          if (!old) return old;
          const updated = old.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n);
          const unreadCount = updated.filter((n) => !n.isRead).length;
          return { ...old, notifications: updated, unread: unreadCount };
        });
      }
      return { prev };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rider-notifications"] });
      qc.invalidateQueries({ queryKey: ["rider-notifs-count"] });
    },
    onError: (err: Error, _id: string, ctx: { prev: NotifQueryData | undefined } | undefined) => {
      /* Revert optimistic update on error */
      if (ctx?.prev) qc.setQueryData(["rider-notifications"], ctx.prev);
      showToast(err.message || "Failed to mark as read", true);
    },
  });

  const DATE_GROUP_LABELS: Record<DateGroupKey, string> = {
    today: T("today"),
    yesterday: T("yesterday"),
    thisWeek: T("thisWeek"),
    earlier: T("earlier"),
  };

  const FILTER_TABS: { key: NFilter; labelKey: TranslationKey; icon: React.ReactElement }[] = [
    { key: "all",    labelKey: "all",           icon: <Bell size={14}/>     },
    { key: "order",  labelKey: "orders",         icon: <Package size={14}/>  },
    { key: "wallet", labelKey: "wallet",         icon: <Wallet size={14}/>   },
    { key: "ride",   labelKey: "rides",          icon: <Bike size={14}/>     },
    { key: "system", labelKey: "system",          icon: <Settings size={14}/> },
  ];

  const filtered = filter === "all" ? notifs : notifs.filter(n => n.type === filter || (filter === "system" && !["order","wallet","ride"].includes(n.type)));

  const grouped = useMemo(() => {
    const groups: { key: DateGroupKey; label: string; items: NotifRecord[] }[] = [];
    const groupMap = new Map<DateGroupKey, NotifRecord[]>();
    for (const n of filtered) {
      const gKey = dateGroupKey(n.createdAt);
      if (!groupMap.has(gKey)) {
        const items: typeof filtered = [];
        groupMap.set(gKey, items);
        groups.push({ key: gKey, label: DATE_GROUP_LABELS[gKey], items });
      }
      groupMap.get(gKey)?.push(n);
    }
    return groups;
  }, [filtered, language]);

  const filterCounts = useMemo(() => ({
    all:    notifs.filter(n => !n.isRead).length,
    order:  notifs.filter(n => n.type === "order" && !n.isRead).length,
    wallet: notifs.filter(n => n.type === "wallet" && !n.isRead).length,
    ride:   notifs.filter(n => n.type === "ride" && !n.isRead).length,
    system: notifs.filter(n => !["order","wallet","ride"].includes(n.type) && !n.isRead).length,
  }), [notifs]);

  const statValues: Record<string, number> = {
    total:  notifs.length,
    order:  notifs.filter(n => n.type === "order").length,
    wallet: notifs.filter(n => n.type === "wallet").length,
    ride:   notifs.filter(n => n.type === "ride").length,
  };

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["rider-notifications"] });
  }, [qc]);

  if (isLoading) return <SkeletonNotifications />;

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen bg-[#F5F6F8]">

      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-green-500/[0.04]"/>
        <div className="absolute bottom-10 -left-16 w-56 h-56 rounded-full bg-white/[0.02]"/>
        <div className="absolute top-1/2 left-1/3 w-24 h-24 rounded-full bg-white/[0.015]"/>

        <div className="relative flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-8 h-8 bg-white/[0.06] backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/[0.06]">
                <Bell size={16} className="text-white"/>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight">{T("notificationsTitle")}</h1>
            </div>
            <p className="text-white/40 text-sm font-medium flex items-center gap-2">
              {unread > 0 ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"/>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"/>
                  </span>
                  {unread} unread notification{unread !== 1 ? "s" : ""}
                </>
              ) : (
                <><Sparkles size={14} className="text-green-300"/> {T("allCaughtUp")}</>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetch()}
              className="h-10 w-10 bg-white/[0.06] backdrop-blur-sm text-white rounded-xl flex items-center justify-center border border-white/[0.06] active:bg-white/10 transition-colors">
              <RefreshCw size={16}/>
            </button>
            {unread > 0 && (
              <button onClick={() => markAllMut.mutate()} disabled={markAllMut.isPending}
                className="h-10 px-4 bg-white/[0.06] backdrop-blur-sm text-white text-sm font-bold rounded-xl flex items-center gap-1.5 border border-white/[0.06] active:bg-white/10 transition-colors disabled:opacity-60">
                <CheckCheck size={15}/> {T("readAll")}
              </button>
            )}
          </div>
        </div>

        {notifs.length > 0 && (
          <div className="relative grid grid-cols-4 gap-2.5">
            {STAT_CONFIGS.map((s, i) => (
              <div key={s.key}
                className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-3 text-center border border-white/[0.06]"
                style={{ animationDelay: `${i * 80}ms`, animation: "slideUp 0.4s ease-out both" }}>
                <div className="flex justify-center mb-1.5">{s.icon}</div>
                <p className="text-xl font-black text-white">{statValues[s.key]}</p>
                <p className="text-[9px] text-white/30 mt-0.5 font-bold uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {FILTER_TABS.map(tab => (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-full text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                filter === tab.key
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-white text-gray-500 border border-gray-200 active:bg-gray-50"
              }`}>
              {tab.icon} {T(tab.labelKey)}
              {filterCounts[tab.key] > 0 && (
                <span className={`text-[9px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${
                  filter === tab.key ? "bg-white/20 text-white" : "bg-red-500 text-white shadow-sm"
                }`}>
                  {filterCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 px-4 py-20 text-center animate-[fadeIn_0.4s_ease-out]">
            <div className="w-24 h-24 bg-gradient-to-br from-gray-50 to-gray-100 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner border border-gray-200/50">
              <Inbox size={44} className="text-gray-300"/>
            </div>
            <p className="font-black text-gray-700 text-xl">
              {filter === "all" ? T("noNotificationsYet") : `${T("noNotifications")}`}
            </p>
            <p className="text-sm text-gray-400 mt-2.5 max-w-[260px] mx-auto leading-relaxed">
              {filter === "all" ? T("orderAlertsAppearHere") : T("tryDifferentFilter")}
            </p>
            {filter !== "all" && (
              <button onClick={() => setFilter("all")}
                className="mt-5 bg-gray-900 text-white px-6 py-3 rounded-full text-sm font-bold flex items-center gap-2 mx-auto active:scale-[0.97] transition-transform shadow-sm">
                <Eye size={14}/> View All Notifications
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map((group, gi) => (
              <div key={group.label} style={{ animationDelay: `${gi * 100}ms`, animation: "slideUp 0.4s ease-out both" }}>
                <div className="flex items-center gap-3 mb-3 px-1">
                  <div className="flex items-center gap-1.5">
                    <Clock size={11} className="text-gray-400"/>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{group.label}</p>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent"/>
                  <span className="text-[10px] text-gray-400 font-bold bg-gray-100 px-2 py-0.5 rounded-full">{group.items.length}</span>
                </div>
                <div className="space-y-2.5">
                  {group.items.map((n: NotifRecord, ni: number) => {
                    const info = typeInfo(n.type);
                    const dest = navTarget(n.type, n.status);
                    return (
                      <div key={n.id}
                        className={`bg-white rounded-3xl border overflow-hidden transition-all duration-300 cursor-pointer ${
                          !n.isRead
                            ? "border-l-4 border-l-green-500 border-r border-t border-b border-r-gray-100 border-t-gray-100 border-b-gray-100 shadow-lg shadow-green-100/50"
                            : "border-gray-100 shadow-sm"
                        }`}
                        onClick={() => { if (!n.isRead) markOneMut.mutate(n.id); if (dest) navigate(dest); }}
                        style={{ animationDelay: `${(gi * 100) + (ni * 50)}ms`, animation: "slideUp 0.4s ease-out both" }}>
                        <div className="px-4 py-4 flex gap-3.5">
                          <div className="relative flex-shrink-0">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${
                              !n.isRead ? info.iconBg : "bg-gray-100"
                            }`}>
                              {!n.isRead ? info.icon : <Bell size={20} className="text-gray-400"/>}
                            </div>
                            {!n.isRead && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
                                <div className="w-1.5 h-1.5 bg-white rounded-full"/>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-sm leading-snug ${!n.isRead ? "font-black text-gray-900" : "font-semibold text-gray-500"}`}>
                                {n.title}
                              </p>
                              {!n.isRead && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); markOneMut.mutate(n.id); }}
                                  className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center active:bg-green-100 transition-all flex-shrink-0 border border-green-100 hover:shadow-sm"
                                  title="Mark as read"
                                >
                                  <Check size={16}/>
                                </button>
                              )}
                            </div>
                            <p className={`text-xs mt-1.5 leading-relaxed line-clamp-2 ${!n.isRead ? "text-gray-600" : "text-gray-400"}`}>{n.body}</p>
                            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                              <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-full">
                                <Clock size={9}/> {fd(n.createdAt)}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.badge}`}>
                                {info.label}
                              </span>
                              {dest && (
                                <span className="text-[10px] text-gray-900 font-bold flex items-center gap-0.5 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                                  View <ChevronRight size={10}/>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-2.5 animate-[slideDown_0.3s_ease-out] max-w-[90vw] backdrop-blur-md ${toastIsError ? "bg-red-600/95 text-white" : "bg-gray-900/95 text-white"}`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${toastIsError ? "bg-red-500" : "bg-green-500"}`}>
            {toastIsError
              ? <AlertTriangle size={14} className="text-white"/>
              : <CheckCheck size={14} className="text-white"/>
            }
          </div>
          {toast}
        </div>
      )}
    </PullToRefresh>
  );
}
