import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Platform,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import Reanimated, { ZoomIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { RT } from "@/constants/rideTokens";
import { useToast } from "@/context/ToastContext";
import { CancelModal } from "@/components/CancelModal";
import type { CancelTarget } from "@/components/CancelModal";
import { useRideStatus } from "@/hooks/useRideStatus";
import { NegotiationScreen } from "@/components/ride/NegotiationScreen";
import { RideStatusSkeleton } from "@/components/ride/Skeletons";
import { staticMapUrl } from "@/hooks/useMaps";
import { API_BASE } from "@/utils/api";
import {
  getDispatchStatus,
  retryRideDispatch,
  rateRide,
  type Ride,
  type RideBid,
} from "@workspace/api-client-react";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";

type LiveRide = Omit<Ride, "status" | "paymentMethod"> & {
  status?: string;
  paymentMethod?: string;
  updatedAt?: string;
  estimatedFare?: number;
  minOffer?: number;
  estimatedTime?: string;
  broadcastTimeoutSec?: number;
  fareBreakdown?: { baseFare?: number; gstAmount?: number };
  bids?: RideBid[];
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type RideTrackerProps = {
  rideId: string;
  initialType: string;
  userId: string;
  token: string | null;
  cancellationFee: number;
  onReset: () => void;
};

export function RideTracker({
  rideId,
  initialType,
  userId,
  token,
  cancellationFee,
  onReset,
}: RideTrackerProps) {
  const colorScheme = useColorScheme();
  const C = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { showToast } = useToast();
  const { language } = useLanguage();
  const tl = (key: TranslationKey) => tDual(key, language);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const slideUp = useRef(new Animated.Value(50)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const livePulse = useRef(new Animated.Value(1)).current;
  const livePulseOp = useRef(new Animated.Value(1)).current;
  const sosRing = useRef(new Animated.Value(1)).current;
  const sosRingOp = useRef(new Animated.Value(0.6)).current;
  const stepProgress = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(120)).current;

  const { ride: _ride, setRide: _setRide, connectionType, reconnect } = useRideStatus(rideId);
  const ride = _ride as LiveRide | null;
  const setRide = _setRide as React.Dispatch<React.SetStateAction<LiveRide | null>>;
  const RIDE_STEPS = ["searching", "accepted", "arrived", "in_transit", "completed"];
  const { config } = usePlatformConfig();
  const sosEnabled = config.features?.sos !== false;
  const CANCEL_GRACE_SEC = config.rides?.cancelGraceSec ?? 180;
  const [sosLoading, setSosLoading] = useState(false);
  const [sosSent, setSosSent] = useState(false);

  const [cancelling, setCancelling] = useState(false);
  const [cancelModalTarget, setCancelModalTarget] = useState<CancelTarget | null>(null);
  const [rating, setRating] = useState(0);
  const [ratingDone, setRatingDone] = useState(false);
  const [ratingComment, setRatingComment] = useState("");
  const elapsedInitialized = useRef(false);
  const [elapsed, setElapsed] = useState(0);
  const [dispatchInfo, setDispatchInfo] = useState<any>(null);
  const [retrying, setRetrying] = useState(false);
  const prevStatus = useRef<string>("");
  const [cancelResult, setCancelResult] = useState<{ cancellationFee?: number; cancelReason?: string } | null>(null);
  const [acceptedAt, setAcceptedAt] = useState<number | null>(null);
  const [noDriversConfirmed, setNoDriversConfirmed] = useState(false);

  const [tripOtp, setTripOtp] = useState<string | null>(null);
  const [otpCopied, setOtpCopied] = useState(false);

  const [riderLivePos, setRiderLivePos] = useState<{ lat: number; lng: number } | null>(null);
  const socketRef = useRef<{ disconnect: () => void } | null>(null);

  const isSocketActive = ["accepted", "arrived", "in_transit"].includes(ride?.status ?? "");

  const expoDomain = process.env.EXPO_PUBLIC_DOMAIN;
  const rideApiBase = expoDomain ? `https://${expoDomain}/api` : API_BASE;
  const warnedNoDomainRef = useRef(false);

  useEffect(() => {
    if (__DEV__ && !expoDomain && !warnedNoDomainRef.current) {
      warnedNoDomainRef.current = true;
      console.warn("[RideTracker] EXPO_PUBLIC_DOMAIN is undefined — SOS and cancel requests will use API_BASE fallback. Set EXPO_PUBLIC_DOMAIN in your environment.");
    }
  }, [expoDomain]);

  useEffect(() => {
    if (!isSocketActive || !rideId) return;
    const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
    const socketUrl = `https://${domain}`;
    const socketIoPath = "/api/socket.io";
    let unmounted = false;
    import("socket.io-client").then(({ io }) => {
      if (unmounted) return;
      const socket = io(socketUrl, {
        path: socketIoPath,
        query: { rooms: `ride:${rideId}` },
        auth: token ? { token } : {},
        extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
        transports: ["polling", "websocket"],
      });
      if (unmounted) { socket.disconnect(); return; }
      socketRef.current = socket;
      socket.on("rider:location", (payload: { latitude: number; longitude: number; rideId?: string; orderId?: string }) => {
        const payloadRideId = payload.rideId ?? payload.orderId;
        if (!payloadRideId || payloadRideId !== rideId) return;
        setRiderLivePos({ lat: payload.latitude, lng: payload.longitude });
      });
      socket.on("ride:otp", (payload: { rideId: string; otp: string }) => {
        if (payload.rideId === rideId && payload.otp) setTripOtp(payload.otp);
      });
    });
    return () => {
      unmounted = true;
      if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
    };
  }, [rideId, token, isSocketActive]);

  useEffect(() => {
    AsyncStorage.getItem(`rated_ride_${rideId}`).then(val => { if (val === "1") setRatingDone(true); }).catch(() => {});
  }, [rideId]);

  useEffect(() => {
    if (elapsedInitialized.current || !ride?.createdAt) return;
    const ageMs = Date.now() - new Date(ride.createdAt).getTime();
    if (ageMs > 0) setElapsed(Math.floor(ageMs / 1000));
    elapsedInitialized.current = true;
  }, [ride?.createdAt]);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const st = ride?.status;
    if (st === "accepted" && !acceptedAt) setAcceptedAt(Date.now());
  }, [ride?.status, acceptedAt]);

  useEffect(() => {
    if (ride?.status === "arrived" && ride?.tripOtp && !tripOtp) setTripOtp(ride.tripOtp);
    if (ride?.status === "in_transit" && ride?.otpVerified) setTripOtp(null);
  }, [ride?.status, ride?.tripOtp, ride?.otpVerified]);

  useEffect(() => {
    const st = ride?.status;
    const prev = prevStatus.current;
    const pendingStatuses = ["searching", "bargaining"];
    if (st && !pendingStatuses.includes(st) && pendingStatuses.includes(prev)) {
      slideUp.setValue(50);
      fadeIn.setValue(0);
      cardSlide.setValue(120);
      Animated.parallel([
        Animated.spring(slideUp, { toValue: 0, useNativeDriver: true, bounciness: 6 }),
        Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(cardSlide, { toValue: 0, useNativeDriver: true, tension: 80, friction: 14 }),
      ]).start();
    }
    if (!prevStatus.current && st && !pendingStatuses.includes(st)) {
      slideUp.setValue(0);
      fadeIn.setValue(1);
      cardSlide.setValue(0);
    }
    prevStatus.current = st || "";
  }, [ride?.status]);

  useEffect(() => {
    const idx = RIDE_STEPS.indexOf(ride?.status ?? "");
    if (idx > 0) {
      stepProgress.setValue(0);
      Animated.timing(stepProgress, { toValue: 1, duration: 500, useNativeDriver: false }).start();
    }
  }, [ride?.status]);

  useEffect(() => {
    const livePulseAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(livePulse, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(livePulseOp, { toValue: 0.3, duration: 600, useNativeDriver: true }),
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
    if (!sosEnabled) return;
    const sosRingAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(sosRing, { toValue: 1.6, duration: 800, useNativeDriver: true }),
          Animated.timing(sosRingOp, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(sosRing, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(sosRingOp, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    sosRingAnim.start();
    return () => sosRingAnim.stop();
  }, [sosEnabled]);

  useEffect(() => {
    const status = ride?.status;
    if (status !== "searching" && status !== "no_riders") return;
    const poll = async () => {
      try { const d = await getDispatchStatus(rideId); setDispatchInfo(d); } catch {}
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [rideId, ride?.status]);

  useEffect(() => {
    const st = ride?.status ?? "searching";
    if (st !== "searching" || elapsed < 180) { setNoDriversConfirmed(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const d = await getDispatchStatus(rideId);
        if (cancelled) return;
        if (d?.status === "accepted" || d?.status === "arrived" || d?.status === "in_transit") {
          return;
        }
        setNoDriversConfirmed(true);
      } catch {
      }
    })();
    return () => { cancelled = true; };
  }, [ride?.status, elapsed >= 180, rideId]);

  const handleRetryDispatch = async () => {
    setRetrying(true);
    try {
      await retryRideDispatch(rideId);
      setRide((r) => (r ? { ...r, status: "searching" } : r));
      setDispatchInfo(null);
    } catch { showToast(tl("couldNotRetry"), "error"); }
    setRetrying(false);
  };

  const graceSecondsLeft = acceptedAt ? Math.max(0, CANCEL_GRACE_SEC - Math.floor((Date.now() - acceptedAt) / 1000)) : null;
  const inGracePeriod = graceSecondsLeft !== null && graceSecondsLeft > 0;
  const effectiveCancellationFee = inGracePeriod ? 0 : cancellationFee;

  const openUnifiedCancelModal = () => {
    const riderAssigned = ["accepted", "arrived", "in_transit"].includes(ride?.status || "");
    setCancelModalTarget({ id: rideId, type: "ride", status: ride?.status || "searching", fare: ride?.fare, paymentMethod: ride?.paymentMethod, riderAssigned });
  };

  const openInMaps = () => {
    if (!ride?.pickupLat || !ride?.pickupLng || !ride?.dropLat || !ride?.dropLng) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${ride.pickupLat},${ride.pickupLng}&destination=${ride.dropLat},${ride.dropLng}&travelmode=driving`);
  };

  const handleSos = async () => {
    if (sosSent) return;
    setSosLoading(true);
    try {
      const resp = await fetch(`${rideApiBase}/sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rideId }),
      });
      if (resp.ok) setSosSent(true);
      else showToast("SOS failed — please call emergency contacts directly");
    } catch { showToast("SOS failed — please call emergency contacts directly"); }
    setSosLoading(false);
  };

  const status = ride?.status ?? "searching";
  const rideType = ride?.type ?? initialType;
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  const STEPS = RIDE_STEPS;
  const stepIdx = STEPS.indexOf(status) !== -1 ? STEPS.indexOf(status) : 0;
  const LABELS = [tl("stepSearching"), tl("stepAccepted"), tl("stepArrived"), tl("stepEnRoute"), tl("stepCompleted")];

  const vehicleIcons: Record<string, string> = { bike: "🏍️", car: "🚗", rickshaw: "🛺", daba: "🚐", school_shift: "🚌" };
  const vehicleIcon = vehicleIcons[rideType] ?? "🚗";

  const statusCfgs: Record<string, { color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; sub: string; banner: string }> = {
    accepted: { color: "#1A56DB", bg: "#EFF6FF", icon: "car", title: tl("driverIsComing"), sub: tl("driverAcceptedSub"), banner: "Driver on the way" },
    arrived: { color: "#D97706", bg: "#FFFBEB", icon: "location", title: tl("driverHasArrived"), sub: tl("driverAtPickup"), banner: "Driver arrived at pickup!" },
    in_transit: { color: "#059669", bg: "#F0FDF4", icon: "navigate", title: tl("onYourWay"), sub: tl("tripInProgress"), banner: "Trip in progress" },
  };
  const hdrCfg = statusCfgs[status] ?? statusCfgs["accepted"]!;
  const canCancel = ["accepted", "arrived", "in_transit"].includes(status);

  if (!ride) return <RideStatusSkeleton />;

  if (status === "bargaining") {
    return (
      <NegotiationScreen
        rideId={rideId}
        ride={ride as Parameters<typeof NegotiationScreen>[0]["ride"]}
        setRide={(updater) => setRide((prev) => updater(prev as Parameters<typeof NegotiationScreen>[0]["ride"]) as LiveRide | null)}
        elapsed={elapsed}
        cancellationFee={effectiveCancellationFee}
        token={token}
        broadcastTimeoutSec={ride?.broadcastTimeoutSec ?? 300}
        estimatedFare={ride?.estimatedFare ?? ride?.fare}
        minOffer={ride?.minOffer}
      />
    );
  }

  if (status === "no_riders" || (status === "searching" && elapsed >= 180 && noDriversConfirmed)) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
            <Ionicons name="car-outline" size={44} color="#EF4444" />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#fff", textAlign: "center", marginBottom: 8 }}>{tl("noDriversAvailable")}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 22, marginBottom: 12 }}>
            {dispatchInfo?.notifiedRiders > 0 ? tl("noDriversNotified").replace("{count}", String(dispatchInfo.notifiedRiders)) : tl("noDriversDefault")}
          </Text>
          {dispatchInfo && (
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {dispatchInfo.notifiedRiders} riders notified · {dispatchInfo.elapsedSec}s elapsed
                {dispatchInfo.dispatchLoopCount != null ? ` · Round ${dispatchInfo.dispatchLoopCount}/${dispatchInfo.maxLoops}` : ""}
              </Text>
            </View>
          )}
          <TouchableOpacity activeOpacity={0.7} onPress={handleRetryDispatch} disabled={retrying} style={{ backgroundColor: "#fff", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, alignItems: "center", width: "100%", marginBottom: 12, opacity: retrying ? 0.6 : 1 }}>
            {retrying ? <ActivityIndicator color={C.primary} size="small" /> : <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: C.primary }}>{tl("retrySearch")}</Text>}
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={onReset} style={{ backgroundColor: "rgba(245,158,11,0.18)", borderWidth: 1.5, borderColor: "rgba(245,158,11,0.4)", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", width: "100%", marginBottom: 12, flexDirection: "row", justifyContent: "center", gap: 8 }}>
            <Ionicons name="trending-up-outline" size={16} color="#F59E0B" />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#F59E0B" }}>{tl("increaseOffer")}</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => openUnifiedCancelModal()} disabled={cancelling} style={{ borderWidth: 1.5, borderColor: "rgba(239,68,68,0.4)", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32, alignItems: "center", width: "100%" }}>
            {cancelling ? <ActivityIndicator color="#EF4444" size="small" /> : <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#EF4444" }}>{tl("cancelRideLabel")}</Text>}
          </TouchableOpacity>
        </View>
        {cancelModalTarget && (
          <CancelModal target={cancelModalTarget} cancellationFee={effectiveCancellationFee} apiBase={rideApiBase} token={token} onClose={() => setCancelModalTarget(null)} onDone={(result) => { setCancelResult({ cancellationFee: result?.cancellationFee, cancelReason: result?.cancelReason }); setRide((r) => r ? { ...r, status: "cancelled" } : r); }} />
        )}
      </View>
    );
  }

  if (status === "searching") {
    return (
      <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
        <View style={{ position: "absolute", top: topPad + 16, left: 20, zIndex: 10 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(tabs)")} hitSlop={8} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <ActivityIndicator size="large" color="#FCD34D" style={{ marginBottom: 24 }} />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#fff", textAlign: "center", marginBottom: 8 }}>{tl("findingYourDriver")}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.5)", textAlign: "center", lineHeight: 22 }}>
            {tl("searchingNearbyDrivers")} {elapsedStr}
          </Text>
          {connectionType === "sse" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, backgroundColor: "rgba(16,185,129,0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" }} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "#10B981" }}>{tl("liveUpdates")}</Text>
            </View>
          )}
          {dispatchInfo && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, backgroundColor: "rgba(255,255,255,0.06)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}>
              <Ionicons name="navigate-outline" size={13} color="rgba(255,255,255,0.5)" />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                Round {(dispatchInfo.dispatchLoopCount ?? 0) + 1}/{dispatchInfo.maxLoops || "?"} · {dispatchInfo.attemptCount || 0} contacted
              </Text>
            </View>
          )}
        </View>
        <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 24) + 16 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => openUnifiedCancelModal()} disabled={cancelling} style={{ alignItems: "center", padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.08)" }}>
            {cancelling ? <ActivityIndicator color="#EF4444" size="small" /> : <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#EF4444" }}>{tl("cancelRideLabel")}</Text>}
          </TouchableOpacity>
        </View>
        {cancelModalTarget && (
          <CancelModal target={cancelModalTarget} cancellationFee={effectiveCancellationFee} apiBase={rideApiBase} token={token} onClose={() => setCancelModalTarget(null)} onDone={(result) => { setCancelResult({ cancellationFee: result?.cancellationFee, cancelReason: result?.cancelReason }); setRide((r) => r ? { ...r, status: "cancelled" } : r); }} />
        )}
      </View>
    );
  }

  if (status === "cancelled") {
    const wasWallet = ride?.paymentMethod === "wallet";
    const appliedFee = cancelResult?.cancellationFee ?? 0;
    const cancelReason = cancelResult?.cancelReason;
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <View style={{ paddingTop: topPad + 24, paddingBottom: 36, alignItems: "center", paddingHorizontal: 24, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Ionicons name="close-circle" size={40} color="#EF4444" />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: C.text }}>{tl("rideCancelledTitle")}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: C.textMuted, marginTop: 6 }}>{tl("rideCancelledSubtitle")}</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          {appliedFee > 0 && (
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: "#FCA5A5" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#991B1B" }}>{tl("cancellationFeeApplied")}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#374151", lineHeight: 19 }}>{tl("cancellationFeeMsg").replace("{amount}", String(appliedFee))}</Text>
            </View>
          )}
          {wasWallet && (
            <View style={{ backgroundColor: C.greenBg, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: C.greenBorder }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#065F46" }}>{tl("refundInitiated")}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "#374151", lineHeight: 19 }}>{tl("refundWalletMsg").replace("{amount}", String(Math.round(parseFloat(String(ride?.fare ?? 0)) - appliedFee)))}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(tabs)")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 16, borderRadius: 14, backgroundColor: "#F1F5F9" }}>
              <Ionicons name="home-outline" size={17} color={C.textSecondary} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.textSecondary }}>{tl("home")}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={onReset} style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 16, borderRadius: 14, backgroundColor: C.primary }}>
              <Ionicons name="add" size={17} color="#fff" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>{tl("bookNewRide")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (status === "completed") {
    return (
      <View style={{ flex: 1, backgroundColor: C.background }}>
        <View style={{ paddingTop: topPad + 24, paddingBottom: 32, alignItems: "center", paddingHorizontal: 24, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Ionicons name="checkmark-circle" size={40} color="#10B981" />
          </View>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: C.text }}>{tl("rideCompleteExclaim")}</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: C.textMuted, marginTop: 6 }}>
            Rs. {parseFloat(String(ride?.fare ?? 0)).toLocaleString()} · {parseFloat(String(ride?.distance ?? 0)).toFixed(1)} km
          </Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, gap: 14 }}>
          {!ratingDone ? (
            <View style={{ borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: C.border }}>
              <LinearGradient colors={["#1E293B", "#0F172A"]} style={{ padding: 20, alignItems: "center", gap: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", marginBottom: 12 }} />
                <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(245,158,11,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(245,158,11,0.4)", marginBottom: 10 }}>
                  <Ionicons name="star" size={28} color="#F59E0B" />
                </View>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#fff" }}>{tl("rateYourDriver")}</Text>
                {ride.riderName ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{tl("howWasRide").replace("{name}", ride.riderName)}</Text> : null}
                <View style={{ flexDirection: "row", gap: 14, marginTop: 18, marginBottom: 6 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <TouchableOpacity activeOpacity={0.7} key={s} onPress={() => setRating(s)} style={{ padding: 4 }}>
                      <Ionicons name={s <= rating ? "star" : "star-outline"} size={38} color={s <= rating ? "#F59E0B" : "rgba(255,255,255,0.25)"} />
                    </TouchableOpacity>
                  ))}
                </View>
                {rating > 0 && (
                  <View style={{ backgroundColor: "rgba(245,158,11,0.15)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", marginTop: 4 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#FCD34D" }}>
                      {rating === 5 ? tl("ratingExcellent") : rating >= 4 ? tl("ratingGreat") : rating >= 3 ? tl("ratingOkay") : tl("ratingCouldBeBetter")}
                    </Text>
                  </View>
                )}
              </LinearGradient>
              <View style={{ backgroundColor: C.surface, padding: 20, gap: 12 }}>
                <TextInput placeholder={tl("leaveComment")} value={ratingComment} onChangeText={setRatingComment} multiline numberOfLines={2}
                  style={{ borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13, fontFamily: "Inter_400Regular", fontSize: 14, color: C.text, minHeight: 60, textAlignVertical: "top", backgroundColor: C.surfaceSecondary }}
                  placeholderTextColor={C.textMuted}
                />
                <TouchableOpacity activeOpacity={0.7} onPress={async () => {
                  if (rating === 0) return;
                  try {
                    await rateRide(rideId, { stars: rating, comment: ratingComment || undefined });
                    setRatingDone(true);
                    AsyncStorage.setItem(`rated_ride_${rideId}`, "1").catch(() => {});
                  } catch { showToast(tl("couldNotSubmitRating"), "error"); }
                }} disabled={rating === 0} style={{ opacity: rating === 0 ? 0.45 : 1 }}>
                  <LinearGradient colors={rating > 0 ? ["#F59E0B", "#D97706"] : [C.border, C.border]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                    <Ionicons name="paper-plane" size={16} color="#fff" />
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>{tl("submitRating")}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setRatingDone(true)} style={{ alignItems: "center", paddingVertical: 6 }}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: C.textMuted }}>{tl("skipForNow")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ backgroundColor: C.greenBg, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: C.greenBorder }}>
              <Ionicons name="checkmark-circle" size={20} color={C.emerald} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.emeraldDeep }}>{tl("thanksForRating")}</Text>
            </View>
          )}

          {/* Receipt */}
          <View style={{ backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: "hidden" }}>
            <View style={{ backgroundColor: C.surfaceSecondary, padding: 14, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: C.text }}>{tl("receiptTitle")}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: C.textMuted }}>#{rideId.slice(-8).toUpperCase()}</Text>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              {[
                { lbl: tl("vehicleLabel"), val: ({ bike: tl("bike"), car: tl("car"), rickshaw: tl("rickshaw"), daba: tl("daba"), school_shift: tl("schoolShift") } as Record<string, string>)[rideType] ?? rideType },
                { lbl: tl("distance"), val: `${parseFloat(String(ride?.distance ?? 0)).toFixed(1)} km` },
                { lbl: tl("payment"), val: ride?.paymentMethod === "wallet" ? tl("paymentWallet") : ride?.paymentMethod === "jazzcash" ? tl("paymentJazzCash") : ride?.paymentMethod === "easypaisa" ? tl("paymentEasyPaisa") : tl("paymentCashLabel") },
                { lbl: tl("driver"), val: ride?.riderName || tl("ajkDriver") },
              ].map((r) => (
                <View key={r.lbl} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: C.textMuted }}>{r.lbl}</Text>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: C.text }}>{r.val}</Text>
                </View>
              ))}
              <View style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 15, color: C.text }}>{tl("total")}</Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: C.success }}>Rs. {parseFloat(String(ride?.fare ?? 0)).toLocaleString()}</Text>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(tabs)")} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 16, borderRadius: 14, backgroundColor: "#F1F5F9" }}>
              <Ionicons name="home-outline" size={17} color={C.textSecondary} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.textSecondary }}>{tl("home")}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={onReset} style={{ flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 16, borderRadius: 14, backgroundColor: C.primary }}>
              <Ionicons name="add" size={17} color="#fff" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" }}>{tl("bookNewRide")}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>
    );
  }

  /* ── ACTIVE RIDE (accepted / arrived / in_transit) ── Map filling screen + bottom card */
  const riderLat = riderLivePos?.lat ?? ride?.riderLat;
  const riderLng = riderLivePos?.lng ?? ride?.riderLng;
  const hasRiderPos = riderLat != null && riderLng != null;

  const mapMarkers: { lat: number; lng: number; color: string }[] = [
    ...(hasRiderPos ? [{ lat: riderLat as number, lng: riderLng as number, color: "green" }] : []),
    ...(ride?.pickupLat != null ? [{ lat: ride.pickupLat, lng: ride.pickupLng!, color: "red" }] : []),
    ...(ride?.dropLat != null && status === "in_transit" ? [{ lat: ride.dropLat, lng: ride.dropLng!, color: "blue" }] : []),
  ];

  const riderPickupKm = hasRiderPos && ride?.pickupLat != null
    ? haversineKm(riderLat as number, riderLng as number, ride.pickupLat, ride.pickupLng!)
    : null;
  const isNearby = riderPickupKm != null && riderPickupKm < 0.3;
  const isLive = riderLivePos != null;
  const stale = !isLive && ride?.riderLocAge != null && ride.riderLocAge > 90;

  const mapZoom = riderPickupKm != null && riderPickupKm < 1 ? 16 : 14;
  const mapImgUrl = mapMarkers.length > 0
    ? staticMapUrl(mapMarkers, { width: Math.round(screenWidth * 2), height: Math.round(screenHeight * 1.2), zoom: mapZoom })
    : null;

  const vehiclePlate = ride?.bids?.find((b) => b.vehiclePlate)?.vehiclePlate ?? null;
  const completedColor = hdrCfg.color;

  return (
    <View style={{ flex: 1 }}>
      {/* Full screen map background */}
      <View style={StyleSheet.absoluteFillObject}>
        {mapImgUrl ? (
          <Image source={{ uri: mapImgUrl }} style={{ flex: 1 }} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#0F172A", "#1E293B"]} style={{ flex: 1 }} />
        )}
        {!mapImgUrl && (
          <View style={{ position: "absolute", top: "45%", left: 0, right: 0, alignItems: "center" }}>
            <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
              {tl("waitingForDriverLocation")}
            </Text>
          </View>
        )}
      </View>

      {/* Top left: back + ride ID */}
      <View style={{ position: "absolute", top: topPad + 12, left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 20 }}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(tabs)")} style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Status banner chip */}
        <View style={{ backgroundColor: hdrCfg.color + "DD", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Ionicons name={hdrCfg.icon} size={13} color="#fff" />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: "#fff" }}>{hdrCfg.banner}</Text>
        </View>

        {/* Live location badge top-right */}
        <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: isLive ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.15)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isLive ? "#10B981" : "#64748B", transform: [{ scale: isLive ? livePulse : 1 }], opacity: isLive ? livePulseOp : 0.7 }} />
            <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: isLive ? "#10B981" : "#94A3B8" }}>{isLive ? "LIVE" : "LAST"}</Text>
          </View>
        </View>
      </View>

      {/* ETA/distance chip — center of screen top area */}
      {riderPickupKm != null && (
        <View style={{ position: "absolute", top: topPad + 60, left: 0, right: 0, alignItems: "center", zIndex: 20 }}>
          <View style={{ backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff", textAlign: "center" }}>
              {isNearby ? "🚦 Arrived!" : `${riderPickupKm < 1 ? `${Math.round(riderPickupKm * 1000)}m` : `${riderPickupKm.toFixed(1)}km`} away · ~${Math.max(1, Math.ceil(riderPickupKm / 0.4))} min`}
            </Text>
          </View>
        </View>
      )}

      {/* SOS floating button — top right */}
      {sosEnabled && (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleSos}
          disabled={sosLoading || sosSent}
          style={{ position: "absolute", top: topPad + 70, right: 16, zIndex: 30 }}
        >
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            {!sosSent && (
              <Animated.View style={{ position: "absolute", width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(239,68,68,0.3)", transform: [{ scale: sosRing }], opacity: sosRingOp }} />
            )}
            <LinearGradient
              colors={sosSent ? ["#4B5563", "#374151"] : ["#EF4444", "#B91C1C"]}
              style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: sosSent ? 0 : 1.5, borderColor: "rgba(239,68,68,0.7)" }}
            >
              {sosLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "#fff", letterSpacing: 0.5 }}>{sosSent ? "✓" : "SOS"}</Text>}
            </LinearGradient>
          </View>
        </TouchableOpacity>
      )}

      {/* Connection quality warning */}
      {connectionType === "polling" && (
        <TouchableOpacity activeOpacity={0.7} onPress={reconnect} style={{ position: "absolute", top: topPad + 122, left: 16, right: 16, zIndex: 20, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 }}>
          <Ionicons name="wifi-outline" size={14} color="#D97706" />
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "#92400E", flex: 1 }}>{tl("liveUpdatesPaused")}</Text>
          <Ionicons name="refresh-outline" size={14} color="#D97706" />
        </TouchableOpacity>
      )}

      {/* ── Bottom Card ── */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          transform: [{ translateY: cardSlide }],
          zIndex: 20,
        }}
      >
        <View style={{
          backgroundColor: colorScheme === "dark" ? "#1E293B" : "#fff",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          paddingTop: 0,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.18, shadowRadius: 20 },
            android: { elevation: 24 },
            web: { boxShadow: "0 -6px 30px rgba(0,0,0,0.2)" },
          }),
        }}>
          {/* Drag handle */}
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 6 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.15)" : "#E2E8F0" }} />
          </View>

          {/* Status indicator bar */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14, backgroundColor: hdrCfg.color + "15", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: hdrCfg.color + "30" }}>
            <Ionicons name={hdrCfg.icon} size={14} color={hdrCfg.color} />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: hdrCfg.color, flex: 1 }}>{hdrCfg.title}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>{elapsedStr}</Text>
          </View>

          {/* OTP — when arrived */}
          {status === "arrived" && !tripOtp && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 14, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "rgba(245,158,11,0.3)" }}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#F59E0B" />
              <Text style={{ flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#D97706" }}>Generating your security code...</Text>
              <ActivityIndicator size="small" color="#F59E0B" />
            </View>
          )}
          {status === "arrived" && tripOtp && (
            <Reanimated.View entering={ZoomIn.springify().damping(14)} style={{ marginBottom: 14 }}>
              <LinearGradient colors={["rgba(245,158,11,0.18)", "rgba(217,119,6,0.08)"]} style={{ borderRadius: 16, borderWidth: 1.5, borderColor: "rgba(245,158,11,0.45)", padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Ionicons name="shield-checkmark" size={18} color="#FCD34D" />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: "#FCD34D", flex: 1 }}>{tl("tripSecurityCode")}</Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(252,211,77,0.6)" }}>{tl("shareWithDriver")}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 10 }}>
                  {tripOtp.split("").map((digit, idx) => (
                    <LinearGradient key={idx} colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0.05)"]} style={{ width: 54, height: 64, borderRadius: 14, borderWidth: 2, borderColor: "rgba(245,158,11,0.5)", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 30, color: "#FCD34D" }}>{digit}</Text>
                    </LinearGradient>
                  ))}
                </View>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={async () => { await Clipboard.setStringAsync(tripOtp); setOtpCopied(true); setTimeout(() => setOtpCopied(false), 2500); }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: otpCopied ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.18)", paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: otpCopied ? "rgba(16,185,129,0.45)" : "rgba(245,158,11,0.4)" }}
                >
                  <Ionicons name={otpCopied ? "checkmark-circle" : "copy-outline"} size={15} color={otpCopied ? "#10B981" : "#FCD34D"} />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, color: otpCopied ? "#10B981" : "#FCD34D" }}>{otpCopied ? tl("copiedExclaim") : tl("copyCode")}</Text>
                </TouchableOpacity>
              </LinearGradient>
            </Reanimated.View>
          )}

          {/* Rider info row */}
          {ride?.riderName && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
              {/* Avatar */}
              <View style={{ position: "relative" }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: hdrCfg.color + "20", alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: hdrCfg.color }}>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: hdrCfg.color }}>{ride.riderName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: "#10B981", borderWidth: 2.5, borderColor: colorScheme === "dark" ? "#1E293B" : "#fff" }} />
              </View>

              {/* Name + rating */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}>{ride.riderName}</Text>
                {ride?.riderAvgRating != null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                    {[1, 2, 3, 4, 5].map((s) => <Ionicons key={s} name={s <= Math.round(ride.riderAvgRating ?? 0) ? "star" : "star-outline"} size={11} color="#F59E0B" />)}
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#F59E0B" }}>{ride.riderAvgRating.toFixed(1)}</Text>
                  </View>
                )}
                {ride.riderPhone && (
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: colorScheme === "dark" ? "#64748B" : "#94A3B8", marginTop: 2 }}>{ride.riderPhone}</Text>
                )}
              </View>

              {/* Vehicle */}
              <View style={{ alignItems: "center", gap: 4 }}>
                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F1F5F9", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }}>
                  <Text style={{ fontSize: 22 }}>{vehicleIcon}</Text>
                </View>
                {vehiclePlate && (
                  <View style={{ backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#F1F5F9", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.12)" : "#E2E8F0" }}>
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: colorScheme === "dark" ? "#fff" : "#0F172A", letterSpacing: 0.8 }}>{String(vehiclePlate)}</Text>
                  </View>
                )}
              </View>

              {/* Call button */}
              {ride.riderPhone && (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => Linking.openURL(`tel:${ride.riderPhone}`)}
                  style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="call" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Step progress bar */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
            {["accepted", "arrived", "in_transit", "completed"].map((s, i) => {
              const done = stepIdx >= RIDE_STEPS.indexOf(s);
              const active = status === s;
              const isLast = i === 3;
              const nodeColor = done ? completedColor : colorScheme === "dark" ? "#334155" : "#E2E8F0";
              return (
                <React.Fragment key={s}>
                  <View style={{ alignItems: "center", gap: 4 }}>
                    <View style={{
                      width: 28, height: 28, borderRadius: 14,
                      backgroundColor: nodeColor,
                      alignItems: "center", justifyContent: "center",
                      borderWidth: active ? 2 : 0,
                      borderColor: active ? completedColor : "transparent",
                      ...(active ? { shadowColor: completedColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 5 } : {}),
                    }}>
                      {done ? (
                        <Ionicons name={active ? hdrCfg.icon : "checkmark"} size={active ? 13 : 12} color="#fff" />
                      ) : (
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colorScheme === "dark" ? "#475569" : "#CBD5E1" }} />
                      )}
                    </View>
                    <Text style={{ fontSize: 9, textAlign: "center", color: done ? (colorScheme === "dark" ? "#fff" : "#0F172A") : colorScheme === "dark" ? "#475569" : "#CBD5E1", fontFamily: active ? "Inter_700Bold" : done ? "Inter_500Medium" : "Inter_400Regular", maxWidth: 52 }}>
                      {(["stepAccepted", "stepArrived", "stepEnRoute", "stepCompleted"] as TranslationKey[])[i] ? tl(["stepAccepted", "stepArrived", "stepEnRoute", "stepCompleted"][i] as TranslationKey) : s}
                    </Text>
                  </View>
                  {!isLast && (
                    <View style={{ height: 3, flex: 1, backgroundColor: colorScheme === "dark" ? "#334155" : "#E2E8F0", marginTop: -18, borderRadius: 2, overflow: "hidden" }}>
                      {stepIdx > RIDE_STEPS.indexOf(s) && (
                        <Animated.View style={{ height: "100%", borderRadius: 2, backgroundColor: completedColor, width: stepIdx === RIDE_STEPS.indexOf(s) + 1 ? stepProgress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) : "100%" }} />
                      )}
                    </View>
                  )}
                </React.Fragment>
              );
            })}
          </View>

          {/* Fare + route summary */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <View style={{ flex: 1, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "#F1F5F9" }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>{tl("pickup")}</Text>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginTop: 2 }} numberOfLines={1}>{ride?.pickupAddress}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "#F1F5F9" }}>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>{tl("dropoff")}</Text>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginTop: 2 }} numberOfLines={1}>{ride?.dropAddress}</Text>
            </View>
            <View style={{ backgroundColor: "rgba(16,185,129,0.1)", borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "rgba(16,185,129,0.25)" }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#10B981" }}>Rs. {Math.round(parseFloat(String(ride?.fare ?? 0)))}</Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: "#10B981", marginTop: 1 }}>Fare</Text>
            </View>
          </View>

          {/* Cancel */}
          {canCancel && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => openUnifiedCancelModal()} disabled={cancelling}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.06)" }}
            >
              {cancelling ? <ActivityIndicator color="#EF4444" size="small" /> : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#EF4444" }}>
                    {tl("cancelRideLabel")}
                    {inGracePeriod && graceSecondsLeft !== null ? ` (Free · ${Math.floor(graceSecondsLeft / 60)}:${String(graceSecondsLeft % 60).padStart(2, "0")} left)` : ""}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {cancelModalTarget && (
        <CancelModal
          target={cancelModalTarget}
          cancellationFee={effectiveCancellationFee}
          apiBase={rideApiBase}
          token={token}
          onClose={() => setCancelModalTarget(null)}
          onDone={(result) => {
            setCancelResult({ cancellationFee: result?.cancellationFee, cancelReason: result?.cancelReason });
            setRide((r) => r ? { ...r, status: "cancelled" } : r);
          }}
        />
      )}
    </View>
  );
}
