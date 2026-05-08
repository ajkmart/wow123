import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Alert } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useCurrency } from "@/context/PlatformConfigContext";
import { unwrapApiResponse } from "../utils/api";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  type: "mart" | "food" | "pharmacy";
}

export interface CartValidationResult {
  valid: boolean;
  cartChanged: boolean;
}

export interface AckSuccessData {
  id: string;
  time: string;
  payMethod?: string;
}

interface CartContextType {
  items: CartItem[];
  itemCount: number;
  total: number;
  cartType: "mart" | "food" | "pharmacy" | "mixed" | "none";
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  clearCart: () => void;
  clearCartAndAdd: (item: CartItem) => void;
  clearCartOnAck: () => void;
  restoreCart: (snapshot: CartItem[]) => void;
  validateCart: () => Promise<CartValidationResult>;
  isValidating: boolean;
  pendingAck: boolean;
  setPendingAck: (v: boolean) => void;
  ackStuck: boolean;
  orderSuccess: AckSuccessData | null;
  clearOrderSuccess: () => void;
  setPendingOrderId: (id: string | null, data?: AckSuccessData | null) => void;
  startAckStuckTimer: (delayMs: number) => void;
  cancelAckStuckTimer: () => void;
  dismissAck: () => void;
  setPharmacyPendingOrderId: (id: string | null) => void;
}

const CartContext = createContext<CartContextType | null>(null);

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

/* ── Cart snapshot helpers ──────────────────────────────────────────────────
   All three functions are fire-and-forget: they never throw and never affect
   the local cart state. Token is passed explicitly so we don't close over a
   potentially-stale ref inside useEffect. */

async function saveCartSnapshot(items: CartItem[], token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/cart/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items }),
    });
  } catch {
    /* silently swallowed — local cart is source of truth */
  }
}

