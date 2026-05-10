import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, X, User, ShoppingBag, Bike, Loader2 } from "lucide-react";
import { adminFetch } from "@/lib/adminFetcher";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  label: string;
  sub?: string;
  href: string;
  type: "user" | "order" | "rider";
}

interface AdminUserRecord {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
}

interface AdminOrderRecord {
  id: string;
  status?: string;
  type?: string;
}

interface AdminRiderRecord {
  id: string;
  name?: string;
  phone?: string;
  status?: string;
}

interface AdminListResponse<T> {
  data?: T[];
  users?: T[];
  orders?: T[];
  riders?: T[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const TYPE_CONFIG = {
  user:  { icon: User,        label: "Users",  color: "text-blue-600",  bg: "bg-blue-50" },
  order: { icon: ShoppingBag, label: "Orders", color: "text-amber-600", bg: "bg-amber-50" },
  rider: { icon: Bike,        label: "Riders", color: "text-green-600", bg: "bg-green-50" },
};

const SEE_ALL_PATHS: Record<"user" | "order" | "rider", string> = {
  user:  "/users",
  order: "/orders",
  rider: "/riders",
};

interface GlobalSearchProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onClose?: () => void;
}

export function GlobalSearch({ inputRef: externalRef, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const debouncedQuery = useDebounce(query, 300);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const encoded = encodeURIComponent(q);
      const [usersRaw, ordersRaw, ridersRaw] = await Promise.allSettled([
        adminFetch(`/users?search=${encoded}&limit=3`) as Promise<AdminListResponse<AdminUserRecord>>,
        adminFetch(`/orders?search=${encoded}&limit=3`) as Promise<AdminListResponse<AdminOrderRecord>>,
        adminFetch(`/riders?search=${encoded}&limit=3`) as Promise<AdminListResponse<AdminRiderRecord>>,
      ]);

      const mapped: SearchResult[] = [];

      if (usersRaw.status === "fulfilled") {
        const users = usersRaw.value?.users ?? usersRaw.value?.data ?? [];
        for (const u of users.slice(0, 3)) {
          mapped.push({ id: u.id, type: "user", label: u.name || u.phone || u.id, sub: u.phone ?? u.email, href: `/users?highlight=${u.id}` });
        }
      }
      if (ordersRaw.status === "fulfilled") {
        const orders = ordersRaw.value?.orders ?? ordersRaw.value?.data ?? [];
        for (const o of orders.slice(0, 3)) {
          mapped.push({ id: o.id, type: "order", label: `Order #${o.id.slice(-8)}`, sub: o.status ?? o.type, href: `/orders?highlight=${o.id}` });
        }
      }
      if (ridersRaw.status === "fulfilled") {
        const riders = ridersRaw.value?.riders ?? ridersRaw.value?.data ?? [];
        for (const r of riders.slice(0, 3)) {
          mapped.push({ id: r.id, type: "rider", label: r.name || r.phone || r.id, sub: r.phone ?? r.status, href: `/riders?highlight=${r.id}` });
        }
      }
      setResults(mapped);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    doSearch(debouncedQuery);
  }, [debouncedQuery, doSearch]);

  useEffect(() => {
    if (query) setOpen(true);
    else setOpen(false);
    setActiveIdx(-1);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    onClose?.();
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    if (e.key === "Enter" && activeIdx >= 0) {
      const item = results[activeIdx];
      if (item) { navigate(item.href); close(); }
    }
    if (e.key === "Escape") { close(); inputRef.current?.blur(); }
  };

  const grouped: Record<"user" | "order" | "rider", SearchResult[]> = {
    user:  results.filter(r => r.type === "user"),
    order: results.filter(r => r.type === "order"),
    rider: results.filter(r => r.type === "rider"),
  };

  const hasResults = results.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs lg:max-w-sm">
      <div className="relative flex items-center">
        <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (query) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder="Search orders, users, riders…"
          className="w-full h-9 pl-9 pr-8 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
          aria-label="Global search"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query && !loading && (
          <button
            type="button"
            onClick={() => close()}
            className="absolute right-2 p-0.5 rounded hover:bg-muted transition-colors"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-2 w-3.5 h-3.5 text-muted-foreground animate-spin pointer-events-none" />
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-border bg-white shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {!loading && !hasResults && debouncedQuery.length >= 2 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for "{debouncedQuery}"
            </div>
          )}
          {!loading && debouncedQuery.length < 2 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}
          {hasResults && (
            <div className="py-1">
              {(["user", "order", "rider"] as const).map(type => {
                const items = grouped[type];
                if (!items.length) return null;
                const cfg = TYPE_CONFIG[type];
                const Icon = cfg.icon;
                return (
                  <div key={type}>
                    <div className="px-3 py-1.5 flex items-center gap-1.5">
                      <Icon className={cn("w-3 h-3", cfg.color)} />
                      <span className={cn("text-[10px] font-bold uppercase tracking-wide", cfg.color)}>{cfg.label}</span>
                    </div>
                    {items.map(item => {
                      const globalIdx = results.indexOf(item);
                      const isActive = globalIdx === activeIdx;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                            isActive ? "bg-muted" : "hover:bg-muted/50",
                          )}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          onClick={() => { navigate(item.href); close(); }}
                        >
                          <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0", cfg.bg)}>
                            <Icon className={cn("w-3 h-3", cfg.color)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                            {item.sub && <p className="text-xs text-muted-foreground truncate">{item.sub}</p>}
                          </div>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={cn("w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-1", cfg.color, "hover:underline opacity-70 hover:opacity-100")}
                      onClick={() => { navigate(`${SEE_ALL_PATHS[type]}?search=${encodeURIComponent(debouncedQuery)}`); close(); }}
                    >
                      See all results →
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-t border-border/50 px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground bg-muted/30">
            <span><kbd className="font-mono bg-white border border-border rounded px-1">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-white border border-border rounded px-1">↵</kbd> open</span>
            <span><kbd className="font-mono bg-white border border-border rounded px-1">Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
