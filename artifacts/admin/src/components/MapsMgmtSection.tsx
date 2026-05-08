import { useState, useEffect, useCallback } from "react";
import { useAbortableEffect, isAbortError } from "@/lib/useAbortableEffect";
import {
  MapPin, CheckCircle2, XCircle, Loader2, RefreshCw, ChevronDown, ChevronRight,
  Zap, Globe, BarChart3, Settings, Trash2, Info, ExternalLink, AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toggle, Field, SecretInput, SLabel } from "@/components/AdminShared";
import { useToast } from "@/hooks/use-toast";
import { apiAbsoluteFetch } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

async function mapsApiFetch(path: string, options: RequestInit = {}) {
  return apiAbsoluteFetch(`/api${path}`, options);
}

type TestResult = { ok: boolean; latencyMs: number; error?: string; testedAt?: string } | null;
type UsageData = { dailyChart: Array<Record<string, any>>; monthlyByProvider: Record<string, Record<string, number>>; costEstimates: Record<string, number> } | null;
type MapConfig = { geocodeCacheCurrentSize: number } | null;

interface ProviderPanelProps {
  name: string;
  label: string;
  color: string;
  enabledKey: string;
  roleKey: string;
  apiKeyKey?: string;
  apiKeyPlaceholder?: string;
  setupUrl?: string;
  setupNote: string;
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  handleChange: (k: string, v: string) => void;
  handleToggle: (k: string, v: boolean) => void;
  provider: string;
}

