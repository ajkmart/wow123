import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, X, Navigation } from "lucide-react";
import { buildMapsDeepLink } from "./helpers";
import { riderEnv } from "../../lib/envValidation";

interface MapsConfigPublic {
  provider: string;
  token: string;
  secondaryProvider?: string;
  secondaryToken?: string;
  appOverrides?: { rider?: { provider: string; token: string }; [k: string]: any };
}

function MiniMapFitter({
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  hasPick,
  hasDrop,
}: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  hasPick: boolean;
  hasDrop: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (hasPick && hasDrop) {
      map.fitBounds(
        [
          [pickupLat, pickupLng],
          [dropLat, dropLng],
        ],
        { padding: [20, 20], maxZoom: 15 },
      );
    } else if (hasPick) {
      map.setView([pickupLat, pickupLng], 14);
    } else if (hasDrop) {
      map.setView([dropLat, dropLng], 14);
    }
  }, [pickupLat, pickupLng, dropLat, dropLng, hasPick, hasDrop]);
  return null;
}

function useMiniMapTileConfig(): { tileUrl: string; attribution: string } {
  const { data } = useQuery<MapsConfigPublic>({
    queryKey: ["maps-config-public"],
    queryFn: async (): Promise<MapsConfigPublic> => {
      const res = await fetch(`${riderEnv.baseUrl}api/maps/config?app=rider`);
      const json = (await res.json()) as { data?: MapsConfigPublic } & MapsConfigPublic;
      return (json.data ?? json) as MapsConfigPublic;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const riderOverride = data?.appOverrides?.rider;
  const provider = riderOverride?.provider ?? data?.provider ?? "osm";
  const token = riderOverride?.token ?? data?.token ?? "";

  if (provider === "mapbox" && token)
    return {
      tileUrl: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`,
      attribution: "© Mapbox © OSM",
    };
  if (provider === "google" && token)
    return {
      tileUrl: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${token}`,
      attribution: "© Google Maps",
    };
  if (provider === "locationiq" && token)
    return {
      tileUrl: `https://{s}.locationiq.com/v3/street/r/{z}/{x}/{y}.png?key=${token}`,
      attribution: '© <a href="https://locationiq.com">LocationIQ</a> © OSM',
    };
  return {
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OSM",
  };
}

/* ── Fullscreen overlay map ──────────────────────────────────────────────── */
function FullscreenMap({
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
  hasPick,
  hasDrop,
  tileUrl,
  attribution,
  onClose,
}: {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  hasPick: boolean;
  hasDrop: boolean;
  tileUrl: string;
  attribution: string;
  onClose: () => void;
}) {
  const centerLat = hasPick && hasDrop ? (pickupLat + dropLat) / 2 : hasPick ? pickupLat : dropLat;
  const centerLng = hasPick && hasDrop ? (pickupLng + dropLng) / 2 : hasPick ? pickupLng : dropLng;

  const pickupIcon = L.divIcon({
    html: `<div style="width:18px;height:18px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  const dropIcon = L.divIcon({
    html: `<div style="width:18px;height:18px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  const mapsHref = hasDrop
    ? buildMapsDeepLink(dropLat, dropLng)
    : buildMapsDeepLink(pickupLat, pickupLng);

  return (
    <div className="fixed inset-0 z-[2000] bg-black/80 flex flex-col" role="dialog" aria-label="Route map fullscreen">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white flex-shrink-0">
        <p className="font-extrabold text-sm tracking-tight">Route Preview</p>
        <div className="flex items-center gap-2">
          {mapsHref !== "#" && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
            >
              <Navigation size={12} /> Open in Maps
            </a>
          )}
          <button
            onClick={onClose}
            className="bg-white/10 rounded-lg p-1.5"
            aria-label="Close fullscreen map"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="flex-1 relative">
        <MapContainer
          center={[centerLat, centerLng]}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
          zoomControl={true}
          scrollWheelZoom={true}
          dragging={true}
        >
          <TileLayer url={tileUrl} attribution={attribution} maxZoom={19} />
          {hasPick && <Marker position={[pickupLat, pickupLng]} icon={pickupIcon} />}
          {hasDrop && <Marker position={[dropLat, dropLng]} icon={dropIcon} />}
          <MiniMapFitter
            pickupLat={pickupLat}
            pickupLng={pickupLng}
            dropLat={dropLat}
            dropLng={dropLng}
            hasPick={hasPick}
            hasDrop={hasDrop}
          />
        </MapContainer>
        <div className="absolute bottom-2 left-2 flex gap-1.5 z-[1000] pointer-events-none">
          {hasPick && (
            <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">PICKUP</span>
          )}
          {hasDrop && (
            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">DROP</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function MiniMap({
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
}: {
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropLat?: number | null;
  dropLng?: number | null;
}) {
  const hasPick = pickupLat != null && pickupLng != null;
  const hasDrop = dropLat != null && dropLng != null;
  const { tileUrl, attribution } = useMiniMapTileConfig();
  const [fullscreen, setFullscreen] = useState(false);

  if (!hasPick && !hasDrop) return null;

  const centerLat =
    hasPick && hasDrop
      ? (pickupLat! + dropLat!) / 2
      : hasPick
        ? pickupLat!
        : dropLat!;
  const centerLng =
    hasPick && hasDrop
      ? (pickupLng! + dropLng!) / 2
      : hasPick
        ? pickupLng!
        : dropLng!;

  const pickupIcon = L.divIcon({
    html: `<div style="width:14px;height:14px;background:#22c55e;border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
  const dropIcon = L.divIcon({
    html: `<div style="width:14px;height:14px;background:#ef4444;border:2.5px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  return (
    <>
      {fullscreen && (
        <FullscreenMap
          pickupLat={pickupLat ?? 0}
          pickupLng={pickupLng ?? 0}
          dropLat={dropLat ?? 0}
          dropLng={dropLng ?? 0}
          hasPick={hasPick}
          hasDrop={hasDrop}
          tileUrl={tileUrl}
          attribution={attribution}
          onClose={() => setFullscreen(false)}
        />
      )}
      <div className="w-full h-28 rounded-2xl overflow-hidden bg-gray-100 relative mt-3 shadow-inner border border-gray-100">
        <MapContainer
          center={[centerLat!, centerLng!]}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          keyboard={false}
          attributionControl={false}
        >
          <TileLayer url={tileUrl} />
          {hasPick && <Marker position={[pickupLat!, pickupLng!]} icon={pickupIcon} />}
          {hasDrop && <Marker position={[dropLat!, dropLng!]} icon={dropIcon} />}
          <MiniMapFitter
            pickupLat={pickupLat ?? 0}
            pickupLng={pickupLng ?? 0}
            dropLat={dropLat ?? 0}
            dropLng={dropLng ?? 0}
            hasPick={hasPick}
            hasDrop={hasDrop}
          />
        </MapContainer>

        <div className="absolute bottom-1.5 right-1.5 bg-black/40 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded pointer-events-none z-[1000]">
          {attribution}
        </div>
        {hasPick && (
          <div className="absolute top-1.5 left-1.5 bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none z-[1000]">
            PICKUP
          </div>
        )}
        {hasDrop && (
          <div className="absolute bottom-1.5 left-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none z-[1000]">
            DROP
          </div>
        )}

        <button
          onClick={() => setFullscreen(true)}
          className="absolute top-1.5 right-1.5 z-[1001] bg-white/80 backdrop-blur-sm text-gray-700 rounded-lg p-1 shadow-sm hover:bg-white transition-colors"
          aria-label="Expand map fullscreen"
        >
          <Maximize2 size={13} />
        </button>
      </div>
    </>
  );
}
