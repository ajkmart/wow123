import { lazy, Suspense, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { Send, Bell, BarChart2, Server } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Broadcast from "@/pages/broadcast";
import Notifications from "@/pages/notifications";

const Communication = lazy(() => import("@/pages/communication"));
const SmsGateways   = lazy(() => import("@/pages/sms-gateways"));

const VALID_TABS = ["send", "log", "kpis", "settings"] as const;
type CommTab = (typeof VALID_TABS)[number];

function isValidTab(t: string | null): t is CommTab {
  return VALID_TABS.includes(t as CommTab);
}

function SuspenseFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground text-sm animate-pulse">
      Loading…
    </div>
  );
}

export default function Communications() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(rawSearch);
  const tabParam = params.get("tab");
  const activeTab: CommTab = isValidTab(tabParam) ? tabParam : "send";

  const setTab = (tab: CommTab) => {
    navigate(`/communications?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    if (!isValidTab(tabParam)) {
      navigate("/communications?tab=send", { replace: true });
    }
  }, [tabParam, navigate]);

  return (
    <div className="space-y-0">
      <Tabs value={activeTab} onValueChange={v => setTab(v as CommTab)}>
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50 px-4 pt-4 pb-0">
          <TabsList className="h-10 gap-1 bg-transparent p-0 border-0">
            <TabsTrigger
              value="send"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <Send className="h-4 w-4" />
              Send Broadcast
            </TabsTrigger>
            <TabsTrigger
              value="log"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <Bell className="h-4 w-4" />
              Notifications Log
            </TabsTrigger>
            <TabsTrigger
              value="kpis"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <BarChart2 className="h-4 w-4" />
              Messaging KPIs
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <Server className="h-4 w-4" />
              SMS Gateways
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="send" className="mt-0 p-4 md:p-6">
          <Broadcast />
        </TabsContent>

        <TabsContent value="log" className="mt-0">
          <Notifications />
        </TabsContent>

        <TabsContent value="kpis" className="mt-0 p-4 md:p-6">
          <Suspense fallback={<SuspenseFallback />}>
            <Communication />
          </Suspense>
        </TabsContent>

        <TabsContent value="settings" className="mt-0 p-4 md:p-6">
          <Suspense fallback={<SuspenseFallback />}>
            <SmsGateways />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
