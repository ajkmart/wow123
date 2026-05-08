import { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/components/shared";
import { Search, Star, Plus, Minus, Loader2, Settings2, ArrowUpDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";
import { usePlatformSettings, useUpdatePlatformSettings } from "@/hooks/use-admin";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MobileDrawer } from "@/components/MobileDrawer";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type LoyaltyPoints = {
  totalEarned: number;
  totalRedeemed: number;
  available: number;
};

type LoyaltyUser = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  avatar: string | null;
  walletBalance: number;
  isActive: boolean;
  createdAt: string;
  loyaltyPoints: LoyaltyPoints;
};

type AdjustResponse = {
  success: boolean;
  loyaltyPoints: LoyaltyPoints;
};

type PlatformSetting = {
  key: string;
  value: string;
};

function useLoyaltyUsers(search: string) {
  return useQuery<{ users: LoyaltyUser[]; total: number }>({
    queryKey: ["admin-loyalty-users", search],
    queryFn: () => fetcher(`/loyalty/users${search ? `?q=${encodeURIComponent(search)}` : ""}`),
    refetchInterval: 30_000,
  });
}

function AdjustPointsModal({ user, onClose }: { user: LoyaltyUser; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const mutation = useMutation<AdjustResponse, Error, { amount: number; reason: string; type: string }>({
    mutationFn: (body) =>
      fetcher(`/loyalty/users/${user.id}/adjust`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["admin-loyalty-users"] });
      toast({
        title: type === "credit" ? "Points credited" : "Points debited",
        description: `${amount} loyalty points ${type === "credit" ? "added to" : "removed from"} ${user.name || user.phone}'s account. New balance: ${data.loyaltyPoints?.available ?? "N/A"} pts`,
      });
      onClose();
    },
    onError: (e) => toast({ title: "Adjustment failed", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const numAmount = Math.floor(Number(amount));
    if (!numAmount || numAmount <= 0 || !Number.isInteger(Number(amount))) {
      toast({ title: "Invalid amount", description: "Enter a positive whole number", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Please provide a reason for this adjustment", variant: "destructive" });
      return;
    }
    mutation.mutate({ amount: numAmount, reason: reason.trim(), type });
  };

  return (
    <MobileDrawer
      open
      onClose={onClose}
      title={<><Star className="w-5 h-5 text-amber-500" /> Adjust Points — {user.name || user.phone}</>}
      dialogClassName="w-[95vw] max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl"
    >
      <div className="space-y-4 mt-2">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm">
              {(user.name || user.phone || "U")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{user.name || user.phone}</p>
              <p className="text-xs text-muted-foreground">{user.phone}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-amber-700">{user.loyaltyPoints.available}</p>
              <p className="text-[10px] text-muted-foreground uppercase font-bold">Available Pts</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setType("credit")}
            className={`p-3 rounded-xl border transition-all ${type === "credit" ? "bg-emerald-50 border-emerald-400 shadow-sm" : "bg-muted/30 border-border hover:border-emerald-300"}`}
          >
            <Plus className={`w-5 h-5 mx-auto mb-1 ${type === "credit" ? "text-emerald-600" : "text-muted-foreground"}`} />
            <p className={`text-sm font-semibold ${type === "credit" ? "text-emerald-700" : "text-muted-foreground"}`}>Credit</p>
            <p className="text-[10px] text-muted-foreground">Add points</p>
          </button>
          <button
            onClick={() => setType("debit")}
            className={`p-3 rounded-xl border transition-all ${type === "debit" ? "bg-red-50 border-red-400 shadow-sm" : "bg-muted/30 border-border hover:border-red-300"}`}
          >
            <Minus className={`w-5 h-5 mx-auto mb-1 ${type === "debit" ? "text-red-600" : "text-muted-foreground"}`} />
            <p className={`text-sm font-semibold ${type === "debit" ? "text-red-700" : "text-muted-foreground"}`}>Debit</p>
            <p className="text-[10px] text-muted-foreground">Remove points</p>
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Amount (points)</label>
          <Input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Enter points amount"
            className="h-10 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold">Reason</label>
          <Textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Compensation for late delivery, Manual correction..."
            className="rounded-xl resize-none"
            rows={3}
          />
        </div>

        {type === "debit" && Number(amount) > user.loyaltyPoints.available && Number(amount) > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
            <Minus className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">
              Cannot debit {amount} points. User only has {user.loyaltyPoints.available} points available.
            </p>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={mutation.isPending || !amount || !reason.trim() || (type === "debit" && Number(amount) > user.loyaltyPoints.available)}
          className={`w-full h-11 rounded-xl gap-2 ${type === "credit" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"} text-white`}
        >
          {mutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : type === "credit" ? (
            <Plus className="w-4 h-4" />
          ) : (
            <Minus className="w-4 h-4" />
          )}
          {type === "credit" ? "Credit" : "Debit"} {amount || "0"} Points
        </Button>
      </div>
    </MobileDrawer>
  );
}

type SortField = "name" | "available" | "totalEarned";
type SortDir = "asc" | "desc";

export default function LoyaltyPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [adjustUser, setAdjustUser] = useState<LoyaltyUser | null>(null);
  const [sortField, setSortField] = useState<SortField>("available");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, refetch } = useLoyaltyUsers(debouncedSearch);
  const { data: settingsData } = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();
  const { toast } = useToast();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  };

  const settings = settingsData as PlatformSetting[] | undefined;
  const loyaltyEnabledSetting = settings?.find((s) => s.key === "customer_loyalty_enabled");
  const loyaltyPtsSetting = settings?.find((s) => s.key === "customer_loyalty_pts");
  const loyaltyEnabled = (loyaltyEnabledSetting?.value ?? "on") === "on";
  const loyaltyPtsPerRs100 = parseFloat(loyaltyPtsSetting?.value ?? "5");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const users = [...(data?.users || [])].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") {
      cmp = (a.name || "").localeCompare(b.name || "");
    } else if (sortField === "available") {
      cmp = a.loyaltyPoints.available - b.loyaltyPoints.available;
    } else if (sortField === "totalEarned") {
      cmp = a.loyaltyPoints.totalEarned - b.loyaltyPoints.totalEarned;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPointsInCirculation = users.reduce((sum, u) => sum + u.loyaltyPoints.available, 0);
  const totalEarned = users.reduce((sum, u) => sum + u.loyaltyPoints.totalEarned, 0);
  const totalRedeemed = users.reduce((sum, u) => sum + u.loyaltyPoints.totalRedeemed, 0);

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown className={`w-3 h-3 inline ml-1 cursor-pointer ${sortField === field ? "text-amber-600" : "text-muted-foreground/50"}`} />
  );

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
      <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
        <PageHeader
          icon={Star}
          title="Loyalty Points"
          subtitle="Manage customer loyalty point balances"
          iconBgClass="bg-amber-100"
          iconColorClass="text-amber-600"
          actions={
            <Badge variant="outline" className={`${loyaltyEnabled ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-red-50 text-red-700 border-red-300"} text-xs font-bold`}>
              {loyaltyEnabled ? "Program Active" : "Program Disabled"}
            </Badge>
          }
        />

        <Card className="rounded-xl border shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold">Platform Configuration</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center justify-between bg-muted/30 rounded-xl p-3 border">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">Program Status</p>
                <p className="text-sm font-semibold mt-0.5">{loyaltyEnabled ? "Enabled" : "Disabled"}</p>
              </div>
              <Switch
                checked={loyaltyEnabled}
                onCheckedChange={(checked) => {
                  updateSettings.mutate(
                    [{ key: "customer_loyalty_enabled", value: checked ? "on" : "off" }],
                    {
                      onSuccess: () => toast({ title: "Loyalty program " + (checked ? "enabled" : "disabled") }),
                      onError: (e) => toast({ title: "Failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" }),
                    }
                  );
                }}
              />
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border">
              <p className="text-xs font-bold text-muted-foreground uppercase">Earn Rate</p>
              <p className="text-sm font-semibold mt-0.5">{loyaltyPtsPerRs100} pts per Rs. 100</p>
            </div>
            <div className="bg-muted/30 rounded-xl p-3 border">
              <p className="text-xs font-bold text-muted-foreground uppercase">Total Customers</p>
              <p className="text-sm font-semibold mt-0.5">{data?.total ?? "—"}</p>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="rounded-xl border shadow-sm p-4 bg-gradient-to-br from-amber-50 to-orange-50">
            <p className="text-xs font-bold text-amber-600 uppercase">Points in Circulation</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{totalPointsInCirculation.toLocaleString()}</p>
          </Card>
          <Card className="rounded-xl border shadow-sm p-4 bg-gradient-to-br from-emerald-50 to-green-50">
            <p className="text-xs font-bold text-emerald-600 uppercase">Total Earned</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{totalEarned.toLocaleString()}</p>
          </Card>
          <Card className="rounded-xl border shadow-sm p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
            <p className="text-xs font-bold text-blue-600 uppercase">Total Redeemed</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">{totalRedeemed.toLocaleString()}</p>
          </Card>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="pl-10 h-10 rounded-xl"
          />
        </div>

        {/* Mobile card list — shown below md breakpoint */}
        <section className="md:hidden space-y-3" aria-label="Loyalty customers">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="rounded-xl border shadow-sm p-4 animate-pulse">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="h-4 w-28 bg-muted rounded" />
                    <div className="h-3 w-20 bg-muted rounded" />
                  </div>
                  <div className="h-5 w-14 bg-muted rounded-full" />
                </div>
              </Card>
            ))
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">No customers found</p>
            </div>
          ) : (
            users.map(u => (
              <Card key={u.id} className="rounded-xl border shadow-sm overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0" aria-hidden="true">
                      {(u.name || u.phone || "U")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{u.name || "—"}</p>
                      {u.email && <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>}
                      <p className="text-xs text-muted-foreground">{u.phone || "—"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-amber-50 rounded-lg p-2">
                      <p className="font-bold text-amber-700">{u.loyaltyPoints.available.toLocaleString()}</p>
                      <p className="text-muted-foreground">Available</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2">
                      <p className="font-bold text-emerald-600">{u.loyaltyPoints.totalEarned.toLocaleString()}</p>
                      <p className="text-muted-foreground">Earned</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="font-bold text-blue-600">{u.loyaltyPoints.totalRedeemed.toLocaleString()}</p>
                      <p className="text-muted-foreground">Redeemed</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-sm font-semibold">{formatCurrency(u.walletBalance)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAdjustUser(u)}
                      className="h-8 rounded-lg text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                    >
                      <Star className="w-3.5 h-3.5" aria-hidden="true" />
                      Adjust
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        {/* Desktop table — hidden below md breakpoint */}
        <Card className="hidden md:block rounded-xl border shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="h-40 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading customers...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">No customers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                      Customer <SortIcon field="name" />
                    </TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("available")}>
                      Available <SortIcon field="available" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("totalEarned")}>
                      Earned <SortIcon field="totalEarned" />
                    </TableHead>
                    <TableHead className="text-right">Redeemed</TableHead>
                    <TableHead className="text-right">Wallet</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0">
                            {(u.name || u.phone || "U")[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{u.name || "—"}</p>
                            {u.email && <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.phone || "—"}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-bold text-amber-700">{u.loyaltyPoints.available.toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-emerald-600 font-medium">
                        {u.loyaltyPoints.totalEarned.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm text-blue-600 font-medium">
                        {u.loyaltyPoints.totalRedeemed.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {formatCurrency(u.walletBalance)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAdjustUser(u)}
                          className="h-8 rounded-lg text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                        >
                          <Star className="w-3.5 h-3.5" />
                          Adjust
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {adjustUser && (
          <AdjustPointsModal user={adjustUser} onClose={() => setAdjustUser(null)} />
        )}
      </div>
    </PullToRefresh>
  );
}
