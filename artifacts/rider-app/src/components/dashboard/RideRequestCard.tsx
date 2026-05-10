import type { TranslationKey } from "@workspace/i18n";
import { useState, useEffect } from "react";
import {
  CheckCircle,
  MapPin,
  Navigation,
  X,
  Clock,
  MessageSquare,
  Zap,
  SkipForward,
} from "lucide-react";
import { AcceptCountdown } from "./AcceptCountdown";
import { RequestAge } from "./RequestAge";
import { RideTypeIcon } from "./Icons";
import { MiniMap } from "./MiniMap";
import {
  formatCurrency,
  buildMapsDeepLink,
  SVC_NAMES,
  ACCEPT_TIMEOUT_SEC,
  PRICING_DEFAULTS,
} from "./helpers";
import type { PlatformConfig } from "../../lib/useConfig";

interface RideRequestCardProps {
  ride: any;
  userId: string;
  isRestricted: boolean;
  config: PlatformConfig;
  currency: string;
  onAccept: (id: string) => void;
  onCounter: (id: string, counterFare: number) => void;
  onRejectOffer: (id: string) => void;
  onIgnore: (id: string) => void;
  onDismiss: (id: string) => void;
  acceptPending: boolean;
  counterPending: boolean;
  rejectOfferPending: boolean;
  ignorePending: boolean;
  anyAcceptPending: boolean;
  /** ISO timestamp from server response envelope for clock-offset correction */
  serverTime?: string | null;
  T: (key: TranslationKey) => string;
}

