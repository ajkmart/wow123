import { useState, useMemo } from "react";
import { adminFetch } from "@/lib/adminFetcher";
import { Megaphone, Send, Bell, Users, Loader2, ChevronDown, ChevronUp, CheckCircle2, XCircle, History } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { useBroadcast, useBroadcastRecipientCount } from "@/hooks/use-admin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";

type AudienceRole = "customer" | "rider" | "vendor" | "admin";
const ROLE_OPTIONS: { value: AudienceRole; label: string }[] = [
  { value: "customer", label: "Customers" },
  { value: "rider",    label: "Riders" },
  { value: "vendor",   label: "Vendors" },
  { value: "admin",    label: "Admins" },
];

type BroadcastRecord = {
  id: string;
  title: string;
  body: string;
  type: string;
  targetRole?: string;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  adminId?: string;
  sentAt: string;
};

export default function Broadcast() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const broadcastMutation = useBroadcast();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [formData, setFormData] = useState({
    title: "",
    body: "",
    type: "system",
    icon: "notifications-outline",
  });
  const [allUsers, setAllUsers] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<AudienceRole[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["admin-broadcasts-history"],
    queryFn: () => adminFetch("/broadcasts"),
    enabled: historyOpen,
    refetchInterval: historyOpen ? 30_000 : false,
  });
  const history: BroadcastRecord[] = (historyData?.broadcasts ?? historyData ?? []) as BroadcastRecord[];

  const targetRolesForQuery: string[] | "all" = allUsers ? "all" : selectedRoles;
  const recipientCountQuery = useBroadcastRecipientCount(
    targetRolesForQuery === "all" ? "all" : targetRolesForQuery,
  );

  const audienceLabel = useMemo(() => {
    if (allUsers) return "All Active Users";
    if (selectedRoles.length === 0) return "No audience selected";
    if (selectedRoles.length === 1) {
      const r = selectedRoles[0]!;
      return `${r.charAt(0).toUpperCase() + r.slice(1)}s Only`;
    }
    return selectedRoles.map(r => r.charAt(0).toUpperCase() + r.slice(1) + "s").join(" + ");
  }, [allUsers, selectedRoles]);

  const audienceReady = allUsers || selectedRoles.length > 0;

  const toggleRole = (role: AudienceRole, checked: boolean) => {
    setSelectedRoles(prev => {
      if (checked) return prev.includes(role) ? prev : [...prev, role];
      return prev.filter(r => r !== role);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.body || !audienceReady) return;

    const targetRole = allUsers
      ? undefined
      : selectedRoles.length === 1
        ? selectedRoles[0]
        : selectedRoles;

    const payload = { ...formData, targetRole };

    broadcastMutation.mutate(payload, {
      onSuccess: (data) => {
        toast({
          title: "Broadcast Sent!",
          description: `Sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"} (${audienceLabel}).`,
        });
        setFormData({ title: "", body: "", type: "system", icon: "notifications-outline" });
        setAllUsers(true);
        setSelectedRoles([]);
        recipientCountQuery.refetch();
        qc.invalidateQueries({ queryKey: ["admin-broadcasts-history"] });
      },
      onError: (err) => {
        toast({ title: "Failed to send", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Megaphone}
        title={T("broadcast")}
        subtitle={T("broadcastSubtitle")}
        iconBgClass="bg-rose-100"
        iconColorClass="text-rose-600"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="rounded-3xl border-border/50 shadow-lg shadow-black/5">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{T("notificationTitle")}</label>
                <Input
                  required
                  placeholder="e.g., Flash Sale is Live!"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="h-12 rounded-xl text-base bg-muted/30 focus:bg-background"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground">{T("messageBody")}</label>
                <Textarea
                  required
                  placeholder="Type your message here..."
                  value={formData.body}
                  onChange={e => setFormData({...formData, body: e.target.value})}
                  className="min-h-[120px] rounded-xl text-base bg-muted/30 focus:bg-background resize-none"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Target Audience
                </label>

                <Select
                  value={allUsers ? "all" : "specific"}
                  onValueChange={v => {
                    if (v === "all") { setAllUsers(true); setSelectedRoles([]); }
                    else { setAllUsers(false); }
                  }}
                >
                  <SelectTrigger className="h-12 rounded-xl bg-muted/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Active Users</SelectItem>
                    <SelectItem value="specific">Specific roles…</SelectItem>
                  </SelectContent>
                </Select>

                {!allUsers && (
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
                    {ROLE_OPTIONS.map(opt => (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 cursor-pointer text-sm select-none"
                      >
                        <Checkbox
                          checked={selectedRoles.includes(opt.value)}
                          onCheckedChange={(c) => toggleRole(opt.value, c === true)}
                          data-testid={`broadcast-role-${opt.value}`}
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Estimated recipients preview */}
                <div
                  className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
                  data-testid="broadcast-recipient-preview"
                >
                  <div className="flex items-center gap-2 text-sm text-foreground/80">
                    <Users className="w-4 h-4" />
                    <span>Estimated recipients</span>
                    <span className="text-xs text-muted-foreground">· {audienceLabel}</span>
                  </div>
                  <div className="text-base font-bold text-primary">
                    {!audienceReady
                      ? "—"
                      : recipientCountQuery.isLoading
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : recipientCountQuery.isError
                          ? "—"
                          : (recipientCountQuery.data?.count ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">{T("type")}</label>
                  <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}>
                    <SelectTrigger className="h-12 rounded-xl bg-muted/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">{T("system")}</SelectItem>
                      <SelectItem value="promotional">{T("promotional")}</SelectItem>
                      <SelectItem value="alert">{T("alert")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-foreground">{T("icon")}</label>
                  <Select value={formData.icon} onValueChange={v => setFormData({...formData, icon: v})}>
                    <SelectTrigger className="h-12 rounded-xl bg-muted/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="notifications-outline">{T("defaultBell")}</SelectItem>
                      <SelectItem value="gift-outline">{T("giftBox")}</SelectItem>
                      <SelectItem value="warning-outline">{T("warning")}</SelectItem>
                      <SelectItem value="megaphone-outline">{T("megaphone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={
                  broadcastMutation.isPending ||
                  !formData.title ||
                  !formData.body ||
                  !audienceReady
                }
                className="w-full h-14 rounded-xl text-base font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 transition-all mt-4"
                data-testid="broadcast-send-button"
              >
                {broadcastMutation.isPending
                  ? T("loading")
                  : `Send to ${audienceLabel}`}
                {!broadcastMutation.isPending && <Send className="w-5 h-5 ml-2" />}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <div>
          <h3 className="text-lg font-bold mb-4 ml-1">{T("livePreview")}</h3>
          <div className="w-full max-w-[340px] h-[650px] bg-gray-900 rounded-[3rem] p-4 shadow-2xl relative mx-auto border-8 border-gray-800 flex flex-col overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-6 w-32 bg-gray-800 rounded-b-3xl mx-auto z-20"></div>
            <div className="flex-1 bg-gray-50 rounded-[2rem] overflow-hidden pt-12 p-4 relative">
              <div className="w-full bg-white rounded-2xl p-4 shadow-xl border border-gray-100 animate-in slide-in-from-top-4 fade-in duration-500 flex gap-3 relative overflow-hidden">
                {formData.type === 'promotional' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                )}
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900 truncate">
                    {formData.title || T("notificationTitle")}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                    {formData.body || "This is how your message will appear to users on their mobile devices."}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-2 font-medium">just now • AJKMart</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recent Broadcasts History ── */}
      <Card className="rounded-2xl border-border/50">
        <button
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors rounded-2xl"
          onClick={() => setHistoryOpen(o => !o)}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Recent Broadcasts</span>
          </div>
          {historyOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>

        {historyOpen && (
          <div className="px-6 pb-5">
            {historyLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No broadcasts sent yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="pb-2 pr-3">Title</th>
                      <th className="pb-2 pr-3">Audience</th>
                      <th className="pb-2 pr-3">Sent</th>
                      <th className="pb-2 pr-3">Delivered</th>
                      <th className="pb-2 pr-3">Failed</th>
                      <th className="pb-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(b => (
                      <tr key={b.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="py-2.5 pr-3 font-medium truncate max-w-[160px]">{b.title}</td>
                        <td className="py-2.5 pr-3">
                          <Badge variant="outline" className="text-xs capitalize">
                            {b.targetRole ?? "all"}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="font-semibold">{b.sentCount}</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge variant="outline" className="text-xs text-green-700 bg-green-50 border-green-200 gap-1">
                            <CheckCircle2 className="w-3 h-3" />{b.deliveredCount}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge variant="outline" className={`text-xs gap-1 ${b.failedCount > 0 ? "text-red-700 bg-red-50 border-red-200" : "text-muted-foreground"}`}>
                            <XCircle className="w-3 h-3" />{b.failedCount}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(b.sentAt).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
