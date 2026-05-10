import { formatCurrency as _sharedFcW } from "@workspace/api-zod";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { usePlatformConfig, formatDateTz } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PullToRefresh } from "../components/PullToRefresh";
import WithdrawModal from "../components/wallet/WithdrawModal";
/* W3: Each wallet modal owns its own state and is conditionally mounted —
   we ensure that flipping `showWithdraw`/`showDeposit`/`showRemittance` to
   false unmounts the modal so its `useState` defaults reset on next open.
   The render below already does this via `{showWithdraw && <WithdrawModal …>}`
   guards, so reopening the modal yields a fresh instance with empty inputs. */
import RemittanceModal from "../components/wallet/RemittanceModal";
import DepositModal from "../components/wallet/DepositModal";
import {
  TrendingUp, Gift, Star, Heart, Building2, ArrowDownToLine,
  Banknote, ArrowUpFromLine, Lock, Wallet2, CreditCard,
  AlertTriangle, CheckCircle, Clock, XCircle,
  Landmark, Smartphone, ChevronDown, ChevronUp, ShieldCheck,
  Eye, EyeOff, Sparkles, BarChart3, ChevronRight,
} from "lucide-react";

const fc = (n: string | number | null | undefined, currencySymbol = "Rs.") => _sharedFcW(n != null ? String(n) : (n as null | undefined), currencySymbol);
const fd  = (d: string | Date, tz?: string) => formatDateTz(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, tz ?? "Asia/Karachi");
const fdr = (d: string | Date) => {
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1)  return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function dateGroupLabel(d: string): string {
  const now = new Date();
  const dt  = new Date(d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (dt >= today) return "today_group";
  if (dt >= yesterday) return "yesterday_group";
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  if (dt >= weekAgo) return "thisWeek_group";
  return dt.toLocaleDateString("en-PK", { month: "long", year: "numeric" });
}

function TxIcon({ type }: { type: string }) {
  const base = "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0";
  if (type === "credit")          return <div className={`${base} bg-green-50`}><TrendingUp size={18} className="text-green-600"/></div>;
  if (type === "bonus")           return <div className={`${base} bg-blue-50`}><Gift size={18} className="text-blue-600"/></div>;
  if (type === "loyalty")         return <div className={`${base} bg-purple-50`}><Star size={18} className="text-purple-600"/></div>;
  if (type === "cashback")        return <div className={`${base} bg-pink-50`}><Heart size={18} className="text-pink-600"/></div>;
  if (type === "platform_fee")    return <div className={`${base} bg-orange-50`}><Building2 size={18} className="text-orange-500"/></div>;
  if (type === "deposit")         return <div className={`${base} bg-teal-50`}><ArrowDownToLine size={18} className="text-teal-600"/></div>;
  if (type === "cod_remittance")  return <div className={`${base} bg-blue-50`}><Banknote size={18} className="text-blue-600"/></div>;
  if (type === "cash_collection") return <div className={`${base} bg-blue-50`}><Banknote size={18} className="text-blue-400"/></div>;
  return                                 <div className={`${base} bg-red-50`}><ArrowUpFromLine size={18} className="text-red-500"/></div>;
}

function txMeta(type: string) {
  if (type === "credit")          return { labelKey: "earnings" as TranslationKey,    badge: "bg-green-100 text-green-700"    };
  if (type === "bonus")           return { labelKey: "bonus" as TranslationKey,       badge: "bg-blue-100 text-blue-700"      };
  if (type === "loyalty")         return { labelKey: "loyalty" as TranslationKey,     badge: "bg-purple-100 text-purple-700"  };
  if (type === "cashback")        return { labelKey: "cashback" as TranslationKey,    badge: "bg-pink-100 text-pink-700"      };
  if (type === "platform_fee")    return { labelKey: "platformFare" as TranslationKey,badge: "bg-orange-100 text-orange-700"  };
  if (type === "deposit")         return { labelKey: "deposit" as TranslationKey,     badge: "bg-teal-100 text-teal-700"      };
  if (type === "cod_remittance")  return { labelKey: "remittanceLabel" as TranslationKey, badge: "bg-blue-100 text-blue-700"  };
  if (type === "cash_collection") return { labelKey: "collected" as TranslationKey,  badge: "bg-blue-100 text-blue-600"      };
  return                                 { labelKey: "withdraw" as TranslationKey,  badge: "bg-red-100 text-red-600"        };
}

function MethodIcon({ method }: { method: string | null }) {
  if (!method) return <Landmark size={16} className="text-blue-500"/>;
  const m = method.toLowerCase();
  if (m.includes("jazzcash"))  return <Smartphone size={16} className="text-red-500"/>;
  if (m.includes("easypaisa")) return <Smartphone size={16} className="text-green-500"/>;
  return <Landmark size={16} className="text-blue-500"/>;
}

function EarningsChart({ transactions }: { transactions: WalletTx[] }) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config: chartConfig } = usePlatformConfig();
  const chartCurrency = chartConfig.platform.currencySymbol ?? "Rs.";
  const days = useMemo(() => {
    const result: { label: string; amount: number; date: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const earned = transactions
        .filter(t => t.type === "credit" && new Date(t.createdAt) >= d && new Date(t.createdAt) < next)
        .reduce((s, t) => s + Number(t.amount), 0);
      result.push({
        label: i === 0 ? T("today") : d.toLocaleDateString("en-PK", { weekday: "short" }),
        amount: earned,
        date: d.toLocaleDateString("en-PK", { day: "numeric", month: "short" }),
      });
    }
    return result;
  }, [transactions]);

  const maxVal = Math.max(...days.map(d => d.amount), 1);
  const weekTotal = days.reduce((s, d) => s + d.amount, 0);
  const bestIdx = days.reduce((best, d, i) => d.amount > days[best].amount ? i : best, 0);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-gray-400"/>
          <p className="font-bold text-gray-800 text-sm">{T("sevenDayEarnings")}</p>
        </div>
        <p className="text-base font-black text-green-600">{fc(weekTotal, chartCurrency)}</p>
      </div>
      <div className="flex items-end gap-3 h-20">
        {days.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full flex items-end justify-center" style={{ height: 56 }}>
              <div
                className={`w-full max-w-[20px] rounded-md transition-all duration-500 ${
                  i === bestIdx ? "bg-green-500" : "bg-gray-100"
                }`}
                style={{ height: Math.max((d.amount / maxVal) * 56, d.amount > 0 ? 4 : 2) }}
                title={`${d.date}: ${fc(d.amount, chartCurrency)}`}
              />
            </div>
            <p className={`text-[9px] font-semibold ${i === bestIdx ? "text-green-600" : "text-gray-300"}`}>{d.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingRequestCard({ tx }: { tx: WalletTx }) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config: cardConfig } = usePlatformConfig();
  const cardCurrency = cardConfig.platform.currencySymbol ?? "Rs.";
  const parsed = (() => {
    const parts = (tx.description || "").replace("Withdrawal — ", "").split(" · ");
    return { bank: parts[0] || "—", account: parts[1] || "—", title: parts[2] || "—", note: parts[3] || "" };
  })();

  const ref = tx.reference ?? "pending";
  const status = ref === "pending" ? "pending" : ref.startsWith("paid:") ? "paid" : ref.startsWith("rejected:") ? "rejected" : "pending";
  const refNo  = ref.startsWith("paid:") ? ref.slice(5) : ref.startsWith("rejected:") ? ref.slice(9) : "";

  const statusConfig = {
    pending:  { label: T("processing"), icon: <Clock size={11}/>,       bg: "bg-amber-50",  border: "border-amber-200", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400"  },
    paid:     { label: T("paid"),       icon: <CheckCircle size={11}/>, bg: "bg-green-50",  border: "border-green-200", badge: "bg-green-100 text-green-700",  dot: "bg-green-400" },
    rejected: { label: T("rejected"),   icon: <XCircle size={11}/>,     bg: "bg-red-50",    border: "border-red-200",   badge: "bg-red-100 text-red-600",     dot: "bg-red-400"   },
  }[status] ?? { label: T("processing"), icon: <Clock size={11}/>, bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-400" };

  return (
    <div className={`${statusConfig.bg} border ${statusConfig.border} rounded-2xl p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <MethodIcon method={tx.paymentMethod || parsed.bank}/>
          </div>
          <div className="min-w-0">
            <p className="font-black text-gray-900 text-sm">{parsed.bank}</p>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{parsed.account}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-black text-gray-900">{fc(Number(tx.amount), cardCurrency)}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusConfig.badge} inline-flex items-center gap-1`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} ${status === "pending" ? "animate-pulse" : ""}`}/>
            {statusConfig.icon} {statusConfig.label}
          </span>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/60 flex items-center justify-between">
        <p className="text-[10px] text-gray-500">{fd(tx.createdAt)} · {fdr(tx.createdAt)}</p>
        {refNo && <p className="text-[10px] font-bold text-gray-600">Ref: {refNo}</p>}
      </div>
      {status === "rejected" && refNo && (
        <div className="mt-2 bg-white/70 rounded-xl px-3 py-2">
          <p className="text-xs text-red-600 font-medium">{T("reason")}: {refNo}</p>
          <p className="text-[10px] text-red-500 mt-0.5">{T("amountRefunded")}</p>
        </div>
      )}
      {status === "pending" && (
        <p className="text-[10px] text-amber-600 mt-2 font-medium">{T("adminProcess24h")}</p>
      )}
    </div>
  );
}

type WalletTx = {
  id: string; type: string; amount: string | number;
  description?: string; reference?: string; createdAt: string;
  paymentMethod?: string;
};

type TxFilter = "all" | "credit" | "debit" | "bonus" | "fees";

export default function Wallet() {
  const { user, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const currency = config.platform.currencySymbol ?? "Rs.";
  const tz = config.regional?.timezone ?? "Asia/Karachi";
  const fd = (d: string | Date) => formatDateTz(d, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, tz);
  const riderKeepPct      = config.rider?.keepPct ?? config.finance.riderEarningPct;
  const minPayout         = config.rider?.minPayout ?? config.finance.minRiderPayout;
  const maxPayout         = config.rider?.maxPayout ?? 0;
  const withdrawalEnabled = config.rider?.withdrawalEnabled !== false;
  const depositEnabled    = config.rider?.depositEnabled !== false;
  const minBalanceFallback = config.rider?.minBalance ?? 0;
  const procDays          = config.wallet?.withdrawalProcessingDays ?? 2;
  const qc = useQueryClient();

  const [showWithdraw, setShowWithdraw]     = useState(false);
  const [showRemittance, setShowRemittance] = useState(false);
  const [showDeposit, setShowDeposit]       = useState(false);
  const [toast, setToast]                   = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [filter, setFilter]                 = useState<TxFilter>("all");
  const [showRequests, setShowRequests]     = useState(true);
  const [showCodHistory, setShowCodHistory] = useState(false);
  const [balanceHidden, setBalanceHidden]   = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* W2: sentinel observed at the bottom of the transactions list to trigger
     fetchNextPage. Kept as a ref so the IntersectionObserver re-binds only
     when the sentinel mounts/unmounts, not on every render. */
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  /* W2: Cursor-paginated wallet history with infinite scroll. The first page
     also carries the canonical `balance`. Subsequent pages append to the
     visible list; the IntersectionObserver below auto-loads the next page
     when the sentinel scrolls into view. */
  const PAGE_SIZE = 50;
  const {
    data,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["rider-wallet"],
    queryFn: ({ pageParam }) => api.getWalletPage({ cursor: pageParam ?? null, limit: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? null,
    refetchInterval: 30000,
    enabled: config.features.wallet,
  });

  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const FILTER_TABS_LOCAL = [
    { key: "all" as TxFilter,    label: T("all")         },
    { key: "credit" as TxFilter, label: T("earnings")    },
    { key: "debit" as TxFilter,  label: T("withdraw")    },
    { key: "bonus" as TxFilter,  label: T("bonus" as TranslationKey) },
    { key: "fees" as TxFilter,   label: T("platformFare") },
  ];

  const resolveGroupLabel = (g: string) => {
    if (g === "today_group") return T("today");
    if (g === "yesterday_group") return T("yesterday");
    if (g === "thisWeek_group") return T("thisWeek");
    return g;
  };

  const { data: codData, refetch: refetchCod } = useQuery({
    queryKey: ["rider-cod"],
    queryFn: () => api.getCodSummary(),
    refetchInterval: 30000,
    enabled: config.features.wallet,
  });

  const [showDeposits, setShowDeposits] = useState(false);
  const { data: depositsData, refetch: refetchDeposits } = useQuery({
    queryKey: ["rider-deposits"],
    queryFn: () => api.getDeposits(),
    enabled: showDeposits && config.features.wallet,
    staleTime: 30000,
  });

  /* Live minBalance: fetched eagerly so DepositModal always shows the admin-configured value,
     not the potentially-stale value baked into the platform config response. */
  const { data: minBalanceData } = useQuery({
    queryKey: ["rider-min-balance"],
    queryFn: () => api.getMinBalance(),
    staleTime: 60000,
    enabled: config.features.wallet,
  });
  const minBalance = (minBalanceData?.minBalance ?? minBalanceFallback) as number;

  /* W2: Flatten paged results into a single transactions array. Balance is
     authoritative on the FIRST page only (each subsequent page also returns
     the live balance, but using the first page avoids tiny flicker as later
     pages stream in). Aggregates below (today/week/total) sum the loaded
     pages — same behaviour as before, but now extends as the rider scrolls. */
  const pages = data?.pages ?? [];
  const transactions: WalletTx[] = useMemo(() => {
    const out: WalletTx[] = [];
    for (const p of pages) {
      const items = (p?.items ?? []) as WalletTx[];
      for (const it of items) out.push(it);
    }
    return out;
  }, [pages]);
  const balanceFromServer = pages[0]?.balance;
  const balance = balanceFromServer ?? "0";
  const balanceNum = balanceFromServer != null ? Number(balanceFromServer) : 0;
  const isBalanceStale = false;

  const today   = new Date(); today.setHours(0,0,0,0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

  const todayEarned    = transactions.filter(t => t.type === "credit" && new Date(t.createdAt) >= today).reduce((s, t) => s + Number(t.amount), 0);
  const weekEarned     = transactions.filter(t => t.type === "credit" && new Date(t.createdAt) >= weekAgo).reduce((s, t) => s + Number(t.amount), 0);
  const totalEarned    = transactions.filter(t => t.type === "credit" || t.type === "bonus").reduce((s, t) => s + Number(t.amount), 0);
  const totalWithdrawn = transactions.filter(t => t.type === "debit" && !t.reference?.startsWith("refund:")).reduce((s, t) => s + Number(t.amount), 0);
  const promoBalance   = useMemo(() => transactions.filter(t => ["bonus", "cashback", "loyalty"].includes(t.type)).reduce((s, t) => s + Math.max(0, Number(t.amount)), 0), [transactions]);

  const withdrawalRequests = transactions.filter(t =>
    t.type === "debit" && t.description?.startsWith("Withdrawal") && !t.reference?.startsWith("refund:")
  );
  const pendingRequests = withdrawalRequests.filter(t => !t.reference || t.reference === "pending");
  const pendingAmt = pendingRequests.reduce((s, t) => s + Number(t.amount), 0);

  const codNetOwed    = codData?.netOwed       ?? 0;
  const codCollected  = codData?.totalCollected ?? 0;
  const codVerified   = codData?.totalVerified  ?? 0;
  const codOrderCount = codData?.codOrderCount  ?? 0;
  const codRemittances: WalletTx[] = codData?.remittances ?? [];
  const codPending    = codRemittances.filter(r => !r.reference || r.reference === "pending" || r.reference === null);

  const filtered = useMemo(() => {
    if (filter === "all") return transactions;
    if (filter === "bonus") return transactions.filter(t => t.type === "bonus" || t.type === "loyalty" || t.type === "cashback");
    if (filter === "fees") return transactions.filter(t => t.type === "platform_fee");
    if (filter === "debit") return transactions.filter(t => t.type === "debit");
    return transactions.filter(t => t.type === filter);
  }, [filter, transactions]);

  const groupedTx = useMemo(() => {
    const groups: { label: string; items: WalletTx[] }[] = [];
    const groupMap = new Map<string, WalletTx[]>();
    for (const t of filtered) {
      const g = dateGroupLabel(t.createdAt);
      if (!groupMap.has(g)) {
        const items: WalletTx[] = [];
        groupMap.set(g, items);
        groups.push({ label: g, items });
      }
      groupMap.get(g)?.push(t);
    }
    return groups;
  }, [filtered]);

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["rider-wallet"] }),
      qc.invalidateQueries({ queryKey: ["rider-withdrawals"] }),
    ]);
  }, [qc]);

  /* W2: Auto-load next page when the sentinel scrolls into view. We re-bind
     the observer whenever `hasNextPage` flips so that once we exhaust the
     dataset we stop spending CPU on intersection callbacks. */
  useEffect(() => {
    if (!hasNextPage) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
          break;
        }
      }
    }, { rootMargin: "200px" });
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <div className="bg-[#F5F6F8] min-h-screen">
        <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.03] rounded-full -translate-y-1/2 translate-x-1/3"/>
          <div className="absolute bottom-0 left-0 w-44 h-44 bg-white/[0.02] rounded-full translate-y-1/2 -translate-x-1/4"/>
          <div className="relative">
            <div className="flex items-center justify-between mb-6 animate-pulse">
              <div className="h-3 w-24 bg-white/10 rounded"/>
              <div className="w-8 h-8 bg-white/5 rounded-full"/>
            </div>
            <div className="h-12 w-52 bg-white/10 rounded-xl mb-6 animate-pulse"/>
            <div className="flex gap-3 mb-5 animate-pulse">
              <div className="flex-1 h-16 bg-white/5 rounded-2xl"/>
              <div className="flex-1 h-16 bg-white/5 rounded-2xl"/>
              <div className="flex-1 h-16 bg-white/5 rounded-2xl"/>
            </div>
            <div className="flex gap-3 animate-pulse">
              <div className="flex-1 h-13 bg-white/15 rounded-2xl"/>
              <div className="flex-1 h-13 bg-white/10 rounded-2xl"/>
            </div>
          </div>
        </div>
        <div className="px-5 py-5 space-y-4 -mt-4">
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded mb-4"/>
            <div className="flex items-end gap-3 h-20">
              {[20, 35, 15, 45, 30, 50, 25].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full max-w-[20px] bg-gray-100 rounded-md" style={{ height: `${h}px` }}/>
                  <div className="h-2 w-4 bg-gray-100 rounded"/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!config.features.wallet) {
    return (
      <div className="bg-[#F5F6F8] min-h-screen">
        <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-10 rounded-b-[2rem]"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
          <p className="text-white/40 text-xs font-semibold tracking-widest uppercase">{T("wallet")}</p>
        </div>
        <div className="px-5 -mt-4">
          <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-gray-300"/>
            </div>
            <h3 className="text-lg font-black text-gray-900 mb-2">{T("walletDisabled")}</h3>
            <p className="text-sm text-gray-400">{T("withdrawalsDisabled")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="bg-[#F5F6F8] min-h-screen">

      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}>
        <div className="absolute top-0 right-0 w-72 h-72 bg-green-500/[0.04] rounded-full -translate-y-1/2 translate-x-1/3"/>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/[0.02] rounded-full translate-y-1/2 -translate-x-1/4"/>
        <div className="absolute top-1/2 right-8 w-24 h-24 bg-emerald-500/[0.03] rounded-full"/>

        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <p className="text-white/40 text-xs font-semibold tracking-widest uppercase">{T("availableBalance")}</p>
            </div>
            <button onClick={() => setBalanceHidden(v => !v)} className="w-8 h-8 bg-white/5 rounded-full flex items-center justify-center active:bg-white/10 transition-colors">
              {balanceHidden ? <EyeOff size={13} className="text-white/40"/> : <Eye size={13} className="text-white/40"/>}
            </button>
          </div>

          <div className="flex items-end gap-3 mb-1">
            <p className="text-[42px] font-black text-white tracking-tight leading-none">
              {balanceHidden ? "••••••" : isLoading ? <span className="text-[28px] animate-pulse text-white/40">loading...</span> : fc(balance, currency)}
            </p>
            {isBalanceStale && !balanceHidden && (
              <div className="mb-2 flex items-center gap-1 bg-amber-500/15 px-2 py-0.5 rounded-full">
                <AlertTriangle size={9} className="text-amber-400"/>
                <span className="text-[9px] text-amber-400 font-bold">cached</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mb-5">
            {user?.isOnline && (
              <div className="flex items-center gap-1 bg-green-500/15 px-2 py-0.5 rounded-full">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"/>
                <span className="text-[9px] text-green-400 font-bold">{T("online" as TranslationKey)}</span>
              </div>
            )}
            {pendingAmt > 0 && (
              <div className="flex items-center gap-1 bg-amber-500/15 px-2 py-0.5 rounded-full">
                <Clock size={9} className="text-amber-400"/>
                <span className="text-[9px] text-amber-400 font-bold">{fc(pendingAmt, currency)} {T("pending")}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5 mb-3">
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl px-3 py-2.5 border border-white/[0.06]">
              <p className="text-[9px] text-white/30 uppercase tracking-wider font-bold">{T("earnedToday")}</p>
              <p className="text-sm font-black text-green-400 mt-0.5">{balanceHidden ? "••••" : fc(todayEarned, currency)}</p>
            </div>
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl px-3 py-2.5 border border-white/[0.06]">
              <p className="text-[9px] text-white/30 uppercase tracking-wider font-bold">{T("yourShare" as TranslationKey)}</p>
              <p className="text-sm font-black text-white mt-0.5">{riderKeepPct}%</p>
            </div>
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl px-3 py-2.5 border border-white/[0.06]">
              <p className="text-[9px] text-white/30 uppercase tracking-wider font-bold">{T("totalWithdrawn")}</p>
              <p className="text-sm font-black text-red-400 mt-0.5">{fc(totalWithdrawn, currency)}</p>
            </div>
          </div>

          {promoBalance > 0 && (
            <div className="mb-5 bg-gradient-to-br from-purple-600/25 to-indigo-600/20 backdrop-blur-sm rounded-2xl px-4 py-3.5 border border-purple-400/20 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-purple-300 uppercase tracking-wider font-bold flex items-center gap-1">
                  <Sparkles size={9}/> Promo Balance
                </p>
                <p className="text-xl font-black text-white mt-0.5">{balanceHidden ? "••••" : fc(promoBalance, currency)}</p>
                <p className="text-[9px] text-white/30 mt-0.5">Bonuses · Cashback · Loyalty</p>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-400/20 flex items-center justify-center flex-shrink-0">
                <Sparkles size={16} className="text-purple-300"/>
              </div>
            </div>
          )}

          {minBalance > 0 && balanceNum < minBalance && (
            <div className="mb-4 bg-amber-500/15 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5 border border-amber-500/15">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0"/>
              <div>
                <p className="text-xs text-amber-300 font-bold">{T("cashMinBalance")}: {fc(minBalance, currency)}</p>
                <p className="text-[10px] text-amber-400/60">{currency} {Math.round(minBalance - balanceNum)} {T("moreNeeded")}</p>
              </div>
            </div>
          )}

          {procDays > 0 && (
            <p className="text-[10px] text-white/25 mb-3 flex items-center gap-1.5">
              <Clock size={9} className="text-white/25"/>
              {T("walletProcessingTime")}: {procDays * 24}–{procDays * 24 + 24}h
            </p>
          )}

          <div className="flex gap-2.5">
            {withdrawalEnabled ? (
              <button onClick={() => setShowWithdraw(true)}
                className="flex-1 bg-white text-gray-900 font-black rounded-2xl py-3.5 text-sm flex items-center justify-center gap-2 active:bg-gray-100 transition-all shadow-lg shadow-white/10">
                <ArrowUpFromLine size={15}/> {T("withdraw")}
              </button>
            ) : (
              <button disabled className="flex-1 bg-white/10 text-white/40 font-bold rounded-2xl py-3.5 text-sm flex items-center justify-center gap-2 cursor-not-allowed border border-white/10">
                <Lock size={14}/> {T("withdrawalsPaused")}
              </button>
            )}
            {depositEnabled && (
              <button onClick={() => setShowDeposit(true)}
                className="flex-1 bg-white/10 text-white font-bold rounded-2xl py-3.5 text-sm flex items-center justify-center gap-2 border border-white/[0.08] active:bg-white/15 transition-all backdrop-blur-sm">
                <ArrowDownToLine size={15}/> {T("deposit")}
              </button>
            )}
          </div>

          {!withdrawalEnabled && (
            <div className="mt-3 bg-red-500/15 rounded-2xl px-3 py-2 flex items-center gap-2 border border-red-500/15">
              <XCircle size={12} className="text-red-400 flex-shrink-0"/>
              <p className="text-[10px] text-red-300 font-medium">{T("withdrawalsDisabled")}</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-5 space-y-4 -mt-3">

        <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            {[
              { label: T("earnedToday"),    value: fc(todayEarned, currency),  color: "text-emerald-600", icon: <TrendingUp size={13} className="text-emerald-500"/> },
              { label: T("earnedThisWeek"), value: fc(weekEarned, currency),   color: "text-blue-600",    icon: <BarChart3 size={13} className="text-blue-500"/>    },
              { label: T("totalEarned"),     value: fc(totalEarned, currency),  color: "text-violet-600",  icon: <Wallet2 size={13} className="text-violet-500"/>    },
            ].map((s, i) => (
              <div key={s.label} className={`text-center ${i === 0 ? "pr-3" : i === 2 ? "pl-3" : "px-3"}`}>
                <div className="flex items-center justify-center gap-1 mb-1">{s.icon}</div>
                <p className={`text-sm font-black ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-gray-400 mt-0.5 font-semibold leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <EarningsChart transactions={transactions}/>

        {codOrderCount > 0 && (
          <div className={`rounded-3xl shadow-sm overflow-hidden border ${codNetOwed > 0 ? "border-blue-100 bg-white" : "border-green-100 bg-white"}`}>
            <div className="px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${codNetOwed > 0 ? "bg-blue-50" : "bg-green-50"}`}>
                  <Banknote size={20} className={codNetOwed > 0 ? "text-blue-600" : "text-green-600"}/>
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-sm">{T("codCashBalance")}</p>
                  <p className="text-[10px] text-gray-400">{T("cashOnDelivery")}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xl font-black ${codNetOwed > 0 ? "text-blue-600" : "text-green-600"}`}>{fc(codNetOwed, currency)}</p>
                <p className="text-[10px] text-gray-400 flex items-center gap-1 justify-end">
                  {codNetOwed > 0 ? T("remitCodCashBtn") : <><CheckCircle size={10} className="text-green-500"/> {T("allClear")}</>}
                </p>
              </div>
            </div>

            <div className="px-5 pb-3 grid grid-cols-3 gap-2 text-center border-t border-gray-50 pt-3">
              <div className="bg-gray-50 rounded-xl py-2">
                <p className="text-xs font-black text-gray-800">{fc(codCollected, currency)}</p>
                <p className="text-[9px] text-gray-400 font-medium">{T("collected")}</p>
              </div>
              <div className="bg-gray-50 rounded-xl py-2">
                <p className="text-xs font-black text-green-600">{fc(codVerified, currency)}</p>
                <p className="text-[9px] text-gray-400 font-medium">{T("verified")}</p>
              </div>
              <div className="bg-gray-50 rounded-xl py-2">
                <p className={`text-xs font-black ${codNetOwed > 0 ? "text-blue-600" : "text-gray-400"}`}>{fc(codNetOwed, currency)}</p>
                <p className="text-[9px] text-gray-400 font-medium">{T("owed")}</p>
              </div>
            </div>

            {codPending.length > 0 && (
              <div className="mx-5 mb-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse flex-shrink-0"/>
                <p className="text-xs text-amber-700 font-semibold">{codPending.length} {T("remitPending")}</p>
              </div>
            )}

            <div className="px-5 pb-4 flex gap-2">
              {codNetOwed > 0 && (
                <button onClick={() => setShowRemittance(true)}
                  className="flex-1 bg-gray-900 text-white font-black rounded-2xl py-3 flex items-center justify-center gap-2 text-sm active:bg-gray-800 transition-colors">
                  <Banknote size={16}/> {T("remitCodCashBtn")}
                </button>
              )}
              <button onClick={() => setShowCodHistory(!showCodHistory)}
                className={`${codNetOwed > 0 ? "w-auto px-4" : "flex-1"} bg-gray-50 text-gray-600 font-bold rounded-2xl py-3 text-sm flex items-center justify-center gap-1.5 border border-gray-100 active:bg-gray-100 transition-colors`}>
                {showCodHistory ? <><ChevronUp size={14}/> {T("hide")}</> : T("history")}
              </button>
            </div>

            {showCodHistory && codRemittances.length > 0 && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {codRemittances.map(r => {
                  const ref = r.reference ?? "pending";
                  const st  = ref === "pending" ? "pending" : ref.startsWith("verified:") ? "verified" : ref.startsWith("rejected:") ? "rejected" : "pending";
                  const stBadge = st === "pending" ? "bg-amber-100 text-amber-700" : st === "verified" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600";
                  const stIcon  = st === "pending" ? <Clock size={10}/> : st === "verified" ? <CheckCircle size={10}/> : <XCircle size={10}/>;
                  const stLabel = st === "pending" ? T("pending") : st === "verified" ? T("verified") : T("rejected");
                  const parts = (r.description || "").replace("COD Remittance — ", "").split(" · ");
                  return (
                    <div key={r.id} className="px-5 py-3.5 flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                        <Banknote size={16} className="text-blue-600"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800">{parts[0] || "Remittance"}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleDateString("en-PK", { day:"numeric", month:"short" })}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${stBadge}`}>{stIcon} {stLabel}</span>
                        </div>
                      </div>
                      <p className="text-sm font-black text-blue-600 flex-shrink-0">{fc(Number(r.amount), currency)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-4"
            onClick={() => { setShowDeposits(v => !v); if (!showDeposits) refetchDeposits(); }}
          >
            <div className="flex items-center gap-2.5">
              <ArrowDownToLine size={16} className="text-green-600"/>
              <span className="font-bold text-gray-800 text-sm">Deposit History</span>
            </div>
            {showDeposits ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
          </button>
          {showDeposits && (
            <div className="border-t border-gray-50">
              {!depositsData ? (
                <div className="px-5 py-8 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"/>
                </div>
              ) : (() => {
                const depositList: any[] = depositsData?.deposits ?? depositsData ?? [];
                if (depositList.length === 0) return (
                  <div className="px-5 py-8 text-center">
                    <p className="text-sm text-gray-400 font-medium">No deposits yet</p>
                  </div>
                );
                return (
                <div className="divide-y divide-gray-50">
                  {depositList.map((dep: any) => {
                    const st = dep.status === "verified" ? "verified" : dep.status === "rejected" ? "rejected" : "pending";
                    const stBadge = st === "pending" ? "bg-amber-100 text-amber-700" : st === "verified" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600";
                    const stIcon = st === "pending" ? <Clock size={10}/> : st === "verified" ? <CheckCircle size={10}/> : <XCircle size={10}/>;
                    return (
                      <div key={dep.id} className="px-5 py-3.5 flex items-center gap-3">
                        <div className="w-9 h-9 bg-green-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                          <ArrowDownToLine size={16} className="text-green-600"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800">{dep.method || "Deposit"}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[10px] text-gray-400">{new Date(dep.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${stBadge}`}>{stIcon} {st}</span>
                          </div>
                          {dep.note && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{dep.note}</p>}
                        </div>
                        <p className="text-sm font-black text-green-600 flex-shrink-0">{fc(Number(dep.amount), currency)}</p>
                      </div>
                    );
                  })}
                </div>
                );
              })()}
            </div>
          )}
        </div>

        {withdrawalRequests.length > 0 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4"
              onClick={() => setShowRequests(!showRequests)}
            >
              <div className="flex items-center gap-2.5">
                <span className="font-bold text-gray-800 text-sm">{T("withdrawalRequests")}</span>
                {pendingRequests.length > 0 && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock size={9}/> {pendingRequests.length} {T("pending")}
                  </span>
                )}
              </div>
              {showRequests ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
            </button>
            {showRequests && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
                {withdrawalRequests.map(tx => <PendingRequestCard key={tx.id} tx={tx}/>)}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2">
                  <ShieldCheck size={14} className="text-blue-500 flex-shrink-0 mt-0.5"/>
                  <p className="text-xs text-blue-700 font-medium">
                    {T("processingTime")}: {procDays * 24}–{procDays * 24 + 24}h. {T("adminApproveNotify")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {withdrawalRequests.length === 0 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
            <p className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
              <Sparkles size={15} className="text-green-500"/> {T("howItWorks")}
            </p>
            <div className="space-y-3">
              {[
                { step: "1", icon: <TrendingUp size={14} className="text-green-600"/>, title: T("completeDeliveries"),    desc: `${riderKeepPct}% ${T("earningsAddedInstantly")}` },
                { step: "2", icon: <Wallet2 size={14} className="text-green-600"/>,    title: T("buildBalance"),    desc: `${T("minToWithdraw")}: ${fc(minPayout, currency)}`   },
                { step: "3", icon: <ArrowUpFromLine size={14} className="text-green-600"/>, title: T("requestWithdrawal"), desc: T("selectPaymentMethod")     },
                { step: "4", icon: <CheckCircle size={14} className="text-green-600"/>, title: T("receivePayment"),       desc: `${procDays * 24}–${procDays * 24 + 24}h ${T("transferTime")}` },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center text-sm font-black text-green-600 flex-shrink-0">{s.step}</div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">{s.icon} {s.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-gray-800 text-sm">{T("transactionHistoryTitle")}</p>
              <span className="text-[10px] text-gray-400 font-medium">{filtered.length} {T("records")}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {FILTER_TABS_LOCAL.map(tab => (
                <button key={tab.key} onClick={() => setFilter(tab.key)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    filter === tab.key
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-400 border border-gray-100 active:bg-gray-100"
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center border-t border-gray-50">
              <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <CreditCard size={28} className="text-gray-200"/>
              </div>
              <p className="font-bold text-gray-600">{T("noTransactionsFilter")}</p>
              <p className="text-sm text-gray-400 mt-1">{T("completeDeliveriesTrack")}</p>
              {filter !== "all" && (
                <button onClick={() => setFilter("all")} className="mt-3 text-xs text-green-600 font-bold flex items-center gap-0.5 mx-auto">
                  {T("all")} {T("transactionHistoryTitle")} <ChevronRight size={12}/>
                </button>
              )}
            </div>
          ) : (
            <div className="border-t border-gray-50">
              {groupedTx.map(group => (
                <div key={group.label}>
                  <div className="px-5 py-2.5 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{resolveGroupLabel(group.label)}</p>
                    <span className="text-[10px] text-gray-300">{group.items.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {group.items.map((t: WalletTx) => {
                      const meta = txMeta(t.type);
                      const isDebitType = t.type === "debit" || t.type === "platform_fee";
                      const isCredit = !isDebitType;
                      const isW = t.type === "debit" && t.description?.startsWith("Withdrawal");
                      const isDeposit = t.type === "deposit";
                      const ref = (isW || isDeposit) ? (t.reference ?? "pending") : null;
                      const wStatus = !ref ? null
                        : ref === "pending" ? "pending"
                        : (ref.startsWith("paid:") || ref.startsWith("approved:")) ? "approved"
                        : ref.startsWith("rejected:") ? "rejected" : null;
                      return (
                        <div key={t.id} className="px-5 py-3.5 flex items-center gap-3">
                          <TxIcon type={t.type}/>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-1">{t.description}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <p className="text-[10px] text-gray-400">{fdr(t.createdAt)}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${meta.badge}`}>{T(meta.labelKey)}</span>
                              {wStatus === "pending"  && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5"><Clock size={8}/> {T("pending")}</span>}
                              {wStatus === "approved" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-0.5"><CheckCircle size={8}/> {isDeposit ? T("creditedLabel") : T("paid")}</span>}
                              {wStatus === "rejected" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-0.5"><XCircle size={8}/> {T("rejected")}</span>}
                            </div>
                          </div>
                          <p className={`text-sm font-black flex-shrink-0 ${
                            isDeposit && wStatus === "pending" ? "text-amber-500"
                            : isDeposit ? "text-teal-600"
                            : isCredit ? "text-green-600"
                            : wStatus === "rejected" ? "text-gray-400 line-through"
                            : "text-red-500"
                          }`}>
                            {isDebitType ? "−" : "+"}{fc(Number(t.amount), currency)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {/* W2: infinite-scroll sentinel + spinner. Only rendered when
                 there is a next page so we never show a permanent loader. */}
              {hasNextPage && (
                <div ref={loadMoreRef} className="px-5 py-4 flex items-center justify-center">
                  {isFetchingNextPage ? (
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin"/>
                  ) : (
                    <div className="h-5"/>
                  )}
                </div>
              )}
              {!hasNextPage && transactions.length > 0 && (
                <p className="text-center text-[10px] text-gray-300 py-3">{T("allTransactionsSecure")}</p>
              )}
            </div>
          )}
        </div>

        <div className="bg-green-50 rounded-3xl border border-green-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={15} className="text-green-600"/>
            <p className="text-sm font-bold text-green-800">{T("payoutPolicy")}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: T("yourShare" as TranslationKey),       value: `${riderKeepPct}%` },
              { label: T("minWithdrawalLabel"),  value: fc(minPayout, currency) },
              { label: T("processingTime"),      value: `${procDays * 24}-${procDays * 24 + 24}h` },
              { label: T("maxWithdrawalLabel"),  value: fc(maxPayout, currency) },
            ].map(p => (
              <div key={p.label} className="bg-white rounded-xl px-3 py-2.5 border border-green-100">
                <p className="text-[10px] text-green-600/60 font-bold uppercase tracking-wider">{p.label}</p>
                <p className="text-sm font-black text-green-800 mt-0.5">{p.value}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-300 pb-2 flex items-center justify-center gap-1.5">
          <ShieldCheck size={10}/> {T("allTransactionsSecure")} {config.platform.appName}
        </p>
      </div>

      {showRemittance && (
        <RemittanceModal
          netOwed={codNetOwed}
          codCollected={codCollected}
          onClose={() => setShowRemittance(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["rider-cod"] });
            qc.invalidateQueries({ queryKey: ["rider-wallet"] });
            qc.invalidateQueries({ queryKey: ["rider-deposits"] });
            refetch();
            refetchCod();
            refetchDeposits();
            showToast(T("codRemittanceSubmitted"));
          }}
        />
      )}

      {showWithdraw && withdrawalEnabled && (
        <WithdrawModal
          balance={balanceNum} minPayout={minPayout} maxPayout={maxPayout}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["rider-wallet"] });
            qc.invalidateQueries({ queryKey: ["rider-cod"] });
            qc.invalidateQueries({ queryKey: ["rider-deposits"] });
            refetch();
            refetchCod();
            refetchDeposits();
            refreshUser().catch(() => {});
            /* Show "Under Review" message so rider knows the request is pending admin review
               and their balance will only be deducted after the request is approved. */
            showToast(`${T("withdrawalSubmitted")} ${T("underReview")}`, "success");
          }}
        />
      )}

      {showDeposit && depositEnabled && (
        <DepositModal
          balance={balanceNum} minBalance={minBalance}
          onClose={() => setShowDeposit(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["rider-wallet"] });
            qc.invalidateQueries({ queryKey: ["rider-deposits"] });
            refetch();
            refetchCod();
            refetchDeposits();
            showToast(T("depositSubmittedMsg"));
          }}
        />
      )}

      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold flex items-center gap-2 animate-[slideDown_0.3s_ease-out] max-w-[90vw] ${
          toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"
        }`}>
          {toast.type === "error" ? <XCircle size={15} className="text-red-300 flex-shrink-0"/> : <CheckCircle size={15} className="text-green-400 flex-shrink-0"/>}
          {toast.message}
        </div>
      )}
    </PullToRefresh>
  );
}
