import type { TranslationKey } from "@workspace/i18n";
import { Link } from "wouter";
import {
  AlertTriangle,
  MapPin,
  WifiOff,
  X,
  Ban,
  Pin,
  ArrowUpRight,
  XCircle,
  SkipForward,
  Volume2,
} from "lucide-react";

/* ── Banner height constants — keep in sync with the CSS values below ──────
   Each banner is ~28 px tall (py-1.5 + text-xs = ~28 px). We stack them
   vertically so they never overlap each other or the page header.          */
const BANNER_H = 28; /* px — height of each top fixed banner               */

interface FixedBannersProps {
  socketConnected: boolean;
  effectiveOnline: boolean;
  zoneWarning: string | null;
  onDismissZone: () => void;
  wakeLockWarning: boolean;
  onDismissWakeLock: () => void;
  audioLocked: boolean;
  onUnlockAudio: () => void;
  T: (key: TranslationKey) => string;
}

export function FixedBanners({
  socketConnected,
  effectiveOnline,
  zoneWarning,
  onDismissZone,
  wakeLockWarning,
  onDismissWakeLock,
  audioLocked,
  onUnlockAudio,
  T,
}: FixedBannersProps) {
  /* Build the ordered list of active top banners so we can stack them
     without overlap — each one is offset by the cumulative height of those
     above it. */
  const showConnection = !socketConnected && effectiveOnline;
  const showZone       = !!zoneWarning && effectiveOnline;
  const showAudio      = audioLocked && effectiveOnline;

  /* Safe-area base padding */
  const safeTop = "env(safe-area-inset-top, 0px)";

  /* Stack positions (top offset for each banner) */
  let bannerIdx = 0;
  const connectionTop = showConnection ? bannerIdx++ : -1;
  const zoneTop       = showZone       ? bannerIdx++ : -1;
  const audioTop      = showAudio      ? bannerIdx++ : -1;

  /* Number of top banners currently visible — used to position the bottom WakeLock toast */
  const totalTopBanners = bannerIdx;

  return (
    <>
      {/* ── Connection lost banner ── */}
      {showConnection && (
        <div
          className="fixed left-0 right-0 z-[50] bg-red-600 text-white text-xs font-bold text-center flex items-center justify-center gap-1.5 shadow-lg animate-pulse"
          style={{
            top: `calc(${safeTop} + ${connectionTop * BANNER_H}px)`,
            height: BANNER_H,
          }}
          role="alert"
          aria-live="assertive"
        >
          <WifiOff size={13} /> {T("connectionLost")}
        </div>
      )}

      {/* ── Zone warning banner ── */}
      {showZone && (
        <div
          className="fixed left-0 right-0 z-[49] bg-amber-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg px-3"
          style={{
            top: `calc(${safeTop} + ${zoneTop * BANNER_H}px)`,
            height: BANNER_H,
          }}
          role="alert"
          aria-live="polite"
        >
          <MapPin size={13} className="flex-shrink-0" />
          <span className="truncate">{zoneWarning}</span>
          <button
            onClick={onDismissZone}
            className="ml-1 bg-white/20 rounded-full p-0.5 flex-shrink-0"
            aria-label="Dismiss zone warning"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── Audio locked banner ── */}
      {showAudio && (
        <button
          onClick={onUnlockAudio}
          onTouchEnd={(e) => { e.preventDefault(); onUnlockAudio(); }}
          onPointerUp={onUnlockAudio}
          className="fixed left-0 right-0 z-[48] bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg px-3 w-full"
          style={{
            top: `calc(${safeTop} + ${audioTop * BANNER_H}px)`,
            height: BANNER_H,
          }}
          aria-label="Tap to enable ride alert sounds"
        >
          <Volume2 size={13} className="flex-shrink-0 animate-pulse" />
          Tap to enable ride sounds
        </button>
      )}

      {/* ── WakeLock toast (bottom, above nav) ── */}
      {wakeLockWarning && effectiveOnline && (
        <div
          className="fixed left-4 right-4 z-[1050] bg-amber-600 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2.5 animate-[slideUp_0.3s_ease-out]"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
          role="alert"
        >
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span className="flex-1">
            Screen may sleep — keep app open for uninterrupted deliveries.
          </span>
          <button
            onClick={onDismissWakeLock}
            className="bg-white/20 rounded-full p-0.5 flex-shrink-0"
            aria-label="Dismiss wake lock warning"
          >
            <X size={11} />
          </button>
        </div>
      )}
    </>
  );
}

interface InlineWarningsProps {
  gpsWarning: string | null;
  onDismissGps: () => void;
  isRestricted: boolean;
  riderNotice: string;
  riderNoticeDismissed: boolean;
  onDismissRiderNotice: () => void;
  cancelStatsData: any;
  ignoreStatsData: any;
  currency: string;
  minBalance: number;
  walletBalance: number;
}

export function InlineWarnings({
  gpsWarning,
  onDismissGps,
  isRestricted,
  riderNotice,
  riderNoticeDismissed,
  onDismissRiderNotice,
  cancelStatsData,
  ignoreStatsData,
  currency,
  minBalance,
  walletBalance,
}: InlineWarningsProps) {
  return (
    <>
      {gpsWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl px-4 py-3 flex items-start gap-3 shadow-sm animate-[slideUp_0.2s_ease-out]">
          <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <p className="text-xs font-bold text-amber-700 flex-1 leading-relaxed pt-1">
            {gpsWarning}
          </p>
          <button
            onClick={onDismissGps}
            className="text-amber-400 hover:text-amber-600 p-1 rounded-lg hover:bg-amber-100 transition-colors"
            aria-label="Dismiss GPS warning"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {isRestricted && (
        <div className="bg-red-50 border-2 border-red-300 rounded-3xl px-4 py-3.5 flex items-start gap-3 shadow-sm animate-[slideUp_0.2s_ease-out]">
          <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Ban size={18} className="text-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-red-800">Account Restricted</p>
            <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
              Your account has been restricted due to excessive cancellations or ignores. You
              cannot accept new rides. Contact support to resolve.
            </p>
          </div>
        </div>
      )}

      {riderNotice && !riderNoticeDismissed && (
        <div className="bg-blue-50 border border-blue-200 rounded-3xl px-4 py-3 flex items-start gap-3 shadow-sm">
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Pin size={14} className="text-blue-500" />
          </div>
          <p className="text-sm text-blue-700 font-medium leading-relaxed flex-1 pt-0.5">
            {riderNotice}
          </p>
          <button
            onClick={onDismissRiderNotice}
            className="text-blue-400 hover:text-blue-600 flex-shrink-0 mt-0.5"
            aria-label="Dismiss rider notice"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {cancelStatsData &&
        cancelStatsData.dailyCancels > 0 &&
        (() => {
          const atRisk = cancelStatsData.remaining <= 1;
          const cancelRate: number | null = cancelStatsData.cancelRate ?? null;
          return (
            <div
              className={`rounded-3xl px-4 py-3.5 shadow-sm border ${atRisk ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${atRisk ? "bg-red-100" : "bg-amber-100"}`}
                >
                  <XCircle size={18} className={atRisk ? "text-red-500" : "text-amber-500"} />
                </div>
                <div className="flex-1">
                  <p
                    className={`text-xs font-extrabold ${atRisk ? "text-red-800" : "text-amber-800"}`}
                  >
                    {cancelStatsData.dailyCancels} cancellation
                    {cancelStatsData.dailyCancels !== 1 ? "s" : ""} today
                    {cancelStatsData.remaining === 0
                      ? " — Limit Reached!"
                      : cancelStatsData.remaining === 1
                        ? " — 1 left before penalty!"
                        : ""}
                  </p>
                  {cancelStatsData.dailyLimit != null && (
                    <p className="text-[10px] text-amber-600 mt-0.5 font-medium">
                      Limit: {cancelStatsData.dailyLimit}/day · {cancelStatsData.remaining}{" "}
                      remaining
                      {cancelStatsData.penaltyAmount > 0 &&
                        ` · ${currency} ${Math.round(cancelStatsData.penaltyAmount)} penalty per excess`}
                    </p>
                  )}
                </div>
              </div>
              {cancelRate != null && (
                <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-white/70 rounded-xl px-2.5 py-1.5 border border-amber-200/60">
                    <span className="text-[10px] text-gray-500 font-semibold">Cancel rate</span>
                    <span
                      className={`text-[10px] font-extrabold ${cancelRate > 20 ? "text-red-600" : "text-amber-700"}`}
                    >
                      {Math.round(cancelRate)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {ignoreStatsData &&
        ignoreStatsData.dailyIgnores > 0 &&
        (() => {
          const atRisk = ignoreStatsData.remaining <= 1;
          return (
            <div
              className={`rounded-3xl px-4 py-3.5 shadow-sm border ${atRisk ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${atRisk ? "bg-red-100" : "bg-amber-100"}`}
                >
                  <SkipForward size={18} className={atRisk ? "text-red-500" : "text-amber-500"} />
                </div>
                <div className="flex-1">
                  <p
                    className={`text-xs font-extrabold ${atRisk ? "text-red-800" : "text-amber-800"}`}
                  >
                    {ignoreStatsData.dailyIgnores} request
                    {ignoreStatsData.dailyIgnores !== 1 ? "s" : ""} ignored today
                    {ignoreStatsData.remaining === 0
                      ? " — Limit Reached!"
                      : ignoreStatsData.remaining === 1
                        ? " — 1 left before penalty!"
                        : ""}
                  </p>
                  {ignoreStatsData.dailyLimit != null && (
                    <p className="text-[10px] text-amber-600 mt-0.5 font-medium">
                      Limit: {ignoreStatsData.dailyLimit}/day · {ignoreStatsData.remaining}{" "}
                      remaining
                      {ignoreStatsData.penaltyAmount > 0 &&
                        ` · ${currency} ${Math.round(ignoreStatsData.penaltyAmount)} penalty per excess`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {(() => {
        if (minBalance <= 0 || walletBalance >= minBalance) return null;
        const shortfall = minBalance - walletBalance;
        return (
          <Link href="/wallet">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-3xl px-4 py-3.5 flex items-start gap-3 cursor-pointer active:scale-[0.98] transition-transform shadow-sm">
              <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-extrabold text-amber-800">Low Wallet Balance</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                  Minimum{" "}
                  <strong>
                    {currency} {Math.round(minBalance)}
                  </strong>{" "}
                  required for cash orders. Your balance:{" "}
                  <strong>
                    {currency} {Math.round(walletBalance)}
                  </strong>
                  .
                  {shortfall > 0 && (
                    <>
                      {" "}
                      Need {currency} {Math.round(shortfall)} more.
                    </>
                  )}
                </p>
                <p className="text-[10px] text-amber-600 mt-1.5 font-bold flex items-center gap-1">
                  Tap to deposit <ArrowUpRight size={10} />
                </p>
              </div>
            </div>
          </Link>
        );
      })()}
    </>
  );
}
