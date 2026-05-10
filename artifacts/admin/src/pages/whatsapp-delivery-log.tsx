import { useState, useCallback } from "react";
import { adminAbsoluteFetch } from "@/lib/adminFetcher";
import { PageHeader } from "@/components/shared";
import { MessageCircle, RefreshCw, Filter, CheckCheck, Check, Eye, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";

const LIMIT = 50;

function fd(d: string | Date) {
  return new Date(d).toLocaleString("en-PK", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusConfig(s: string): { label: string; icon: React.ElementType; cls: string } {
  switch (s) {
    case "sent":      return { label: "Sent",      icon: Check,      cls: "bg-blue-100 text-blue-700 border-blue-200" };
    case "delivered": return { label: "Delivered", icon: CheckCheck, cls: "bg-green-100 text-green-700 border-green-200" };
    case "read":      return { label: "Read",      icon: Eye,        cls: "bg-purple-100 text-purple-700 border-purple-200" };
    case "failed":    return { label: "Failed",    icon: XCircle,    cls: "bg-red-100 text-red-700 border-red-200" };
    default:          return { label: s,           icon: AlertTriangle, cls: "bg-gray-100 text-gray-600 border-gray-200" };
  }
}

const STATUS_FILTERS = ["", "sent", "delivered", "read", "failed"];

export default function WhatsAppDeliveryLog() {
  const [statusFilter, setStatusFilter] = useState("");
  const [phoneFilter,  setPhoneFilter]  = useState("");
  const [phoneInput,   setPhoneInput]   = useState("");
  const [page, setPage] = useState(1);
  const [allLogs, setAllLogs] = useState<any[]>([]);

  const qs = new URLSearchParams();
  if (statusFilter) qs.set("status", statusFilter);
  if (phoneFilter)  qs.set("phone",  phoneFilter);
  qs.set("limit",  String(LIMIT));
  qs.set("offset", String((page - 1) * LIMIT));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-wa-delivery-log", statusFilter, phoneFilter, page],
    queryFn: async () => {
      const result = await adminAbsoluteFetch(`/api/webhooks/whatsapp/delivery-log?${qs.toString()}`);
      return result;
    },
    refetchInterval: 30_000,
  });

  const logs: any[] = data?.logs ?? [];
  const total: number = data?.total ?? 0;
  const hasMore = page * LIMIT < total;

  const displayedLogs = page === 1 ? logs : [...allLogs, ...logs];

  const handlePhoneSearch = () => { setPhoneFilter(phoneInput.trim()); setPage(1); setAllLogs([]); };
  const handlePhoneClear  = () => { setPhoneFilter(""); setPhoneInput(""); setPage(1); setAllLogs([]); };
  const handleStatusChange = (s: string) => { setStatusFilter(s); setPage(1); setAllLogs([]); };

  const loadMore = useCallback(() => {
    setAllLogs(prev => [...prev, ...logs]);
    setPage(p => p + 1);
  }, [logs]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        icon={MessageCircle}
        title="WhatsApp Delivery Log"
        subtitle="Real-time delivery status for all outbound WhatsApp messages"
        iconBgClass="bg-green-100"
        iconColorClass="text-green-600"
        actions={
          <Button variant="outline" size="sm" onClick={() => { refetch(); setPage(1); setAllLogs([]); }} className="self-start sm:self-auto">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 flex-shrink-0"/>
          <span className="text-sm text-gray-500 font-medium">Status:</span>
          {STATUS_FILTERS.map(s => (
            <button key={s || "all"} onClick={() => handleStatusChange(s)}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors ${
                statusFilter === s
                  ? "bg-primary text-white border-primary"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}>
              {s === "" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Input
            placeholder="Search by phone…"
            value={phoneInput}
            onChange={e => setPhoneInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePhoneSearch()}
            className="h-8 w-44 text-xs"
          />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handlePhoneSearch}>Search</Button>
          {phoneFilter && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-400" onClick={handlePhoneClear}>Clear</Button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400">{total} record{total !== 1 ? "s" : ""} found</p>

      {isLoading && page === 1 ? (
        <div className="space-y-3">{[1,2,3,4].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse"/>
        ))}</div>
      ) : displayedLogs.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-4xl mb-3">💬</p>
            <p className="font-bold text-gray-700">No delivery records found</p>
            <p className="text-sm text-gray-400 mt-1">
              Delivery status events from Meta will appear here once messages are sent.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-0 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">Delivery Records</p>
              <span className="text-xs text-gray-400">{displayedLogs.length} of {total} shown</span>
            </div>
            <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
              {displayedLogs.map((log: any, idx: number) => {
                const sc = statusConfig(log.status);
                const Icon = sc.icon;
                return (
                  <div key={log.id ?? idx} className="px-4 py-3.5 flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${sc.cls}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-800 font-mono">{log.recipient_phone}</p>
                        <Badge variant="outline" className={`text-[10px] font-bold border ${sc.cls}`}>
                          {sc.label}
                        </Badge>
                        {log.fallback_sent && (
                          <Badge variant="outline" className="text-[10px] font-bold bg-amber-50 text-amber-700 border-amber-200">
                            Fallback: {log.fallback_channel ?? "sent"}
                          </Badge>
                        )}
                      </div>
                      {log.wa_message_id && (
                        <p className="text-[11px] text-gray-400 font-mono mt-0.5 truncate">{log.wa_message_id}</p>
                      )}
                      {log.error_message && (
                        <p className="text-xs text-red-500 mt-0.5 leading-snug">
                          Error {log.error_code ? `(${log.error_code})` : ""}: {log.error_message}
                        </p>
                      )}
                      {log.context_type && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Context: {log.context_type}{log.context_id ? ` · ${log.context_id}` : ""}
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">{fd(log.sent_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                className="rounded-xl gap-2"
                onClick={loadMore}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Load More
                <span className="text-xs text-muted-foreground">({total - displayedLogs.length} remaining)</span>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
