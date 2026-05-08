import { TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { TranslationKey } from "@workspace/i18n";

interface OrdersStatsCardsProps {
  totalCount: number;
  pendingCount: number;
  activeCount: number;
  deliveredCount: number;
  totalRevenue: number;
  T: (key: TranslationKey) => string;
}

export function OrdersStatsCards({ totalCount, pendingCount, activeCount, deliveredCount, totalRevenue, T }: OrdersStatsCardsProps) {
  return (
    <section aria-label="Order statistics">
      <h2 className="sr-only">Order Statistics</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center">
          <p className="text-3xl font-bold text-foreground">{totalCount}</p>
          <p className="text-xs text-muted-foreground mt-1">{T("totalOrders")}</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center bg-amber-50/60 border-amber-200/60">
          <p className="text-3xl font-bold text-amber-700">{pendingCount}</p>
          <p className="text-xs text-amber-600 mt-1">{T("pending")}</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center bg-blue-50/60 border-blue-200/60">
          <p className="text-3xl font-bold text-blue-700">{activeCount}</p>
          <p className="text-xs text-blue-500 mt-1">{T("activeNow")}</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center bg-green-50/60 border-green-200/60">
          <p className="text-3xl font-bold text-green-700">{deliveredCount}</p>
          <p className="text-xs text-green-500 mt-1">{T("delivered")}</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center bg-purple-50/60 border-purple-200/60 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold text-purple-700">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-purple-500 mt-1">{T("totalRevenue")}</p>
        </Card>
      </div>
    </section>
  );
}
