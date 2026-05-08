import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";

interface Props {
  message: string;
  appName?: string;
}

export function MaintenanceScreen({ message, appName = "AJKMart" }: Props) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex items-center justify-center z-[9999] p-6 overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-72 h-72 rounded-full bg-white/[0.02]" />
      <div className="absolute bottom-[-15%] left-[-10%] w-64 h-64 rounded-full bg-green-500/[0.04]" />
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center relative z-10">
        <div className="text-6xl mb-4">🔧</div>
        <h1 className="text-2xl font-extrabold text-gray-900 mb-2">{appName} {T("maintenanceTitle")}</h1>
        <div className="w-16 h-1 bg-gray-900 rounded-full mx-auto mb-4" />
        <p className="text-gray-600 text-sm leading-relaxed mb-6">
          {message || T("maintenanceDefaultMsg")}
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 text-xs text-gray-700 font-medium">
          ⏱ {T("maintenanceBack")}
        </div>
        <p className="text-xs text-gray-400 mt-4">{T("riderPortal")} · {appName}</p>
      </div>
    </div>
  );
}
