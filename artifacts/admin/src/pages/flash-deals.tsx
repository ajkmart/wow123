import { useState, useMemo, useEffect, useRef } from "react";
import { adminFetch } from "@/lib/adminFetcher";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Pencil, Trash2, Save,
  Clock, Package, ToggleLeft, ToggleRight,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { StatusBadge } from "@/components/AdminShared";
import { SensitiveActionDialog } from "@/components/SensitiveActionDialog";
import { NavigationGuard } from "@/components/NavigationGuard";

/* ── Types ── */
interface Product { id: string; name: string; price: string | number; category: string; image?: string }
interface FlashDeal {
  id: string; productId: string; title?: string; badge: string;
  discountPct?: number; discountFlat?: number;
  startTime: string; endTime: string; dealStock?: number; soldCount: number;
  isActive: boolean; status: "live"|"scheduled"|"expired"|"sold_out"|"inactive";
  product?: Product; createdAt: string;
}

/* ── Flash Deal Form ── */
const EMPTY_DEAL = {
  productId: "", title: "", badge: "FLASH",
  discountPct: "", discountFlat: "", startTime: "", endTime: "",
  dealStock: "", isActive: true,
};

function now8601() {
  const d = new Date(); d.setSeconds(0,0);
  return d.toISOString().slice(0,16);
}
function future8601(hours = 24) {
  const d = new Date(Date.now() + hours*3600*1000); d.setSeconds(0,0);
  return d.toISOString().slice(0,16);
}

/* ── Server-time offset hook ── */
function useServerOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const start = Date.now();
    fetch("/api/health")
      .then(r => r.json())
      .then((data: any) => {
        const serverTime = new Date(data?.timestamp ?? data?.data?.timestamp ?? Date.now()).getTime();
        const rtt = Date.now() - start;
        setOffset(serverTime - (Date.now() - rtt / 2));
      })
      .catch(() => { console.warn("flash-deals: server time fetch failed, using local clock"); });
  }, []);
  return offset;
}

/* ── Countdown component anchored to server time ── */
function ServerCountdown({ endTime, serverOffset }: { endTime: string; serverOffset: number }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const end = new Date(endTime).getTime();
    const tick = () => {
      const now = Date.now() + serverOffset;
      setRemaining(Math.max(0, end - now));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime, serverOffset]);

  if (remaining <= 0) return <span className="text-xs text-red-500 font-mono">Expired</span>;

  const totalSec = Math.floor(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const label = h > 0
    ? `${h}h ${m}m ${s}s`
    : `${m}m ${s}s`;

  return <span className="text-xs font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">{label}</span>;
}

