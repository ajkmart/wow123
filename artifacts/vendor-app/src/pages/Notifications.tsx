import { useRef, useCallback, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PageHeader } from "../components/PageHeader";
import { fd, CARD, CARD_HEADER, errMsg } from "../lib/ui";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  icon?: string;
  isRead?: boolean;
  createdAt: string;
}

function typeIcon(type: string) {
  if (type === "order")  return "📦";
  if (type === "wallet") return "💰";
  if (type === "promo")  return "🎟️";
  if (type === "system") return "⚙️";
  if (type === "alert")  return "⚠️";
  return "🔔";
}

export default function Notifications() {
  const qc = useQueryClient();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vendor-notifications"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 30000,
  });

  const notifs: Notification[] = data?.notifications || [];
  const unread: number = data?.unread || 0;

  const pullY = useRef(0);
  const pulling = useRef(false);
  const startY = useRef(0);
  const pullIndicatorRef = useRef<HTMLDivElement>(null);

  const getMainScroll = () => document.getElementById("main-scroll");

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const mainScroll = getMainScroll();
    const scrollTop = mainScroll ? mainScroll.scrollTop : 0;
    pullY.current = 0;
    pulling.current = false;
    if (scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return;
    const diff = Math.max(0, Math.min(80, e.touches[0].clientY - startY.current));
    pullY.current = diff;
    if (pullIndicatorRef.current) {
      pullIndicatorRef.current.style.opacity = String(diff / 60);
      pullIndicatorRef.current.style.display = diff > 0 ? "flex" : "none";
      if (diff > 50) pullIndicatorRef.current.classList.add("animate-spin");
      else pullIndicatorRef.current.classList.remove("animate-spin");
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullY.current > 50) refetch();
    pullY.current = 0;
    pulling.current = false;
    if (pullIndicatorRef.current) {
      pullIndicatorRef.current.style.opacity = "0";
      pullIndicatorRef.current.style.display = "none";
    }
  }, [refetch]);

  const markAllMut = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-notifications"] });
      qc.invalidateQueries({ queryKey: ["vendor-notifs-count"] });
      qc.invalidateQueries({ queryKey: ["vendor-me"] });
    },
    onError: () => { refetch(); },
  });

  const [pendingNotifIds, setPendingNotifIds] = useState<Set<string>>(new Set());

  const markOneMut = useMutation({
    mutationFn: (id: string) => {
      setPendingNotifIds(s => new Set(s).add(id));
      return api.markNotificationRead(id);
    },
    onSettled: (_d, _e, id) => {
      setPendingNotifIds(s => { const n = new Set(s); n.delete(id); return n; });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-notifications"] });
      qc.invalidateQueries({ queryKey: ["vendor-notifs-count"] });
    },
  });

  return (
    <div className="bg-gray-50 md:bg-transparent">
      <PageHeader
        title={T("notifications")}
        subtitle={unread > 0 ? `${unread} ${T("unread")}` : T("allCaughtUp")}
        actions={
          <div className="flex gap-2">
            <button onClick={() => refetch()}
              className="h-9 px-3 bg-white/20 md:bg-gray-100 md:text-gray-700 text-white text-sm font-bold rounded-xl android-press min-h-0">
              ↻
            </button>
            {unread > 0 && (
              <button onClick={() => markAllMut.mutate()} disabled={markAllMut.isPending}
                className="h-9 px-4 bg-white/20 md:bg-orange-50 md:text-orange-600 text-white text-sm font-bold rounded-xl android-press min-h-0">
                ✓ {T("markAllRead")}
              </button>
            )}
          </div>
        }
      />

      <div className="px-4 py-4 md:px-0 md:py-4"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div ref={pullIndicatorRef} className="hidden justify-center py-2 mb-2" style={{ opacity: 0 }}>
          <div className="w-6 h-6 border-2 border-orange-400 border-t-transparent rounded-full" />
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 skeleton rounded-2xl"/>)}
          </div>
        ) : notifs.length === 0 ? (
          <div className={`${CARD} px-4 py-20 text-center`}>
            <p className="text-5xl mb-4">🔔</p>
            <p className="font-bold text-gray-700 text-base">{T("noNotificationsYet")}</p>
            <p className="text-sm text-gray-400 mt-1">{T("noNotificationsDesc")}</p>
          </div>
        ) : (
          <div className={CARD}>
            <div className={`${CARD_HEADER} bg-gray-50`}>
              <p className="text-sm font-bold text-gray-700">{notifs.length} notifications</p>
              {unread > 0 && <span className="text-xs font-bold bg-red-100 text-red-600 px-2.5 py-1 rounded-full">{unread} unread</span>}
            </div>
            <div className="divide-y divide-gray-50">
              {notifs.map((n) => (
                <button
                  key={n.id}
                  className={`w-full px-4 py-4 flex gap-3 transition-colors text-left android-press min-h-0 ${!n.isRead ? "bg-orange-50/40 hover:bg-orange-50/80" : "hover:bg-gray-50"}`}
                  onClick={() => { if (!n.isRead && !pendingNotifIds.has(n.id)) markOneMut.mutate(n.id); }}
                >
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl ${!n.isRead ? "bg-orange-100" : "bg-gray-100"}`}>
                    {typeIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-bold leading-snug ${!n.isRead ? "text-gray-900" : "text-gray-700"}`}>{n.title}</p>
                      {!n.isRead && <div className="w-2 h-2 bg-orange-500 rounded-full flex-shrink-0 mt-1.5"/>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                    <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{fd(n.createdAt)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
