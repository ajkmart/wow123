import { ShoppingBag, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/AdminShared";
import { formatCurrency, formatDate } from "@/lib/format";

interface OrdersMobileListProps {
  isLoading: boolean;
  paginated: any[];
  onSelectOrder: (order: any) => void;
  hasActiveFilters: boolean;
  clearAll: () => void;
  pageSize: number;
  page: number;
  setPage: (v: number | ((p: number) => number)) => void;
  totalPages: number;
  safePage: number;
  sortedLength: number;
}

export function OrdersMobileList({
  isLoading, paginated, onSelectOrder, hasActiveFilters, clearAll,
  pageSize, page, setPage, totalPages, safePage, sortedLength,
}: OrdersMobileListProps) {
  return (
    <section className="md:hidden space-y-3" aria-label="Orders list (mobile)">
      {isLoading ? (
        [1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" aria-hidden="true" />)
      ) : paginated.length === 0 ? (
        <Card className="rounded-2xl border-border/50 p-12 text-center">
          <ShoppingBag className="w-10 h-10 text-muted-foreground/25 mx-auto mb-3" aria-hidden="true" />
          <p className="font-semibold text-muted-foreground text-sm">No orders found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {hasActiveFilters ? "Try adjusting your filters" : "No orders have been placed yet"}
          </p>
          {hasActiveFilters && (
            <button onClick={clearAll} className="text-xs text-primary hover:underline mt-2">
              Clear all filters
            </button>
          )}
        </Card>
      ) : (
        paginated.map((order: any) => (
          <Card
            key={order.id}
            className="rounded-2xl border-border/50 shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
            onClick={() => onSelectOrder(order)}
            tabIndex={0}
            role="button"
            aria-label={`Order ${order.id.slice(-8).toUpperCase()}`}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectOrder(order); } }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-mono font-bold text-sm text-foreground">#{order.id.slice(-8).toUpperCase()}</p>
                  <Badge variant={order.type === "food" ? "default" : "secondary"} className="text-[10px] capitalize">
                    {order.type === "food" ? "\uD83C\uDF54" : order.type === "pharmacy" ? "\uD83D\uDC8A" : "\uD83D\uDED2"} {order.type}
                  </Badge>
                  <StatusBadge status={order.status} />
                  {order.gpsMismatch && <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1">GPS Mismatch</span>}
                </div>
                {order.userName && (
                  <p className="text-sm text-muted-foreground mt-1 truncate">
                    {order.userName}{order.userPhone ? ` \u00B7 ${order.userPhone}` : ""}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(order.createdAt)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-foreground">{formatCurrency(order.total)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{Array.isArray(order.items) ? `${order.items.length} items` : ""}</p>
              </div>
            </div>
          </Card>
        ))
      )}
      {!isLoading && sortedLength > pageSize && (
        <nav className="flex items-center justify-between gap-2 pt-2" aria-label="Mobile pagination">
          <span className="text-xs text-muted-foreground">
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedLength)} of {sortedLength}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-8 rounded-xl px-3" onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">{safePage}/{totalPages}</span>
            <Button variant="outline" size="sm" className="h-8 rounded-xl px-3" onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </nav>
      )}
    </section>
  );
}
