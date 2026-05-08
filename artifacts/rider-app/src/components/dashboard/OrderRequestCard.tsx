import type { TranslationKey } from "@workspace/i18n";
import { CheckCircle, MapPin, Navigation, X, XCircle } from "lucide-react";
import { AcceptCountdown } from "./AcceptCountdown";
import { RequestAge } from "./RequestAge";
import { OrderTypeIcon } from "./Icons";
import { MiniMap } from "./MiniMap";
import { formatCurrency, buildMapsDeepLink, ACCEPT_TIMEOUT_SEC, PRICING_DEFAULTS } from "./helpers";
import type { PlatformConfig } from "../../lib/useConfig";

interface OrderRequestCardProps {
  order: any;
  earnings: number;
  currency: string;
  config?: PlatformConfig;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onDismiss: (id: string) => void;
  acceptPending: boolean;
  rejectPending: boolean;
  anyAcceptPending: boolean;
  /** ISO timestamp from the server response envelope for clock-offset correction */
  serverTime?: string | null;
  T: (key: TranslationKey) => string;
}

export function OrderRequestCard({
  order: o,
  earnings,
  currency,
  config,
  onAccept,
  onReject,
  onDismiss,
  acceptPending,
  rejectPending,
  anyAcceptPending,
  serverTime,
  T,
}: OrderRequestCardProps) {
  const acceptTimeoutSec = config?.rides?.acceptTimeoutSec ?? config?.dispatch?.broadcastTimeoutSec ?? ACCEPT_TIMEOUT_SEC;

  const isExpired =
    (Date.now() - new Date(o.createdAt).getTime()) / 1000 >= acceptTimeoutSec;

  const orderType = o.type ?? "delivery";
  const orderTotal = typeof o.total === "number" ? o.total : typeof o.total === "string" ? parseFloat(o.total) : null;
  const itemCount = o.itemCount ?? o.item_count ?? null;
  const distanceKm = o.distanceKm ?? o.distance_km ?? null;
  const deliveryAddress = o.deliveryAddress ?? o.delivery_address ?? null;
  const vendorStoreName = o.vendorStoreName ?? o.vendor_store_name ?? null;
  const configDeliveryFee = (() => {
    if (!config?.deliveryFee) return PRICING_DEFAULTS.defaultDeliveryFee;
    if (orderType === "food")     return config.deliveryFee.food     ?? PRICING_DEFAULTS.defaultDeliveryFee;
    if (orderType === "pharmacy") return config.deliveryFee.pharmacy ?? PRICING_DEFAULTS.defaultDeliveryFee;
    if (orderType === "parcel")   return config.deliveryFee.parcel   ?? PRICING_DEFAULTS.defaultDeliveryFee;
    return config.deliveryFee.mart ?? PRICING_DEFAULTS.defaultDeliveryFee;
  })();
  const deliveryFee = typeof earnings === "number" && Number.isFinite(earnings)
    ? earnings
    : configDeliveryFee;

  /* Coordinates — parse safely */
  const vendorLat = o.vendorLat != null ? parseFloat(o.vendorLat) : null;
  const vendorLng = o.vendorLng != null ? parseFloat(o.vendorLng) : null;
  const deliveryLat = o.deliveryLat != null ? parseFloat(o.deliveryLat) : null;
  const deliveryLng = o.deliveryLng != null ? parseFloat(o.deliveryLng) : null;
  const hasValidVendorCoords =
    vendorLat != null && Number.isFinite(vendorLat) &&
    vendorLng != null && Number.isFinite(vendorLng);

  return (
    <div className="p-4 animate-[slideUp_0.3s_ease-out] border-b border-gray-50 last:border-0">
      <div className="flex items-start gap-3">
        <AcceptCountdown createdAt={o.createdAt} serverTime={serverTime} onExpired={() => onDismiss(o.id)} timeoutSec={acceptTimeoutSec} />
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center flex-shrink-0 shadow-sm">
          <OrderTypeIcon type={orderType} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="font-extrabold text-gray-900 text-[15px] capitalize tracking-tight">
              {orderType} Delivery
            </p>
            <RequestAge createdAt={o.createdAt} />
          </div>
          {vendorStoreName ? (
            <p className="text-xs text-blue-600 font-semibold truncate flex items-center gap-1">
              <MapPin size={10} /> {vendorStoreName}
            </p>
          ) : null}
          <p className="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-1">
            <Navigation size={10} className="text-gray-300" />{" "}
            {deliveryAddress || "Destination"}
          </p>
        </div>
        {deliveryFee > 0 ? (
          <div className="bg-green-500 text-white rounded-2xl px-3 py-1.5 flex-shrink-0 text-right shadow-sm shadow-green-200">
            <p className="text-base font-extrabold leading-tight">
              +{formatCurrency(deliveryFee, currency)}
            </p>
            <p className="text-[9px] text-green-100 font-semibold">{T("yourEarnings")}</p>
          </div>
        ) : (
          <div className="bg-gray-100 text-gray-400 rounded-2xl px-3 py-1.5 flex-shrink-0 text-right">
            <p className="text-sm font-bold leading-tight">—</p>
            <p className="text-[9px] font-semibold">{T("yourEarnings")}</p>
          </div>
        )}
      </div>

      {(orderTotal != null || itemCount != null || distanceKm != null) && (
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {orderTotal != null && Number.isFinite(orderTotal) && (
            <div className="bg-gray-50 rounded-xl px-2.5 py-1 border border-gray-100">
              <p className="text-xs font-bold text-gray-700">
                {formatCurrency(orderTotal, currency)}
              </p>
              <p className="text-[9px] text-gray-400">{T("orderTotal")}</p>
            </div>
          )}
          {itemCount != null && Number(itemCount) > 0 && (
            <div className="bg-gray-50 rounded-xl px-2.5 py-1 border border-gray-100">
              <p className="text-xs font-bold text-gray-700">{Number(itemCount)} items</p>
              <p className="text-[9px] text-gray-400">{T("toCollect")}</p>
            </div>
          )}
          {distanceKm != null && parseFloat(distanceKm) > 0 && (
            <div className="bg-blue-50 rounded-xl px-2.5 py-1 border border-blue-100">
              <p className="text-xs font-bold text-blue-700">
                {parseFloat(distanceKm).toFixed(1)} km
              </p>
              <p className="text-[9px] text-blue-400">{T("distance")}</p>
            </div>
          )}
        </div>
      )}

      {hasValidVendorCoords && (
        <MiniMap
          pickupLat={vendorLat}
          pickupLng={vendorLng}
          dropLat={deliveryLat}
          dropLng={deliveryLng}
        />
      )}

      <div className="flex gap-2 mt-3">
        {deliveryAddress && (
          <a
            href={buildMapsDeepLink(deliveryLat, deliveryLng, deliveryAddress)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open delivery address in maps"
            className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold px-3 py-2.5 rounded-xl hover:bg-blue-100 transition-colors min-h-[44px]"
          >
            <MapPin size={14} />
          </a>
        )}
        <button
          onClick={() => onReject(o.id)}
          disabled={rejectPending}
          className="border border-red-200 text-red-400 font-bold px-3 py-2.5 rounded-xl text-sm hover:bg-red-50 transition-colors flex items-center gap-1 disabled:opacity-60 min-h-[44px]"
          aria-label="Reject order"
        >
          <XCircle size={14} /> Reject
        </button>
        <button
          onClick={() => onDismiss(o.id)}
          className="border border-gray-200 text-gray-400 font-bold px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors flex items-center min-h-[44px]"
          aria-label="Dismiss order request"
        >
          <X size={16} />
        </button>
        <button
          onClick={() => onAccept(o.id)}
          disabled={isExpired || acceptPending || anyAcceptPending}
          className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-extrabold py-2.5 rounded-xl text-sm disabled:opacity-60 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm min-h-[44px]"
          aria-label="Accept order"
        >
          <CheckCircle size={15} />
          {acceptPending ? T("accepting") : T("acceptOrder")}
        </button>
      </div>
    </div>
  );
}
