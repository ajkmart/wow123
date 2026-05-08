import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMapsAutocomplete, resolveLocation, reverseGeocodeCoords, staticMapUrl } from "@/hooks/useMaps";
import type { MapPrediction } from "@/hooks/useMaps";
import { WebView } from "react-native-webview";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Modal,
  Platform,
  TouchableOpacity,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
  StyleSheet,
  KeyboardAvoidingView,
} from "react-native";
import Reanimated, { FadeInDown, FadeIn, SlideInDown } from "react-native-reanimated";
import { RT } from "@/constants/rideTokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { useAuth, hasRole } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { AuthGateSheet, useAuthGate, useRoleGate, RoleBlockSheet } from "@/components/AuthGateSheet";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { useLanguage } from "@/context/LanguageContext";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { useApiCall } from "@/hooks/useApiCall";
import { API_BASE, unwrapApiResponse } from "@/utils/api";
import { ServiceListSkeleton, FareEstimateSkeleton, HistoryRowSkeleton } from "@/components/ride/Skeletons";
import { PermissionGuide } from "@/components/PermissionGuide";
import {
  estimateFare,
  bookRide,
  getRideStops,
  getRideServices,
  getRideHistory,
  getSchoolRoutes,
  subscribeSchoolRoute,
  updateLocation,
} from "@workspace/api-client-react";
import type {
  BookRideRequest,
  EstimateFareRequest,
  SchoolSubscribeRequest,
} from "@workspace/api-client-react";

type MapPickerResult = { lat: number; lng: number; address: string };

type SchoolSubscribeRequestWithNotes = SchoolSubscribeRequest & {
  notes?: string;
  shift?: "morning" | "afternoon" | "both";
  startDate?: string;
  recurring?: boolean;
};

type PopularSpot = {
  id: string;
  name: string;
  nameUrdu?: string;
  lat: number;
  lng: number;
  icon?: string;
  category?: string;
};

type ServiceType = {
  key: string;
  name: string;
  nameUrdu?: string;
  icon: string;
  color?: string;
  baseFare: number;
  perKm: number;
  minFare: number;
  maxPassengers: number;
  description?: string;
  allowBargaining?: boolean;
  isParcel?: boolean;
};

const PARCEL_KEYS = ["parcel", "courier", "delivery", "cargo", "freight"];
const isParcelService = (key: string | null | undefined, svc?: ServiceType) => {
  if (!key) return false;
  return (svc?.isParcel === true) || PARCEL_KEYS.some((k) => key.toLowerCase().includes(k));
};

const PENDING_RIDE_KEY = "@ajkmart_pending_ride_booking";

type BookedRide = {
  id: string;
  type?: string;
  status?: string;
  fare?: number;
  isBargaining?: boolean;
  effectiveFare?: number;
};

type RideBookingFormProps = {
  onBooked: (ride: BookedRide) => void;
  prefillPickup?: string;
  prefillDrop?: string;
  prefillType?: string;
};

type LocState =
  | { text: string; lat: number; lng: number; address: string }
  | { text: string; lat: null;   lng: null;   address: null  };

type BookingStep = "location" | "vehicle" | "confirm";

const STEP_SHEET_HEIGHTS: Record<BookingStep, number> = {
  location: 0.52,
  vehicle: 0.56,
  confirm: 0.60,
};

function SkeletonBox({ w, h, radius = 8 }: { w: number | `${number}%`; h: number; radius?: number }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    p.start();
    return () => p.stop();
  }, []);
  return (
    <Animated.View
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        backgroundColor: "rgba(255,255,255,0.12)",
        opacity: anim,
      }}
    />
  );
}

