import { useState } from "react";
import { PageHeader } from "@/components/shared";
import { Bell, RefreshCw, Filter } from "lucide-react";
import { useAllNotifications } from "@/hooks/use-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";

function fd(d: string | Date) {
  return new Date(d).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function roleColor(role: string) {
  if (role === "vendor") return "bg-orange-100 text-orange-700";
  if (role === "rider")  return "bg-green-100 text-green-700";
  if (role === "admin")  return "bg-purple-100 text-purple-700";
  return "bg-blue-100 text-blue-700";
}

function typeIcon(type: string) {
  if (type === "order")  return "📦";
  if (type === "wallet") return "💰";
  if (type === "ride")   return "🏍️";
  if (type === "system") return "⚙️";
  if (type === "alert")  return "⚠️";
  return "🔔";
}

export default function Notifications() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [roleFilter, setRoleFilter] = useState<string>("");

  const { data: nData, isLoading, refetch } = useAllNotifications(roleFilter || undefined);
  const notifications: any[] = nData?.notifications || [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <PageHeader
        icon={Bell}
        title={T("systemNotifications")}
        subtitle="All platform notifications across users, riders, and vendors"
        iconBgClass="bg-blue-100"
        iconColorClass="text-blue-600"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} className="self-start sm:self-auto">
            <RefreshCw className="w-4 h-4 mr-2" /> {T("refresh")}
          </Button>
        }
      />

      {/* Role Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400"/>
        <span className="text-sm text-gray-500 font-medium">Filter by role:</span>
        {["", "customer", "vendor", "rider"].map(r => (
          <button key={r} onClick={() => setRoleFilter(r)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors ${roleFilter === r ? "bg-primary text-white border-primary" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
            {r === "" ? T("allTypes") : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-2">{notifications.length} records</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse"/>)}</div>
      ) : notifications.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <p className="text-4xl mb-3">🔔</p>
            <p className="font-bold text-gray-700">{T("noNotificationsFound")}</p>
            <p className="text-sm text-gray-400 mt-1">{T("notificationsSubtitle")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-bold text-gray-700">{T("recentNotifications")}</p>
            <span className="text-xs text-gray-400">{notifications.length} records</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {notifications.map((n: any) => (
              <div key={n.id} className="px-4 py-3.5 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl ${n.isRead ? "bg-gray-100" : "bg-blue-50"}`}>
                  {typeIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-800 leading-snug">{n.title}</p>
                    {n.user?.roles?.[0] && (
                      <Badge className={`text-[9px] font-bold ${roleColor(n.user.roles[0])}`} variant="outline">
                        {n.user.roles[0]}
                      </Badge>
                    )}
                    {!n.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"/>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-[10px] text-gray-400">{fd(n.createdAt)}</p>
                    {n.user && <p className="text-[10px] text-gray-400 truncate">{n.user.name} · {n.user.phone}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
