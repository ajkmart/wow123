import { User, ShoppingBag, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/format";
import { SortHeader } from "./SortHeader";
import { STATUS_LABELS, allowedNext, PAGE_SIZES } from "./constants";
import type { SortKey, SortDir } from "./constants";
import type { TranslationKey } from "@workspace/i18n";

interface OrdersTableProps {
  isLoading: boolean;
  paginated: any[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onSelectOrder: (order: any) => void;
  onUpdateStatus: (id: string, status: string) => void;
  hasActiveFilters: boolean;
  clearAll: () => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  page: number;
  setPage: (v: number | ((p: number) => number)) => void;
  totalPages: number;
  safePage: number;
  sortedLength: number;
  toastFn: (opts: any) => void;
  T: (key: TranslationKey) => string;
}

export function OrdersTable({
  isLoading, paginated, sortKey, sortDir, onSort, onSelectOrder, onUpdateStatus,
  hasActiveFilters, clearAll, pageSize, setPageSize, page, setPage, totalPages, safePage, sortedLength, toastFn, T,
}: OrdersTableProps) {
  return (
    <Card className="hidden md:block rounded-2xl border-border/50 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead><SortHeader label={T("orderId")} sortKey="id" currentSort={sortKey} currentDir={sortDir} onSort={onSort} /></TableHead>
              <TableHead><SortHeader label={T("customer")} sortKey="customer" currentSort={sortKey} currentDir={sortDir} onSort={onSort} /></TableHead>
              <TableHead><SortHeader label={T("type")} sortKey="type" currentSort={sortKey} currentDir={sortDir} onSort={onSort} /></TableHead>
              <TableHead><SortHeader label={T("total")} sortKey="total" currentSort={sortKey} currentDir={sortDir} onSort={onSort} /></TableHead>
              <TableHead><SortHeader label={T("status")} sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={onSort} /></TableHead>
              <TableHead className="text-right"><SortHeader label={T("date")} sortKey="date" currentSort={sortKey} currentDir={sortDir} onSort={onSort} /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 6) }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-36 rounded-xl" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShoppingBag className="w-10 h-10 text-muted-foreground/25 mb-3" aria-hidden="true" />
                    <p className="font-semibold text-muted-foreground">No orders found</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {hasActiveFilters ? "Try adjusting your search or filters" : "No orders have been placed yet"}
                    </p>
                    {hasActiveFilters && (
                      <button onClick={clearAll} className="text-xs text-primary hover:underline mt-2">
                        Clear all filters
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((order: any) => (
                <TableRow
                  key={order.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => onSelectOrder(order)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Order ${order.id.slice(-8).toUpperCase()}`}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectOrder(order); } }}
                >
                  <TableCell>
                    <p className="font-mono font-medium text-sm">{order.id.slice(-8).toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{Array.isArray(order.items) ? `${order.items.length} items` : "N/A"}</p>
                  </TableCell>
                  <TableCell>
                    {order.userName ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0" aria-hidden="true">
                          <User className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate max-w-[140px]">{order.userName}</p>
                          <p className="text-xs text-muted-foreground">{order.userPhone}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Guest</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={order.type === "food" ? "default" : "secondary"} className="capitalize">
                      {order.type === "food" ? "\uD83C\uDF54 " : order.type === "pharmacy" ? "\uD83D\uDC8A " : "\uD83D\uDED2 "}{order.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-bold text-foreground">{formatCurrency(order.total)}</TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Select
                      value={order.status}
                      onValueChange={(val) => {
                        if (!allowedNext(order).includes(val)) {
                          toastFn({ title: "Invalid transition", description: `Can't move ${STATUS_LABELS[order.status]} to ${STATUS_LABELS[val]}`, variant: "destructive" }); return;
                        }
                        onUpdateStatus(order.id, val);
                      }}
                    >
                      <SelectTrigger className={`w-36 h-8 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider border-2 ${getStatusColor(order.status)}`} aria-label={`Status: ${STATUS_LABELS[order.status]}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedNext(order).map(s => (
                          <SelectItem key={s} value={s} className="text-xs uppercase font-bold">{STATUS_LABELS[s] ?? s.replace("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {!isLoading && sortedLength > 0 && (
        <nav className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border/30 bg-muted/20" aria-label="Table pagination">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-16 text-xs rounded-lg border-border/50" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => (
                  <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="hidden sm:inline">|</span>
            <span>
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedLength)} of {sortedLength}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setPage(1)} disabled={safePage <= 1} aria-label="First page">
              <ChevronsLeft className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setPage((p: number) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Page {safePage} of {totalPages}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page">
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} aria-label="Last page">
              <ChevronsRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </nav>
      )}
    </Card>
  );
}
