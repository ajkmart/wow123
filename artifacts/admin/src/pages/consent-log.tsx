import { useState } from "react";
import { adminFetch } from "@/lib/adminFetcher";
import { FileText, Download, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import type {
  ConsentLogEntry,
  TermsVersionRow,
  ApiPaginated,
} from "@/lib/adminApiTypes";

function exportCsv(entries: ConsentLogEntry[], filename = "consent-log.csv") {
  const headers = ["User ID", "Policy", "Version", "Accepted At", "Source", "IP Address"];
  const rows = entries.map(e => [
    e.userId ?? "",
    e.policy ?? "",
    e.version ?? "",
    new Date(e.acceptedAt).toISOString(),
    e.source ?? "",
    e.ipAddress ?? "",
  ]);
  const csvContent = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ConsentLogPage() {
  const [policyFilter, setPolicyFilter] = useState("");
  const [versionFilter, setVersionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportLoading, setExportLoading] = useState(false);

  const versions = useQuery<ApiPaginated<TermsVersionRow>>({
    queryKey: ["legal", "terms-versions"],
    queryFn: () => adminFetch("/legal/terms-versions") as Promise<ApiPaginated<TermsVersionRow>>,
    retry: false,
  });

  function buildQs(limit = 50, offset = 0) {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));
    if (policyFilter) qs.set("policy", policyFilter);
    if (versionFilter && versionFilter !== "all") qs.set("version", versionFilter);
    if (dateFrom) qs.set("dateFrom", dateFrom);
    if (dateTo) qs.set("dateTo", dateTo);
    return qs.toString();
  }

  const log = useQuery<ApiPaginated<ConsentLogEntry>>({
    queryKey: ["legal", "consent-log", policyFilter, versionFilter, dateFrom, dateTo],
    queryFn: () => adminFetch(`/legal/consent-log?${buildQs()}`) as Promise<ApiPaginated<ConsentLogEntry>>,
    retry: false,
  });

  const uniquePolicies = Array.from(new Set((versions.data?.items ?? []).map(v => v.policy)));
  const policyVersions = (versions.data?.items ?? []).filter(v => !policyFilter || v.policy === policyFilter);

  async function handleExport() {
    setExportLoading(true);
    try {
      const all = await adminFetch(`/legal/consent-log?${buildQs(9999, 0)}`) as ApiPaginated<ConsentLogEntry>;
      exportCsv(all.items ?? [], `consent-log-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      /* silently fail */
    } finally {
      setExportLoading(false);
    }
  }

  const hasFilters = !!policyFilter || (!!versionFilter && versionFilter !== "all") || !!dateFrom || !!dateTo;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        icon={FileText}
        title="Consent & Terms Versions"
        subtitle="GDPR / privacy audit trail. Bumping a version forces every user to re-accept on next app launch."
        iconBgClass="bg-blue-100"
        iconColorClass="text-blue-600"
      />

      <Card className="p-5">
        <h2 className="font-semibold mb-3">Current Terms Versions</h2>
        {versions.isLoading && <LoadingState label="Loading versions…" variant="card" />}
        {versions.isError && (
          <ErrorState
            title="Could not load terms versions"
            error={versions.error as Error}
            onRetry={() => versions.refetch()}
            variant="inline"
          />
        )}
        {versions.data && (
          <div className="space-y-2">
            {versions.data?.items?.length === 0 && (
              <p className="text-sm text-gray-500">No terms versions recorded yet.</p>
            )}
            {versions.data?.items?.map(v => (
              <div
                key={`${v.policy}:${v.version}`}
                className="flex items-center justify-between p-3 rounded-lg border bg-white"
              >
                <div>
                  <div className="font-medium text-sm">{v.policy}</div>
                  <div className="text-xs text-gray-500">
                    v{v.version} · effective {new Date(v.effectiveAt).toLocaleDateString()}
                  </div>
                </div>
                {v.isCurrent && <Badge variant="default">Current</Badge>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-semibold">Consent Log</h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExport}
            disabled={exportLoading}
          >
            <Download className="w-3.5 h-3.5" />
            {exportLoading ? "Exporting…" : "Export CSV"}
          </Button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 mb-4 p-3 bg-muted/40 rounded-xl border">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Filters:</span>
          </div>
          <Select value={policyFilter} onValueChange={v => { setPolicyFilter(v === "all" ? "" : v); setVersionFilter(""); }}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All policies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All policies</SelectItem>
              {uniquePolicies.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={versionFilter} onValueChange={setVersionFilter} disabled={policyVersions.length === 0}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All versions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All versions</SelectItem>
              {policyVersions.map(v => <SelectItem key={v.version} value={v.version}>v{v.version}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 w-36 text-xs"
            placeholder="From"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 w-36 text-xs"
            placeholder="To"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setPolicyFilter(""); setVersionFilter(""); setDateFrom(""); setDateTo(""); }}>
              Clear
            </Button>
          )}
        </div>

        {log.isLoading && <LoadingState label="Loading consent log…" variant="card" />}
        {log.isError && (
          <ErrorState
            title="Could not load consent log"
            error={log.error as Error}
            onRetry={() => log.refetch()}
            variant="inline"
          />
        )}
        {log.data && (
          <>
            <p className="text-xs text-muted-foreground mb-3">{log.data.total ?? log.data.items.length} record{(log.data.total ?? log.data.items.length) !== 1 ? "s" : ""} found</p>
            {/* Mobile card list */}
            <section className="md:hidden space-y-2 mb-2" aria-label="Consent log">
              {log.data.items.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No consent events recorded yet.</p>
              ) : log.data.items.map(entry => (
                <div key={entry.id} className="rounded-xl border border-border/50 p-3 text-xs space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-medium truncate">{entry.userId}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{new Date(entry.acceptedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{entry.policy}</span>
                    <span className="text-muted-foreground">v{entry.version}</span>
                    {entry.source && <span className="text-muted-foreground">· {entry.source}</span>}
                  </div>
                  {entry.ipAddress && <span className="font-mono text-muted-foreground">{entry.ipAddress}</span>}
                </div>
              ))}
            </section>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500 border-b">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Policy</th>
                    <th className="py-2 pr-3">Version</th>
                    <th className="py-2 pr-3">Accepted</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {log.data.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-gray-500">No consent events recorded yet.</td>
                    </tr>
                  )}
                  {log.data.items.map(entry => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{entry.userId}</td>
                      <td className="py-2 pr-3">{entry.policy}</td>
                      <td className="py-2 pr-3">{entry.version}</td>
                      <td className="py-2 pr-3 text-xs">{new Date(entry.acceptedAt).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-xs">{entry.source ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{entry.ipAddress ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
