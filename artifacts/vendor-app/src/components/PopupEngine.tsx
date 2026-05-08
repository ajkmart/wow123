import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../lib/auth";
import { getVendorApiBase } from "../lib/envValidation";
import { SafeImage } from "./ui/SafeImage";

const BASE = getVendorApiBase();

interface Popup {
  id: string;
  title: string;
  body: string | null;
  mediaUrl: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  popupType: "modal" | "bottom_sheet" | "top_banner" | "floating_card";
  displayFrequency: "once" | "daily" | "every_session";
  priority: number;
  colorFrom: string;
  colorTo: string;
  textColor: string;
  animation: string | null;
}

const SEEN_PREFIX = "ajkmart_vendor_popup_seen_";
const SEEN_DATE_PREFIX = "ajkmart_vendor_popup_date_";
const SESSION_KEY = "ajkmart_vendor_popup_session";

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `sess_fallback_${Date.now()}`;
  }
}

const sessionSeenIds = new Set<string>();

function shouldShowPopup(popup: Popup): boolean {
  try {
    const freq = popup.displayFrequency;
    if (freq === "once") {
      return !localStorage.getItem(`${SEEN_PREFIX}${popup.id}`);
    }
    if (freq === "daily") {
      const lastDate = localStorage.getItem(`${SEEN_DATE_PREFIX}${popup.id}`);
      if (!lastDate) return true;
      return lastDate !== new Date().toDateString();
    }
    if (freq === "every_session") {
      return !sessionSeenIds.has(popup.id);
    }
    return true;
  } catch {
    return true;
  }
}

function markPopupSeen(popup: Popup): void {
  try {
    if (popup.displayFrequency === "once") {
      localStorage.setItem(`${SEEN_PREFIX}${popup.id}`, "1");
    } else if (popup.displayFrequency === "daily") {
      localStorage.setItem(`${SEEN_DATE_PREFIX}${popup.id}`, new Date().toDateString());
    } else if (popup.displayFrequency === "every_session") {
      sessionSeenIds.add(popup.id);
    }
  } catch {}
}

async function sendImpression(popupId: string, action: string, token: string | null, sessionId: string): Promise<void> {
  try {
    await fetch(`${BASE}/popups/impression`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ popupId, action, sessionId }),
    });
  } catch {}
}

function getAnimationClass(animation: string | null, type: string): string {
  if (type === "top_banner") return "animate-slide-down";
  if (type === "bottom_sheet") return "animate-slide-up";
  if (animation === "scale" || animation === "bounce") return "animate-scale-in";
  return "animate-fade-in";
}

