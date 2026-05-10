import { useEffect, useRef, useState } from "react";
import { ShoppingBag, Car, Wallet, AlertTriangle, Radio, Wifi, WifiOff, Trash2, Shield, Package, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActivityFeed, type ActivityEvent, type ActivityEventType } from "@/hooks/useActivityFeed";

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)  return "just now";
  if (diff < 60) return `${diff}s ago`;
  const m = Math.floor(diff / 60);
  if (m < 60)    return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const EVENT_META: Record<
  ActivityEventType,
  { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; dot: string }
> = {
  "order:new":            { icon: ShoppingBag,  color: "text-indigo-600",  bg: "bg-indigo-50",   dot: "bg-indigo-500" },
  "order:update":         { icon: ShoppingBag,  color: "text-blue-600",    bg: "bg-blue-50",     dot: "bg-blue-500" },
  "ride:dispatch-update": { icon: Car,           color: "text-emerald-600", bg: "bg-emerald-50",  dot: "bg-emerald-500" },
  "rider:sos":            { icon: AlertTriangle, color: "text-red-600",     bg: "bg-red-50",      dot: "bg-red-500" },
  "rider:status":         { icon: Radio,         color: "text-violet-600",  bg: "bg-violet-50",   dot: "bg-violet-500" },
  "rider:offline":        { icon: Radio,         color: "text-gray-500",    bg: "bg-gray-50",     dot: "bg-gray-400" },
  "rider:spoof-alert":    { icon: Shield,        color: "text-orange-600",  bg: "bg-orange-50",   dot: "bg-orange-500" },
  "wallet:admin-topup":       { icon: Wallet,       color: "text-amber-600",   bg: "bg-amber-50",    dot: "bg-amber-500" },
  "wallet:deposit-approved":  { icon: Wallet,       color: "text-green-600",   bg: "bg-green-50",    dot: "bg-green-500" },
  "product:stock_updated":    { icon: Package,      color: "text-blue-600",    bg: "bg-blue-50",     dot: "bg-blue-500" },
  "product:stock_low":        { icon: TrendingDown, color: "text-orange-600",  bg: "bg-orange-50",   dot: "bg-orange-500" },
};

function EventRow({ event, tick }: { event: ActivityEvent; tick: number }) {
  const meta = EVENT_META[event.type] ?? {
    icon: Radio,
    color: "text-gray-500",
    bg: "bg-gray-50",
    dot: "bg-gray-400",
  };
  const Icon = meta.icon;
  const isSos = event.type === "rider:sos";

  void tick;

  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-border/30 last:border-0 transition-colors hover:bg-muted/30 ${isSos ? "animate-pulse-once" : ""}`}>
      <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-tight truncate ${isSos ? "text-red-600" : "text-foreground"}`}>
          {event.title}
        </p>
        {event.subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{event.subtitle}</p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5 tabular-nums">
        {relativeTime(event.ts)}
      </span>
    </div>
  );
}

export function ActivityFeed({ maxVisible = 12 }: { maxVisible?: number }) {
  const { events, connected, clear } = useActivityFeed();
  const listRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const prevLenRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!hoverRef.current && listRef.current && events.length > prevLenRef.current) {
      listRef.current.scrollTop = 0;
    }
    prevLenRef.current = events.length;
  }, [events.length]);

  const visible = events.slice(0, maxVisible);

  return (
    <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 sm:px-6 py-4 border-b border-border/30 bg-card flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="w-4 h-4 text-indigo-500 shrink-0" />
          <h2 className="text-base sm:text-lg font-bold truncate">Live Activity</h2>
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
              connected
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-gray-100 border-gray-200 text-gray-500"
            }`}
          >
            {connected ? (
              <><Wifi className="w-2.5 h-2.5" /> Live</>
            ) : (
              <><WifiOff className="w-2.5 h-2.5" /> Offline</>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {events.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={events.length === 0}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title="Clear feed"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div
        ref={listRef}
        className="overflow-y-auto"
        style={{ maxHeight: 420 }}
        onMouseEnter={() => { hoverRef.current = true; }}
        onMouseLeave={() => { hoverRef.current = false; }}
      >
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Radio className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Waiting for live events</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Orders, rides, and wallet actions will appear here in real time.
              </p>
            </div>
            {!connected && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                Connecting to socket…
              </span>
            )}
          </div>
        ) : (
          visible.map((ev) => <EventRow key={ev.id} event={ev} tick={tick} />)
        )}
      </div>

      {events.length > maxVisible && (
        <div className="px-4 py-2 border-t border-border/30 bg-muted/30 text-center shrink-0">
          <span className="text-xs text-muted-foreground">
            +{events.length - maxVisible} older events not shown
          </span>
        </div>
      )}
    </Card>
  );
}
