import { useState } from "react";
import { adminAbsoluteFetch, adminFetch } from "@/lib/adminFetcher";
import { PageHeader } from "@/components/shared";
import { useQuery } from "@tanstack/react-query";
import {
  Search, TrendingUp, Eye, Heart, ShoppingCart, Star,
  RefreshCw, BarChart2, Package, Percent, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, LineChart, Line, Legend, AreaChart, Area,
} from "recharts";

import { SafeImage } from "@/components/ui/SafeImage";

async function apiFetch(path: string) {
  return adminAbsoluteFetch(`/api${path}`);
}

type TrendingProduct = {
  id: string;
  name: string;
  price: number;
  category?: string;
  image?: string;
  rating?: number;
  vendorName?: string;
  score?: number;
  reason?: string;
};

type TopTerm = {
  query: string;
  occurrences: number;
  zeroResults: number;
};

type ZeroResultQuery = {
  query: string;
  occurrences: number;
  lastSearchedAt: string;
};

type StatsData = {
  productCount?: number;
  restaurantCount?: number;
  userCount?: number;
  orderCount?: number;
};

type InteractionTimelineEntry = {
  date: string;
  view: number;
  cart: number;
  purchase: number;
  wishlist: number;
  total: number;
};

type InteractionStats = {
  views: number;
  carts: number;
  purchases: number;
  wishlists: number;
  conversionRate: number;
  cartRate: number;
  days: number;
};

const INTERACTION_COLORS: Record<string, string> = {
  view: "text-blue-600 bg-blue-50",
  wishlist: "text-pink-600 bg-pink-50",
  cart: "text-purple-600 bg-purple-50",
  purchase: "text-green-600 bg-green-50",
  rating: "text-amber-600 bg-amber-50",
  trending: "text-orange-600 bg-orange-50",
};

const CHART_COLORS = [
  "#f59e0b", "#6366f1", "#10b981", "#f43f5e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType; color: string; sub?: string;
}) {
  const bg = color.includes("blue") ? "bg-blue-50 border-blue-100"
    : color.includes("green") ? "bg-green-50 border-green-100"
    : color.includes("purple") ? "bg-purple-50 border-purple-100"
    : "bg-amber-50 border-amber-100";
  return (
    <div className={cn("rounded-2xl border p-4 flex items-center gap-3", bg)}>
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-800 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

const BarTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullTerm?: string; fullName?: string }; name: string; value: number; color: string }> }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-gray-800 mb-0.5">{d?.payload?.fullTerm ?? d?.payload?.fullName}</p>
      <p style={{ color: d?.color }}>{d?.name}: <span className="font-bold">{d?.value}</span></p>
    </div>
  );
};

