import { useState, useRef } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PullToRefresh } from "@/components/PullToRefresh";
import {
  Link2, Plus, Loader2, Trash2, Copy, MousePointerClick, MoreHorizontal, ExternalLink, QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const TARGET_SCREENS = [
  { value: "product", label: "Product Page", paramHint: "productId" },
  { value: "vendor", label: "Vendor Store", paramHint: "vendorId" },
  { value: "category", label: "Category", paramHint: "categoryId" },
  { value: "promo", label: "Promo / Deal", paramHint: "promoCode" },
  { value: "ride", label: "Ride Booking", paramHint: "pickup" },
  { value: "food", label: "Food Section", paramHint: "" },
  { value: "mart", label: "Mart Section", paramHint: "" },
  { value: "pharmacy", label: "Pharmacy", paramHint: "" },
  { value: "parcel", label: "Parcel", paramHint: "" },
  { value: "van", label: "Van Service", paramHint: "" },
];

type DeepLink = {
  id: string; shortCode: string; targetScreen: string;
  params: Record<string, string>; label: string;
  clickCount: number; createdAt: string;
};

function QrPopover({ url }: { url: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Show QR code">
          <QrCode className="w-4 h-4" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4 flex flex-col items-center gap-2" side="left">
        <QRCodeSVG value={url} size={140} />
        <p className="text-xs text-muted-foreground text-center max-w-[140px] break-all">{url}</p>
      </PopoverContent>
    </Popover>
  );
}

export default function DeepLinksPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [targetScreen, setTargetScreen] = useState("");
  const [label, setLabel] = useState("");
  const [paramKey, setParamKey] = useState("");
  const [paramValue, setParamValue] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-deep-links"],
    queryFn: () => adminFetch("/deep-links"),
    refetchInterval: 30_000,
  });
  const links: DeepLink[] = data?.links || [];

  const createMutation = useMutation({
    mutationFn: (body: any) => adminFetch("/deep-links", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-deep-links"] });
      toast({ title: "Deep link created" });
      resetForm();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/deep-links/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-deep-links"] }); toast({ title: "Link deleted" }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  function resetForm() {
    setShowCreate(false);
    setTargetScreen("");
    setLabel("");
    setParamKey("");
    setParamValue("");
    setParams({});
  }

  function addParam() {
    if (paramKey.trim() && paramValue.trim()) {
      setParams({ ...params, [paramKey.trim()]: paramValue.trim() });
      setParamKey("");
      setParamValue("");
    }
  }

  function removeParam(key: string) {
    const next = { ...params };
    delete next[key];
    setParams(next);
  }

  function getFullUrl(shortCode: string) {
    return `${window.location.origin}/api/dl/${shortCode}`;
  }

  function copyLink(shortCode: string) {
    navigator.clipboard.writeText(getFullUrl(shortCode))
      .then(() => toast({ title: "Link copied to clipboard" }))
      .catch(() => toast({ title: "Copy failed", description: "Allow clipboard access and try again.", variant: "destructive" }));
  }

  function testLink(shortCode: string) {
    window.open(getFullUrl(shortCode), "_blank", "noopener,noreferrer");
  }

  const selectedTarget = TARGET_SCREENS.find(t => t.value === targetScreen);
  const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
      <div className="space-y-6">
        <PageHeader
          icon={Link2}
          title="Deep Links"
          subtitle="Create marketing deep links to specific app screens"
          iconBgClass="bg-blue-100"
          iconColorClass="text-blue-600"
          actions={
            <Button className="rounded-xl gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Create Deep Link
            </Button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Total Links</div>
            <div className="text-2xl font-bold">{links.length}</div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Total Clicks</div>
            <div className="text-2xl font-bold text-blue-600">{totalClicks}</div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="text-sm text-muted-foreground">Avg Clicks / Link</div>
            <div className="text-2xl font-bold text-purple-600">
              {links.length > 0 ? (totalClicks / links.length).toFixed(1) : "0"}
            </div>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : links.length === 0 ? (
          <Card className="p-8 text-center rounded-2xl">
            <Link2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">No deep links created yet.</p>
          </Card>
        ) : (
          <>
            {/* Mobile card list */}
            <section className="md:hidden space-y-3" aria-label="Deep links">
              {links.map(link => (
                <Card key={link.id} className="rounded-2xl overflow-hidden">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{link.label || link.shortCode}</p>
                        <p className="text-xs font-mono text-muted-foreground truncate">{getFullUrl(link.shortCode)}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" aria-label="Open actions menu">
                            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => copyLink(link.shortCode)}>
                            <Copy className="w-4 h-4 mr-2" aria-hidden="true" /> Copy Link
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => testLink(link.shortCode)}>
                            <ExternalLink className="w-4 h-4 mr-2" aria-hidden="true" /> Test Link
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600 focus:text-red-600"
                            onClick={() => { if (confirm("Delete this deep link?")) deleteMutation.mutate(link.id); }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{link.targetScreen}</Badge>
                      <div className="flex items-center gap-1 text-sm">
                        <MousePointerClick className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                        <span className="font-medium">{link.clickCount}</span>
                      </div>
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(link.createdAt).toLocaleDateString()}</span>
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
                    <TableHead>Label / Code</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Params</TableHead>
                    <TableHead>Clicks</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map(link => (
                    <TableRow key={link.id}>
                      <TableCell>
                        <div className="font-medium">{link.label || link.shortCode}</div>
                        <div className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{getFullUrl(link.shortCode)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{link.targetScreen}</Badge>
                      </TableCell>
                      <TableCell>
                        {Object.keys(link.params as Record<string, string>).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(link.params as Record<string, string>).map(([k, v]) => (
                              <Badge key={k} variant="secondary" className="text-xs">{k}={v}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">none</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <MousePointerClick className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                          <span className="font-medium">{link.clickCount}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(link.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => copyLink(link.shortCode)} aria-label="Copy link">
                            <Copy className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => testLink(link.shortCode)} aria-label="Test link">
                            <ExternalLink className="w-4 h-4" aria-hidden="true" />
                          </Button>
                          <QrPopover url={getFullUrl(link.shortCode)} />
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                            onClick={() => { if (confirm("Delete this deep link?")) deleteMutation.mutate(link.id); }}
                            aria-label="Delete link">
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
            <DialogHeader><DialogTitle>Create Deep Link</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Label (optional)</label>
                <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Summer Sale Campaign" />
              </div>
              <div>
                <label className="text-sm font-medium">Target Screen</label>
                <Select value={targetScreen} onValueChange={setTargetScreen}>
                  <SelectTrigger><SelectValue placeholder="Select screen" /></SelectTrigger>
                  <SelectContent>
                    {TARGET_SCREENS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Parameters</label>
                {selectedTarget?.paramHint && (
                  <p className="text-xs text-muted-foreground mb-1">Hint: use "{selectedTarget.paramHint}" as key</p>
                )}
                {Object.entries(params).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary">{k} = {v}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeParam(k)}>
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-1">
                  <Input value={paramKey} onChange={e => setParamKey(e.target.value)} placeholder="Key" className="flex-1" />
                  <Input value={paramValue} onChange={e => setParamValue(e.target.value)} placeholder="Value" className="flex-1" />
                  <Button variant="outline" size="sm" onClick={addParam} disabled={!paramKey.trim() || !paramValue.trim()}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <Button className="w-full" disabled={!targetScreen || createMutation.isPending}
                onClick={() => createMutation.mutate({ targetScreen, params, label })}>
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Generate Deep Link
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
