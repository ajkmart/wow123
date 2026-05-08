import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Home, MapPin, Wallet, Bell, User, MessageCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { usePlatformConfig, getRiderModules } from "../lib/useConfig";
import { useQueueStatus } from "../lib/offline/queueManager";

import type { LucideProps } from "lucide-react";
import type { RiderModules } from "../lib/useConfig";
interface NavItem { href: string; labelKey: TranslationKey; Icon: React.ComponentType<LucideProps>; moduleKey?: keyof RiderModules; }

const navItems: NavItem[] = [
  { href: "/",               labelKey: "home",              Icon: Home    },
  { href: "/active",         labelKey: "active",            Icon: MapPin  },
  { href: "/chat",           labelKey: "chat" as TranslationKey, Icon: MessageCircle },
  { href: "/wallet",         labelKey: "wallet",            Icon: Wallet, moduleKey: "wallet" },
  { href: "/notifications",  labelKey: "alerts",            Icon: Bell    },
  { href: "/profile",        labelKey: "profile",           Icon: User    },
];

export function BottomNav() {
  const [location] = useLocation();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { config } = usePlatformConfig();
  const modules = getRiderModules(config);
  const { pendingCount, syncing } = useQueueStatus();

  const { data: notifData } = useQuery({
    queryKey: ["rider-notifs-count"],
    queryFn: () => api.getNotifications(),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const unread: number = notifData?.unread || 0;

  const { data: activeData } = useQuery({
    queryKey: ["rider-active"],
    queryFn: () => api.getActive(),
    refetchInterval: 8000,
    staleTime: 5000,
  });
  const hasActive = !!(activeData?.order || activeData?.ride);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-200/60 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom, 6px))" }}>
      {pendingCount > 0 && (
        <div className="flex items-center justify-center gap-1.5 bg-amber-500 text-white text-[10px] font-bold py-1 px-3">
          <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
          {syncing
            ? `Syncing ${pendingCount} pending action${pendingCount > 1 ? "s" : ""}…`
            : `${pendingCount} action${pendingCount > 1 ? "s" : ""} queued — will sync when online`}
        </div>
      )}
      <div className="flex max-w-md mx-auto">
        {navItems.filter(item => !item.moduleKey || modules[item.moduleKey] !== false).map(item => {
          const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const { Icon } = item;
          return (
            <Link key={item.href} href={item.href}
              className="flex-1 flex flex-col items-center pt-2 pb-1 gap-0.5 relative android-press min-h-0">
              <div className="relative">
                <span className={`flex items-center justify-center w-11 h-8 rounded-full transition-all duration-200 ${active ? "bg-gray-900/10" : ""}`}>
                  <Icon size={21} strokeWidth={active ? 2.5 : 1.8} className={`transition-colors duration-200 ${active ? "text-gray-900" : "text-gray-400"}`} />
                </span>
                {active && <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-[3px] bg-gray-900 rounded-full"/>}
                {item.href === "/notifications" && unread > 0 && (
                  <span className="absolute -top-1 -right-0.5 bg-red-500 text-white text-[9px] font-extrabold rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
                {item.href === "/active" && hasActive && location !== "/active" && (
                  <span className="absolute -top-1 -right-0.5 flex items-center justify-center">
                    <span className="w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative w-2.5 h-2.5 bg-green-500 rounded-full"></span>
                    </span>
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-semibold leading-none transition-colors duration-200 ${active ? "text-gray-900 font-bold" : "text-gray-400"}`}>{T(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
