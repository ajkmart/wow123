import { useState } from "react";
import {
  Ticket, Plus, RefreshCw, Search, Trash2, Pencil,
  CheckCircle2, XCircle, Clock, Zap, ToggleLeft, ToggleRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared";
import { usePromoCodes, useCreatePromoCode, useUpdatePromoCode, useDeletePromoCode } from "@/hooks/use-admin";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { SensitiveActionDialog } from "@/components/SensitiveActionDialog";

const EMPTY_FORM = {
  code: "", description: "", discountPct: "", discountFlat: "",
  minOrderAmount: "", maxDiscount: "", usageLimit: "",
  appliesTo: "all", expiresAt: "", isActive: true,
};

function PromoModal({ promo, onClose }: { promo?: any; onClose: () => void }) {
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (k: TranslationKey) => tDual(k, language);
  const createMutation = useCreatePromoCode();
  const updateMutation = useUpdatePromoCode();
  const isEdit = !!promo;

  const [form, setForm] = useState(promo ? {
    code:           promo.code || "",
    description:    promo.description || "",
    discountPct:    promo.discountPct   ? String(promo.discountPct)   : "",
    discountFlat:   promo.discountFlat  ? String(promo.discountFlat)  : "",
    minOrderAmount: promo.minOrderAmount ? String(promo.minOrderAmount) : "",
    maxDiscount:    promo.maxDiscount   ? String(promo.maxDiscount)   : "",
    usageLimit:     promo.usageLimit    ? String(promo.usageLimit)    : "",
    appliesTo:      promo.appliesTo     || "all",
    expiresAt:      promo.expiresAt     ? promo.expiresAt.slice(0, 16) : "",
    isActive:       promo.isActive !== false,
  } : EMPTY_FORM);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.code) { toast({ title: "Promo code required", variant: "destructive" }); return; }
    if (!form.discountPct && !form.discountFlat) { toast({ title: T("discountAmountRequired"), variant: "destructive" }); return; }

    const payload: any = {
      code:        form.code.toUpperCase().trim(),
      description: form.description || null,
      discountPct:    form.discountPct    ? Number(form.discountPct)    : null,
      discountFlat:   form.discountFlat   ? Number(form.discountFlat)   : null,
      minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : 0,
      maxDiscount:    form.maxDiscount    ? Number(form.maxDiscount)    : null,
      usageLimit:     form.usageLimit     ? Number(form.usageLimit)     : null,
      appliesTo:  form.appliesTo,
      expiresAt:  form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      isActive:   form.isActive,
    };

    const mutation = isEdit ? updateMutation : createMutation;
    const mutArgs  = isEdit ? { id: promo.id, ...payload } : payload;

    mutation.mutate(mutArgs, {
      onSuccess: () => {
        toast({ title: isEdit ? "Promo code updated ✅" : "Promo code created ✅" });
        onClose();
      },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-violet-600" />
            {isEdit ? "Edit Promo Code" : "New Promo Code"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Code */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Promo Code *</label>
            <Input
              placeholder="e.g. EID50, SUMMER20"
              value={form.code}
              onChange={e => set("code", e.target.value.toUpperCase())}
              className="h-12 rounded-xl font-mono font-bold text-lg tracking-widest"
              disabled={isEdit}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Description</label>
            <Input placeholder="e.g. Eid special 50% off" value={form.description} onChange={e => set("description", e.target.value)} className="h-11 rounded-xl" />
          </div>

          {/* Discount Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Discount % (e.g. 20)</label>
              <Input type="number" placeholder="0" value={form.discountPct} onChange={e => set("discountPct", e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Flat Discount Rs.</label>
              <Input type="number" placeholder="0" value={form.discountFlat} onChange={e => set("discountFlat", e.target.value)} className="h-11 rounded-xl" />
            </div>
          </div>

          {/* Min Order & Max Discount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Min Order (Rs.)</label>
              <Input type="number" placeholder="0" value={form.minOrderAmount} onChange={e => set("minOrderAmount", e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Max Discount (Rs.)</label>
              <Input type="number" placeholder="No limit" value={form.maxDiscount} onChange={e => set("maxDiscount", e.target.value)} className="h-11 rounded-xl" />
            </div>
          </div>

          {/* Usage Limit & Applies To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Usage Limit</label>
              <Input type="number" placeholder="Unlimited" value={form.usageLimit} onChange={e => set("usageLimit", e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Applies To</label>
              <Select value={form.appliesTo} onValueChange={v => set("appliesTo", v)}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  <SelectItem value="mart">Mart</SelectItem>
                  <SelectItem value="food">Food</SelectItem>
                  <SelectItem value="pharmacy">Pharmacy</SelectItem>
                  <SelectItem value="parcel">Parcel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Expiry */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground block mb-1.5">Expiry Date & Time</label>
            <Input type="datetime-local" value={form.expiresAt} onChange={e => set("expiresAt", e.target.value)} className="h-11 rounded-xl" />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
            <div>
              <p className="text-sm font-semibold">Active</p>
              <p className="text-xs text-muted-foreground">Customers can use this code</p>
            </div>
            <button onClick={() => set("isActive", !form.isActive)}>
              {form.isActive
                ? <ToggleRight className="w-8 h-8 text-green-600" />
                : <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              }
            </button>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 rounded-xl"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : isEdit ? "Update Code" : "Create Code"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════ Main Page ══════════ */
export default function PromoCodes() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading, refetch, isFetching } = usePromoCodes();
  const deleteMutation = useDeletePromoCode();
  const { toast } = useToast();

  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showModal,    setShowModal]    = useState(false);
  const [editPromo,    setEditPromo]    = useState<any>(null);
  const [deleteId,     setDeleteId]     = useState<string | null>(null);

  const codes: any[] = data?.codes || [];
  const filtered = codes.filter((c: any) => {
    const q = search.toLowerCase();
    const matchSearch = c.code.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCodes   = codes.filter((c: any) => c.status === "active").length;
  const expiredCodes  = codes.filter((c: any) => c.status === "expired").length;
  const exhaustedCodes = codes.filter((c: any) => c.status === "exhausted").length;

  const getStatusBadge = (c: any) => {
    const conf: Record<string, { color: string; icon: any; label: string }> = {
      active:    { color: "bg-green-100 text-green-700 border-green-200",  icon: CheckCircle2, label: "Active" },
      inactive:  { color: "bg-gray-100 text-gray-600 border-gray-200",    icon: XCircle,      label: "Inactive" },
      expired:   { color: "bg-red-100 text-red-700 border-red-200",       icon: Clock,        label: "Expired" },
      exhausted: { color: "bg-amber-100 text-amber-700 border-amber-200", icon: Zap,          label: "Exhausted" },
    };
    const cfg = conf[c.status] || conf["inactive"]!;
    const Icon = cfg.icon;
    return <Badge className={`${cfg.color} text-[10px] gap-1`}><Icon className="w-3 h-3" />{cfg.label}</Badge>;
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => { toast({ title: "Promo code deleted" }); setDeleteId(null); },
      onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Ticket}
        title={T("promoCodes")}
        subtitle={`${codes.length} total · ${activeCodes} active · ${expiredCodes} expired`}
        iconBgClass="bg-violet-100"
        iconColorClass="text-violet-600"
        actions={
          <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-xl gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setShowModal(true)} className="h-9 rounded-xl gap-2">
            <Plus className="w-4 h-4" /> New Code
          </Button>
        </div>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Codes",  value: String(codes.length),     color: "bg-violet-100 text-violet-600" },
          { label: "Active",       value: String(activeCodes),      color: "bg-green-100 text-green-600" },
          { label: "Expired",      value: String(expiredCodes),     color: "bg-red-100 text-red-600" },
          { label: "Exhausted",    value: String(exhaustedCodes),   color: "bg-amber-100 text-amber-600" },
        ].map((s, i) => (
          <Card key={i} className="rounded-2xl border-border/50 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium mb-1">{s.label}</p>
              <p className={`text-2xl font-extrabold`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4 rounded-2xl border-border/50 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search code or description..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11 rounded-xl bg-muted/30" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 rounded-xl bg-muted/30 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">✅ Active</SelectItem>
            <SelectItem value="inactive">⊘ Inactive</SelectItem>
            <SelectItem value="expired">🕒 Expired</SelectItem>
            <SelectItem value="exhausted">⚡ Exhausted</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {/* Codes List */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-12 text-center">
            <Ticket className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No promo codes found</p>
            <Button size="sm" className="mt-4 rounded-xl" onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create First Code
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c: any) => (
            <Card key={c.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Code Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-extrabold text-lg tracking-widest text-violet-700 bg-violet-50 px-3 py-0.5 rounded-lg">{c.code}</span>
                      {getStatusBadge(c)}
                      <Badge variant="outline" className="text-[10px] capitalize">{c.appliesTo}</Badge>
                    </div>
                    {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {c.discountPct  && <span className="font-semibold text-green-700">🏷️ {c.discountPct}% off</span>}
                      {c.discountFlat && <span className="font-semibold text-green-700">🏷️ Rs. {c.discountFlat} off</span>}
                      {c.minOrderAmount > 0 && <span>Min: Rs. {c.minOrderAmount}</span>}
                      {c.maxDiscount   && <span>Max: Rs. {c.maxDiscount}</span>}
                      <span>Used: {c.usedCount || 0}{c.usageLimit ? `/${c.usageLimit}` : ""}</span>
                      {c.expiresAt && <span>Expires: {formatDate(c.expiresAt)}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setEditPromo(c)}
                      className="h-9 rounded-xl gap-1.5 text-xs">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteId(c.id)}
                      className="h-9 rounded-xl gap-1.5 text-xs border-red-200 text-red-700 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal  && <PromoModal onClose={() => setShowModal(false)} />}
      {editPromo  && <PromoModal promo={editPromo} onClose={() => setEditPromo(null)} />}

      {/* Delete Confirm — requires password re-entry */}
      <SensitiveActionDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) handleDelete(deleteId); }}
        title={tDual("deletePromoCodeTitle", language)}
        description={tDual("actionCannotBeUndone", language)}
        confirmLabel="Delete"
        actionType="delete_promo_code"
        targetId={deleteId ?? undefined}
      />
    </div>
  );
}
