import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { TrendingUp, TrendingDown } from "lucide-react";

/**
 * Shared stat card used across high-traffic admin pages.
 *
 * Displays a metric with an icon, label, value, optional trend and
 * optional click-through link. Replaces per-page ad-hoc stat card
 * implementations on dashboard, users, orders, rides, vendors, riders,
 * transactions, kyc, reviews, sos-alerts, and others.
 *
 * Usage:
 *   <StatCard icon={Users} label="Total Users" value={1234} />
 *   <StatCard icon={DollarSign} label="Revenue" value="Rs. 12,400" trend={+5.2} href="/transactions" />
 */

export interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  href?: string;
  onClick?: () => void;
  iconBgClass?: string;
  iconColorClass?: string;
  className?: string;
}

function StatCardInner({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  iconBgClass = "bg-slate-100",
  iconColorClass = "text-slate-600",
}: Omit<StatCardProps, "href" | "className">) {
  const trendUp = typeof trend === "number" && trend > 0;
  const trendDown = typeof trend === "number" && trend < 0;

  return (
    <div className="flex items-start gap-3">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBgClass} ${iconColorClass}`}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight mt-0.5">{value}</p>
        {(sub || typeof trend === "number") && (
          <div className="flex items-center gap-1.5 mt-1">
            {typeof trend === "number" && (
              <span
                className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                  trendUp ? "text-emerald-600" : trendDown ? "text-red-500" : "text-muted-foreground"
                }`}
              >
                {trendUp && <TrendingUp className="w-3 h-3" aria-hidden="true" />}
                {trendDown && <TrendingDown className="w-3 h-3" aria-hidden="true" />}
                {trend > 0 ? "+" : ""}
                {trend.toFixed(1)}%
              </span>
            )}
            {sub && (
              <span className="text-[11px] text-muted-foreground truncate">{sub}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function StatCard({ href, onClick, className = "", ...props }: StatCardProps) {
  const base =
    "rounded-2xl border border-border/50 bg-white p-4 shadow-sm";
  const interactive = href || onClick;

  if (href) {
    return (
      <Link href={href}>
        <div
          className={`${base} cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md ${className}`}
        >
          <StatCardInner {...props} />
        </div>
      </Link>
    );
  }

  return (
    <div
      className={`${base} ${interactive ? "cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md" : ""} ${className}`}
      onClick={onClick}
    >
      <StatCardInner {...props} />
    </div>
  );
}
