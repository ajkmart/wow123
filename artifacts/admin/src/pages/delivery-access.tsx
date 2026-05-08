import { useState } from "react";
import { PageHeader } from "@/components/shared";
import {
  Truck, Search, RefreshCw, Plus, Trash2, Edit, CheckCircle2,
  XCircle, Clock, Users, Store, Shield, FileText, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDeliveryAccess, useUpdateDeliveryMode, useAddWhitelistEntry,
  useDeleteWhitelistEntry, useUpdateWhitelistEntry,
  useDeliveryAccessRequests, useResolveDeliveryRequest,
  useDeliveryAccessAudit, useUsers,
} from "@/hooks/use-admin";

const MODE_CARDS = [
  {
    id: "all",
    title: "All",
    icon: "🌐",
    description: "Every customer can order delivery from every store. No restrictions applied.",
    color: "green",
  },
  {
    id: "stores",
    title: "Selected Stores",
    icon: "🏪",
    description: "Only whitelisted vendor stores offer delivery. Others show self-pickup only.",
    color: "blue",
  },
  {
    id: "users",
    title: "Selected Users",
    icon: "👥",
    description: "Only whitelisted customers get delivery. All others see delivery unavailable.",
    color: "purple",
  },
  {
    id: "both",
    title: "Both (Store AND User)",
    icon: "🔐",
    description: "Customer must be whitelisted AND ordering from a whitelisted store. Invite-only delivery.",
    color: "orange",
  },
];

const SERVICE_TYPES = ["all", "mart", "food", "pharmacy", "parcel"];