/* ══════════ Main Page ══════════ */
export default function FlashDealsPage() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { toast } = useToast();
  const qc = useQueryClient();
  const serverOffset = useServerOffset();

  /* ── Flash Deals state ── */
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const [dealForm, setDealForm] = useState({ ...EMPTY_DEAL });
  const [editingDeal, setEditingDeal] = useState<FlashDeal|null>(null);
  const [dealDialog, setDealDialog] = useState(false);
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);

  const isDirty = dealDialog && (
    dealForm.productId !== EMPTY_DEAL.productId ||
    dealForm.title !== EMPTY_DEAL.title ||
    !!dealForm.discountPct || !!dealForm.discountFlat
  );

  /* ── Queries ── */
  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: ["admin-flash-deals"],
    queryFn: () => adminFetch("/flash-deals"),
    refetchInterval: 30000,
  });
  const { data: productsData } = useQuery({
    queryKey: ["admin-products-list"],
    queryFn: () => adminFetch("/products"),
  });

  const deals = useMemo<FlashDeal[]>(() => dealsData?.deals ?? [], [dealsData?.deals]);
  const products: Product[]  = productsData?.products || [];
  const totalPages = Math.max(1, Math.ceil(deals.length / PAGE_SIZE));
  const pagedDeals = useMemo(() => deals.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [deals, page]);
  useEffect(() => { setPage(p => Math.min(p, Math.max(0, totalPages - 1))); }, [totalPages]);

  /* ── Flash Deal Mutations ── */
  const saveDeal = useMutation({
    mutationFn: async (body: any) => {
      if (editingDeal) return adminFetch(`/flash-deals/${editingDeal.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return adminFetch("/flash-deals", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-flash-deals"] });
      setDealDialog(false); setEditingDeal(null); setDealForm({ ...EMPTY_DEAL });
      toast({ title: editingDeal ? "Deal updated ✅" : "Flash deal created ✅" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteDeal = useMutation({
    mutationFn: (id: string) => adminFetch(`/flash-deals/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-flash-deals"] }); toast({ title: "Deal deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const toggleDeal = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/flash-deals/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-flash-deals"] }),
    onError: (e: Error) => toast({ title: "Toggle failed", description: e.message, variant: "destructive" }),
  });

  /* ── Form handlers ── */
  const openNewDeal = () => {
    setEditingDeal(null);
    setDealForm({ ...EMPTY_DEAL, startTime: now8601(), endTime: future8601(24) });
    setDealDialog(true);
  };
  const openEditDeal = (d: FlashDeal) => {
    setEditingDeal(d);
    setDealForm({
      productId: d.productId, title: d.title||"", badge: d.badge,
      discountPct: d.discountPct!=null ? String(d.discountPct) : "",
      discountFlat: d.discountFlat!=null ? String(d.discountFlat) : "",
      startTime: d.startTime.slice(0,16),
      endTime:   d.endTime.slice(0,16),
      dealStock: d.dealStock!=null ? String(d.dealStock) : "",
      isActive: d.isActive,
    });
    setDealDialog(true);
  };

  const submitDeal = () => {
    if (!dealForm.productId) { toast({ title: "Select a product", variant: "destructive" }); return; }
    if (!dealForm.startTime || !dealForm.endTime) { toast({ title: "Set start and end time", variant: "destructive" }); return; }
    if (!dealForm.discountPct && !dealForm.discountFlat) { toast({ title: "Set either discount % or flat amount", variant: "destructive" }); return; }
    saveDeal.mutate({
      productId: dealForm.productId,
      title: dealForm.title || null,
      badge: dealForm.badge,
      discountPct: dealForm.discountPct ? Number(dealForm.discountPct) : null,
      discountFlat: dealForm.discountFlat ? Number(dealForm.discountFlat) : null,
      startTime: dealForm.startTime,
      endTime: dealForm.endTime,
      dealStock: dealForm.dealStock ? Number(dealForm.dealStock) : null,
      isActive: dealForm.isActive,
    });
  };

  /* ── Stats ── */
  const liveDeals = deals.filter(d => d.status === "live").length;

  return (
    <div className="space-y-6">
      <NavigationGuard isDirty={isDirty} />
      <PageHeader
        icon={Zap}
        title={T("flashDeals")}
        subtitle={`${liveDeals} live deal${liveDeals !== 1 ? "s" : ""}`}
        iconBgClass="bg-amber-100"
        iconColorClass="text-amber-600"
        actions={
          <Button onClick={openNewDeal} className="h-10 rounded-xl gap-2 shadow-md">
            <Plus className="w-4 h-4" />
            {T("newFlashDeal")}
          </Button>
        }
      />

      {/* ══ Flash Deals ══ */}
      <div className="space-y-4">
          {dealsLoading ? (
            <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-24 bg-muted rounded-2xl animate-pulse"/>)}</div>
          ) : deals.length === 0 ? (
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-16 text-center">
                <Zap className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3"/>
                <p className="text-muted-foreground font-medium">{T("noFlashDeals")}</p>
                <p className="text-sm text-muted-foreground/60 mt-1">{T("createFirstFlashDeal")}</p>
                <Button onClick={openNewDeal} className="mt-4 rounded-xl gap-2"><Plus className="w-4 h-4"/>{T("createFlashDeal")}</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {pagedDeals.map(deal => {
                const discountLabel = deal.discountPct
                  ? `${deal.discountPct}% OFF`
                  : deal.discountFlat ? `Rs. ${deal.discountFlat} OFF` : "Deal";
                const stockPct = deal.dealStock ? Math.round((deal.soldCount / deal.dealStock) * 100) : null;
                const isLive = deal.status === "live";
                return (
                  <Card key={deal.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Discount badge */}
                        <div className="w-14 h-14 bg-amber-100 rounded-xl flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-amber-700">{deal.badge}</span>
                          <span className="text-[10px] font-bold text-amber-600 text-center leading-tight">{discountLabel}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-foreground truncate">{deal.title || deal.product?.name || deal.productId}</p>
                            <StatusBadge status={deal.status} />
                            {isLive && (
                              <ServerCountdown endTime={deal.endTime} serverOffset={serverOffset} />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{deal.product?.category || ""} · {deal.product ? `Rs. ${deal.product.price}` : ""}</p>
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3"/>
                              {new Date(deal.startTime).toLocaleString("en-PK",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})} →{" "}
                              {new Date(deal.endTime).toLocaleString("en-PK",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                            </span>
                            {deal.dealStock !== null && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Package className="w-3 h-3"/>
                                {deal.soldCount}/{deal.dealStock} sold
                              </span>
                            )}
                          </div>
                          {/* Stock progress bar */}
                          {stockPct !== null && (
                            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden w-40">
                              <div className={`h-full rounded-full ${stockPct>=90?"bg-red-500":stockPct>=50?"bg-amber-500":"bg-green-500"}`} style={{ width: `${Math.min(stockPct,100)}%` }} />
                            </div>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => toggleDeal.mutate({ id: deal.id, isActive: !deal.isActive })}
                            disabled={toggleDeal.isPending}
                            className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            title={deal.isActive ? "Deactivate" : "Activate"}
                          >
                            {deal.isActive
                              ? <ToggleRight className="w-5 h-5 text-green-600"/>
                              : <ToggleLeft  className="w-5 h-5 text-muted-foreground"/>}
                          </button>
                          <button onClick={() => openEditDeal(deal)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                            <Pencil className="w-4 h-4 text-blue-600"/>
                          </button>
                          <button
                            onClick={() => setDeletingDealId(deal.id)}
                            disabled={deleteDeal.isPending}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4 text-red-500"/>
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {deals.length > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="w-4 h-4" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" className="rounded-xl gap-1" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

      {/* ══ Flash Deal Dialog ══ */}
      <Dialog open={dealDialog} onOpenChange={v => { setDealDialog(v); if (!v) { setEditingDeal(null); setDealForm({ ...EMPTY_DEAL }); } }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500"/>
              {editingDeal ? T("editFlashDeal") : T("createFlashDeal")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Product selection */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Product <span className="text-red-500">*</span></label>
              <select
                value={dealForm.productId}
                onChange={e => setDealForm(f=>({...f, productId: e.target.value}))}
                className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">— Select a product —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} · Rs.{p.price} · {p.category}</option>
                ))}
              </select>
            </div>

            {/* Custom title */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Custom Title <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="e.g. Mega Sale on Basmati Rice"
                value={dealForm.title}
                onChange={e => setDealForm(f=>({...f, title: e.target.value}))}
                className="h-11 rounded-xl"
              />
            </div>

            {/* Badge */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Deal Badge</label>
              <div className="flex gap-2 flex-wrap">
                {["FLASH","HOT","MEGA","LIMITED","NEW"].map(b => (
                  <button
                    key={b}
                    onClick={() => setDealForm(f=>({...f, badge: b}))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${dealForm.badge===b ? "bg-amber-500 text-white border-amber-500" : "bg-muted border-border text-muted-foreground hover:border-amber-300"}`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            {/* Discount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Discount %</label>
                <div className="relative">
                  <Input
                    type="number" min={0} max={100}
                    placeholder="e.g. 30"
                    value={dealForm.discountPct}
                    onChange={e => setDealForm(f=>({...f, discountPct: e.target.value, discountFlat: ""}))}
                    className="h-11 rounded-xl pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">OR Flat (Rs.)</label>
                <div className="relative">
                  <Input
                    type="number" min={0}
                    placeholder="e.g. 50"
                    value={dealForm.discountFlat}
                    onChange={e => setDealForm(f=>({...f, discountFlat: e.target.value, discountPct: ""}))}
                    className="h-11 rounded-xl pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">Rs.</span>
                </div>
              </div>
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Start Time <span className="text-red-500">*</span></label>
                <Input
                  type="datetime-local"
                  value={dealForm.startTime}
                  onChange={e => setDealForm(f=>({...f, startTime: e.target.value}))}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">End Time <span className="text-red-500">*</span></label>
                <Input
                  type="datetime-local"
                  value={dealForm.endTime}
                  onChange={e => setDealForm(f=>({...f, endTime: e.target.value}))}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            {/* Stock */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Deal Stock Limit <span className="text-muted-foreground font-normal">(leave blank = unlimited)</span></label>
              <Input
                type="number" min={1}
                placeholder="e.g. 100"
                value={dealForm.dealStock}
                onChange={e => setDealForm(f=>({...f, dealStock: e.target.value}))}
                className="h-11 rounded-xl"
              />
            </div>

            {/* Active toggle */}
            <div
              onClick={() => setDealForm(f=>({...f, isActive: !f.isActive}))}
              className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${dealForm.isActive ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}
            >
              <span className="text-sm font-semibold">Active (visible to users)</span>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${dealForm.isActive ? "bg-green-500" : "bg-gray-300"}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-transform ${dealForm.isActive ? "translate-x-5" : "translate-x-0.5"}`}/>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDealDialog(false)}>Cancel</Button>
              <Button onClick={submitDeal} disabled={saveDeal.isPending} className="flex-1 rounded-xl gap-2">
                <Save className="w-4 h-4"/>
                {saveDeal.isPending ? "Saving..." : (editingDeal ? "Update Deal" : "Create Deal")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete flash deal — requires password re-entry */}
      <SensitiveActionDialog
        open={!!deletingDealId}
        onClose={() => setDeletingDealId(null)}
        onConfirm={() => { if (deletingDealId) deleteDeal.mutate(deletingDealId); }}
        title="Delete Flash Deal"
        description="This flash deal will be permanently removed. This action cannot be undone."
        confirmLabel="Delete Deal"
        actionType="delete_flash_deal"
        targetId={deletingDealId ?? undefined}
      />

    </div>
  );
}
