import { useState } from "react";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";

interface Props {
  message: string;
}

export function AnnouncementBar({ message }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  if (!message || dismissed) return null;

  return (
    <div className="bg-orange-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 z-50 relative shadow-sm">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-base flex-shrink-0">📢</span>
        <p className="text-sm font-medium truncate">{message}</p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 text-white/80 hover:text-white text-lg leading-none font-bold transition-colors"
        aria-label={T("dismissAnnouncement")}
      >
        ×
      </button>
    </div>
  );
}
