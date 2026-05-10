import { useState } from "react";
import { adminFetch } from "@/lib/adminFetcher";
import { PageHeader } from "@/components/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SensitiveActionDialog } from "@/components/SensitiveActionDialog";
import { NavigationGuard } from "@/components/NavigationGuard";
import {
  FlaskConical, Plus, Loader2, Trash2, BarChart3, Play, Pause, CheckCircle2, MoreHorizontal,
  AlertTriangle,
} from "lucide-react";

type Variant = { name: string; weight: number };
type Experiment = {
  id: string; name: string; description: string; status: string;
  variants: Variant[]; trafficPct: number; createdAt: string;
};
type ResultRow = { variant: string; total: number; converted: number };

export default function ExperimentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showResults, setShowResults] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trafficPct, setTrafficPct] = useState(100);
  const [variants, setVariants] = useState<Variant[]>([
    { name: "control", weight: 50 },
    { name: "variant_b", weight: 50 },
  ]);

  const isDirty = showCreate && (!!name || description !== "" || variants.some(v => v.weight !== 50));

  const totalWeight = variants.reduce((sum, v) => sum + (Number(v.weight) || 0), 0);
  const weightError = totalWeight !== 100 ? `Variant weights must sum to 100% (currently ${totalWeight}%)` : null;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-experiments"],
    queryFn: () => adminFetch("/experiments"),
    refetchInterval: 30_000,
  });
  const experiments: Experiment[] = data?.experiments || [];

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ["admin-experiment-results", showResults],
    queryFn: () => adminFetch(`/experiments/${showResults}/results`),
    enabled: !!showResults,
  });
  const results: ResultRow[] = resultsData?.results || [];

  const createMutation = useMutation({
    mutationFn: (body: any) => adminFetch("/experiments", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-experiments"] });
      toast({ title: "Experiment created" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/experiments/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-experiments"] }); toast({ title: "Status updated" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/experiments/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-experiments"] }); toast({ title: "Experiment deleted" }); setDeletingId(null); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setShowCreate(false);
    setName("");
    setDescription("");
    setTrafficPct(100);
    setVariants([{ name: "control", weight: 50 }, { name: "variant_b", weight: 50 }]);
  }

  const addVariant = () => setVariants([...variants, { name: `variant_${String.fromCharCode(97 + variants.length)}`, weight: 0 }]);
  const removeVariant = (i: number) => { if (variants.length > 2) setVariants(variants.filter((_, idx) => idx !== i)); };

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    paused: "bg-yellow-100 text-yellow-800",
    completed: "bg-blue-100 text-blue-800",
    draft: "bg-gray-100 text-gray-600",
  };

  const handleCreate = () => {
    if (weightError) {
      toast({ title: "Invalid weights", description: weightError, variant: "destructive" });
      return;
    }
    createMutation.mutate({ name, description, variants, trafficPct });
  };

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
      <NavigationGuard isDirty={isDirty} />
      <div className="space-y-6">
        <PageHeader
          icon={FlaskConical}
          title="A/B Experiments"
          subtitle="Create and manage A/B testing experiments"
          iconBgClass="bg-purple-100"
          iconColorClass="text-purple-600"
          actions={
            <Button className="rounded-xl gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> New Experiment
            </Button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Total Experiments</div>
            <div className="text-2xl font-bold">{experiments.length}</div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold text-green-600">{experiments.filter(e => e.status === "active").length}</div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Completed</div>
            <div className="text-2xl font-bold text-blue-600">{experiments.filter(e => e.status === "completed").length}</div>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : experiments.length === 0 ? (
          <Card className="p-8 text-center rounded-2xl">
            <FlaskConical className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">No experiments yet. Create one to start testing.</p>
          </Card>
        ) : (
          <>
            {/* Mobile card list */}
            <section className="md:hidden space-y-3" aria-label="A/B experiments">
              {experiments.map(exp => (
                <Card key={exp.id} className="rounded-2xl overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{exp.name}</p>
                        {exp.description && <p className="text-xs text-muted-foreground">{exp.description}</p>}
                      </div>
                      <Badge className={`${statusColor[exp.status] || "bg-gray-100"} shrink-0 text-[10px]`}>{exp.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span><span className="font-semibold text-foreground">{exp.trafficPct}%</span> traffic</span>
                      <span className="text-border">·</span>
                      <span>{(exp.variants as Variant[]).map(v => v.name).join(", ")}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">{new Date(exp.createdAt).toLocaleDateString()}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="Open actions menu">
                            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setShowResults(exp.id)}>
                            <BarChart3 className="w-4 h-4 mr-2" aria-hidden="true" /> View Results
                          </DropdownMenuItem>
                          {exp.status === "active" && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: exp.id, status: "paused" })}>
                              <Pause className="w-4 h-4 mr-2" aria-hidden="true" /> Pause
                            </DropdownMenuItem>
                          )}
                          {exp.status === "paused" && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: exp.id, status: "active" })}>
                              <Play className="w-4 h-4 mr-2" aria-hidden="true" /> Resume
                            </DropdownMenuItem>
                          )}
                          {(exp.status === "active" || exp.status === "paused") && (
                            <DropdownMenuItem onClick={() => statusMutation.mutate({ id: exp.id, status: "completed" })}>
                              <CheckCircle2 className="w-4 h-4 mr-2" aria-hidden="true" /> Mark Complete
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => setDeletingId(exp.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Variants</TableHead>
                    <TableHead>Traffic %</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {experiments.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell>
                        <div className="font-medium">{exp.name}</div>
                        {exp.description && <div className="text-xs text-muted-foreground">{exp.description}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColor[exp.status] || "bg-gray-100"}>{exp.status}</Badge>
                      </TableCell>
                      <TableCell>{(exp.variants as Variant[]).map(v => v.name).join(", ")}</TableCell>
                      <TableCell>{exp.trafficPct}%</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(exp.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setShowResults(exp.id)} aria-label="View results">
                            <BarChart3 className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          {exp.status === "active" && (
                            <Button variant="ghost" size="sm" onClick={() => statusMutation.mutate({ id: exp.id, status: "paused" })} aria-label="Pause experiment">
                              <Pause className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          )}
                          {exp.status === "paused" && (
                            <Button variant="ghost" size="sm" onClick={() => statusMutation.mutate({ id: exp.id, status: "active" })} aria-label="Resume experiment">
                              <Play className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          )}
                          {(exp.status === "active" || exp.status === "paused") && (
                            <Button variant="ghost" size="sm" onClick={() => statusMutation.mutate({ id: exp.id, status: "completed" })} aria-label="Complete experiment">
                              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                            onClick={() => setDeletingId(exp.id)}
                            aria-label="Delete experiment">
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
            <DialogHeader><DialogTitle>Create Experiment</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Button Color Test" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What are you testing?" />
              </div>
              <div>
                <label className="text-sm font-medium">Traffic Split (%)</label>
                <Input type="number" min={1} max={100} value={trafficPct} onChange={e => setTrafficPct(Number(e.target.value))} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Variants</label>
                  <span className={`text-xs font-semibold ${totalWeight === 100 ? "text-green-600" : "text-amber-600"}`}>
                    Total: {totalWeight}% {totalWeight === 100 ? "✓" : "(must be 100%)"}
                  </span>
                </div>
                {weightError && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {weightError}
                  </div>
                )}
                <div className="space-y-2 mt-1">
                  {variants.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input value={v.name} onChange={e => {
                        const updated = [...variants];
                        updated[i] = { ...updated[i]!, name: e.target.value };
                        setVariants(updated);
                      }} placeholder="Variant name" className="flex-1" />
                      <Input type="number" value={v.weight} min={0} max={100} onChange={e => {
                        const updated = [...variants];
                        updated[i] = { ...updated[i]!, weight: Number(e.target.value) };
                        setVariants(updated);
                      }} placeholder="Weight %" className="w-20" />
                      {variants.length > 2 && (
                        <Button variant="ghost" size="sm" onClick={() => removeVariant(i)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2" onClick={addVariant}>
                  <Plus className="w-3 h-3 mr-1" /> Add Variant
                </Button>
              </div>
              <Button className="w-full" disabled={!name || variants.length < 2 || createMutation.isPending || !!weightError}
                onClick={handleCreate}>
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Experiment
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!showResults} onOpenChange={v => { if (!v) setShowResults(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Experiment Results</DialogTitle></DialogHeader>
            {resultsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : results.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No assignments yet for this experiment.</p>
            ) : (
              <div className="space-y-4">
                {results.map(r => {
                  const convRate = r.total > 0 ? ((r.converted / r.total) * 100).toFixed(1) : "0.0";
                  return (
                    <Card key={r.variant} className="p-4 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">{r.variant}</span>
                        <Badge variant="outline">{convRate}% conversion</Badge>
                      </div>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>Assigned: {r.total}</span>
                        <span>Converted: {r.converted}</span>
                      </div>
                      <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full transition-all"
                          style={{ width: `${Math.min(parseFloat(convRate), 100)}%` }} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <SensitiveActionDialog
          open={!!deletingId}
          title="Delete Experiment"
          description="This experiment and all its assignment data will be permanently deleted. This action cannot be undone."
          confirmLabel="Delete Experiment"
          actionType="experiment_delete"
          targetId={deletingId ?? undefined}
          onConfirm={() => { if (deletingId) deleteMutation.mutate(deletingId); }}
          onClose={() => setDeletingId(null)}
        />
      </div>
    </PullToRefresh>
  );
}