function ProviderPanel({ name, label, color, enabledKey, roleKey, apiKeyKey, apiKeyPlaceholder, setupUrl, setupNote, localValues, dirtyKeys, handleChange, handleToggle, provider }: ProviderPanelProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const { toast } = useToast();

  const val  = (k: string) => localValues[k] ?? "";
  const dirty = (k: string) => dirtyKeys.has(k);
  const tog  = (k: string, def = "off") => (localValues[k] ?? def) === "on";

  const enabled = tog(enabledKey, provider === "osm" ? "on" : "off");
  const role = val(roleKey) || "disabled";

  const roleColors: Record<string, string> = {
    primary:   "bg-green-100 text-green-700 border-green-200",
    secondary: "bg-blue-100 text-blue-700 border-blue-200",
    both:      "bg-purple-100 text-purple-700 border-purple-200",
    disabled:  "bg-gray-100 text-gray-500 border-gray-200",
  };

  const onTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const keyOverride = apiKeyKey ? val(apiKeyKey) : undefined;
      const result = await mapsApiFetch("/maps/admin/test", {
        method: "POST",
        body: JSON.stringify({ provider, key: keyOverride || undefined }),
      });
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ ok: false, latencyMs: 0, error: e.message });
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const colorClasses: Record<string, { border: string; bg: string; text: string }> = {
    green:  { border: "border-green-400",  bg: "bg-green-50",  text: "text-green-800" },
    blue:   { border: "border-blue-400",   bg: "bg-blue-50",   text: "text-blue-800" },
    red:    { border: "border-red-400",    bg: "bg-red-50",    text: "text-red-800" },
    orange: { border: "border-orange-400", bg: "bg-orange-50", text: "text-orange-800" },
  };
  const cc = colorClasses[color] ?? colorClasses.green!;

  return (
    <div className={`rounded-xl border-2 transition-all ${enabled ? `${cc.border} bg-white` : "border-dashed border-border bg-muted/10"}`}>
      <div
        className="flex items-center justify-between p-3.5 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-foreground">{label}</span>
              {enabled
                ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">● ENABLED</span>
                : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">○ DISABLED</span>
              }
              <Badge variant="outline" className={`text-[10px] font-bold rounded-full px-2 py-0 border ${roleColors[role]}`}>
                {role.toUpperCase()}
              </Badge>
              {testResult && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${testResult.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {testResult.ok ? `✓ ${testResult.latencyMs}ms` : "✗ FAIL"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={testing}
            className="h-7 px-2 rounded-lg text-xs gap-1"
          >
            {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {testing ? "Testing…" : "Test"}
          </Button>
          <div
            onClick={() => handleToggle(enabledKey, !enabled)}
            className="cursor-pointer"
          >
            <div className={`w-10 h-5 rounded-full relative transition-colors ${enabled ? "bg-green-500" : "bg-gray-300"}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow absolute top-0.5 transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className={`border-t ${cc.border} p-4 space-y-4`}>
          {/* Setup note */}
          <div className={`${cc.bg} rounded-lg p-3 text-xs ${cc.text} flex gap-2`}>
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              {setupNote}
              {setupUrl && (
                <a href={setupUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 ml-1 font-semibold underline hover:no-underline">
                  Setup Guide <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>

          {/* API key (not for OSM) */}
          {apiKeyKey && (
            <SecretInput
              label="API Key / Access Token"
              value={val(apiKeyKey)}
              onChange={v => handleChange(apiKeyKey!, v)}
              isDirty={dirty(apiKeyKey)}
              placeholder={apiKeyPlaceholder}
            />
          )}

          {/* Test result */}
          {testResult && (
            <div className={`rounded-lg p-3 text-xs flex items-start gap-2 ${testResult.ok ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
              {testResult.ok
                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                : <XCircle className="w-4 h-4 flex-shrink-0" />}
              <div>
                {testResult.ok
                  ? <strong>Connection OK</strong>
                  : <strong>Connection Failed</strong>}
                <span className="ml-1">— {testResult.latencyMs}ms</span>
                {testResult.error && <div className="mt-0.5 opacity-80">{testResult.error}</div>}
              </div>
            </div>
          )}

          {/* Role selector */}
          <div>
            <SLabel icon={Settings}>Provider Role</SLabel>
            <div className="flex gap-2 flex-wrap mt-2">
              {(["primary", "secondary", "both", "disabled"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => handleChange(roleKey, r)}
                  className={`flex-1 min-w-[80px] rounded-lg border-2 p-2 text-xs font-bold text-center transition-all capitalize ${
                    role === r
                      ? r === "primary"   ? "border-green-400 bg-green-50 text-green-800 shadow-sm"
                      : r === "secondary" ? "border-blue-400 bg-blue-50 text-blue-800 shadow-sm"
                      : r === "both"      ? "border-purple-400 bg-purple-50 text-purple-800 shadow-sm"
                      : "border-gray-400 bg-gray-100 text-gray-700 shadow-sm"
                      : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  } ${dirty(roleKey) && role === r ? "ring-2 ring-amber-300" : ""}`}
                >
                  {r === "primary" ? "● Primary" : r === "secondary" ? "◎ Secondary" : r === "both" ? "✦ Both" : "○ Disabled"}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Primary: default provider for all apps. Secondary: auto-failover target. Both: used by all apps with built-in failover.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  localValues: Record<string, string>;
  dirtyKeys: Set<string>;
  handleChange: (k: string, v: string) => void;
  handleToggle: (k: string, v: boolean) => void;
}

export function MapsMgmtSection({ localValues, dirtyKeys, handleChange, handleToggle }: Props) {
  const [usageData, setUsageData] = useState<UsageData>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [mapConfig, setMapConfig] = useState<MapConfig>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const { toast } = useToast();

  const val   = (k: string) => localValues[k] ?? "";
  const dirty = (k: string) => dirtyKeys.has(k);
  const tog   = (k: string, def = "off") => (localValues[k] ?? def) === "on";

  const loadUsage = useCallback(async (signal?: AbortSignal) => {
    setUsageLoading(true);
    try {
      const data = await mapsApiFetch("/maps/admin/usage", { signal });
      if (signal?.aborted) return;
      setUsageData(data);
    } catch (err) {
      if (isAbortError(err)) return;
      console.error("[Maps] Usage data load failed:", err);
    } finally {
      if (!signal?.aborted) setUsageLoading(false);
    }
  }, []);

  const loadMapConfig = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await mapsApiFetch(`/maps/config`, { signal });
      if (signal?.aborted) return;
      setMapConfig(data?.data ?? data);
    } catch (err) {
      if (isAbortError(err)) return;
      console.error("[Maps] Config load failed:", err);
    }
  }, []);

  useAbortableEffect((signal) => {
    void loadUsage(signal);
    void loadMapConfig(signal);
  }, [loadUsage, loadMapConfig]);

  const clearCache = async () => {
    setClearingCache(true);
    try {
      await mapsApiFetch("/maps/admin/cache/clear", { method: "POST" });
      toast({ title: "Cache cleared", description: "Geocoding cache has been flushed." });
      loadMapConfig();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
    setClearingCache(false);
  };

  /* Resolve displayed primary provider */
  const primary   = val("map_provider_primary")   || "osm";
  const secondary = val("map_provider_secondary") || "osm";
  const routing   = val("routing_engine")         || "osrm";

  /* ── Shared ProviderPanel shorthand props */
  const panelProps = { localValues, dirtyKeys, handleChange, handleToggle };

  /* ── Health card ── */
  const PROVIDER_STATUS = [
    { key: "osm",       label: "OpenStreetMap", testKey: "map_test_status_osm",       lastKey: "map_last_tested_osm",       color: "green"  },
    { key: "mapbox",    label: "Mapbox GL JS",  testKey: "map_test_status_mapbox",    lastKey: "map_last_tested_mapbox",    color: "blue"   },
    { key: "google",    label: "Google Maps",   testKey: "map_test_status_google",    lastKey: "map_last_tested_google",    color: "red"    },
    { key: "locationiq",label: "LocationIQ",    testKey: "map_test_status_locationiq",lastKey: "map_last_tested_locationiq",color: "orange" },
  ];

  const routingEngines = [
    { v: "mapbox", label: "Mapbox Directions", color: "border-blue-400 bg-blue-50 text-blue-800" },
    { v: "google", label: "Google Directions", color: "border-red-400 bg-red-50 text-red-800" },
    { v: "osrm",   label: "OSRM (Open-Source)", color: "border-green-400 bg-green-50 text-green-800" },
  ];

  const serviceTypes = [
    { key: "ride",     label: "Rides",    emoji: "🏍️" },
    { key: "delivery", label: "Delivery", emoji: "📦" },
    { key: "parcel",   label: "Parcel",   emoji: "🎁" },
  ];

  const appOverrides = [
    { key: "map_app_override_customer", label: "Customer App" },
    { key: "map_app_override_rider",    label: "Rider App" },
    { key: "map_app_override_vendor",   label: "Vendor App" },
    { key: "map_app_override_admin",    label: "Admin Fleet Map" },
  ];

  const dailyChart = usageData?.dailyChart ?? [];
  const monthlyCost = usageData?.costEstimates ?? {};
  const monthlyByProvider = usageData?.monthlyByProvider ?? {};

  /* ── Detect if the AJK-optimal configuration is active ── */
  const isAjkOptimal =
    (val("map_provider_primary") || "osm") === "locationiq" &&
    (val("map_search_provider") || "locationiq") === "locationiq" &&
    (val("routing_engine") || "osrm") === "osrm" &&
    !!val("locationiq_api_key").trim();

  return (
    <div className="space-y-5">

      {/* ── AJK Optimal Configuration Recommendation ── */}
      <div className={`rounded-xl border-2 p-4 ${isAjkOptimal ? "border-emerald-300 bg-emerald-50" : "border-orange-200 bg-orange-50"}`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">{isAjkOptimal ? "✅" : "💡"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-foreground">
                {isAjkOptimal ? "AJK-Optimal Configuration Active" : "Recommended Setup for AJK / Pakistan"}
              </span>
              {isAjkOptimal && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">● CONFIGURED</span>}
            </div>
            {isAjkOptimal ? (
              <p className="text-xs text-emerald-800 mt-1">
                LocationIQ tiles + geocoding with OSRM routing — lowest cost, best AJK coverage.
              </p>
            ) : (
              <>
                <p className="text-xs text-orange-800 mt-1 mb-3">
                  For AJK & Pakistan: use <strong>LocationIQ</strong> (free tier, 5,000 requests/day, excellent Pakistan coverage)
                  for map tiles, search &amp; geocoding, and <strong>OSRM</strong> (open-source, free) for routing. This gives
                  the best coverage at the lowest cost.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-white/80 rounded-lg px-3 py-2 border border-orange-200">
                    <div className="font-bold text-orange-800">🗺️ Map Tiles</div>
                    <div className="text-orange-700 mt-0.5">LocationIQ (Primary)</div>
                    <div className="text-muted-foreground">Free · OSM-based · AJK coverage</div>
                  </div>
                  <div className="bg-white/80 rounded-lg px-3 py-2 border border-orange-200">
                    <div className="font-bold text-orange-800">🔍 Search & Geocoding</div>
                    <div className="text-orange-700 mt-0.5">LocationIQ</div>
                    <div className="text-muted-foreground">Free tier · Pakistan-friendly</div>
                  </div>
                  <div className="bg-white/80 rounded-lg px-3 py-2 border border-orange-200">
                    <div className="font-bold text-orange-800">🛣️ Routing Engine</div>
                    <div className="text-orange-700 mt-0.5">OSRM (Open-Source)</div>
                    <div className="text-muted-foreground">100% free · No API key needed</div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-orange-700">
                  <strong>Why not Google Maps?</strong> Google charges $5–$10 per 1,000 requests. For a regional AJK platform, LocationIQ's free 5,000 daily requests is more than enough to start — upgrade only when you exceed that.
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 1. API Health Dashboard ── */}
      <div>
        <SLabel icon={Zap}>API Health Dashboard</SLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          {PROVIDER_STATUS.map(({ key, label, testKey, lastKey, color }) => {
            const status = val(testKey) || "unknown";
            const last   = val(lastKey);
            const cc = color === "green"  ? "border-green-200 bg-green-50"
              : color === "blue"   ? "border-blue-200 bg-blue-50"
              : color === "orange" ? "border-orange-200 bg-orange-50"
              : "border-red-200 bg-red-50";
            return (
              <Card key={key} className={`p-3 rounded-xl border ${cc} shadow-sm`}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-foreground">{label}</span>
                  {status === "ok"      && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">● UP</span>}
                  {status === "fail"    && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">✗ DOWN</span>}
                  {status === "unknown" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">? Unknown</span>}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {last ? `Last tested: ${new Date(last).toLocaleString()}` : "Not yet tested"}
                </p>
                <p className="text-[11px] font-semibold mt-0.5">
                  {key === primary ? <span className="text-green-700">● Primary</span>
                    : key === secondary ? <span className="text-blue-700">◎ Secondary</span>
                    : <span className="text-muted-foreground">Not active</span>}
                </p>
              </Card>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Toggle
            label="Auto-Failover to Secondary"
            sub="Automatically switches to secondary provider on tile errors"
            checked={tog("map_failover_enabled", "on")}
            onChange={v => handleToggle("map_failover_enabled", v)}
            isDirty={dirty("map_failover_enabled")}
          />
        </div>
      </div>

      {/* ── 2. Provider Panels ── */}
      <div>
        <SLabel icon={Globe}>Map Providers</SLabel>
        <div className="space-y-3 mt-2">
          <ProviderPanel
            name="osm" label="OpenStreetMap" color="green"
            enabledKey="osm_enabled" roleKey="map_provider_role_osm"
            provider="osm"
            setupNote="No API key required. Tiles served by Leaflet with the OSM public tile server. Always available as fallback."
            {...panelProps}
          />
          <ProviderPanel
            name="mapbox" label="Mapbox GL JS" color="blue"
            enabledKey="mapbox_enabled" roleKey="map_provider_role_mapbox"
            apiKeyKey="mapbox_api_key" apiKeyPlaceholder="pk.eyJ1Ijoib..."
            setupUrl="https://account.mapbox.com"
            provider="mapbox"
            setupNote="Create a token at account.mapbox.com → Access Tokens. Enable: styles:read, tiles:read. Restrict to your domain."
            {...panelProps}
          />
          <ProviderPanel
            name="google" label="Google Maps" color="red"
            enabledKey="google_maps_enabled" roleKey="map_provider_role_google"
            apiKeyKey="google_maps_api_key" apiKeyPlaceholder="AIzaSy..."
            setupUrl="https://console.cloud.google.com"
            provider="google"
            setupNote="Go to console.cloud.google.com → APIs & Services → Enable: Maps JavaScript API, Geocoding API. Restrict key to your domain."
            {...panelProps}
          />
          <ProviderPanel
            name="locationiq" label="LocationIQ" color="orange"
            enabledKey="locationiq_enabled" roleKey="map_provider_role_locationiq"
            apiKeyKey="locationiq_api_key" apiKeyPlaceholder="pk.xxxxxxxxxxxxxxxxxxxxxxxx"
            setupUrl="https://locationiq.com/dashboard"
            provider="locationiq"
            setupNote="Register at locationiq.com → Dashboard → Access Tokens. Provides geocoding, autocomplete & map tiles. Free tier includes 5,000 requests/day."
            {...panelProps}
          />
        </div>
      </div>

      {/* ── 3. Search & Geocoding Provider ── */}
      <div>
        <SLabel icon={MapPin}>Search &amp; Geocoding Provider</SLabel>
        <p className="text-xs text-muted-foreground mb-3">
          This provider handles address search, autocomplete suggestions, and reverse geocoding across all apps.
        </p>
        <div className="flex gap-2 flex-wrap">
          {[
            { v: "locationiq", label: "LocationIQ", sub: "Free tier, Pakistan-friendly", color: "border-orange-400 bg-orange-50 text-orange-800" },
            { v: "google",     label: "Google Maps", sub: "Best accuracy, paid",         color: "border-red-400 bg-red-50 text-red-800" },
            { v: "osm",        label: "Nominatim (OSM)", sub: "Free, no key needed",      color: "border-green-400 bg-green-50 text-green-800" },
          ].map(({ v, label, sub, color }) => {
            const active = (val("map_search_provider") || "locationiq") === v;
            return (
              <button
                key={v}
                onClick={() => handleChange("map_search_provider", v)}
                className={`flex-1 min-w-[130px] rounded-xl border-2 p-3 text-left transition-all ${active ? color + " shadow-sm" : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"} ${dirty("map_search_provider") && active ? "ring-2 ring-amber-300" : ""}`}
              >
                <div className="font-bold text-xs">{label}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 4. Active Provider Selector ── */}
      <div>
        <SLabel icon={MapPin}>Active Provider Assignment</SLabel>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Primary Provider</label>
            <select
              value={val("map_provider_primary") || "osm"}
              onChange={e => handleChange("map_provider_primary", e.target.value)}
              className={`w-full h-9 rounded-lg border text-sm px-3 bg-background ${dirty("map_provider_primary") ? "border-amber-300 bg-amber-50/50" : "border-border"}`}
            >
              <option value="osm">OpenStreetMap</option>
              <option value="mapbox">Mapbox GL JS</option>
              <option value="google">Google Maps</option>
              <option value="locationiq">LocationIQ</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">Secondary (Failover)</label>
            <select
              value={val("map_provider_secondary") || "osm"}
              onChange={e => handleChange("map_provider_secondary", e.target.value)}
              className={`w-full h-9 rounded-lg border text-sm px-3 bg-background ${dirty("map_provider_secondary") ? "border-amber-300 bg-amber-50/50" : "border-border"}`}
            >
              <option value="osm">OpenStreetMap</option>
              <option value="mapbox">Mapbox GL JS</option>
              <option value="google">Google Maps</option>
              <option value="locationiq">LocationIQ</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── 4. App Assignment ── */}
      <div>
        <SLabel icon={Settings}>Per-App Provider Override</SLabel>
        <p className="text-xs text-muted-foreground mb-3">Override the map provider for specific apps. "Inherit Primary" uses the global primary provider.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {appOverrides.map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs font-semibold text-foreground block mb-1">{label}</label>
              <select
                value={val(key) || "primary"}
                onChange={e => handleChange(key, e.target.value)}
                className={`w-full h-9 rounded-lg border text-sm px-3 bg-background ${dirty(key) ? "border-amber-300 bg-amber-50/50" : "border-border"}`}
              >
                <option value="primary">Inherit Primary</option>
                <option value="secondary">Inherit Secondary</option>
                <option value="osm">Force OpenStreetMap</option>
                <option value="mapbox">Force Mapbox</option>
                <option value="google">Force Google Maps</option>
                <option value="locationiq">Force LocationIQ</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. Routing Engine ── */}
      <div>
        <SLabel icon={MapPin}>Routing Engine</SLabel>
        <p className="text-xs text-muted-foreground mb-3">Used for fare calculation, ETA estimates, and turn-by-turn directions.</p>
        <div className="flex gap-2 flex-wrap">
          {routingEngines.map(({ v, label, color }) => {
            const active = routing === v;
            return (
              <button
                key={v}
                onClick={() => handleChange("routing_engine", v)}
                className={`flex-1 min-w-[120px] rounded-xl border-2 p-3 text-left transition-all ${active ? color + " shadow-sm" : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"} ${dirty("routing_engine") && active ? "ring-2 ring-amber-300" : ""}`}
              >
                <div className="font-bold text-xs">{label}</div>
              </button>
            );
          })}
        </div>

        {/* Per-routing-engine rate fields */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Rate Settings for {routing === "mapbox" ? "Mapbox" : routing === "google" ? "Google" : "OSRM"} Engine</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { k: `routing_${routing}_per_km_rate`,  label: "Per KM Rate", suffix: "Rs" },
              { k: `routing_${routing}_base_fare`,     label: "Base Fare",   suffix: "Rs" },
              { k: `routing_${routing}_surge_mult`,    label: "Surge Mult",  suffix: "×" },
              { k: `routing_${routing}_max_radius_km`, label: "Max Radius",  suffix: "km" },
            ].map(({ k, label, suffix }) => (
              <Field key={k} label={label} value={val(k)} onChange={v => handleChange(k, v)} isDirty={dirty(k)} type="number" suffix={suffix} />
            ))}
          </div>
        </div>
      </div>

      {/* ── 6. Per-Service Fare Grid ── */}
      <div>
        <SLabel icon={BarChart3}>Fare & Rate Settings</SLabel>
        <div className="space-y-4 mt-2">
          {serviceTypes.map(({ key, label, emoji }) => (
            <div key={key}>
              <p className="text-xs font-bold text-foreground mb-2">{emoji} {label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { k: `fare_${key}_per_km_rate`,  label: "Per KM Rate", suffix: "Rs" },
                  { k: `fare_${key}_base_fare`,     label: "Base Fare",   suffix: "Rs" },
                  { k: `fare_${key}_surge_mult`,    label: "Surge Mult",  suffix: "×" },
                  { k: `fare_${key}_max_radius_km`, label: "Max Radius",  suffix: "km" },
                ].map(({ k, label, suffix }) => (
                  <Field key={k} label={label} value={val(k)} onChange={v => handleChange(k, v)} isDirty={dirty(k)} type="number" suffix={suffix} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 7. API Usage Billing Dashboard ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SLabel icon={BarChart3}>API Usage Dashboard</SLabel>
          <Button variant="outline" size="sm" onClick={() => { void loadUsage(); }} disabled={usageLoading} className="h-7 px-2 rounded-lg gap-1 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${usageLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Cost summary cards */}
        {Object.keys(monthlyCost).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { key: "osm",       label: "OpenStreetMap" },
              { key: "mapbox",    label: "Mapbox" },
              { key: "google",    label: "Google Maps" },
              { key: "locationiq",label: "LocationIQ" },
            ].map(({ key: p, label }) => (
              <Card key={p} className="p-3 rounded-xl border-border/50 shadow-sm">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
                <p className="text-xl font-black text-foreground">${(monthlyCost[p] ?? 0).toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">Est. this month</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {Object.values(monthlyByProvider[p] ?? {}).reduce((a, b) => a + b, 0).toLocaleString()} calls
                </p>
              </Card>
            ))}
          </div>
        )}

        {/* Daily chart */}
        {dailyChart.length > 0 ? (
          <Card className="p-4 rounded-2xl border-border/50 shadow-sm">
            <p className="text-xs font-bold text-foreground mb-3">Daily API Calls (last 30 days)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyChart} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="osm"        name="OSM"        fill="#22c55e" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="mapbox"     name="Mapbox"     fill="#3b82f6" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="google"     name="Google"     fill="#ef4444" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="locationiq" name="LocationIQ" fill="#f97316" stackId="a" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <BarChart3 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{usageLoading ? "Loading usage data…" : "No API usage data yet. Data will appear as maps are used."}</p>
          </div>
        )}
      </div>

      {/* ── 8. Geocoding Cache ── */}
      <div>
        <SLabel icon={Settings}>Geocoding Cache Configuration</SLabel>
        <p className="text-xs text-muted-foreground mb-3">
          Server-side LRU cache for reverse-geocode results. Reduces redundant API calls on minor coordinate drift.
          {mapConfig ? ` Current cache size: ${mapConfig.geocodeCacheCurrentSize ?? 0} entries.` : ""}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Cache TTL (minutes)"
            value={val("geocode_cache_ttl_min")}
            onChange={v => handleChange("geocode_cache_ttl_min", v)}
            isDirty={dirty("geocode_cache_ttl_min")}
            type="number" suffix="min"
            hint="How long geocode results are cached. 0 = no cache."
          />
          <Field
            label="Max Cache Size (entries)"
            value={val("geocode_cache_max_size")}
            onChange={v => handleChange("geocode_cache_max_size", v)}
            isDirty={dirty("geocode_cache_max_size")}
            type="number" suffix="entries"
            hint="Maximum number of reverse-geocode results to keep in memory."
          />
        </div>
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={clearCache}
            disabled={clearingCache}
            className="gap-2 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
          >
            {clearingCache ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Clear Cache Now
          </Button>
        </div>
      </div>

    </div>
  );
}
