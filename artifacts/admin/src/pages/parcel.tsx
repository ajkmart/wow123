import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared";
import { useParcelBookings, useUpdateParcelBooking } from "@/hooks/use-admin";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Box, Search, User, MapPin, Phone, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";

const STATUS_LABELS: Record<string, string> = {
  pending:    "Pending",
  searching:  "Searching",
  accepted:   "Accepted",
  in_transit: "In Transit",
  completed:  "Completed",
  cancelled:  "Cancelled",
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending:    ["searching", "cancelled"],
  searching:  ["accepted", "cancelled"],
  accepted:   ["in_transit", "cancelled"],
  in_transit: ["completed", "cancelled"],
  completed:  ["completed"],
  cancelled:  ["cancelled"],
};

export default function Parcel() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading } = useParcelBookings();
  const updateMutation = useUpdateParcelBooking();
  const { toast } = useToast();

  const [search, setSearch]                     = useState("");
  const [selectedBooking, setSelectedBooking]   = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling]             = useState(false);

  /* Last-refreshed ticker */
  const [secAgo, setSecAgo] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  useEffect(() => { if (!isLoading) { setLastRefreshed(new Date()); setSecAgo(0); } }, [isLoading]);
  useEffect(() => {
    const t = setInterval(() => setSecAgo(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [lastRefreshed]);

  const handleUpdateStatus = (id: string, status: string) => {
    updateMutation.mutate({ id, status }, {
      onSuccess: () => {
        toast({ title: `Status → ${STATUS_LABELS[status]} ✅` });
        if (selectedBooking?.id === id) setSelectedBooking((p: any) => ({ ...p, status }));
      },
      onError: err => toast({ title: "Update failed", description: err.message, variant: "destructive" })
    });
  };

  const handleCancelBooking = () => {
    setCancelling(true);
    updateMutation.mutate({ id: selectedBooking.id, status: "cancelled" }, {
      onSuccess: () => {
        setSelectedBooking((p: any) => ({ ...p, status: "cancelled" }));
        setShowCancelConfirm(false);
        setCancelling(false);
        toast({ title: "Parcel booking cancelled ✅" + (selectedBooking.paymentMethod === "wallet" ? " — Wallet refund issued" : "") });
      },
      onError: err => {
        setCancelling(false);
        toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
      },
    });
  };

  const bookings = data?.bookings || [];
  const q = search.toLowerCase();
  const filtered = bookings.filter((b: any) =>
    b.id.toLowerCase().includes(q) ||
    (b.userName     || "").toLowerCase().includes(q) ||
    (b.userPhone    || "").includes(q) ||
    (b.senderName   || "").toLowerCase().includes(q) ||
    (b.receiverName || "").toLowerCase().includes(q)
  );

  const totalCount     = bookings.length;
  const pendingCount   = bookings.filter((b: any) => ["pending","searching"].includes(b.status)).length;
  const activeCount    = bookings.filter((b: any) => ["accepted","in_transit"].includes(b.status)).length;
  const completedCount = bookings.filter((b: any) => b.status === "completed").length;
  const cancelledCount = bookings.filter((b: any) => b.status === "cancelled").length;

  const isTerminal  = (s: string) => s === "completed" || s === "cancelled";
  const canCancel   = (b: any) => !isTerminal(b.status);
  const allowedNext = (b: any) => ALLOWED_TRANSITIONS[b.status] ?? [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={Box}
        title={T("parcelBookings")}
        subtitle={`${totalCount} ${T("total")} · ${pendingCount} ${T("pending")} · ${activeCount} ${T("active")}`}
        iconBgClass="bg-orange-100"
        iconColorClass="text-orange-600"
        actions={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${secAgo < 35 ? "bg-green-500" : "bg-amber-400"} animate-pulse`} />
            {isLoading ? "Refreshing..." : `Refreshed ${secAgo}s ago`}
          </div>
        }
      />

      {/* Pending parcel bookings alert */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border-2 border-orange-400 rounded-2xl px-4 py-3">
          <span className="text-2xl">📫</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-800">
              {pendingCount} parcel booking{pendingCount > 1 ? "s" : ""} pending / searching for a rider!
            </p>
            <p className="text-xs text-orange-600">
              {bookings.filter((b: any) => ["pending","searching"].includes(b.status)).slice(0,3).map((b: any) => `#${b.id.slice(-6).toUpperCase()}`).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center">
          <p className="text-3xl font-bold text-foreground">{totalCount}</p>
          <p className="text-xs text-muted-foreground mt-1">{T("totalBookings")}</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center bg-amber-50/60 border-amber-200/60">
          <p className="text-3xl font-bold text-amber-700">{pendingCount}</p>
          <p className="text-xs text-amber-600 mt-1">{T("pending")}</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center bg-blue-50/60 border-blue-200/60">
          <p className="text-3xl font-bold text-blue-700">{activeCount}</p>
          <p className="text-xs text-blue-500 mt-1">{T("activeInTransit")}</p>
        </Card>
        <Card className="p-4 rounded-2xl border-border/50 shadow-sm text-center bg-green-50/60 border-green-200/60">
          <p className="text-3xl font-bold text-green-700">{completedCount}</p>
          <p className="text-xs text-green-500 mt-1">{T("completed")}</p>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-3 sm:p-4 rounded-2xl border-border/50 shadow-sm">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, sender, receiver, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-11 rounded-xl bg-muted/30 border-border/50"
          />
        </div>
      </Card>

      {/* Mobile card list — shown below md breakpoint */}
      <section className="md:hidden space-y-3" aria-label="Parcel bookings">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="rounded-2xl border-border/50 shadow-sm p-4 animate-pulse">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-4 w-28 bg-muted rounded" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
                <div className="h-5 w-16 bg-muted rounded-full" />
              </div>
            </Card>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Box className="w-10 h-10 text-muted-foreground/25 mb-3" aria-hidden="true" />
            <p className="font-semibold text-muted-foreground">No bookings found.</p>
          </div>
        ) : (
          filtered.map((b: any) => (
            <Card
              key={b.id}
              role="button"
              tabIndex={0}
              aria-label={`View parcel booking ${b.id.slice(-8).toUpperCase()}, ${STATUS_LABELS[b.status] ?? b.status}`}
              className="rounded-2xl border-border/50 shadow-sm overflow-hidden cursor-pointer"
              onClick={() => { setSelectedBooking(b); setShowCancelConfirm(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBooking(b); setShowCancelConfirm(false); } }}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono font-semibold text-sm">{b.id.slice(-8).toUpperCase()}</p>
                    <Badge variant="outline" className="mt-1 text-[10px] uppercase">{b.parcelType}</Badge>
                  </div>
                  <Badge className={`text-[10px] font-bold uppercase shrink-0 ${getStatusColor(b.status)}`}>
                    {STATUS_LABELS[b.status] ?? b.status}
                  </Badge>
                </div>
                {b.userName && (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0" aria-hidden="true">
                      <User className="w-3.5 h-3.5 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{b.userName}</p>
                      <p className="text-xs text-muted-foreground">{b.userPhone}</p>
                    </div>
                  </div>
                )}
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" aria-hidden="true" />
                    <span className="truncate">{b.senderName} — {b.pickupAddress}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
                    <span className="truncate">{b.receiverName} — {b.dropAddress}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                  <span className="font-bold text-foreground">{formatCurrency(b.fare)}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(b.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* Desktop table — hidden below md breakpoint */}
      <Card className="hidden md:block rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[640px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-semibold">{T("bookingId")}</TableHead>
                <TableHead className="font-semibold">{T("bookedBy")}</TableHead>
                <TableHead className="font-semibold">{T("route")}</TableHead>
                <TableHead className="font-semibold">{T("fare")}</TableHead>
                <TableHead className="font-semibold">{T("status")}</TableHead>
                <TableHead className="font-semibold text-right">{T("date")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No bookings found.</TableCell></TableRow>
              ) : (
                filtered.map((b: any) => (
                  <TableRow key={b.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => { setSelectedBooking(b); setShowCancelConfirm(false); }}>
                    <TableCell>
                      <p className="font-mono font-medium text-sm">{b.id.slice(-8).toUpperCase()}</p>
                      <Badge variant="outline" className="mt-1 text-[10px] uppercase">{b.parcelType}</Badge>
                    </TableCell>
                    <TableCell>
                      {b.userName ? (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-orange-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{b.userName}</p>
                            <p className="text-xs text-muted-foreground">{b.userPhone}</p>
                          </div>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Unknown</span>}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="truncate max-w-[140px]">{b.senderName} — {b.pickupAddress}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                          <span className="truncate max-w-[140px]">{b.receiverName} — {b.dropAddress}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-bold text-foreground">{formatCurrency(b.fare)}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Select
                        value={b.status}
                        onValueChange={(val) => {
                          if (!allowedNext(b).includes(val)) {
                            toast({ title: "Invalid transition", description: `Can't move ${STATUS_LABELS[b.status]} → ${STATUS_LABELS[val]}`, variant: "destructive" }); return;
                          }
                          handleUpdateStatus(b.id, val);
                        }}
                      >
                        <SelectTrigger className={`w-36 h-8 text-[11px] font-bold uppercase tracking-wider border-2 ${getStatusColor(b.status)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedNext(b).map(s => (
                            <SelectItem key={s} value={s} className="text-xs uppercase font-bold">{STATUS_LABELS[s] ?? s.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{formatDate(b.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Booking Detail Modal */}
      <Dialog open={!!selectedBooking} onOpenChange={open => { if (!open) { setSelectedBooking(null); setShowCancelConfirm(false); } }}>
        <DialogContent className="w-[95vw] max-w-lg rounded-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="w-5 h-5 text-orange-600" />
              Parcel Booking Detail
              {selectedBooking && (
                <Badge variant="outline" className={`ml-2 text-[10px] font-bold uppercase ${getStatusColor(selectedBooking.status)}`}>
                  {STATUS_LABELS[selectedBooking.status]}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedBooking && (
            <div className="space-y-4 mt-2">

              {/* Cancel confirmation inline */}
              {showCancelConfirm && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <p className="text-sm font-bold text-red-700">Cancel Booking #{selectedBooking.id.slice(-6).toUpperCase()}?</p>
                  </div>
                  <p className="text-xs text-red-600">
                    {selectedBooking.paymentMethod === "wallet"
                      ? `${formatCurrency(Math.round(selectedBooking.fare))} customer ki wallet mein refund ho jayega.`
                      : "Cash booking — no wallet refund needed."}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCancelConfirm(false)}
                      className="flex-1 h-9 bg-white border border-red-200 text-red-600 text-sm font-bold rounded-xl">
                      Back
                    </button>
                    <button onClick={handleCancelBooking} disabled={cancelling}
                      className="flex-1 h-9 bg-red-600 text-white text-sm font-bold rounded-xl disabled:opacity-60">
                      {cancelling ? "Cancelling..." : "Confirm Cancel"}
                    </button>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Booking ID</span>
                  <span className="font-mono font-bold">{selectedBooking.id.slice(-8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <Badge variant="secondary" className="uppercase text-[10px]">{selectedBooking.parcelType}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fare</span>
                  <span className="font-bold text-lg">{formatCurrency(selectedBooking.fare)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment</span>
                  <span className={`font-medium capitalize ${selectedBooking.paymentMethod === "wallet" ? "text-blue-600" : "text-green-600"}`}>
                    {selectedBooking.paymentMethod === "wallet" ? "💳 Wallet" : "💵 Cash"}
                  </span>
                </div>
              </div>

              {/* Sender & Receiver */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-bold text-green-700 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Sender (Pickup)</p>
                  <p className="text-sm font-semibold text-gray-800">{selectedBooking.senderName}</p>
                  {selectedBooking.senderPhone && (
                    <div className="flex gap-2 mt-1">
                      <a href={`tel:${selectedBooking.senderPhone}`} className="flex items-center gap-1 text-xs text-green-600 font-medium hover:underline">
                        <Phone className="w-3 h-3" /> Call
                      </a>
                      <a href={`https://wa.me/92${selectedBooking.senderPhone.replace(/^(\+92|0)/, "")}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-green-600 font-medium hover:underline">
                        💬 WA
                      </a>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{selectedBooking.pickupAddress}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] font-bold text-red-700 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Receiver (Drop)</p>
                  <p className="text-sm font-semibold text-gray-800">{selectedBooking.receiverName}</p>
                  {selectedBooking.receiverPhone && (
                    <div className="flex gap-2 mt-1">
                      <a href={`tel:${selectedBooking.receiverPhone}`} className="flex items-center gap-1 text-xs text-red-600 font-medium hover:underline">
                        <Phone className="w-3 h-3" /> Call
                      </a>
                      <a href={`https://wa.me/92${selectedBooking.receiverPhone.replace(/^(\+92|0)/, "")}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-red-600 font-medium hover:underline">
                        💬 WA
                      </a>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{selectedBooking.dropAddress}</p>
                </div>
              </div>

              {selectedBooking.description && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-blue-700 mb-1">Parcel Description</p>
                  <p className="text-sm text-blue-900">{selectedBooking.description}</p>
                </div>
              )}

              {/* Action buttons */}
              {!isTerminal(selectedBooking.status) && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-medium mb-1.5">Move to Next Status</p>
                    <Select
                      value={selectedBooking.status}
                      onValueChange={(val) => {
                        if (val === selectedBooking.status) return;
                        handleUpdateStatus(selectedBooking.id, val);
                      }}
                    >
                      <SelectTrigger className={`h-9 text-[11px] font-bold uppercase tracking-wider border-2 ${getStatusColor(selectedBooking.status)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedNext(selectedBooking).filter(s => s !== "cancelled").map(s => (
                          <SelectItem key={s} value={s} className="text-xs uppercase font-bold">
                            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-green-500" />{STATUS_LABELS[s]}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {canCancel(selectedBooking) && !showCancelConfirm && (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1.5">Admin Actions</p>
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="h-9 px-4 bg-red-50 hover:bg-red-100 border-2 border-red-300 text-red-600 text-xs font-bold rounded-xl whitespace-nowrap transition-colors flex items-center gap-1.5"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Cancel & Refund
                      </button>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground text-right border-t border-border/40 pt-3">Booked: {formatDate(selectedBooking.createdAt)}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