async function fetchCartSnapshot(token: string): Promise<CartItem[] | null> {
  try {
    const res = await fetch(`${API_BASE}/cart/snapshot`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = unwrapApiResponse<{ items?: CartItem[] }>(await res.json());
    return Array.isArray(data.items) && data.items.length > 0 ? data.items : null;
  } catch {
    return null;
  }
}

async function clearCartSnapshot(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/cart/snapshot`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* silently swallowed */
  }
}

/* ── Debounce helper ── */
function makeDebounced<T extends unknown[]>(fn: (...args: T) => void, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, delay);
  };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return { debounced, cancel };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { token, socket } = useAuth();
  const { symbol: currencySymbol } = useCurrency();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [pendingAck, setPendingAck] = useState(false);
  const [ackStuck, setAckStuck] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<AckSuccessData | null>(null);
  const authTokenRef = useRef<string | null | undefined>(token);
  const pharmacyPendingOrderIdRef = useRef<string | null>(null);
  const pendingOrderIdRef = useRef<string | null>(null);
  const pendingOrderDataRef = useRef<AckSuccessData | null>(null);
  const ackStuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackFallbackIvRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ackResolvedRef = useRef(false);
  /* Generation counter — incremented on every local cart mutation so that a
     stale cart-validation response arriving after the user modified the cart
     is discarded rather than silently overwriting the user's changes. */
  const cartGenRef = useRef(0);

  /* Debounced server snapshot save (800 ms) with cancel support. */
  const debouncedSaveRef = useRef<((...args: [CartItem[], string]) => void) | null>(null);
  const cancelDebouncedSaveRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const { debounced, cancel } = makeDebounced(
      (cartItems: CartItem[], tkn: string) => { saveCartSnapshot(cartItems, tkn); },
      800,
    );
    debouncedSaveRef.current = debounced;
    cancelDebouncedSaveRef.current = cancel;
    return () => { cancel(); };
  }, []);

  /* Stable ref so the token-change effect can read hasLoaded without
     adding it to the dependency array (avoids prevTokenRef drift). */
  const hasLoadedRef = useRef(false);
  useEffect(() => { hasLoadedRef.current = hasLoaded; }, [hasLoaded]);

  useEffect(() => {
    authTokenRef.current = token;
  }, [token]);

  const save = (updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    cartGenRef.current += 1;
    if (typeof updater === "function") {
      setItems(prev => {
        const newItems = updater(prev);
        AsyncStorage.setItem("@ajkmart_cart", JSON.stringify(newItems));
        /* Debounced server sync — only when logged in */
        if (authTokenRef.current && debouncedSaveRef.current) {
          debouncedSaveRef.current(newItems, authTokenRef.current);
        }
        return newItems;
      });
    } else {
      setItems(updater);
      AsyncStorage.setItem("@ajkmart_cart", JSON.stringify(updater));
      if (authTokenRef.current && debouncedSaveRef.current) {
        debouncedSaveRef.current(updater, authTokenRef.current);
      }
    }
  };

  const resetAckState = useCallback(() => {
    if (ackStuckTimerRef.current) { clearTimeout(ackStuckTimerRef.current); ackStuckTimerRef.current = null; }
    if (ackFallbackTimerRef.current) { clearTimeout(ackFallbackTimerRef.current); ackFallbackTimerRef.current = null; }
    if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
    pendingOrderIdRef.current = null;
    pendingOrderDataRef.current = null;
    setPendingAck(false);
    setAckStuck(false);
  }, []);

  const clearCartOnAck = useCallback(() => {
    setPendingAck(false);
    setItems([]);
    AsyncStorage.removeItem("@ajkmart_cart");
    /* Clear server snapshot when order is acknowledged */
    if (authTokenRef.current) {
      clearCartSnapshot(authTokenRef.current);
    }
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleAck = (payload: { orderId?: string; id?: string }) => {
      const ackId = payload?.orderId ?? payload?.id;
      const pending = pendingOrderIdRef.current;
      if (!pending) return;
      if (!ackId) return;
      if (ackId !== pending) return;
      if (ackStuckTimerRef.current) { clearTimeout(ackStuckTimerRef.current); ackStuckTimerRef.current = null; }
      const data = pendingOrderDataRef.current;
      pendingOrderIdRef.current = null;
      pendingOrderDataRef.current = null;
      setAckStuck(false);
      clearCartOnAck();
      if (data) setOrderSuccess(data);
    };
    socket.on("order:ack", handleAck);
    socket.on("order:confirmed", handleAck);
    return () => {
      socket.off("order:ack", handleAck);
      socket.off("order:confirmed", handleAck);
    };
  }, [socket, clearCartOnAck]);

  useEffect(() => {
    if (!socket) return;
    const handlePharmacyAck = (payload: { orderId?: string; id?: string }) => {
      const ackId = payload?.orderId ?? payload?.id;
      const pending = pharmacyPendingOrderIdRef.current;
      if (!pending) return;
      if (!ackId) return;
      if (ackId !== pending) return;
      pharmacyPendingOrderIdRef.current = null;
      setItems(current => {
        const remaining = current.filter(i => i.type !== "pharmacy");
        AsyncStorage.setItem("@ajkmart_cart", JSON.stringify(remaining));
        /* Sync the updated cart (pharmacy items removed) to server */
        if (authTokenRef.current) {
          saveCartSnapshot(remaining, authTokenRef.current);
        }
        return remaining;
      });
    };
    socket.on("order:ack", handlePharmacyAck);
    socket.on("order:confirmed", handlePharmacyAck);
    return () => {
      socket.off("order:ack", handlePharmacyAck);
      socket.off("order:confirmed", handlePharmacyAck);
    };
  }, [socket]);

  /* ── Load local cart from AsyncStorage on mount ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      AsyncStorage.getItem("@ajkmart_cart").then(stored => {
        if (!stored) { setHasLoaded(true); return; }
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setItems(parsed);
        } catch (parseErr) {
          if (__DEV__) console.warn("[Cart] Failed to parse stored cart — clearing:", parseErr instanceof Error ? parseErr.message : String(parseErr));
          AsyncStorage.removeItem("@ajkmart_cart");
        }
        setHasLoaded(true);
      });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  /* ── Server snapshot restore / merge when user logs in or on boot ── */
  const prevTokenRef = useRef<string | null | undefined>(token);
  const snapshotRestoredRef = useRef(false);

  useEffect(() => {
    const prevToken = prevTokenRef.current;
    prevTokenRef.current = token;

    if (prevToken && !token) {
      /* Logout — cancel any pending debounced save, clear local cart */
      if (cancelDebouncedSaveRef.current) cancelDebouncedSaveRef.current();
      resetAckState();
      snapshotRestoredRef.current = false;
      setItems([]);
      AsyncStorage.removeItem("@ajkmart_cart");
      return;
    }

    if (token && !prevToken && !snapshotRestoredRef.current) {
      /* Fresh login — if local storage hasn't finished hydrating yet,
         defer to the boot-restore effect (which has hasLoaded in its deps).
         snapshotRestoredRef stays false so the boot restore fires. */
      if (!hasLoadedRef.current) return;

      /* Server-wins union merge:
         1. Start with all server items (server is authoritative)
         2. Append any local items not already present in the server cart (by productId)
         3. Push the merged result back to server */
      snapshotRestoredRef.current = true;
      fetchCartSnapshot(token).then(serverItems => {
        setItems(localItems => {
          const base = serverItems ?? [];
          const serverIds = new Set(base.map(i => i.productId));
          const newLocalOnly = localItems.filter(i => !serverIds.has(i.productId));
          const merged = [...base, ...newLocalOnly];
          if (merged.length > 0) {
            AsyncStorage.setItem("@ajkmart_cart", JSON.stringify(merged));
            saveCartSnapshot(merged, token);
          }
          return merged;
        });
      });
    }
  }, [token]);

  /* ── On initial app boot with a pre-existing session, restore once ── */
  useEffect(() => {
    if (!hasLoaded || snapshotRestoredRef.current) return;
    if (!token) return;
    /* Server-wins union merge on boot (same rules as login path):
       1. Server items are authoritative base
       2. Append local-only items not already in server cart (by productId)
       3. Push merged result back to server */
    snapshotRestoredRef.current = true;
    fetchCartSnapshot(token).then(serverItems => {
      setItems(localItems => {
        const base = serverItems ?? [];
        const serverIds = new Set(base.map(i => i.productId));
        const newLocalOnly = localItems.filter(i => !serverIds.has(i.productId));
        const merged = [...base, ...newLocalOnly];
        if (merged.length > 0) {
          AsyncStorage.setItem("@ajkmart_cart", JSON.stringify(merged));
          saveCartSnapshot(merged, token);
        }
        return merged;
      });
    });
  }, [hasLoaded, token]);

  useEffect(() => {
    if (hasLoaded && items.length > 0) {
      validateCartItems(items);
    }
  }, [hasLoaded, token]);

  const validateCartItems = async (cartItems: CartItem[]): Promise<CartValidationResult> => {
    if (cartItems.length === 0) return { valid: true, cartChanged: false };
    setIsValidating(true);
    /* Snapshot the generation counter before the async fetch so we can detect
       if the user mutated the cart while validation was in-flight. */
    const genAtStart = cartGenRef.current;
    try {
      let storedToken = authTokenRef.current;
      if (!storedToken) {
        try {
          const SS = await import("expo-secure-store");
          storedToken = await SS.getItemAsync("ajkmart_token");
        } catch (ssErr) {
          if (__DEV__) console.warn("[Cart] SecureStore token read failed:", ssErr instanceof Error ? ssErr.message : String(ssErr));
        }
      }
      if (!storedToken) storedToken = await AsyncStorage.getItem("@ajkmart_token");
      const res = await fetch(`${API_BASE}/orders/validate-cart`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
        },
        body: JSON.stringify({ items: cartItems }),
      });
      if (!res.ok) {
        setIsValidating(false);
        return { valid: false, cartChanged: false };
      }
      const data = unwrapApiResponse<{ valid?: boolean; items?: unknown[]; removed?: string[]; priceChanges?: Array<{ name: string; oldPrice: number; newPrice: number }> }>(await res.json());
      /* Discard stale response — user modified the cart while this request was in-flight */
      if (cartGenRef.current !== genAtStart) {
        setIsValidating(false);
        return { valid: false, cartChanged: false };
      }
      if (!data.valid) {
        let cartChanged = false;
        if (Array.isArray(data.items)) {
          save(data.items as Parameters<typeof save>[0]);
          cartChanged = true;
        }
        const messages: string[] = [];
        if ((data.removed?.length ?? 0) > 0) {
          messages.push(`Removed (unavailable): ${data.removed!.join(", ")}`);
        }
        if ((data.priceChanges?.length ?? 0) > 0) {
          const changes = data.priceChanges!.map((c) => `${c.name}: ${currencySymbol}${c.oldPrice} → ${currencySymbol}${c.newPrice}`).join("\n");
          messages.push(`Prices updated:\n${changes}`);
        }
        if (messages.length > 0) {
          await new Promise<void>(resolve => {
            Alert.alert("Cart Updated", messages.join("\n\n") + "\n\nPlease review your cart before placing the order.", [
              { text: "Review Cart", onPress: () => resolve() },
            ]);
          });
        }
        setIsValidating(false);
        return { valid: false, cartChanged };
      }
      setIsValidating(false);
      return { valid: true, cartChanged: false };
    } catch (err: any) {
      setIsValidating(false);
      Alert.alert(
        "Validation Error",
        "Could not validate your cart. Please check your connection and try again.",
        [{ text: "OK" }]
      );
      return { valid: false, cartChanged: false };
    }
  };

  const validateCart = useCallback(async (): Promise<CartValidationResult> => {
    return validateCartItems(items);
  }, [items]);

  const MAX_ITEM_QTY = 99;

  const addItem = (item: CartItem) => {
    save(prev => {
      const existing = prev.find(i => i.productId === item.productId);
      if (existing) {
        if (existing.quantity >= MAX_ITEM_QTY) {
          setTimeout(() => Alert.alert("Limit Reached", `Maximum quantity per item is ${MAX_ITEM_QTY}.`), 0);
          return prev;
        }
        return prev.map(i => i.productId === item.productId ? { ...i, quantity: Math.min(i.quantity + 1, MAX_ITEM_QTY) } : i);
      }

      const types = [...new Set(prev.map(i => i.type))];
      const currentType = types.length === 1 ? types[0] : null;

      if (prev.length > 0 && currentType === null) {
        setTimeout(() => Alert.alert("Mixed Cart", "Your cart has mixed items. Please clear your cart before adding new items.", [{ text: "OK" }]), 0);
        return prev;
      }

      if (currentType && currentType !== item.type && prev.length > 0) {
        const nameFor = (t: string) => t === "mart" ? "Mart" : t === "food" ? "Food" : "Pharmacy";
        setTimeout(() => Alert.alert(
          "Mixed Cart",
          `Your cart has items from ${nameFor(currentType)}. Adding ${nameFor(item.type)} items will clear your cart. Continue?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Yes, Clear & Add",
              style: "destructive",
              onPress: () => { save([item]); },
            },
          ]
        ), 0);
        return prev;
      }

      return [...prev, item];
    });
  };

  const removeItem = (productId: string) => save(prev => prev.filter(i => i.productId !== productId));

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) return removeItem(productId);
    if (qty > MAX_ITEM_QTY) {
      Alert.alert("Limit Reached", `Maximum quantity per item is ${MAX_ITEM_QTY}.`);
      return;
    }
    save(prev => prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
  };

  const clearCart = () => {
    resetAckState();
    save([]);
  };

  const clearCartAndAdd = (item: CartItem) => {
    resetAckState();
    save([item]);
  };

  const restoreCart = (snapshot: CartItem[]) => {
    resetAckState();
    save([...snapshot]);
  };

  const dismissAck = useCallback(() => {
    resetAckState();
  }, [resetAckState]);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const types = [...new Set(items.map(i => i.type))];
  const cartType: "mart" | "food" | "pharmacy" | "mixed" | "none" =
    types.length === 0 ? "none" :
    types.length === 1 ? (types[0] as "mart" | "food" | "pharmacy") :
    "mixed";

  const setPharmacyPendingOrderId = (id: string | null) => {
    pharmacyPendingOrderIdRef.current = id;
  };

  const setPendingOrderId = (id: string | null, data?: AckSuccessData | null) => {
    pendingOrderIdRef.current = id;
    pendingOrderDataRef.current = data ?? null;
    if (id) ackResolvedRef.current = false;
  };

  const resolveOrderAck = (oid: string) => {
    if (ackResolvedRef.current) return;
    ackResolvedRef.current = true;
    const data = pendingOrderDataRef.current;
    if (ackStuckTimerRef.current) { clearTimeout(ackStuckTimerRef.current); ackStuckTimerRef.current = null; }
    if (ackFallbackTimerRef.current) { clearTimeout(ackFallbackTimerRef.current); ackFallbackTimerRef.current = null; }
    if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
    pendingOrderIdRef.current = null;
    pendingOrderDataRef.current = null;
    setAckStuck(false);
    clearCartOnAck();
    if (data) setOrderSuccess(data);
  };

  const tryHttpFallback = async (): Promise<boolean> => {
    const oid = pendingOrderIdRef.current;
    if (!oid) return false;
    try {
      const tkn = authTokenRef.current;
      const res = await fetch(`${API_BASE}/orders/${oid}`, {
        headers: tkn ? { Authorization: `Bearer ${tkn}` } : {},
      });
      if (res.ok) {
        const d = unwrapApiResponse<{ order?: { id?: string; status?: string }; id?: string; status?: string }>(await res.json());
        const order = d.order || d;
        /* Only resolve if the order has moved past "pending" — prevents prematurely
           clearing the cart while the backend is still processing payment. */
        const ACKNOWLEDGED_STATUSES = [
          "confirmed", "preparing", "ready", "on_the_way", "picked_up",
          "out_for_delivery", "delivered", "completed",
        ];
        if (order && order.id && order.status && ACKNOWLEDGED_STATUSES.includes(order.status)) {
          resolveOrderAck(oid);
          return true;
        }
      }
    } catch (fetchErr) {
      if (__DEV__) console.warn("[Cart] HTTP fallback order fetch failed:", fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
    }
    return false;
  };

  const startAckStuckTimer = (delayMs: number) => {
    if (ackStuckTimerRef.current) clearTimeout(ackStuckTimerRef.current);
    if (ackFallbackTimerRef.current) clearTimeout(ackFallbackTimerRef.current);
    if (ackFallbackIvRef.current) clearInterval(ackFallbackIvRef.current);

    ackFallbackTimerRef.current = setTimeout(() => {
      let attempts = 0;
      ackFallbackIvRef.current = setInterval(async () => {
        attempts++;
        const resolved = await tryHttpFallback();
        if (resolved) {
          if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
        } else if (attempts >= 6) {
          /* All retries exhausted — resolve with a "payment received" banner so
             the user is never permanently stuck on the cart/pending screen.
             The order was already placed (wallet deducted); clearing pending
             state lets the user navigate away and check order history. */
          if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
          const oid = pendingOrderIdRef.current;
          if (oid && !ackResolvedRef.current) {
            const data = pendingOrderDataRef.current;
            resolveOrderAck(oid);
            if (!data) {
              setOrderSuccess({ id: oid, time: new Date().toISOString(), payMethod: undefined });
            }
          }
        }
      }, 5000);
      tryHttpFallback();
    }, 10000);

    ackStuckTimerRef.current = setTimeout(async () => {
      if (!pendingOrderIdRef.current) return;
      const resolved = await tryHttpFallback();
      if (!resolved && pendingOrderIdRef.current) setAckStuck(true);
    }, delayMs);
  };

  const cancelAckStuckTimer = () => {
    if (ackStuckTimerRef.current) { clearTimeout(ackStuckTimerRef.current); ackStuckTimerRef.current = null; }
    if (ackFallbackTimerRef.current) { clearTimeout(ackFallbackTimerRef.current); ackFallbackTimerRef.current = null; }
    if (ackFallbackIvRef.current) { clearInterval(ackFallbackIvRef.current); ackFallbackIvRef.current = null; }
  };

  const clearOrderSuccess = () => setOrderSuccess(null);

  return (
    <CartContext.Provider value={{
      items, itemCount, total, cartType,
      addItem, removeItem, updateQuantity,
      clearCart, clearCartAndAdd, clearCartOnAck, restoreCart, validateCart, isValidating,
      pendingAck, setPendingAck,
      ackStuck,
      orderSuccess, clearOrderSuccess,
      setPendingOrderId, startAckStuckTimer, cancelAckStuckTimer,
      dismissAck,
      setPharmacyPendingOrderId,
    }}>
      {children}
    </CartContext.Provider>
  );
}

const EMPTY_CART: CartContextType = {
  items: [],
  itemCount: 0,
  total: 0,
  cartType: "none",
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  clearCartAndAdd: () => {},
  clearCartOnAck: () => {},
  restoreCart: () => {},
  validateCart: () => Promise.resolve({ valid: true, cartChanged: false }),
  isValidating: false,
  pendingAck: false,
  setPendingAck: () => {},
  ackStuck: false,
  orderSuccess: null,
  clearOrderSuccess: () => {},
  setPendingOrderId: () => {},
  startAckStuckTimer: () => {},
  cancelAckStuckTimer: () => {},
  dismissAck: () => {},
  setPharmacyPendingOrderId: () => {},
};

export function useCart() {
  const ctx = useContext(CartContext);
  return ctx ?? EMPTY_CART;
}
