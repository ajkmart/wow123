import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrdersEnriched, useOrdersStats, fetchOrdersExport, useUpdateOrder, useAssignRider, useRiders, useOrderRefund } from "@/hooks/use-admin";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, Download, RefreshCw, AlertTriangle } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageHeader, ActionBar } from "@/components/shared";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PullToRefresh } from "@/components/PullToRefresh";
import { STATUS_LABELS, exportOrdersCSV } from "./constants";
import type { SortKey, SortDir } from "./constants";
import { OrdersStatsCards } from "./OrdersStatsCards";
import { OrdersFilterBar } from "./OrdersFilterBar";
import { OrdersTable } from "./OrdersTable";
import { OrdersMobileList } from "./OrdersMobileList";
import { OrderDetailDrawer } from "./OrderDetailDrawer";
import { DeliverConfirmDialog } from "./DeliverConfirmDialog";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function Orders() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data: ridersData } = useRiders();
  const updateMutation = useUpdateOrder();
  const assignMutation = useAssignRider();
  const refundMutation = useOrderRefund();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [showAssignRider, setShowAssignRider] = useState(false);
  const [riderSearch, setRiderSearch] = useState("");
  const [showDeliverConfirm, setShowDeliverConfirm] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const debouncedSearch = useDebouncedValue(search, 300);

  const serverFilters = useMemo(() => ({
    status: statusFilter,
    type: typeFilter,
    search: debouncedSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: pageSize,
    sortBy: sortKey,
    sortDir,
  }), [statusFilter, typeFilter, debouncedSearch, dateFrom, dateTo, page, pageSize, sortKey, sortDir]);

  const { data, isLoading, isError, error, dataUpdatedAt, refetch, isFetching } = useOrdersEnriched(serverFilters);
  const { data: statsData } = useOrdersStats();

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }, [sortKey]);

  const handleUpdateStatus = useCallback((id: string, status: string, extra?: { localUpdate?: any }) => {
    if (status === "delivered" && !extra?.localUpdate) {
      setShowDeliverConfirm(id);
      return;
    }
    updateMutation.mutate({ id, status }, {
      onSuccess: () => {
        toast({ title: `Order status updated to ${STATUS_LABELS[status] ?? status}` });
        setSelectedOrder((prev: any) => prev?.id === id ? ({ ...prev, status, updatedAt: new Date().toISOString() }) : prev);
      },
      onError: (err) => toast({ title: "Update failed", description: err.message, variant: "destructive" })
    });
  }, [updateMutation, toast]);

  const confirmDeliver = useCallback(() => {
    if (!showDeliverConfirm) return;
    const id = showDeliverConfirm;
    setShowDeliverConfirm(null);
    updateMutation.mutate({ id, status: "delivered" }, {
      onSuccess: () => {
        toast({ title: "Order marked as Delivered" });
        setSelectedOrder((prev: any) => prev?.id === id ? ({ ...prev, status: "delivered", updatedAt: new Date().toISOString() }) : prev);
      },
      onError: (err) => toast({ title: "Update failed", description: err.message, variant: "destructive" })
    });
  }, [showDeliverConfirm, updateMutation, toast]);

  const handleCancelOrder = useCallback(() => {
    if (!selectedOrder) return;
    setCancelling(true);
    updateMutation.mutate({ id: selectedOrder.id, status: "cancelled" }, {
      onSuccess: () => {
        setSelectedOrder((p: any) => ({ ...p, status: "cancelled", updatedAt: new Date().toISOString() }));
        setShowCancelConfirm(false);
        setCancelling(false);
        toast({ title: "Order cancelled" + (selectedOrder.paymentMethod === "wallet" ? " — Wallet refund issued" : "") });
      },
      onError: (err) => {
        setCancelling(false);
        toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
      },
    });
  }, [selectedOrder, updateMutation, toast]);

  const handleRefundOrder = useCallback((prefilledAmount?: number, prefilledReason?: string) => {
    if (!selectedOrder) return;
    // Pre-fill state if called from ReturnPanel with an approved return amount/reason
    const finalAmount = prefilledAmount ?? parseFloat(refundAmount);
    const finalReason = prefilledReason ?? refundReason.trim();
    if (!Number.isFinite(finalAmount) || finalAmount <= 0 || finalAmount > (selectedOrder.total || 0)) return;
    if (prefilledAmount !== undefined) {
      setRefundAmount(String(prefilledAmount));
      setRefundReason(prefilledReason ?? "");
    }
    const amt = finalAmount;
    refundMutation.mutate({ id: selectedOrder.id, amount: amt, reason: finalReason || undefined }, {
      onSuccess: (res: any) => {
        toast({ title: "Refund issued", description: `${formatCurrency(Math.round(res.refundedAmount))} credited to customer wallet` });
        setShowRefundConfirm(false);
        setRefundAmount("");
        setRefundReason("");
      },
      onError: (err: any) => toast({ title: "Refund failed", description: err.message, variant: "destructive" }),
    });
  }, [selectedOrder, refundAmount, refundReason, refundMutation, toast]);

  const handleAssignRider = useCallback((rider: any) => {
    if (!selectedOrder) return;
    assignMutation.mutate({ orderId: selectedOrder.id, riderId: rider.id, riderName: rider.name || rider.phone, riderPhone: rider.phone }, {
      onSuccess: () => {
        toast({ title: "Rider assigned", description: `${rider.name || rider.phone} assigned to order` });
        setSelectedOrder((p: any) => ({ ...p, riderId: rider.id, riderName: rider.name || rider.phone }));
        setShowAssignRider(false);
      },
      onError: e => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  }, [selectedOrder, assignMutation, toast]);

  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const result = await fetchOrdersExport({
        status: statusFilter,
        type: typeFilter,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sortBy: sortKey,
        sortDir,
      });
      exportOrdersCSV(result.orders || []);
      toast({ title: "CSV exported", description: `${(result.orders || []).length} orders exported` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }, [statusFilter, typeFilter, debouncedSearch, dateFrom, dateTo, sortKey, sortDir, toast]);

  const orders = useMemo<any[]>(() => Array.isArray(data?.orders) ? data.orders : [], [data?.orders]);
  const serverTotal: number = typeof data?.total === "number" ? data.total : orders.length;

  const liveSelectedOrder = selectedOrder
    ? orders.find((o: any) => o.id === selectedOrder.id) ?? selectedOrder
    : null;

  const totalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, dateFrom, dateTo]);

  const allTotal: number = statsData?.total ?? 0;
  const pendingCount: number = statsData?.pending ?? 0;
  const activeCount: number = statsData?.active ?? 0;
  const deliveredCount: number = statsData?.delivered ?? 0;
  const totalRevenue: number = statsData?.totalRevenue ?? 0;

  const pendingOrders = useMemo(() => orders.filter((o: any) => o.status === "pending"), [orders]);


  const qc = useQueryClient();
  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] }),
      qc.invalidateQueries({ queryKey: ["admin-orders-stats"] }),
    ]);
  }, [qc]);

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || !!dateFrom || !!dateTo || !!search;

  const clearAllFilters = useCallback(() => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  }, []);

  const handleSelectOrder = useCallback((order: any) => {
    setSelectedOrder(order);
    setShowCancelConfirm(false);
  }, []);

  return (
    <ErrorBoundary fallback={<div className="p-8 text-center text-sm text-red-500">Orders page crashed. Please reload.</div>}>
    <PullToRefresh onRefresh={handlePullRefresh} className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={ShoppingBag}
        title={T("martFoodOrders")}
        subtitle={`${allTotal} ${T("total")} · ${pendingCount} ${T("pending")} · ${deliveredCount} ${T("delivered")}`}
        iconBgClass="bg-indigo-100"
        iconColorClass="text-indigo-600"
        actions={
          <LastUpdated dataUpdatedAt={dataUpdatedAt ?? 0} onRefresh={() => refetch()} isRefreshing={isFetching} />
        }
      />

      <ActionBar
        secondary={
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={exporting} className="h-9 rounded-xl gap-2" aria-label="Export orders as CSV">
            <Download className="w-4 h-4" aria-hidden="true" /> {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        }
      />

      {pendingCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-400 rounded-2xl px-4 py-3" role="alert">
          <span className="text-2xl shrink-0" aria-hidden="true">📦</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-800">
              {pendingCount} new order{pendingCount > 1 ? "s" : ""} waiting for confirmation!
            </p>
            <p className="text-xs text-amber-600 truncate">
              {pendingOrders.slice(0, 3).map((o: any) => `#${o.id.slice(-6).toUpperCase()} (${o.type})`).join(" · ")}
              {pendingOrders.length > 3 ? ` +${pendingOrders.length - 3} more` : ""}
            </p>
          </div>
          <button
            onClick={() => setStatusFilter("pending")}
            className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-xl whitespace-nowrap hover:bg-amber-600 transition-colors min-h-[36px]"
            aria-label="Filter to show pending orders"
          >
            View All
          </button>
        </div>
      )}

      <OrdersStatsCards
        totalCount={allTotal}
        pendingCount={pendingCount}
        activeCount={activeCount}
        deliveredCount={deliveredCount}
        totalRevenue={totalRevenue}
        T={T}
      />

      <OrdersFilterBar
        search={search}
        setSearch={setSearch}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        filteredCount={serverTotal}
        totalCount={allTotal}
        hasActiveFilters={hasActiveFilters}
        clearAll={clearAllFilters}
      />

      {isError && orders.length === 0 && (
        <Card className="rounded-2xl border-red-200 bg-red-50 p-6 text-center space-y-3" role="alert">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" aria-hidden="true" />
          <p className="font-semibold text-red-700">Failed to load orders</p>
          <p className="text-xs text-red-500">{(error as Error)?.message || "An unexpected error occurred"}</p>
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] })} className="rounded-xl gap-2">
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Retry
          </Button>
        </Card>
      )}

      {isError && orders.length > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600" role="alert">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Failed to refresh — showing cached data.</span>
          <button onClick={() => qc.invalidateQueries({ queryKey: ["admin-orders-enriched"] })} className="text-primary font-semibold hover:underline ml-auto min-h-[36px]">Retry</button>
        </div>
      )}

      {!(isError && orders.length === 0) && (
        <OrdersTable
          isLoading={isLoading}
          paginated={orders}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onSelectOrder={handleSelectOrder}
          onUpdateStatus={handleUpdateStatus}
          hasActiveFilters={hasActiveFilters}
          clearAll={clearAllFilters}
          pageSize={pageSize}
          setPageSize={setPageSize}
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          safePage={safePage}
          sortedLength={serverTotal}
          toastFn={toast}
          T={T}
        />
      )}

      {!(isError && orders.length === 0) && (
        <OrdersMobileList
          isLoading={isLoading}
          paginated={orders}
          onSelectOrder={handleSelectOrder}
          hasActiveFilters={hasActiveFilters}
          clearAll={clearAllFilters}
          pageSize={pageSize}
          page={page}
          setPage={setPage}
          totalPages={totalPages}
          safePage={safePage}
          sortedLength={serverTotal}
        />
      )}

      {showDeliverConfirm && (
        <DeliverConfirmDialog
          orderId={showDeliverConfirm}
          isPending={updateMutation.isPending}
          onConfirm={confirmDeliver}
          onClose={() => setShowDeliverConfirm(null)}
        />
      )}

      <OrderDetailDrawer
        selectedOrder={liveSelectedOrder}
        onClose={() => { setSelectedOrder(null); setShowCancelConfirm(false); setShowRefundConfirm(false); }}
        showCancelConfirm={showCancelConfirm}
        setShowCancelConfirm={setShowCancelConfirm}
        showRefundConfirm={showRefundConfirm}
        setShowRefundConfirm={setShowRefundConfirm}
        refundAmount={refundAmount}
        setRefundAmount={setRefundAmount}
        refundReason={refundReason}
        setRefundReason={setRefundReason}
        cancelling={cancelling}
        onCancelOrder={handleCancelOrder}
        onRefundOrder={handleRefundOrder}
        refundPending={refundMutation.isPending}
        showAssignRider={showAssignRider}
        setShowAssignRider={setShowAssignRider}
        riderSearch={riderSearch}
        setRiderSearch={setRiderSearch}
        ridersData={ridersData}
        onAssignRider={handleAssignRider}
        assignPending={assignMutation.isPending}
        onUpdateStatus={handleUpdateStatus}
        onDeliverConfirm={(id: string) => setShowDeliverConfirm(id)}
      />
    </PullToRefresh>
    </ErrorBoundary>
  );
}
