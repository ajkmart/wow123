import { useState, useEffect, useMemo } from "react";
import { useTransactions } from "@/hooks/use-admin";
import { formatCurrency, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt, TrendingUp, TrendingDown, DollarSign, Search, RefreshCw, User, Download, CalendarDays, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { PageHeader, StatCard, StatCardSkeleton, FilterBar } from "@/components/shared";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { LastUpdated } from "@/components/ui/LastUpdated";

function exportTxnCSV(txns: any[]) {
  const header = "ID,User,Phone,Type,Amount,Description,Date";
  const rows = txns.map((t: any) =>
    [t.id, t.userName || "", t.userPhone || "", t.type, t.amount, (t.description || "").replace(/,/g, ";"), t.createdAt?.slice(0,10) || ""].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `transactions-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function Transactions() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { data, isLoading, refetch, isFetching } = useTransactions();
  const [search, setSearch]     = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  const transactions = data?.transactions || [];
  const filtered = transactions.filter((t: any) => {
    const q = search.toLowerCase();
    const matchSearch =
      (t.description || "").toLowerCase().includes(q) ||
      (t.userName || "").toLowerCase().includes(q) ||
      (t.userPhone || "").includes(q) ||
      t.userId.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q);
    const matchType = typeFilter === "all" || t.type === typeFilter;
    const matchDate = (!dateFrom || new Date(t.createdAt) >= new Date(dateFrom))
                   && (!dateTo   || new Date(t.createdAt) <= new Date(dateTo + "T23:59:59"));
    return matchSearch && matchType && matchDate;
  });

  const filteredCredits = filtered.filter((t: any) => t.type === "credit").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const filteredDebits  = filtered.filter((t: any) => t.type === "debit").reduce((s: number, t: any) => s + Number(t.amount), 0);

  type TxnSortKey = "userName" | "type" | "amount" | "createdAt";
  const [sortKey, setSortKey] = useState<TxnSortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => { if (data) setLastRefreshed(new Date()); }, [data]);

  const handleTxnSort = (key: TxnSortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sortedFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a: any, b: any) => {
      let av: any = a[sortKey], bv: any = b[sortKey];
      if (sortKey === "amount")     { av = Number(av); bv = Number(bv); }
      else if (sortKey === "createdAt") { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      else { av = String(av ?? "").toLowerCase(); bv = String(bv ?? "").toLowerCase(); }
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === "asc" ? 1 : -1);
    });
  }, [filtered, sortKey, sortDir]);

  function TxnSortIcon({ col }: { col: TxnSortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40 inline ml-1" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary inline ml-1" /> : <ArrowDown className="w-3 h-3 text-primary inline ml-1" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Receipt}
        title={T("walletTransactions")}
        subtitle={T("walletTxnSubtitle")}
        iconBgClass="bg-sky-100"
        iconColorClass="text-sky-600"
        actions={
          <div className="flex items-center gap-2">
            <LastUpdated dataUpdatedAt={lastRefreshed?.getTime() ?? 0} />
            <Button variant="outline" size="sm" onClick={() => exportTxnCSV(sortedFiltered)} className="h-9 rounded-xl gap-2">
              <Download className="w-4 h-4" /> {T("csvExport")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="h-9 rounded-xl gap-2">
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> {T("refresh")}
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          [1,2,3].map(i => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <Card className="rounded-2xl border-none bg-gradient-to-br from-primary to-blue-700 text-white shadow-lg">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white/80 text-xs font-medium">{T("totalTransactions")}</p>
                  <p className="text-xl font-bold">{transactions.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-green-200 bg-green-50 shadow-sm">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-green-700/80 text-xs font-medium">{T("totalCredits")}</p>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(data?.totalCredit || 0)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-red-200 bg-red-50 shadow-sm">
              <CardContent className="p-5 flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-red-700/80 text-xs font-medium">{T("totalDebits")}</p>
                  <p className="text-xl font-bold text-red-700">{formatCurrency(data?.totalDebit || 0)}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filter-scoped summary row */}
      {(dateFrom || dateTo || typeFilter !== "all" || search) && (
        <div className="flex items-center gap-4 p-3 bg-sky-50 border border-sky-200 rounded-xl text-sm">
          <span className="font-semibold text-sky-800">Filtered summary:</span>
          <span className="text-sky-700">{filtered.length} txns</span>
          <span className="text-green-700 font-bold">+{formatCurrency(filteredCredits)}</span>
          <span className="text-red-700 font-bold">−{formatCurrency(filteredDebits)}</span>
          <span className="text-sky-700 font-bold">Net: {formatCurrency(filteredCredits - filteredDebits)}</span>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 rounded-2xl border-border/50 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <FilterBar
            search={search}
            onSearch={setSearch}
            placeholder="Search by user name, phone, or description..."
            className="flex-1"
          />
          <div className="flex gap-2">
            {[
              { value: "all", label: T("allTypes") },
              { value: "credit", label: `▲ ${T("creditLabel")}` },
              { value: "debit", label: `▼ ${T("debitLabel")}` }
            ].map(t => (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors border ${
                  typeFilter === t.value
                    ? t.value === "credit" ? "bg-green-600 text-white border-green-600"
                    : t.value === "debit" ? "bg-red-600 text-white border-red-600"
                    : "bg-primary text-white border-primary"
                    : "bg-muted/30 border-border/50 text-muted-foreground hover:border-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 rounded-xl bg-muted/30 text-xs w-32" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-9 rounded-xl bg-muted/30 text-xs w-32" />
          {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs text-primary hover:underline">{T("clearFilter")}</button>}
        </div>
      </Card>

      {/* Mobile card list — shown below md breakpoint */}
      <section className="md:hidden space-y-3" aria-label={T("transactions")}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="rounded-2xl border-border/50 shadow-sm p-4 animate-pulse">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-4 w-28 bg-muted rounded" />
                  <div className="h-3 w-20 bg-muted rounded" />
                </div>
                <div className="h-5 w-14 bg-muted rounded-full" />
              </div>
            </Card>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Receipt className="w-10 h-10 text-muted-foreground/25 mb-3" aria-hidden="true" />
            <p className="font-semibold text-muted-foreground">{T("noTransactions")}</p>
          </div>
        ) : (
          filtered.map((t: any) => (
            <Card key={t.id} className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${t.type === 'credit' ? 'bg-green-100' : 'bg-red-100'}`} aria-hidden="true">
                      {t.type === 'credit'
                        ? <TrendingUp className="w-4 h-4 text-green-600" />
                        : <TrendingDown className="w-4 h-4 text-red-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{t.userName || t.userId?.slice(-6).toUpperCase()}</p>
                      {t.userPhone && <p className="text-xs text-muted-foreground">{t.userPhone}</p>}
                    </div>
                  </div>
                  <p className={`text-base font-extrabold shrink-0 ${t.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge
                      status={t.type}
                      label={t.type === 'credit' ? `▲ ${T("creditLabel")}` : `▼ ${T("debitLabel")}`}
                      size="xs"
                      className="uppercase font-bold shrink-0"
                    />
                    <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formatDate(t.createdAt)}</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* Desktop table — hidden below md breakpoint */}
      <Card className="hidden md:block rounded-2xl border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="min-w-[580px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{T("txnId")}</TableHead>
                <TableHead><button onClick={() => handleTxnSort("userName")} className="flex items-center gap-1 hover:text-foreground">{T("user")}<TxnSortIcon col="userName" /></button></TableHead>
                <TableHead>{T("description")}</TableHead>
                <TableHead><button onClick={() => handleTxnSort("type")} className="flex items-center gap-1 hover:text-foreground">{T("type")}<TxnSortIcon col="type" /></button></TableHead>
                <TableHead className="text-right"><button onClick={() => handleTxnSort("amount")} className="flex items-center gap-1 hover:text-foreground ml-auto">{T("amount")}<TxnSortIcon col="amount" /></button></TableHead>
                <TableHead className="text-right"><button onClick={() => handleTxnSort("createdAt")} className="flex items-center gap-1 hover:text-foreground ml-auto">{T("date")}<TxnSortIcon col="createdAt" /></button></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-40 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-5 w-16 bg-muted animate-pulse rounded-full" /></TableCell>
                    <TableCell className="text-right"><div className="h-4 w-20 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell className="text-right"><div className="h-4 w-24 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : sortedFiltered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">{T("noTransactions")}</TableCell></TableRow>
              ) : (
                sortedFiltered.map((t: any) => (
                  <TableRow key={t.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.id.slice(-8).toUpperCase()}
                    </TableCell>
                    <TableCell>
                      {t.userName ? (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center shrink-0" aria-hidden="true">
                            <User className="w-3.5 h-3.5 text-sky-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{t.userName}</p>
                            <p className="text-xs text-muted-foreground">{t.userPhone}</p>
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">{t.userId.slice(-6).toUpperCase()}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate text-sm">{t.description}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={t.type}
                        label={t.type === 'credit' ? `▲ ${T("creditLabel")}` : `▼ ${T("debitLabel")}`}
                        size="xs"
                        className="uppercase font-bold"
                      />
                    </TableCell>
                    <TableCell className={`text-right font-bold ${t.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                      {t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(t.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
