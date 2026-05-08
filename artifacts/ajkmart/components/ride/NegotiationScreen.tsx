import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  TouchableOpacity,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  useColorScheme,
} from "react-native";
import Reanimated, { FadeInDown, FadeIn, SlideInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useToast } from "@/context/ToastContext";
import { CancelModal } from "@/components/CancelModal";
import type { CancelTarget } from "@/components/CancelModal";
import { RT } from "@/constants/rideTokens";
import { BidCardSkeleton } from "@/components/ride/Skeletons";
import {
  acceptRideBid as acceptRideBidApi,
  customerCounterOffer as customerCounterOfferApi,
} from "@workspace/api-client-react";
import { API_BASE } from "@/utils/api";
import { useCurrency } from "@/context/PlatformConfigContext";

interface RideBid {
  id: string;
  riderId: string;
  riderName?: string;
  fare: number;
  offer?: number;
  status?: string;
  createdAt?: string;
  ratingAvg?: number | null;
  totalRides?: number;
  vehiclePlate?: string | null;
  vehicleType?: string | null;
  note?: string | null;
}

interface NegotiationRide {
  id: string;
  status: string;
  fare?: number;
  offeredFare?: number;
  minOffer?: number;
  paymentMethod?: string;
  bids?: RideBid[];
  riderId?: string;
  riderName?: string;
  pickupAddress?: string;
  dropAddress?: string;
  broadcastExpiresAt?: string | null;
}

type NegotiationScreenProps = {
  rideId: string;
  ride: NegotiationRide | null;
  setRide: (updater: (r: NegotiationRide | null) => NegotiationRide | null) => void;
  elapsed: number;
  cancellationFee: number;
  token: string | null;
  broadcastTimeoutSec?: number;
  estimatedFare?: number;
  minOffer?: number;
};

