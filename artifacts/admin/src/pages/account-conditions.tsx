import { useState, useCallback } from "react";
import { PageHeader, StatCard } from "@/components/shared";
import { useQueryClient } from "@tanstack/react-query";
import {
  Shield, Search, RefreshCw, AlertTriangle, Ban, XCircle, CheckCircle2,
  Filter, ChevronDown, ChevronUp, Trash2, ArrowUpRight, X,
  CalendarDays, User, Loader2,
} from "lucide-react";
import { PullToRefresh } from "@/components/PullToRefresh";
import {
  useConditions, useApplyCondition, useUpdateCondition,
  useDeleteCondition, useBulkConditionAction, useUserConditions,
} from "@/hooks/use-admin";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CONDITION_TYPES,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  CATEGORY_MAP,
} from "@/lib/conditions";

function ApplyConditionModal({ onClose, prefillUserId, prefillRole }: { onClose: () => void; prefillUserId?: string; prefillRole?: string }) {
  const { toast } = useToast();
  const applyMut = useApplyCondition();
  const [userId, setUserId] = useState(prefillUserId || "");
  const [conditionType, setConditionType] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const selectedType = CONDITION_TYPES.find(t => t.value === conditionType);

  const handleApply = () => {
    if (!userId || !conditionType || !reason) {
      toast({ title: "Fill all required fields", variant: "destructive" });
      return;
    }
    applyMut.mutate({
      userId,
      conditionType,
      severity: selectedType?.severity || "warning",
      category: CATEGORY_MAP[selectedType?.severity || "warning"] || "warning",
      reason,
      notes: notes || undefined,
      expiresAt: expiresAt || undefined,
    }, {
      onSuccess: () => { toast({ title: "Condition applied" }); onClose(); },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" /> Apply Condition
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">User ID *</label>
            <Input placeholder="User ID" value={userId} onChange={e => setUserId(e.target.value)} className="h-11 rounded-xl" disabled={!!prefillUserId} />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Condition Type *</label>
            <Select value={conditionType} onValueChange={setConditionType}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>
                {CONDITION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${t.severity === "ban" ? "bg-red-600" : t.severity === "suspension" ? "bg-purple-600" : t.severity === "warning" ? "bg-yellow-500" : "bg-orange-500"}`} />
                      {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedType && (
            <Badge className={`${SEVERITY_COLORS[selectedType.severity]} text-xs`}>
              {SEVERITY_LABELS[selectedType.severity]}
            </Badge>
          )}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Reason *</label>
            <Input placeholder="Reason for this condition..." value={reason} onChange={e => setReason(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Notes (optional)</label>
            <Input placeholder="Internal notes..." value={notes} onChange={e => setNotes(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block mb-1.5">Expires At (optional)</label>
            <Input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button onClick={handleApply} disabled={applyMut.isPending} className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
              {applyMut.isPending ? "Applying..." : "Apply Condition"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConditionDetailDrawer({ condition, onClose }: { condition: any; onClose: () => void }) {
  const { toast } = useToast();
  const updateMut = useUpdateCondition();
  const deleteMut = useDeleteCondition();
  const [liftReason, setLiftReason] = useState("");

  const handleLift = () => {
    updateMut.mutate({ id: condition.id, action: "lift", liftReason: liftReason || "Lifted by admin" }, {
      onSuccess: () => { toast({ title: "Condition lifted" }); onClose(); },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleEscalate = () => {
    updateMut.mutate({ id: condition.id, action: "escalate", reason: "Escalated by admin" }, {
      onSuccess: () => { toast({ title: "Condition escalated" }); onClose(); },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!confirm("Delete this condition record permanently?")) return;
    deleteMut.mutate(condition.id, {
      onSuccess: () => { toast({ title: "Condition deleted" }); onClose(); },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const typeInfo = CONDITION_TYPES.find(t => t.value === condition.conditionType);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-lg rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600" /> Condition Details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 space-y-2 border border-indigo-100">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${SEVERITY_COLORS[condition.severity]} text-xs`}>
                {SEVERITY_LABELS[condition.severity]}
              </Badge>
              <span className="text-sm font-bold">{typeInfo?.label || condition.conditionType}</span>
              {condition.isActive ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Active</Badge>
              ) : (
                <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">Lifted</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">User:</span> <span className="font-semibold">{condition.userName || condition.userId}</span></div>
              <div><span className="text-muted-foreground">Phone:</span> <span className="font-semibold">{condition.userPhone || "—"}</span></div>
              <div><span className="text-muted-foreground">Role:</span> <span className="font-semibold capitalize">{condition.userRole}</span></div>
              <div><span className="text-muted-foreground">Applied:</span> <span className="font-semibold">{formatDate(condition.appliedAt)}</span></div>
              <div><span className="text-muted-foreground">By:</span> <span className="font-semibold">{condition.appliedBy || "system"}</span></div>
              {condition.expiresAt && <div><span className="text-muted-foreground">Expires:</span> <span className="font-semibold">{formatDate(condition.expiresAt)}</span></div>}
              {condition.liftedAt && <div><span className="text-muted-foreground">Lifted:</span> <span className="font-semibold">{formatDate(condition.liftedAt)}</span></div>}
              {condition.liftedBy && <div><span className="text-muted-foreground">Lifted by:</span> <span className="font-semibold">{condition.liftedBy}</span></div>}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-bold text-muted-foreground uppercase">Reason</p>
            <p className="text-sm">{condition.reason}</p>
          </div>

          {condition.notes && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase">Notes</p>
              <p className="text-sm text-muted-foreground">{condition.notes}</p>
            </div>
          )}

          {condition.liftReason && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-muted-foreground uppercase">Lift Reason</p>
              <p className="text-sm text-muted-foreground">{condition.liftReason}</p>
            </div>
          )}

          {condition.isActive && (
            <div className="space-y-3 pt-2 border-t">
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase block mb-1">Lift Reason</label>
                <Input placeholder="Reason for lifting..." value={liftReason} onChange={e => setLiftReason(e.target.value)} className="h-10 rounded-xl" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleLift} disabled={updateMut.isPending}
                  className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Lift
                </Button>
                <Button onClick={handleEscalate} disabled={updateMut.isPending}
                  variant="outline" className="flex-1 rounded-xl border-purple-300 text-purple-700 hover:bg-purple-50 gap-1">
                  <ArrowUpRight className="w-4 h-4" /> Escalate
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Close</Button>
            <Button variant="outline" onClick={handleDelete} disabled={deleteMut.isPending}
              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 gap-1">
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AccountConditions() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  const queryUserId = urlParams.get("userId") || "";

  const [userIdFilter, setUserIdFilter] = useState(queryUserId);
  const [roleFilter, setRoleFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedCondition, setSelectedCondition] = useState<any>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filters: Record<string, string> = {};
  if (userIdFilter) filters.userId = userIdFilter;
  if (roleFilter !== "all") filters.role = roleFilter;
  if (severityFilter !== "all") filters.severity = severityFilter;
  if (statusFilter !== "all") filters.status = statusFilter;
  if (search) filters.search = search;
  if (dateFrom) filters.dateFrom = dateFrom;
  if (dateTo) filters.dateTo = dateTo;

  const { data, isLoading, refetch, isFetching } = useConditions(filters);
  const bulkMut = useBulkConditionAction();

  const conditions: any[] = data?.conditions || [];
  const stats = {
    total: data?.activeCount || 0,
    severity: data?.severityCounts || {},
    roles: data?.roleCounts || {},
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkLift = () => {
    if (selectedIds.size === 0) return;
    bulkMut.mutate({ ids: Array.from(selectedIds), action: "lift", reason: "Bulk lift by admin" }, {
      onSuccess: (d: any) => {
        toast({ title: `${d.affected} conditions lifted` });
        setSelectedIds(new Set());
      },
      onError: (e: any) => toast({ title: "Bulk lift failed", description: e.message, variant: "destructive" }),
    });
  };

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["admin-conditions"] });
  }, [qc]);

  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="space-y-6">
      <PageHeader
        icon={Shield}
        title="Account Restrictions"
        subtitle={`${stats.total} active conditions`}
        iconBgClass="bg-indigo-100"
        iconColorClass="text-indigo-600"
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowApplyModal(true)} className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Shield className="w-4 h-4" /> Apply Condition
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-xl gap-2">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={Shield} label="Active" value={stats.total} iconBgClass="bg-indigo-100" iconColorClass="text-indigo-600" />
        <StatCard icon={AlertTriangle} label="Warnings" value={stats.severity.warning || 0} iconBgClass="bg-yellow-100" iconColorClass="text-yellow-600" />
        <StatCard icon={XCircle} label="Restrictions" value={(stats.severity.restriction_normal || 0) + (stats.severity.restriction_strict || 0)} iconBgClass="bg-orange-100" iconColorClass="text-orange-600" />
        <StatCard icon={Ban} label="Suspensions" value={stats.severity.suspension || 0} iconBgClass="bg-purple-100" iconColorClass="text-purple-600" />
        <StatCard icon={Ban} label="Bans" value={stats.severity.ban || 0} iconBgClass="bg-red-100" iconColorClass="text-red-600" />
      </div>

      <Card className="p-4 rounded-2xl border-border/50 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by name, phone, or reason..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11 rounded-xl bg-muted/30" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-muted/30 w-full sm:w-36"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="rider">Rider</SelectItem>
              <SelectItem value="van_driver">Van Driver</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-muted/30 w-full sm:w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="restriction_normal">Restriction</SelectItem>
              <SelectItem value="restriction_strict">Strict Restriction</SelectItem>
              <SelectItem value="suspension">Suspension</SelectItem>
              <SelectItem value="ban">Ban</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-muted/30 w-full sm:w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="lifted">Lifted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {userIdFilter && (
            <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200 gap-1 px-2 py-1">
              <User className="w-3 h-3" /> User: {userIdFilter.slice(-8).toUpperCase()}
              <button onClick={() => { setUserIdFilter(""); window.history.replaceState({}, "", window.location.pathname); }} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
            </Badge>
          )}
          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-xl bg-muted/30 text-xs w-32" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 rounded-xl bg-muted/30 text-xs w-32" />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-primary hover:underline">Clear</button>}
          {selectedIds.size > 0 && (
            <Button size="sm" variant="outline" onClick={handleBulkLift} disabled={bulkMut.isPending}
              className="ml-auto h-8 rounded-xl text-green-700 border-green-300 hover:bg-green-50 gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Bulk Lift ({selectedIds.size})
            </Button>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      ) : conditions.length === 0 ? (
        <Card className="rounded-2xl border-border/50">
          <CardContent className="p-12 text-center">
            <Shield className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No conditions found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {conditions.map((c: any) => {
            const typeInfo = CONDITION_TYPES.find(t => t.value === c.conditionType);
            return (
              <Card key={c.id} className={`rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${selectedIds.has(c.id) ? "ring-2 ring-indigo-400" : ""}`}
                onClick={() => setSelectedCondition(c)}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={selectedIds.has(c.id)}
                      onChange={e => { e.stopPropagation(); toggleSelect(c.id); }}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 accent-indigo-600" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`${SEVERITY_COLORS[c.severity]} text-[10px]`}>
                          {SEVERITY_LABELS[c.severity]}
                        </Badge>
                        <span className="text-sm font-bold">{typeInfo?.label || c.conditionType}</span>
                        {c.isActive ? (
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-gray-400" />
                        )}
                        <Badge className="bg-blue-50 text-blue-600 border-blue-100 text-[10px] capitalize">{c.userRole}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" /> {c.userName || c.userPhone || c.userId.slice(0, 8)}
                        </span>
                        <span>{c.reason.length > 60 ? c.reason.slice(0, 60) + "..." : c.reason}</span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p>{formatDate(c.appliedAt)}</p>
                      {c.appliedBy && <p className="text-[10px]">by {c.appliedBy}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedCondition && (
        <ConditionDetailDrawer condition={selectedCondition} onClose={() => setSelectedCondition(null)} />
      )}

      {showApplyModal && (
        <ApplyConditionModal onClose={() => setShowApplyModal(false)} prefillUserId={userIdFilter || undefined} />
      )}
    </PullToRefresh>
  );
}
