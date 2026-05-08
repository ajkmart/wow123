import { Ionicons } from "@expo/vector-icons";
import { withErrorBoundary } from "@/utils/withErrorBoundary";
import { router, useLocalSearchParams } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Modal,
  Platform,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import Colors from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth, hasRole } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { createOrder, CreateOrderRequestPaymentMethod, type CreateOrderRequestType } from "@workspace/api-client-react";
import { API_BASE, unwrapApiResponse } from "@/utils/api";
import { AuthGateSheet, useAuthGate, useRoleGate, RoleBlockSheet } from "@/components/AuthGateSheet";

const C = Colors.light;
type PayMethod = "cash" | "wallet" | "jazzcash" | "easypaisa" | "pickup";
type CartAvailableOffer = { id: string; name: string; code?: string; discountPct?: number; discountFlat?: number; type: string; minOrderAmount?: number };
type AutoApplyOffer = { offerId: string; name: string; discount: number; freeDelivery: boolean; savingsMessage: string };

interface PaymentMethod {
  id: PayMethod;
  label: string;
  logo: string;
  available: boolean;
  description: string;
  mode?: string;
}

interface SavedAddress {
  id: string;
  label: string;
  address: string;
  city: string;
  icon: string;
  isDefault: boolean;
  latitude?: number;
  longitude?: number;
}

interface OrderResponse {
  id: string;
  total?: string | number;
  estimatedTime?: string;
  status?: string;
}

interface PaymentMethodRaw {
  id: string;
  label: string;
  logo?: string;
  available?: boolean;
  description?: string;
  mode?: string;
}

interface PaymentMethodsApiResponse {
  payment: {
    methods: PaymentMethodRaw[];
  };
}

