import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { VendorNewOrderEvent } from "../lib/socket";

interface Props {
  order: VendorNewOrderEvent | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 12_000;

export function NewOrderBanner({ order, onDismiss }: Props) {
  const [, navigate] = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!order) { setVisible(false); return; }
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300);
    }, AUTO_DISMISS_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [order]);

  if (!order) return null;

  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const total = typeof order.total === "number" ? order.total.toFixed(0) : "—";
  const orderType = order.type ?? "mart";

  function handleView() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(() => {
      onDismiss();
      navigate("/orders");
    }, 200);
  }

  function handleDismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    setTimeout(onDismiss, 300);
  }

  return (
    <div
      className={`fixed top-0 inset-x-0 z-[9999] transition-transform duration-300 ${visible ? "translate-y-0" : "-translate-y-full"}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="mx-auto max-w-lg m-2">
        <div className="bg-white rounded-2xl shadow-2xl border border-orange-100 overflow-hidden">
          <div className="bg-gradient-to-r from-orange-500 to-orange-400 px-4 py-2 flex items-center gap-2">
            <span className="text-white text-lg">🛍️</span>
            <span className="text-white font-extrabold text-sm tracking-wide uppercase">New Order Arrived!</span>
            <span className="ml-auto text-orange-100 text-xs font-medium capitalize">{orderType}</span>
          </div>
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 font-bold text-sm truncate">
                {itemCount > 0 ? `${itemCount} item${itemCount > 1 ? "s" : ""}` : "Order placed"}
                {" · "}
                <span className="text-orange-600">Rs {total}</span>
              </p>
              {order.paymentMethod && (
                <p className="text-gray-400 text-xs mt-0.5 capitalize">
                  Payment: {String(order.paymentMethod).replace(/_/g, " ")}
                </p>
              )}
            </div>
            <button
              onClick={handleView}
              className="shrink-0 h-9 px-4 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold rounded-xl text-sm transition-all"
            >
              View
            </button>
            <button
              onClick={handleDismiss}
              className="shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          <div className="h-1 bg-orange-100">
            <div
              className="h-full bg-orange-400 origin-left"
              style={{ animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards` }}
            />
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }
      `}</style>
    </div>
  );
}
