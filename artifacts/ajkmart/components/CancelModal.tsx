import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { unwrapApiResponse } from "@/utils/api";

const C = Colors.light;

export type CancelTarget = {
  id: string;
  type: "order" | "ride" | "pharmacy" | "parcel";
  status: string;
  total?: number;
  fare?: number;
  paymentMethod?: string;
  riderAssigned?: boolean;
  cancelMinsLeft?: number;
};

const ORDER_CANCEL_REASONS = [
  { key: "changed_mind",    label: "Changed my mind",         icon: "swap-horizontal-outline" },
  { key: "wrong_items",     label: "Wrong items ordered",     icon: "alert-circle-outline" },
  { key: "found_cheaper",   label: "Found a better price",    icon: "pricetag-outline" },
  { key: "taking_too_long", label: "Taking too long",         icon: "time-outline" },
  { key: "other",           label: "Other reason",            icon: "chatbox-ellipses-outline" },
] as const;

const RIDE_CANCEL_REASONS = [
  { key: "changed_mind",   label: "Changed my mind",          icon: "swap-horizontal-outline" },
  { key: "wrong_location", label: "Wrong pickup / drop",      icon: "location-outline" },
  { key: "wait_too_long",  label: "Driver taking too long",   icon: "time-outline" },
  { key: "found_other",    label: "Found another ride",       icon: "car-outline" },
  { key: "other",          label: "Other reason",             icon: "chatbox-ellipses-outline" },
] as const;

function useIsWide() {
  const [wide, setWide] = useState(() => Dimensions.get("window").width >= 640);
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setWide(window.width >= 640);
    });
    return () => sub.remove();
  }, []);
  return wide;
}

/* On mobile Chrome the browser toolbar eats into 100vh / window height.
   window.innerHeight is the *visible* area, so we use that on web. */
