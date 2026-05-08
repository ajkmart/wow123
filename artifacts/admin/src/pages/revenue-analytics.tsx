import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader, StatCard } from "@/components/shared";
import { BarChart2, ShoppingBag, Car, Pill, TrendingUp, TrendingDown, Trophy, Download, FileText } from "lucide-react";
import { useRevenueAnalytics } from "@/hooks/use-admin";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PullToRefresh } from "@/components/PullToRefresh";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gray-100 rounded-2xl ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

function exportJson(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revenue-analytics-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(monthly: { month: string; orders: number; rides: number; pharmacy: number; total: number }[]) {
  const header = "Month,Mart/Food,Rides,Pharmacy,Total";
  const rows = monthly.map(m =>
    [m.month, m.orders.toFixed(2), m.rides.toFixed(2), m.pharmacy.toFixed(2), m.total.toFixed(2)].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revenue-monthly-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatMonthLabel(m: string): string {
  const [year, month] = m.split("-");
  const idx = parseInt(month ?? "1", 10) - 1;
  return `${SHORT_MONTHS[idx]} ${(year ?? "").slice(2)}`;
}

export default function RevenueAnalytics() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const qc = useQueryClient();
  const { data: raw, isLoading } = useRevenueAnalytics();

  const handleRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["admin-revenue-analytics"] });
  }, [qc]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <SkeletonBlock className="h-10 w-56" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-9 w-28" />
            <SkeletonBlock className="h-9 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <SkeletonBlock key={i} className="h-28" />)}
        </div>
        <SkeletonBlock className="h-72" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-48" />
        </div>
      </div>
    );
  }

  const monthly: { month: string; orders: number; rides: number; pharmacy: number; total: number }[] =
    Array.isArray(raw?.monthly) ? raw.monthly : [];
  const categoryTotals = raw?.categoryTotals ?? { orders: 0, rides: 0, pharmacy: 0, total: 0 };
  const topVendors: { id: string; name: string | null; phone: string; orderCount: number; totalRevenue: number }[] =
    Array.isArray(raw?.topVendors) ? raw.topVendors : [];

  const grandTotal: number = categoryTotals.total ?? 0;

  const thisMonthStr = new Date().toISOString().slice(0, 7);
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStr = lastMonthDate.toISOString().slice(0, 7);

  const thisMonthData = monthly.find(m => m.month === thisMonthStr);
  const lastMonthData = monthly.find(m => m.month === lastMonthStr);

  const thisMonthTotal = thisMonthData?.total ?? 0;
  const lastMonthTotal = lastMonthData?.total ?? 0;
  const momGrowth = lastMonthTotal > 0
    ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100
    : thisMonthTotal > 0 ? 100 : 0;

  const chartData = monthly.map(m => ({
    name: formatMonthLabel(m.month),
    "Mart/Food": parseFloat(m.orders.toFixed(2)),
    Rides: parseFloat(m.rides.toFixed(2)),
    Pharmacy: parseFloat(m.pharmacy.toFixed(2)),
  }));

  const ordersShare  = grandTotal > 0 ? ((categoryTotals.orders / grandTotal) * 100).toFixed(1) : "0.0";
  const ridesShare   = grandTotal > 0 ? ((categoryTotals.rides  / grandTotal) * 100).toFixed(1) : "0.0";
  const pharmShare   = grandTotal > 0 ? ((categoryTotals.pharmacy / grandTotal) * 100).toFixed(1) : "0.0";

  const growthPositive = momGrowth >= 0;

  return (
    <PullToRefresh onRefresh={handleRefresh} className="space-y-6 sm:space-y-8">
      <PageHeader
        icon={BarChart2}
        title="Revenue Analytics"
        subtitle="Last 12 months · auto-refreshes every 5 minutes"
        iconBgClass="bg-green-100"
        iconColorClass="text-green-600"
        actions={
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportJson({ monthly, categoryTotals, topVendors })}
              className="h-9 rounded-xl gap-2"
            >
              <Download className="w-4 h-4" /> Export JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCsv(monthly)}
              className="h-9 rounded-xl gap-2"
            >
              <FileText className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Summary stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-0 shadow-md bg-gradient-to-br from-green-600 to-emerald-700 text-white overflow-hidden relative col-span-2 lg:col-span-1">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
          <CardContent className="p-5 relative">
            <p className="text-white/70 text-xs font-medium mb-1">{T("grandTotal")}</p>
            <h3 className="text-2xl font-bold">{formatCurrency(grandTotal)}</h3>
          </CardContent>
        </Card>

        <StatCard
          icon={TrendingUp}
          label={T("thisMonth")}
          value={formatCurrency(thisMonthTotal)}
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-600"
        />

        <StatCard
          icon={TrendingUp}
          label="Last Month"
          value={formatCurrency(lastMonthTotal)}
          iconBgClass="bg-slate-100"
          iconColorClass="text-slate-600"
        />

        <Card className="rounded-2xl border border-border/50 shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${growthPositive ? "bg-green-100" : "bg-red-100"}`}>
                {growthPositive
                  ? <TrendingUp className="w-5 h-5 text-green-600" />
                  : <TrendingDown className="w-5 h-5 text-red-600" />}
              </div>
            </div>
            <p className="text-xs text-muted-foreground font-medium">MoM Growth</p>
            <p className={`text-xl font-bold ${growthPositive ? "text-green-600" : "text-red-600"}`}>
              {growthPositive ? "+" : ""}{momGrowth.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly stacked bar chart */}
      <Card className="rounded-2xl border-border/50 shadow-sm p-4 sm:p-6">
        <h2 className="text-base sm:text-lg font-bold mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-green-600" /> {T("revenueBreakdown")}
        </h2>
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            No revenue data available yet
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  width={40}
                />
                <Tooltip
                  contentStyle={{ borderRadius: "12px", fontSize: "12px", border: "1px solid hsl(var(--border))" }}
                  formatter={(v: number | string, name: string) => [`Rs. ${Math.round(Number(v)).toLocaleString()}`, name]}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="Mart/Food" stackId="a" fill="#F97316" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Rides"     stackId="a" fill="#6366F1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Pharmacy"  stackId="a" fill="#22C55E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Category totals & Top Vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Category totals */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border/30 bg-card">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> Top Categories
            </h2>
          </div>
          <div className="divide-y divide-border/30">
            {[
              { label: `${T("mart")} / ${T("food")}`, value: categoryTotals.orders, share: ordersShare, icon: ShoppingBag, color: "bg-orange-100 text-orange-600", rank: 1 },
              { label: T("ride"),       value: categoryTotals.rides,    share: ridesShare,  icon: Car,   color: "bg-indigo-100 text-indigo-600", rank: 2 },
              { label: T("pharmacy"),   value: categoryTotals.pharmacy, share: pharmShare,  icon: Pill,  color: "bg-green-100 text-green-600",   rank: 3 },
            ]
              .sort((a, b) => b.value - a.value)
              .map((cat, idx) => {
                const Icon = cat.icon;
                return (
                  <div key={cat.label} className="px-4 sm:px-6 py-4 flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0
                      ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : "bg-orange-100 text-orange-600"}`}>
                      {idx + 1}
                    </span>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cat.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{cat.label}</p>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${cat.share}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm">{formatCurrency(cat.value)}</p>
                      <p className="text-xs text-muted-foreground">{cat.share}%</p>
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="px-4 sm:px-6 py-3 bg-muted/30 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{T("grandTotal")}</p>
            <p className="font-bold text-sm">{formatCurrency(grandTotal)}</p>
          </div>
        </Card>

        {/* Top Vendors */}
        <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border/30 bg-card">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> {T("topVendors")}
            </h2>
          </div>
          <div>
            {!topVendors.length ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{T("noVendorData")}</div>
            ) : topVendors.map((v, idx) => (
              <div key={v.id} className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-indigo-50/50 transition-colors">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0
                  ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : idx === 2 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"}`}>
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{v.name || v.phone}</p>
                  <p className="text-xs text-muted-foreground">{v.orderCount} {T("myOrders").toLowerCase()}</p>
                </div>
                <p className="font-bold text-sm text-foreground shrink-0">{formatCurrency(v.totalRevenue)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PullToRefresh>
  );
}
