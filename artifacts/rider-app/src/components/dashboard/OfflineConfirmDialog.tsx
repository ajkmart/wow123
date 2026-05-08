interface OfflineConfirmDialogProps {
  totalRequests: number;
  onStayOnline: () => void;
  onGoOffline: () => void;
}

export function OfflineConfirmDialog({
  totalRequests,
  onStayOnline,
  onGoOffline,
}: OfflineConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[1100] bg-black/40 flex items-end justify-center pointer-events-auto animate-[fadeIn_0.15s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm going offline"
    >
      <div className="w-full max-w-sm mx-auto bg-white rounded-t-3xl px-6 py-6 shadow-2xl animate-[slideUp_0.2s_ease-out]">
        <p className="text-base font-extrabold text-gray-900 mb-1.5">Go Offline?</p>
        <p className="text-sm text-gray-500 mb-5">
          You have {totalRequests} request{totalRequests > 1 ? "s" : ""} waiting — go offline
          anyway?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onStayOnline}
            className="flex-1 h-12 border-2 border-gray-200 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            Stay Online
          </button>
          <button
            onClick={onGoOffline}
            className="flex-1 h-12 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-gray-800 transition-colors"
          >
            Go Offline
          </button>
        </div>
      </div>
    </div>
  );
}
