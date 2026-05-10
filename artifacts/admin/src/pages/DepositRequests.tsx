import { useState, useMemo, useEffect } from "react";
import { PageHeader, StatCardSkeleton } from "@/components/shared";
import {
  ArrowDownToLine, CheckCircle, XCircle, RefreshCw, ChevronDown, ChevronUp, Clock,
  Wallet, AlertTriangle, PartyPopper, Inbox, Download, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { useDepositRequests, useApproveDeposit, useRejectDeposit, useBulkApproveDeposits, useBulkRejectDeposits } from "@/hooks/use-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LastUpdated } from "@/components/ui/LastUpdated";

const fc = formatCurrency;
const fd = (d: string | Date) =>
  new Date(d).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

type StatusFilter = "all" | "pending" | "approved" | "rejected";

interface DepositUser {
  roles?: string[];
  name?: string;
  phone?: string;
}

interface Deposit {
  id: string;
  amount: string | number;
  description: string;
  status: "pending" | "approved" | "rejected";
  paymentMethod?: string | null;
  createdAt: string | Date;
  user?: DepositUser;
  txId?: string;
  adminNote?: string;
  refNo?: string;
}

interface BulkResult {
  approved?: string[];
  rejected?: string[];
}

function methodLabel(method: string | null) {
  if (!method) return "Card";
  const m = method.toLowerCase();
  if (m.includes("jazzcash"))  return "JazzCash";
  if (m.includes("easypaisa")) return "EasyPaisa";
  if (m.includes("bank"))      return "Bank";
  return "Card";
}

function methodIcon(method: string | null | undefined): string {
  if (!method) return "💳";
  const m = method.toLowerCase();
  if (m.includes("jazzcash"))  return "📱";
  if (m.includes("easypaisa")) return "📲";
  if (m.includes("bank"))      return "🏦";
  return "💳";
}

function parseDesc(desc: string) {
  const stripped = desc
    .replace("Manual deposit — ", "")
    .replace("Wallet Deposit — ", "");
  const parts = stripped.split(" · ");
  const method = parts[0] || "—";
  const txIdPart   = parts.find(p => p.startsWith("TxID: "));
  const senderPart = parts.find(p => p.startsWith("Sender: ") || p.startsWith("From: "));
  const notePart   = parts.find(p => p.startsWith("Note: "));
  return {
    method,
    txId:   txIdPart   ? txIdPart.replace("TxID: ", "") : "—",
    sender: senderPart ? senderPart.replace(/^(Sender|From): /, "") : "—",
    note:   notePart   ? notePart.replace("Note: ", "") : "",
  };
}


function roleColor(role: string) {
  if (role === "rider")    return "bg-green-100 text-green-700";
  if (role === "customer") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function ApproveModal({ d, onClose }: { d: Deposit; onClose: () => void }) {
  const [refNo, setRefNo] = useState("");
  const [note, setNote]   = useState("");
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const approve = useApproveDeposit();
  const parsed = parseDesc(d.description || "");

  const handleApprove = () => {
    approve.mutate({ id: d.id, refNo: refNo.trim() || undefined, note: note.trim() || undefined }, {
      onSuccess: () => {
        toast({ title: "Deposit approved", description: `${fc(Number(d.amount))} credited to wallet.` });
        onClose();
      },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="p-0 max-w-md overflow-hidden rounded-2xl border-0 shadow-2xl">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-5">
          <DialogTitle className="text-lg font-extrabold text-white">Approve Deposit</DialogTitle>
          <p className="text-green-200 text-sm mt-0.5">Wallet will be credited and the user notified</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-green-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">User</span><span className="font-bold">{d.user?.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Phone</span><span className="font-bold">{d.user?.phone}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Method</span><span className="font-bold">{methodLabel(d.paymentMethod ?? null)} · {parsed.method}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Transaction ID</span><span className="font-bold font-mono">{parsed.txId}</span></div>
            {parsed.sender !== "—" && (
              <div className="flex justify-between text-sm"><span className="text-gray-500">Sender Account</span><span className="font-bold">{parsed.sender}</span></div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-green-200">
              <span className="text-gray-600 font-semibold">Amount to Credit</span>
              <span className="text-xl font-extrabold text-green-600">{fc(Number(d.amount))}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Reference No. (Optional)</label>
            <input value={refNo} onChange={e => setRefNo(e.target.value)}
              placeholder="e.g. your internal ref or TxID"
              className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400"/>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Note for User (Optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Verified via JazzCash"
              className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400"/>
          </div>

          <div className="flex gap-3 pt-1">
            <Button autoFocus variant="outline" className="flex-1" onClick={onClose}>{T("cancel")}</Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
              onClick={handleApprove} disabled={approve.isPending}>
              {approve.isPending ? T("processing") : "Approve & Credit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RejectModal({ d, onClose }: { d: Deposit; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const reject = useRejectDeposit();

  const handleReject = () => {
    if (!reason.trim()) { toast({ title: "Reason required", variant: "destructive" }); return; }
    reject.mutate({ id: d.id, reason: reason.trim() }, {
      onSuccess: () => {
        toast({ title: "Deposit rejected", description: "User has been notified." });
        onClose();
      },
      onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="p-0 max-w-md overflow-hidden rounded-2xl border-0 shadow-2xl">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-5">
          <DialogTitle className="text-lg font-extrabold text-white">Reject Deposit</DialogTitle>
          <p className="text-red-200 text-sm mt-0.5">Deposit will be rejected — wallet will not be credited</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">User</span><span className="font-bold">{d.user?.name}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Role</span><span className="font-bold capitalize">{d.user?.roles?.[0]}</span></div>
            <div className="flex justify-between items-center pt-1 border-t border-red-200">
              <span className="text-gray-600 font-semibold">Amount (NOT credited)</span>
              <span className="text-xl font-extrabold text-red-600">{fc(Number(d.amount))}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Rejection Reason *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="e.g. Invalid transaction ID · Duplicate request · Amount mismatch"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-red-400 resize-none"/>
          </div>

          <div className="flex gap-3 pt-1">
            <Button autoFocus variant="outline" className="flex-1" onClick={onClose}>{T("cancel")}</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
              onClick={handleReject} disabled={reject.isPending}>
              {reject.isPending ? T("processing") : "Reject Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkApproveModal({ count, totalAmount, onConfirm, onClose, isPending }: {
  count: number; totalAmount: number; onConfirm: (refNo?: string) => void; onClose: () => void; isPending: boolean;
}) {
  const [refNo, setRefNo] = useState("");
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="p-0 max-w-md overflow-hidden rounded-2xl border-0 shadow-2xl">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-5">
          <DialogTitle className="text-lg font-extrabold text-white">Bulk Approve Deposits</DialogTitle>
          <p className="text-green-200 text-sm mt-0.5">Approve {count} deposits at once</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-green-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Selected Deposits</span><span className="font-bold">{count}</span></div>
            <div className="flex justify-between items-center pt-1 border-t border-green-200">
              <span className="text-gray-600 font-semibold">Total to Credit</span>
              <span className="text-xl font-extrabold text-green-600">{fc(totalAmount)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Shared Reference Note (Optional)</label>
            <input value={refNo} onChange={e => setRefNo(e.target.value)}
              placeholder="e.g. Batch approval - March 2026"
              className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400"/>
          </div>

          <div className="flex gap-3 pt-1">
            <Button autoFocus variant="outline" className="flex-1" onClick={onClose}>{T("cancel")}</Button>
            <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
              onClick={() => onConfirm(refNo.trim() || undefined)} disabled={isPending}>
              {isPending ? T("processing") : `Approve ${count} Deposits`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkRejectModal({ count, totalAmount, onConfirm, onClose, isPending }: {
  count: number; totalAmount: number; onConfirm: (reason: string) => void; onClose: () => void; isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="p-0 max-w-md overflow-hidden rounded-2xl border-0 shadow-2xl">
        <div className="bg-gradient-to-r from-red-600 to-rose-600 p-5">
          <DialogTitle className="text-lg font-extrabold text-white">Bulk Reject Deposits</DialogTitle>
          <p className="text-red-200 text-sm mt-0.5">Reject {count} deposits at once</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Selected Deposits</span><span className="font-bold">{count}</span></div>
            <div className="flex justify-between items-center pt-1 border-t border-red-200">
              <span className="text-gray-600 font-semibold">Total Amount (NOT credited)</span>
              <span className="text-xl font-extrabold text-red-600">{fc(totalAmount)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Rejection Reason *</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="e.g. Invalid transaction IDs · Duplicate requests · Amount mismatch"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-red-400 resize-none"/>
          </div>

          <div className="flex gap-3 pt-1">
            <Button autoFocus variant="outline" className="flex-1" onClick={onClose}>{T("cancel")}</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
              onClick={() => {
                if (!reason.trim()) { toast({ title: "Reason required", variant: "destructive" }); return; }
                onConfirm(reason.trim());
              }} disabled={isPending}>
              {isPending ? T("processing") : `Reject ${count} Deposits`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function exportDepositsCSV(rows: Deposit[]) {
  const header = "ID,User,Phone,Role,Method,Amount,Status,Date";
  const lines = rows.map(d =>
    [d.id, d.user?.name ?? "", d.user?.phone ?? "", d.user?.roles?.[0] ?? "", methodLabel(d.paymentMethod ?? null), Number(d.amount).toFixed(2), d.status, new Date(d.createdAt).toISOString().slice(0, 10)].join(",")
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `deposits-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

export default function DepositRequests() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [rejectTarget,  setRejectTarget]  = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkApprove, setShowBulkApprove] = useState(false);
  const [showBulkReject, setShowBulkReject] = useState(false);

  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading, refetch } = useDepositRequests();
  const { toast } = useToast();
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  useEffect(() => { if (data) setLastRefreshed(new Date()); }, [data]);
  const bulkApprove = useBulkApproveDeposits();
  const bulkReject = useBulkRejectDeposits();

  const deposits = useMemo<Deposit[]>(() => data?.deposits ?? [], [data?.deposits]);

  const duplicateTxIds = useMemo(() => {
    const seen = new Map<string, number>();
    deposits.forEach(d => {
      const parsed = parseDesc(d.description || "");
      const txId = parsed.txId;
      if (txId && txId !== "—") seen.set(txId, (seen.get(txId) || 0) + 1);
    });
    const dups = new Set<string>();
    seen.forEach((count, txId) => { if (count > 1) dups.add(txId); });
    return dups;
  }, [deposits]);

  type DepSortKey = "amount" | "createdAt" | "status";
  const [depSortKey, setDepSortKey] = useState<DepSortKey>("createdAt");
  const [depSortDir, setDepSortDir] = useState<"asc" | "desc">("desc");

  const handleDepSort = (key: DepSortKey) => {
    if (depSortKey === key) setDepSortDir(d => d === "asc" ? "desc" : "asc");
    else { setDepSortKey(key); setDepSortDir("asc"); }
  };

  function DepSortIcon({ col }: { col: DepSortKey }) {
    if (depSortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40 inline ml-0.5" />;
    return depSortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary inline ml-0.5" /> : <ArrowDown className="w-3 h-3 text-primary inline ml-0.5" />;
  }

  const depStatusOrder: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };

  const rawFiltered = statusFilter === "all" ? deposits : deposits.filter(d => d.status === statusFilter);
  const filtered = useMemo(() => {
    return [...rawFiltered].sort((a, b) => {
      const dir = depSortDir === "asc" ? 1 : -1;
      if (depSortKey === "amount") return dir * (Number(a.amount) - Number(b.amount));
      if (depSortKey === "status") return dir * ((depStatusOrder[a.status] ?? 9) - (depStatusOrder[b.status] ?? 9));
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }, [rawFiltered, depSortKey, depSortDir]);
  const pendingCount  = deposits.filter(d => d.status === "pending").length;
  const pendingAmt    = deposits.filter(d => d.status === "pending").reduce((s: number, d: Deposit) => s + Number(d.amount), 0);
  const approvedCount = deposits.filter(d => d.status === "approved").length;
  const rejectedCount = deposits.filter(d => d.status === "rejected").length;

  const pendingInFiltered = useMemo(() => filtered.filter((d: Deposit) => d.status === "pending" && d.user?.roles?.[0] === "customer"), [filtered]);
  const allPendingSelected = pendingInFiltered.length > 0 && pendingInFiltered.every((d: Deposit) => selectedIds.has(d.id));

  const selectedDeposits = useMemo(() => deposits.filter(d => selectedIds.has(d.id) && d.status === "pending" && d.user?.roles?.[0] === "customer"), [deposits, selectedIds]);
  const selectedTotal = useMemo(() => selectedDeposits.reduce((s, d) => s + Number(d.amount), 0), [selectedDeposits]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPendingSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pendingInFiltered.forEach((d: Deposit) => next.delete(d.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        pendingInFiltered.forEach((d: Deposit) => next.add(d.id));
        return next;
      });
    }
  };

  const handleBulkApprove = (refNo?: string) => {
    const ids = Array.from(selectedIds).filter(id => deposits.find(d => d.id === id && d.status === "pending" && d.user?.roles?.[0] === "customer"));
    bulkApprove.mutate({ ids, refNo }, {
      onSuccess: (data: BulkResult) => {
        toast({ title: `${data.approved?.length ?? 0} deposits approved` });
        setSelectedIds(new Set());
        setShowBulkApprove(false);
      },
      onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const handleBulkReject = (reason: string) => {
    const ids = Array.from(selectedIds).filter(id => deposits.find(d => d.id === id && d.status === "pending" && d.user?.roles?.[0] === "customer"));
    bulkReject.mutate({ ids, reason }, {
      onSuccess: (data: BulkResult) => {
        toast({ title: `${data.rejected?.length ?? 0} deposits rejected` });
        setSelectedIds(new Set());
        setShowBulkReject(false);
      },
      onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
    });
  };

  const STATUS_TABS: { id: StatusFilter; label: string; count: number; color: string }[] = [
    { id: "all",      label: "All",      count: deposits.length,  color: "text-gray-700"  },
    { id: "pending",  label: "Pending",  count: pendingCount,     color: "text-amber-600" },
    { id: "approved", label: "Approved", count: approvedCount,    color: "text-green-600" },
    { id: "rejected", label: "Rejected", count: rejectedCount,    color: "text-red-600"   },
  ];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5 pb-28">
      <PageHeader
        icon={ArrowDownToLine}
        title="Deposit Requests"
        subtitle="Approve or reject rider & customer wallet deposit requests"
        iconBgClass="bg-green-100"
        iconColorClass="text-green-600"
        actions={
          <div className="flex items-center gap-2">
            <LastUpdated dataUpdatedAt={lastRefreshed?.getTime() ?? 0} />
            <Button variant="outline" size="sm" onClick={() => exportDepositsCSV(filtered)} className="h-9 rounded-xl gap-2">
              <Download className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 rounded-xl gap-2">
              <RefreshCw className="w-4 h-4"/> {T("refresh")}
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? (
          [1,2,3,4].map(i => <StatCardSkeleton key={i} />)
        ) : (
          [
            { label: "Pending Requests", value: String(pendingCount), Icon: Clock,        color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Pending Amount",   value: fc(pendingAmt),       Icon: Wallet,       color: "text-blue-600",  bg: "bg-blue-50"  },
            { label: "Approved",         value: String(approvedCount),Icon: CheckCircle,  color: "text-green-600", bg: "bg-green-50" },
            { label: "Rejected",         value: String(rejectedCount),Icon: XCircle,      color: "text-gray-600",  bg: "bg-gray-50"  },
          ].map(c => (
            <Card key={c.label} className={`border-0 shadow-sm ${c.bg}`}>
              <CardContent className="p-4">
                <c.Icon className={`w-6 h-6 ${c.color}`} />
                <p className={`text-lg font-extrabold ${c.color} mt-1`}>{c.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium mr-1">Sort:</span>
        {([
          { key: "createdAt" as const, label: "Date" },
          { key: "amount" as const,    label: "Amount" },
          { key: "status" as const,    label: "Status" },
        ] as const).map(opt => (
          <button
            key={opt.key}
            onClick={() => handleDepSort(opt.key)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${depSortKey === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-border/50 text-muted-foreground hover:border-primary/40"}`}
          >
            {opt.label}<DepSortIcon col={opt.key} />
          </button>
        ))}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex border-b border-gray-200">
        {STATUS_TABS.map(t => (
          <button key={t.id} onClick={() => setStatusFilter(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${statusFilter === t.id ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${statusFilter === t.id ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500"}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Select All header for pending deposits */}
      {pendingInFiltered.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allPendingSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20 cursor-pointer"
            />
            <span className="text-sm font-semibold text-gray-600">
              Select All Pending Customer Deposits ({pendingInFiltered.length})
            </span>
          </label>
          {selectedIds.size > 0 && (
            <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600 underline">
              Clear selection
            </button>
          )}
        </div>
      )}

      {/* Pending banner */}
      {pendingCount > 0 && statusFilter !== "approved" && statusFilter !== "rejected" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Manual Verification Required</p>
            <p className="text-xs text-amber-700 mt-0.5">{pendingCount} deposit request{pendingCount > 1 ? "s" : ""} pending. Verify the transaction IDs and approve or reject.</p>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse"/>)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            {statusFilter === "pending"
              ? <PartyPopper className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              : <Inbox className="w-10 h-10 text-gray-400 mx-auto mb-3" />}
            <p className="font-bold text-gray-700">{statusFilter === "pending" ? "No pending requests!" : `No ${statusFilter} requests`}</p>
            <p className="text-sm text-gray-400 mt-1">{statusFilter === "pending" ? "All deposit requests have been processed." : "Nothing to show."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((d: Deposit) => {
            const parsed = parseDesc(d.description || "");
            const expanded = expandedId === d.id;
            const isPending = d.status === "pending";
            const isCustomer = d.user?.roles?.[0] === "customer";
            const isBulkSelectable = isPending && isCustomer;
            const isSelected = selectedIds.has(d.id);
            return (
              <Card key={d.id} className={`border-0 shadow-sm overflow-hidden transition-all ${isSelected && isBulkSelectable ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}>
                <CardContent className="p-0">
                  <div className="flex items-center">
                    {isBulkSelectable && (
                      <div className="pl-4 flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(d.id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20 cursor-pointer"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    )}
                    <button className={`w-full text-left p-4 ${isBulkSelectable ? "pl-3" : ""}`} onClick={() => setExpandedId(expanded ? null : d.id)}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl ${d.status === "pending" ? "bg-amber-50" : d.status === "approved" ? "bg-green-50" : "bg-red-50"}`}>
                            {methodIcon(d.paymentMethod || parsed.method)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-900 text-sm">{d.user?.name || "Unknown"}</p>
                              {d.user?.roles?.[0] && (
                                <Badge className={`text-[10px] font-bold ${roleColor(d.user.roles[0])}`} variant="outline">
                                  {d.user.roles[0] === "customer" ? "Customer" : "Rider"}
                                </Badge>
                              )}
                              <StatusBadge status={d.status}/>
                              {isPending && (
                                <Badge className="text-[10px] font-bold bg-orange-50 text-orange-700 border-orange-300 px-1.5 gap-0.5" variant="outline">
                                  ⏳ Awaiting Manual Review
                                </Badge>
                              )}
                              {duplicateTxIds.has(parseDesc(d.description || "").txId) && (
                                <Badge className="text-[10px] font-bold bg-red-100 text-red-700 border-red-300 px-1.5" variant="outline">
                                  Duplicate TxID
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {methodIcon(d.paymentMethod ?? null)} {parsed.method} · {d.user?.phone} · {fd(d.createdAt)}
                            </p>
                            {parsed.txId !== "—" && (
                              <p className="text-xs font-mono font-bold text-gray-700 mt-0.5 flex items-center gap-1">
                                <span className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wide">TxID:</span>
                                {parsed.txId}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <p className={`text-lg font-extrabold ${d.status === "approved" ? "text-green-600" : d.status === "rejected" ? "text-gray-400 line-through" : "text-blue-600"}`}>
                            {fc(Number(d.amount))}
                          </p>
                          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400"/> : <ChevronDown className="w-4 h-4 text-gray-400"/>}
                        </div>
                      </div>
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          { label: "Payment Method", value: `${methodIcon(d.paymentMethod ?? null)} ${parsed.method}` },
                          { label: "Transaction ID",  value: parsed.txId },
                          { label: "Sender Account",  value: parsed.sender },
                          { label: "Amount",          value: fc(Number(d.amount)) },
                          { label: "Status",          value: d.status.toUpperCase() },
                          ...(d.refNo ? [{ label: "Admin Ref", value: d.refNo }] : []),
                        ].map(f => (
                          <div key={f.label} className="bg-white rounded-xl p-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{f.label}</p>
                            <p className="text-sm font-bold text-gray-800 mt-0.5 font-mono">{f.value}</p>
                          </div>
                        ))}
                      </div>
                      {parsed.note && (
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-[10px] font-bold text-gray-400 uppercase">Note from User</p>
                          <p className="text-sm text-gray-700 mt-0.5">{parsed.note}</p>
                        </div>
                      )}

                      {d.status === "pending" && (
                        <div className="flex gap-3">
                          <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold gap-2"
                            onClick={() => setApproveTarget(d)}>
                            <CheckCircle className="w-4 h-4"/> Approve & Credit
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 border-red-300 text-red-600 hover:bg-red-50 font-bold gap-2"
                            onClick={() => setRejectTarget(d)}>
                            <XCircle className="w-4 h-4"/> Reject
                          </Button>
                        </div>
                      )}

                      {d.status === "approved" && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0"/>
                          <p className="text-xs text-green-700 font-medium">
                            {fc(Number(d.amount))} {d.user?.name}'s wallet mein credited.
                            {d.refNo && <> Reference: <strong>{d.refNo}</strong></>}
                          </p>
                        </div>
                      )}

                      {d.status === "rejected" && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0"/>
                          <p className="text-xs text-red-700 font-medium">
                            Request rejected. {d.refNo && <>Reason: <strong>{d.refNo}</strong>.</>}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sticky Bulk Action Bar */}
      {selectedDeposits.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-primary/10 text-primary text-sm font-extrabold px-3 py-1.5 rounded-full">
                {selectedDeposits.length} selected
              </div>
              <p className="text-sm text-gray-600 font-semibold hidden sm:block">
                Total: <span className="text-blue-600 font-extrabold">{fc(selectedTotal)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white font-bold gap-1.5"
                onClick={() => setShowBulkApprove(true)}>
                <CheckCircle className="w-4 h-4"/> Bulk Approve
              </Button>
              <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 font-bold gap-1.5"
                onClick={() => setShowBulkReject(true)}>
                <XCircle className="w-4 h-4"/> Bulk Reject
              </Button>
            </div>
          </div>
        </div>
      )}

      {approveTarget && <ApproveModal d={approveTarget} onClose={() => setApproveTarget(null)}/>}
      {rejectTarget  && <RejectModal  d={rejectTarget}  onClose={() => setRejectTarget(null)}/>}
      {showBulkApprove && (
        <BulkApproveModal
          count={selectedDeposits.length}
          totalAmount={selectedTotal}
          onConfirm={handleBulkApprove}
          onClose={() => setShowBulkApprove(false)}
          isPending={bulkApprove.isPending}
        />
      )}
      {showBulkReject && (
        <BulkRejectModal
          count={selectedDeposits.length}
          totalAmount={selectedTotal}
          onConfirm={handleBulkReject}
          onClose={() => setShowBulkReject(false)}
          isPending={bulkReject.isPending}
        />
      )}
    </div>
  );
}
