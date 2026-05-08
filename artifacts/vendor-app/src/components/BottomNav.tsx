import { Link, useLocation } from "wouter";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";

const navItems: { href: string; labelKey: TranslationKey; icon: string }[] = [
  { href: "/",           labelKey: "dashboard",      icon: "📊" },
  { href: "/orders",     labelKey: "orders",         icon: "📦" },
  { href: "/chat",       labelKey: "chat" as TranslationKey, icon: "💬" },
  { href: "/products",   labelKey: "products",       icon: "🍽️" },
  { href: "/wallet",     labelKey: "wallet",         icon: "💰" },
  { href: "/profile",    labelKey: "account",        icon: "👤" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white"
      style={{
        boxShadow: "0 -1px 0 rgba(0,0,0,0.07), 0 -4px 12px rgba(0,0,0,0.08)",
        paddingBottom: "max(8px, env(safe-area-inset-bottom, 8px))",
      }}
    >
      <div className="flex">
        {navItems.map(item => {
          const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center pt-2 pb-1 gap-0.5 relative android-press min-h-0"
            >
              {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-orange-500 rounded-full" />}
              <span className={`flex items-center justify-center w-10 h-7 rounded-xl text-xl transition-all ${active ? "bg-orange-50" : ""}`}>
                {item.icon}
              </span>
              <span className={`text-[10px] font-bold leading-none ${active ? "text-orange-500" : "text-gray-400"}`}>
                {T(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
