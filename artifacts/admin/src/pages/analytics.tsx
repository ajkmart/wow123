import { lazy, Suspense, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { BarChart2, Search, Heart } from "lucide-react";
import { StatCardSkeleton } from "@/components/shared";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const RevenueAnalytics = lazy(() => import("@/pages/revenue-analytics"));
const SearchAnalytics  = lazy(() => import("@/pages/search-analytics"));
const WishlistInsights = lazy(() => import("@/pages/wishlist-insights"));

const VALID_TABS = ["revenue", "search", "users"] as const;
type AnalyticsTab = (typeof VALID_TABS)[number];

function isValidTab(t: string | null): t is AnalyticsTab {
  return VALID_TABS.includes(t as AnalyticsTab);
}

function SuspenseFallback() {
  return (
    <div className="space-y-6 p-4">
      <div className="h-10 w-56 bg-muted animate-pulse rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <StatCardSkeleton key={i} />)}
      </div>
      <div className="h-64 bg-muted animate-pulse rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-48 bg-muted animate-pulse rounded-2xl" />
        <div className="h-48 bg-muted animate-pulse rounded-2xl" />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(rawSearch);
  const tabParam = params.get("tab");
  const activeTab: AnalyticsTab = isValidTab(tabParam) ? tabParam : "revenue";

  const setTab = (tab: AnalyticsTab) => {
    navigate(`/analytics?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    if (!isValidTab(tabParam)) {
      navigate("/analytics?tab=revenue", { replace: true });
    }
  }, [tabParam, navigate]);

  return (
    <div className="space-y-0">
      <Tabs value={activeTab} onValueChange={v => setTab(v as AnalyticsTab)}>
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50 px-4 pt-4 pb-0">
          <TabsList className="h-10 gap-1 bg-transparent p-0 border-0">
            <TabsTrigger
              value="revenue"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <BarChart2 className="h-4 w-4" />
              Revenue
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <Search className="h-4 w-4" />
              Search
            </TabsTrigger>
            <TabsTrigger
              value="users"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <Heart className="h-4 w-4" />
              Users & Wishlist
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="revenue" className="mt-0 p-4 md:p-6">
          <Suspense fallback={<SuspenseFallback />}>
            <RevenueAnalytics />
          </Suspense>
        </TabsContent>

        <TabsContent value="search" className="mt-0 p-4 md:p-6">
          <Suspense fallback={<SuspenseFallback />}>
            <SearchAnalytics />
          </Suspense>
        </TabsContent>

        <TabsContent value="users" className="mt-0 p-4 md:p-6">
          <Suspense fallback={<SuspenseFallback />}>
            <WishlistInsights />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
