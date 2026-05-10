import { useRef, useState } from "react";
import { adminFetch } from "@/lib/adminFetcher";
import { PageHeader } from "@/components/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Switch } from "@/components/ui/switch";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode as QrCodeIcon, Plus, CheckCircle2, XCircle, Loader2, Copy, Download, ScanLine,
} from "lucide-react";

type QrCode = {
  id: string; code: string; type: string; label: string;
  isActive: boolean; createdBy: string | null; createdAt: string;
  scanCount?: number;
};

function QrPreviewCard({ code }: { code: QrCode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  function downloadPng() {
    const svg = wrapperRef.current?.querySelector("svg");
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, 200, 200);
      const link = document.createElement("a");
      link.download = `qr-${code.code}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(data)));
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div ref={wrapperRef}>
        <QRCodeSVG
          value={code.code}
          size={100}
          className="rounded-lg"
        />
      </div>
      <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={downloadPng}>
        <Download className="w-3 h-3" /> PNG
      </Button>
    </div>
  );
}

function useQrCodes() {
  return useQuery({
    queryKey: ["admin-qr-codes"],
    queryFn: () => adminFetch("/qr-codes"),
    refetchInterval: 30_000,
  });
}

export default function QrCodesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("payment");

  const { data, isLoading, refetch } = useQrCodes();
  const codes: QrCode[] = data?.codes || [];

  const createMutation = useMutation({
    mutationFn: (body: { label: string; type: string }) =>
      adminFetch("/qr-codes", { method: "POST", body: JSON.stringify(body) }) as Promise<{ qrCode?: { code?: string } }>,
    onSuccess: (data: { qrCode?: { code?: string } }) => {
      qc.invalidateQueries({ queryKey: ["admin-qr-codes"] });
      toast({ title: "QR Code generated", description: `Code: ${data?.qrCode?.code || "created"}` });
      setShowCreate(false);
      setLabel("");
      setType("payment");
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, activate }: { id: string; activate: boolean }) =>
      adminFetch(`/qr-codes/${id}/${activate ? "activate" : "deactivate"}`, { method: "PATCH", body: "{}" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-qr-codes"] }); toast({ title: "QR Code updated" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
      .then(() => toast({ title: "Code copied" }))
      .catch(() => toast({ title: "Copy failed", description: "Allow clipboard access and try again.", variant: "destructive" }));
  };

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
      <div className="space-y-6">
        <PageHeader
          icon={QrCodeIcon}
          title="QR Code Management"
          subtitle="Generate, view, and manage payment & promo QR codes"
          iconBgClass="bg-indigo-100"
          iconColorClass="text-indigo-600"
          actions={
            <Button className="rounded-xl gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Generate QR
            </Button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center"><QrCodeIcon className="w-5 h-5 text-indigo-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Codes</p>
                <p className="text-xl font-bold">{codes.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{codes.filter(c => c.isActive).length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><XCircle className="w-5 h-5 text-red-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Deactivated</p>
                <p className="text-xl font-bold">{codes.filter(c => !c.isActive).length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Mobile card list */}
        <section className="md:hidden space-y-3" aria-label="QR codes">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="rounded-2xl border p-4 animate-pulse">
                <div className="h-4 w-32 bg-muted rounded mb-2" /><div className="h-3 w-20 bg-muted rounded" />
              </Card>
            ))
          ) : codes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <QrCodeIcon className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" /><p>No QR codes yet</p>
            </div>
          ) : codes.map(c => (
            <Card key={c.id} className="rounded-2xl border overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <QrPreviewCard code={c} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{c.label}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{c.code}</code>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyCode(c.code)} aria-label="Copy code">
                        <Copy className="w-3 h-3" aria-hidden="true" />
                      </Button>
                    </div>
                    {c.scanCount !== undefined && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <ScanLine className="w-3 h-3" />
                        <span>{c.scanCount} scan{c.scanCount !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </div>
                  <Switch
                    checked={c.isActive}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: c.id, activate: checked })}
                    aria-label={`${c.isActive ? "Deactivate" : "Activate"} ${c.label}`}
                  />
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                  <Badge variant="secondary" className="text-xs capitalize">{c.type}</Badge>
                  <Badge variant="outline" className={c.isActive ? "text-green-600 border-green-200 bg-green-50" : "text-red-600 border-red-200 bg-red-50"}>
                    {c.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Desktop table */}
        <Card className="hidden md:block overflow-hidden rounded-2xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : codes.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground"><QrCodeIcon className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No QR codes yet</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>QR Image</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Scans</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map(c => (
                    <TableRow key={c.id} className="hover:bg-muted/30">
                      <TableCell className="w-24">
                        <QrPreviewCard code={c} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">{c.code}</code>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyCode(c.code)} aria-label={`Copy code ${c.code}`}>
                            <Copy className="w-3 h-3" aria-hidden="true" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-sm font-medium">{c.label}</span></TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs capitalize">{c.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <ScanLine className="w-3.5 h-3.5" />
                          <span>{c.scanCount ?? 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={c.isActive ? "text-green-600 border-green-200 bg-green-50" : "text-red-600 border-red-200 bg-red-50"}>
                          {c.isActive ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                          {c.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell><span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Switch
                            checked={c.isActive}
                            onCheckedChange={(checked) => toggleMutation.mutate({ id: c.id, activate: checked })}
                            aria-label={`${c.isActive ? "Deactivate" : "Activate"} ${c.label}`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><QrCodeIcon className="w-5 h-5 text-indigo-600" /> Generate QR Code</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Label</label>
                <Input placeholder="e.g. Summer Promo 2026" value={label} onChange={e => setLabel(e.target.value)} className="rounded-xl" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Type</label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payment">Payment</SelectItem>
                    <SelectItem value="promo">Promo</SelectItem>
                    <SelectItem value="referral">Referral</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button
                  className="flex-1 rounded-xl gap-2"
                  onClick={() => createMutation.mutate({ label, type })}
                  disabled={!label.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Generate
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PullToRefresh>
  );
}
