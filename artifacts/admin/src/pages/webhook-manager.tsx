import { useState } from "react";
import { PageHeader } from "@/components/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PullToRefresh } from "@/components/PullToRefresh";
import {
  Webhook, Plus, Loader2, Trash2, Send, Eye, CheckCircle2, XCircle, MoreHorizontal,
} from "lucide-react";

const SUPPORTED_EVENTS = [
  "order_placed", "order_delivered", "ride_completed",
  "user_registered", "payment_received",
];

type WebhookReg = {
  id: string; url: string; events: string[]; secret: string;
  isActive: boolean; description: string; createdAt: string;
};

type WebhookLogEntry = {
  id: string; event: string; url: string; status: number;
  success: boolean; error: string | null; durationMs: number; createdAt: string;
};

export default function WebhookManagerPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showLogs, setShowLogs] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-webhooks"],
    queryFn: () => fetcher("/webhooks"),
    refetchInterval: 30_000,
  });
  const webhooks: WebhookReg[] = data?.webhooks || [];

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ["admin-webhook-logs", showLogs],
    queryFn: () => fetcher(`/webhooks/${showLogs}/logs`),
    enabled: !!showLogs,
  });
  const logs: WebhookLogEntry[] = logsData?.logs || [];

  // Shared narrowing for mutation error / response payloads — replaces the
  // previous scattered `(e: any)` / `(data: any)` casts.
  const errMsg = (e: unknown) =>
    e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";

  interface CreateWebhookBody {
    url: string;
    event: string[];
    description?: string;
    secret?: string;
    isActive?: boolean;
  }

  interface WebhookTestResponse {
    success?: boolean;
    status?: number;
    durationMs?: number;
    error?: string;
  }

  const createMutation = useMutation({
    mutationFn: (body: CreateWebhookBody) =>
      fetcher("/webhooks", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-webhooks"] });
      toast({ title: "Webhook registered" });
      resetForm();
    },
    onError: (e: unknown) =>
      toast({ title: "Failed", description: errMsg(e), variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => fetcher(`/webhooks/${id}/toggle`, { method: "PATCH", body: "{}" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-webhooks"] }); },
    onError: (e: unknown) =>
      toast({ title: "Failed", description: errMsg(e), variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => fetcher(`/webhooks/${id}/test`, { method: "POST", body: "{}" }),
    onSuccess: (data: unknown) => {
      const resp = (data ?? {}) as WebhookTestResponse;
      if (resp.success) {
        toast({ title: "Ping successful", description: `Status: ${resp.status}, ${resp.durationMs}ms` });
      } else {
        toast({ title: "Ping failed", description: resp.error || "No response", variant: "destructive" });
      }
      qc.invalidateQueries({ queryKey: ["admin-webhook-logs"] });
    },
    onError: (e: unknown) =>
      toast({ title: "Failed", description: errMsg(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetcher(`/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-webhooks"] }); toast({ title: "Webhook deleted" }); },
    onError: (e: unknown) =>
      toast({ title: "Failed", description: errMsg(e), variant: "destructive" }),
  });

  function resetForm() {
    setShowCreate(false);
    setUrl("");
    setDescription("");
    setSelectedEvents([]);
  }

  function toggleEvent(event: string) {
    setSelectedEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    );
  }

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
      <div className="space-y-6">
        <PageHeader
          icon={Webhook}
          title="Webhooks"
          subtitle="Register webhook URLs for platform events"
          iconBgClass="bg-orange-100"
          iconColorClass="text-orange-600"
          actions={
            <Button className="rounded-xl gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Register Webhook
            </Button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Total Webhooks</div>
            <div className="text-2xl font-bold">{webhooks.length}</div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold text-green-600">{webhooks.filter(w => w.isActive).length}</div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Inactive</div>
            <div className="text-2xl font-bold text-gray-500">{webhooks.filter(w => !w.isActive).length}</div>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : webhooks.length === 0 ? (
          <Card className="p-8 text-center rounded-2xl">
            <Webhook className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">No webhooks registered yet.</p>
          </Card>
        ) : (
          <>
            {/* Mobile card list */}
            <section className="md:hidden space-y-3" aria-label="Webhooks">
              {webhooks.map(wh => (
                <Card key={wh.id} className="overflow-hidden rounded-2xl">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold truncate">{wh.url}</p>
                        {wh.description && <p className="text-xs text-muted-foreground">{wh.description}</p>}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" aria-label="Open actions menu">
                            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => testMutation.mutate(wh.id)} disabled={testMutation.isPending}>
                            <Send className="w-4 h-4 mr-2" aria-hidden="true" /> Test Ping
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowLogs(wh.id)}>
                            <Eye className="w-4 h-4 mr-2" aria-hidden="true" /> View Logs
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => { if (confirm("Delete this webhook?")) deleteMutation.mutate(wh.id); }}>
                            <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(wh.events as string[]).map(ev => (
                        <Badge key={ev} variant="outline" className="text-[10px]">{ev}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">{new Date(wh.createdAt).toLocaleDateString()}</span>
                      <Switch
                        checked={wh.isActive}
                        onCheckedChange={() => toggleMutation.mutate(wh.id)}
                        aria-label={`${wh.isActive ? "Disable" : "Enable"} webhook`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
            {/* Desktop table */}
            <Card className="hidden md:block rounded-2xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map(wh => (
                    <TableRow key={wh.id}>
                      <TableCell>
                        <div className="font-mono text-sm truncate max-w-[250px]">{wh.url}</div>
                        {wh.description && <div className="text-xs text-muted-foreground">{wh.description}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(wh.events as string[]).map(ev => (
                            <Badge key={ev} variant="outline" className="text-xs">{ev}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch checked={wh.isActive} onCheckedChange={() => toggleMutation.mutate(wh.id)} aria-label={`${wh.isActive ? "Disable" : "Enable"} webhook`} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(wh.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => testMutation.mutate(wh.id)}
                            disabled={testMutation.isPending} aria-label="Test Ping">
                            <Send className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setShowLogs(wh.id)} aria-label="View Logs">
                            <Eye className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" aria-label="Delete webhook"
                            onClick={() => { if (confirm("Delete this webhook?")) deleteMutation.mutate(wh.id); }}>
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </>
        )}

        <Dialog open={showCreate} onOpenChange={v => { if (!v) resetForm(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Register Webhook</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Webhook URL</label>
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/webhook" />
              </div>
              <div>
                <label className="text-sm font-medium">Description (optional)</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this webhook is for" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Events</label>
                <div className="grid grid-cols-1 gap-2">
                  {SUPPORTED_EVENTS.map(event => (
                    <label key={event} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-muted/50">
                      <input type="checkbox" checked={selectedEvents.includes(event)}
                        onChange={() => toggleEvent(event)} className="rounded" />
                      <span className="text-sm font-mono">{event}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button className="w-full" disabled={!url || selectedEvents.length === 0 || createMutation.isPending}
                onClick={() => createMutation.mutate({ url, event: selectedEvents, description })}>
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Register Webhook
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!showLogs} onOpenChange={v => { if (!v) setShowLogs(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Delivery Logs</DialogTitle></DialogHeader>
            {logsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No delivery logs yet.</p>
            ) : (
              <div className="space-y-2">
                {logs.map(log => (
                  <Card key={log.id} className="p-3 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {log.success ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500" />
                        )}
                        <Badge variant="outline" className="font-mono text-xs">{log.event}</Badge>
                        {log.status > 0 && <span className="text-xs text-muted-foreground">HTTP {log.status}</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {log.durationMs}ms &middot; {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.error && <p className="text-xs text-red-500 mt-1">{log.error}</p>}
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