function useVisibleHeight() {
  const getH = () =>
    Platform.OS === "web" && typeof window !== "undefined"
      ? window.innerHeight
      : Dimensions.get("window").height;

  const [h, setH] = useState(getH);

  useEffect(() => {
    if (Platform.OS !== "web") {
      const sub = Dimensions.addEventListener("change", () => setH(getH()));
      return () => sub.remove();
    }
    const onResize = () => setH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return h;
}

export function CancelModal({
  target,
  cancellationFee,
  apiBase,
  token,
  onClose,
  onDone,
}: {
  target: CancelTarget;
  cancellationFee: number;
  apiBase: string;
  token: string | null;
  onClose: () => void;
  onDone: (result: any) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const visibleHeight = useVisibleHeight();

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 68,
        friction: 11,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, []);

  const dismiss = (cb: () => void) => {
    if (loading) return;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.ease),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(cb);
  };

  const safeClose = () => dismiss(onClose);

  const isRide = target.type === "ride";
  const isPharmacy = target.type === "pharmacy";
  const isParcel = target.type === "parcel";
  const reasons = isRide ? RIDE_CANCEL_REASONS : ORDER_CANCEL_REASONS;
  const riderAssigned = target.riderAssigned ?? false;
  const hasFee = isRide && riderAssigned && cancellationFee > 0;
  const isWallet = target.paymentMethod === "wallet";
  const amount = isRide ? target.fare : target.total;

  const typeLabel = isRide ? "Ride" : isPharmacy ? "Pharmacy Order" : isParcel ? "Parcel" : "Order";
  const typePrefix = isRide ? "Ride" : isPharmacy ? "Order" : isParcel ? "Parcel" : "Order";
  const keepLabel = isRide ? "Keep Ride" : isParcel ? "Keep Booking" : "Keep Order";

  const handleConfirm = async () => {
    if (!selectedReason) { setError("Please select a cancellation reason."); return; }
    setLoading(true);
    setError("");
    try {
      const url = isRide
        ? `${apiBase}/rides/${target.id}/cancel`
        : isPharmacy
        ? `${apiBase}/pharmacy-orders/${target.id}/cancel`
        : isParcel
        ? `${apiBase}/parcel-bookings/${target.id}/cancel`
        : `${apiBase}/orders/${target.id}/cancel`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reason: selectedReason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setError(data.error || "This order has already been processed and cannot be cancelled.");
        } else {
          setError(data.error || "Could not cancel. Please try again.");
        }
        setLoading(false);
        return;
      }
      const result = unwrapApiResponse(await res.json().catch(() => ({})));
      dismiss(() => { onDone(result); onClose(); });
    } catch {
      setError("Network error. Please check your connection and try again.");
      setLoading(false);
    }
  };

  const sheetTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isWide ? [40, 0] : [340, 0],
  });

  const sheetScale = isWide
    ? slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] })
    : 1;

  const rideSheet: ViewStyle = isRide ? {
    backgroundColor: "#0E1526",
    borderTopColor: "rgba(252,211,77,0.18)",
    borderTopWidth: 1,
  } : {};

  /* Cap the sheet at 88% of the *actual visible* viewport so the footer
     never gets pushed below the browser's address bar on mobile Chrome. */
  const sheetMaxHeight = Math.floor(visibleHeight * 0.88);
  const bottomPad = Math.max(insets.bottom, Platform.OS === "web" ? 12 : 20);

  return (
    <Modal visible transparent animationType="none" onRequestClose={safeClose} statusBarTranslucent>
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={safeClose} />

        <Animated.View
          style={[
            s.sheet,
            isWide ? s.sheetWide : s.sheetMobile,
            { maxHeight: isWide ? undefined : sheetMaxHeight },
            !isWide && { paddingBottom: bottomPad },
            rideSheet,
            {
              transform: [
                { translateY: sheetTranslate },
                ...(isWide ? [{ scale: sheetScale as any }] : []),
              ],
            },
          ]}
        >
          {!isWide && <View style={[s.handle, isRide && { backgroundColor: "rgba(252,211,77,0.30)" }]} />}

          {/* Scrollable content — flex: 1 ensures it shrinks to give footer room */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.scrollContent}
            style={s.scrollArea}
          >
            <View style={s.iconRing}>
              <View style={s.iconCircle}>
                <Ionicons name="close-circle" size={28} color="#fff" />
              </View>
            </View>

            <Text style={[s.title, isRide && { color: "#F1F5F9" }]}>Cancel {typeLabel}?</Text>
            <Text style={[s.sub, isRide && { color: "rgba(241,245,249,0.55)" }]}>
              {typePrefix} #{target.id.slice(-8).toUpperCase()}
              {target.cancelMinsLeft != null && !isRide
                ? `  ·  ${target.cancelMinsLeft}m left to cancel`
                : ""}
            </Text>

            {(hasFee || (isWallet && amount != null) || (!hasFee && !isWallet && isRide && !riderAssigned)) && (
              <View style={[s.infoBox, isRide && { backgroundColor: "rgba(252,211,77,0.08)", borderColor: "rgba(252,211,77,0.22)" }]}>
                {hasFee && (
                  <View style={s.infoRow}>
                    <View style={[s.infoIcon, { backgroundColor: "#FEE2E2" }]}>
                      <Ionicons name="cash-outline" size={14} color="#DC2626" />
                    </View>
                    <Text style={s.infoTextRed}>
                      Rs. {cancellationFee} cancellation fee applies
                    </Text>
                  </View>
                )}
                {isWallet && amount != null && (
                  <View style={s.infoRow}>
                    <View style={[s.infoIcon, { backgroundColor: "#D1FAE5" }]}>
                      <Ionicons name="wallet-outline" size={14} color="#059669" />
                    </View>
                    <Text style={s.infoTextGreen}>
                      Rs. {Math.round(amount)} refunded to your wallet
                    </Text>
                  </View>
                )}
                {!hasFee && !isWallet && isRide && !riderAssigned && (
                  <View style={s.infoRow}>
                    <View style={[s.infoIcon, { backgroundColor: "#D1FAE5" }]}>
                      <Ionicons name="checkmark-circle-outline" size={14} color="#059669" />
                    </View>
                    <Text style={s.infoTextGreen}>No cancellation fee</Text>
                  </View>
                )}
              </View>
            )}

            <Text style={[s.sectionLabel, isRide && { color: "rgba(252,211,77,0.60)" }]}>
              Why are you cancelling?
            </Text>

            <View style={s.reasonsList}>
              {reasons.map((r) => {
                const active = selectedReason === r.key;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => { setSelectedReason(r.key); setError(""); }}
                    style={({ pressed }) => [
                      s.reasonRow,
                      active && s.reasonRowActive,
                      pressed && !active && s.reasonRowPressed,
                      isRide && { backgroundColor: active ? "rgba(252,211,77,0.12)" : "rgba(255,255,255,0.05)", borderColor: active ? "rgba(252,211,77,0.40)" : "rgba(255,255,255,0.10)" },
                    ]}
                  >
                    <View style={[s.reasonIconBox, active && s.reasonIconBoxActive, isRide && { backgroundColor: active ? "rgba(252,211,77,0.18)" : "rgba(255,255,255,0.08)" }]}>
                      <Ionicons
                        name={r.icon as any}
                        size={17}
                        color={active ? (isRide ? "#FCD34D" : "#DC2626") : (isRide ? "rgba(241,245,249,0.50)" : C.textSecondary)}
                      />
                    </View>
                    <Text style={[s.reasonText, active && s.reasonTextActive, isRide && { color: active ? "#FCD34D" : "rgba(241,245,249,0.75)" }, active && isRide && { fontFamily: "Inter_600SemiBold" }]} numberOfLines={1}>
                      {r.label}
                    </Text>
                    <View style={[s.radioOuter, active && s.radioOuterActive, isRide && { borderColor: active ? "#FCD34D" : "rgba(255,255,255,0.25)" }]}>
                      {active && <View style={[s.radioInner, isRide && { backgroundColor: "#FCD34D" }]} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {!!error && (
              <View style={s.errorBox}>
                <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer is OUTSIDE the ScrollView so it's always pinned at the bottom */}
          <View style={[s.footer, isRide && { borderTopColor: "rgba(255,255,255,0.08)" }]}>
            <Pressable
              style={({ pressed }) => [s.keepBtn, pressed && s.keepBtnPressed, isRide && { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.14)" }]}
              onPress={safeClose}
              disabled={loading}
            >
              <Text style={[s.keepText, isRide && { color: "rgba(241,245,249,0.80)" }]}>{keepLabel}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                s.confirmBtn,
                (!selectedReason || loading) && s.confirmBtnDisabled,
                pressed && selectedReason && !loading && s.confirmBtnPressed,
              ]}
              onPress={handleConfirm}
              disabled={loading || !selectedReason}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={17} color="#fff" />
                  <Text style={s.confirmText}>Confirm Cancel</Text>
                </>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const SHEET_RADIUS = 28;
const WIDE_RADIUS = 24;

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10,14,26,0.55)",
    justifyContent: "flex-end",
    alignItems: "center",
  },

  sheet: {
    backgroundColor: "#FFFFFF",
    width: "100%",
    /* flex column so ScrollView shrinks and footer stays pinned */
    flexDirection: "column",
  },
  sheetMobile: {
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  sheetWide: {
    maxWidth: 480,
    maxHeight: "88%",
    borderRadius: WIDE_RADIUS,
    marginBottom: 0,
    alignSelf: "center",
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 28,
    ...Platform.select({
      web: {
        boxShadow: "0 24px 64px rgba(10,14,26,0.22), 0 4px 16px rgba(10,14,26,0.1)",
      } as any,
    }),
  },

  handle: {
    width: 38,
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 18,
  },

  /* ScrollView fills the space between handle and footer */
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 6,
  },

  iconRing: {
    alignItems: "center",
    marginBottom: 14,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 8,
  },

  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 21,
    color: "#0F172A",
    textAlign: "center",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 18,
    letterSpacing: 0.1,
  },

  infoBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 18,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  infoTextRed: {
    fontFamily: "Inter_500Medium",
    fontSize: 13.5,
    color: "#DC2626",
    flex: 1,
  },
  infoTextGreen: {
    fontFamily: "Inter_500Medium",
    fontSize: 13.5,
    color: "#059669",
    flex: 1,
  },

  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },

  reasonsList: {
    gap: 8,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  reasonRowActive: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  reasonRowPressed: {
    backgroundColor: "#F1F5F9",
  },
  reasonIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  reasonIconBoxActive: {
    backgroundColor: "#FEE2E2",
  },
  reasonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#475569",
    flex: 1,
  },
  reasonTextActive: {
    color: "#DC2626",
    fontFamily: "Inter_600SemiBold",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: {
    borderColor: "#DC2626",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#DC2626",
  },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#DC2626",
    flex: 1,
  },

  /* Footer is always pinned — never inside the scroll */
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 14,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    marginTop: 2,
    flexShrink: 0,
  },
  keepBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  keepBtnPressed: {
    backgroundColor: "#F1F5F9",
  },
  keepText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#475569",
  },
  confirmBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#DC2626",
    borderRadius: 16,
    paddingVertical: 15,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  confirmBtnDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmBtnPressed: {
    backgroundColor: "#B91C1C",
  },
  confirmText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
    letterSpacing: 0.1,
  },
});