export function RideBookingForm({ onBooked, prefillPickup, prefillDrop, prefillType }: RideBookingFormProps) {
  const colorScheme = useColorScheme();
  const C = colorScheme === "dark" ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user, updateUser, token } = useAuth();
  const { showToast } = useToast();
  const { language } = useLanguage();
  const tl = (key: TranslationKey) => tDual(key, language);
  const { config } = usePlatformConfig();
  const { requireAuth, sheetProps: authSheetProps } = useAuthGate();
  const { requireCustomerRole, roleBlockProps } = useRoleGate();
  const rideCfg = config.rides;

  const [step, setStep] = useState<BookingStep>("location");
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const stepSlideAnim = useRef(new Animated.Value(0)).current;

  const [pickupLoc, setPickupLoc] = useState<LocState>({ text: "", lat: null, lng: null, address: null });
  const [dropLoc,   setDropLoc]   = useState<LocState>({ text: "", lat: null, lng: null, address: null });

  const pickup    = pickupLoc.text;
  const drop      = dropLoc.text;
  const pickupObj = pickupLoc.lat !== null ? { lat: pickupLoc.lat, lng: pickupLoc.lng, address: pickupLoc.address } : null;
  const dropObj   = dropLoc.lat   !== null ? { lat: dropLoc.lat,   lng: dropLoc.lng,   address: dropLoc.address   } : null;

  function setPickup(text: string) { setPickupLoc(prev => ({ ...prev, text, lat: null, lng: null, address: null })); }
  function setDrop(text: string)   { setDropLoc(prev   => ({ ...prev, text, lat: null, lng: null, address: null })); }
  function setPickupObj(obj: { lat: number; lng: number; address: string } | null) {
    if (obj) setPickupLoc({ text: obj.address, lat: obj.lat, lng: obj.lng, address: obj.address });
    else     setPickupLoc(prev => ({ text: prev.text, lat: null, lng: null, address: null }));
  }
  function setDropObj(obj: { lat: number; lng: number; address: string } | null) {
    if (obj) setDropLoc({ text: obj.address, lat: obj.lat, lng: obj.lng, address: obj.address });
    else     setDropLoc(prev => ({ text: prev.text, lat: null, lng: null, address: null }));
  }

  const [rideType, setRideType] = useState<string | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [services, setServices] = useState<ServiceType[]>([]);
  const [servicesError, setServicesError] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [payMethods, setPayMethods] = useState<{ id: string; label?: string; name?: string }[]>([
    { id: "cash", label: "Cash" },
    { id: "wallet", label: "Wallet" },
  ]);
  const [estimate, setEstimate] = useState<{
    fare: number; dist: number; dur: string; baseFare: number;
    gstAmount: number; bargainEnabled: boolean; minOffer: number;
  } | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [booking, setBooking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [locDenied, setLocDenied] = useState(false);
  const [showBargain, setShowBargain] = useState(false);
  const [offeredFare, setOfferedFare] = useState("");
  const [bargainNote, setBargainNote] = useState("");
  const [pickupError, setPickupError] = useState("");
  const [pickupFocus, setPickupFocus] = useState(false);
  const [dropFocus, setDropFocus] = useState(false);
  const [popularSpots, setPopularSpots] = useState<PopularSpot[]>([]);
  const [permGuideVisible, setPermGuideVisible] = useState(false);
  const [estimateForType, setEstimateForType] = useState<string | null>(null);
  const [estimateAt, setEstimateAt] = useState<number | null>(null);
  const [estimateAgeMinutes, setEstimateAgeMinutes] = useState(0);
  const [estimateNonce, setEstimateNonce] = useState(0);
  const [mapPickerTarget, setMapPickerTarget] = useState<"pickup" | "drop">("pickup");
  const [inlineMapPick, setInlineMapPick] = useState(false);
  const [inlineMapResult, setInlineMapResult] = useState<MapPickerResult | null>(null);
  const inlineMapAnim = useRef(new Animated.Value(0)).current;
  const [schoolRoutes, setSchoolRoutes] = useState<any[]>([]);
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<any>(null);
  const [schoolStudent, setSchoolStudent] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [schoolNotes, setSchoolNotes] = useState("");
  const [schoolShift, setSchoolShift] = useState<"morning" | "afternoon" | "both">("morning");
  const [schoolStartDate, setSchoolStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [schoolRecurring, setSchoolRecurring] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [isPoolRide, setIsPoolRide] = useState(false);
  const [debtBalance, setDebtBalance] = useState(0);
  const [debtDismissed, setDebtDismissed] = useState(false);
  const liveAnim = useRef(new Animated.Value(1)).current;
  const bookBtnScale = useRef(new Animated.Value(1)).current;
  const bargainPanelH = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(liveAnim, { toValue: 0.25, duration: 550, useNativeDriver: false }),
        Animated.timing(liveAnim, { toValue: 1, duration: 550, useNativeDriver: false }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    Animated.spring(bargainPanelH, {
      toValue: showBargain ? 1 : 0,
      useNativeDriver: false,
      tension: 200,
      friction: 20,
    }).start();
  }, [showBargain]);

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  const animateToStep = (newStep: BookingStep) => {
    Animated.timing(stepSlideAnim, {
      toValue: -30,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setStep(newStep);
      stepSlideAnim.setValue(30);
      Animated.spring(stepSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 180,
        friction: 18,
      }).start();
    });
  };

  const openInlineMapPick = useCallback((target: "pickup" | "drop") => {
    setMapPickerTarget(target);
    setInlineMapResult(null);
    setInlineMapPick(true);
    Animated.spring(inlineMapAnim, { toValue: 1, useNativeDriver: true, tension: 100, friction: 12 }).start();
  }, [inlineMapAnim]);

  const closeInlineMapPick = useCallback(() => {
    Animated.timing(inlineMapAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setInlineMapPick(false);
      setInlineMapResult(null);
    });
  }, [inlineMapAnim]);

  const confirmInlineMapPick = useCallback(() => {
    if (!inlineMapResult) return;
    const { lat, lng, address } = inlineMapResult;
    if (mapPickerTarget === "pickup") {
      setPickup(address);
      setPickupObj({ lat, lng, address });
    } else {
      setDrop(address);
      setDropObj({ lat, lng, address });
    }
    closeInlineMapPick();
  }, [inlineMapResult, mapPickerTarget, closeInlineMapPick]);

  const { predictions: pickupPreds, loading: pickupLoading } =
    useMapsAutocomplete(pickupFocus ? pickup : "");
  const { predictions: dropPreds, loading: dropLoading } =
    useMapsAutocomplete(dropFocus ? drop : "");

  useEffect(() => {
    if (prefillType) setRideType(prefillType);
    if (prefillPickup) {
      setPickup(prefillPickup);
      resolveLocation(
        { placeId: "", mainText: prefillPickup, secondaryText: "", description: prefillPickup },
        (msg) => { if (__DEV__) console.warn("[RideBookingForm] prefill pickup resolve failed:", msg); },
      ).then((loc) => {
        if (loc) setPickupObj(loc);
      });
    }
    if (prefillDrop) {
      setDrop(prefillDrop);
      resolveLocation(
        { placeId: "", mainText: prefillDrop, secondaryText: "", description: prefillDrop },
        (msg) => { if (__DEV__) console.warn("[RideBookingForm] prefill drop resolve failed:", msg); },
      ).then((loc) => {
        if (loc) setDropObj(loc);
      });
    }
  }, []);

  useEffect(() => {
    if (prefillPickup) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const { latitude: lat, longitude: lng } = pos.coords;
        const data = await reverseGeocodeCoords(lat, lng);
        if (cancelled) return;
        const address = data?.address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        setPickup(address);
        setPickupObj({ lat, lng, address });
      } catch (err) {
        if (__DEV__) console.warn("[RideBookingForm] GPS auto-fill failed:", err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    getRideStops()
      .then((data) => { if (data?.locations?.length) setPopularSpots(data.locations); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/rides/payment-methods`)
      .then((r) => r.json())
      .then((j) => unwrapApiResponse<{ methods?: Array<{ key?: string; id?: string; label?: string; name?: string }> }>(j))
      .then((rideData) => {
        if (rideData?.methods?.length) {
          const mapped = rideData.methods.map((m) => ({ id: (m.key ?? m.id) ?? "", label: (m.label ?? m.name) ?? "" }));
          setPayMethods(mapped);
          setPayMethod(mapped[0]!.id);
        }
      })
      .catch(() => {
        setPayMethods([{ id: "cash", label: "Cash" }, { id: "wallet", label: "Wallet" }]);
        setPayMethod("cash");
      });
  }, []);

  const loadServices = useCallback(() => {
    setServicesLoading(true);
    setServicesError(false);
    getRideServices()
      .then((data) => {
        if (!data?.services?.length) {
          setServicesError(true);
          return;
        }
        setServices(data.services);
        setServicesError(false);
        setRideType((prev) => data.services.find((s: ServiceType) => s.key === prev) ? prev : data.services[0]!.key);
      })
      .catch(() => {
        setServicesError(true);
      })
      .finally(() => setServicesLoading(false));
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  useEffect(() => {
    if (rideType !== "school_shift") return;
    getSchoolRoutes()
      .then((data: any) => {
        if (data?.routes?.length) setSchoolRoutes(data.routes);
      })
      .catch(() => {
        if (__DEV__) console.warn("[RideBookingForm] School routes fetch failed");
      });
  }, [rideType]);

  const pendingRestoreRef = useRef(false);
  const pendingAutoBookRef = useRef(false);
  const handleBookRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user?.id || pendingRestoreRef.current) return;
    pendingRestoreRef.current = true;
    AsyncStorage.getItem(PENDING_RIDE_KEY).then(async (raw) => {
      if (!raw) return;
      try {
        await AsyncStorage.removeItem(PENDING_RIDE_KEY);
        const saved = JSON.parse(raw);
        if (saved.pickupObj) setPickupObj(saved.pickupObj);
        else if (saved.pickup) setPickup(saved.pickup);
        if (saved.dropObj) setDropObj(saved.dropObj);
        else if (saved.drop) setDrop(saved.drop);
        if (saved.rideType) setRideType(saved.rideType);
        if (saved.pickupObj && saved.dropObj) {
          pendingAutoBookRef.current = true;
          setTimeout(() => {
            animateToStep("vehicle");
          }, 600);
        }
      } catch {}
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!pendingAutoBookRef.current || !pickupObj || !dropObj || !rideType) return;
    if (!estimate || estimateForType !== rideType) return;
    pendingAutoBookRef.current = false;
    handleBookRef.current?.();
  }, [pickupObj, dropObj, rideType, estimate, estimateForType]);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`${API_BASE}/users/${user.id}/debt`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((j) => unwrapApiResponse<{ debtBalance?: number }>(j))
      .then((d) => { if ((d?.debtBalance ?? 0) > 0) setDebtBalance(d.debtBalance ?? 0); })
      .catch(() => {});
  }, [user?.id]);

  const handleMyLocation = async () => {
    setLocLoading(true);
    setLocDenied(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocDenied(true); setPermGuideVisible(true); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const data = await reverseGeocodeCoords(lat, lng);
      const address = data?.address ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      setPickup(address);
      setPickupObj({ lat, lng, address });
      setLocDenied(false);
    } catch {
      showToast("Could not get location. Please type it manually.", "error");
    } finally {
      setLocLoading(false);
    }
  };

  useEffect(() => {
    if (!pickupObj || !dropObj || !rideType) { setEstimate(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      setEstimating(true);
      estimateFare({
        pickupLat: pickupObj.lat, pickupLng: pickupObj.lng,
        dropLat: dropObj.lat, dropLng: dropObj.lng,
        type: rideType,
      } as EstimateFareRequest)
        .then((data) => {
          if (cancelled || !data) return;
          const ext = data as typeof data & { baseFare?: number; gstAmount?: number; bargainEnabled?: boolean; minOffer?: number };
          setEstimateForType(data.type ?? rideType);
          setEstimateAt(Date.now());
          setEstimateAgeMinutes(0);
          setEstimate({
            fare: data.fare, dist: data.distance, dur: data.duration,
            baseFare: ext.baseFare ?? data.fare,
            gstAmount: ext.gstAmount ?? 0,
            bargainEnabled: ext.bargainEnabled ?? false,
            minOffer: ext.minOffer ?? data.fare,
          });
        })
        .catch(() => { if (!cancelled) { setEstimate(null); setEstimateForType(null); } })
        .finally(() => { if (!cancelled) setEstimating(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pickupObj?.lat, pickupObj?.lng, dropObj?.lat, dropObj?.lng, rideType, estimateNonce]);

  useEffect(() => {
    if (!estimateAt) return;
    const interval = setInterval(() => { setEstimateAgeMinutes(Math.floor((Date.now() - estimateAt) / 60000)); }, 30000);
    return () => clearInterval(interval);
  }, [estimateAt]);

  const selectPickup = useCallback(async (pred: MapPrediction) => {
    setPickupObj(null);
    setPickup(pred.mainText);
    setPickupFocus(false);
    const loc = await resolveLocation(pred, (msg) => showToast(msg, "error"));
    if (!loc) { setPickup(""); return; }
    setPickup(pred.description);
    setPickupObj({ ...loc, address: pred.description });
  }, [showToast]);

  const selectDrop = useCallback(async (pred: MapPrediction) => {
    setDropObj(null);
    setDrop(pred.mainText);
    setDropFocus(false);
    const loc = await resolveLocation(pred, (msg) => showToast(msg, "error"));
    if (!loc) { setDrop(""); return; }
    setDrop(pred.description);
    setDropObj({ ...loc, address: pred.description });
  }, [showToast]);

  const handleChip = (spot: PopularSpot) => {
    if (!pickupObj) {
      setPickup(spot.name);
      setPickupObj({ lat: spot.lat, lng: spot.lng, address: spot.name });
    } else if (!dropObj) {
      setDrop(spot.name);
      setDropObj({ lat: spot.lat, lng: spot.lng, address: spot.name });
    }
  };

  const handleSchoolSubscribe = async () => {
    if (!user) { showToast("Please log in first", "error"); return; }
    if (!selectedRoute) { showToast("Please select a route", "error"); return; }
    if (!schoolStudent.trim()) { showToast("Please enter the student's name", "error"); return; }
    if (!schoolClass.trim()) { showToast("Please enter the student's class", "error"); return; }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(schoolStartDate)) { showToast("Please enter start date as YYYY-MM-DD", "error"); return; }
    const parsedDate = new Date(schoolStartDate);
    if (isNaN(parsedDate.getTime())) { showToast("Invalid start date", "error"); return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (parsedDate < today) { showToast("Start date cannot be in the past", "error"); return; }
    setSubscribing(true);
    try {
      const subscribePayload: SchoolSubscribeRequestWithNotes = {
        routeId: selectedRoute.id,
        studentName: schoolStudent.trim(),
        studentClass: schoolClass.trim(),
        paymentMethod: payMethod as SchoolSubscribeRequest["paymentMethod"],
        shift: schoolShift,
        startDate: schoolStartDate,
        recurring: schoolRecurring,
        ...(schoolNotes.trim() ? { notes: schoolNotes.trim() } : {}),
      };
      await subscribeSchoolRoute(subscribePayload);
      setShowSchoolModal(false);
      setSelectedRoute(null);
      setSchoolStudent("");
      setSchoolClass("");
      setSchoolNotes("");
      setSchoolShift("morning");
      setSchoolRecurring(true);
      showToast(`${schoolStudent} has been subscribed to ${selectedRoute.schoolName}!`, "success");
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      showToast(err?.response?.data?.error ?? err?.message ?? "Network error. Please try again.", "error");
    } finally {
      setSubscribing(false);
    }
  };

  const handleBook = async () => {
    if (!rideType) { showToast("Please wait — ride types are loading", "error"); return; }
    if (!pickup || !drop) { showToast("Please select pickup and drop locations", "error"); return; }
    if (!pickupObj) {
      setPickupError("Please select an exact pickup location from the suggestions");
      showToast("Please select pickup location from the list (exact location required)", "error");
      return;
    }
    setPickupError("");
    if (!dropObj) { showToast("Please select drop location from the list (exact location required)", "error"); return; }
    if (!user) {
      try {
        await AsyncStorage.setItem(PENDING_RIDE_KEY, JSON.stringify({
          pickup: pickupObj ? pickupObj.address : pickup,
          drop: dropObj ? dropObj.address : drop,
          pickupObj: pickupObj ?? null,
          dropObj: dropObj ?? null,
          rideType,
        }));
      } catch {}
      requireAuth(() => {}, { message: "Sign in to book a ride", returnTo: "/ride" });
      return;
    }
    if (!hasRole(user ?? null, "customer")) { requireCustomerRole(() => {}); return; }
    const selectedSvc = services.find((s) => s.key === rideType);
    if (isParcelService(rideType, selectedSvc)) {
      if (!receiverName.trim()) { showToast("Please enter the receiver's full name", "error"); return; }
      if (!receiverPhone.trim()) { showToast("Please enter the receiver's phone number", "error"); return; }
      const phoneDigits = receiverPhone.trim().replace(/[\s-]/g, "");
      if (!/^03\d{9}$/.test(phoneDigits)) {
        showToast("Receiver phone must be a valid Pakistani mobile number (e.g. 03001234567)", "error"); return;
      }
      setReceiverPhone(phoneDigits);
    }
    if (pickupObj && dropObj && Math.abs(pickupObj.lat - dropObj.lat) < 0.0001 && Math.abs(pickupObj.lng - dropObj.lng) < 0.0001) {
      showToast("Pickup and drop locations cannot be the same", "error"); return;
    }
    if (!estimate) { showToast("Fare estimate is being calculated. Please wait.", "error"); return; }
    if (estimateForType && estimateForType !== rideType) { showToast("Fare estimate is outdated. Please wait for it to refresh.", "error"); return; }
    if (estimateAt && Date.now() - estimateAt > 5 * 60 * 1000) {
      showToast("Fare estimate has expired — refreshing now, please try again.", "error");
      setEstimate(null); setEstimateAt(null); setEstimateNonce((n) => n + 1); return;
    }
    let parsedOffer: number | undefined;
    if (showBargain && offeredFare) {
      parsedOffer = parseFloat(offeredFare);
      if (isNaN(parsedOffer) || parsedOffer <= 0) { showToast("Please enter a valid amount for your offer", "error"); return; }
      if (parsedOffer < estimate.minOffer) { showToast(`Minimum offer is Rs. ${estimate.minOffer}`, "error"); return; }
      if (parsedOffer > estimate.fare) { showToast(`Offer cannot exceed the platform fare of Rs. ${estimate.fare}`, "error"); return; }
    }
    const effectiveFare = parsedOffer ?? estimate.fare;
    if (payMethod === "wallet" && (user?.walletBalance ?? 0) < effectiveFare) {
      showToast(`Wallet balance Rs. ${user?.walletBalance ?? 0} — insufficient. Please top up.`, "error"); return;
    }
    setBooking(true);
    try {
      if (isScheduled) {
        const scheduledDt = new Date(`${scheduledDate}T${scheduledTime}:00`);
        const fiveMinFromNow = new Date(Date.now() + 5 * 60_000);
        if (isNaN(scheduledDt.getTime()) || scheduledDt <= fiveMinFromNow) {
          showToast("Scheduled time must be at least 5 minutes in the future.", "error"); setBooking(false); return;
        }
      }
      const rideData = await bookRide({
        type: rideType,
        pickupAddress: pickup, dropAddress: drop,
        pickupLat: pickupObj.lat, pickupLng: pickupObj.lng,
        dropLat: dropObj.lat, dropLng: dropObj.lng,
        paymentMethod: payMethod,
        ...(parsedOffer !== undefined && { offeredFare: parsedOffer }),
        ...(bargainNote && { bargainNote }),
        ...(isParcelService(rideType, services.find((s) => s.key === rideType)) && receiverName.trim() && { receiverName: receiverName.trim() }),
        ...(isParcelService(rideType, services.find((s) => s.key === rideType)) && receiverPhone.trim() && { receiverPhone: receiverPhone.trim().replace(/[\s-]/g, "") }),
        ...(isParcelService(rideType, services.find((s) => s.key === rideType)) && { isParcel: true }),
        ...(isScheduled && { isScheduled: true, scheduledAt: new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString() }),
        ...(isPoolRide && { isPoolRide: true }),
      } as BookRideRequest);
      const bookedRide = rideData as BookedRide;
      if (payMethod === "wallet" && !bookedRide.isBargaining) {
        updateUser({ walletBalance: (user?.walletBalance ?? 0) - (bookedRide.effectiveFare ?? bookedRide.fare ?? 0) });
      }
      onBooked(bookedRide);
      (async () => {
        try {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status !== "granted") return;
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          await updateLocation({ userId: user?.id ?? "", latitude: pos.coords.latitude, longitude: pos.coords.longitude, role: "customer" });
        } catch {}
      })();
    } catch (err: any) {
      const errData = err?.response?.data || err?.data;
      if (errData?.activeRideId) {
        onBooked({ id: errData.activeRideId, type: rideType, status: errData.activeRideStatus });
        showToast("You have an active ride. Resuming tracking.", "info");
      } else {
        showToast(errData?.error || "Network error. Please try again.", "error");
      }
    } finally {
      setBooking(false);
    }
  };
  handleBookRef.current = handleBook;

  const fetchHistory = async () => {
    if (!user) return;
    setHistLoading(true);
    try {
      const data = await getRideHistory();
      setHistory(data?.rides || []);
    } catch { setHistory([]); }
    finally { setHistLoading(false); }
  };

  const selectedSvc = services.find((s) => s.key === rideType) ?? services[0];
  const canProceedFromLocation = !!(dropObj);
  const sheetHeight = screenHeight * STEP_SHEET_HEIGHTS[step];

  const mapMarkers = [
    ...(pickupObj ? [{ lat: pickupObj.lat, lng: pickupObj.lng, color: "green" }] : []),
    ...(dropObj ? [{ lat: dropObj.lat, lng: dropObj.lng, color: "red" }] : []),
  ];
  const mapBg = (pickupObj || dropObj) && mapMarkers.length > 0
    ? staticMapUrl(mapMarkers, { width: Math.round(screenWidth), height: Math.round(screenHeight) })
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
      <AuthGateSheet {...authSheetProps} />
      <RoleBlockSheet {...roleBlockProps} />
      <PermissionGuide visible={permGuideVisible} type="location" onClose={() => setPermGuideVisible(false)} />

      {/* Map background */}
      <View style={StyleSheet.absoluteFillObject}>
        {mapBg ? (
          <Image source={{ uri: mapBg }} style={{ flex: 1 }} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={["#0F172A", "#1E293B", "#0F172A"]}
            style={{ flex: 1 }}
          />
        )}
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" }} />
      </View>

      {/* Top nav bar */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: topPad + 8,
          paddingHorizontal: 16,
          paddingBottom: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()}
            style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: Font.bold, fontSize: 16, color: "#fff" }}>Book a Ride</Text>
            <Text style={{ fontFamily: Font.regular, fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
              {step === "location" ? "Set your destination" : step === "vehicle" ? "Choose your ride" : "Review & confirm"}
            </Text>
          </View>
          <TouchableOpacity activeOpacity={0.7} onPress={() => { setShowHistory(true); fetchHistory(); }}
            style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
          >
            <Ionicons name="time-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Step indicator dots */}
      <View style={{ position: "absolute", top: topPad + 58, left: 0, right: 0, alignItems: "center", zIndex: 10 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["location", "vehicle", "confirm"] as BookingStep[]).map((s) => (
            <View
              key={s}
              style={{
                width: step === s ? 20 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: step === s ? "#FCD34D" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </View>
      </View>

      {/* Bottom Sheet */}
      <Animated.View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: sheetHeight + insets.bottom,
          backgroundColor: colorScheme === "dark" ? "#1E293B" : "#fff",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          transform: [{ translateY: sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }],
          ...Platform.select({
            ios: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.2, shadowRadius: 20 },
            android: { elevation: 20 },
            web: { boxShadow: "0 -4px 30px rgba(0,0,0,0.25)" },
          }),
        }}
      >
        {/* Drag handle */}
        <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.15)" : "#E2E8F0" }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={10}
        >
          <Animated.View style={{ flex: 1, transform: [{ translateX: stepSlideAnim }] }}>
          {/* ── STEP 1: LOCATION ── */}
          {step === "location" && (
            <View style={{ flex: 1, paddingHorizontal: 20 }}>
              <Text style={{ fontFamily: Font.bold, fontSize: 18, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginBottom: 16 }}>
                Where to?
              </Text>

              {debtBalance > 0 && !debtDismissed && (
                <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#FCA5A5" }}>
                  <Ionicons name="warning" size={16} color="#EF4444" />
                  <Text style={{ flex: 1, fontFamily: Font.medium, fontSize: 12, color: "#991B1B" }}>Outstanding balance: Rs. {debtBalance}</Text>
                  <TouchableOpacity onPress={() => setDebtDismissed(true)} hitSlop={8}>
                    <Ionicons name="close" size={14} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Pickup row */}
              <View style={[
                styles.inputRow,
                { backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderColor: pickupFocus ? "#FCD34D" : colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "#E2E8F0" }
              ]}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#10B981", marginRight: 10 }} />
                <TextInput
                  value={pickup}
                  onChangeText={(v) => { setPickup(v); setPickupObj(null); if (pickupError) setPickupError(""); }}
                  onFocus={() => setPickupFocus(true)}
                  onBlur={() => setTimeout(() => setPickupFocus(false), 250)}
                  placeholder="Pickup location..."
                  placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"}
                  style={{ flex: 1, fontFamily: Font.medium, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", paddingVertical: 10 }}
                />
                {locLoading ? (
                  <ActivityIndicator size="small" color="#FCD34D" style={{ marginLeft: 4 }} />
                ) : (
                  <TouchableOpacity onPress={handleMyLocation} hitSlop={8} style={{ marginLeft: 4 }}>
                    <Ionicons name="locate" size={17} color={locDenied ? "#EF4444" : "#FCD34D"} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => openInlineMapPick("pickup")} hitSlop={8} style={{ marginLeft: 6 }}>
                  <Ionicons name="map-outline" size={17} color={colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                </TouchableOpacity>
              </View>

              {pickupFocus && (pickupPreds.length > 0 || pickupLoading) && (
                <View style={[styles.suggBox, { backgroundColor: colorScheme === "dark" ? "#0F172A" : "#fff", borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }]}>
                  {pickupLoading && <ActivityIndicator size="small" color="#FCD34D" style={{ padding: 6 }} />}
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="always" style={{ maxHeight: 150 }}>
                    {pickupPreds.slice(0, 5).map((pred) => (
                      <TouchableOpacity key={pred.placeId} onPress={() => selectPickup(pred)} style={styles.suggRow} activeOpacity={0.7}>
                        <Ionicons name="location-outline" size={13} color="#10B981" />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.suggTxt, { color: colorScheme === "dark" ? "#fff" : "#0F172A" }]}>{pred.mainText}</Text>
                          {pred.secondaryText ? <Text style={[styles.suggSub, { color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }]} numberOfLines={1}>{pred.secondaryText}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Drop row */}
              <View style={[
                styles.inputRow,
                { marginTop: 10, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderColor: dropFocus ? "#EF4444" : colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "#E2E8F0" }
              ]}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: "#EF4444", marginRight: 10 }} />
                <TextInput
                  value={drop}
                  onChangeText={(v) => { setDrop(v); setDropObj(null); }}
                  onFocus={() => setDropFocus(true)}
                  onBlur={() => setTimeout(() => setDropFocus(false), 250)}
                  placeholder="Drop-off location..."
                  placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"}
                  style={{ flex: 1, fontFamily: Font.medium, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", paddingVertical: 10 }}
                  autoFocus={!!pickup && !drop}
                />
                {drop.length > 0 && (
                  <TouchableOpacity onPress={() => { setDrop(""); setDropObj(null); }} hitSlop={8}>
                    <Ionicons name="close-circle" size={15} color={colorScheme === "dark" ? "#64748B" : "#94A3B8"} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => openInlineMapPick("drop")} hitSlop={8} style={{ marginLeft: 6 }}>
                  <Ionicons name="map-outline" size={17} color={colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                </TouchableOpacity>
              </View>

              {dropFocus && (dropPreds.length > 0 || dropLoading) && (
                <View style={[styles.suggBox, { backgroundColor: colorScheme === "dark" ? "#0F172A" : "#fff", borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }]}>
                  {dropLoading && <ActivityIndicator size="small" color="#EF4444" style={{ padding: 6 }} />}
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="always" style={{ maxHeight: 150 }}>
                    {dropPreds.slice(0, 5).map((pred) => (
                      <TouchableOpacity key={pred.placeId} onPress={() => selectDrop(pred)} style={styles.suggRow} activeOpacity={0.7}>
                        <Ionicons name="location-outline" size={13} color="#EF4444" />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.suggTxt, { color: colorScheme === "dark" ? "#fff" : "#0F172A" }]}>{pred.mainText}</Text>
                          {pred.secondaryText ? <Text style={[styles.suggSub, { color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }]} numberOfLines={1}>{pred.secondaryText}</Text> : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Swap */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { const s = pickupLoc; setPickupLoc(dropLoc); setDropLoc(s); }}
                style={{ position: "absolute", right: 28, top: 56, width: 28, height: 28, borderRadius: 8, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F1F5F9", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.12)" : "#E2E8F0", alignItems: "center", justifyContent: "center", zIndex: 5 }}
              >
                <Ionicons name="swap-vertical" size={14} color={colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
              </TouchableOpacity>

              {/* Popular spots */}
              {popularSpots.length > 0 && !pickupFocus && !dropFocus && (
                <ScrollView
                  horizontal showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 14, marginHorizontal: -20 }}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
                >
                  {popularSpots.map((spot) => (
                    <TouchableOpacity
                      key={spot.id} onPress={() => handleChip(spot)} activeOpacity={0.7}
                      style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 50, borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "#E2E8F0" }}
                    >
                      <Text style={{ fontSize: 12 }}>{spot.icon || "📍"}</Text>
                      <Text style={{ fontFamily: Font.semiBold, fontSize: 12, color: colorScheme === "dark" ? "#E2E8F0" : "#0F172A" }}>{spot.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* CTA */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => { if (canProceedFromLocation) animateToStep("vehicle"); else showToast("Please set your drop-off location first", "error"); }}
                style={{ marginTop: "auto", marginBottom: insets.bottom + 8, borderRadius: 18, overflow: "hidden" }}
              >
                <LinearGradient
                  colors={canProceedFromLocation ? ["#FCD34D", "#F59E0B"] : ["#334155", "#334155"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 }}
                >
                  <Text style={{ fontFamily: Font.bold, fontSize: 15, color: canProceedFromLocation ? "#0A0F1E" : "#64748B" }}>
                    {canProceedFromLocation ? "Choose Vehicle" : "Set Drop Location"}
                  </Text>
                  {canProceedFromLocation && <Ionicons name="arrow-forward" size={18} color="#0A0F1E" />}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2: VEHICLE ── */}
          {step === "vehicle" && (
            <View style={{ flex: 1, paddingHorizontal: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                <TouchableOpacity onPress={() => animateToStep("location")} style={{ marginRight: 10 }} hitSlop={8}>
                  <Ionicons name="chevron-back" size={20} color={colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                </TouchableOpacity>
                <Text style={{ fontFamily: Font.bold, fontSize: 18, color: colorScheme === "dark" ? "#fff" : "#0F172A", flex: 1 }}>
                  Choose your ride
                </Text>
              </View>

              {/* Route summary */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }}>
                <View style={{ alignItems: "center", gap: 3 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#10B981" }} />
                  <View style={{ width: 1.5, height: 12, backgroundColor: colorScheme === "dark" ? "#334155" : "#CBD5E1" }} />
                  <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: "#EF4444" }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Font.medium, fontSize: 11, color: colorScheme === "dark" ? "#94A3B8" : "#64748B" }} numberOfLines={1}>{pickup}</Text>
                  <Text style={{ fontFamily: Font.medium, fontSize: 11, color: colorScheme === "dark" ? "#94A3B8" : "#64748B", marginTop: 4 }} numberOfLines={1}>{drop}</Text>
                </View>
                <TouchableOpacity onPress={() => animateToStep("location")} hitSlop={8}>
                  <Text style={{ fontFamily: Font.semiBold, fontSize: 11, color: "#FCD34D" }}>Edit</Text>
                </TouchableOpacity>
              </View>

              {/* Vehicle cards */}
              {servicesLoading ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                  {[0, 1, 2].map((i) => <SkeletonBox key={i} w={130} h={140} radius={20} />)}
                </ScrollView>
              ) : servicesError ? (
                <View style={{ backgroundColor: colorScheme === "dark" ? "#1E293B" : "#FEF2F2", borderRadius: 16, padding: 16, alignItems: "center", gap: 10, borderWidth: 1, borderColor: colorScheme === "dark" ? "#7F1D1D" : "#FECACA" }}>
                  <Ionicons name="alert-circle-outline" size={28} color="#EF4444" />
                  <Text style={{ fontFamily: Font.semiBold, fontSize: 14, color: colorScheme === "dark" ? "#FCA5A5" : "#DC2626", textAlign: "center" }}>Could not load ride types</Text>
                  <Text style={{ fontFamily: Font.regular, fontSize: 12, color: colorScheme === "dark" ? "#94A3B8" : "#6B7280", textAlign: "center" }}>Please check your connection and try again.</Text>
                  <TouchableOpacity activeOpacity={0.75} onPress={loadServices} style={{ backgroundColor: "#EF4444", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: Font.semiBold, fontSize: 13, color: "#fff" }}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                  {services.map((svc, idx) => {
                    const active = rideType === svc.key;
                    const accentColor = svc.color ?? "#FCD34D";
                    return (
                      <Reanimated.View key={svc.key} entering={FadeInDown.delay(idx * 60).springify().damping(16)}>
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => setRideType(svc.key)}
                          style={{
                            width: 130,
                            borderRadius: 20,
                            padding: 14,
                            backgroundColor: active
                              ? (colorScheme === "dark" ? `${accentColor}18` : `${accentColor}10`)
                              : (colorScheme === "dark" ? "#0F172A" : "#F8FAFC"),
                            borderWidth: active ? 2 : 1,
                            borderColor: active ? accentColor : (colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0"),
                            minHeight: 140,
                          }}
                        >
                          {active && (
                            <View style={{ position: "absolute", top: 10, right: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: accentColor, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name="checkmark" size={11} color="#fff" />
                            </View>
                          )}
                          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: active ? `${accentColor}22` : (colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "#F1F5F9"), alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                            <Text style={{ fontSize: 28 }}>{svc.icon}</Text>
                          </View>
                          <Text style={{ fontFamily: Font.bold, fontSize: 14, color: active ? accentColor : (colorScheme === "dark" ? "#fff" : "#0F172A"), marginBottom: 4 }}>
                            {svc.name}
                          </Text>
                          <View style={{ backgroundColor: active ? `${accentColor}22` : (colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "#F1F5F9"), borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 4 }}>
                            <Text style={{ fontFamily: Font.bold, fontSize: 12, color: active ? accentColor : (colorScheme === "dark" ? "#94A3B8" : "#64748B") }}>
                              {active && estimate && estimateForType === svc.key ? `Rs. ${estimate.fare}` : `Rs. ${svc.minFare}+`}
                            </Text>
                          </View>
                          {active && estimate && estimateForType === svc.key && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 4 }}>
                              <Ionicons name="time-outline" size={10} color={accentColor} />
                              <Text style={{ fontFamily: Font.regular, fontSize: 10, color: colorScheme === "dark" ? "#94A3B8" : "#64748B" }}>{estimate.dur}</Text>
                            </View>
                          )}
                          {svc.maxPassengers > 1 && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                              <Ionicons name="people-outline" size={10} color={colorScheme === "dark" ? "#64748B" : "#94A3B8"} />
                              <Text style={{ fontFamily: Font.regular, fontSize: 10, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>{svc.maxPassengers} seats</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </Reanimated.View>
                    );
                  })}
                </ScrollView>
              )}

              {/* Fare estimate */}
              <View style={{ marginTop: 14 }}>
                {estimating && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <SkeletonBox w="45%" h={48} radius={12} />
                    <SkeletonBox w="45%" h={48} radius={12} />
                  </View>
                )}
                {!estimating && estimate && (
                  <Reanimated.View entering={FadeIn.duration(300)} style={{ backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ alignItems: "center", flex: 1 }}>
                        <Text style={{ fontFamily: Font.regular, fontSize: 11, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>Distance</Text>
                        <Text style={{ fontFamily: Font.bold, fontSize: 15, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginTop: 2 }}>{estimate.dist} km</Text>
                      </View>
                      <View style={{ width: 1, height: 32, backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }} />
                      <View style={{ alignItems: "center", flex: 1 }}>
                        <Text style={{ fontFamily: Font.regular, fontSize: 11, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>ETA</Text>
                        <Text style={{ fontFamily: Font.bold, fontSize: 15, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginTop: 2 }}>{estimate.dur}</Text>
                      </View>
                      <View style={{ width: 1, height: 32, backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }} />
                      <View style={{ alignItems: "center", flex: 1 }}>
                        <Text style={{ fontFamily: Font.regular, fontSize: 11, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>Fare</Text>
                        <Text style={{ fontFamily: Font.bold, fontSize: 18, color: "#10B981", marginTop: 2 }}>Rs. {estimate.fare}</Text>
                      </View>
                    </View>
                  </Reanimated.View>
                )}
              </View>

              {/* Bargain row */}
              {!estimating && estimate?.bargainEnabled && (
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => { setShowBargain((v) => !v); setOfferedFare(""); setBargainNote(""); }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: showBargain ? "rgba(252,211,77,0.08)" : "transparent", borderWidth: 1, borderColor: showBargain ? "#FCD34D" : colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "#E2E8F0", borderRadius: 14, padding: 12 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color={showBargain ? "#FCD34D" : colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                      <View>
                        <Text style={{ fontFamily: Font.bold, fontSize: 13, color: showBargain ? "#FCD34D" : colorScheme === "dark" ? "#fff" : "#0F172A" }}>
                          {showBargain ? "Bargaining ON" : "Bargain"}
                        </Text>
                        <Text style={{ fontFamily: Font.regular, fontSize: 11, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>
                          Min: Rs. {estimate.minOffer}
                        </Text>
                      </View>
                    </View>
                    <Ionicons name={showBargain ? "chevron-up" : "chevron-down"} size={16} color={showBargain ? "#FCD34D" : colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                  </TouchableOpacity>

                  <Animated.View style={{ overflow: "hidden", maxHeight: bargainPanelH.interpolate({ inputRange: [0, 1], outputRange: [0, 110] }), opacity: bargainPanelH }}>
                    <View style={{ backgroundColor: "rgba(252,211,77,0.06)", borderWidth: 1, borderColor: "rgba(252,211,77,0.2)", borderTopWidth: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 12, gap: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colorScheme === "dark" ? "#0F172A" : "#fff", borderWidth: 1.5, borderColor: "#FCD34D", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: Font.bold, fontSize: 14, color: colorScheme === "dark" ? "#94A3B8" : "#64748B", marginRight: 4 }}>Rs.</Text>
                        <TextInput
                          value={offeredFare} onChangeText={setOfferedFare} keyboardType="numeric"
                          placeholder={String(estimate.minOffer)} placeholderTextColor={colorScheme === "dark" ? "#334155" : "#CBD5E1"}
                          style={{ flex: 1, fontFamily: Font.bold, fontSize: 18, color: colorScheme === "dark" ? "#fff" : "#0F172A", paddingVertical: 8 }}
                        />
                        {offeredFare !== "" && (
                          <TouchableOpacity onPress={() => setOfferedFare("")} hitSlop={8}>
                            <Ionicons name="close-circle" size={16} color={colorScheme === "dark" ? "#334155" : "#CBD5E1"} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: colorScheme === "dark" ? "#64748B" : "#94A3B8", fontFamily: Font.regular }}>
                        Platform fare: Rs. {estimate.fare} · The rider can accept, counter, or reject.
                      </Text>
                    </View>
                  </Animated.View>
                </View>
              )}

              {/* CTA */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (!rideType || servicesError) { showToast("Please wait for ride types to load, then select one.", "error"); return; }
                  animateToStep("confirm");
                }}
                disabled={servicesLoading}
                style={{ marginTop: "auto", marginBottom: insets.bottom + 8, borderRadius: 18, overflow: "hidden", opacity: (!rideType || servicesError) ? 0.5 : 1 }}
              >
                <LinearGradient
                  colors={["#FCD34D", "#F59E0B"]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16 }}
                >
                  <Text style={{ fontFamily: Font.bold, fontSize: 15, color: "#0A0F1E" }}>Review & Confirm</Text>
                  {estimate && rideType && <Text style={{ fontFamily: Font.bold, fontSize: 13, color: "rgba(10,15,30,0.6)" }}>Rs. {showBargain && offeredFare ? offeredFare : estimate.fare}</Text>}
                  <Ionicons name="arrow-forward" size={18} color="#0A0F1E" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 3: CONFIRM ── */}
          {step === "confirm" && (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                <TouchableOpacity onPress={() => animateToStep("vehicle")} style={{ marginRight: 10 }} hitSlop={8}>
                  <Ionicons name="chevron-back" size={20} color={colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                </TouchableOpacity>
                <Text style={{ fontFamily: Font.bold, fontSize: 18, color: colorScheme === "dark" ? "#fff" : "#0F172A", flex: 1 }}>
                  Confirm Booking
                </Text>
              </View>

              {/* Booking summary */}
              <View style={{ backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", marginBottom: 14, gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 24 }}>{selectedSvc?.icon ?? "🚗"}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Font.bold, fontSize: 15, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}>{selectedSvc?.name ?? rideType ?? "—"}</Text>
                    <Text style={{ fontFamily: Font.regular, fontSize: 12, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>
                      {estimate ? `${estimate.dist} km · ${estimate.dur}` : "Estimating..."}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: Font.bold, fontSize: 20, color: "#10B981" }}>
                      Rs. {showBargain && offeredFare ? offeredFare : (estimate?.fare ?? "—")}
                    </Text>
                    {showBargain && offeredFare && (
                      <Text style={{ fontFamily: Font.regular, fontSize: 10, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>Your offer</Text>
                    )}
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "#F1F5F9" }} />
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#10B981", marginTop: 4 }} />
                    <Text style={{ flex: 1, fontFamily: Font.medium, fontSize: 12, color: colorScheme === "dark" ? "#94A3B8" : "#64748B" }} numberOfLines={2}>{pickup}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: "#EF4444", marginTop: 4 }} />
                    <Text style={{ flex: 1, fontFamily: Font.medium, fontSize: 12, color: colorScheme === "dark" ? "#94A3B8" : "#64748B" }} numberOfLines={2}>{drop}</Text>
                  </View>
                </View>
              </View>

              {/* Parcel fields */}
              {isParcelService(rideType, selectedSvc) && (
                <View style={{ marginBottom: 14, gap: 8 }}>
                  <Text style={{ fontFamily: Font.bold, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginBottom: 4 }}>Receiver Details</Text>
                  <TextInput value={receiverName} onChangeText={setReceiverName} placeholder="Receiver full name" placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"}
                    style={{ fontFamily: Font.regular, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
                  />
                  <TextInput value={receiverPhone} onChangeText={setReceiverPhone} placeholder="Receiver phone (03XXXXXXXXX)" placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"} keyboardType="phone-pad"
                    style={{ fontFamily: Font.regular, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F8FAFC", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
                  />
                </View>
              )}

              {/* School Shift Subscribe button */}
              {rideType === "school_shift" && (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => setShowSchoolModal(true)}
                  style={{ marginBottom: 14, backgroundColor: colorScheme === "dark" ? "rgba(29,78,216,0.15)" : "#EFF6FF", borderWidth: 1, borderColor: colorScheme === "dark" ? "#1D4ED8" : "#BFDBFE", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colorScheme === "dark" ? "#1D4ED8" : "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 22 }}>🚌</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: Font.bold, color: colorScheme === "dark" ? "#93C5FD" : "#1E40AF" }}>School Shift Subscribe</Text>
                    <Text style={{ fontSize: 12, fontFamily: Font.regular, color: colorScheme === "dark" ? "#60A5FA" : "#3B82F6", marginTop: 2 }}>Monthly school transport</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colorScheme === "dark" ? "#60A5FA" : "#3B82F6"} />
                </TouchableOpacity>
              )}

              {/* Schedule */}
              {!isParcelService(rideType, selectedSvc) && (
                <View style={{ marginBottom: 14 }}>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setIsScheduled(v => !v)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: isScheduled ? "rgba(59,130,246,0.08)" : "transparent", borderWidth: 1, borderColor: isScheduled ? "#3B82F6" : colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "#E2E8F0", borderRadius: 14, padding: 12 }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="calendar-outline" size={18} color={isScheduled ? "#3B82F6" : colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                      <Text style={{ fontFamily: Font.bold, fontSize: 13, color: isScheduled ? "#3B82F6" : colorScheme === "dark" ? "#fff" : "#0F172A" }}>
                        {isScheduled ? `${scheduledDate} at ${scheduledTime}` : "Schedule for Later"}
                      </Text>
                    </View>
                    <Ionicons name={isScheduled ? "chevron-up" : "chevron-down"} size={16} color={isScheduled ? "#3B82F6" : colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                  </TouchableOpacity>
                  {isScheduled && (
                    <View style={{ backgroundColor: "rgba(59,130,246,0.06)", borderWidth: 1, borderColor: "rgba(59,130,246,0.2)", borderTopWidth: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 12, gap: 8 }}>
                      <TextInput value={scheduledDate} onChangeText={setScheduledDate} placeholder="YYYY-MM-DD" placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"}
                        style={{ backgroundColor: colorScheme === "dark" ? "#0F172A" : "#fff", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: Font.regular, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}
                      />
                      <TextInput value={scheduledTime} onChangeText={setScheduledTime} placeholder="HH:MM (24h)" placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"}
                        style={{ backgroundColor: colorScheme === "dark" ? "#0F172A" : "#fff", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: Font.regular, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Pool toggle */}
              {!isParcelService(rideType, selectedSvc) && !isScheduled && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => setIsPoolRide(v => !v)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: isPoolRide ? "rgba(16,185,129,0.08)" : "transparent", borderWidth: 1, borderColor: isPoolRide ? "#10B981" : colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "#E2E8F0", borderRadius: 14, padding: 12, marginBottom: 14 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="people-outline" size={18} color={isPoolRide ? "#10B981" : colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                    <Text style={{ fontFamily: Font.bold, fontSize: 13, color: isPoolRide ? "#10B981" : colorScheme === "dark" ? "#fff" : "#0F172A" }}>
                      {isPoolRide ? "Pool Ride ON — cheaper fare" : "Share Ride (Pool)"}
                    </Text>
                  </View>
                  <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: isPoolRide ? "#10B981" : colorScheme === "dark" ? "#334155" : "#E2E8F0", padding: 2, justifyContent: "center", alignItems: isPoolRide ? "flex-end" : "flex-start" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }} />
                  </View>
                </TouchableOpacity>
              )}

              {/* Payment */}
              <Text style={{ fontFamily: Font.bold, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginBottom: 8 }}>Payment</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
                {payMethods.map((pm) => {
                  const active = payMethod === pm.id;
                  const isCash = pm.id === "cash";
                  const isWallet = pm.id === "wallet";
                  const pmColor = isCash ? "#10B981" : isWallet ? "#3B82F6" : "#FCD34D";
                  const balanceLabel = isWallet ? ` · Rs. ${(user?.walletBalance ?? 0).toLocaleString()}` : "";
                  const insufficient = isWallet && estimate && (user?.walletBalance ?? 0) < (offeredFare ? parseFloat(offeredFare) : estimate.fare);
                  return (
                    <TouchableOpacity key={pm.id} onPress={() => setPayMethod(pm.id)} activeOpacity={0.7}
                      style={{ flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 24, borderWidth: 1.5, borderColor: active ? pmColor : colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "#E2E8F0", backgroundColor: active ? `${pmColor}10` : "transparent" }}
                    >
                      <Ionicons name={isCash ? "cash-outline" : isWallet ? "wallet-outline" : "card-outline"} size={16} color={active ? pmColor : colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
                      <Text style={{ fontFamily: active ? Font.bold : Font.semiBold, fontSize: 13, color: active ? (colorScheme === "dark" ? "#fff" : "#0F172A") : colorScheme === "dark" ? "#94A3B8" : "#64748B" }}>
                        {pm.label || pm.name || pm.id}{balanceLabel}
                      </Text>
                      {active && <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: pmColor, alignItems: "center", justifyContent: "center" }}><Ionicons name="checkmark" size={9} color="#fff" /></View>}
                      {insufficient && <Ionicons name="alert-circle" size={14} color="#EF4444" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Trust row */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(16,185,129,0.08)", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(16,185,129,0.2)", marginBottom: 16 }}>
                <Ionicons name="shield-checkmark-outline" size={14} color="#10B981" />
                <Text style={{ fontFamily: Font.regular, fontSize: 11, color: "#065F46" }}>All rides insured · Verified drivers · GPS tracked</Text>
              </View>

              {/* Book CTA */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleBook}
                disabled={booking || !estimate}
                onPressIn={() => Animated.spring(bookBtnScale, { toValue: 0.97, useNativeDriver: false, tension: 300, friction: 10 }).start()}
                onPressOut={() => Animated.spring(bookBtnScale, { toValue: 1, useNativeDriver: false, tension: 300, friction: 10 }).start()}
                style={{ opacity: booking || !estimate ? 0.6 : 1 }}
              >
                <Animated.View style={{ transform: [{ scale: bookBtnScale }], borderRadius: 18, overflow: "hidden" }}>
                  <LinearGradient
                    colors={showBargain && offeredFare ? ["#F59E0B", "#FCD34D"] : ["#FCD34D", "#F59E0B"]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 18, paddingVertical: 18 }}
                  >
                    {booking ? (
                      <ActivityIndicator color="#0A0F1E" />
                    ) : (
                      <>
                        {showBargain && offeredFare ? (
                          <Ionicons name="chatbubble-ellipses" size={20} color="#0A0F1E" />
                        ) : (
                          <Text style={{ fontSize: 20 }}>{selectedSvc?.icon ?? "🚗"}</Text>
                        )}
                        <Text style={{ fontFamily: Font.bold, fontSize: 16, color: "#0A0F1E" }}>
                          {showBargain && offeredFare
                            ? `Send Offer · Rs. ${offeredFare}`
                            : `Book Now · Rs. ${estimate?.fare ?? "—"}`}
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </Animated.View>
              </TouchableOpacity>
            </ScrollView>
          )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>

      {/* Inline Map Pin-Drop Overlay (no separate modal/screen) */}
      {inlineMapPick && (
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            zIndex: 50,
            opacity: inlineMapAnim,
            transform: [{ translateY: inlineMapAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          }}
        >
          {/* WebView map taking up most of the screen */}
          <View style={{ flex: 1, backgroundColor: "#0F172A" }}>
            <WebView
              source={{
                uri: `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/maps/picker?lat=${
                  mapPickerTarget === "pickup" ? (pickupObj?.lat ?? 33.7294) : (dropObj?.lat ?? 33.7294)
                }&lng=${
                  mapPickerTarget === "pickup" ? (pickupObj?.lng ?? 73.3872) : (dropObj?.lng ?? 73.3872)
                }&zoom=14&label=${encodeURIComponent(mapPickerTarget === "pickup" ? "Pickup" : "Drop")}`
              }}
              style={{ flex: 1 }}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data?.lat && data?.lng) {
                    setInlineMapResult({ lat: data.lat, lng: data.lng, address: data.address ?? `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}` });
                  }
                } catch {}
              }}
            />

            {/* Bottom toolbar — stays inside the map area */}
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: colorScheme === "dark" ? "#0F172A" : "#fff",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 20,
                paddingBottom: Math.max(insets.bottom + 12, 24),
                gap: 12,
                ...Platform.select({
                  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 16 },
                  android: { elevation: 16 },
                  web: { boxShadow: "0 -4px 24px rgba(0,0,0,0.2)" },
                }),
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mapPickerTarget === "pickup" ? "#10B981" : "#EF4444" }} />
                <Text style={{ fontFamily: Font.bold, fontSize: 15, color: colorScheme === "dark" ? "#fff" : "#0F172A", flex: 1 }}>
                  {inlineMapResult ? `📍 ${inlineMapResult.address}` : `Tap the map to set ${mapPickerTarget === "pickup" ? "pickup" : "drop-off"}`}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity activeOpacity={0.7} onPress={closeInlineMapPick}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.12)" : "#E2E8F0", alignItems: "center" }}
                >
                  <Text style={{ fontFamily: Font.bold, fontSize: 14, color: colorScheme === "dark" ? "#94A3B8" : "#64748B" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} onPress={confirmInlineMapPick} disabled={!inlineMapResult}
                  style={{ flex: 2, borderRadius: 16, overflow: "hidden", opacity: inlineMapResult ? 1 : 0.4 }}
                >
                  <LinearGradient colors={["#FCD34D", "#F59E0B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={{ paddingVertical: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
                  >
                    <Ionicons name="checkmark-circle" size={18} color="#0A0F1E" />
                    <Text style={{ fontFamily: Font.bold, fontSize: 14, color: "#0A0F1E" }}>Confirm Location</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>
      )}

      {/* History modal */}
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowHistory(false)}>
        <View style={{ flex: 1, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#fff" }}>
          <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.15)" : "#E2E8F0" }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#F1F5F9" }}>
            <Text style={{ fontFamily: Font.bold, fontSize: 18, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}>Ride History</Text>
            <TouchableOpacity onPress={() => setShowHistory(false)} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colorScheme === "dark" ? "#1E293B" : "#F8FAFC", alignItems: "center", justifyContent: "center" }} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color={colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
            </TouchableOpacity>
          </View>
          {histLoading ? (
            <View style={{ padding: 20, gap: 12 }}>
              {[0,1,2,3].map((i) => <HistoryRowSkeleton key={i} dark={colorScheme === "dark"} />)}
            </View>
          ) : history.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Ionicons name="car-outline" size={36} color={colorScheme === "dark" ? "#334155" : "#CBD5E1"} />
              <Text style={{ fontFamily: Font.semiBold, fontSize: 15, color: colorScheme === "dark" ? "#64748B" : "#94A3B8" }}>No rides yet</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
              {history.map((ride, i) => (
                <View key={ride.id || i} style={{ backgroundColor: colorScheme === "dark" ? "#1E293B" : "#F8FAFC", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "#F1F5F9", flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18 }}>{services.find((s) => s.key === ride.type)?.icon ?? (ride.type === "bike" ? "🏍️" : ride.type === "car" ? "🚗" : "🛺")}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Font.medium, fontSize: 12, color: colorScheme === "dark" ? "#CBD5E1" : "#0F172A" }} numberOfLines={1}>{ride.pickupAddress} → {ride.dropAddress}</Text>
                    <Text style={{ fontFamily: Font.regular, fontSize: 11, color: colorScheme === "dark" ? "#64748B" : "#94A3B8", marginTop: 2 }}>{ride.distance} km · {new Date(ride.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</Text>
                  </View>
                  <Text style={{ fontFamily: Font.bold, fontSize: 14, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}>Rs. {ride.fare}</Text>
                </View>
              ))}
              <View style={{ height: 30 }} />
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* School Shift Modal */}
      <Modal visible={showSchoolModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSchoolModal(false)}>
        <View style={{ flex: 1, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#fff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 20, backgroundColor: colorScheme === "dark" ? "#1E293B" : "#F8FAFC", borderBottomWidth: 1, borderBottomColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }}>
            <Text style={{ fontSize: 18, fontFamily: Font.bold, flex: 1, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}>School Shift Subscribe</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowSchoolModal(false)} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colorScheme === "dark" ? "#0F172A" : "#E2E8F0", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close" size={18} color={colorScheme === "dark" ? "#94A3B8" : "#64748B"} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
            <Text style={{ fontFamily: Font.semiBold, fontSize: 14, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginBottom: 4 }}>Select a Route</Text>
            {schoolRoutes.length === 0 ? (
              <View style={{ backgroundColor: colorScheme === "dark" ? "#1E293B" : "#F8FAFC", borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0" }}>
                <Text style={{ fontSize: 24, marginBottom: 10 }}>🚌</Text>
                <Text style={{ fontFamily: Font.semiBold, color: colorScheme === "dark" ? "#94A3B8" : "#64748B" }}>No routes available</Text>
                <Text style={{ fontSize: 12, color: colorScheme === "dark" ? "#64748B" : "#94A3B8", marginTop: 4, textAlign: "center" }}>Contact admin to add school shift routes</Text>
              </View>
            ) : (
              schoolRoutes.map((r: any) => (
                <TouchableOpacity activeOpacity={0.7} key={r.id} onPress={() => setSelectedRoute(r)}
                  style={{ borderWidth: 1.5, borderColor: selectedRoute?.id === r.id ? "#3B82F6" : colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 16, padding: 16, backgroundColor: selectedRoute?.id === r.id ? (colorScheme === "dark" ? "rgba(59,130,246,0.08)" : "#EFF6FF") : "transparent" }}
                >
                  <Text style={{ fontFamily: Font.bold, fontSize: 14, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}>{r.routeName}</Text>
                  {r.schoolName && <Text style={{ fontFamily: Font.regular, fontSize: 12, color: colorScheme === "dark" ? "#94A3B8" : "#64748B", marginTop: 2 }}>{r.schoolName}</Text>}
                </TouchableOpacity>
              ))
            )}

            <Text style={{ fontFamily: Font.semiBold, fontSize: 14, color: colorScheme === "dark" ? "#fff" : "#0F172A", marginTop: 6 }}>Student Details</Text>
            <TextInput value={schoolStudent} onChangeText={setSchoolStudent} placeholder="Student full name" placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"}
              style={{ fontFamily: Font.regular, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", backgroundColor: colorScheme === "dark" ? "#1E293B" : "#F8FAFC", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
            />
            <TextInput value={schoolClass} onChangeText={setSchoolClass} placeholder="Class (e.g. Grade 5)" placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"}
              style={{ fontFamily: Font.regular, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", backgroundColor: colorScheme === "dark" ? "#1E293B" : "#F8FAFC", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
            />
            <TextInput value={schoolStartDate} onChangeText={setSchoolStartDate} placeholder="Start date (YYYY-MM-DD)" placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"}
              style={{ fontFamily: Font.regular, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", backgroundColor: colorScheme === "dark" ? "#1E293B" : "#F8FAFC", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
            />
            <TextInput value={schoolNotes} onChangeText={setSchoolNotes} placeholder="Notes (optional)" placeholderTextColor={colorScheme === "dark" ? "#64748B" : "#94A3B8"} multiline
              style={{ fontFamily: Font.regular, fontSize: 13, color: colorScheme === "dark" ? "#fff" : "#0F172A", backgroundColor: colorScheme === "dark" ? "#1E293B" : "#F8FAFC", borderWidth: 1, borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 70 }}
            />

            <Text style={{ fontFamily: Font.semiBold, fontSize: 14, color: colorScheme === "dark" ? "#fff" : "#0F172A" }}>Shift</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["morning", "afternoon", "both"] as const).map((s) => (
                <TouchableOpacity key={s} activeOpacity={0.7} onPress={() => setSchoolShift(s)}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: schoolShift === s ? "#3B82F6" : colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "#E2E8F0", backgroundColor: schoolShift === s ? (colorScheme === "dark" ? "rgba(59,130,246,0.12)" : "#EFF6FF") : "transparent", alignItems: "center" }}
                >
                  <Text style={{ fontFamily: schoolShift === s ? Font.bold : Font.medium, fontSize: 12, color: schoolShift === s ? "#3B82F6" : colorScheme === "dark" ? "#94A3B8" : "#64748B", textTransform: "capitalize" }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity activeOpacity={0.7} onPress={() => setSchoolRecurring(v => !v)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: schoolRecurring ? "rgba(59,130,246,0.08)" : "transparent", borderWidth: 1, borderColor: schoolRecurring ? "#3B82F6" : colorScheme === "dark" ? "rgba(255,255,255,0.1)" : "#E2E8F0", borderRadius: 14, padding: 12 }}
            >
              <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: schoolRecurring ? "#3B82F6" : colorScheme === "dark" ? "#334155" : "#E2E8F0", padding: 2, justifyContent: "center", alignItems: schoolRecurring ? "flex-end" : "flex-start" }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }} />
              </View>
              <Text style={{ fontFamily: Font.medium, fontSize: 13, color: schoolRecurring ? "#3B82F6" : colorScheme === "dark" ? "#94A3B8" : "#64748B" }}>Recurring monthly</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.85} onPress={handleSchoolSubscribe} disabled={subscribing}
              style={{ borderRadius: 16, overflow: "hidden", marginTop: 6, opacity: subscribing ? 0.7 : 1 }}
            >
              <LinearGradient colors={["#3B82F6", "#1D4ED8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
              >
                {subscribing ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={{ fontSize: 18 }}>🚌</Text>
                    <Text style={{ fontFamily: Font.bold, fontSize: 16, color: "#fff" }}>Subscribe Now</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <View style={{ height: 30 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  suggBox: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
    zIndex: 100,
  },
  suggRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggTxt: {
    fontFamily: Font.medium,
    fontSize: 13,
  },
  suggSub: {
    fontFamily: Font.regular,
    fontSize: 11,
    marginTop: 1,
  },
});

