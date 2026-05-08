import { lazy, Suspense, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { Shield, Settings2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const AccountConditions = lazy(() => import("@/pages/account-conditions"));
const ConditionRules    = lazy(() => import("@/pages/condition-rules"));

const VALID_TABS = ["conditions", "rules"] as const;
type BusinessRulesTab = (typeof VALID_TABS)[number];

function isValidTab(t: string | null): t is BusinessRulesTab {
  return VALID_TABS.includes(t as BusinessRulesTab);
}

function SuspenseFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground text-sm animate-pulse">
      Loading…
    </div>
  );
}

export default function BusinessRulesPage() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(rawSearch);
  const tabParam = params.get("tab");
  const activeTab: BusinessRulesTab = isValidTab(tabParam) ? tabParam : "conditions";

  const setTab = (tab: BusinessRulesTab) => {
    navigate(`/business-rules?tab=${tab}`, { replace: true });
  };

  useEffect(() => {
    if (!isValidTab(tabParam)) {
      navigate("/business-rules?tab=conditions", { replace: true });
    }
  }, [tabParam, navigate]);

  return (
    <div className="space-y-0">
      <Tabs value={activeTab} onValueChange={v => setTab(v as BusinessRulesTab)}>
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50 px-4 pt-4 pb-0">
          <TabsList className="h-10 gap-1 bg-transparent p-0 border-0">
            <TabsTrigger
              value="conditions"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <Shield className="h-4 w-4" />
              Account Conditions
            </TabsTrigger>
            <TabsTrigger
              value="rules"
              className="flex items-center gap-1.5 h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
            >
              <Settings2 className="h-4 w-4" />
              Automation Rules
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="conditions" className="mt-0 p-4 md:p-6">
          <Suspense fallback={<SuspenseFallback />}>
            <AccountConditions />
          </Suspense>
        </TabsContent>

        <TabsContent value="rules" className="mt-0 p-4 md:p-6">
          <Suspense fallback={<SuspenseFallback />}>
            <ConditionRules />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
