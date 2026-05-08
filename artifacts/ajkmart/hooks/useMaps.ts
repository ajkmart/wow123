import { useEffect, useRef, useState } from "react";

const API = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/maps`;

export interface MapPrediction {
  placeId:       string;
  description:   string;
  mainText:      string;
  secondaryText?: string;
  lat?: number;
  lng?: number;
}

export interface DirectionsResult {
  distanceKm:      number;
  distanceText:    string;
  durationSeconds: number;
  durationText:    string;
  polyline:        string | null;
  source:          "google" | "fallback";
}

export interface GeocodeResult {
  lat:              number;
  lng:              number;
  formattedAddress: string;
  source:           "google" | "fallback";
}

/* ─── Live autocomplete hook (debounced) ─── */
export function useMapsAutocomplete(query: string, debounceMs = 300) {
  const [predictions, setPredictions] = useState<MapPrediction[]>([]);
  const [loading,     setLoading]     = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (!query.trim()) {
      setLoading(false);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      fetch(`${API}/autocomplete?input=`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(d => setPredictions(d.predictions ?? []))
        .catch(() => setPredictions([]));
      return;
    }

    setLoading(true);
    timer.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await fetch(`${API}/autocomplete?input=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        const d = await r.json();
        setPredictions(d.predictions ?? []);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setPredictions([]);
        }
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [query]);

  return { predictions, loading };
}

/* ─── Resolve a prediction's lat/lng (from inline coords or API geocode) ─── */
export async function resolveLocation(
  prediction: MapPrediction,
  showError?: (msg: string) => void,
): Promise<{ lat: number; lng: number; address: string } | null> {
  if (prediction.lat !== undefined && prediction.lng !== undefined) {
    return { lat: prediction.lat, lng: prediction.lng, address: prediction.description };
  }
  try {
    const r = await fetch(`${API}/geocode?place_id=${encodeURIComponent(prediction.placeId)}`);
    if (r.ok) {
      const d: GeocodeResult = await r.json();
      if (d.lat && d.lng) return { lat: d.lat, lng: d.lng, address: d.formattedAddress };
    }
    /* place_id lookup failed — retry with address text (Nominatim fallback path) */
    if (prediction.description) {
      const r2 = await fetch(`${API}/geocode?address=${encodeURIComponent(prediction.description)}`);
      if (r2.ok) {
        const d2: GeocodeResult = await r2.json();
        if (d2.lat && d2.lng) return { lat: d2.lat, lng: d2.lng, address: d2.formattedAddress ?? prediction.description };
      }
    }
    throw new Error("geocode failed for place_id and address");
  } catch {
    showError?.("Could not resolve location. Please try selecting a different address.");
    return null;
  }
}

/* ─── Reverse geocode lat/lng to human-readable address ─── */
export async function reverseGeocodeCoords(
  lat: number,
  lng: number,
  showError?: (msg: string) => void,
): Promise<{ address: string; formattedAddress?: string } | null> {
  try {
    const r = await fetch(`${API}/reverse-geocode?lat=${lat}&lng=${lng}`);
    if (!r.ok) throw new Error("reverse-geocode failed");
    const d = await r.json();
    return { address: d.address ?? d.formattedAddress ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`, formattedAddress: d.formattedAddress };
  } catch {
    showError?.("Could not resolve your current location. Please type the address manually.");
    return null;
  }
}

/* ─── Get directions between two coordinates ─── */
export async function getDirections(
  oLat: number, oLng: number, dLat: number, dLng: number,
  mode: "driving" | "bicycling" = "driving",
): Promise<DirectionsResult | null> {
  try {
    const url = `${API}/directions?origin_lat=${oLat}&origin_lng=${oLng}&dest_lat=${dLat}&dest_lng=${dLng}&mode=${mode}`;
    const r = await fetch(url);
    return await r.json();
  } catch {
    return null;
  }
}

const DEFAULT_MAP_CENTER = { lat: 34.37, lng: 73.47 };

/** Default center to use when no markers are provided. Can be overridden by platform config. */
export let defaultMapCenter = { ...DEFAULT_MAP_CENTER };

/** Update the module-level default map center from platform config at runtime. */
export function setDefaultMapCenter(lat: number, lng: number): void {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    defaultMapCenter = { lat, lng };
  }
}

/* ─── Google Static Map URL (only works when key is configured) ─── */
export function staticMapUrl(
  markers: { lat: number; lng: number; color?: string }[],
  opts: { width?: number; height?: number; zoom?: number; defaultCenter?: { lat: number; lng: number } } = {},
): string {
  const { width = 600, height = 280, zoom = 11, defaultCenter } = opts;
  const fallback = defaultCenter ?? defaultMapCenter;
  const center = markers[0] ? `${markers[0].lat},${markers[0].lng}` : `${fallback.lat},${fallback.lng}`;
  const markerParams = markers.map((m, i) => {
    const color = m.color ?? (i === 0 ? "green" : "red");
    return `markers=color:${color}%7C${m.lat},${m.lng}`;
  }).join("&");
  return `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/maps/static?center=${center}&zoom=${zoom}&size=${width}x${height}&${markerParams}`;
}