export function PopupEngine() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const [queue, setQueue] = useState<Popup[]>([]);
  const [current, setCurrent] = useState<Popup | null>(null);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const sessionId = useRef(getOrCreateSessionId());
  const loadedRef = useRef(false);
  const queueRef = useRef<Popup[]>([]);
  const idxRef = useRef(0);
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentIdRef = useRef<string | null>(null);

  const dismissCurrentRef = useRef<(action?: "dismiss" | "click") => void>(() => {});

  const showAt = useCallback((q: Popup[], idx: number) => {
    if (idx >= q.length) return;
    idxRef.current = idx;
    const popup = q[idx]!;
    currentIdRef.current = popup.id;
    setCurrent(popup);
    setVisible(true);
    setLeaving(false);
    sendImpression(popup.id, "view", token, sessionId.current);
    markPopupSeen(popup);

    if (popup.popupType === "top_banner") {
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
      const popupId = popup.id;
      autoDismissTimer.current = setTimeout(() => {
        autoDismissTimer.current = null;
        if (currentIdRef.current === popupId) {
          dismissCurrentRef.current("dismiss");
        }
      }, 4000);
    }
  }, [token]);

  const dismissCurrent = useCallback((action: "dismiss" | "click" = "dismiss") => {
    if (!current) return;
    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = null;
    }
    sendImpression(current.id, action, token, sessionId.current);
    setLeaving(true);
    setTimeout(() => {
      setVisible(false);
      setCurrent(null);
      currentIdRef.current = null;
      setLeaving(false);
      const nextIdx = idxRef.current + 1;
      if (nextIdx < queueRef.current.length) {
        setTimeout(() => showAt(queueRef.current, nextIdx), 300);
      }
    }, 220);
  }, [current, token, showAt]);

  useEffect(() => {
    dismissCurrentRef.current = dismissCurrent;
  }, [dismissCurrent]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const url = `${BASE}/popups/active?sessionId=${sessionId.current}`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        const popups: Popup[] = data?.data?.popups ?? data?.popups ?? [];
        const eligible = popups.filter(p => shouldShowPopup(p));
        if (eligible.length > 0) {
          queueRef.current = eligible;
          setQueue(eligible);
          showAt(eligible, 0);
        }
      } catch {}
    })();
    return () => {
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
    };
  }, [showAt]);

  const handleCta = useCallback(() => {
    if (!current) return;
    const link = current.ctaLink;
    dismissCurrent("click");
    if (link) {
      if (link.startsWith("http")) {
        window.open(link, "_blank", "noreferrer");
      } else {
        setLocation(link);
      }
    }
  }, [current, dismissCurrent, setLocation]);

  if (!current || !visible) return null;

  const g = `linear-gradient(135deg, ${current.colorFrom || "#7C3AED"}, ${current.colorTo || "#4F46E5"})`;
  const tc = current.textColor || "#ffffff";
  const animClass = leaving ? "animate-fade-out" : getAnimationClass(current.animation, current.popupType);

  if (current.popupType === "top_banner") {
    return (
      <div
        className={`fixed top-0 left-0 right-0 z-[9999] ${animClass}`}
        style={{ background: g }}
      >
        <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
          <p className="flex-1 text-sm font-bold truncate" style={{ color: tc }}>{current.title}</p>
          {current.ctaText && (
            <button
              onClick={handleCta}
              className="px-3 py-1 rounded-full text-xs font-bold bg-white/20 hover:bg-white/30 transition-colors flex-shrink-0"
              style={{ color: tc }}
            >
              {current.ctaText}
            </button>
          )}
          <button
            onClick={() => dismissCurrent()}
            className="flex-shrink-0 text-xl font-bold opacity-80 hover:opacity-100 transition-opacity"
            style={{ color: tc }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  if (current.popupType === "bottom_sheet") {
    return (
      <div className="fixed inset-0 z-[9998] flex flex-col justify-end">
        <div
          className={`absolute inset-0 bg-black/50 ${leaving ? "animate-fade-out" : "animate-fade-in"}`}
          onClick={() => dismissCurrent()}
        />
        <div
          className={`relative rounded-t-3xl overflow-hidden ${animClass}`}
          style={{ background: g }}
        >
          <div className="w-9 h-1 bg-white/30 rounded-full mx-auto mt-3 mb-1" />
          <div className="px-6 pb-10 pt-4">
            {current.mediaUrl && (
              <SafeImage src={current.mediaUrl} alt="" className="w-full h-40 object-cover rounded-2xl mb-4" />
            )}
            <p className="text-xl font-extrabold mb-2" style={{ color: tc }}>{current.title}</p>
            {current.body && <p className="text-sm opacity-85 mb-4" style={{ color: tc }}>{current.body}</p>}
            <div className="flex gap-3">
              {current.ctaText && (
                <button
                  onClick={handleCta}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold bg-white/20 hover:bg-white/30 border border-white/30 transition-colors"
                  style={{ color: tc }}
                >
                  {current.ctaText}
                </button>
              )}
              <button
                onClick={() => dismissCurrent()}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold opacity-60 hover:opacity-80 transition-opacity"
                style={{ color: tc }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (current.popupType === "floating_card") {
    return (
      <div className="fixed inset-0 z-[9998] flex items-center justify-center p-6">
        <div
          className={`absolute inset-0 bg-black/50 ${leaving ? "animate-fade-out" : "animate-fade-in"}`}
          onClick={() => dismissCurrent()}
        />
        <div
          className={`relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl ${animClass}`}
          style={{ background: g }}
        >
          {current.mediaUrl && (
            <SafeImage src={current.mediaUrl} alt="" className="w-full h-36 object-cover" />
          )}
          <button
            onClick={() => dismissCurrent()}
            className="absolute top-3 right-3 w-8 h-8 bg-black/25 rounded-full text-xl font-bold flex items-center justify-center hover:bg-black/40 transition-colors"
            style={{ color: tc }}
          >
            ×
          </button>
          <div className="p-6">
            <p className="text-xl font-extrabold mb-2" style={{ color: tc }}>{current.title}</p>
            {current.body && <p className="text-sm opacity-85 mb-4" style={{ color: tc }}>{current.body}</p>}
            {current.ctaText && (
              <button
                onClick={handleCta}
                className="w-full py-3 rounded-2xl text-sm font-bold bg-white/20 hover:bg-white/30 border border-white/30 transition-colors"
                style={{ color: tc }}
              >
                {current.ctaText}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-[9998] ${animClass}`} style={{ background: g }}>
      {current.mediaUrl && (
        <SafeImage src={current.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
      )}
      <button
        onClick={() => dismissCurrent()}
        className="absolute top-6 right-6 w-10 h-10 bg-black/20 rounded-full text-2xl font-bold flex items-center justify-center hover:bg-black/30 transition-colors"
        style={{ color: tc }}
      >
        ×
      </button>
      <div className="relative flex flex-col items-center justify-center h-full px-8 text-center">
        <p className="text-3xl font-black mb-4 leading-tight" style={{ color: tc }}>{current.title}</p>
        {current.body && <p className="text-base opacity-85 mb-8 max-w-xs leading-relaxed" style={{ color: tc }}>{current.body}</p>}
        {current.ctaText && (
          <button
            onClick={handleCta}
            className="px-8 py-4 rounded-2xl font-bold text-base bg-white/20 hover:bg-white/30 border border-white/30 transition-colors"
            style={{ color: tc }}
          >
            {current.ctaText}
          </button>
        )}
        <button
          onClick={() => dismissCurrent()}
          className="mt-4 text-sm font-medium opacity-60 hover:opacity-80 transition-opacity"
          style={{ color: tc }}
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}