export function RideRequestCard({
  ride: r,
  userId,
  isRestricted,
  config,
  currency,
  onAccept,
  onCounter,
  onRejectOffer,
  onIgnore,
  onDismiss,
  acceptPending,
  counterPending,
  rejectOfferPending,
  ignorePending,
  anyAcceptPending,
  serverTime,
  T,
}: RideRequestCardProps) {
  const [counterInput, setCounterInput] = useState("");
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterError, setCounterError] = useState("");
  const [localBidPending, setLocalBidPending] = useState(false);

  /* Clear local pending flag once the server confirms via r.myBid */
  useEffect(() => {
    if (r.myBid && localBidPending) setLocalBidPending(false);
  }, [r.myBid, localBidPending]);

  const acceptTimeoutSec = config.rides.acceptTimeoutSec ?? config.dispatch?.broadcastTimeoutSec ?? ACCEPT_TIMEOUT_SEC;

  const isBargain = r.status === "bargaining" && r.offeredFare != null;
  const isDispatched = r.dispatchedRiderId === userId;
  const offeredFare = r.offeredFare ?? r.fare;
  const effectiveFare = isBargain ? offeredFare : r.fare;
  const rideExpired =
    (Date.now() - new Date(r.createdAt).getTime()) / 1000 >= acceptTimeoutSec;

  const riderEarningPct = config.finance.riderEarningPct ?? PRICING_DEFAULTS.defaultRiderEarningPct;
  const earnings = effectiveFare != null ? Number(effectiveFare) * (riderEarningPct / 100) : null;

  const svcName = SVC_NAMES[r.type] ?? r.type?.replace(/_/g, " ") ?? "Ride";
  const rideDistKm = r.distance != null ? parseFloat(r.distance) : null;
  const etaMin = rideDistKm != null && rideDistKm > 0
    ? Math.max(1, Math.round((rideDistKm / 30) * 60))
    : null;

  /* Map link — prefer drop coords, fall back to pickup, then address */
  const mapsUrl = buildMapsDeepLink(
    r.dropLat ?? null,
    r.dropLng ?? null,
    r.dropAddress ?? r.pickupAddress ?? null,
  );

  const getMinFare = () => {
    const vt = r.vehicleType as string | undefined;
    if (vt === "car")      return config.rides.carMinFare      ?? PRICING_DEFAULTS.carMinFare;
    if (vt === "rickshaw") return config.rides.rickshawMinFare ?? PRICING_DEFAULTS.rickshawMinFare;
    if (vt === "daba")     return config.rides.dabaMinFare     ?? PRICING_DEFAULTS.dabaMinFare;
    return config.rides.bikeMinFare ?? PRICING_DEFAULTS.bikeMinFare;
  };

  const getMaxFare = () => {
    const maxMult = config.rides.counterMaxMultiplier ?? PRICING_DEFAULTS.counterMaxMultiplier;
    return Number(r.offeredFare ?? r.fare ?? 0) * maxMult;
  };

  const validateAndSubmitCounter = () => {
    if (localBidPending || counterPending) return;
    const v = Number(counterInput || 0);
    const minFare = getMinFare();
    const maxFare = getMaxFare();
    if (!v || v < minFare) {
      setCounterError(`Minimum fare is ${formatCurrency(minFare, currency)}`);
      return;
    }
    if (v > maxFare) {
      setCounterError(`Cannot exceed ${formatCurrency(maxFare, currency)}`);
      return;
    }
    setCounterError("");
    setLocalBidPending(true);
    onCounter(r.id, v);
    setCounterInput("");
    setShowCounterForm(false);
  };

  const pickupLat = r.pickupLat != null ? parseFloat(r.pickupLat) : null;
  const pickupLng = r.pickupLng != null ? parseFloat(r.pickupLng) : null;
  const dropLat = r.dropLat != null ? parseFloat(r.dropLat) : null;
  const dropLng = r.dropLng != null ? parseFloat(r.dropLng) : null;
  const hasValidPickupCoords =
    pickupLat != null && Number.isFinite(pickupLat) &&
    pickupLng != null && Number.isFinite(pickupLng);

  return (
    <div
      className={`p-4 animate-[slideUp_0.3s_ease-out] ${
        isDispatched
          ? "border-l-4 border-blue-500 bg-gradient-to-r from-blue-50/50 to-white"
          : isBargain
          ? "border-l-4 border-orange-400 bg-gradient-to-r from-orange-50/50 to-white"
          : "hover:bg-gray-50/50"
      } transition-colors`}
    >
      <div className="flex items-start gap-3">
        <AcceptCountdown createdAt={r.createdAt} serverTime={serverTime} onExpired={() => onDismiss(r.id)} timeoutSec={acceptTimeoutSec} />
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm border ${
            isDispatched
              ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200"
              : isBargain
              ? "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200"
              : "bg-gradient-to-br from-green-50 to-emerald-50 border-green-100"
          }`}
        >
          {isBargain ? (
            <MessageSquare size={20} className="text-orange-500" />
          ) : (
            <RideTypeIcon type={r.type} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-extrabold text-gray-900 text-[15px] tracking-tight">
              {svcName} Ride
            </p>
            {isDispatched && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-pulse flex items-center gap-1 border border-blue-200">
                <Zap size={8} /> DISPATCHED
              </span>
            )}
            {isBargain && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 animate-pulse flex items-center gap-1 border border-orange-200">
                <MessageSquare size={8} /> BARGAIN
              </span>
            )}
            {isBargain && r.myBid && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1 border border-blue-200">
                <CheckCircle size={8} /> Bid Sent
              </span>
            )}
            {r.isParcel && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1 border border-amber-200">
                📦 Parcel
              </span>
            )}
            {r.isPoolRide && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 flex items-center gap-1 border border-violet-200">
                👥 Pool
              </span>
            )}
            <RequestAge createdAt={r.createdAt} />
          </div>
          {(r.riderDistanceKm != null || r.riderEtaMin != null) && (
            <div className="flex items-center gap-2 mt-1 mb-1">
              {r.riderDistanceKm != null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex items-center gap-1">
                  <Navigation size={9} />{" "}
                  {r.riderDistanceKm < 1
                    ? `${Math.round(r.riderDistanceKm * 1000)}m`
                    : `${r.riderDistanceKm} km`}{" "}
                  away
                </span>
              )}
              {r.riderEtaMin != null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-100 flex items-center gap-1">
                  <Clock size={9} /> {r.riderEtaMin} min ETA
                </span>
              )}
            </div>
          )}
          <div className="space-y-1 mt-1">
            <p className="text-xs text-gray-600 truncate flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full inline-block flex-shrink-0 shadow-sm shadow-green-500/30" />
              {r.pickupAddress || "Pickup location"}
            </p>
            <p className="text-xs text-gray-400 truncate flex items-center gap-1.5">
              <span className="w-2 h-2 bg-red-500 rounded-full inline-block flex-shrink-0 shadow-sm shadow-red-500/30" />
              {r.dropAddress || "Drop-off location"}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            {earnings != null && earnings > 0 ? (
              <div
                className={`rounded-xl px-3 py-1.5 border ${isBargain ? "bg-orange-50 border-orange-100" : "bg-green-50 border-green-100"}`}
              >
                <p
                  className={`text-base font-extrabold leading-tight ${isBargain ? "text-orange-600" : "text-green-600"}`}
                >
                  +{formatCurrency(earnings, currency)}
                </p>
                <p className="text-[9px] text-gray-400 font-semibold">{T("yourEarnings")}</p>
              </div>
            ) : null}
            {isBargain && offeredFare != null && (
              <div>
                <p className="text-sm font-bold text-orange-700">
                  {formatCurrency(offeredFare, currency)}
                </p>
                <p className="text-[9px] text-gray-400 font-medium">{T("customerOffer")}</p>
              </div>
            )}
            {rideDistKm != null && rideDistKm > 0 && (
              <div>
                <p className="text-sm font-bold text-gray-700">{rideDistKm.toFixed(1)} km</p>
                <p className="text-[9px] text-gray-400 font-medium">{T("distance")}</p>
              </div>
            )}
            {etaMin != null && (
              <div>
                <p className="text-sm font-bold text-blue-600">{etaMin} min</p>
                <p className="text-[9px] text-gray-400 font-medium">ETA</p>
              </div>
            )}
            {r.fare != null && (
              <div>
                <p className="text-sm font-bold text-gray-300 line-through">
                  {formatCurrency(r.fare, currency)}
                </p>
                <p className="text-[9px] text-gray-400 font-medium">{T("platformFare")}</p>
              </div>
            )}
          </div>
          {r.bargainNote && (
            <div className="mt-2 bg-orange-50 border border-orange-100 rounded-xl px-3 py-2">
              <p className="text-xs text-orange-700 italic flex items-center gap-1.5">
                <MessageSquare size={11} className="flex-shrink-0" /> "{r.bargainNote}"
              </p>
            </div>
          )}
        </div>
      </div>

      {hasValidPickupCoords && (
        <MiniMap
          pickupLat={pickupLat}
          pickupLng={pickupLng}
          dropLat={dropLat}
          dropLng={dropLng}
        />
      )}

      {!isBargain && (
        <div className="flex gap-2 mt-3">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open pickup location in maps"
            className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold px-3 py-2.5 rounded-xl hover:bg-blue-100 transition-colors min-h-[44px]"
          >
            <MapPin size={14} />
          </a>
          {isDispatched ? (
            <button
              onClick={() => onIgnore(r.id)}
              disabled={ignorePending || acceptPending || anyAcceptPending}
              className="border border-amber-300 text-amber-600 font-bold px-3 py-2.5 rounded-xl text-sm hover:bg-amber-50 transition-colors flex items-center gap-1 disabled:opacity-60 min-h-[44px]"
              aria-label="Ignore dispatched ride"
            >
              <SkipForward size={14} /> Ignore
            </button>
          ) : (
            <button
              onClick={() => onDismiss(r.id)}
              className="border border-gray-200 text-gray-400 font-bold px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors flex items-center min-h-[44px]"
              aria-label="Dismiss ride request"
            >
              <X size={16} />
            </button>
          )}
          <button
            onClick={() => onAccept(r.id)}
            disabled={
              rideExpired || acceptPending || anyAcceptPending || ignorePending || !!isRestricted
            }
            className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-extrabold py-2.5 rounded-xl text-sm disabled:opacity-60 transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm min-h-[44px]"
            aria-label="Accept ride"
          >
            <CheckCircle size={15} />
            {acceptPending ? T("accepting") : T("acceptRide")}
          </button>
        </div>
      )}

      {isBargain && (
        <div className="mt-3 space-y-2">
          {localBidPending && !r.myBid ? (
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-xl p-3.5 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-indigo-700">Bid Submitted — Waiting for Response</p>
                <p className="text-[10px] text-indigo-500 mt-0.5">Your counter offer is being sent to the customer…</p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 bg-indigo-100 text-indigo-600 rounded-full animate-pulse border border-indigo-200">
                PENDING
              </span>
            </div>
          ) : r.myBid ? (
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-orange-700 flex items-center gap-1">
                    <MessageSquare size={11} /> Your Bid Pending
                  </p>
                  <p className="text-lg font-extrabold text-orange-600">
                    {formatCurrency(r.myBid.fare, currency)}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-1 bg-orange-100 text-orange-600 rounded-full animate-pulse border border-orange-200">
                  WAITING
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={counterInput}
                  onChange={(e) => {
                    setCounterInput(e.target.value);
                    if (counterError) setCounterError("");
                  }}
                  placeholder="Update bid..."
                  className={`flex-1 h-10 px-3 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 ${counterError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-orange-200 focus:border-orange-400 focus:ring-orange-100"}`}
                  aria-label="Update counter fare amount"
                />
                <button
                  onClick={validateAndSubmitCounter}
                  disabled={counterPending || rideExpired || !!isRestricted}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-3.5 py-2 rounded-xl text-sm disabled:opacity-60 transition-colors min-h-[44px]"
                  aria-label="Update counter bid"
                >
                  Update
                </button>
                <button
                  onClick={() => onAccept(r.id)}
                  disabled={rideExpired || acceptPending || anyAcceptPending || !!isRestricted}
                  className="bg-gray-900 hover:bg-gray-800 text-white font-bold px-3.5 py-2 rounded-xl text-sm disabled:opacity-60 flex items-center gap-1 transition-colors min-h-[44px]"
                  aria-label="Accept ride at current fare"
                >
                  <CheckCircle size={13} /> Accept
                </button>
              </div>
              {counterError && (
                <p className="text-xs text-red-500 font-semibold">{counterError}</p>
              )}
            </div>
          ) : showCounterForm ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={counterInput}
                  onChange={(e) => {
                    setCounterInput(e.target.value);
                    if (counterError) setCounterError("");
                  }}
                  placeholder="Your counter fare..."
                  className={`flex-1 h-11 px-4 bg-gray-50 border rounded-xl text-sm focus:outline-none focus:ring-2 ${counterError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-gray-200 focus:border-orange-400 focus:ring-orange-100"}`}
                  aria-label="Enter counter fare amount"
                />
                <button
                  onClick={validateAndSubmitCounter}
                  disabled={counterPending || rideExpired || !!isRestricted}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-extrabold px-4 py-2.5 rounded-xl text-sm disabled:opacity-60 transition-colors min-h-[44px]"
                  aria-label="Submit counter offer"
                >
                  {counterPending ? "..." : "Submit"}
                </button>
                <button
                  onClick={() => {
                    setShowCounterForm(false);
                    setCounterError("");
                  }}
                  className="bg-gray-100 text-gray-400 px-3 py-2.5 rounded-xl flex items-center hover:bg-gray-200 transition-colors min-h-[44px]"
                  aria-label="Cancel counter offer"
                >
                  <X size={15} />
                </button>
              </div>
              {counterError && (
                <p className="text-xs text-red-500 font-semibold px-1">{counterError}</p>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open location in maps"
                className="flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold px-3 py-2.5 rounded-xl hover:bg-blue-100 transition-colors min-h-[44px]"
              >
                <MapPin size={14} />
              </a>
              <button
                onClick={() => onRejectOffer(r.id)}
                disabled={rejectOfferPending}
                className="bg-gray-100 text-gray-400 font-bold px-3 py-2.5 rounded-xl text-sm flex items-center hover:bg-gray-200 transition-colors disabled:opacity-50 min-h-[44px]"
                aria-label="Reject ride offer"
              >
                <X size={16} />
              </button>
              <button
                onClick={() => setShowCounterForm(true)}
                className="flex-1 bg-gradient-to-r from-orange-100 to-amber-100 text-orange-700 font-extrabold py-2.5 rounded-xl text-sm flex items-center justify-center gap-1.5 border border-orange-200 hover:from-orange-200 hover:to-amber-200 transition-all active:scale-[0.98] min-h-[44px]"
                aria-label="Make counter offer"
              >
                <MessageSquare size={14} /> Counter Offer
              </button>
              <button
                onClick={() => onAccept(r.id)}
                disabled={rideExpired || acceptPending || anyAcceptPending || !!isRestricted}
                className="flex-1 bg-gray-900 text-white font-extrabold py-2.5 rounded-xl text-sm disabled:opacity-60 flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all min-h-[44px]"
                aria-label="Accept ride"
              >
                <CheckCircle size={14} />
                Accept
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
