import { formatCurrency as _sharedFcE } from "@workspace/api-zod";
import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Target, BarChart2, Star, TrendingUp, CheckCircle,
  Wallet, ClipboardList, CreditCard, ChevronDown, RefreshCw, Pencil, X,
  UtensilsCrossed, Package, Car,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { usePlatformConfig } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual } from "@workspace/i18n";
import { PullToRefresh } from "../components/PullToRefresh";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "../components/ui/accordion";

type Period = "today" | "week" | "month";

export default function Earnings() {
  const { user, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);
  const currency = config.platform.currencySymbol ?? "Rs.";
  const formatCurrency = (n: string | number | null | undefined) => _sharedFcE(n != null ? String(n) : (n as null | undefined), currency);
  const riderKeepPct = config.rider?.keepPct ?? config.finance.riderEarningPct;
  const [period, setPeriod] = useState<Period>("week");
  const qc = useQueryClient();

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["rider-earnings"],
    queryFn: () => api.getEarnings(),
    refetchInterval: 60000,
  });

  type PeriodBreakdown = { food: { earnings: number; count: number }; parcel: { earnings: number; count: number }; rides: { earnings: number; count: number } };
  type PeriodData = { earnings: number; deliveries: number; breakdown?: PeriodBreakdown };
  const periodData: PeriodData = data?.[period as keyof typeof data] as PeriodData || { earnings: 0, deliveries: 0 };

  const adminDailyGoal = config.rider?.dailyGoal ?? 0;
  const personalDailyGoal: number | null = data?.dailyGoal ?? user?.dailyGoal ?? null;
  const dailyGoal = personalDailyGoal ?? adminDailyGoal;
  const isPersonalGoal = personalDailyGoal !== null && personalDailyGoal !== undefined;

  const todayPct = dailyGoal > 0 ? Math.min(100, Math.round(((data?.today?.earnings || 0) / dailyGoal) * 100)) : 0;

  const totalDeliveries = user?.stats?.totalDeliveries || 0;
  const totalEarnings   = user?.stats?.totalEarnings   || 0;
  const avgPerDelivery  = periodData.deliveries > 0 ? periodData.earnings / periodData.deliveries : 0;

  const rating = user?.stats?.rating ?? 5;
  const ratingLabel = rating >= 4.8 ? "Excellent" : rating >= 4.5 ? "Very Good" : rating >= 4.0 ? "Good" : "Needs Work";

  const PERIOD_TABS: { key: Period; label: string }[] = [
    { key: "today", label: T("today") },
    { key: "week",  label: T("thisWeek") },
    { key: "month", label: T("thisMonth") },
  ];

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["rider-earnings"] });
  }, [qc]);

  const goalMutation = useMutation({
    mutationFn: (dailyGoalValue: number | null) =>
      api.updateProfile({ dailyGoal: dailyGoalValue }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["rider-earnings"] }),
        refreshUser().catch(() => {}),
      ]);
      setShowGoalModal(false);
    },
  });

  const openGoalModal = () => {
    setGoalInput(personalDailyGoal ? String(Math.round(personalDailyGoal)) : "");
    setShowGoalModal(true);
  };

  const handleSaveGoal = () => {
    const parsed = parseFloat(goalInput);
    if (goalInput.trim() === "") {
      goalMutation.mutate(null);
    } else if (!isNaN(parsed) && parsed > 0) {
      goalMutation.mutate(parsed);
    }
  };

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen bg-[#F5F6F8]">
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-green-500/[0.04]"/>
        <div className="absolute bottom-10 -left-16 w-56 h-56 rounded-full bg-white/[0.02]"/>
        <div className="relative">
          <p className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">{T("incomePerformance")}</p>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">{T("earnings")}</h1>

          <div className="mt-5 bg-white/[0.06] backdrop-blur-sm rounded-2xl border border-white/[0.06] p-4">
            <p className="text-white/40 text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5"><Wallet size={13}/> {T("walletBalance")}</p>
            <p className="text-[36px] font-black text-white mt-1 leading-tight">{formatCurrency(user?.walletBalance ?? "0")}</p>
            <p className="text-white/30 text-xs mt-1">{T("earningsAfterDelivery")}</p>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">

        <div className="flex bg-white rounded-full p-1 shadow-sm gap-1 border border-gray-100">
          {PERIOD_TABS.map(tab => (
            <button key={tab.key} onClick={() => setPeriod(tab.key)}
              className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all ${period === tab.key ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-2 animate-pulse">
                <div className="h-3 bg-gray-100 rounded-full w-16"/>
                <div className="h-8 bg-gray-200 rounded-full w-28"/>
                <div className="h-2.5 bg-gray-100 rounded-full w-20"/>
              </div>
              <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-2 animate-pulse">
                <div className="h-3 bg-gray-100 rounded-full w-16"/>
                <div className="h-8 bg-gray-200 rounded-full w-12"/>
                <div className="h-2.5 bg-gray-100 rounded-full w-16"/>
              </div>
            </div>
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm animate-pulse space-y-3">
              <div className="h-3 bg-gray-100 rounded-full w-24"/>
              <div className="h-3.5 bg-gray-200 rounded-full w-full"/>
              <div className="h-2.5 bg-gray-100 rounded-full w-28"/>
            </div>
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm animate-pulse">
              <div className="h-3 bg-gray-100 rounded-full w-24 mb-3"/>
              <div className="grid grid-cols-2 gap-3">
                {[0,1,2,3].map(i => (
                  <div key={i} className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <div className="h-6 bg-gray-200 rounded-full w-16 mx-auto"/>
                    <div className="h-2.5 bg-gray-100 rounded-full w-20 mx-auto"/>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : isError ? (
          <div className="bg-red-50 border border-red-100 rounded-3xl p-5 text-center">
            <p className="text-sm font-bold text-red-700">Could not load earnings data.</p>
            <p className="text-xs text-red-500 mt-1">Please check your connection and try again.</p>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["rider-earnings"] })}
              className="mt-3 flex items-center gap-1.5 mx-auto px-4 py-2 bg-red-100 text-red-700 text-xs font-bold rounded-xl active:bg-red-200 transition-colors"
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-900 rounded-3xl p-5 text-white shadow-sm">
              <p className="text-white/40 text-sm font-medium">{T("earnings")}</p>
              <p className="text-3xl font-extrabold mt-1">{formatCurrency(periodData.earnings)}</p>
              <p className="text-white/30 text-xs mt-1">{riderKeepPct}% {T("deliveries").toLowerCase()}</p>
            </div>
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
              <p className="text-sm text-gray-500 font-medium">{T("deliveries")}</p>
              <p className="text-3xl font-extrabold text-gray-900 mt-1">{periodData.deliveries}</p>
              <p className="text-xs text-gray-400 mt-1">{T("completedLabel")}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                <Target size={14} className="text-gray-900"/>
                {T("dailyGoal")}
                {isPersonalGoal && (
                  <span className="text-[9px] font-bold bg-gray-900 text-white rounded-full px-1.5 py-0.5 uppercase tracking-wider">{T("personalBadge")}</span>
                )}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Target: {formatCurrency(dailyGoal)}/day</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openGoalModal}
                className="p-1.5 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors active:bg-gray-300"
                aria-label="Edit daily goal"
              >
                <Pencil size={13}/>
              </button>
              <div className="text-right">
                <p className="text-lg font-extrabold text-gray-900">{todayPct}%</p>
                <p className="text-xs text-gray-400">{formatCurrency(data?.today?.earnings || 0)}</p>
              </div>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden">
            <div
              className={`h-3.5 rounded-full transition-all duration-700 ${todayPct >= 100 ? "bg-green-500" : todayPct >= 60 ? "bg-gray-700" : "bg-gray-400"}`}
              style={{ width: `${todayPct}%` }}
            />
          </div>
          {todayPct >= 100 ? (
            <p className="text-xs text-green-600 font-bold mt-2.5 flex items-center gap-1">
              <CheckCircle size={12}/> {T("dailyGoalReached")}
            </p>
          ) : (
            <p className="text-xs text-gray-400 mt-2.5">
              {formatCurrency(dailyGoal - (data?.today?.earnings || 0))} {T("moreToGoal")}
            </p>
          )}
        </div>

        <div className="bg-white rounded-3xl shadow-sm p-5 border border-gray-100">
          <p className="font-bold text-gray-800 text-sm mb-3.5 flex items-center gap-1.5"><BarChart2 size={14} className="text-gray-900"/> {T("performance")}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#F5F6F8] rounded-2xl p-4 text-center">
              <p className="text-2xl font-extrabold text-gray-900">{totalDeliveries}</p>
              <p className="text-xs text-gray-500 font-semibold mt-1 flex items-center justify-center gap-1"><ClipboardList size={11}/> {T("totalDeliveries")}</p>
            </div>
            <div className="bg-[#F5F6F8] rounded-2xl p-4 text-center">
              <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(avgPerDelivery)}</p>
              <p className="text-xs text-gray-500 font-semibold mt-1 flex items-center justify-center gap-1"><TrendingUp size={11}/> {T("avgPerDelivery")}</p>
            </div>
            <div className="bg-[#F5F6F8] rounded-2xl p-4 text-center">
              <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(totalEarnings)}</p>
              <p className="text-xs text-gray-500 font-semibold mt-1 flex items-center justify-center gap-1"><CreditCard size={11}/> {T("allTimeEarned")}</p>
            </div>
            <div className="bg-[#F5F6F8] rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-1">
                <p className="text-2xl font-extrabold text-gray-900">{rating.toFixed(1)}</p>
                <Star size={18} className="fill-yellow-400 text-yellow-400"/>
              </div>
              <p className="text-xs text-gray-500 font-semibold mt-1">{ratingLabel}</p>
            </div>
          </div>
        </div>

        {!isLoading && !isError && periodData.breakdown && (
          <div className="bg-white rounded-3xl shadow-sm p-5 border border-gray-100">
            <p className="font-bold text-gray-800 text-sm mb-3.5 flex items-center gap-1.5">
              <BarChart2 size={14} className="text-gray-900"/> By Service Type
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Food",   icon: <UtensilsCrossed size={16} className="text-orange-500"/>, earnings: periodData.breakdown.food.earnings,   count: periodData.breakdown.food.count,   bg: "bg-orange-50", text: "text-orange-600" },
                { label: "Parcel", icon: <Package         size={16} className="text-blue-500"/>,   earnings: periodData.breakdown.parcel.earnings, count: periodData.breakdown.parcel.count, bg: "bg-blue-50",   text: "text-blue-600" },
                { label: "Rides",  icon: <Car             size={16} className="text-purple-500"/>, earnings: periodData.breakdown.rides.earnings,  count: periodData.breakdown.rides.count,  bg: "bg-purple-50", text: "text-purple-600" },
              ].map(item => (
                <div key={item.label} className={`${item.bg} rounded-2xl p-3.5 text-center`}>
                  <div className="flex items-center justify-center mb-2">{item.icon}</div>
                  <p className={`text-base font-extrabold ${item.text}`}>{formatCurrency(item.earnings)}</p>
                  <p className="text-[9px] text-gray-500 font-semibold mt-0.5">{item.count} jobs</p>
                  <p className="text-[9px] text-gray-400 font-bold">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && (
          <Accordion type="single" collapsible defaultValue="breakdown">
            <AccordionItem value="breakdown" className="bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100">
              <AccordionTrigger className="px-5 py-4 bg-gray-50/50 hover:no-underline">
                <span className="font-bold text-gray-800 text-sm">
                  {period === "today" ? `${T("today")} Breakdown` : period === "week" ? `${T("thisWeek")} Breakdown` : T("thisMonthBreakdown")}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-0 pt-0">
                <div className="divide-y divide-gray-50">
                  {[
                    { label: `${T("totalEarned")} (${riderKeepPct}%)`, value: formatCurrency(periodData.earnings), color: "text-green-600" },
                    { label: `${T("deliveries")} ${T("completedLabel")}`, value: String(periodData.deliveries),     color: "text-gray-900"  },
                    { label: T("avgPerDelivery"),                 value: formatCurrency(avgPerDelivery),           color: "text-gray-900"  },
                  ].map(row => (
                    <div key={row.label} className="px-5 py-3.5 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{row.label}</span>
                      <span className={`font-extrabold text-sm ${row.color}`}>{row.value}</span>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        <Accordion type="single" collapsible>
          <AccordionItem value="how-it-works" className="bg-gray-900 rounded-3xl overflow-hidden border-0">
            <AccordionTrigger className="px-5 py-4 hover:no-underline [&>svg]:text-white/40">
              <span className="font-bold text-white text-sm flex items-center gap-1.5"><CreditCard size={14} className="text-white/60"/> {T("howEarningsWork")}</span>
            </AccordionTrigger>
            <AccordionContent className="pt-0">
              <div className="px-5 pb-1 space-y-2">
                {[
                  T("keepPercentage").replace("{pct}", String(riderKeepPct)),
                  T("earningsCreditedInstantly"),
                  T("withdrawAnytime"),
                  T("processedWithin"),
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <CheckCircle size={13} className="text-green-400 flex-shrink-0 mt-0.5"/>
                    <p className="text-xs text-white/60 leading-relaxed font-medium">{item}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

      </div>

      {showGoalModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-extrabold text-gray-900 text-base">{T("setDailyGoalTitle")}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Admin default: {formatCurrency(adminDailyGoal)}/day</p>
              </div>
              <button onClick={() => setShowGoalModal(false)} className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                <X size={16}/>
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1.5">
                Your Personal Goal ({currency})
              </label>
              <div className="flex items-center border-2 border-gray-200 rounded-2xl overflow-hidden focus-within:border-gray-900 transition-colors">
                <span className="px-3 text-gray-400 font-bold text-sm">{currency}</span>
                <input
                  type="number"
                  min="1"
                  step="100"
                  value={goalInput}
                  onChange={e => setGoalInput(e.target.value)}
                  placeholder={String(Math.round(adminDailyGoal))}
                  className="flex-1 py-3 pr-3 text-gray-900 font-extrabold text-lg outline-none bg-transparent"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Leave blank to use the admin default ({formatCurrency(adminDailyGoal)}).</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowGoalModal(false)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGoal}
                disabled={goalMutation.isPending}
                className="flex-1 py-3 rounded-2xl bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-60"
              >
                {goalMutation.isPending ? "Saving…" : T("saveGoal")}
              </button>
            </div>

            {isPersonalGoal && (
              <button
                onClick={() => goalMutation.mutate(null)}
                disabled={goalMutation.isPending}
                className="w-full mt-2 py-2.5 text-xs font-bold text-red-500 hover:text-red-700 transition-colors disabled:opacity-60"
              >
                {T("resetToAdminDefault")}
              </button>
            )}
          </div>
        </div>
      )}
    </PullToRefresh>
  );
}
