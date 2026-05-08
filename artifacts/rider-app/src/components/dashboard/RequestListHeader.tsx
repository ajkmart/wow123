import type { TranslationKey } from "@workspace/i18n";
import { Zap, Radio } from "lucide-react";

interface RequestListHeaderProps {
  totalRequests: number;
  T: (key: TranslationKey) => string;
}

export function RequestListHeader({ totalRequests, T }: RequestListHeaderProps) {
  return (
    <div
      className={`px-4 py-3.5 flex items-center justify-between ${totalRequests > 0 ? "bg-gradient-to-r from-orange-500 via-orange-500 to-amber-500" : "bg-gray-900"}`}
    >
      <div className="flex items-center gap-2.5">
        {totalRequests > 0 ? (
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
        ) : (
          <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center">
            <Radio size={14} className="text-white/70" />
          </div>
        )}
        <div>
          <p className="font-extrabold text-white text-sm tracking-tight">
            {totalRequests > 0
              ? `${totalRequests} Request${totalRequests > 1 ? "s" : ""} Available`
              : T("listeningForRequests")}
          </p>
          {totalRequests > 0 && (
            <p className="text-white/60 text-[10px] font-medium">Tap to accept</p>
          )}
        </div>
      </div>
      {totalRequests > 0 && (
        <span className="text-white/90 text-[10px] font-extrabold bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full tracking-widest flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          LIVE
        </span>
      )}
    </div>
  );
}
