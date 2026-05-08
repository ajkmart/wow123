import { Link } from "wouter";
import { ChevronRight } from "lucide-react";

interface ActiveTaskBannerProps {
  activeData: any;
  variant: "green" | "amber";
}

export function ActiveTaskBanner({ activeData, variant }: ActiveTaskBannerProps) {
  const isOrder = !!activeData?.order;
  const title = isOrder ? "Active Delivery in Progress" : "Active Ride in Progress";
  const subtitle = isOrder
    ? `Order #${activeData.order.id?.slice(-6).toUpperCase()} — ${activeData.order.deliveryAddress || "Customer"}`
    : `Ride → ${activeData?.ride?.dropAddress || "Drop location"}`;

  if (variant === "green") {
    return (
      <Link
        href="/active"
        className="block bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl px-4 py-3.5 shadow-lg shadow-green-200 active:scale-[0.98] transition-transform animate-[slideUp_0.3s_ease-out]"
        aria-label="Go to active task"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center flex-shrink-0">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-white tracking-tight">{title}</p>
            <p className="text-xs text-white/70 mt-0.5 truncate">{subtitle}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm text-white font-extrabold text-xs px-3 py-2 rounded-xl flex-shrink-0 flex items-center gap-1">
            Track <ChevronRight size={12} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/active"
      className="block bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-400 rounded-3xl px-4 py-3.5 shadow-sm active:scale-[0.98] transition-transform animate-[slideUp_0.3s_ease-out]"
      aria-label="Go to active task"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center flex-shrink-0">
          <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-amber-800 tracking-tight">{title}</p>
          <p className="text-xs text-amber-600 mt-0.5 truncate">{subtitle}</p>
        </div>
        <div className="bg-amber-200/60 text-amber-700 font-extrabold text-xs px-3 py-2 rounded-xl flex-shrink-0 flex items-center gap-1">
          Go <ChevronRight size={12} />
        </div>
      </div>
    </Link>
  );
}