function GpsSlotRow({ selected, onSelect, onClose }: {
  selected: string;
  onSelect: (a: SavedAddress) => void;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [loading, setLoading] = useState(false);
  const [gpsAddr, setGpsAddr] = useState<SavedAddress | null>(null);
  const isSel = selected === "__gps__";
  const fetchingRef = useRef(false);
  const cancelRef = useRef({ cancelled: false });

  const fetchGps = async (requestPermission: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      let status: string;
      if (requestPermission) {
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
      } else {
        const result = await Location.getForegroundPermissionsAsync();
        status = result.status;
      }
      if (status !== "granted") {
        if (requestPermission) Alert.alert("Permission Denied", "Location permission is needed.");
        return;
      }
      if (cancelRef.current.cancelled) return;
      setLoading(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (cancelRef.current.cancelled) return;
      let cityName = "";
      let streetAddr = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        if (geo) {
          cityName = geo.city || geo.subregion || geo.region || "";
          const parts = [geo.street, geo.name, geo.district].filter(Boolean);
          if (parts.length > 0) streetAddr = parts.join(", ");
        }
      } catch (geoErr) {
        if (__DEV__) console.warn("[GpsSlotRow] Reverse geocode failed:", geoErr instanceof Error ? geoErr.message : String(geoErr));
      }
      if (cancelRef.current.cancelled) return;
      const addr: SavedAddress = {
        id: "__gps__",
        label: "Current Location",
        address: streetAddr,
        city: cityName,
        icon: "navigate-outline",
        isDefault: false,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setGpsAddr(addr);
      return addr;
    } catch (err) {
      if (__DEV__) console.warn("[GpsSlotRow] GPS fetch failed:", err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      if (!cancelRef.current.cancelled) setLoading(false);
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    cancelRef.current = { cancelled: false };
    fetchGps(false);
    return () => { cancelRef.current.cancelled = true; };
  }, []);

  const handlePress = async () => {
    if (gpsAddr) {
      onSelect(gpsAddr);
      onClose();
      return;
    }
    const addr = await fetchGps(true);
    if (cancelRef.current.cancelled) return;
    if (addr) {
      onSelect(addr);
      onClose();
    } else {
      Alert.alert("GPS Error", "Could not get your current location.");
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handlePress}
      style={[styles.addrOpt, { borderColor: isSel ? "#10B981" : "#D1FAE5", backgroundColor: isSel ? "#ECFDF5" : "#F0FDF4", marginBottom: 6 }]}
    >
      <View style={[styles.addrOptIcon, { backgroundColor: "#D1FAE5" }]}>
        {loading ? <ActivityIndicator size="small" color="#10B981" /> : <Ionicons name="navigate-outline" size={20} color="#10B981" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.addrOptLabel, { color: "#059669" }]}>📍 {T("currentLocation" as TranslationKey)}</Text>
        <Text style={styles.addrOptCity} numberOfLines={1}>{gpsAddr ? `${gpsAddr.address}, ${gpsAddr.city}` : T("tapToDetectGps" as TranslationKey)}</Text>
      </View>
      {isSel && <Ionicons name="checkmark-circle" size={22} color="#10B981" />}
    </TouchableOpacity>
  );
}

function AddressPickerModal({
  visible, addresses, selected, onSelect, onClose, onAddressCreated, token, addrLoaded,
}: {
  visible: boolean;
  addresses: SavedAddress[];
  selected: string;
  onSelect: (a: SavedAddress) => void;
  onClose: () => void;
  onAddressCreated: (a: SavedAddress) => void;
  token: string | null | undefined;
  addrLoaded: React.MutableRefObject<boolean>;
}) {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState("Home");
  const [newAddress, setNewAddress] = useState("");
  const [newCity, setNewCity] = useState("Muzaffarabad");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setShowForm(false);
    setNewLabel("Home");
    setNewAddress("");
    setNewCity("Muzaffarabad");
    setFormError(null);
  };

  const handleSave = async () => {
    if (!newAddress.trim()) { setFormError("Address is required"); return; }
    if (!newCity.trim()) { setFormError("City is required"); return; }
    setSaving(true);
    setFormError(null);
    try {
      const loadedAddresses = addrLoaded.current ? addresses : [];
      const hasDefault = loadedAddresses.some(a => a.isDefault);
      const shouldBeDefault = addrLoaded.current && (loadedAddresses.length === 0 || !hasDefault);
      const res = await fetch(`${API_BASE}/addresses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          label: newLabel.trim() || "Home",
          address: newAddress.trim(),
          city: newCity.trim(),
          icon: newLabel.toLowerCase().includes("work") ? "briefcase-outline" : newLabel.toLowerCase().includes("office") ? "business-outline" : "home-outline",
          isDefault: shouldBeDefault,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save address");
      }
      const d = unwrapApiResponse<{ address?: SavedAddress } & SavedAddress>(await res.json());
      const created: SavedAddress = d.address ?? d;
      onAddressCreated(created);
      resetForm();
      onClose();
    } catch (e: any) {
      setFormError(e.message || "Could not save address");
    }
    setSaving(false);
  };

  const LABEL_PRESETS = ["Home", "Work", "Office", "Other"];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { if (!saving) { resetForm(); onClose(); } }}>
      <TouchableOpacity activeOpacity={0.7} style={styles.overlay} onPress={() => { if (!saving) { resetForm(); onClose(); } }}>
        <TouchableOpacity activeOpacity={0.7} style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{showForm ? T("addNewAddress" as TranslationKey) : T("chooseDeliveryAddress" as TranslationKey)}</Text>

          {/* GPS slot is rendered inline as slot-0 inside the address list below */}

          {showForm ? (
            <View style={{ gap: 14 }}>
              <View>
                <Text style={{ ...Typ.captionMedium, color: C.textSecondary, marginBottom: 6 }}>Label</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {LABEL_PRESETS.map(l => (
                    <TouchableOpacity activeOpacity={0.7}
                      key={l}
                      onPress={() => setNewLabel(l)}
                      style={{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                        backgroundColor: newLabel === l ? C.primary : C.surfaceSecondary,
                        borderWidth: 1, borderColor: newLabel === l ? C.primary : C.border,
                      }}
                    >
                      <Text style={{ ...Typ.captionMedium, color: newLabel === l ? C.textInverse : C.text }}>{l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View>
                <Text style={{ ...Typ.captionMedium, color: C.textSecondary, marginBottom: 6 }}>{T("streetAddress" as TranslationKey)}</Text>
                <TextInput
                  value={newAddress}
                  onChangeText={setNewAddress}
                  placeholder="e.g. CMH Road, Near GPO"
                  placeholderTextColor={C.textMuted}
                  multiline
                  style={{
                    borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
                    paddingHorizontal: 14, paddingVertical: 12, minHeight: 60,
                    ...Typ.body, color: C.text, backgroundColor: C.surfaceSecondary,
                    textAlignVertical: "top",
                  }}
                />
              </View>
              <View>
                <Text style={{ ...Typ.captionMedium, color: C.textSecondary, marginBottom: 6 }}>{T("cityLabel")}</Text>
                <TextInput
                  value={newCity}
                  onChangeText={setNewCity}
                  placeholder="e.g. Muzaffarabad"
                  placeholderTextColor={C.textMuted}
                  style={{
                    borderWidth: 1.5, borderColor: C.border, borderRadius: 14,
                    paddingHorizontal: 14, paddingVertical: 12,
                    ...Typ.body, color: C.text, backgroundColor: C.surfaceSecondary,
                  }}
                />
              </View>
              {formError && <Text style={{ ...Typ.caption, color: C.red }}>{formError}</Text>}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => resetForm()}
                  disabled={saving}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: C.surfaceSecondary, borderWidth: 1, borderColor: C.border }}
                >
                  <Text style={{ ...Typ.buttonSmall, color: C.textSecondary }}>{T("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={handleSave}
                  disabled={saving}
                  style={{ flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: C.primary, opacity: saving ? 0.7 : 1 }}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={C.textInverse} />
                    : <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.textInverse }}>{T("saveAndSelect" as TranslationKey)}</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
                {/* Slot-0: GPS Current Location — always pinned at top */}
                <GpsSlotRow selected={selected} onSelect={onSelect} onClose={onClose} />
                {addresses.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 18, gap: 8 }}>
                    <Text style={{ ...Typ.body, fontSize: 13, color: C.textSecondary, textAlign: "center" }}>
                      {T("noSavedAddresses" as TranslationKey)}
                    </Text>
                  </View>
                ) : (
                  <>
                  {addresses.filter(a => a.id !== "__gps__").map((addr, index) => {
                    const isSel = selected === addr.id;
                    return (
                      <TouchableOpacity activeOpacity={0.7}
                        key={`addr-${addr.id ?? "na"}-${index}`}
                        onPress={() => { onSelect(addr); onClose(); }}
                        style={[styles.addrOpt, isSel && styles.addrOptSel]}
                      >
                        <View style={[styles.addrOptIcon, { backgroundColor: isSel ? C.brandBlueSoft : C.surfaceSecondary }]}>
                          <Ionicons name={(addr.icon as keyof typeof Ionicons.glyphMap) || "location-outline"} size={20} color={isSel ? C.primary : C.textSecondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={[styles.addrOptLabel, isSel && { color: C.primary }]}>{addr.label}</Text>
                            {addr.isDefault && (
                              <View style={styles.defaultTag}>
                                <Text style={styles.defaultTagText}>{T("defaultBadge" as TranslationKey)}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.addrOptAddress} numberOfLines={1}>{addr.address}</Text>
                          <Text style={styles.addrOptCity}>{addr.city}</Text>
                        </View>
                        {isSel && <Ionicons name="checkmark-circle" size={22} color={C.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                  </>
                )}
              </ScrollView>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setShowForm(true)} style={[styles.addrOpt, { borderColor: C.primary, borderStyle: "dashed", marginTop: 8 }]}>
                <View style={[styles.addrOptIcon, { backgroundColor: C.brandBlueSoft }]}>
                  <Ionicons name="add-outline" size={20} color={C.primary} />
                </View>
                <Text style={[styles.addrOptLabel, { color: C.primary }]}>{T("addNewAddress" as TranslationKey)}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>{T("cancel")}</Text>
              </TouchableOpacity>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function CartScreenInner() {
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const { promoCode: incomingPromoCode } = useLocalSearchParams<{ promoCode?: string }>();
  const { user, updateUser, token, socket } = useAuth();
  const {
    items, total, cartType, updateQuantity, clearCart, clearCartOnAck, restoreCart, addItem, validateCart, isValidating,
    pendingAck, setPendingAck,
    ackStuck,
    dismissAck,
    orderSuccess, clearOrderSuccess,
    setPendingOrderId, startAckStuckTimer, cancelAckStuckTimer,
  } = useCart();
  const { showToast } = useToast();
  const { config: platformConfig } = usePlatformConfig();
  const { language } = useLanguage();
  const { requireAuth, sheetProps: authSheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();
  const T = (key: TranslationKey) => tDual(key, language);
  const appName    = platformConfig.platform.appName;
  const orderRules = platformConfig.orderRules;
  const finance    = platformConfig.finance;
  const customer   = platformConfig.customer;

  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [loading, setLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<typeof items | null>(null);
  const [showUndoClear, setShowUndoClear] = useState(false);
  const undoClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string>("__gps__");
  const [showAddrPicker, setShowAddrPicker] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const addrLoaded = useRef(false);
  const gpsResolved = useRef(false);

  const [allPayMethods, setAllPayMethods] = useState<PaymentMethod[]>([
    { id: "cash",   label: "Cash on Delivery",    logo: "💵", available: true,  description: "Pay on delivery" },
    { id: "wallet", label: `${appName} Wallet`,   logo: "💰", available: true,  description: "Instant pay from wallet" },
  ]);

  const [promoInput, setPromoInput] = useState("");
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);

  const [availableOffers, setAvailableOffers] = useState<CartAvailableOffer[]>([]);
  const [autoApplyOffer, setAutoApplyOffer] = useState<AutoApplyOffer | null>(null);
  const [autoApplyDismissed, setAutoApplyDismissed] = useState(false);
  const [autoApplyActive, setAutoApplyActive] = useState(false);

  const [receiptImageUri, setReceiptImageUri] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [receiptTxnRef, setReceiptTxnRef] = useState("");
  const receiptMimeCache = useRef<Map<string, string>>(new Map());

  const [showGwModal, setShowGwModal] = useState(false);
  const [gwMobile, setGwMobile] = useState("");
  const [gwPaying, setGwPaying] = useState(false);
  const [gwStep, setGwStep] = useState<"input" | "waiting" | "done">("input");

  const [gwBackgrounded, setGwBackgrounded] = useState(false);
  const [deliveryBlocked, setDeliveryBlocked] = useState<string | null>(null);
  const [gwMobileError, setGwMobileError] = useState<string | null>(null);
  const gwCancellingRef = useRef(false);

  useEffect(() => {
    if (gwMobileError) setGwMobileError(null);
  }, [gwMobile]);

  const mountedRef = useRef(true);
  const gwPollRef = useRef<{ active: boolean; intervalId?: ReturnType<typeof setInterval> }>({ active: false });
  const gwTxnRef  = useRef<string | null>(null);
  const gwOrderId = useRef<string | null>(null);
  const promoRevalidateTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promoRevalidateSeq     = useRef(0);
  const promoRevalidateAbort   = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      gwPollRef.current.active = false;
      if (gwPollRef.current.intervalId) clearInterval(gwPollRef.current.intervalId);
    };
  }, []);

  // Auto-apply promo code passed from offers screen (via route params)
  useEffect(() => {
    if (incomingPromoCode && !promoApplied) {
      const code = incomingPromoCode.toUpperCase();
      setPromoInput(code);
      applyPromo(code);
    }
     
  }, [incomingPromoCode]);

  // Fetch available offers to show best-offer suggestions in the promo section
  useEffect(() => {
    if (!token || promoApplied) return;
    const ctrl = new AbortController();
    fetch(`${API_BASE}/promotions/public?limit=5`, { signal: ctrl.signal, headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!mountedRef.current) return;
        const offers: CartAvailableOffer[] = json?.data?.offers ?? json?.offers ?? [];
        const codedOffers = offers.filter(o => o.code && (!o.minOrderAmount || o.minOrderAmount <= total));
        setAvailableOffers(codedOffers.slice(0, 3));
      })
      .catch((err) => {
        if (__DEV__) console.warn("[Cart] Failed to fetch available offers:", err instanceof Error ? err.message : String(err));
      });
    return () => ctrl.abort();
  }, [token, promoApplied, total]);

  // Auto-apply best offer: call promotions engine to find the best eligible offer for this cart
  useEffect(() => {
    if (!token || promoApplied || autoApplyDismissed || total <= 0) return;
    const ctrl = new AbortController();
    const orderType = cartType === "mixed" ? "mart" : cartType;
    fetch(`${API_BASE}/promotions/auto-apply`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ orderTotal: total, orderType }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!mountedRef.current) return;
        const d = json?.data ?? json;
        if (d?.applied && d?.offer) {
          setAutoApplyOffer({
            offerId: d.offer.id,
            name: d.offer.name,
            discount: d.discount,
            freeDelivery: d.freeDelivery ?? false,
            savingsMessage: d.savingsMessage ?? `Save Rs. ${d.discount}`,
          });
        } else {
          setAutoApplyOffer(null);
        }
      })
      .catch((err) => {
        if (__DEV__) console.warn("[Cart] Auto-apply offers fetch failed:", err instanceof Error ? err.message : String(err));
      });
    return () => ctrl.abort();
  }, [token, promoApplied, autoApplyDismissed, total, cartType]);

  useEffect(() => {
    if (!token || items.length === 0) { setDeliveryBlocked(null); return; }
    const svc = cartType === "mixed" ? "mart" : cartType;
    const firstPid = items[0]?.productId;
    const qs = `serviceType=${svc}${firstPid ? `&productId=${firstPid}` : ""}`;
    fetch(`${API_BASE}/delivery/eligibility?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!mountedRef.current) return;
        const d = json?.data ?? json;
        if (d && d.eligible === false) {
          const msg = d.reason === "user_not_whitelisted"
            ? "Delivery is not available for your account at this time. You can use self-pickup."
            : d.reason === "store_not_whitelisted"
            ? "Delivery is not available for this store at this time. You can use self-pickup."
            : "Delivery is not available at this time. You can use self-pickup.";
          setDeliveryBlocked(msg);
        } else {
          setDeliveryBlocked(null);
        }
      })
      .catch(() => { if (mountedRef.current) setDeliveryBlocked(null); });
  }, [token, items.length, cartType]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", nextState => {
      if (gwStep !== "waiting") return;
      if (nextState === "background" || nextState === "inactive") {
        gwPollRef.current.active = false;
        if (gwPollRef.current.intervalId) {
          clearInterval(gwPollRef.current.intervalId);
          gwPollRef.current.intervalId = undefined;
        }
        if (mountedRef.current) setGwBackgrounded(true);
      } else if (nextState === "active" && gwBackgrounded) {
        /* Keep gwBackgrounded = true so the Resume/Cancel UI remains visible.
           The user must explicitly tap "Resume Payment" or "Cancel Order". */
      }
    });
    return () => sub.remove();
  }, [gwStep, gwBackgrounded, payMethod, showToast]);

  const topPad = Math.max(insets.top, 12);
  const deliveryFeeConfig = platformConfig.deliveryFee;
  const freeDeliveryAbove = platformConfig.deliveryFee.freeDeliveryAbove;
  const freeDeliveryEnabled = platformConfig.deliveryFee.freeEnabled;

  useEffect(() => {
    fetch(`${API_BASE}/platform-config`)
      .then(r => r.json())
      .then(d => unwrapApiResponse<{ payment?: { methods: PaymentMethodRaw[] } }>(d))
      .then(d => {
        if (d.payment?.methods) {
          const methods: PaymentMethod[] = d.payment.methods.map((m: PaymentMethodRaw) => ({
            id: m.id as PayMethod, label: m.label, logo: m.logo ?? "",
            available: m.available ?? true, description: m.description ?? "", mode: m.mode,
          }));
          setAllPayMethods(methods);
        }
      })
      .catch((err) => {
        if (__DEV__) console.warn("[Cart] Failed to refresh platform config:", err instanceof Error ? err.message : String(err));
      });
  }, []);

  const deliveryFeeByType: Record<string, number> = {
    mart:     deliveryFeeConfig.mart,
    food:     deliveryFeeConfig.food,
    pharmacy: deliveryFeeConfig.pharmacy,
    parcel:   deliveryFeeConfig.parcel,
  };
  const rawDeliveryFee = cartType === "none" ? 0
    : cartType === "mixed" ? Math.max(...[...new Set(items.map(i => i.type))].map(t => deliveryFeeByType[t] ?? 0))
    : deliveryFeeByType[cartType] ?? deliveryFeeConfig.mart;
  const deliveryFee = (freeDeliveryEnabled && total >= freeDeliveryAbove) ? 0 : rawDeliveryFee;
  const gstAmount   = finance.gstEnabled ? Math.round(total * finance.gstPct / 100) : 0;
  const cashbackAmt = finance.cashbackEnabled ? Math.min(Math.round(total * finance.cashbackPct / 100), finance.cashbackMaxRs) : 0;
  const autoApplyDiscount = (autoApplyActive && autoApplyOffer && !promoApplied) ? autoApplyOffer.discount : 0;
  const effectiveDeliveryFee = (autoApplyActive && autoApplyOffer?.freeDelivery && !promoApplied) ? 0 : deliveryFee;
  const grandTotal  = Math.max(0, total + effectiveDeliveryFee + gstAmount - promoDiscount - autoApplyDiscount);
  const walletCashbackApplies = payMethod === "wallet" && customer.walletCashbackPct > 0 && customer.walletCashbackOrders;
  const walletCashbackAmt = walletCashbackApplies ? Math.round(grandTotal * customer.walletCashbackPct / 100) : 0;

  const availablePayMethods = allPayMethods.map(m => {
    if (m.id === "cash" && grandTotal > orderRules.maxCodAmount) {
      return { ...m, available: false, description: `COD limit: Rs.${orderRules.maxCodAmount.toLocaleString()}` };
    }
    return m;
  });

  useEffect(() => {
    if (payMethod === "cash" && grandTotal > orderRules.maxCodAmount) {
      const fallback = availablePayMethods.find(m => m.id !== "cash" && m.available);
      if (fallback) setPayMethod(fallback.id as PayMethod);
    }
  }, [grandTotal, orderRules.maxCodAmount, payMethod]);

  const [gpsAddress, setGpsAddress] = useState<SavedAddress | null>(null);
  const selectedAddr = selectedAddrId === "__gps__"
    ? (addresses.find(a => a.id === "__gps__") ?? gpsAddress)
    : addresses.find(a => a.id === selectedAddrId);
  const deliveryLine = selectedAddr
    ? `${selectedAddr.label} — ${selectedAddr.address}, ${selectedAddr.city}`
    : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          gpsResolved.current = true;
          if (!cancelled) setSelectedAddrId("");
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        let cityName = "";
        let streetAddr = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        try {
          const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
          if (geo) {
            cityName = geo.city || geo.subregion || geo.region || "";
            const parts = [geo.street, geo.name, geo.district].filter(Boolean);
            if (parts.length > 0) streetAddr = parts.join(", ");
          }
        } catch (geoErr) {
          if (__DEV__) console.warn("[Cart] Reverse geocode failed — using raw coordinates:", geoErr instanceof Error ? geoErr.message : String(geoErr));
        }
        if (!cancelled) {
          const gpsAddr: SavedAddress = {
            id: "__gps__",
            label: "Current Location",
            address: streetAddr,
            city: cityName,
            icon: "navigate-outline",
            isDefault: false,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };
          setGpsAddress(gpsAddr);
          setAddresses(prev => [gpsAddr, ...prev.filter(a => a.id !== "__gps__")]);
          setSelectedAddrId("__gps__");
          gpsResolved.current = true;
        }
      } catch {
        gpsResolved.current = true;
        if (!cancelled) setSelectedAddrId("");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    addrLoaded.current = false;
    setAddrLoading(true);
    fetch(`${API_BASE}/addresses`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(d => unwrapApiResponse<{ addresses?: SavedAddress[] }>(d))
      .then(d => {
        const addrs: SavedAddress[] = d.addresses || [];
        setAddresses(prev => {
          const gps = prev.find(a => a.id === "__gps__");
          return gps ? [gps, ...addrs] : addrs;
        });
        addrLoaded.current = true;
        setSelectedAddrId(prev => {
          if (prev === "__gps__" && !gpsResolved.current) return prev;
          if (prev === "__gps__" && gpsResolved.current) return prev;
          if (prev === "") {
            const def = addrs.find(a => a.isDefault) || addrs[0];
            return def ? def.id : "";
          }
          return prev;
        });
      })
      .catch((err) => {
        if (__DEV__) console.warn("[Cart] Failed to load addresses:", err instanceof Error ? err.message : String(err));
        showToast("Could not load saved addresses. Please add one manually.", "error");
      })
      .finally(() => setAddrLoading(false));
  }, [user?.id]);

  useEffect(() => {
    if (selectedAddrId === "" && addrLoaded.current && addresses.length > 0) {
      const def = addresses.find(a => a.id !== "__gps__" && a.isDefault) || addresses.find(a => a.id !== "__gps__");
      if (def) setSelectedAddrId(def.id);
    }
  }, [selectedAddrId, addresses]);

  const cartFingerprint = items.map(i => `${i.productId}:${i.quantity}:${i.price}`).join("|") + "|" + cartType;
  useEffect(() => {
    if (promoApplied && promoCode) {
      if (promoRevalidateTimer.current) clearTimeout(promoRevalidateTimer.current);
      if (promoRevalidateAbort.current) promoRevalidateAbort.current.abort();
      promoRevalidateTimer.current = setTimeout(() => {
        revalidatePromo(promoCode);
      }, 800);
    }
    return () => {
      if (promoRevalidateTimer.current) clearTimeout(promoRevalidateTimer.current);
      if (promoRevalidateAbort.current) promoRevalidateAbort.current.abort();
    };
  }, [cartFingerprint]);

  const revalidatePromo = async (code: string) => {
    promoRevalidateSeq.current += 1;
    const seq = promoRevalidateSeq.current;
    if (promoRevalidateAbort.current) {
      promoRevalidateAbort.current.abort();
    }
    const controller = new AbortController();
    promoRevalidateAbort.current = controller;
    setPromoLoading(true);
    try {
      const orderType = (cartType === "mixed" || cartType === "pharmacy" || cartType === "none") ? "mart" : cartType;
      const res = await fetch(`${API_BASE}/orders/validate-promo?code=${encodeURIComponent(code)}&total=${total}&type=${orderType}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });
      if (!mountedRef.current || seq !== promoRevalidateSeq.current) return;
      const data = unwrapApiResponse<{ valid?: boolean; discount?: number; error?: string }>(await res.json());
      if (!mountedRef.current || seq !== promoRevalidateSeq.current) return;
      if (data.valid) {
        setPromoDiscount(data.discount ?? 0);
      } else {
        setPromoCode(null);
        setPromoDiscount(0);
        setPromoApplied(false);
        showToast(T("promoInvalidRemoved"), "error");
      }
    } catch (err: unknown) {
      if ((err as any)?.name === "AbortError") return;
      if (!mountedRef.current || seq !== promoRevalidateSeq.current) return;
      showToast(T("promoNetworkError"), "error");
      setPromoCode(null);
      setPromoDiscount(0);
      setPromoApplied(false);
    } finally {
      if (seq === promoRevalidateSeq.current) setPromoLoading(false);
    }
  };

  const applyPromo = async (overrideCode?: string) => {
    const code = (overrideCode ?? promoInput).trim().toUpperCase();
    if (!code) return;
    setPromoLoading(true);
    setPromoError(null);
    try {
      const orderType = (cartType === "mixed" || cartType === "pharmacy" || cartType === "none") ? "mart" : cartType;
      const res = await fetch(`${API_BASE}/orders/validate-promo?code=${encodeURIComponent(code)}&total=${total}&type=${orderType}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = unwrapApiResponse<{ valid?: boolean; discount?: number; error?: string }>(await res.json());
      if (data.valid) {
        setPromoCode(code);
        setPromoDiscount(data.discount ?? 0);
        setPromoApplied(true);
        setPromoError(null);
        showToast(`${T("promoApplied")} Rs. ${data.discount} discount received`, "success");
      } else {
        setPromoCode(null);
        setPromoDiscount(0);
        setPromoApplied(false);
        const serverErrLower: string = (data.error ?? "").toLowerCase();
        let friendlyErr = T("promoInvalid");
        if (serverErrLower.includes("expire"))                               friendlyErr = T("promoExpired") ?? T("promoInvalid");
        else if (serverErrLower.includes("limit") || serverErrLower.includes("usedcount")) friendlyErr = T("promoLimitReached") ?? T("promoInvalid");
        else if (serverErrLower.includes("minimum"))                         friendlyErr = T("promoMinOrder") ?? T("promoInvalid");
        else if (serverErrLower.includes("sirf") || serverErrLower.includes("ke liye"))    friendlyErr = T("promoWrongType") ?? T("promoInvalid");
        setPromoError(friendlyErr);
      }
    } catch {
      setPromoError(T("promoNetworkErrRetry"));
    } finally {
      setPromoLoading(false);
    }
  };

  const clearPromoState = () => {
    setPromoCode(null);
    setPromoDiscount(0);
    setPromoApplied(false);
    setPromoInput("");
    setPromoError(null);
  };

  const prevCartTypeRef = useRef(cartType);
  useEffect(() => {
    if (prevCartTypeRef.current !== cartType && prevCartTypeRef.current !== "none" && cartType !== "none") {
      clearPromoState();
    }
    prevCartTypeRef.current = cartType;
  }, [cartType]);

  useEffect(() => {
    if (items.length === 0) {
      clearPromoState();
    }
  }, [items.length]);

  const removePromo = () => {
    clearPromoState();
  };

  const placeOrder = async (finalPayMethod: PayMethod, uploadedProofUrl?: string, uploadedTxnRef?: string) => {
    // Prevent duplicate submissions
    if (isSubmittingOrder) return;
    
    if (!user) {
      requireAuth(() => {}, { message: "Sign in to place your order", returnTo: "/cart" });
      return;
    }
    if (!hasRole(user, "customer")) {
      requireCustomerRole(() => {});
      return;
    }
    
    setIsSubmittingOrder(true);
    try {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;
    let order: OrderResponse | null = null;
    const idemKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setPendingAck(true);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const orderGpsPayload = await buildGpsPayload();
        type CartCreateOrderPayload = Parameters<typeof createOrder>[0] & {
          idempotencyKey: string;
          promoCode?: string;
          autoApplyOfferId?: string;
          proofPhotoUrl?: string;
          txnRef?: string;
          pickupLat?: number;
          pickupLng?: number;
          dropLat?: number;
          dropLng?: number;
        };
        const payload: CartCreateOrderPayload = {
          userId: user?.id ?? "",
          type: (cartType === "mixed" ? "mart" : cartType) as CreateOrderRequestType,
          items: items.map(i => ({
            productId: i.productId, name: i.name,
            price: i.price, quantity: i.quantity, image: i.image,
          })),
          deliveryAddress: deliveryLine,
          paymentMethod: finalPayMethod as CreateOrderRequestPaymentMethod,
          idempotencyKey: idemKey,
          ...(promoCode ? { promoCode } : {}),
          ...(autoApplyActive && autoApplyOffer && !promoCode ? { autoApplyOfferId: autoApplyOffer.offerId } : {}),
          ...(uploadedProofUrl ? { proofPhotoUrl: uploadedProofUrl } : {}),
          ...(uploadedTxnRef ? { txnRef: uploadedTxnRef } : {}),
          ...orderGpsPayload,
        };
        order = await createOrder(payload);
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        const status = err?.status ?? err?.statusCode ?? 0;
        if (status >= 400 && status < 500) {
          setPendingAck(false);
          throw err;
        }
        if (attempt < MAX_RETRIES - 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    if (lastError || !order) {
      setPendingAck(false);
      throw lastError ?? new Error("Order failed after retries");
    }

    if (finalPayMethod === "wallet") {
      const rawServerTotal = order?.total;
      const parsed = rawServerTotal != null ? parseFloat(String(rawServerTotal)) : NaN;
      const serverDeducted = !isNaN(parsed) && parsed > 0 ? parsed : grandTotal;
      if (isNaN(parsed) && __DEV__) console.warn("[Cart] wallet deduction: server total missing/invalid, using grandTotal fallback");
      updateUser({ walletBalance: (user?.walletBalance ?? 0) - serverDeducted });
    }

    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await fetch(`${API_BASE}/locations/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            latitude: pos.coords.latitude, longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null, role: "customer", action: "order_placed",
          }),
        });
      } catch (locErr) {
        if (__DEV__) console.warn("[location] order placement update failed:", locErr);
      }
    })();

    const orderId = order?.id;
    const successData = {
      id: (orderId ?? "------").slice(-6).toUpperCase(),
      time: order?.estimatedTime || "30-45 min",
      payMethod: finalPayMethod,
    };

    if (orderId) {
      setPendingOrderId(orderId, successData);
      startAckStuckTimer(socket ? 60000 : 20000);
    } else {
      clearCartOnAck();
    }
    } catch (error) {
      console.error("[Cart] Order placement failed:", error);
      setPendingAck(false);
      showToast(
        typeof error === 'object' && error && 'message' in error 
          ? String(error.message).substring(0, 100)
          : "Failed to place order. Please try again.",
        "error"
      );
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleCheckout = async (overridePayMethod?: PayMethod) => {
    const effectivePayMethod = overridePayMethod ?? payMethod;
    if (loading || isValidating) return;
    if (!user) {
      requireAuth(() => {}, { message: "Sign in to place your order", returnTo: "/cart" });
      return;
    }
    if (!hasRole(user, "customer")) {
      requireCustomerRole(() => {});
      return;
    }
    if (items.length === 0) { showToast(T("cartEmpty"), "error"); return; }
    if (cartType === "pharmacy") {
      const pharmacyItems = items.filter(i => i.type === "pharmacy");
      clearCart();
      router.push({
        pathname: "/pharmacy",
        params: { cartItems: JSON.stringify(pharmacyItems) },
      });
      return;
    }
    const isPickup = effectivePayMethod === "pickup";
    if (!isPickup && !deliveryLine) {
      showToast(T("selectDeliveryAddress"), "error");
      setShowAddrPicker(true);
      return;
    }
    if (!isPickup && selectedAddr && !selectedAddr.city?.trim()) {
      Alert.alert(
        T("cityMissingTitle"),
        T("cityMissingError"),
        [
          { text: T("cancel"), style: "cancel" },
          {
            text: T("editAddress"),
            onPress: () => router.push({ pathname: "/(tabs)/profile", params: { section: "addresses" } }),
          },
        ]
      );
      return;
    }
    const serviceableCities = orderRules.serviceableCities;
    if (
      !isPickup &&
      selectedAddr &&
      selectedAddr.city?.trim() &&
      serviceableCities.length > 0
    ) {
      const normalizeCity = (s: string) =>
        s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      const userCity = normalizeCity(selectedAddr.city);
      const cityAliases: Record<string, string[]> = {
        "muzaffarabad": ["mzd", "muzafarabad", "muzaffarabd"],
        "mirpur": ["mirpur ajk", "mirpurajk"],
        "rawalakot": ["rawala kot", "rawalakot ajk"],
        "abbottabad": ["abbotabad", "abottabad"],
        "islamabad": ["isb"],
        "rawalpindi": ["pindi", "rwp"],
      };
      const isServicable = serviceableCities.some(c => {
        const normC = normalizeCity(c);
        if (normC === userCity) return true;
        const aliases = cityAliases[normC] || [];
        return aliases.some(alias => normalizeCity(alias) === userCity);
      });
      if (!isServicable) {
        showToast(
          T("cityNotServiceable" as TranslationKey)
            .replace("{cities}", serviceableCities.join(", "))
            .replace("{city}", selectedAddr.city),
          "error",
        );
        return;
      }
    }
    if (total < orderRules.minOrderAmount) {
      showToast(
        T("minOrderToast" as TranslationKey)
          .replace("{min}", String(orderRules.minOrderAmount))
          .replace("{diff}", String(orderRules.minOrderAmount - total)),
        "error",
      );
      return;
    }
    if (total > orderRules.maxCartValue) {
      showToast(`Cart value cannot exceed Rs.${orderRules.maxCartValue.toLocaleString()}`, "error");
      return;
    }

    if (!isPickup) {
      try {
        const svcQ = cartType === "mixed" ? "mart" : cartType;
        const pidQ = items[0]?.productId;
        const eligQs = `serviceType=${svcQ}${pidQ ? `&productId=${pidQ}` : ""}`;
        const eligRes = await fetch(`${API_BASE}/delivery/eligibility?${eligQs}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (eligRes.ok) {
          const eligData = await eligRes.json();
          const elig = eligData?.data ?? eligData;
          if (elig && elig.eligible === false) {
            const blockMsg = elig.reason === "user_not_whitelisted"
              ? "Delivery is not available for your account at this time. You can use self-pickup."
              : elig.reason === "store_not_whitelisted"
              ? "Delivery is not available for this store at this time. You can use self-pickup."
              : "Delivery is not available at this time. You can use self-pickup.";
            setDeliveryBlocked(blockMsg);
            showToast(blockMsg, "error");
            return;
          }
        }
      } catch (eligErr) {
        if (__DEV__) console.warn("[Cart] Delivery eligibility pre-check failed — proceeding to checkout:", eligErr instanceof Error ? eligErr.message : String(eligErr));
      }
    }

    const cartResult = await validateCart();
    if (!cartResult.valid) {
      return;
    }

    if (isPickup) {
      setLoading(true);
      try { await placeOrder("pickup"); }
      catch (e: any) { showToast(e.message || T("couldNotPlaceOrder"), "error"); }
      setLoading(false);
      return;
    }

    if (effectivePayMethod === "wallet") {
      if ((user?.walletBalance ?? 0) < grandTotal) {
        showToast(`Wallet has Rs. ${user?.walletBalance ?? 0} — Rs. ${grandTotal} required`, "error");
        return;
      }
      setLoading(true);
      try { await placeOrder("wallet"); }
      catch (e: any) {
        const rc = e?.data?.reasonCode ?? e?.reasonCode;
        const isDeliveryBlock = rc === "delivery_not_eligible" || e?.message?.includes("Delivery is not available");
        const errText = e?.data?.error ?? e?.message ?? T("couldNotPlaceOrder");
        if (isDeliveryBlock) setDeliveryBlocked(errText);
        showToast(errText, "error");
      }
      setLoading(false);
      return;
    }

    if (effectivePayMethod === "jazzcash" || effectivePayMethod === "easypaisa") {
      const jazzProofReq = platformConfig.payment?.jazzcashProofRequired ?? false;
      const receiptProofReq = platformConfig.payment?.paymentReceiptRequired ?? false;
      const proofRequired = jazzProofReq || receiptProofReq;
      if (proofRequired) {
        if (!receiptImageUri) {
          showToast("Please upload a payment receipt screenshot before placing the order.", "error");
          return;
        }
        setLoading(true);
        setReceiptUploading(true);
        try {
          const uploadedUrl = await uploadReceiptImage(receiptImageUri);
          setReceiptUploading(false);
          await placeOrder(effectivePayMethod, uploadedUrl, receiptTxnRef.trim() || undefined);
        } catch (e: any) {
          setReceiptUploading(false);
          const errText = e?.data?.error ?? e?.message ?? "Upload or order placement failed";
          showToast(errText, "error");
        }
        setLoading(false);
        return;
      }
      if (receiptImageUri) {
        setLoading(true);
        setReceiptUploading(true);
        try {
          const uploadedUrl = await uploadReceiptImage(receiptImageUri);
          setReceiptUploading(false);
          await placeOrder(effectivePayMethod, uploadedUrl, receiptTxnRef.trim() || undefined);
        } catch (e: any) {
          setReceiptUploading(false);
          const errText = e?.data?.error ?? e?.message ?? "Upload or order placement failed";
          showToast(errText, "error");
        }
        setLoading(false);
        return;
      }
      setGwStep("input");
      setGwMobile("");
      setShowGwModal(true);
      return;
    }

    setLoading(true);
    try { await placeOrder("cash"); }
    catch (e: any) {
      const rc = e?.data?.reasonCode ?? e?.reasonCode;
      const isDeliveryBlock = rc === "delivery_not_eligible" || e?.message?.includes("Delivery is not available");
      const errText = e?.data?.error ?? e?.message ?? T("couldNotPlaceOrderRetry");
      if (isDeliveryBlock) setDeliveryBlocked(errText);
      showToast(errText, "error");
    }
    setLoading(false);
  };

  const pickReceiptImage = async (source: "camera" | "gallery") => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { showToast("Camera permission required", "error"); return; }
        result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7, base64: false });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { showToast("Photo library permission required", "error"); return; }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7, base64: false });
      }
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.mimeType) receiptMimeCache.current.set(asset.uri, asset.mimeType);
      setReceiptImageUri(asset.uri);
    } catch { showToast("Could not pick image", "error"); }
  };

  const uploadReceiptImage = async (uri: string): Promise<string> => {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    const cached = receiptMimeCache.current.get(uri);
    let mime = cached || "image/jpeg";
    if (!cached) {
      const lower = uri.toLowerCase();
      if (lower.endsWith(".png")) mime = "image/png";
      else if (lower.endsWith(".webp")) mime = "image/webp";
    }
    const dataUrl = `data:${mime};base64,${base64}`;
    const res = await fetch(`${API_BASE}/uploads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ file: dataUrl, mimeType: mime }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Image upload failed");
    const unwrapped = data?.data ?? data;
    if (!unwrapped?.url) throw new Error("No URL returned from upload");
    return unwrapped.url as string;
  };

  const buildGpsPayload = async (): Promise<Record<string, unknown>> => {
    const result: Record<string, unknown> = {};
    if (platformConfig.security?.orderGpsCaptureEnabled) {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          result.customerLat = pos.coords.latitude;
          result.customerLng = pos.coords.longitude;
          result.gpsAccuracy = pos.coords.accuracy ?? null;
        }
      } catch (gpsErr) {
        if (__DEV__) console.warn("[Cart] GPS capture failed — order placed without GPS metadata:", gpsErr instanceof Error ? gpsErr.message : String(gpsErr));
      }
    }
    if (selectedAddr?.latitude != null && selectedAddr?.longitude != null) {
      result.deliveryLat = selectedAddr.latitude;
      result.deliveryLng = selectedAddr.longitude;
    }
    return result;
  };

  const handleGwPay = async () => {
    const digits = gwMobile.replace(/\D/g, "");
    if (digits.length !== 11 || !digits.startsWith("03")) {
      setGwMobileError("Enter a valid 11-digit number starting with 03");
      return;
    }
    setGwMobileError(null);
    if (gwCancellingRef.current) return;
    setGwPaying(true);
    setGwStep("waiting");
    setGwBackgrounded(false);
    try {
      const GW_MAX_RETRIES = 3;
      let gwLastError: Error | null = null;
      let order: OrderResponse | null = null;
      const gwIdemKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const gwGpsPayload = await buildGpsPayload();
      for (let attempt = 0; attempt < GW_MAX_RETRIES; attempt++) {
        try {
          order = await createOrder({
            type: cartType === "mixed" ? "mart" : cartType,
            items: items.map(i => ({
              productId: i.productId, name: i.name,
              price: i.price, quantity: i.quantity, image: i.image,
            })),
            deliveryAddress: deliveryLine,
            paymentMethod: payMethod,
            idempotencyKey: gwIdemKey,
            ...(promoCode ? { promoCode } : {}),
            ...gwGpsPayload,
          } as any);
          gwLastError = null;
          break;
        } catch (err: any) {
          gwLastError = err;
          const status = err?.status ?? err?.statusCode ?? 0;
          if (status >= 400 && status < 500) throw err;
          if (attempt < GW_MAX_RETRIES - 1) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
      if (gwLastError || !order) {
        throw gwLastError ?? new Error("Order creation failed after retries");
      }
      const realOrderId = order?.id;
      if (!realOrderId) { throw new Error("Could not create order"); }

      const r = await fetch(`${API_BASE}/payments/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          gateway: payMethod, amount: grandTotal,
          orderId: realOrderId, mobileNumber: gwMobile.replace(/\D/g, ""),
        }),
      });
      const rawData = await r.json() as any;
      if (!r.ok) {
        gwCancellingRef.current = true;
        let cancelOk = false;
        for (let ci = 0; ci < 3; ci++) {
          try {
            await cancelPendingOrder(realOrderId);
            cancelOk = true;
            break;
          } catch {
            if (ci < 2) await new Promise(r => setTimeout(r, 1000 * (ci + 1)));
          }
        }
        gwCancellingRef.current = false;
        if (!cancelOk) {
          showToast("Could not cancel the order after payment failure. Please contact support.", "error");
        }
        throw new Error(rawData.error || "Could not initiate payment");
      }
      const data = unwrapApiResponse(rawData) as any;

      gwOrderId.current = realOrderId;
      gwTxnRef.current = data.txnRef || data.transactionRef || realOrderId;
    } catch (e: any) {
      showToast(e.message || T("paymentFailed"), "error");
      setGwStep("input");
    }
    setGwPaying(false);
  };

  const cancelPendingOrder = async (orderId: string) => {
    const res = await fetch(`${API_BASE}/orders/${orderId}/cancel`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reason: "payment_failed" }),
    });
    if (res.status === 404) return;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Cancel failed with status ${res.status}`);
    }
  };

  const gwName = payMethod === "jazzcash" ? "JazzCash" : "EasyPaisa";
  const gwLogo = payMethod === "jazzcash" ? "🔴" : "🟢";
  const gwColor = payMethod === "jazzcash" ? C.red : C.greenBright;

  const gwMobileDigits = gwMobile.replace(/\D/g, "");
  const gwMobileValid = gwMobileDigits.length === 11 && gwMobileDigits.startsWith("03");

  type NumPadBtn = { label: string; action: () => void; isOk?: boolean; disabled?: boolean };
  const numPadRows: NumPadBtn[][] = [
    [
      { label: "1", action: () => gwMobile.length < 11 && setGwMobile(p => p + "1") },
      { label: "2", action: () => gwMobile.length < 11 && setGwMobile(p => p + "2") },
      { label: "3", action: () => gwMobile.length < 11 && setGwMobile(p => p + "3") },
    ],
    [
      { label: "4", action: () => gwMobile.length < 11 && setGwMobile(p => p + "4") },
      { label: "5", action: () => gwMobile.length < 11 && setGwMobile(p => p + "5") },
      { label: "6", action: () => gwMobile.length < 11 && setGwMobile(p => p + "6") },
    ],
    [
      { label: "7", action: () => gwMobile.length < 11 && setGwMobile(p => p + "7") },
      { label: "8", action: () => gwMobile.length < 11 && setGwMobile(p => p + "8") },
      { label: "9", action: () => gwMobile.length < 11 && setGwMobile(p => p + "9") },
    ],
    [
      { label: "⌫", action: () => setGwMobile(p => p.slice(0, -1)) },
      { label: "0", action: () => gwMobile.length < 11 && setGwMobile(p => p + "0") },
      { label: "✓", action: handleGwPay, isOk: true, disabled: !gwMobileValid },
    ],
  ];

  const GatewayModal = () => (
    <Modal visible={showGwModal} transparent animationType="slide" onRequestClose={() => { if (!gwPaying) setShowGwModal(false); }}>
      <TouchableOpacity activeOpacity={0.7} style={styles.overlay} onPress={() => { if (!gwPaying) setShowGwModal(false); }}>
        <TouchableOpacity activeOpacity={0.7} style={[styles.sheet, { paddingBottom: 32 }]} onPress={e => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <Text style={{ fontSize: 36, marginBottom: 8 }}>{gwLogo}</Text>
            <Text style={{ ...Typ.h3, color: C.text }}>{T("payWithLabel" as TranslationKey)} {gwName}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Text style={{ ...Typ.bodyMedium, fontSize: 13, color: C.textSecondary }}>Rs. {grandTotal.toLocaleString()}</Text>
            </View>
          </View>

          {gwStep === "input" && (
            <>
              <Text style={{ ...Typ.buttonSmall, color: C.text, marginBottom: 8 }}>
                {gwName} {T("mobileNumberLabel" as TranslationKey)}
              </Text>
              <View style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 14, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, marginBottom: 16, backgroundColor: C.surfaceSecondary }}>
                <Text style={{ fontSize: 16, color: C.textSecondary, marginRight: 8 }}>{gwLogo}</Text>
                <Text style={{ ...Typ.body, color: C.textSecondary, marginRight: 4 }}>+92</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...Typ.bodyMedium, fontSize: 15, color: gwMobile ? C.text : C.textSecondary, paddingVertical: 14 }}>
                    {gwMobile || "03XX-XXXXXXX"}
                  </Text>
                </View>
              </View>
              {gwMobileError && (
                <Text style={{ ...Typ.caption, color: C.red, marginBottom: 8, marginLeft: 2 }}>{gwMobileError}</Text>
              )}
              <View style={{ gap: 8, marginBottom: 16 }}>
                {numPadRows.map((row, ri) => (
                  <View key={ri} style={{ flexDirection: "row", gap: 8 }}>
                    {row.map((btn, ci) => (
                      <TouchableOpacity activeOpacity={0.7}
                        key={ci}
                        onPress={btn.action}
                        disabled={btn.disabled}
                        style={{
                          flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center",
                          backgroundColor: btn.isOk ? gwColor : C.surfaceSecondary,
                          borderWidth: 1, borderColor: btn.isOk ? "transparent" : C.border,
                          opacity: btn.disabled ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ ...Typ.title, color: btn.isOk ? C.textInverse : C.text }}>{btn.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
              <TouchableOpacity activeOpacity={0.7} onPress={() => { if (!gwPaying) setShowGwModal(false); }} style={{ marginTop: 12, paddingVertical: 12, alignItems: "center" }}>
                <Text style={{ ...Typ.bodyMedium, color: C.textSecondary }}>{T("cancel")}</Text>
              </TouchableOpacity>
            </>
          )}

          {gwStep === "waiting" && !gwBackgrounded && (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <ActivityIndicator size="large" color={gwColor} />
              <Text style={{ ...Typ.h3, fontSize: 16, color: C.text, marginTop: 20 }}>{T("paymentProcessing" as TranslationKey)}</Text>
              <Text style={{ ...Typ.body, fontSize: 13, color: C.textSecondary, marginTop: 8, textAlign: "center" }}>
                {`A ${gwName} notification will be sent to ${gwMobile} — please approve`}
              </Text>
            </View>
          )}

          {gwStep === "waiting" && gwBackgrounded && (
            <View style={{ alignItems: "center", paddingVertical: 24, gap: 16 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="hourglass-outline" size={32} color="#F59E0B" />
              </View>
              <Text style={{ ...Typ.h3, fontSize: 16, color: C.text, textAlign: "center" }}>
                {T("waitingForApproval" as TranslationKey)}: {gwName}
              </Text>
              <Text style={{ ...Typ.body, fontSize: 13, color: C.textSecondary, textAlign: "center", maxWidth: 260 }}>
                You left the {gwName} app. Did you approve the payment?
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setGwBackgrounded(false);
                  const oid = gwOrderId.current;
                  if (!oid) return;
                  (async () => {
                    try {
                      const r = await fetch(`${API_BASE}/payments/${encodeURIComponent(oid)}/status`, {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                      });
                      const d = unwrapApiResponse<{ status?: string; message?: string }>(await r.json());
                      if (!mountedRef.current) return;
                      if (d?.status === "completed" || d?.status === "success") {
                        const successData = { id: (oid ?? "").slice(-6).toUpperCase(), time: "30-45 min", payMethod };
                        setPendingOrderId(oid, successData);
                        setPendingAck(true);
                        startAckStuckTimer(60000);
                        setGwStep("done");
                        setShowGwModal(false);
                      } else if (d?.status === "failed" || d?.status === "expired") {
                        setGwStep("input");
                        await cancelPendingOrder(oid);
                        showToast(d?.message || T("paymentNotSuccessful"), "error");
                      } else {
                        showToast(T("paymentPending") || "Payment still pending in your app", "info");
                      }
                    } catch {
                      showToast(T("paymentServerError") || "Could not check payment status", "error");
                    }
                  })();
                }}
                style={{ backgroundColor: gwColor, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: "100%", alignItems: "center" }}
              >
                <Text style={{ ...Typ.buttonMedium, color: C.textInverse }}>{T("resumePayment" as TranslationKey)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={async () => {
                  const oid = gwOrderId.current;
                  setGwStep("input");
                  setShowGwModal(false);
                  setGwBackgrounded(false);
                  if (oid) {
                    try {
                      await cancelPendingOrder(oid);
                    } catch {
                      showToast("Could not cancel the order. Please contact support.", "error");
                    }
                  }
                  showToast(T("orderCancelledSuccess"), "info");
                }}
                style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32, width: "100%", alignItems: "center" }}
              >
                <Text style={{ ...Typ.buttonSmall, color: C.textMuted }}>{T("cancelOrder")}</Text>
              </TouchableOpacity>
            </View>
          )}

          {gwStep === "done" && (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <Text style={{ fontSize: 48 }}>✅</Text>
              <Text style={{ ...Typ.h3, fontSize: 16, color: C.greenBright, marginTop: 12 }}>{T("paymentSuccessful" as TranslationKey)}</Text>
              <Text style={{ ...Typ.body, fontSize: 13, color: C.textSecondary, marginTop: 6 }}>{T("placingOrder" as TranslationKey)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  if (pendingAck && ackStuck && !orderSuccess) {
    return (
      <View style={[styles.container, { backgroundColor: C.background, justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.warnBg ?? "#FFF3E0", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <Ionicons name="time-outline" size={32} color={C.gold ?? "#F59E0B"} />
        </View>
        <Text style={{ ...Typ.title, color: C.text, textAlign: "center", marginBottom: 8 }}>{T("orderConfirmDelayed" as TranslationKey)}</Text>
        <Text style={{ ...Typ.body, fontSize: 13, color: C.textMuted, textAlign: "center", maxWidth: 280, marginBottom: 24 }}>
          {T("orderConfirmDelayedDesc" as TranslationKey)}
        </Text>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { dismissAck(); router.push("/(tabs)/orders"); }}
          style={{ backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: "100%", alignItems: "center", marginBottom: 12 }}
        >
          <Text style={{ ...Typ.buttonMedium, color: C.textInverse }}>{T("checkMyOrders" as TranslationKey)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => dismissAck()}
          style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32, width: "100%", alignItems: "center" }}
        >
          <Text style={{ ...Typ.buttonSmall, color: C.textMuted }}>{T("retryAgain" as TranslationKey)}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (pendingAck && !orderSuccess) {
    return (
      <View style={[styles.container, { backgroundColor: C.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={{ ...Typ.subtitle, color: C.text, marginTop: 16 }}>{T("confirmingOrder" as TranslationKey)}</Text>
        <Text style={{ ...Typ.body, fontSize: 13, color: C.textMuted, marginTop: 6, textAlign: "center", maxWidth: 260 }}>
          {T("waitingServerConfirm" as TranslationKey)}
        </Text>
      </View>
    );
  }

  if (orderSuccess) {
    const methodLabel: Record<string, string> = {
      cash: "Cash on Delivery", wallet: `${appName} Wallet`,
      jazzcash: "JazzCash ✅", easypaisa: "EasyPaisa ✅",
    };
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={styles.successWrap}>
          <LinearGradient colors={[C.emeraldDeep, C.emerald]} style={styles.successCircle}>
            <Ionicons name="checkmark" size={44} color={C.textInverse} />
          </LinearGradient>
          <Text style={styles.successTitle}>{T("orderPlacedSuccess")}</Text>
          <Text style={styles.successId}>{T("orderNumber" as TranslationKey)}{orderSuccess.id}</Text>
          <Text style={styles.successAddr} numberOfLines={2}>{deliveryLine}</Text>
          <Text style={styles.successEta}>{T("etaLabel" as TranslationKey)}: {orderSuccess.time}</Text>
          <View style={{ backgroundColor: C.greenBg, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 6, borderWidth: 1, borderColor: C.greenBorder }}>
            <Text style={{ ...Typ.buttonSmall, color: C.greenDeep, textAlign: "center" }}>
              {T("payment")}: {methodLabel[orderSuccess.payMethod || "cash"] || orderSuccess.payMethod}
            </Text>
          </View>
          <View style={styles.successBtns}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { clearOrderSuccess(); router.push("/(tabs)/orders"); }} style={styles.trackBtn}>
              <Ionicons name="navigate-outline" size={16} color={C.textInverse} />
              <Text style={styles.trackBtnTxt}>{T("trackOrder")}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={() => { clearOrderSuccess(); router.replace("/(tabs)"); }} style={styles.homeBtn}>
              <Ionicons name="home-outline" size={16} color={C.primary} />
              <Text style={styles.homeBtnTxt}>{T("home")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: C.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={C.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: C.text }]}>{T("cart" as TranslationKey)}</Text>
            <View style={{ width: 34 }} />
          </View>
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <Ionicons name="bag-outline" size={48} color={C.primary} />
          </View>
          <Text style={styles.emptyTitle}>{T("cartEmpty")}</Text>
          <Text style={styles.emptyText}>{T("addItemsHint" as TranslationKey)}</Text>
          <View style={styles.emptyBtns}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/mart")} style={styles.emptyBtn}>
              <Ionicons name="storefront-outline" size={16} color={C.textInverse} />
              <Text style={styles.emptyBtnText}>{T("browseMart" as TranslationKey)}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/food")} style={[styles.emptyBtn, { backgroundColor: C.food }]}>
              <Ionicons name="restaurant-outline" size={16} color={C.textInverse} />
              <Text style={styles.emptyBtnText}>{T("browseFood" as TranslationKey)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <AuthGateSheet {...authSheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <LinearGradient
        colors={[C.brandBlueDark, C.brandBlue, C.brandBlueMid]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.textInverse} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{cartType === "food" ? "Food Order" : cartType === "pharmacy" ? "Pharmacy Order" : "Mart Order"}</Text>
            <Text style={styles.headerSub}>{items.length} item{items.length !== 1 ? "s" : ""} in cart</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setShowClearConfirm(true)} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={14} color={C.textInverse} />
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {showClearConfirm && (
          <View style={styles.clearConfirm}>
            <Text style={styles.clearConfirmTxt}>Remove all items?</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity activeOpacity={0.7} onPress={() => setShowClearConfirm(false)} style={styles.clearNo}>
                <Text style={styles.clearNoTxt}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={() => {
                const snapshot = [...items];
                clearCart();
                setShowClearConfirm(false);
                setUndoSnapshot(snapshot);
                setShowUndoClear(true);
                if (undoClearTimerRef.current) clearTimeout(undoClearTimerRef.current);
                undoClearTimerRef.current = setTimeout(() => {
                  setShowUndoClear(false);
                  setUndoSnapshot(null);
                }, 5000);
              }} style={styles.clearYes}>
                <Text style={styles.clearYesTxt}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </LinearGradient>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Your Items</Text>
            <View style={styles.itemCountBadge}>
              <Text style={styles.itemCountText}>{items.reduce((s, i) => s + i.quantity, 0)}</Text>
            </View>
          </View>
          {items.map((item, idx) => {
            const typeConfig: Record<string, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
              food: { label: "Food", color: C.amber, bg: C.amberSoft, icon: "restaurant" },
              mart: { label: "Mart", color: C.brandBlue, bg: C.blueSoft, icon: "storefront" },
              pharmacy: { label: "Pharma", color: "#8B5CF6", bg: "#F3E8FF", icon: "medical" },
            };
            const tc = typeConfig[item.type] || typeConfig.mart;
            const unitPrice = Number(item?.price ?? 0);
            const qty = Number(item?.quantity ?? 1);
            const lineTotal = unitPrice * qty;
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                key={item.productId}
                onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.productId } })}
                style={[styles.cartItem, idx === items.length - 1 && { marginBottom: 0 }]}
              >
                <View style={[styles.itemThumb, { backgroundColor: tc.bg }]}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : (
                    <Ionicons name={tc.icon} size={24} color={tc.color} />
                  )}
                  <View style={[styles.typeBadge, { backgroundColor: tc.color }]}>
                    <Text style={styles.typeBadgeText}>{tc.label}</Text>
                  </View>
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  <View style={styles.itemPriceRow}>
                    <Text style={styles.itemUnitPrice}>Rs. {unitPrice.toLocaleString()}</Text>
                    <Text style={styles.itemUnitSep}> × </Text>
                    <Text style={styles.itemQtyInline}>{qty}</Text>
                  </View>

                  <View style={styles.itemBottomRow}>
                    <View style={styles.qtyControl}>
                      <TouchableOpacity activeOpacity={0.7} onPress={(e) => { e?.stopPropagation?.(); updateQuantity(item.productId, qty - 1); }} style={[styles.qtyBtn, qty === 1 && styles.qtyBtnDanger]}>
                        <Ionicons name={qty === 1 ? "trash-outline" : "remove"} size={14} color={qty === 1 ? C.danger : C.primary} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{qty}</Text>
                      <TouchableOpacity activeOpacity={0.7} onPress={(e) => { e?.stopPropagation?.(); updateQuantity(item.productId, qty + 1); }} style={styles.qtyBtn}>
                        <Ionicons name="add" size={14} color={C.primary} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.itemTotal}>Rs. {lineTotal.toLocaleString()}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => setShowAddrPicker(true)}
            style={styles.addrCard}
          >
            <View style={styles.addrCardIcon}>
              <Ionicons name="location-outline" size={20} color={C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              {addrLoading ? (
                <ActivityIndicator size="small" color={C.primary} />
              ) : (
                <>
                  <Text style={styles.addrCardLabel}>
                    {selectedAddr ? selectedAddr.label : T("deliveryAddress")}
                  </Text>
                  <Text style={styles.addrCardValue} numberOfLines={2}>
                    {selectedAddr ? `${selectedAddr.address}, ${selectedAddr.city}` : T("selectAnAddress")}
                  </Text>
                </>
              )}
            </View>
            {addresses.length > 0 && (
              <View style={styles.changeBtn}>
                <Text style={styles.changeBtnText}>Change</Text>
                <Ionicons name="chevron-forward" size={14} color={C.primary} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.section, styles.etaRow]}>
          <View style={styles.etaIconWrap}>
            <Ionicons name="time-outline" size={16} color={C.success} />
          </View>
          <Text style={styles.etaText}>
            Estimated delivery: {cartType === "food" ? "25–40 min" : "30–50 min"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          {availablePayMethods.filter(m => m.available).map(method => {
            const sel = payMethod === method.id;
            const iconMap: Record<string, any> = {
              cash: "cash-outline", wallet: "wallet-outline",
              jazzcash: "card-outline", easypaisa: "phone-portrait-outline",
            };
            const colorMap: Record<string, { bg: string; tint: string }> = {
              cash: { bg: C.emeraldSoft, tint: C.success },
              wallet: { bg: C.brandBlueSoft, tint: C.primary },
              jazzcash: { bg: C.redSoft, tint: C.red },
              easypaisa: { bg: C.greenLightBg, tint: C.greenBright },
            };
            const clr = colorMap[method.id] || { bg: C.surfaceSecondary, tint: C.textSecondary };
            const isGateway = method.id === "jazzcash" || method.id === "easypaisa";
            return (
              <TouchableOpacity activeOpacity={0.7}
                key={method.id}
                onPress={() => { setPayMethod(method.id as PayMethod); if (method.id !== "jazzcash" && method.id !== "easypaisa") { setReceiptImageUri(null); setReceiptTxnRef(""); } }}
                style={[styles.payOption, sel && { borderColor: clr.tint, backgroundColor: clr.bg + "33" }]}
              >
                <View style={[styles.payIcon, { backgroundColor: sel ? clr.bg : C.surfaceSecondary }]}>
                  {isGateway
                    ? <Text style={{ fontSize: 18 }}>{method.logo}</Text>
                    : <Ionicons name={iconMap[method.id]} size={20} color={sel ? clr.tint : C.textSecondary} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.payLabel, sel && { color: C.text }]}>{method.label}</Text>
                  </View>
                  {method.id === "wallet" ? (
                    <Text style={[styles.paySub, user && (user?.walletBalance ?? 0) < grandTotal && { color: C.danger }]}>
                      Balance: Rs. {user?.walletBalance?.toLocaleString() || 0}
                      {user && (user?.walletBalance ?? 0) < grandTotal ? " (insufficient)" : ""}
                    </Text>
                  ) : (
                    <Text style={styles.paySub}>{method.description}</Text>
                  )}
                </View>
                {isGateway && sel && (() => {
                  const proofReq = (platformConfig.payment?.jazzcashProofRequired ?? false) || (platformConfig.payment?.paymentReceiptRequired ?? false);
                  return (
                    <View style={{ backgroundColor: clr.tint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 }}>
                      <Text style={{ ...Typ.smallBold, color: C.textInverse }}>{proofReq ? "Upload Receipt ↓" : "Enter No. →"}</Text>
                    </View>
                  );
                })()}
                {!isGateway && (
                  <View style={[styles.radio, sel && { borderColor: clr.tint }]}>
                    {sel && <View style={[styles.radioDot, { backgroundColor: clr.tint }]} />}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {(() => {
          const jazzProofReq = platformConfig.payment?.jazzcashProofRequired ?? false;
          const receiptProofReq = platformConfig.payment?.paymentReceiptRequired ?? false;
          const proofRequired = jazzProofReq || receiptProofReq;
          const isManualMethod = payMethod === "jazzcash" || payMethod === "easypaisa";
          if (!isManualMethod) return null;
          return (
            <View style={[styles.section, { paddingTop: 0 }]}>
              <View style={{ backgroundColor: proofRequired ? "#FFF3CD" : "#F0F9FF", borderRadius: 14, borderWidth: 1, borderColor: proofRequired ? "#FFC107" : "#BAE6FD", padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Ionicons name="receipt-outline" size={18} color={proofRequired ? "#D97706" : "#0284C7"} />
                  <Text style={{ ...Typ.captionMedium, color: proofRequired ? "#92400E" : "#0C4A6E", fontFamily: Font.semiBold }}>
                    Payment Receipt Screenshot {proofRequired ? "(Required)" : "(Optional)"}
                  </Text>
                </View>
                <Text style={{ ...Typ.caption, color: proofRequired ? "#78350F" : "#164E63", marginBottom: 10 }}>
                  {proofRequired
                    ? "Please send payment to the admin's number and upload a screenshot as proof."
                    : "Optionally upload a payment screenshot for faster verification."}
                </Text>
                <TextInput
                  value={receiptTxnRef}
                  onChangeText={setReceiptTxnRef}
                  placeholder={proofRequired ? "Transaction ID (recommended)" : "Transaction ID (optional)"}
                  placeholderTextColor={proofRequired ? "#B45309" : "#94A3B8"}
                  style={{ backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: 1, borderColor: proofRequired ? "#FCD34D" : "#CBD5E1", paddingHorizontal: 12, paddingVertical: 9, ...Typ.caption, color: "#1E293B", marginBottom: 10 }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {receiptImageUri ? (
                  <View>
                    <Image source={{ uri: receiptImageUri }} style={{ width: "100%", height: 160, borderRadius: 12, marginBottom: 8 }} resizeMode="cover" />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity activeOpacity={0.7}
                        onPress={() => pickReceiptImage("gallery")}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: "center", backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#CBD5E1" }}
                      >
                        <Text style={{ ...Typ.captionMedium, color: "#475569" }}>Change Photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.7}
                        onPress={() => setReceiptImageUri(null)}
                        style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, alignItems: "center", backgroundColor: "#FEE2E2", borderWidth: 1, borderColor: "#FCA5A5" }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={() => pickReceiptImage("camera")}
                      style={{ flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, backgroundColor: proofRequired ? "#FEF3C7" : "#F0F9FF", borderWidth: 1.5, borderColor: proofRequired ? "#FCD34D" : "#7DD3FC", borderStyle: "dashed" }}
                    >
                      <Ionicons name="camera-outline" size={18} color={proofRequired ? "#D97706" : "#0284C7"} />
                      <Text style={{ ...Typ.captionMedium, color: proofRequired ? "#D97706" : "#0284C7" }}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={() => pickReceiptImage("gallery")}
                      style={{ flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, backgroundColor: proofRequired ? "#FEF3C7" : "#F0F9FF", borderWidth: 1.5, borderColor: proofRequired ? "#FCD34D" : "#7DD3FC", borderStyle: "dashed" }}
                    >
                      <Ionicons name="images-outline" size={18} color={proofRequired ? "#D97706" : "#0284C7"} />
                      <Text style={{ ...Typ.captionMedium, color: proofRequired ? "#D97706" : "#0284C7" }}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promo Code</Text>

          {/* Auto-apply best offer banner */}
          {!promoApplied && autoApplyOffer && !autoApplyDismissed && (
            <View style={{ backgroundColor: "#F0FDF4", borderRadius: 14, borderWidth: 1, borderColor: "#86EFAC", padding: 14, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#166534" }}>✨ Best Offer Found</Text>
                <TouchableOpacity onPress={() => { setAutoApplyDismissed(true); setAutoApplyActive(false); }}>
                  <Ionicons name="close-circle-outline" size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: "#15803D", marginBottom: 10 }} numberOfLines={2}>
                {autoApplyOffer.savingsMessage}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setAutoApplyActive(true)}
                  style={{
                    flex: 1, backgroundColor: autoApplyActive ? "#16A34A" : "#22C55E",
                    borderRadius: 10, paddingVertical: 9, alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                    {autoApplyActive ? "✓ Applied" : "Apply Now"}
                  </Text>
                </TouchableOpacity>
                {autoApplyActive && (
                  <TouchableOpacity
                    onPress={() => setAutoApplyActive(false)}
                    style={{ flex: 1, backgroundColor: "#FEE2E2", borderRadius: 10, paddingVertical: 9, alignItems: "center" }}
                  >
                    <Text style={{ color: "#DC2626", fontWeight: "700", fontSize: 13 }}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {!promoApplied && availableOffers.length > 0 && (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ ...Typ.caption, color: C.textSecondary, marginBottom: 6 }}>💡 Available offers for your cart</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: "row" }}>
                {availableOffers.map(o => (
                  <TouchableOpacity
                    key={o.id}
                    activeOpacity={0.75}
                    onPress={() => { setPromoInput(o.code ?? ""); setPromoError(null); }}
                    style={{ backgroundColor: C.primaryLight ?? "#EDE9FF", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: C.primary + "40" }}
                  >
                    <Text style={{ ...Typ.smallBold, color: C.primary, fontFamily: Font.bold }}>
                      {o.code} · {o.discountPct ? `${o.discountPct}% off` : o.discountFlat ? `Rs.${o.discountFlat} off` : "Offer"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          <View style={[styles.summaryCard, { padding: 14 }]}>
            {promoApplied ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ flex: 1, backgroundColor: C.emeraldBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 18 }}>🏷️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.emeraldDeep }}>{promoCode}</Text>
                    <Text style={{ ...Typ.caption, color: C.emerald }}>Rs. {promoDiscount.toLocaleString()} discount applied!</Text>
                  </View>
                </View>
                <TouchableOpacity activeOpacity={0.7} onPress={removePromo} style={{ padding: 8 }}>
                  <Ionicons name="close-circle" size={24} color={C.red} />
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TextInput
                    value={promoInput}
                    onChangeText={t => { setPromoInput(t.toUpperCase()); setPromoError(null); }}
                    placeholder="Enter promo code"
                    placeholderTextColor={C.textSecondary}
                    autoCapitalize="characters"
                    maxLength={30}
                    style={{
                      flex: 1, borderWidth: 1.5, borderColor: promoError ? C.red : C.border,
                      borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
                      fontSize: 14, color: C.text, backgroundColor: C.surfaceSecondary,
                      fontFamily: Font.medium, letterSpacing: 1,
                    }}
                  />
                  <TouchableOpacity activeOpacity={0.7}
                    onPress={() => { void applyPromo(); }}
                    disabled={promoLoading || !promoInput.trim()}
                    style={{
                      backgroundColor: promoInput.trim() ? C.primary : C.border,
                      borderRadius: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", minWidth: 72,
                    }}
                  >
                    {promoLoading
                      ? <ActivityIndicator size="small" color={C.textInverse} />
                      : <Text style={{ color: C.textInverse, ...Typ.buttonSmall, fontFamily: Font.bold }}>Apply</Text>
                    }
                  </TouchableOpacity>
                </View>
                {promoError && (
                  <Text style={{ ...Typ.caption, color: C.red, marginTop: 6, marginLeft: 2 }}>{promoError}</Text>
                )}
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => router.push({ pathname: "/offers", params: { fromCart: "1" } })}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: C.primary + "50", backgroundColor: C.primaryLight ?? C.primarySoft }}
                  accessibilityRole="button" accessibilityLabel="Browse all offers and coupons"
                >
                  <Ionicons name="pricetag-outline" size={15} color={C.primary} />
                  <Text style={{ fontFamily: Font.semiBold, fontSize: 13, color: C.primary }}>Browse All Offers & Coupons</Text>
                  <Ionicons name="chevron-forward" size={14} color={C.primary} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</Text>
              <Text style={styles.summaryValue}>Rs. {total.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery Fee</Text>
              <Text style={[styles.summaryValue, deliveryFee === 0 && { color: C.success }]}>
                {deliveryFee === 0 ? "FREE 🎉" : `Rs. ${deliveryFee}`}
              </Text>
            </View>
            {finance.gstEnabled && gstAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>GST ({finance.gstPct}%)</Text>
                <Text style={[styles.summaryValue, { color: C.amber }]}>Rs. {gstAmount.toLocaleString()}</Text>
              </View>
            )}
            {promoDiscount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: C.emerald }]}>🏷️ Promo ({promoCode})</Text>
                <Text style={[styles.summaryValue, { color: C.emerald }]}>- Rs. {promoDiscount.toLocaleString()}</Text>
              </View>
            )}
            <View style={[styles.summaryRow, styles.summaryDivider]}>
              <Text style={styles.grandLabel}>Grand Total</Text>
              <Text style={styles.grandValue}>Rs. {grandTotal.toLocaleString()}</Text>
            </View>
            {finance.cashbackEnabled && cashbackAmt > 0 && (
              <View style={{ marginTop: 10, backgroundColor: C.emeraldBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 16 }}>🎁</Text>
                <Text style={{ ...Typ.captionMedium, color: C.emeraldDeep, flex: 1 }}>
                  Earn <Text style={{ fontFamily: Font.bold }}>Rs. {cashbackAmt}</Text> wallet cashback on this order!
                </Text>
              </View>
            )}
            {walletCashbackAmt > 0 && (
              <View style={{ marginTop: 6, backgroundColor: C.blueSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 16 }}>💰</Text>
                <Text style={{ ...Typ.captionMedium, color: C.navyDeep, flex: 1 }}>
                  Wallet bonus: Earn <Text style={{ fontFamily: Font.bold }}>Rs. {walletCashbackAmt}</Text> ({customer.walletCashbackPct}%) back!
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.checkoutBar, { paddingBottom: insets.bottom + 12 }]}>
        <View>
          <Text style={styles.checkoutTotal}>Rs. {grandTotal.toLocaleString()}</Text>
          <Text style={styles.checkoutItems}>{items.reduce((s, i) => s + i.quantity, 0)} items</Text>
        </View>
        {total < orderRules.minOrderAmount ? (
          <View style={styles.minOrderWrap}>
            <Text style={styles.minOrderTxt}>
              {T("minOrderToast" as TranslationKey).replace("{min}", String(orderRules.minOrderAmount)).replace("{diff}", String(orderRules.minOrderAmount - total))}
            </Text>
            <View style={[styles.minOrderBar]}>
              <View style={[styles.minOrderFill, { width: `${Math.min(100, (total / orderRules.minOrderAmount) * 100)}%` }]} />
            </View>
          </View>
        ) : deliveryBlocked ? (
          <View style={{ gap: 8 }}>
            <View style={{ backgroundColor: "#FEF3C7", borderRadius: 16, padding: 14, alignItems: "center", gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="alert-circle" size={18} color="#D97706" />
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400E" }}>Delivery Unavailable</Text>
              </View>
              <Text style={{ fontSize: 12, color: "#92400E", textAlign: "center" }}>{deliveryBlocked}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.checkoutBtn, { backgroundColor: "#059669" }, (loading || addrLoading) && { opacity: 0.7 }]}
              onPress={() => {
                setPayMethod("pickup");
                setDeliveryBlocked(null);
                handleCheckout("pickup");
              }}
              disabled={loading || addrLoading}
            >
              <Ionicons name="storefront-outline" size={16} color={C.textInverse} />
              <Text style={styles.checkoutBtnTxt}>Self-Pickup Instead</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.checkoutBtn,
              (loading || addrLoading || promoLoading || deliveryBlocked || isSubmittingOrder) && { opacity: 0.5 },
            ]}
            onPress={() => handleCheckout()}
            disabled={!!(loading || addrLoading || promoLoading || deliveryBlocked || isSubmittingOrder)}
          >
            {loading ? <ActivityIndicator color={C.textInverse} size="small" /> : promoLoading ? (
              <>
                <ActivityIndicator color={C.textInverse} size="small" />
                <Text style={styles.checkoutBtnTxt}>Validating promo...</Text>
              </>
            ) : deliveryBlocked ? (
              <>
                <Ionicons name="alert-circle" size={18} color={C.textInverse} />
                <Text style={styles.checkoutBtnTxt}>Delivery Blocked</Text>
              </>
            ) : (
              <>
                <Text style={styles.checkoutBtnTxt}>Place Order</Text>
                <Ionicons name="arrow-forward" size={18} color={C.textInverse} />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <AddressPickerModal
        visible={showAddrPicker}
        addresses={addresses}
        selected={selectedAddrId}
        onSelect={(a) => {
          if (a.id === "__gps__") {
            setGpsAddress(a);
            setAddresses(prev => {
              const without = prev.filter(x => x.id !== "__gps__");
              return [a, ...without];
            });
          }
          setSelectedAddrId(a.id);
        }}
        onClose={() => setShowAddrPicker(false)}
        token={token}
        addrLoaded={addrLoaded}
        onAddressCreated={(a) => {
          setAddresses(prev => [...prev, a]);
          setSelectedAddrId(a.id);
        }}
      />

      <GatewayModal />

      {showUndoClear && (
        <View style={{ position: "absolute", bottom: 90, left: 16, right: 16, backgroundColor: C.slateDeep, borderRadius: 14, flexDirection: "row", alignItems: "center", padding: 14, gap: 10, shadowColor: C.text, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 10 }}>
          <Ionicons name="trash-outline" size={18} color={C.textMuted} />
          <Text style={{ flex: 1, ...Typ.bodyMedium, fontSize: 13, color: C.surfaceSecondary }}>Cart cleared</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => {
            if (undoSnapshot) {
              restoreCart(undoSnapshot);
            }
            setShowUndoClear(false);
            setUndoSnapshot(null);
            if (undoClearTimerRef.current) clearTimeout(undoClearTimerRef.current);
          }}>
            <Text style={{ ...Typ.buttonSmall, fontFamily: Font.bold, color: C.primary }}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default withErrorBoundary(CartScreenInner);

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { paddingHorizontal: 16, paddingBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.overlayLight15, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...Typ.title, color: C.textInverse },
  headerSub: { ...Typ.caption, color: C.overlayLight75, marginTop: 2 },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.overlayLight15, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  clearText: { ...Typ.captionMedium, color: C.overlayLight90 },
  clearConfirm: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.overlayLight15, borderRadius: 14, padding: 12, marginTop: 10 },
  clearConfirmTxt: { ...Typ.bodyMedium, fontSize: 13, color: C.textInverse },
  clearNo: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: C.overlayLight20 },
  clearNoTxt: { ...Typ.captionMedium, color: C.textInverse },
  clearYes: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: C.red },
  clearYesTxt: { ...Typ.captionBold, color: C.textInverse },

  scroll: { flex: 1 },
  section: { paddingHorizontal: 16, paddingTop: 18 },
  sectionTitle: { ...Typ.h3, fontSize: 16, color: C.text, marginBottom: 12 },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  itemCountBadge: { backgroundColor: C.primary, borderRadius: 12, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  itemCountText: { ...Typ.smallBold, color: C.textInverse, fontSize: 12 },

  cartItem: { flexDirection: "row", gap: 12, padding: 12, backgroundColor: C.surface, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: C.borderLight, shadowColor: C.text, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  itemThumb: { width: 72, height: 72, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  typeBadge: { position: "absolute", top: 4, left: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  typeBadgeText: { fontSize: 9, fontFamily: Font.bold, color: C.textInverse, letterSpacing: 0.5, textTransform: "uppercase" },
  itemInfo: { flex: 1, justifyContent: "space-between" },
  itemName: { ...Typ.bodySemiBold, color: C.text, fontSize: 14, lineHeight: 20 },
  itemPriceRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  itemUnitPrice: { ...Typ.caption, color: C.textSecondary, fontSize: 12 },
  itemUnitSep: { ...Typ.caption, color: C.textMuted, fontSize: 12 },
  itemQtyInline: { ...Typ.captionMedium, color: C.textSecondary, fontSize: 12 },
  itemBottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  qtyControl: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: C.surfaceSecondary, borderRadius: 12, paddingHorizontal: 3, paddingVertical: 3 },
  qtyBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  qtyBtnDanger: { borderColor: C.danger + "44", backgroundColor: C.danger + "0D" },
  qtyText: { ...Typ.button, fontFamily: Font.bold, color: C.text, minWidth: 24, textAlign: "center", fontSize: 14 },
  itemTotal: { ...Typ.title, fontFamily: Font.bold, color: C.text, fontSize: 15 },

  addrCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1.5, borderColor: C.border },
  addrCardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.blueSoft, alignItems: "center", justifyContent: "center" },
  addrCardLabel: { ...Typ.bodySemiBold, color: C.text },
  addrCardValue: { ...Typ.caption, color: C.textMuted, marginTop: 2 },
  changeBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  changeBtnText: { ...Typ.captionMedium, fontFamily: Font.semiBold, color: C.primary },

  etaRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.greenBg, marginHorizontal: 16, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.greenBorder },
  etaIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.emeraldSoft, alignItems: "center", justifyContent: "center" },
  etaText: { ...Typ.bodyMedium, fontSize: 13, color: C.emeraldDeep, flex: 1 },

  payOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: C.surface, borderRadius: 16, marginBottom: 8, borderWidth: 1.5, borderColor: C.border },
  payIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  payLabel: { ...Typ.bodySemiBold, color: C.textSecondary },
  paySub: { ...Typ.caption, color: C.textMuted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 12, height: 12, borderRadius: 6 },

  summaryCard: { backgroundColor: C.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  summaryLabel: { ...Typ.body, fontSize: 13, color: C.textSecondary },
  summaryValue: { ...Typ.buttonSmall, color: C.text },
  summaryDivider: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12, marginTop: 4 },
  grandLabel: { ...Typ.h3, fontSize: 16, color: C.text },
  grandValue: { ...Typ.h3, color: C.primary },

  checkoutBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, shadowColor: C.text, shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  checkoutTotal: { ...Typ.title, color: C.text },
  checkoutItems: { ...Typ.caption, color: C.textMuted },
  checkoutBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 15, borderRadius: 16, shadowColor: C.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  checkoutBtnTxt: { ...Typ.button, fontFamily: Font.bold, color: C.textInverse },
  minOrderWrap: { flex: 1, marginLeft: 16, gap: 6 },
  minOrderTxt: { ...Typ.captionMedium, color: C.amber },
  minOrderBar: { height: 6, backgroundColor: C.amberSoft, borderRadius: 3, overflow: "hidden" as const },
  minOrderFill: { height: 6, backgroundColor: C.gold, borderRadius: 3 },

  overlay: { flex: 1, backgroundColor: C.overlayDark50, justifyContent: "flex-end" },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 },
  handle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginBottom: 18 },
  sheetTitle: { ...Typ.h3, color: C.text, marginBottom: 16 },

  addrOpt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, marginBottom: 8 },
  addrOptSel: { borderColor: C.primary, backgroundColor: C.blueSoft },
  addrOptIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  addrOptLabel: { ...Typ.bodySemiBold, color: C.text },
  addrOptAddress: { ...Typ.caption, color: C.textMuted, marginTop: 2 },
  addrOptCity: { ...Typ.small, color: C.textMuted },
  defaultTag: { backgroundColor: C.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  defaultTagText: { ...Typ.tiny, fontSize: 9, color: C.textInverse },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  cancelBtnText: { ...Typ.bodyMedium, color: C.textSecondary },

  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  successCircle: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { ...Typ.h2, color: C.text, marginBottom: 8, textAlign: "center" },
  successId: { ...Typ.subtitle, color: C.primary, marginBottom: 4 },
  successAddr: { ...Typ.body, fontSize: 13, color: C.textMuted, textAlign: "center", marginBottom: 4 },
  successEta: { ...Typ.bodySemiBold, color: C.success, marginBottom: 6 },
  successBtns: { flexDirection: "row", gap: 12, marginTop: 20, width: "100%" },
  trackBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.primary, borderRadius: 16, paddingVertical: 15, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  trackBtnTxt: { ...Typ.body, fontFamily: Font.bold, color: C.textInverse },
  homeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.blueSoft, borderRadius: 16, paddingVertical: 15 },
  homeBtnTxt: { ...Typ.bodySemiBold, color: C.primary },

  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyIconBox: { width: 88, height: 88, borderRadius: 28, backgroundColor: C.blueSoft, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyTitle: { ...Typ.title, color: C.text, marginBottom: 8 },
  emptyText: { ...Typ.body, color: C.textSecondary, marginBottom: 20 },
  emptyBtns: { flexDirection: "row", gap: 12 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14 },
  emptyBtnText: { ...Typ.buttonSmall, color: C.textInverse },
});

