import type { TranslationKey } from "@workspace/i18n";
import { Zap, Wifi, VolumeX, Volume2 } from "lucide-react";

interface OnlineToggleCardProps {
  effectiveOnline: boolean;
  toggling: boolean;
  silenceOn: boolean;
  onToggleOnline: () => void;
  onToggleSilence: () => void;
  T: (key: TranslationKey) => string;
}

export function OnlineToggleCard({
  effectiveOnline,
  toggling,
  silenceOn,
  onToggleOnline,
  onToggleSilence,
  T,
}: OnlineToggleCardProps) {
  return (
    <div
      className={`rounded-2xl p-4 transition-all duration-300 border backdrop-blur-sm ${effectiveOnline ? "bg-white/[0.08] border-green-500/20" : "bg-white/[0.04] border-white/[0.06]"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${effectiveOnline ? "bg-green-500/15" : "bg-white/[0.06]"}`}
          >
            {effectiveOnline ? (
              <Zap size={22} className="text-green-400" />
            ) : (
              <Wifi size={22} className="text-white/40" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${effectiveOnline ? "bg-green-400 animate-pulse shadow-lg shadow-green-400/50" : "bg-gray-500"}`}
              />
              <p className="font-extrabold text-lg tracking-tight">
                {effectiveOnline ? T("online") : T("offline")}
              </p>
            </div>
            <p className="text-white/40 text-xs mt-0.5">
              {effectiveOnline ? T("acceptingOrders") : T("tapToStart")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSilence}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${silenceOn ? "bg-red-500/20 text-red-400 border border-red-500/20" : "bg-white/10 text-white/40 border border-white/10"}`}
            aria-label={silenceOn ? "Unmute notification sounds" : "Mute notification sounds"}
          >
            {silenceOn ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span className="text-[10px] font-bold leading-none">
              {silenceOn ? "Sound Off" : "Sound"}
            </span>
          </button>
          <button
            onClick={onToggleOnline}
            disabled={toggling}
            className={`w-[56px] h-[30px] rounded-full relative transition-all duration-300 shadow-inner ${effectiveOnline ? "bg-green-500 shadow-green-500/30" : "bg-white/20"} ${toggling ? "opacity-50 scale-95" : "active:scale-95"}`}
            role="switch"
            aria-checked={effectiveOnline}
            aria-label={effectiveOnline ? "Go offline" : "Go online"}
          >
            <div
              className={`w-[24px] h-[24px] bg-white rounded-full absolute top-[3px] shadow-md transition-all duration-300 ${effectiveOnline ? "left-[29px]" : "left-[3px]"}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
