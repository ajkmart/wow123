import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Store, Search, RefreshCw, Wallet, TrendingUp, ShoppingBag,
  CheckCircle2, XCircle, Ban, CircleDollarSign, CreditCard, Clock, ClipboardList,
  Package, Phone, ToggleLeft, ToggleRight, AlertTriangle, X, MessageCircle, Settings2,
  Download, CalendarDays, Percent, Truck, Gavel, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { PageHeader, StatCard, FilterBar } from "@/components/shared";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useVendors, useUpdateVendorStatus, useVendorPayout, useVendorCredit, usePlatformSettings, useVendorCommissionOverride, useOverrideSuspension, useDeliveryAccess, useAddWhitelistEntry, useDeleteWhitelistEntry, useDeliveryAccessRequests, useResolveDeliveryRequest } from "@/hooks/use-admin";
import { formatCurrency, formatDate } from "@/lib/format";
import { fetcher } from "@/lib/api";
import { PLATFORM_DEFAULTS } from "@/lib/platformConfig";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WalletAdjustModal } from "@/components/WalletAdjustModal";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { useHasPermission } from "@/hooks/usePermissions";

/* ── Suspend Modal ── */
function SuspendModal({ vendor, onClose }: { vendor: any; onClose: () => void }) {
  const { toast } = useToast();
  const statusMutation = useUpdateVendorStatus();
  const [action, setAction] = useState<"active" | "blocked" | "banned">(
    vendor.isBanned ? "banned" : !vendor.isActive ? "blocked" : "active"
  );
  const [reason, setReason] = useState(vendor.banReason || "");

  const handleSave = () => {
    statusMutation.mutate({
      id: vendor.id,
      isActive: action === "active",
      isBanned: action === "banned",
      banReason: action === "banned" ? reason : null,
    }, {
      onSuccess: () => { toast({ title: "Vendor status updated" }); onClose(); },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Vendor Status — {vendor.storeName || vendor.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {[
            { key: "active",  label: "Active",                desc: "Vendor can accept orders", color: "green" },
            { key: "blocked", label: "Temporarily Blocked",   desc: "Suspend without ban",       color: "amber" },
            { key: "banned",  label: "Permanently Banned",    desc: "Ban with reason",           color: "red" },
          ].map(opt => (
            <div key={opt.key} onClick={() => setAction(opt.key as any)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${action === opt.key
                ? opt.color === "green" ? "bg-green-50 border-green-400"
                : opt.color === "amber" ? "bg-amber-50 border-amber-400"
                : "bg-red-50 border-red-400"
                : "bg-muted/30 border-border"}`}>
              <p className="text-sm font-bold">{opt.label}</p>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
            </div>
          ))}
          {action === "banned" && (
            <Input placeholder="Ban reason (required)" value={reason} onChange={e => setReason(e.target.value)} className="h-11 rounded-xl border-red-200" />
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={statusMutation.isPending || (action === "banned" && !reason)} className="flex-1 rounded-xl">
              {statusMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Commission Override Modal ── */
function CommissionModal({ vendor, defaultPct, onClose }: { vendor: any; defaultPct: number; onClose: () => void }) {
  const { toast } = useToast();
  const overrideMutation = useVendorCommissionOverride();
  const [pct, setPct] = useState(String(vendor.commissionOverride ?? defaultPct));

  const handleSave = () => {
    const v = parseFloat(pct);
    if (isNaN(v) || v < 0 || v > 100) { toast({ title: "Invalid %", variant: "destructive" }); return; }
    overrideMutation.mutate({ id: vendor.id, commissionPct: v }, {
      onSuccess: () => { toast({ title: "Commission override saved" }); onClose(); },
      onError: e => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-orange-600" /> Commission — {vendor.storeName || vendor.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm">
            <p className="text-orange-700">Platform default: <strong>{defaultPct}%</strong></p>
            {vendor.commissionOverride && (
              <p className="text-orange-700 mt-0.5">Current override: <strong>{vendor.commissionOverride}%</strong></p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Override Commission %</label>
            <Input type="number" min="0" max="100" step="0.5" value={pct} onChange={e => setPct(e.target.value)} className="h-12 rounded-xl text-lg font-bold" />
            <p className="text-xs text-muted-foreground">Set to 0–100%. Leave at platform default to reset.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={overrideMutation.isPending} className="flex-1 rounded-xl bg-orange-600 hover:bg-orange-700 text-white">
              {overrideMutation.isPending ? "Saving..." : "Save Override"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function exportVendorsCSV(vendors: any[]) {
  const header = "ID,Store,Owner,Phone,Status,Orders,Revenue,Wallet,Joined";
  const rows = vendors.map((v: any) =>
    [v.id, v.storeName || "", v.name || "", v.phone || "",
     v.isBanned ? "banned" : !v.isActive ? "blocked" : "active",
     v.totalOrders || 0, v.totalRevenue || 0, v.walletBalance, v.createdAt?.slice(0,10) || ""].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `vendors-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/* ══════════ Main Vendors Page ══════════ */
export default function Vendors() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [, setLocation] = useLocation();
  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useVendors();
  const { data: settingsData } = usePlatformSettings();
  const overrideSuspM = useOverrideSuspension("vendors");
  const { data: daData } = useDeliveryAccess();
  const addWhitelistM = useAddWhitelistEntry();
  const deleteWhitelistM = useDeleteWhitelistEntry();
  const { data: reqData } = useDeliveryAccessRequests();
  const resolveReqM = useResolveDeliveryRequest();
  const { toast } = useToast();
  const canWrite = useHasPermission("vendors.edit");

  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom]         = useState("");
  const [dateTo, setDateTo]             = useState("");
  const [walletModal,  setWalletModal]  = useState<any>(null);
  const [suspendModal, setSuspendModal] = useState<any>(null);
  const [commModal,    setCommModal]    = useState<any>(null);
  const [inviteOpen,   setInviteOpen]   = useState(false);
  const [invitePhone,  setInvitePhone]  = useState("");
  const [inviteEmail,  setInviteEmail]  = useState("");
  const [inviteStore,  setInviteStore]  = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const invitePhoneRef = useRef<HTMLInputElement>(null);

  const openInvite = useCallback(() => {
    setInvitePhone("");
    setInviteEmail("");
    setInviteStore("");
    setInviteOpen(true);
    setTimeout(() => invitePhoneRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    window.addEventListener("admin:new-item", openInvite);
    return () => window.removeEventListener("admin:new-item", openInvite);
  }, [openInvite]);

  const handleInviteVendor = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitePhone.trim() && !inviteEmail.trim()) {
      toast({ title: "Phone or email required", variant: "destructive" });
      return;
    }
    setInviteSending(true);
    try {
      await fetcher("/vendors/invite", {
        method: "POST",
        body: JSON.stringify({ phone: invitePhone.trim() || undefined, email: inviteEmail.trim() || undefined, storeName: inviteStore.trim() || undefined }),
      });
      toast({ title: "Invitation sent", description: `Vendor invite sent to ${invitePhone.trim() || inviteEmail.trim()}` });
      setInviteOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to invite vendor", description: err?.message || "Please try again", variant: "destructive" });
    }
    setInviteSending(false);
  }, [invitePhone, inviteEmail, inviteStore, toast]);

  const settings: any[] = settingsData?.settings || [];
  const vendorCommissionPct = parseFloat(settings.find((s: any) => s.key === "vendor_commission_pct")?.value ?? String(PLATFORM_DEFAULTS.vendorCommissionPct));
  const vendorShare = 1 - vendorCommissionPct / 100;

  const vendors: any[] = data?.vendors || [];
  const deliveryMode = daData?.mode || "all";
  const vendorWhitelistMap = new Map<string, string>();
  (daData?.whitelist || [])
    .filter((w: any) => w.type === "vendor" && w.status === "active")
    .forEach((w: any) => vendorWhitelistMap.set(w.targetId, w.id));
  const whitelistedVendorIds = new Set(vendorWhitelistMap.keys());
  const pendingRequests: any[] = reqData?.requests || [];
  const vendorPendingReqs = new Map<string, any[]>();
  pendingRequests
    .filter((r: any) => r.status === "pending")
    .forEach((r: any) => {
      const arr = vendorPendingReqs.get(r.vendorId) || [];
      arr.push(r);
      vendorPendingReqs.set(r.vendorId, arr);
    });

  const filtered = vendors.filter((v: any) => {
    const q = search.toLowerCase();
    const matchSearch =
      (v.storeName || "").toLowerCase().includes(q) ||
      (v.name || "").toLowerCase().includes(q) ||
      (v.phone || "").includes(q);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active"  && v.isActive && !v.isBanned) ||
      (statusFilter === "pending" && v.approvalStatus === "pending") ||
      (statusFilter === "blocked" && !v.isActive && !v.isBanned && v.approvalStatus !== "pending") ||
      (statusFilter === "banned"  && v.isBanned);
    const matchDate = (!dateFrom || new Date(v.createdAt) >= new Date(dateFrom))
                   && (!dateTo   || new Date(v.createdAt) <= new Date(dateTo + "T23:59:59"));
    return matchSearch && matchStatus && matchDate;
  });

  const totalEarnings    = vendors.reduce((s: number, v: any) => s + v.totalRevenue * vendorShare, 0);
  const totalWallet      = vendors.reduce((s: number, v: any) => s + v.walletBalance, 0);
  const activeVendors    = vendors.filter((v: any) => v.isActive && !v.isBanned).length;
  const pendingVendors   = vendors.filter((v: any) => v.approvalStatus === "pending").length;
  const suspendedVendors = vendors.filter((v: any) => (!v.isActive || v.isBanned) && v.approvalStatus !== "pending").length;

  const getStatusBadge = (v: any) => {
    if (v.isBanned)             return <StatusBadge status="banned"           size="xs" />;
    if (v.approvalStatus === "pending") return <StatusBadge status="pending_approval" size="xs" />;
    if (!v.isActive)            return <StatusBadge status="inactive"         size="xs" label="Blocked" />;
    if (v.storeIsOpen)          return <StatusBadge status="active"           size="xs" label="Open" />;
    return <StatusBadge status="offline" size="xs" label="Closed" />;
  };

  const [sortKey, setSortKey] = useState<"storeName" | "totalRevenue" | "walletBalance" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleVendorSort = useCallback((key: "storeName" | "totalRevenue" | "walletBalance") => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); return key; }
      setSortDir("asc");
      return key;
    });
  }, []);

  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a: any, b: any) => {
      let av = sortKey === "storeName" ? (a.storeName || "").toLowerCase() : (a[sortKey] ?? 0);
      let bv = sortKey === "storeName" ? (b.storeName || "").toLowerCase() : (b[sortKey] ?? 0);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const qc = useQueryClient();
  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["admin-vendors"] });
  }, [qc]);

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="space-y-6">
      <PageHeader
        icon={Store}
        title="Vendors"
        subtitle={`${vendors.length} total · ${activeVendors} active${pendingVendors > 0 ? ` · ${pendingVendors} pending` : ""} · ${suspendedVendors} suspended`}
        iconBgClass="bg-orange-100"
        iconColorClass="text-orange-600"
        actions={
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportVendorsCSV(filtered)} className="h-9 rounded-xl gap-2">
                <Download className="w-4 h-4" /> CSV
              </Button>
              <button
                onClick={() => setLocation("/settings?cat=vendor")}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" />
                Vendor Config
              </button>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-xl gap-2">
                <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> {T("refresh")}
              </Button>
            </div>
            <LastUpdated dataUpdatedAt={dataUpdatedAt} onRefresh={refetch} isRefreshing={isFetching} />
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Store} label="Total Vendors" value={vendors.length} iconBgClass="bg-orange-100" iconColorClass="text-orange-600" />
        <StatCard icon={CheckCircle2} label="Active Stores" value={activeVendors} iconBgClass="bg-green-100" iconColorClass="text-green-600" />
        <StatCard icon={TrendingUp} label="Total Earnings" value={formatCurrency(totalEarnings)} iconBgClass="bg-blue-100" iconColorClass="text-blue-600" />
        <StatCard icon={Wallet} label="Wallet Pending" value={formatCurrency(totalWallet)} iconBgClass="bg-amber-100" iconColorClass="text-amber-600" />
      </div>

      {/* Filters */}
      <Card className="p-4 rounded-2xl border-border/50 shadow-sm space-y-3">
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search store name, vendor name, phone..."
          filters={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 rounded-xl bg-muted/30 w-full sm:w-44">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending Approval</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="banned">Banned</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { key: "storeName" as const,      label: "Name" },
            { key: "totalRevenue" as const,   label: "Revenue" },
            { key: "walletBalance" as const,  label: "Wallet" },
          ]).map(col => (
            <button
              key={col.key}
              onClick={() => toggleVendorSort(col.key)}
              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${sortKey === col.key ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
            >
              {col.label}
              {sortKey === col.key
                ? sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                : <ArrowUpDown className="w-3 h-3 opacity-50" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-xl bg-muted/30 text-xs w-32" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-9 rounded-xl bg-muted/30 text-xs w-32" />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-primary hover:underline">Clear</button>}
        </div>
      </Card>

      {/* Vendors Table/Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-12 text-center">
            <Store className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No vendors found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedFiltered.map((v: any) => (
            <Card key={v.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Store Info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0 text-2xl">
                      🏪
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-sm text-foreground truncate">{v.storeName || "Unnamed Store"}</p>
                        {getStatusBadge(v)}
                        {(deliveryMode === "stores" || deliveryMode === "both") && (
                          whitelistedVendorIds.has(v.id)
                            ? <Badge
                                className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] gap-1 cursor-pointer hover:bg-blue-200"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  const entryId = vendorWhitelistMap.get(v.id);
                                  if (entryId) deleteWhitelistM.mutate(entryId, {
                                    onSuccess: () => toast({ title: "Delivery disabled", description: `${v.storeName || "Store"} removed from delivery whitelist` }),
                                    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
                                  });
                                }}
                              ><Truck className="w-2.5 h-2.5" /> Delivery</Badge>
                            : <Badge
                                className="bg-gray-100 text-gray-500 border-gray-200 text-[10px] gap-1 cursor-pointer hover:bg-gray-200"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  addWhitelistM.mutate({ type: "vendor", targetId: v.id, serviceType: "all" }, {
                                    onSuccess: () => toast({ title: "Delivery enabled", description: `${v.storeName || "Store"} added to delivery whitelist` }),
                                    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
                                  });
                                }}
                              ><Truck className="w-2.5 h-2.5" /> No Delivery</Badge>
                        )}
                        {vendorPendingReqs.has(v.id) && (
                          <Badge
                            className="bg-yellow-100 text-yellow-700 border-yellow-200 text-[10px] gap-1 cursor-pointer hover:bg-yellow-200"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation();
                              const reqs = vendorPendingReqs.get(v.id) || [];
                              reqs.forEach((r: any) => {
                                resolveReqM.mutate({ id: r.id, status: "approved" }, {
                                  onSuccess: () => {
                                    toast({ title: "Request approved", description: `Delivery access granted to ${v.storeName || "store"}` });
                                  },
                                  onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
                                });
                              });
                            }}
                          ><ClipboardList className="w-2.5 h-2.5 mr-1 inline" />{vendorPendingReqs.get(v.id)!.length} Request{vendorPendingReqs.get(v.id)!.length > 1 ? "s" : ""} — Approve</Badge>
                        )}
                        {v.storeCategory && (
                          <Badge variant="outline" className="text-[10px] capitalize">{v.storeCategory}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{v.name || "—"}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`tel:${v.phone}`} className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:underline">
                          <Phone className="w-3 h-3" /> {v.phone}
                        </a>
                        <a href={`https://wa.me/92${v.phone.replace(/^(\+92|0)/, "")}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-green-600 font-medium hover:underline">
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground">Joined {formatDate(v.createdAt)}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Orders</p>
                      <p className="font-bold text-sm">{v.totalOrders}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Revenue</p>
                      <p className="font-bold text-sm text-green-600">{formatCurrency(v.totalRevenue * vendorShare)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Wallet</p>
                      <p className="font-bold text-sm text-orange-600">{formatCurrency(v.walletBalance)}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => setCommModal(v)} disabled={!canWrite}
                      className="h-9 rounded-xl gap-1.5 text-xs border-purple-200 text-purple-700 hover:bg-purple-50">
                      <Percent className="w-3.5 h-3.5" /> Commission
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setWalletModal(v)} disabled={!canWrite}
                      className="h-9 rounded-xl gap-1.5 text-xs border-orange-200 text-orange-700 hover:bg-orange-50">
                      <Wallet className="w-3.5 h-3.5" /> Wallet
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSuspendModal(v)} disabled={!canWrite}
                      className={`h-9 rounded-xl gap-1.5 text-xs ${v.isActive && !v.isBanned ? "border-red-200 text-red-700 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}>
                      {v.isActive && !v.isBanned
                        ? <><Ban className="w-3.5 h-3.5" /> Suspend</>
                        : <><CheckCircle2 className="w-3.5 h-3.5" /> Activate</>
                      }
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setLocation(`/account-conditions?userId=${v.id}`)}
                      className="h-9 rounded-xl gap-1.5 text-xs border-violet-200 text-violet-700 hover:bg-violet-50" title="Conditions">
                      <Gavel className="w-3.5 h-3.5" /> Conditions
                    </Button>
                    {v.autoSuspendedAt && !v.adminOverrideSuspension && (
                      <Button size="sm" variant="outline" onClick={() => {
                        overrideSuspM.mutate(v.id, {
                          onSuccess: () => toast({ title: "Suspension overridden", description: "Vendor is now active again." }),
                          onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
                        });
                      }} disabled={overrideSuspM.isPending}
                        className="h-9 rounded-xl gap-1.5 text-xs border-purple-200 text-purple-700 hover:bg-purple-50">
                        <Settings2 className="w-3.5 h-3.5" /> Override Suspend
                      </Button>
                    )}
                  </div>
                </div>

                {/* Pending orders warning */}
                {v.pendingOrders > 0 && (
                  <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <Package className="w-4 h-4 text-amber-600" />
                    <p className="text-xs text-amber-700 font-semibold">{v.pendingOrders} pending order{v.pendingOrders > 1 ? "s" : ""} waiting</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modals */}
      {walletModal  && <WalletAdjustModal mode="vendor" subject={walletModal} onClose={() => setWalletModal(null)} />}
      {suspendModal && <SuspendModal vendor={suspendModal} onClose={() => setSuspendModal(null)} />}
      {commModal    && <CommissionModal vendor={commModal} defaultPct={vendorCommissionPct} onClose={() => setCommModal(null)} />}

      {/* Invite Vendor Dialog (triggered by N shortcut) */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="w-4 h-4 text-orange-600" /> Invite Vendor
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleInviteVendor} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number</label>
              <Input
                ref={invitePhoneRef}
                type="tel"
                placeholder="+92 300 1234567"
                value={invitePhone}
                onChange={e => setInvitePhone(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email (optional)</label>
              <Input
                type="email"
                placeholder="vendor@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Store Name (optional)</label>
              <Input
                type="text"
                placeholder="Store name"
                value={inviteStore}
                onChange={e => setInviteStore(e.target.value)}
                className="h-9 rounded-xl"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 h-9 rounded-xl" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1 h-9 rounded-xl" disabled={inviteSending}>
                {inviteSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                {inviteSending ? "Sending…" : "Send Invite"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PullToRefresh>
  );
}