function SwipeBidCard({ onSwipeRight, onSwipeLeft, children }: { onSwipeRight?: () => void; onSwipeLeft?: () => void; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeOpacity = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => {
        translateX.setValue(g.dx);
        swipeOpacity.setValue(Math.min(Math.abs(g.dx) / 60, 1));
      },
      onPanResponderRelease: (_e, g) => {
        const threshold = width * 0.3;
        if (g.dx > threshold && onSwipeRight) {
          Animated.timing(translateX, { toValue: width, duration: 250, useNativeDriver: true }).start(() => onSwipeRight());
        } else if (g.dx < -threshold && onSwipeLeft) {
          Animated.timing(translateX, { toValue: -width, duration: 250, useNativeDriver: true }).start(() => onSwipeLeft());
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 160, friction: 15 }).start();
          Animated.timing(swipeOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const swipeRightOpacity = translateX.interpolate({ inputRange: [0, 60], outputRange: [0, 1], extrapolate: "clamp" });
  const swipeLeftOpacity = translateX.interpolate({ inputRange: [-60, 0], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <View>
      {/* Swipe indicators */}
      <Animated.View style={{ position: "absolute", top: 0, bottom: 0, left: 16, justifyContent: "center", opacity: swipeRightOpacity, zIndex: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(16,185,129,0.15)", padding: 8, borderRadius: 12 }}>
          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#10B981" }}>Accept</Text>
        </View>
      </Animated.View>
      <Animated.View style={{ position: "absolute", top: 0, bottom: 0, right: 16, justifyContent: "center", opacity: swipeLeftOpacity, zIndex: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(239,68,68,0.15)", padding: 8, borderRadius: 12 }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#EF4444" }}>Skip</Text>
          <Ionicons name="close-circle" size={20} color="#EF4444" />
        </View>
      </Animated.View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }], zIndex: 1 }}>
        {children}
      </Animated.View>
    </View>
  );
}

export function NegotiationScreen({
  rideId,
  ride,
  setRide,
  elapsed,
  cancellationFee,
  token,
  broadcastTimeoutSec = 300,
  estimatedFare,
  minOffer: minOfferProp,
}: NegotiationScreenProps) {
  const colorScheme = useColorScheme();
  const C = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { showToast } = useToast();
  const { symbol: currencySymbol } = useCurrency();

  const ring1 = useRef(new Animated.Value(1)).current;
  const ring2 = useRef(new Animated.Value(1)).current;
  const ring3 = useRef(new Animated.Value(1)).current;
  const ring1Op = useRef(new Animated.Value(0.7)).current;
  const ring2Op = useRef(new Animated.Value(0.4)).current;
  const ring3Op = useRef(new Animated.Value(0.2)).current;
  const centerPulse = useRef(new Animated.Value(1)).current;

  const livePulse = useRef(new Animated.Value(1)).current;
  const livePulseOp = useRef(new Animated.Value(1)).current;

  const counterSlide = useRef(new Animated.Value(0)).current;

  const [counterInput, setCounterInput] = useState("");
  const [counterLoading, setCounterLoading] = useState(false);
  const [showCounter, setShowCounter] = useState(false);
  const [acceptBidId, setAcceptBidId] = useState<string | null>(null);
  const [cancelModalTarget, setCancelModalTarget] = useState<CancelTarget | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [offerError, setOfferError] = useState("");
  const [connectionLost, setConnectionLost] = useState(false);
  const [bidsInitializing, setBidsInitializing] = useState(true);
  const consecutiveFailsRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setBidsInitializing(false), 3500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const pulse = (scale: Animated.Value, op: Animated.Value, delay: number, resetOp: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1.8, duration: 1800, useNativeDriver: true }),
            Animated.timing(op, { toValue: 0, duration: 1800, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(op, { toValue: resetOp, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      );
    const a1 = pulse(ring1, ring1Op, 0, 0.7);
    const a2 = pulse(ring2, ring2Op, 600, 0.4);
    const a3 = pulse(ring3, ring3Op, 1200, 0.2);
    a1.start(); a2.start(); a3.start();

    const centerAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(centerPulse, { toValue: 1.1, duration: 700, useNativeDriver: true }),
        Animated.timing(centerPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    centerAnim.start();

    return () => { a1.stop(); a2.stop(); a3.stop(); centerAnim.stop(); };
  }, []);

  useEffect(() => {
    const livePulseAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(livePulse, { toValue: 1.5, duration: 600, useNativeDriver: true }),
          Animated.timing(livePulseOp, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(livePulse, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(livePulseOp, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ]),
    );
    livePulseAnim.start();
    return () => livePulseAnim.stop();
  }, []);

  useEffect(() => {
    Animated.timing(counterSlide, {
      toValue: showCounter ? 1 : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [showCounter]);

  useEffect(() => {
    const HEARTBEAT_MS = 15000;
    const FAIL_THRESHOLD = 2;
    const interval = setInterval(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${API_BASE}/rides/${rideId}`, {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          consecutiveFailsRef.current = 0;
          setConnectionLost(false);
          try {
            const json = await res.json();
            const data = json?.data ?? json;
            if (data && typeof data === "object") {
              setRide((prev) => prev ? { ...prev, ...data } : prev);
            }
          } catch {}
        }
        else consecutiveFailsRef.current++;
      } catch {
        clearTimeout(timeout);
        consecutiveFailsRef.current++;
      }
      if (consecutiveFailsRef.current >= FAIL_THRESHOLD) setConnectionLost(true);
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [rideId, token]);

  const offeredFare = ride?.offeredFare ?? 0;
  const bids: RideBid[] = ride?.bids ?? [];
  const sortedBids = [...bids].sort((a, b) => a.fare - b.fare);
  const hasBids = bids.length > 0;
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  const parsedExpiresAt = ride?.broadcastExpiresAt ? new Date(ride.broadcastExpiresAt).getTime() : NaN;
  const remaining = Number.isFinite(parsedExpiresAt)
    ? Math.max(0, Math.floor((parsedExpiresAt - Date.now()) / 1000))
    : Math.max(0, broadcastTimeoutSec - elapsed);
  const remainingMin = Math.floor(remaining / 60);
  const remainingSec = remaining % 60;
  const timerStr = `${remainingMin}:${String(remainingSec).padStart(2, "0")}`;
  const timerPct = broadcastTimeoutSec > 0 ? remaining / broadcastTimeoutSec : 1;
  const timerUrgent = timerPct < 0.2;

  const serverMinOffer = ride?.minOffer ?? minOfferProp;
  const minCounterOffer = serverMinOffer
    ? Math.ceil(serverMinOffer)
    : estimatedFare
      ? Math.ceil(estimatedFare * 0.7)
      : Math.ceil(offeredFare * 0.7);

  const maxOffer = estimatedFare ?? (ride?.fare ?? 0);

  const validateOffer = (val: string): string => {
    const amt = parseFloat(val);
    if (isNaN(amt) || amt <= 0) return "Please enter a valid amount";
    if (amt < minCounterOffer) return `Minimum offer is ${currencySymbol} ${minCounterOffer}`;
    if (maxOffer > 0 && amt > maxOffer) return `Offer cannot exceed the platform fare of ${currencySymbol} ${Math.round(maxOffer)}`;
    return "";
  };

  const acceptBid = async (bidId: string) => {
    setAcceptBidId(bidId);
    try {
      const d = await acceptRideBidApi(rideId, { bidId });
      setRide(() => d as unknown as NegotiationRide);
    } catch (e: any) {
      const code = e?.response?.data?.data?.code ?? e?.response?.data?.code;
      const msg = e?.response?.data?.error || e?.message || "Could not accept bid. Please try again.";
      if (code === "INSUFFICIENT_BALANCE") {
        showToast(`Wallet balance insufficient. Please top up your wallet and try again.`, "error");
      } else {
        showToast(msg, "error");
      }
    }
    setAcceptBidId(null);
  };

  const rejectBid = async (bidId: string) => {
    setRide((prev) => {
      if (!prev) return prev;
      return { ...prev, bids: (prev.bids ?? []).filter((b) => b.id !== bidId) };
    });
    try {
      const res = await fetch(`${API_BASE}/rides/${rideId}/bids/${bidId}/reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data?.error || "Could not reject bid. It will expire automatically.", "info");
      }
    } catch {
      showToast("Could not reject bid. It will expire automatically.", "info");
    }
  };

  const sendCounterOffer = async () => {
    const err = validateOffer(counterInput);
    if (err) { setOfferError(err); showToast(err, "error"); return; }
    const amt = parseFloat(counterInput);
    setCounterLoading(true);
    setOfferError("");
    try {
      const d = await customerCounterOfferApi(rideId, { offeredFare: amt });
      setRide(() => d as unknown as NegotiationRide);
      setCounterInput("");
      setShowCounter(false);
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || "Could not update offer.", "error");
    }
    setCounterLoading(false);
  };

  const openUnifiedCancelModal = () => {
    const riderAssigned = ["accepted", "arrived", "in_transit"].includes(ride?.status || "");
    setCancelModalTarget({
      id: rideId, type: "ride", status: ride?.status || "bargaining",
      fare: ride?.fare, paymentMethod: ride?.paymentMethod, riderAssigned,
    });
  };

  const counterMaxH = counterSlide.interpolate({ inputRange: [0, 1], outputRange: [0, 180] });
  const counterOpacity = counterSlide.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.5, 1] });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={{ flex: 1, backgroundColor: RT.dark }}>
        <LinearGradient colors={RT.headerGrad} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />

        {/* Header */}
        <View style={{ paddingTop: topPad + 16, paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <TouchableOpacity
                activeOpacity={0.7} onPress={() => router.push("/(tabs)")} hitSlop={8}
                style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}
              >
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: RT.textPrimary }}>
                    Live Negotiation
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: RT.emeraldBg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: RT.emeraldBorder }}>
                    <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: RT.emerald, transform: [{ scale: livePulse }], opacity: livePulseOp }} />
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: RT.emerald, letterSpacing: 0.8 }}>LIVE</Text>
                  </View>
                </View>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: RT.textMuted, marginTop: 2 }}>
                  #{rideId.slice(-8).toUpperCase()} · {elapsedStr}
                </Text>
              </View>
            </View>

            {/* Your offer */}
            <View style={{ backgroundColor: RT.accentBg, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", borderWidth: 1.5, borderColor: RT.accentBorder }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: RT.accent }}>{currencySymbol} {offeredFare}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: "rgba(252,211,77,0.65)" }}>Your Offer</Text>
            </View>
          </View>

          {/* Timer bar */}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 10 }}>
            <Ionicons name="timer-outline" size={14} color={timerUrgent ? RT.red : RT.textMuted} />
            <View style={{ flex: 1, height: 5, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <View style={{ height: 5, borderRadius: 3, width: `${Math.max(timerPct * 100, 0)}%`, backgroundColor: timerUrgent ? RT.red : RT.accent }} />
            </View>
            <View style={{ backgroundColor: timerUrgent ? RT.redBg : RT.accentBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: timerUrgent ? RT.redBorder : RT.accentBorder }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: timerUrgent ? RT.red : RT.accent, minWidth: 38, textAlign: "center" }}>{timerStr}</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 14 }} showsVerticalScrollIndicator={false}>

          {/* Searching state — pulsing ring (no bids) */}
          {!hasBids && (
            <View style={{ alignItems: "center", paddingVertical: 28 }}>
              <View style={{ width: 180, height: 180, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <Animated.View style={{ position: "absolute", width: 180, height: 180, borderRadius: 90, borderWidth: 2, borderColor: `${RT.accent}20`, transform: [{ scale: ring3 }], opacity: ring3Op }} />
                <Animated.View style={{ position: "absolute", width: 130, height: 130, borderRadius: 65, borderWidth: 2, borderColor: `${RT.accent}35`, transform: [{ scale: ring2 }], opacity: ring2Op }} />
                <Animated.View style={{ position: "absolute", width: 90, height: 90, borderRadius: 45, borderWidth: 2.5, borderColor: `${RT.accent}60`, transform: [{ scale: ring1 }], opacity: ring1Op }} />
                <Animated.View style={{
                  width: 64, height: 64, borderRadius: 32,
                  backgroundColor: "rgba(252,211,77,0.15)",
                  alignItems: "center", justifyContent: "center",
                  borderWidth: 2, borderColor: "rgba(252,211,77,0.45)",
                  transform: [{ scale: centerPulse }],
                }}>
                  <Text style={{ fontSize: 28 }}>📡</Text>
                </Animated.View>
              </View>

              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 21, color: RT.textPrimary, textAlign: "center" }}>Broadcasting Your Offer</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: RT.textSecondary, textAlign: "center", marginTop: 6, lineHeight: 20, maxWidth: 260 }}>
                Nearby riders are reviewing your offer of{" "}
                <Text style={{ fontFamily: "Inter_700Bold", color: RT.accent }}>{currencySymbol} {offeredFare}</Text>
                . Bids appear here instantly.
              </Text>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: RT.accent }} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: RT.textSecondary }}>Broadcasting · {elapsedStr}</Text>
              </View>

              {connectionLost && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: RT.redBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10, borderWidth: 1, borderColor: RT.redBorder }}>
                  <Ionicons name="cloud-offline-outline" size={15} color={RT.red} />
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#FCA5A5" }}>Connection lost — tap to reconnect</Text>
                </View>
              )}

              {(remaining <= 0 || connectionLost) && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={async () => {
                    try {
                      const res = await fetch(`${API_BASE}/rides/${rideId}/retry`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                      });
                      if (res.ok) { setConnectionLost(false); showToast("Searching for more riders...", "success"); }
                      else showToast("Could not refresh. Please try again.", "error");
                    } catch { setConnectionLost(true); showToast("Connection issue.", "error"); }
                  }}
                  style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: RT.accentBg, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 14, borderWidth: 1.5, borderColor: RT.accentBorder }}
                >
                  <Ionicons name="refresh-outline" size={18} color={RT.accent} />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: RT.accent }}>
                    {connectionLost ? "Reconnect & Search" : "Search Again"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Loading skeleton */}
          {bidsInitializing && !hasBids && <BidCardSkeleton />}

          {/* Bids */}
          {hasBids && (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: RT.emerald }} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: RT.textSecondary }}>
                  {bids.length} Bid{bids.length > 1 ? "s" : ""} Received
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: RT.textMuted }}>Sorted by price</Text>
              </View>

              {sortedBids.map((bid: RideBid, bidIndex: number) => {
                const isAccepting = acceptBidId === bid.id;
                const isBestOffer = bidIndex === 0;
                const fareGap = Math.round(bid.fare - offeredFare);

                return (
                  <Reanimated.View
                    key={bid.id}
                    entering={SlideInRight.delay(bidIndex * 80).springify().damping(18)}
                  >
                  <SwipeBidCard
                    onSwipeRight={() => { if (acceptBidId === null) acceptBid(bid.id); }}
                    onSwipeLeft={() => { if (acceptBidId === null) rejectBid(bid.id); }}
                  >
                  <View
                    style={{
                      borderRadius: 22, overflow: "hidden",
                      borderWidth: isBestOffer ? 1.5 : 1,
                      borderColor: isBestOffer ? RT.emeraldBorder : RT.darkCardBorder,
                    }}
                  >
                    <LinearGradient
                      colors={isBestOffer ? ["rgba(16,185,129,0.12)", "rgba(16,185,129,0.04)"] : ["rgba(255,255,255,0.06)", "rgba(255,255,255,0.02)"]}
                      style={{ padding: 16 }}
                    >
                      {isBestOffer && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10, backgroundColor: "rgba(16,185,129,0.15)", alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                          <Ionicons name="ribbon" size={11} color={RT.emerald} />
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: RT.emerald, letterSpacing: 0.8 }}>BEST OFFER</Text>
                        </View>
                      )}

                      {/* Rider row */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
                        <View style={{ position: "relative" }}>
                          <LinearGradient
                            colors={isBestOffer ? ["rgba(16,185,129,0.35)", "rgba(16,185,129,0.15)"] : ["rgba(252,211,77,0.25)", "rgba(252,211,77,0.10)"]}
                            style={{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: isBestOffer ? "rgba(16,185,129,0.55)" : "rgba(252,211,77,0.35)" }}
                          >
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: isBestOffer ? RT.emerald : RT.accent }}>
                              {(bid.riderName ?? "R").charAt(0).toUpperCase()}
                            </Text>
                          </LinearGradient>
                          <View style={{ position: "absolute", bottom: 0, right: 0, width: 13, height: 13, borderRadius: 6.5, backgroundColor: RT.emerald, borderWidth: 2.5, borderColor: RT.dark }} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: RT.textPrimary }}>{bid.riderName ?? "Rider"}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            {bid.ratingAvg != null && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,158,11,0.15)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
                                <Ionicons name="star" size={10} color="#F59E0B" />
                                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: RT.accent }}>{bid.ratingAvg.toFixed(1)}</Text>
                                {(bid.totalRides ?? 0) > 0 && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: RT.textMuted }}>· {bid.totalRides} trips</Text>}
                              </View>
                            )}
                            {bid.vehiclePlate && (
                              <View style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: RT.darkCardBorder }}>
                                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: "rgba(255,255,255,0.8)", letterSpacing: 1.1 }}>{bid.vehiclePlate}</Text>
                              </View>
                            )}
                          </View>
                          {bid.note && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: RT.textSecondary, marginTop: 4, fontStyle: "italic" }}>"{bid.note}"</Text>}
                        </View>

                        {/* Fare badge */}
                        <View style={{ alignItems: "flex-end" }}>
                          <View style={{ backgroundColor: RT.accentBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: RT.accentBorder, marginBottom: 3 }}>
                            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: RT.accent }}>{currencySymbol} {Math.round(bid.fare)}</Text>
                          </View>
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: bid.fare <= offeredFare ? RT.emerald : RT.textMuted, textAlign: "right" }}>
                            {bid.fare === offeredFare ? "Matches your offer" : fareGap > 0 ? `+${currencySymbol} ${fareGap}` : `-${currencySymbol} ${Math.abs(fareGap)} saved`}
                          </Text>
                        </View>
                      </View>

                      {/* Accept + Counter */}
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <TouchableOpacity
                          activeOpacity={0.8} onPress={() => acceptBid(bid.id)}
                          disabled={acceptBidId !== null}
                          style={{ flex: 3, opacity: acceptBidId !== null ? 0.6 : 1 }}
                        >
                          <LinearGradient
                            colors={["#10B981", "#059669"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={{ borderRadius: 16, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 7 }}
                          >
                            {isAccepting ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <>
                                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>Accept · {currencySymbol} {Math.round(bid.fare)}</Text>
                              </>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => { setCounterInput(String(Math.round(bid.fare))); setShowCounter(true); }}
                          disabled={acceptBidId !== null}
                          style={{ flex: 2, borderRadius: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, borderWidth: 1.5, borderColor: RT.accentBorder, backgroundColor: RT.accentBg, opacity: acceptBidId !== null ? 0.5 : 1 }}
                        >
                          <Ionicons name="swap-horizontal" size={14} color={RT.accent} />
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: RT.accent }}>Counter</Text>
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  </View>
                  </SwipeBidCard>
                  </Reanimated.View>
                );
              })}
            </>
          )}

          {/* Inline counter-offer panel */}
          <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: RT.darkCardBorder }}>
            <LinearGradient colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.02)"]} style={{ overflow: "hidden" }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { setShowCounter((v) => !v); setOfferError(""); }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: RT.accentBg, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: RT.accentBorder }}>
                    <Ionicons name="create-outline" size={16} color={RT.accent} />
                  </View>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: RT.textPrimary }}>Update Your Offer</Text>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={showCounter ? "chevron-up" : "chevron-down"} size={13} color={RT.textMuted} />
                </View>
              </TouchableOpacity>

              <Animated.View style={{ maxHeight: counterMaxH, opacity: counterOpacity, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
                  <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: RT.textMuted }}>
                    A new offer cancels all pending bids · Min: {currencySymbol} {minCounterOffer}
                  </Text>
                  {offerError ? <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: RT.red }}>{offerError}</Text> : null}
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: offerError ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.12)" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: RT.textMuted }}>{currencySymbol}</Text>
                      <TextInput
                        value={counterInput}
                        onChangeText={(v) => { setCounterInput(v); setOfferError(""); }}
                        keyboardType="numeric"
                        placeholder={String(Math.ceil(offeredFare * 1.1))}
                        placeholderTextColor="rgba(255,255,255,0.2)"
                        maxLength={7}
                        style={{ flex: 1, fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff", paddingVertical: 12, paddingHorizontal: 6 }}
                      />
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7} onPress={sendCounterOffer}
                      disabled={counterLoading || !counterInput}
                      style={{ opacity: !counterInput || counterLoading ? 0.5 : 1 }}
                    >
                      <LinearGradient
                        colors={["#F59E0B", "#D97706"]}
                        style={{ borderRadius: 13, paddingHorizontal: 20, height: "100%", alignItems: "center", justifyContent: "center", minHeight: 52 }}
                      >
                        {counterLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>Send</Text>}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            </LinearGradient>
          </View>
        </ScrollView>

        {/* Cancel bottom */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 24) + 8, alignItems: "center" }}>
          <LinearGradient colors={["transparent", "rgba(10,15,30,0.97)"]} style={{ position: "absolute", top: -32, left: 0, right: 0, bottom: 0 }} />
          <TouchableOpacity activeOpacity={0.7} onPress={() => openUnifiedCancelModal()} disabled={cancelling} style={{ paddingVertical: 12, paddingHorizontal: 24 }}>
            {cancelling ? (
              <ActivityIndicator color={RT.red} size="small" />
            ) : (
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: RT.textMuted }}>Cancel Offer</Text>
            )}
          </TouchableOpacity>
        </View>

        {cancelModalTarget && (
          <CancelModal
            target={cancelModalTarget}
            cancellationFee={cancellationFee}
            apiBase={API_BASE}
            token={token}
            onClose={() => setCancelModalTarget(null)}
            onDone={() => { setRide((r) => r ? { ...r, status: "cancelled" } : r); }}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