export default function SearchAnalyticsPage() {
  const [trendingPeriod, setTrendingPeriod] = useState("7d");
  const [timelineDays, setTimelineDays] = useState("30");

  const { data: trendingData, isLoading: trendLoading, refetch: refetchTrending } = useQuery<{ products: TrendingProduct[] }>({
    queryKey: ["admin-trending-products", trendingPeriod],
    queryFn: () => apiFetch(`/recommendations/trending?limit=20&days=${trendingPeriod.replace("d", "")}`),
    staleTime: 5 * 60_000,
  });

  const { data: trendingSearchData, isLoading: searchLoading } = useQuery<{ searches: string[] }>({
    queryKey: ["admin-trending-searches"],
    queryFn: () => apiFetch("/products/trending-searches?limit=20"),
    staleTime: 5 * 60_000,
  });

  const [termsDays, setTermsDays] = useState("30");
  const { data: topTermsData, isLoading: topTermsLoading } = useQuery<{ terms: TopTerm[] }>({
    queryKey: ["admin-search-top-terms", termsDays],
    queryFn: () => adminFetch(`/search-analytics/top-terms?days=${termsDays}&limit=30`),
    staleTime: 2 * 60_000,
  });

  const [zeroDays, setZeroDays] = useState("30");
  const { data: zeroResultsData, isLoading: zeroResultsLoading } = useQuery<{ queries: ZeroResultQuery[] }>({
    queryKey: ["admin-search-zero-results", zeroDays],
    queryFn: () => adminFetch(`/search-analytics/zero-results?days=${zeroDays}&limit=50`),
    staleTime: 2 * 60_000,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<StatsData>({
    queryKey: ["admin-platform-stats"],
    queryFn: () => apiFetch("/stats/public"),
    staleTime: 5 * 60_000,
  });

  const { data: timelineData, isLoading: timelineLoading } = useQuery<{ timeline: InteractionTimelineEntry[] }>({
    queryKey: ["admin-interaction-timeline", timelineDays],
    queryFn: () => adminFetch(`/search-analytics/interaction-timeline?days=${timelineDays}`),
    staleTime: 5 * 60_000,
  });

  const { data: statsInteraction, isLoading: interactionStatsLoading } = useQuery<InteractionStats>({
    queryKey: ["admin-interaction-stats", timelineDays],
    queryFn: () => adminFetch(`/search-analytics/interaction-stats?days=${timelineDays}`),
    staleTime: 5 * 60_000,
  });

  const trending: TrendingProduct[] = trendingData?.products ?? [];
  const searchTerms: string[] = Array.isArray(trendingSearchData?.searches) ? trendingSearchData.searches : [];
  const topTerms: TopTerm[] = topTermsData?.terms ?? [];
  const zeroQueries: ZeroResultQuery[] = zeroResultsData?.queries ?? [];
  const timeline: InteractionTimelineEntry[] = timelineData?.timeline ?? [];

  // Use real top-terms if available, fall back to trending-searches for the chart
  const chartTerms = topTerms.length > 0 ? topTerms.slice(0, 12) : searchTerms.slice(0, 12).map(t => ({ query: t, occurrences: 1, zeroResults: 0 }));

  // Bar chart data for search terms — real occurrence counts
  const searchChartData = chartTerms.map(t => ({
    term: t.query.length > 14 ? t.query.slice(0, 12) + "…" : t.query,
    fullTerm: t.query,
    occurrences: t.occurrences,
  }));

  // Product score chart data
  const productChartData = trending.slice(0, 10).map(p => ({
    name: p.name.length > 14 ? p.name.slice(0, 12) + "…" : p.name,
    fullName: p.name,
    score: p.score !== undefined ? Math.round(p.score) : 0,
  }));

  const convRate = statsInteraction?.conversionRate ?? 0;
  const cartRate = statsInteraction?.cartRate ?? 0;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        icon={BarChart2}
        title="Search & Engagement Analytics"
        subtitle="What customers are searching, viewing, and engaging with most"
        iconBgClass="bg-blue-100"
        iconColorClass="text-blue-600"
        actions={
          <div className="flex items-center gap-2">
            <Select value={timelineDays} onValueChange={setTimelineDays}>
              <SelectTrigger className="h-8 w-28 rounded-xl text-xs border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetchTrending()} className="h-8 rounded-xl gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Products" value={statsLoading ? "…" : statsData?.productCount?.toLocaleString() ?? "—"} icon={Package} color="text-blue-600" />
        <StatCard label="Restaurants" value={statsLoading ? "…" : statsData?.restaurantCount?.toLocaleString() ?? "—"} icon={TrendingUp} color="text-green-600" />
        <StatCard label="Trending Items" value={trending.length} icon={TrendingUp} color="text-purple-600" />
        <StatCard label="Search Terms" value={searchTerms.length} icon={Search} color="text-amber-600" />
      </div>

      {/* Conversion Rate & Engagement Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {interactionStatsLoading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)
        ) : (
          <>
            <div className="rounded-2xl border bg-blue-50 border-blue-100 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Eye className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{(statsInteraction?.views ?? 0).toLocaleString()}</p>
                <p className="text-[11px] text-gray-500">Product Views</p>
                <p className="text-[10px] text-gray-400">last {timelineDays}d</p>
              </div>
            </div>
            <div className="rounded-2xl border bg-purple-50 border-purple-100 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <ShoppingCart className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{cartRate.toFixed(1)}%</p>
                <p className="text-[11px] text-gray-500">Cart Rate</p>
                <p className="text-[10px] text-gray-400">{(statsInteraction?.carts ?? 0).toLocaleString()} cart adds</p>
              </div>
            </div>
            <div className="rounded-2xl border bg-green-50 border-green-100 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <Percent className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{convRate.toFixed(1)}%</p>
                <p className="text-[11px] text-gray-500">Conversion Rate</p>
                <p className="text-[10px] text-gray-400">{(statsInteraction?.purchases ?? 0).toLocaleString()} purchases</p>
              </div>
            </div>
            <div className="rounded-2xl border bg-pink-50 border-pink-100 p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center shrink-0">
                <Heart className="w-4 h-4 text-pink-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{(statsInteraction?.wishlists ?? 0).toLocaleString()}</p>
                <p className="text-[11px] text-gray-500">Wishlist Saves</p>
                <p className="text-[10px] text-gray-400">last {timelineDays}d</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Engagement Over Time — Line Chart */}
      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-indigo-50 to-blue-50">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-sm text-gray-800">Product Engagement Over Time</span>
          </div>
          <span className="text-xs text-gray-400">Last {timelineDays} days · views, cart adds & purchases</span>
        </div>
        <CardContent className="p-4">
          {timelineLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm animate-pulse">Loading…</div>
          ) : timeline.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
              <BarChart2 className="w-8 h-8 opacity-20" />
              <p className="text-sm">No engagement data for this period yet</p>
              <p className="text-xs text-gray-300">Data populates as customers interact with products</p>
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="viewGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="view"     name="Views"     stroke="#6366f1" fill="url(#viewGrad)"     strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="cart"     name="Cart Adds" stroke="#8b5cf6" fill="url(#cartGrad)"     strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="purchase" name="Purchases"  stroke="#10b981" fill="url(#purchaseGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts row — Search Terms + Product Scores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Search Terms Bar Chart */}
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-orange-50 to-amber-50">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-orange-600" />
              <span className="font-semibold text-sm text-gray-800">Top Search Terms</span>
            </div>
            <Select value={termsDays} onValueChange={setTermsDays}>
              <SelectTrigger className="h-7 w-20 text-xs rounded-lg border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CardContent className="p-4">
            {topTermsLoading ? (
              <div className="flex items-center justify-center h-52 text-gray-400 text-sm animate-pulse">Loading…</div>
            ) : searchChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-2">
                <Search className="w-8 h-8 opacity-20" />
                <p className="text-sm">No search data yet</p>
              </div>
            ) : (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={searchChartData} layout="vertical" margin={{ top: 0, right: 20, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="term" width={80}
                        tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<BarTooltip />} cursor={{ fill: "#fef9f0" }} />
                      <Bar dataKey="occurrences" name="Searches" radius={[0, 6, 6, 0]} barSize={14}>
                        {searchChartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-gray-400 text-right mt-1">Based on real search events (last {termsDays} days)</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Trending Product Scores */}
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="font-semibold text-sm text-gray-800">Trending Product Scores</span>
            </div>
            <Select value={trendingPeriod} onValueChange={setTrendingPeriod}>
              <SelectTrigger className="h-7 w-20 text-xs rounded-lg border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Today</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CardContent className="p-4">
            {trendLoading ? (
              <div className="flex items-center justify-center h-52 text-gray-400 text-sm animate-pulse">Loading…</div>
            ) : productChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-gray-400 gap-2">
                <Package className="w-8 h-8 opacity-20" />
                <p className="text-sm">No trending data yet</p>
              </div>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productChartData} margin={{ top: 4, right: 4, left: 0, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#374151" }}
                      axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: "#f5f3ff" }} />
                    <Bar dataKey="score" name="Trending Score" radius={[6, 6, 0, 0]} barSize={20}>
                      {productChartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Zero-Results Searches */}
      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-red-50 to-rose-50">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="font-semibold text-sm text-gray-800">Zero-Result Searches</span>
            <Badge variant="secondary" className="text-xs">{zeroQueries.length}</Badge>
          </div>
          <Select value={zeroDays} onValueChange={setZeroDays}>
            <SelectTrigger className="h-7 w-20 text-xs rounded-lg border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          {zeroResultsLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">Loading…</div>
          ) : zeroQueries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
              <AlertCircle className="w-8 h-8 opacity-20" />
              <p className="text-sm">No zero-result searches in the last {zeroDays} days</p>
              <p className="text-xs text-gray-400">Great — your inventory is covering all searches!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Query</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Searches</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Last Searched</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroQueries.map((row, i) => (
                    <tr key={row.query} className={cn("border-b last:border-0 hover:bg-red-50/40 transition-colors", i % 2 === 0 ? "" : "bg-gray-50/50")}>
                      <td className="px-4 py-2.5 font-medium text-gray-800 flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                        {row.query}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge variant="secondary" className="text-xs bg-red-50 text-red-700 border-red-100">
                          {row.occurrences}×
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                        {new Date(row.lastSearchedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10px] text-gray-400 px-4 py-2 text-right">
                Queries that returned 0 products — add inventory to cover these gaps.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranked lists */}
      <div className="grid md:grid-cols-2 gap-5">
        {/* Top Search Terms List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-orange-50 to-amber-50">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-orange-600" />
              <span className="font-semibold text-sm text-gray-800">Top Search Terms</span>
            </div>
            <Badge variant="secondary" className="text-xs">{topTerms.length || searchTerms.length}</Badge>
          </div>
          <div className="p-3">
            {topTermsLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
            ) : topTerms.length === 0 && searchTerms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
                <Search className="w-8 h-8 opacity-20" />
                <p className="text-sm">No search data yet</p>
              </div>
            ) : topTerms.length > 0 ? (
              <div className="space-y-1.5">
                {topTerms.slice(0, 15).map((term, i) => (
                  <div key={term.query} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                    <span className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      i === 0 ? "bg-amber-100 text-amber-700"
                        : i === 1 ? "bg-gray-100 text-gray-600"
                        : i === 2 ? "bg-orange-100 text-orange-700"
                        : "bg-gray-50 text-gray-400"
                    )}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-700 truncate">{term.query}</span>
                    <span className="text-xs text-gray-400 shrink-0">{term.occurrences}×</span>
                    <TrendingUp className={cn("w-3.5 h-3.5 shrink-0", i < 3 ? "text-orange-500" : "text-gray-300")} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {searchTerms.slice(0, 15).map((term, i) => (
                  <div key={term} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                    <span className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      i === 0 ? "bg-amber-100 text-amber-700"
                        : i === 1 ? "bg-gray-100 text-gray-600"
                        : i === 2 ? "bg-orange-100 text-orange-700"
                        : "bg-gray-50 text-gray-400"
                    )}>
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-gray-700 truncate">{term}</span>
                    <TrendingUp className={cn("w-3.5 h-3.5 shrink-0", i < 3 ? "text-orange-500" : "text-gray-300")} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Trending Products List */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="font-semibold text-sm text-gray-800">Trending Products</span>
            </div>
            <Select value={trendingPeriod} onValueChange={setTrendingPeriod}>
              <SelectTrigger className="h-7 w-20 text-xs rounded-lg border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Today</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="p-3">
            {trendLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
            ) : trending.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
                <Package className="w-8 h-8 opacity-20" />
                <p className="text-sm">No trending data yet</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {trending.slice(0, 10).map((product, i) => (
                  <div key={product.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors">
                    <span className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                      i === 0 ? "bg-purple-100 text-purple-700"
                        : i === 1 ? "bg-indigo-100 text-indigo-700"
                        : i === 2 ? "bg-blue-100 text-blue-700"
                        : "bg-gray-50 text-gray-400"
                    )}>
                      {i + 1}
                    </span>
                    {product.image ? (
                      <SafeImage src={product.image} alt={product.name} className="w-8 h-8 rounded-lg object-cover shrink-0 border" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{product.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {product.vendorName && `${product.vendorName} · `}Rs. {product.price?.toLocaleString()}
                      </p>
                    </div>
                    {product.score !== undefined && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {Math.round(product.score)} pts
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Engagement Guide */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-teal-50 to-green-50">
          <Eye className="w-4 h-4 text-teal-600" />
          <span className="font-semibold text-sm text-gray-800">Customer Engagement Guide</span>
        </div>
        <div className="p-4 grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { type: "view",     label: "Product Views",   desc: "How many times products are opened and viewed by customers",        icon: Eye },
            { type: "wishlist", label: "Wishlist Adds",   desc: "Products customers save to view later — shows purchase intent",     icon: Heart },
            { type: "cart",     label: "Cart Adds",       desc: "Products added to cart — high conversion intent",                  icon: ShoppingCart },
            { type: "trending", label: "Trending Score",  desc: "Combined score based on views, cart adds, and purchases",          icon: TrendingUp },
            { type: "rating",   label: "Product Ratings", desc: "Customer satisfaction signals from product reviews",               icon: Star },
            { type: "purchase", label: "Conversions",     desc: "Products that led to completed orders",                           icon: ShoppingCart },
          ].map(item => {
            const Icon = item.icon;
            const colorClass = INTERACTION_COLORS[item.type] || "text-gray-600 bg-gray-50";
            return (
              <div key={item.type} className="flex gap-3 items-start p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", colorClass)}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