function AddEntryModal({ type, onClose }: { type: "vendor" | "user"; onClose: () => void }) {
  const { toast } = useToast();
  const addMutation = useAddWhitelistEntry();
  const { data: usersData } = useUsers();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [serviceType, setServiceType] = useState("all");
  const [deliveryLabel, setDeliveryLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const allUsers: any[] = usersData?.users || [];
  const filtered = allUsers
    .filter((u: any) => type === "vendor" ? u.role === "vendor" : u.role === "customer")
    .filter((u: any) => {
      const q = search.toLowerCase();
      return !search || (u.name ?? "").toLowerCase().includes(q) || (u.phone ?? "").includes(q) || (u.storeName ?? "").toLowerCase().includes(q);
    })
    .slice(0, 20);

  const handleAdd = () => {
    if (!selectedId) { toast({ title: "Select a " + type, variant: "destructive" }); return; }
    addMutation.mutate({
      type,
      targetId: selectedId,
      serviceType,
      deliveryLabel: type === "vendor" ? deliveryLabel : undefined,
      notes: notes || undefined,
      validUntil: validUntil || undefined,
    }, {
      onSuccess: () => { toast({ title: `${type === "vendor" ? "Store" : "User"} added to whitelist` }); onClose(); },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-500" />
            Add {type === "vendor" ? "Store" : "User"} to Whitelist
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Search {type === "vendor" ? "Vendor" : "User"}</label>
            <Input placeholder={`Search by name${type === "vendor" ? ", store name" : ""}, phone...`} value={search} onChange={e => setSearch(e.target.value)} className="h-11 rounded-xl" />
          </div>
          {filtered.length > 0 && (
            <div className="max-h-40 overflow-y-auto border rounded-xl">
              {filtered.map((u: any) => (
                <div key={u.id} onClick={() => setSelectedId(u.id)}
                  className={`p-3 cursor-pointer border-b last:border-b-0 transition-colors ${selectedId === u.id ? "bg-blue-50 border-blue-200" : "hover:bg-muted/30"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{u.storeName || u.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.phone} · {u.name}</p>
                    </div>
                    {selectedId === u.id && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Service Type</label>
            <Select value={serviceType} onValueChange={setServiceType}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map(st => <SelectItem key={st} value={st} className="capitalize">{st}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {type === "vendor" && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Custom Delivery Label (optional)</label>
              <Input placeholder="e.g. Al-Falah Express" value={deliveryLabel} onChange={e => setDeliveryLabel(e.target.value)} className="h-11 rounded-xl" />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Valid Until (optional)</label>
            <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Admin Note (optional)</label>
            <Input placeholder="e.g. Partnership contract 2026" value={notes} onChange={e => setNotes(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending || !selectedId} className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              {addMutation.isPending ? "Adding..." : "Add to Whitelist"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditEntryModal({ entry, onClose }: { entry: any; onClose: () => void }) {
  const { toast } = useToast();
  const updateMutation = useUpdateWhitelistEntry();
  const [deliveryLabel, setDeliveryLabel] = useState(entry.deliveryLabel || "");
  const [notes, setNotes] = useState(entry.notes || "");
  const [validUntil, setValidUntil] = useState(entry.validUntil ? new Date(entry.validUntil).toISOString().slice(0, 10) : "");
  const [status, setStatus] = useState(entry.status);

  const handleSave = () => {
    updateMutation.mutate({
      id: entry.id,
      deliveryLabel: entry.type === "vendor" ? deliveryLabel : undefined,
      notes: notes || undefined,
      validUntil: validUntil || undefined,
      status,
    }, {
      onSuccess: () => { toast({ title: "Entry updated" }); onClose(); },
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-orange-500" /> Edit Whitelist Entry
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="bg-muted/30 rounded-xl p-3">
            <p className="text-sm font-medium">{entry.storeName || entry.userName || "—"}</p>
            <p className="text-xs text-muted-foreground">{entry.userPhone} · {entry.type} · {entry.serviceType}</p>
          </div>
          {entry.type === "vendor" && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Delivery Label</label>
              <Input value={deliveryLabel} onChange={e => setDeliveryLabel(e.target.value)} placeholder="Custom label" className="h-11 rounded-xl" />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Valid Until</label>
            <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Admin note" className="h-11 rounded-xl" />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase block mb-1.5">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending} className="flex-1 rounded-xl">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DeliveryAccess() {
  const { toast } = useToast();
  const { data, isLoading, refetch, isFetching } = useDeliveryAccess();
  const { data: requestsData } = useDeliveryAccessRequests();
  const { data: auditData } = useDeliveryAccessAudit();
  const modeMutation = useUpdateDeliveryMode();
  const deleteMutation = useDeleteWhitelistEntry();
  const resolveMutation = useResolveDeliveryRequest();

  const [tab, setTab] = useState<"whitelist" | "requests" | "audit">("whitelist");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [addModal, setAddModal] = useState<"vendor" | "user" | null>(null);
  const [editModal, setEditModal] = useState<any>(null);

  const mode = data?.mode ?? "all";
  const whitelist: any[] = data?.whitelist || [];
  const requests: any[] = requestsData?.requests || [];
  const auditLogs: any[] = auditData?.logs || [];
  const pendingRequests = requests.filter((r: any) => r.status === "pending");

  const handleModeChange = (newMode: string) => {
    modeMutation.mutate(newMode, {
      onSuccess: () => toast({ title: `Mode changed to "${newMode}"` }),
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast({ title: "Entry removed" }),
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const handleResolveRequest = (id: string, status: "approved" | "rejected") => {
    resolveMutation.mutate({ id, status }, {
      onSuccess: () => toast({ title: `Request ${status}` }),
      onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
    });
  };

  const filtered = whitelist.filter((e: any) => {
    const matchType = typeFilter === "all" || e.type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch = !search ||
      (e.userName ?? "").toLowerCase().includes(q) ||
      (e.userPhone ?? "").includes(q) ||
      (e.storeName ?? "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const colorMap: Record<string, string> = {
    green: "bg-green-50 border-green-300 ring-green-400",
    blue: "bg-blue-50 border-blue-300 ring-blue-400",
    purple: "bg-purple-50 border-purple-300 ring-purple-400",
    orange: "bg-orange-50 border-orange-300 ring-orange-400",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Truck}
        title="Delivery Access Control"
        subtitle={`Mode: ${mode} · ${whitelist.length} whitelist entries${pendingRequests.length > 0 ? ` · ${pendingRequests.length} pending requests` : ""}`}
        iconBgClass="bg-blue-100"
        iconColorClass="text-blue-600"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-xl gap-2">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <div>
        <p className="text-sm font-semibold text-muted-foreground mb-3">Delivery Access Mode</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MODE_CARDS.map(card => {
            const active = mode === card.id;
            return (
              <div
                key={card.id}
                onClick={() => handleModeChange(card.id)}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${active ? `${colorMap[card.color]} ring-2` : "bg-white border-border/50 hover:border-border"}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{card.icon}</span>
                  <p className="font-bold text-sm">{card.title}</p>
                  {active && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px]">Active</Badge>}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
              </div>
            );
          })}
        </div>
        {modeMutation.isPending && (
          <p className="text-xs text-blue-600 mt-2 animate-pulse">Updating mode...</p>
        )}
      </div>

      <div className="flex gap-2 border-b border-border/50">
        {([
          { id: "whitelist", label: "Whitelist", icon: Shield },
          { id: "requests", label: `Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}`, icon: Clock },
          { id: "audit", label: "Audit Log", icon: FileText },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "whitelist" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name, phone, store..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11 rounded-xl" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-11 rounded-xl w-full sm:w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="vendor">Vendors</SelectItem>
                <SelectItem value="user">Users</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setAddModal("vendor")} className="h-11 rounded-xl gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
                <Store className="w-4 h-4" /> Add Store
              </Button>
              <Button size="sm" onClick={() => setAddModal("user")} className="h-11 rounded-xl gap-1.5 bg-purple-600 hover:bg-purple-700 text-white">
                <Users className="w-4 h-4" /> Add User
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-2xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-12 text-center">
                <Shield className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No whitelist entries</p>
                <p className="text-xs text-muted-foreground mt-1">Add stores or users to control delivery access</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((entry: any) => (
                <Card key={entry.id} className="rounded-2xl border-border/50">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${entry.type === "vendor" ? "bg-blue-100" : "bg-purple-100"}`}>
                          {entry.type === "vendor" ? "🏪" : "👤"}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm truncate">{entry.storeName || entry.userName || "—"}</p>
                            <Badge variant="outline" className="text-[10px] capitalize">{entry.type}</Badge>
                            <Badge variant="outline" className="text-[10px] capitalize">{entry.serviceType}</Badge>
                            <Badge className={`text-[10px] ${entry.status === "active" ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                              {entry.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{entry.userPhone}</p>
                          {entry.deliveryLabel && <p className="text-xs text-blue-600 font-medium">Label: {entry.deliveryLabel}</p>}
                          {entry.validUntil && <p className="text-xs text-muted-foreground">Expires: {new Date(entry.validUntil).toLocaleDateString()}</p>}
                          {entry.notes && <p className="text-xs text-muted-foreground italic">{entry.notes}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setEditModal(entry)} className="h-8 rounded-xl gap-1 text-xs">
                          <Edit className="w-3 h-3" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(entry.id)}
                          disabled={deleteMutation.isPending}
                          className="h-8 rounded-xl gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50">
                          <Trash2 className="w-3 h-3" /> Remove
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "requests" && (
        <div className="space-y-3">
          {requests.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="p-12 text-center">
                <Clock className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No delivery access requests</p>
              </CardContent>
            </Card>
          ) : (
            requests.map((r: any) => (
              <Card key={r.id} className="rounded-2xl border-border/50">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-lg">🏪</div>
                      <div>
                        <p className="font-bold text-sm">{r.storeName || r.vendorName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.vendorPhone} · Service: {r.serviceType}</p>
                        <p className="text-xs text-muted-foreground">Requested: {new Date(r.requestedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${r.status === "pending" ? "bg-yellow-100 text-yellow-700" : r.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {r.status}
                      </Badge>
                      {r.status === "pending" && (
                        <>
                          <Button size="sm" onClick={() => handleResolveRequest(r.id, "approved")}
                            disabled={resolveMutation.isPending}
                            className="h-8 rounded-xl gap-1 text-xs bg-green-600 hover:bg-green-700 text-white">
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleResolveRequest(r.id, "rejected")}
                            disabled={resolveMutation.isPending}
                            className="h-8 rounded-xl gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50">
                            <XCircle className="w-3 h-3" /> Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-2">
          {auditLogs.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="p-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No audit log entries yet</p>
              </CardContent>
            </Card>
          ) : (
            auditLogs.map((log: any) => (
              <Card key={log.id} className="rounded-2xl border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{log.action.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        by {log.adminName || log.adminId || "system"} · {new Date(log.createdAt).toLocaleString()}
                      </p>
                      {log.oldValue && <p className="text-xs text-muted-foreground">From: {log.oldValue}</p>}
                      {log.newValue && <p className="text-xs text-muted-foreground">To: {log.newValue}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {addModal && <AddEntryModal type={addModal} onClose={() => setAddModal(null)} />}
      {editModal && <EditEntryModal entry={editModal} onClose={() => setEditModal(null)} />}
    </div>
  );
}
