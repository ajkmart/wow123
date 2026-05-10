import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { adminFetch, fetchAdminAbsolute } from "@/lib/adminFetcher";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingBag, Car, Pill,
  Search, ArrowRight, X, User, Hash, Shield, Navigation,
  Star, BadgeCheck, BanknoteIcon,
  Sparkles, Brain, Filter, Zap, CheckCircle2, Loader2,
} from "lucide-react";

import { SEARCH_INDEX, type SearchEntry, type SearchCategory } from "@/lib/searchIndex";
import { matchesKeywords } from "@/lib/romanUrdu";
import { safeLocalGet, safeLocalSet } from "@/lib/safeStorage";
import { getAdminTiming } from "@/lib/adminTiming";
import { escapeHtml } from "@/lib/escapeHtml";

/* ── Live search result types — replace the previous `any[]` lists ───── */
interface LiveUser {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

interface LiveRide {
  id?: string;
  status?: string;
  pickupAddress?: string;
  dropAddress?: string;
  fare?: string | number;
  offeredFare?: number;
}

interface LiveOrder {
  id?: string;
  status?: string;
  deliveryAddress?: string;
  total?: string | number;
}

interface LiveSearchResponse {
  users?: LiveUser[];
  rides?: LiveRide[];
  orders?: LiveOrder[];
  pharmacy?: LiveOrder[];
}

type CmdItem =
  | (SearchEntry & { _aiResult?: boolean; _aiReason?: string; _type?: undefined })
  | (LiveUser & { _type: "user" })
  | (LiveRide & { _type: "ride" })
  | (LiveOrder & { _type: "order"; _pharm?: boolean });

/* ─── Keywords that signal a command intent (not a search) ─────────────── */
const CMD_KEYWORDS = [
  "enable", "disable", "turn on", "turn off", "activate", "deactivate",
  "set ", "change ", "update ", "maintenance", "band kar", "chalu kar",
  "off kar", "on kar",
];
function isCommandLike(q: string): boolean {
  const lower = q.toLowerCase();
  return q.length >= 8 && CMD_KEYWORDS.some(kw => lower.includes(kw));
}

/* ─── Ride & Order status color ───────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  searching:   "bg-blue-100 text-blue-700",
  bargaining:  "bg-orange-100 text-orange-700",
  accepted:    "bg-purple-100 text-purple-700",
  arrived:     "bg-indigo-100 text-indigo-700",
  in_transit:  "bg-cyan-100 text-cyan-700",
  completed:   "bg-green-100 text-green-700",
  delivered:   "bg-green-100 text-green-700",
  cancelled:   "bg-red-100 text-red-700",
  pending:     "bg-yellow-100 text-yellow-700",
  active:      "bg-emerald-100 text-emerald-700",
};

/* ─── Category filter config ──────────────────────────────────────────── */
type FilterTab = "All" | SearchCategory;
const FILTER_TABS: FilterTab[] = ["All", "Pages", "Settings", "Actions", "Users", "Orders", "Rides"];
const STATUS_FILTERS = ["pending", "active", "completed", "cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

/* Status ↔ DB value aliases */
const STATUS_ALIASES: Record<StatusFilter, string[]> = {
  pending:   ["pending"],
  active:    ["accepted", "active", "in_transit", "arrived", "searching", "bargaining"],
  completed: ["completed", "delivered"],
  cancelled: ["cancelled", "canceled"],
};

/* ─── Highlight matching text ─────────────────────────────────────────── */
/**
 * Renders `text` with the substring matching `query` wrapped in a `<mark>`.
 *
 * Defence-in-depth: even though React would auto-escape JSX text children,
 * this implementation uses `dangerouslySetInnerHTML` so it can wrap the
 * highlighted slice in a real `<mark>` tag. To stay safe, BOTH the source
 * text and the query are run through `escapeHtml` before any string
 * concatenation, and only the literal `<mark>` open/close tags we control
 * are emitted as raw HTML — user-controlled bytes can therefore never
 * reach the DOM as markup.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <span>{text}</span>;
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));
  const html = `${before}<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">${match}</mark>${after}`;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ─── AI result type ─────────────────────────────────────────────────── */
interface AiResult {
  id: string;
  title: string;
  path: string;
  reason?: string;
}

/* ─── Component ───────────────────────────────────────────────────────── */
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface CmdResult {
  executed: boolean;
  type: string;
  label?: string;
  description?: string;
  key?: string;
  value?: string;
  previousValue?: string;
  path?: string;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [activeStatus, setActiveStatus] = useState<StatusFilter | null>(null);
  const [aiEnabled, setAiEnabled] = useState(() => safeLocalGet("admin-ai-search") === "on");
  const [cmdExecuting, setCmdExecuting] = useState(false);
  const [cmdResult, setCmdResult] = useState<CmdResult | null>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  /* ── Execute a natural-language command via AI ─────────────────────── */
  const executeCmd = useCallback(async (cmdText: string) => {
    setCmdExecuting(true);
    setCmdResult(null);
    try {
      const data = await fetchAdminAbsolute(`/api/admin/command/execute`, {
        method: "POST",
        body: JSON.stringify({ command: cmdText }),
      }) as { data?: CmdResult };
      const result = data.data ?? (data as unknown as CmdResult);
      setCmdResult(result);
      if (result.executed) {
        toast({
          title: `✅ ${result.label ?? "Setting updated"}`,
          description: result.description ?? `Changed to: ${result.value}`,
        });
      } else if (result.type === "navigate" && result.path) {
        setLocation(result.path);
        onClose();
      } else {
        toast({ title: "Command info", description: result.description ?? "Command not executed" });
      }
    } catch (err) {
      console.error("[CommandPalette] command execution failed:", err);
      const message = err instanceof Error ? err.message : "Command could not be executed.";
      toast({ title: "Command failed", description: message, variant: "destructive" });
    } finally {
      setCmdExecuting(false);
    }
  }, [toast, setLocation, onClose]);

  /* ── Persist AI toggle ── */
  const toggleAi = () => {
    setAiEnabled(v => {
      const next = !v;
      const result = safeLocalSet("admin-ai-search", next ? "on" : "off");
      if (!result.ok) {
        toast({
          title: "AI preference not saved",
          description: "Storage is unavailable — the setting will reset on reload.",
          variant: "destructive",
        });
      }
      return next;
    });
  };

  /* ── Debounced query for backend calls ── */
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedQ(query),
      getAdminTiming().commandPaletteDebounceMs,
    );
    return () => clearTimeout(t);
  }, [query]);

  /* ── Build backend filter params ── */
  const backendParams = new URLSearchParams();
  backendParams.set("q", debouncedQ);
  if (activeFilter !== "All" && activeFilter !== "Pages" && activeFilter !== "Settings" && activeFilter !== "Actions") {
    backendParams.set("category", activeFilter.toLowerCase());
  }
  if (activeStatus) {
    backendParams.set("status", STATUS_ALIASES[activeStatus].join(","));
  }

  /* ── Live DB search (with filter params) ── */
  const { data: liveData, isFetching } = useQuery({
    queryKey: ["cmd-search", debouncedQ, activeFilter, activeStatus],
    queryFn:  () => adminFetch(`/admin/search?${backendParams.toString()}`),
    enabled:  debouncedQ.length >= 2,
    staleTime: getAdminTiming().commandPaletteLiveStaleMs,
  });

  /* ── AI search (authenticated via adminFetcher) ── */
  const { data: aiData, isFetching: aiLoading } = useQuery({
    queryKey: ["cmd-ai-search", debouncedQ, aiEnabled],
    queryFn:  async () => {
      return fetchAdminAbsolute(`/api/admin/search/ai`, {
        method: "POST",
        body: JSON.stringify({ query: debouncedQ }),
      });
    },
    enabled: aiEnabled && debouncedQ.length >= 5,
    staleTime: getAdminTiming().commandPaletteAiStaleMs,
    retry: false,
  });

  /* ── Consume AI suggestedFilters ── */
  const aiSuggestedFilters = useMemo<string[]>(
    () => aiData?.data?.suggestedFilters ?? aiData?.suggestedFilters ?? [],
    [aiData],
  );
  useEffect(() => {
    if (aiSuggestedFilters.length === 0) return;
    /* Auto-apply first matching status filter from AI suggestion */
    const suggestedStatus = aiSuggestedFilters.find(f =>
      STATUS_FILTERS.includes(f as StatusFilter)
    ) as StatusFilter | undefined;
    if (suggestedStatus && !activeStatus) {
      setActiveStatus(suggestedStatus);
    }
  }, [aiSuggestedFilters, activeStatus]);

  /* ── Local static search (transliteration + fuzzy) ── */
  const q = query.trim().toLowerCase();

  const localStaticItems: SearchEntry[] = q.length < 1
    ? SEARCH_INDEX.filter(e => e.category === "Actions").slice(0, 6)
        .concat(SEARCH_INDEX.filter(e => e.category === "Pages").slice(0, 6))
    : SEARCH_INDEX.filter(e =>
        e.title.toLowerCase().includes(q) ||
        (e.subtitle ?? "").toLowerCase().includes(q) ||
        matchesKeywords(q, e.keywords, e.urduKeywords, e.romanUrduKeywords)
      );

  /* Apply category filter to static items */
  const filteredStaticItems =
    activeFilter === "All"
      ? localStaticItems
      : activeFilter === "Users" || activeFilter === "Orders" || activeFilter === "Rides"
        ? []
        : localStaticItems.filter(e => e.category === activeFilter);

  /* ── AI results enriched with full index entries ── */
  const aiResults: AiResult[] = aiData?.data?.results ?? aiData?.results ?? [];
  const aiEnrichedItems: Array<SearchEntry & { _aiReason?: string }> = aiResults.flatMap(r => {
    const entry = SEARCH_INDEX.find(e => e.id === r.id);
    return entry ? [{ ...entry, _aiReason: r.reason }] : [];
  });

  /* ── Live DB results ── */
  const live: LiveSearchResponse = (liveData ?? {}) as LiveSearchResponse;
  const liveUsers:    LiveUser[]  = live.users    ?? [];
  const liveRides:    LiveRide[]  = live.rides    ?? [];
  const liveOrders:   LiveOrder[] = live.orders   ?? [];
  const livePharmacy: LiveOrder[] = live.pharmacy ?? [];

  /* Apply per-category filtering */
  const showUsers  = activeFilter === "All" || activeFilter === "Users";
  const showRides  = activeFilter === "All" || activeFilter === "Rides";
  const showOrders = activeFilter === "All" || activeFilter === "Orders";

  /* Client-side status filter on live results */
  const filterByStatus = <T extends { status?: string }>(items: T[]): T[] => {
    if (!activeStatus) return items;
    const accepted = STATUS_ALIASES[activeStatus];
    return items.filter(i => accepted.includes(i.status ?? ""));
  };

  /* Build full item list: AI → static → live */
  const allItems = useMemo<CmdItem[]>(() => [
    ...aiEnrichedItems.map(e => ({ ...e, _aiResult: true } as CmdItem)),
    ...filteredStaticItems
      .filter(e => !aiEnrichedItems.find(a => a.id === e.id))
      .map(e => ({ ...e } as CmdItem)),
    ...(showUsers ? liveUsers.map((u): CmdItem => ({ _type: "user", ...u })) : []),
    ...(showRides ? filterByStatus(liveRides).map((r): CmdItem => ({ _type: "ride", ...r })) : []),
    ...(showOrders
      ? filterByStatus([
          ...liveOrders.map(o => ({ ...o, _pharm: false })),
          ...livePharmacy.map(p => ({ ...p, _pharm: true })),
        ]).map((o): CmdItem => ({ _type: "order", ...o }))
      : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [aiEnrichedItems, filteredStaticItems, showUsers, liveUsers, showRides, filterByStatus, liveRides, showOrders, liveOrders, livePharmacy]);

  /* ── Reset selection on list/query change; clear stale cmd result ── */
  useEffect(() => {
    setSelected(0);
    setCmdResult(null);
  }, [allItems, debouncedQ]);

  /* ── Reset on open ── */
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQ("");
      setSelected(0);
      setActiveFilter("All");
      setActiveStatus(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  /* ── Navigate to item (with query params intact for filtered views) ── */
  const navigate = useCallback((item: CmdItem) => {
    const path = (item as SearchEntry).path ?? (item as { href?: string }).href;
    if (path) {
      /* Path may already contain query params (e.g. /orders?status=pending) */
      setLocation(path);
    } else if (item._type === "user") {
      setLocation("/users");
    } else if (item._type === "ride") {
      setLocation("/rides");
    } else if (item._type === "order") {
      setLocation("/orders");
    }
    onClose();
  }, [setLocation, onClose]);

  /* ── Keyboard navigation ── */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, allItems.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && allItems[selected]) { e.preventDefault(); navigate(allItems[selected]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, allItems, selected, navigate, onClose]);

  /* ── Scroll selected into view ── */
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  /* ── Group headers ── */
  const getGroup = (item: CmdItem, idx: number): string | null => {
    const groupOf = (it: CmdItem): string | null => {
      if ("_aiResult" in it && it._aiResult) return "AI Suggestions";
      if ("_type" in it && it._type === "user")  return "Users";
      if ("_type" in it && it._type === "ride")  return "Rides";
      if ("_type" in it && it._type === "order") return "Orders";
      return "group" in it && typeof it.group === "string" ? it.group : null;
    };
    const cur  = groupOf(item);
    const prev = idx > 0 ? groupOf(allItems[idx - 1]) : null;
    return cur !== prev ? cur : null;
  };

  const showStatusFilter = activeFilter === "Orders" || activeFilter === "Rides";
  const isLoading = isFetching || (aiEnabled && aiLoading && debouncedQ.length >= 5);

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-border/60 overflow-hidden flex flex-col"
        style={{ maxHeight: "75vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Search input row ── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={aiEnabled
              ? "Type naturally in English, Urdu (اردو), or Roman Urdu..."
              : "Search pages, settings, users, rides, orders..."}
            className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/60"
            autoComplete="off"
            spellCheck={false}
            dir="auto"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            {isLoading && (
              <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {query && (
              <button onClick={() => setQuery("")} className="p-0.5 rounded-md hover:bg-muted transition-colors">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            {/* AI toggle */}
            <button
              onClick={toggleAi}
              title={aiEnabled ? "AI search ON — click to disable" : "Enable AI natural-language search"}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                aiEnabled
                  ? "bg-violet-100 text-violet-700 border border-violet-200"
                  : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
              }`}
            >
              {aiEnabled ? <Brain className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
              AI
            </button>
            <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>
        </div>

        {/* ── AI active banner ── */}
        {aiEnabled && (
          <div className="px-4 py-1.5 bg-violet-50/70 border-b border-violet-100 flex items-center gap-2">
            <Brain className="w-3 h-3 text-violet-500 shrink-0" />
            <p className="text-[10px] text-violet-600 font-medium">
              AI mode — describe anything: "show cancelled rides today", "payment settings", "pending zaroorat"
              {" — or "}
              <span className="font-bold">type a command</span>: "enable maintenance", "disable rides", "set delivery radius to 10"
            </p>
          </div>
        )}

        {/* ── AI command execution strip ── */}
        {aiEnabled && isCommandLike(query) && (
          <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-100 flex items-center gap-3">
            <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-amber-800">Command detected</p>
              <p className="text-[10px] text-amber-600 truncate">"{query}"</p>
            </div>
            {cmdResult?.executed && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Done
              </span>
            )}
            <button
              onClick={() => executeCmd(query)}
              disabled={cmdExecuting}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold transition-colors disabled:opacity-50"
            >
              {cmdExecuting
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Zap className="w-3 h-3" />}
              Execute
            </button>
          </div>
        )}

        {/* ── Filter chip bar ── */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/30 overflow-x-auto scrollbar-none">
          <Filter className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveFilter(tab); setActiveStatus(null); }}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                activeFilter === tab
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab}
            </button>
          ))}

          {/* Status sub-filter — contextual for Orders/Rides */}
          {showStatusFilter && (
            <>
              <div className="w-px h-4 bg-border/50 mx-1 shrink-0" />
              {STATUS_FILTERS.map(s => (
                <button
                  key={s}
                  onClick={() => setActiveStatus(v => v === s ? null : s)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize transition-colors ${
                    activeStatus === s
                      ? (STATUS_COLORS[s] ?? "bg-muted text-muted-foreground") + " ring-1 ring-current/30"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {s}
                </button>
              ))}
            </>
          )}

          {/* AI suggested filters badge */}
          {aiSuggestedFilters.length > 0 && (
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <Brain className="w-2.5 h-2.5 text-violet-400" />
              <span className="text-[9px] text-violet-500 font-medium">
                AI suggests: {aiSuggestedFilters.join(", ")}
              </span>
            </div>
          )}
        </div>

        {/* ── Results list ── */}
        <div ref={listRef} className="overflow-y-auto flex-1">
          {allItems.length === 0 && debouncedQ.length >= 2 && !isLoading && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Koi nateeja nahi mila</p>
              <p className="text-xs mt-1 opacity-70">"{query}" ke liye kuch nahi mila</p>
              {!aiEnabled && (
                <button
                  onClick={toggleAi}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 text-xs font-semibold flex items-center gap-1.5 mx-auto hover:bg-violet-200 transition-colors"
                >
                  <Brain className="w-3.5 h-3.5" /> Try AI search
                </button>
              )}
            </div>
          )}

          {allItems.map((item, idx) => {
            const groupLabel = getGroup(item, idx);
            const isSelected = idx === selected;

            return (
              <div key={idx}>
                {/* Group header */}
                {groupLabel && (
                  <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
                    {groupLabel === "AI Suggestions" && <Brain className="w-3 h-3 text-violet-500" />}
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${
                      groupLabel === "AI Suggestions" ? "text-violet-500" : "text-muted-foreground/60"
                    }`}>{groupLabel}</p>
                  </div>
                )}

                {/* ── Static / AI result item ── */}
                {!item._type && (() => {
                  const Icon = item.icon;
                  return (
                    <button
                      data-idx={idx}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? "bg-primary/8 text-primary" : "hover:bg-muted/50"
                      }`}
                      onClick={() => navigate(item)}
                      onMouseEnter={() => setSelected(idx)}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? "bg-primary/12" : "bg-muted"
                      }`}>
                        <Icon className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-semibold truncate ${isSelected ? "text-primary" : ""}`}>
                            <Highlight text={item.title} query={query} />
                          </p>
                          {item._aiResult && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 text-[9px] font-bold">
                              <Brain className="w-2.5 h-2.5" /> AI
                            </span>
                          )}
                        </div>
                        {(item._aiReason ?? item.subtitle ?? item.hint) ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {item._aiReason ?? item.subtitle ?? item.hint}
                          </p>
                        ) : null}
                      </div>
                      {isSelected && <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })()}

                {/* ── User result ── */}
                {item._type === "user" && (
                  <button
                    data-idx={idx}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-primary/8" : "hover:bg-muted/50"}`}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setSelected(idx)}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${isSelected ? "bg-primary text-white" : "bg-primary/10 text-primary"}`}>
                      {(item.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate"><Highlight text={item.name || "Unnamed"} query={query} /></p>
                        {item.role && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground uppercase">{item.role}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground"><Highlight text={item.phone || item.email || "—"} query={query} /></p>
                    </div>
                    <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </button>
                )}

                {/* ── Ride result ── */}
                {item._type === "ride" && (
                  <button
                    data-idx={idx}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-primary/8" : "hover:bg-muted/50"}`}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setSelected(idx)}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-blue-100" : "bg-muted"}`}>
                      <Car className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono text-muted-foreground">#{item.id?.slice(-8).toUpperCase()}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md capitalize ${(item.status && STATUS_COLORS[item.status]) || "bg-muted text-muted-foreground"}`}>{item.status}</span>
                        {item.offeredFare && <span className="text-[10px] text-orange-600 font-bold">💬 Rs.{Math.round(item.offeredFare)}</span>}
                      </div>
                      <p className="text-sm font-medium truncate"><Highlight text={item.pickupAddress || "—"} query={query} /></p>
                      <p className="text-xs text-muted-foreground truncate">→ {item.dropAddress}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold">Rs. {Math.round(parseFloat(String(item.fare ?? "0")))}</p>
                    </div>
                  </button>
                )}

                {/* ── Order result ── */}
                {item._type === "order" && (
                  <button
                    data-idx={idx}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? "bg-primary/8" : "hover:bg-muted/50"}`}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setSelected(idx)}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-green-100" : "bg-muted"}`}>
                      {item._pharm
                        ? <Pill className="w-4 h-4 text-green-600" />
                        : <ShoppingBag className="w-4 h-4 text-green-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono text-muted-foreground">#{item.id?.slice(-8).toUpperCase()}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md capitalize ${(item.status && STATUS_COLORS[item.status]) || "bg-muted text-muted-foreground"}`}>{item.status}</span>
                        {item._pharm && <span className="text-[10px] text-purple-600 font-bold">Pharmacy</span>}
                      </div>
                      <p className="text-sm font-medium truncate"><Highlight text={item.deliveryAddress || "—"} query={query} /></p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold">Rs. {Math.round(parseFloat(String(item.total ?? "0")))}</p>
                    </div>
                  </button>
                )}
              </div>
            );
          })}

          {/* Footer */}
          {allItems.length > 0 && (
            <div className="border-t border-border/30 px-4 py-2.5 flex items-center gap-4 text-[10px] text-muted-foreground/50">
              <span className="flex items-center gap-1"><kbd className="bg-muted border border-border rounded px-1 font-mono">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="bg-muted border border-border rounded px-1 font-mono">↵</kbd> select</span>
              <span className="flex items-center gap-1"><kbd className="bg-muted border border-border rounded px-1 font-mono">esc</kbd> close</span>
              <span className="ml-auto flex items-center gap-1">
                <Hash className="w-3 h-3" /> {allItems.length} results
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Backdrop */}
      <div className="fixed inset-0 -z-10 bg-black/40 backdrop-blur-sm" />
    </div>
  );
}
