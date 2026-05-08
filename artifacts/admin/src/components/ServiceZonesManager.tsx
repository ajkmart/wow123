import { useState, useCallback } from "react";
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Plus, Trash2, Pencil, CheckCircle2, XCircle, Loader2, MapPin, Info, Car, ShoppingBag, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useServiceZones, useCreateServiceZone, useUpdateServiceZone, useDeleteServiceZone,
  type ServiceZone,
} from "@/hooks/use-admin";

/* ── Fix Leaflet's broken default icon in Vite ── */
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* ── Types ── */
type ZoneForm = {
  name: string;
  city: string;
  lat: string;
  lng: string;
  radiusKm: string;
  isActive: boolean;
  appliesToRides: boolean;
  appliesToOrders: boolean;
  appliesToParcel: boolean;
  notes: string;
};

const EMPTY_FORM: ZoneForm = {
  name: "", city: "", lat: "", lng: "", radiusKm: "10",
  isActive: true, appliesToRides: true, appliesToOrders: true, appliesToParcel: true, notes: "",
};

/* ── Map click handler to pick lat/lng ── */
function MapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

/* ── Zone badge helpers ── */
function ServiceBadges({ zone }: { zone: ServiceZone }) {
  return (
    <div className="flex flex-wrap gap-1">
      {zone.appliesToRides   && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700"><Car className="w-2.5 h-2.5 mr-0.5" />Rides</Badge>}
      {zone.appliesToOrders  && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700"><ShoppingBag className="w-2.5 h-2.5 mr-0.5" />Orders</Badge>}
      {zone.appliesToParcel  && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700"><Package className="w-2.5 h-2.5 mr-0.5" />Parcel</Badge>}
    </div>
  );
}

/* ── Main Component ── */
export function ServiceZonesManager() {
  const { toast } = useToast();
  const { data: zones = [], isLoading } = useServiceZones();
  const create = useCreateServiceZone();
  const update = useUpdateServiceZone();
  const del    = useDeleteServiceZone();

  const [mode, setMode]       = useState<"list" | "add" | "edit">("list");
  const [editId, setEditId]   = useState<number | null>(null);
  const [form, setForm]       = useState<ZoneForm>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<number | null>(null);

  const f = useCallback(<K extends keyof ZoneForm>(k: K, v: ZoneForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v })), []);

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setMode("add");
  }

  function openEdit(z: ServiceZone) {
    setForm({
      name: z.name, city: z.city,
      lat: String(z.lat), lng: String(z.lng),
      radiusKm: String(z.radiusKm),
      isActive: z.isActive,
      appliesToRides: z.appliesToRides,
      appliesToOrders: z.appliesToOrders,
      appliesToParcel: z.appliesToParcel,
      notes: z.notes ?? "",
    });
    setEditId(z.id);
    setMode("edit");
  }

  async function handleSave() {
    const lat = parseFloat(form.lat);
    const lng = parseFloat(form.lng);
    const radiusKm = parseFloat(form.radiusKm);
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) { toast({ title: "Invalid latitude", variant: "destructive" }); return; }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) { toast({ title: "Invalid longitude", variant: "destructive" }); return; }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) { toast({ title: "Radius must be > 0", variant: "destructive" }); return; }

    const payload = { ...form, lat: String(lat), lng: String(lng), radiusKm: String(radiusKm) };
    try {
      if (mode === "add") {
        await create.mutateAsync(payload);
        toast({ title: "Zone created" });
      } else if (editId != null) {
        await update.mutateAsync({ id: editId, ...payload });
        toast({ title: "Zone updated" });
      }
      setMode("list");
    } catch (err) {
      console.error("[ServiceZonesManager] Zone save failed:", err);
      toast({ title: "Save failed", variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      await del.mutateAsync(id);
      toast({ title: "Zone deleted" });
    } catch (err) {
      console.error("[ServiceZonesManager] Zone delete failed:", err);
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  }

  /* ── Form lat/lng from parsed floats ── */
  const previewLat = parseFloat(form.lat);
  const previewLng = parseFloat(form.lng);
  const previewRad = parseFloat(form.radiusKm);
  const hasPreview = Number.isFinite(previewLat) && Number.isFinite(previewLng) && Number.isFinite(previewRad);

  /* ── Default map center: first zone, or fallback ── */
  const mapCenter: [number, number] = zones.length > 0 && zones[0]
    ? [parseFloat(String(zones[0].lat)), parseFloat(String(zones[0].lng))]
    : [34.37, 73.47]; // Muzaffarabad, AJK

  /* ── Compute an appropriate zoom for a given radius in km ── */
  function radiusToZoom(r: number): number {
    if (r <= 1) return 13;
    if (r <= 5) return 11;
    if (r <= 20) return 9;
    if (r <= 50) return 8;
    return 7;
  }

  /* ──────────────────────── RENDER ──────────────────────────────── */

  if (mode === "list") {
    return (
      <div className="space-y-4">

        {/* Zone Overview Map */}
        {zones.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-border h-52">
            <MapContainer center={mapCenter} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              {zones.map(z => {
                const lat = parseFloat(String(z.lat));
                const lng = parseFloat(String(z.lng));
                const r   = parseFloat(String(z.radiusKm));
                if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(r)) return null;
                return (
                  <Circle key={z.id}
                    center={[lat, lng]}
                    radius={r * 1000}
                    pathOptions={{ color: z.isActive ? "#16a34a" : "#94a3b8", fillOpacity: 0.12, weight: 2 }}
                  >
                    <Popup><strong>{z.name}</strong><br />{z.city}<br />Radius: {r} km</Popup>
                  </Circle>
                );
              })}
            </MapContainer>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            {zones.length} service zone{zones.length !== 1 ? "s" : ""} configured
          </span>
          <Button size="sm" onClick={openAdd} className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> Add Zone
          </Button>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading zones…
          </div>
        )}

        {/* Empty state */}
        {!isLoading && zones.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-border p-8 text-center">
            <MapPin className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">No service zones yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a zone to define where rides, orders and parcels are available</p>
            <Button size="sm" className="mt-4 gap-1.5" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" /> Add First Zone
            </Button>
          </div>
        )}

        {/* Zone cards */}
        <div className="space-y-2">
          {zones.map(z => (
            <div key={z.id} className={`rounded-xl border p-3.5 flex items-start gap-3 ${z.isActive ? "border-border bg-white" : "border-border bg-muted/30"}`}>
              <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${z.isActive ? "bg-green-500" : "bg-gray-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{z.name}</span>
                  {!z.isActive && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">Inactive</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {z.city} &bull; {Number(z.lat).toFixed(4)}, {Number(z.lng).toFixed(4)} &bull; {z.radiusKm} km radius
                </p>
                <div className="mt-1.5"><ServiceBadges zone={z} /></div>
                {z.notes && <p className="text-xs text-muted-foreground mt-1 italic">{z.notes}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(z)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={() => handleDelete(z.id)}
                  disabled={deleting === z.id}
                >
                  {deleting === z.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ──────────────── ADD / EDIT FORM ──────────────── */
  const isSaving = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{mode === "add" ? "Add New Zone" : "Edit Zone"}</span>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMode("list")}>
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Zone Name *</label>
          <Input placeholder="e.g. Muzaffarabad Central" value={form.name} onChange={e => f("name", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">City</label>
          <Input placeholder="e.g. Muzaffarabad" value={form.city} onChange={e => f("city", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Latitude *</label>
          <Input placeholder="34.3700" value={form.lat} onChange={e => f("lat", e.target.value)} className="h-8 text-sm font-mono" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Longitude *</label>
          <Input placeholder="73.4700" value={form.lng} onChange={e => f("lng", e.target.value)} className="h-8 text-sm font-mono" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Radius (km) *</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={1} max={100} step={1}
              value={Number.isFinite(parseFloat(form.radiusKm)) ? parseFloat(form.radiusKm) : 10}
              onChange={e => f("radiusKm", e.target.value)}
              className="flex-1 accent-green-600"
            />
            <Input
              value={form.radiusKm}
              onChange={e => f("radiusKm", e.target.value)}
              className="h-8 text-sm font-mono w-20"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Notes</label>
          <Input placeholder="Optional description" value={form.notes} onChange={e => f("notes", e.target.value)} className="h-8 text-sm" />
        </div>
      </div>

      {/* Service types */}
      <div>
        <label className="text-xs font-medium text-foreground block mb-2">Applies To</label>
        <div className="flex flex-wrap gap-2">
          {([
            ["appliesToRides",   "Rides",   "bg-blue-100 text-blue-700 border-blue-200"],
            ["appliesToOrders",  "Orders",  "bg-emerald-100 text-emerald-700 border-emerald-200"],
            ["appliesToParcel",  "Parcel",  "bg-purple-100 text-purple-700 border-purple-200"],
          ] as const).map(([key, label, cls]) => (
            <button
              key={key}
              type="button"
              onClick={() => f(key, !form[key])}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                form[key] ? cls : "bg-gray-100 text-gray-400 border-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => f("isActive", !form.isActive)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              form.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-400 border-gray-200"
            }`}
          >
            {form.isActive ? <><CheckCircle2 className="w-3 h-3 inline mr-1" />Active</> : <><XCircle className="w-3 h-3 inline mr-1" />Inactive</>}
          </button>
        </div>
      </div>

      {/* Mini preview map */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="text-xs font-medium text-foreground">Map Preview</label>
          <span className="text-xs text-muted-foreground">— click the map to set the center point</span>
        </div>
        <div className="rounded-xl overflow-hidden border border-border h-52">
          <MapContainer
            key={`${hasPreview ? previewLat : mapCenter[0]}-${hasPreview ? previewLng : mapCenter[1]}-${hasPreview ? previewRad : 0}`}
            center={hasPreview ? [previewLat, previewLng] : mapCenter}
            zoom={hasPreview ? radiusToZoom(previewRad) : 10}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <MapClickHandler onPick={(lat, lng) => { f("lat", lat.toFixed(6)); f("lng", lng.toFixed(6)); }} />
            {hasPreview && (
              <>
                <Circle
                  center={[previewLat, previewLng]}
                  radius={previewRad * 1000}
                  pathOptions={{ color: form.isActive ? "#16a34a" : "#94a3b8", fillOpacity: 0.15, weight: 2 }}
                />
                <Marker position={[previewLat, previewLng]}>
                  <Popup>{form.name || "Zone center"}<br />Radius: {previewRad} km</Popup>
                </Marker>
              </>
            )}
          </MapContainer>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
          <Info className="w-3 h-3" /> Click anywhere on the map to auto-fill the coordinates
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button className="h-8 text-xs gap-1.5" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          {mode === "add" ? "Create Zone" : "Save Changes"}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setMode("list")}>Cancel</Button>
      </div>
    </div>
  );
}
