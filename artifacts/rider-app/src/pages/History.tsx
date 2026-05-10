import { formatCurrency as _sharedFcH } from "@workspace/api-zod";
import { useState, useCallback } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Package, Bike, Car, UtensilsCrossed,
  ShoppingCart, CreditCard, Calendar, RefreshCw,
} from "lucide-react";
import { api } from "../lib/api";
import { usePlatformConfig, formatDateTz } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual } from "@workspace/i18n";
import { PullToRefresh } from "../components/PullToRefresh";

function formatDate(d: string | Date, tz?: string) {
  return formatDateTz(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, tz ?? "Asia/Karachi");
}

function formatCurrency(n: string | number | null | undefined) { return _sharedFcH(n != null ? String(n) : (n as null | undefined)); }

type FilterPeriod = "today" | "week" | "all";
type FilterKind   = "all" | "order" | "ride";

type HistoryItem = {
  id: string; kind: "order" | "ride"; type: string;
  status: string; earnings: number; amount: number;
  address?: string; createdAt: string; proofPhoto?: string;
  origin?: string; destination?: string;
  fare?: number; distance?: string | number; duration?: number;
};

const PAGE_SIZE = 50;

export default function History() {
  const [period, setPeriod] = useState<FilterPeriod>("all");
  const [kind,   setKind]   = useState<FilterKind>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { language } = useLanguage();
  const T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone ?? "Asia/Karachi";
  const qc = useQueryClient();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isFetching,
  } = useInfiniteQuery({
    queryKey: ["rider-history"],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      api.getHistory({ limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam: number) =>
      lastPage.hasMore ? lastPageParam + PAGE_SIZE : undefined,
    refetchInterval: false,
  });

  /* Accumulate all loaded pages into a flat list */
  const raw: HistoryItem[] = data?.pages.flatMap(p => p.history) ?? [];

  const now      = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const weekStart = weekStartDate;

  /* Client-side filters applied to accumulated pages */
  const filtered = raw.filter(item => {
    const d = new Date(item.createdAt);
    if (period === "today" && d < todayStart) return false;
    if (period === "week"  && d < weekStart)  return false;
    if (kind === "order"   && item.kind !== "order") return false;
    if (kind === "ride"    && item.kind !== "ride")  return false;
    return true;
  });

  const totalEarnings  = filtered.reduce((s, i) => s + (i.earnings || 0), 0);
  const completedItems = filtered.filter(i => i.status === "delivered" || i.status === "completed");
  const cancelledItems = filtered.filter(i => i.status === "cancelled");

  const PERIOD_TABS: { key: FilterPeriod; label: string }[] = [
    { key: "today", label: T("today") },
    { key: "week",  label: T("thisWeek") },
    { key: "all",   label: T("all") },
  ];
  type KindTab = { key: FilterKind; label: string; icon: React.ReactElement };
  const KIND_TABS: KindTab[] = [
    { key: "all",   label: T("all"),    icon: <ClipboardList size={12}/> },
    { key: "order", label: T("orders"), icon: <Package size={12}/>       },
    { key: "ride",  label: T("rides"),  icon: <Bike size={12}/>          },
  ];

  function ItemIcon({ kind, type }: { kind: string; type: string }) {
    if (kind === "ride") {
      return type === "bike"
        ? <Bike size={20} className="text-green-600"/>
        : <Car  size={20} className="text-green-600"/>;
    }
    if (type === "food") return <UtensilsCrossed size={20} className="text-blue-600"/>;
    if (type === "mart") return <ShoppingCart    size={20} className="text-blue-600"/>;
    return                      <Package         size={20} className="text-blue-600"/>;
  }

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["rider-history"] });
  }, [qc]);

  const totalLoaded = raw.length;

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen bg-[#F5F6F8]">
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-green-500/[0.04]"/>
        <div className="absolute bottom-10 -left-16 w-56 h-56 rounded-full bg-white/[0.02]"/>
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">
                <Calendar size={11} className="inline mr-1"/> {totalLoaded} {T("totalRecords")}
              </p>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">{T("history")}</h1>
            </div>
            <button onClick={() => { refetch(); }} disabled={isFetching}
              className="w-10 h-10 rounded-2xl bg-white/[0.08] border border-white/[0.06] flex items-center justify-center disabled:opacity-50 transition-opacity active:bg-white/[0.12]">
              <RefreshCw size={16} className={`text-white/60 ${isFetching ? "animate-spin" : ""}`}/>
            </button>
          </div>

          {!isLoading && (
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-3 text-center border border-white/[0.06]">
                <p className="text-lg font-extrabold text-white">{formatCurrency(totalEarnings)}</p>
                <p className="text-[9px] text-white/30 font-semibold mt-0.5 uppercase tracking-wider">{T("earnings")}</p>
              </div>
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-3 text-center border border-white/[0.06]">
                <p className="text-lg font-extrabold text-white">{completedItems.length}</p>
                <p className="text-[9px] text-white/30 font-semibold mt-0.5 uppercase tracking-wider">{T("completed")}</p>
              </div>
              <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-3 text-center border border-white/[0.06]">
                <p className="text-lg font-extrabold text-red-400">{cancelledItems.length}</p>
                <p className="text-[9px] text-white/30 font-semibold mt-0.5 uppercase tracking-wider">{T("cancelled")}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3 sticky top-0 bg-[#F5F6F8] pb-2 z-10">
        <div className="flex bg-white rounded-full p-1 shadow-sm gap-1 border border-gray-100">
          {PERIOD_TABS.map(tab => (
            <button key={tab.key} onClick={() => setPeriod(tab.key)}
              className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all ${period === tab.key ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {KIND_TABS.map(tab => (
            <button key={tab.key} onClick={() => setKind(tab.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${kind === tab.key ? "bg-gray-900 text-white shadow-sm" : "bg-white text-gray-500 border border-gray-200"}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {isLoading ? (
          [1,2,3,4,5].map(i => (
            <div key={i} className="bg-white rounded-3xl border border-gray-100 p-4 flex items-center gap-3 animate-pulse">
              <div className="w-10 h-10 rounded-2xl bg-gray-100 flex-shrink-0"/>
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-gray-200 rounded-full w-32"/>
                <div className="h-2.5 bg-gray-100 rounded-full w-24"/>
              </div>
              <div className="space-y-1.5 items-end flex flex-col">
                <div className="h-3.5 bg-gray-200 rounded-full w-16"/>
                <div className="h-5 bg-gray-100 rounded-full w-14"/>
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-3">
              <ClipboardList size={32} className="text-gray-300"/>
            </div>
            <p className="font-bold text-gray-700 text-base">{T("noRecordsFound")}</p>
            <p className="text-gray-400 text-sm mt-1">
              {period !== "all" ? T("widerTimePeriod") : T("deliveriesAppearHere")}
            </p>
          </div>
        ) : (
          (() => {
            const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
            const getGroup = (d: Date) => {
              if (d >= todayStart) return T("today");
              if (d >= yesterdayStart) return T("yesterday");
              if (d >= weekStart) return T("thisWeek");
              return T("earlier");
            };
            let lastGroup = "";
            return filtered.map((item: HistoryItem) => {
              const d = new Date(item.createdAt);
              const group = getGroup(d);
              const showHeader = group !== lastGroup;
              lastGroup = group;
              const completed = item.status === "delivered" || item.status === "completed";
              const cancelled = item.status === "cancelled";
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id}>
                  {showHeader && (
                    <div className="flex items-center gap-2 pt-2 pb-1">
                      <Calendar size={12} className="text-gray-400"/>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{group}</p>
                      <div className="flex-1 h-px bg-gray-200"/>
                    </div>
                  )}
                  <div
                    className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100 active:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  >
                    <div className="p-4 flex items-center gap-3.5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${item.kind === "ride" ? "bg-green-50" : "bg-blue-50"}`}>
                        <ItemIcon kind={item.kind} type={item.type}/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-800 capitalize text-[15px]">
                          {item.kind === "ride" ? `${item.type} ${T("ride")}` : `${item.type} ${T("deliveryLabel")}`}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{item.address || "—"}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(item.createdAt, tz)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {completed ? (
                          <p className="font-extrabold text-green-600 text-[15px]">+{formatCurrency(item.earnings || 0)}</p>
                        ) : (
                          <p className="font-bold text-gray-400">{formatCurrency(item.amount || 0)}</p>
                        )}
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full mt-1 inline-block ${
                          completed  ? "bg-green-100 text-green-700" :
                          cancelled  ? "bg-red-100 text-red-600"     :
                                       "bg-gray-100 text-gray-600"
                        }`}>
                          {item.status.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-gray-50/50">
                        {item.kind === "ride" ? (
                          <>
                            {item.origin && (
                              <div className="flex items-start gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-16 flex-shrink-0">From</span>
                                <span className="text-xs text-gray-600 font-medium flex-1">{item.origin}</span>
                              </div>
                            )}
                            {item.destination && (
                              <div className="flex items-start gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-16 flex-shrink-0">To</span>
                                <span className="text-xs text-gray-600 font-medium flex-1">{item.destination}</span>
                              </div>
                            )}
                            {item.fare != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">Fare</span>
                                <span className="text-xs text-gray-700 font-semibold">{formatCurrency(item.fare)}</span>
                              </div>
                            )}
                            {item.distance != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">Distance</span>
                                <span className="text-xs text-gray-700 font-semibold">
                                  {typeof item.distance === "number" ? `${parseFloat(String(item.distance)).toFixed(1)} km` : `${parseFloat(String(item.distance)).toFixed(1)} km`}
                                </span>
                              </div>
                            )}
                            {item.duration != null && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">Duration</span>
                                <span className="text-xs text-gray-700 font-semibold">{item.duration} min</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">Status</span>
                              <span className="text-xs text-gray-700 font-semibold capitalize">{item.status.replace(/_/g, " ")}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">Date</span>
                              <span className="text-xs text-gray-600">{formatDate(item.createdAt, tz)}</span>
                            </div>
                            {(completed || cancelled) && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">{T("earnings")}</span>
                                <span className={`text-xs font-extrabold ${completed ? "text-green-600" : "text-gray-400"}`}>
                                  {completed ? `+${formatCurrency(item.earnings || 0)}` : "—"}
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {item.address && (
                              <div className="flex items-start gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5 w-16 flex-shrink-0">Address</span>
                                <span className="text-xs text-gray-600 font-medium flex-1">{item.address}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">Status</span>
                              <span className="text-xs text-gray-700 font-semibold capitalize">{item.status.replace(/_/g, " ")}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">Date</span>
                              <span className="text-xs text-gray-600">{formatDate(item.createdAt, tz)}</span>
                            </div>
                            {(completed || cancelled) && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider w-16 flex-shrink-0">{T("earnings")}</span>
                                <span className={`text-xs font-extrabold ${completed ? "text-green-600" : "text-gray-400"}`}>
                                  {completed ? `+${formatCurrency(item.earnings || 0)}` : "—"}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                        {item.proofPhoto && completed && item.kind === "order" && (
                          <div className="flex items-start gap-2 pt-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1 w-16 flex-shrink-0">Proof</span>
                            <a href={item.proofPhoto} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-gray-200 shadow-sm hover:opacity-90 transition-opacity">
                              <img
                                src={item.proofPhoto}
                                alt="Delivery proof"
                                className="w-32 h-24 object-cover"
                                loading="lazy"
                              />
                            </a>
                          </div>
                        )}
                      </div>
                    )}
                    {!isExpanded && completed && item.earnings > 0 && (
                      <div className="px-4 pb-3">
                        <div className="bg-green-50 rounded-xl px-3.5 py-2 flex items-center justify-between border border-green-100">
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1.5"><CreditCard size={12}/> {T("earningsCredited")}</span>
                          <span className="text-xs font-extrabold text-green-700">{formatCurrency(item.earnings)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            });
          })()
        )}

        {/* Show more button — fetches the next page from the server */}
        {!isLoading && hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-3 text-sm font-bold text-gray-600 bg-white rounded-2xl border border-gray-200 shadow-sm active:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {isFetchingNextPage ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={14} className="animate-spin"/> {T("loading") || "Loading…"}
              </span>
            ) : (
              T("showMore")
            )}
          </button>
        )}
      </div>
    </PullToRefresh>
  );
}
