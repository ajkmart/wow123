import { Search, CalendarDays, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface OrdersFilterBarProps {
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  clearAll: () => void;
}

const TYPE_FILTERS = [
  { key: "all", label: "All", emoji: "" },
  { key: "mart", label: "Mart", emoji: "\uD83D\uDED2 " },
  { key: "food", label: "Food", emoji: "\uD83C\uDF54 " },
  { key: "pharmacy", label: "Pharmacy", emoji: "\uD83D\uDC8A " },
];

const STATUS_FILTERS = [
  { key: "all", label: "All", cls: "border-border/50 text-muted-foreground hover:border-primary" },
  { key: "active", label: "Active", cls: "border-blue-300 text-blue-700 bg-blue-50" },
  { key: "pending", label: "Pending", cls: "border-amber-300 text-amber-700 bg-amber-50" },
  { key: "preparing", label: "Preparing", cls: "border-orange-300 text-orange-700 bg-orange-50" },
  { key: "ready", label: "Ready", cls: "border-emerald-300 text-emerald-700 bg-emerald-50" },
  { key: "picked_up", label: "Picked Up", cls: "border-cyan-300 text-cyan-700 bg-cyan-50" },
  { key: "out_for_delivery", label: "Delivering", cls: "border-indigo-300 text-indigo-700 bg-indigo-50" },
  { key: "delivered", label: "Delivered", cls: "border-green-300 text-green-700 bg-green-50" },
  { key: "cancelled", label: "Cancelled", cls: "border-red-300 text-red-600 bg-red-50" },
];

export function OrdersFilterBar({
  search, setSearch, statusFilter, setStatusFilter, typeFilter, setTypeFilter,
  dateFrom, setDateFrom, dateTo, setDateTo, filteredCount, totalCount, hasActiveFilters, clearAll,
}: OrdersFilterBarProps) {
  return (
    <Card className="p-3 sm:p-4 rounded-2xl border-border/50 shadow-sm space-y-3" role="search" aria-label="Order filters">
      <h2 className="sr-only">Filter Orders</h2>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search by Order ID, name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 sm:h-11 rounded-xl bg-muted/30 border-border/50 text-sm"
            aria-label="Search orders"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-xl bg-muted/30 border-border/50 text-xs w-[130px]" aria-label="From date" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 rounded-xl bg-muted/30 border-border/50 text-xs w-[130px]" aria-label="To date" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-primary hover:underline shrink-0 min-h-[36px] px-1" aria-label="Clear date filters">Clear</button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by order type">
        {TYPE_FILTERS.map(t => (
          <button
            key={t.key}
            onClick={() => setTypeFilter(t.key)}
            className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold capitalize transition-colors border min-h-[36px] ${
              typeFilter === t.key ? "bg-primary text-white border-primary" : "bg-muted/30 border-border/50 text-muted-foreground hover:border-primary"
            }`}
            aria-pressed={typeFilter === t.key}
          >
            {t.emoji}{t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by order status">
        {STATUS_FILTERS.map(({ key, label, cls }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors min-h-[36px] ${
              statusFilter === key ? "bg-primary text-white border-primary" : `bg-muted/30 ${cls}`
            }`}
            aria-pressed={statusFilter === key}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
        <span aria-live="polite">Showing {filteredCount} of {totalCount} orders</span>
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-primary hover:underline min-h-[36px]"
            aria-label="Clear all filters"
          >
            <XCircle className="w-3 h-3" aria-hidden="true" /> Clear all filters
          </button>
        )}
      </div>
    </Card>
  );
}
