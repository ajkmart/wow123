import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRecentItems, clearRecentItems } from "@/utils/recentlyViewed";
import { API_BASE } from "@/utils/api";
import { Ionicons } from "@expo/vector-icons";
import { router, type RelativePathString } from "expo-router";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  useWindowDimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import Colors, { spacing, radii, shadows, typography, getFontFamily } from "@/constants/colors";
import { T as Typ, Font } from "@/constants/typography";
import { SmartRefresh } from "@/components/ui/SmartRefresh";
import { useCollapsibleHeader } from "@/hooks/useCollapsibleHeader";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";
import { usePlatformConfig } from "@/context/PlatformConfigContext";
import { usePerformance } from "@/context/PerformanceContext";
import { tDual } from "@workspace/i18n";
import { getAllServices } from "@/constants/serviceRegistry";
import {
  SkeletonBlock,
  EmptyState,
} from "@/components/user-shared";
import { WishlistHeart } from "@/components/WishlistHeart";

const LazyServiceSection = React.lazy(() => import("@/components/home/ServiceGrid").then(m => ({ default: m.ServiceSection })));
const LazyServiceStatsStrip = React.lazy(() => import("@/components/home/StatsBar").then(m => ({ default: m.ServiceStatsStrip })));
const LazyGuestSignInStrip = React.lazy(() => import("@/components/home/QuickActions").then(m => ({ default: m.GuestSignInStrip })));
const LazyBannerCarousel = React.lazy(() => import("@/components/home/BannerCarousel").then(m => ({ default: m.DynamicBannerCarousel })));
const LazyActiveTracker = React.lazy(() => import("@/components/home/ActiveTracker").then(m => ({ default: m.ActiveTrackerStrip })));
const LazyFlashDeals = React.lazy(() => import("@/components/home/FlashDeals").then(m => ({ default: m.FlashDealsSection })));
const LazyTrending = React.lazy(() => import("@/components/home/TrendingSection").then(m => ({ default: m.TrendingSection })));

const C = Colors.light;
const W = Dimensions.get("window").width;
const H_PAD = spacing.lg;

interface RecentItem {
  id: string;
  name: string;
  image: string | null;
  price: number;
}

function RecentlyViewedSection() {
  const [items, setItems] = React.useState<RecentItem[]>([]);

  React.useEffect(() => {
    getRecentItems()
      .then(loaded => setItems(loaded as RecentItem[]))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: 16 }}>
      <View style={rv.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={rv.title}>Recently Viewed</Text>
        </View>
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => {
            clearRecentItems().catch(() => {});
            setItems([]);
          }}
          style={rv.clearBtn}
          accessibilityRole="button"
          accessibilityLabel="Clear recently viewed"
        >
          <Ionicons name="close-circle-outline" size={14} color={C.textMuted} />
          <Text style={rv.clearTxt}>Clear</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        horizontal
        data={items}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: H_PAD, gap: 10 }}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.id } })}
            style={rv.card}
            accessibilityRole="button"
            accessibilityLabel={item.name}
          >
            {item.image ? (
              <Image source={{ uri: item.image }} style={rv.img} resizeMode="cover" />
            ) : (
              <View style={[rv.img, { backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center" }]}>
                <Ionicons name="cube-outline" size={22} color={C.textMuted} />
              </View>
            )}
            <View style={rv.info}>
              <Text style={rv.name} numberOfLines={2}>{item.name}</Text>
              <Text style={rv.price}>Rs. {Number(item.price).toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const rv = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: H_PAD, marginBottom: 10 },
  title: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearTxt: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },
  card: { width: 110, backgroundColor: C.surface, borderRadius: 12, overflow: "hidden", ...shadows.sm },
  img: { width: 110, height: 90 },
  info: { padding: 8, gap: 3 },
  name: { fontFamily: Font.medium, fontSize: 11, color: C.text, lineHeight: 15 },
  price: { fontFamily: Font.bold, fontSize: 12, color: C.primary },
});

const OFFER_STRIP_CONFIGS = [
  { type: "all",         label: "All Offers",    emoji: "\uD83C\uDFF7\uFE0F", colors: ["#7C3AED","#4F46E5"] as [string,string] },
  { type: "flashDeals",  label: "Flash Deals",   emoji: "\u26A1", colors: ["#DC2626","#B91C1C"] as [string,string] },
  { type: "freeDelivery",label: "Free Delivery", emoji: "\uD83D\uDE9A", colors: ["#0891B2","#0E7490"] as [string,string] },
  { type: "cashback",    label: "Cashback",      emoji: "\uD83D\uDCB0", colors: ["#D97706","#B45309"] as [string,string] },
  { type: "newUserSpecials", label: "New User",  emoji: "\u2B50", colors: ["#DB2777","#BE185D"] as [string,string] },
];

function OffersStrip() {
  const { data, isLoading } = useQuery<{ offers?: unknown[] } | null>({
    queryKey: ["public-offers-home"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/promotions/public`);
      if (!r.ok) return null;
      return r.json().then((j: { data?: unknown }) => j?.data ?? j) as Promise<{ offers?: unknown[] } | null>;
    },
    staleTime: 120000,
  });

  const count: number = data?.offers?.length ?? 0;
  if (!isLoading && count === 0) return null;

  return (
    <View style={os.wrap}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push("/offers")}
        style={os.header}
        accessibilityRole="button"
        accessibilityLabel="View all offers"
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={os.title}>{"\uD83C\uDFAF"} Offers & Deals</Text>
          {count > 0 && <View style={os.countBubble}><Text style={os.countTxt}>{count}</Text></View>}
        </View>
        <View style={os.viewAllBtn}>
          <Text style={os.viewAllTxt}>View All</Text>
          <Ionicons name="arrow-forward" size={12} color={C.primary} />
        </View>
      </TouchableOpacity>
      {isLoading ? (
        <View style={os.row}>
          {[0,1,2].map(i => <View key={i} style={os.skeletonCard} />)}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={os.row}>
          {OFFER_STRIP_CONFIGS.map(cfg => (
            <TouchableOpacity
              key={cfg.type}
              activeOpacity={0.8}
              onPress={() => router.push("/offers")}
              accessibilityRole="button"
              accessibilityLabel={cfg.label}
            >
              <LinearGradient colors={cfg.colors} style={os.card} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={os.cardEmoji}>{cfg.emoji}</Text>
                <Text style={os.cardLabel}>{cfg.label}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const os = StyleSheet.create({
  wrap: { marginTop: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: H_PAD, marginBottom: 10 },
  title: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  countBubble: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  countTxt: { fontFamily: Font.bold, fontSize: 10, color: "#fff" },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewAllTxt: { fontFamily: Font.semiBold, fontSize: 12, color: C.primary },
  row: { paddingHorizontal: H_PAD, gap: 10 },
  card: { width: 100, height: 72, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 4, ...shadows.sm },
  cardEmoji: { fontSize: 22 },
  cardLabel: { fontFamily: Font.semiBold, fontSize: 10, color: "#fff", textAlign: "center" },
  skeletonCard: { width: 100, height: 72, borderRadius: 14, backgroundColor: C.surfaceSecondary },
});

const WMO_ICONS: Record<number, { icon: string; label: string }> = {
  0: { icon: "sunny-outline", label: "Clear" },
  1: { icon: "partly-sunny-outline", label: "Mostly Clear" },
  2: { icon: "partly-sunny-outline", label: "Partly Cloudy" },
  3: { icon: "cloudy-outline", label: "Overcast" },
  45: { icon: "cloud-outline", label: "Foggy" },
  48: { icon: "cloud-outline", label: "Icy Fog" },
  51: { icon: "rainy-outline", label: "Light Drizzle" },
  53: { icon: "rainy-outline", label: "Drizzle" },
  55: { icon: "rainy-outline", label: "Heavy Drizzle" },
  61: { icon: "rainy-outline", label: "Light Rain" },
  63: { icon: "rainy-outline", label: "Rain" },
  65: { icon: "rainy-outline", label: "Heavy Rain" },
  71: { icon: "snow-outline", label: "Light Snow" },
  73: { icon: "snow-outline", label: "Snow" },
  75: { icon: "snow-outline", label: "Heavy Snow" },
  80: { icon: "rainy-outline", label: "Showers" },
  81: { icon: "rainy-outline", label: "Moderate Showers" },
  82: { icon: "thunderstorm-outline", label: "Heavy Showers" },
  95: { icon: "thunderstorm-outline", label: "Thunderstorm" },
  96: { icon: "thunderstorm-outline", label: "Thunderstorm + Hail" },
  99: { icon: "thunderstorm-outline", label: "Severe Thunderstorm" },
};

const WEATHER_CACHE_TTL = 30 * 60_000;
const SAVED_CITY_KEY = "weather_manual_city";

function WeatherWidget({ userLat, userLng, cityLabel }: { userLat?: number; userLng?: number; cityLabel?: string }) {
  const [weather, setWeather] = useState<{ temp: number; code: number; windSpeed: number; humidity: number; feelsLike?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationLabel, setLocationLabel] = useState(cityLabel || "");
  const [isGps, setIsGps] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let lat: number | undefined;
        let lng: number | undefined;
        let locName = cityLabel || "";
        let gps = false;

        try {
          const { status } = await (await import("expo-location")).requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await (await import("expo-location")).getCurrentPositionAsync({ accuracy: 3 });
            lat = Math.round(loc.coords.latitude * 10) / 10;
            lng = Math.round(loc.coords.longitude * 10) / 10;
            gps = true;
            try {
              const rev = await (await import("expo-location")).reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
              if (rev.length > 0) {
                locName = [rev[0].city || rev[0].subregion, rev[0].region].filter(Boolean).join(", ") || locName;
              }
            } catch {}
          }
        } catch {}

        if (lat == null || lng == null) {
          const saved = await AsyncStorage.getItem(SAVED_CITY_KEY).catch(() => null);
          if (saved) {
            try {
              const p = JSON.parse(saved);
              lat = p.lat; lng = p.lng; locName = p.name || locName;
            } catch {}
          }
        }

        if (lat == null || lng == null) {
          if (userLat != null && userLng != null && Number.isFinite(userLat) && Number.isFinite(userLng)) {
            lat = Math.round(userLat * 10) / 10;
            lng = Math.round(userLng * 10) / 10;
          } else {
            if (!cancelled) setLoading(false);
            return;
          }
        }

        if (!cancelled) { setLocationLabel(locName); setIsGps(gps); }

        const cacheKey = `weather_cache_${lat}_${lng}`;
        const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed._ts < WEATHER_CACHE_TTL) {
              if (!cancelled) { setWeather(parsed); setLoading(false); }
              return;
            }
          } catch {}
        }

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature&timezone=auto`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("weather fetch failed");
        const data = await resp.json();
        const cur = data?.current;
        if (!cur) throw new Error("no current weather data");
        const w = {
          temp: Math.round(cur.temperature_2m),
          code: cur.weather_code ?? 0,
          windSpeed: Math.round(cur.wind_speed_10m ?? 0),
          humidity: Math.round(cur.relative_humidity_2m ?? 0),
          feelsLike: Math.round(cur.apparent_temperature ?? cur.temperature_2m),
          _ts: Date.now(),
        };
        AsyncStorage.setItem(cacheKey, JSON.stringify(w)).catch(() => {});
        if (!cancelled) { setWeather(w); setLoading(false); }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userLat, userLng, cityLabel]);

  if (!loading && !weather) return null;

  const wmo = weather ? (WMO_ICONS[weather.code] ?? WMO_ICONS[0]) : WMO_ICONS[0];

  if (loading) {
    return (
      <View style={wS.wrap}>
        <View style={wS.skRow}>
          <SkeletonBlock w={36} h={36} r={18} />
          <View style={{ gap: 4, flex: 1 }}>
            <SkeletonBlock w={80} h={12} r={4} />
            <SkeletonBlock w={50} h={10} r={4} />
          </View>
          <SkeletonBlock w={40} h={24} r={6} />
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => router.push("/weather")}
      activeOpacity={0.7}
      style={wS.wrap}
    >
      <View style={wS.row}>
        <View style={wS.iconWrap}>
          <Ionicons name={wmo.icon as keyof typeof Ionicons.glyphMap} size={22} color={C.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={wS.label}>{wmo.label}{locationLabel ? ` · ${locationLabel}` : ""}</Text>
          <View style={wS.detailRow}>
            <Text style={wS.detail}>{"\uD83D\uDCA7"} {weather!.humidity}%</Text>
            <Text style={wS.detail}>{"\uD83D\uDCA8"} {weather!.windSpeed} km/h</Text>
            {weather!.feelsLike != null && <Text style={wS.detail}>{"\uD83C\uDF21"} Feels {weather!.feelsLike}°</Text>}
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text style={wS.temp}>{weather!.temp}°C</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            {isGps && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#4ade80" }} />}
            <Text style={{ fontFamily: Font.regular, fontSize: 9, color: C.textMuted }}>Tap for forecast</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const wS = StyleSheet.create({
  wrap: {
    marginHorizontal: H_PAD, marginTop: 10,
    backgroundColor: C.surface, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    ...shadows.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  skRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
  },
  label: { fontFamily: Font.semiBold, fontSize: 13, color: C.text },
  detailRow: { flexDirection: "row", gap: 8 },
  detail: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted },
  temp: { fontFamily: Font.bold, fontSize: 22, color: C.primary },
});

function HomeSkeleton() {
  return (
    <View style={{ paddingHorizontal: H_PAD, gap: spacing.sm, marginTop: spacing.sm }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 0 }}>
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={{ alignItems: "center", gap: 6, width: (W - H_PAD * 2) / 5, paddingVertical: 8 }}>
            <SkeletonBlock w={48} h={48} r={16} />
            <SkeletonBlock w={40} h={10} r={4} />
          </View>
        ))}
      </View>
      <SkeletonBlock w="100%" h={52} r={14} />
      <SkeletonBlock w="100%" h={120} r={16} />
      <SkeletonBlock w="100%" h={100} r={16} />
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { itemCount } = useCart();
  const queryClient = useQueryClient();
  const topPad = Math.max(insets.top, 12);
  const TAB_H = Platform.OS === "web" ? 72 : 49;
  const hdOp = useRef(new Animated.Value(0)).current;
  const perf = usePerformance();
  const { searchOpacity, searchTranslateY, searchMaxHeight, scrollHandler, scrollEventThrottle } = useCollapsibleHeader({ expandedHeight: 120, collapsedHeight: 56, scrollThreshold: 80, searchBarHeight: 44 });
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const { config: platformConfig, loading: configLoading, refresh: refreshConfig } = usePlatformConfig();

  const isGuest = !user?.id;

  const handleHomeRefresh = useCallback(async () => {
    try { await refreshConfig(); } catch (err) { if (__DEV__) console.warn("[Home] Config refresh failed:", err instanceof Error ? err.message : String(err)); }
    queryClient.invalidateQueries({ queryKey: ["dynamic-banners"] });
    queryClient.invalidateQueries({ queryKey: ["flash-deals"] });
    queryClient.invalidateQueries({ queryKey: ["trending-products"] });
    if (!isGuest) {
      queryClient.invalidateQueries({ queryKey: ["home-active-orders"] });
      queryClient.invalidateQueries({ queryKey: ["home-active-rides"] });
    }
    setLastRefreshed(new Date());
  }, [refreshConfig, queryClient, isGuest]);

  const features = platformConfig.features;
  const contentBanner = platformConfig.content.banner;
  const announcement = platformConfig.content.announcement;
  const [announceDismissed, setAnnounceDismissed] = useState(false);

  const announceKey = React.useMemo(() => {
    if (!announcement) return "";
    const hash = Array.from(announcement).reduce((h, c) => (((h * 31) | 0) + c.charCodeAt(0)) >>> 0, 0).toString(36);
    return `announce_dismissed_${hash}`;
  }, [announcement]);

  useEffect(() => {
    if (!announcement) { setAnnounceDismissed(false); return; }
    AsyncStorage.getItem(announceKey).then(val => { setAnnounceDismissed(val === "1"); }).catch(() => { setAnnounceDismissed(false); });
  }, [announcement, announceKey]);

  const { language } = useLanguage();
  const T = (key: Parameters<typeof tDual>[0]) => tDual(key, language);

  useEffect(() => {
    if (perf.enableAnimations) {
      Animated.timing(hdOp, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== "web" }).start();
    } else {
      hdOp.setValue(1);
    }
  }, []);

  const allServices = getAllServices(features, platformConfig.branding, platformConfig.serviceContent);
  const noServicesActive = allServices.length === 0;

  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  const cityList = platformConfig.cities.length > 0 ? platformConfig.cities : [
    "Muzaffarabad", "Mirpur", "Rawalakot", "Bagh", "Kotli",
    "Bhimber", "Poonch", "Neelum Valley", "Haveli", "Hattian Bala",
  ];

  const filteredAreas = locationInput.trim()
    ? cityList.filter(a => a.toLowerCase().includes(locationInput.toLowerCase()))
    : cityList;

  const handleLocationPress = () => {
    setLocationPickerVisible(true);
  };

  const handleSelectArea = (area: string) => {
    setSelectedLocation(area);
    setLocationPickerVisible(false);
    setLocationInput("");
  };

  return (
    <View style={s.root}>
      {!!announcement && !announceDismissed && (
        <View style={[s.announceBar, { paddingTop: topPad }]} accessibilityRole="alert">
          <View style={s.announceIcon}>
            <Ionicons name="megaphone" size={11} color="#fff" />
          </View>
          <Text style={s.announceTxt} numberOfLines={1}>{announcement}</Text>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => {
              setAnnounceDismissed(true);
              if (announceKey) AsyncStorage.setItem(announceKey, "1").catch(() => {});
            }}
            style={s.announceClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss announcement"
          >
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
      )}

      <Animated.View style={{ opacity: hdOp }}>
        {perf.useGradients ? (
          <LinearGradient
            colors={["#0047B3", "#0066FF", "#2E80FF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[s.header, { paddingTop: (announcement && !announceDismissed) ? 8 : topPad + 8 }]}
          >
            <HeaderContent
              topPad={topPad}
              announcement={announcement}
              announceDismissed={announceDismissed}
              selectedLocation={selectedLocation}
              platformConfig={platformConfig}
              itemCount={itemCount}
              handleLocationPress={handleLocationPress}
              searchOpacity={searchOpacity}
              searchTranslateY={searchTranslateY}
              searchMaxHeight={searchMaxHeight}
              T={T}
            />
          </LinearGradient>
        ) : (
          <View
            style={[s.header, { paddingTop: (announcement && !announceDismissed) ? 8 : topPad + 8, backgroundColor: "#0047B3" }]}
          >
            <HeaderContent
              topPad={topPad}
              announcement={announcement}
              announceDismissed={announceDismissed}
              selectedLocation={selectedLocation}
              platformConfig={platformConfig}
              itemCount={itemCount}
              handleLocationPress={handleLocationPress}
              searchOpacity={searchOpacity}
              searchTranslateY={searchTranslateY}
              searchMaxHeight={searchMaxHeight}
              T={T}
            />
          </View>
        )}
      </Animated.View>

      <SmartRefresh
        onRefresh={handleHomeRefresh}
        lastUpdated={lastRefreshed}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        onScroll={scrollHandler}
        scrollEventThrottle={scrollEventThrottle}
      >
        {contentBanner ? (
          <View style={s.promoBanner}>
            <Ionicons name="gift-outline" size={14} color={C.primary} />
            <Text style={s.promoBannerTxt} numberOfLines={1}>{contentBanner}</Text>
          </View>
        ) : null}

        {configLoading ? (
          <HomeSkeleton />
        ) : noServicesActive ? (
          <EmptyState
            icon="storefront-outline"
            title="No Services Available"
            subtitle={"No services are currently available.\nPlease check back later!"}
            actionLabel="Refresh"
            onAction={refreshConfig}
          />
        ) : (
          <>
            <ErrorBoundary>
              <Suspense fallback={<SkeletonBlock w="100%" h={120} r={16} style={{ marginHorizontal: H_PAD }} />}>
                <LazyServiceSection
                  services={allServices}
                  isGuest={isGuest}
                />
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary>
              <Suspense fallback={<SkeletonBlock w="100%" h={56} r={12} style={{ marginHorizontal: H_PAD }} />}>
                <LazyServiceStatsStrip rideCfg={platformConfig.rides} features={features} />
              </Suspense>
            </ErrorBoundary>

            {features.weather !== false && (
              <ErrorBoundary>
                <WeatherWidget
                  userLat={user?.latitude ? parseFloat(user.latitude) : undefined}
                  userLng={user?.longitude ? parseFloat(user.longitude) : undefined}
                  cityLabel={user?.city || user?.area || undefined}
                />
              </ErrorBoundary>
            )}

            {isGuest && (
              <ErrorBoundary>
                <Suspense fallback={null}>
                  <LazyGuestSignInStrip />
                </Suspense>
              </ErrorBoundary>
            )}

            {!isGuest && !!user?.id && (
              <ErrorBoundary>
                <Suspense fallback={null}>
                  <LazyActiveTracker userId={user.id} />
                </Suspense>
              </ErrorBoundary>
            )}

            {platformConfig.content.showBanner && (
              <ErrorBoundary>
                <Suspense fallback={<SkeletonBlock w="100%" h={140} r={16} style={{ marginHorizontal: H_PAD }} />}>
                  <LazyBannerCarousel />
                </Suspense>
              </ErrorBoundary>
            )}

            <ErrorBoundary>
              <Suspense fallback={<SkeletonBlock w="100%" h={120} r={12} style={{ marginHorizontal: H_PAD }} />}>
                <LazyFlashDeals T={T} limit={platformConfig.pagination?.flashDealsLimit ?? 10} />
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary>
              <OffersStrip />
            </ErrorBoundary>

            <ErrorBoundary>
              <RecentlyViewedSection />
            </ErrorBoundary>

            <ErrorBoundary>
              <Suspense fallback={<SkeletonBlock w="100%" h={120} r={12} style={{ marginHorizontal: H_PAD }} />}>
                <LazyTrending limit={platformConfig.pagination?.trendingLimit ?? 8} />
              </Suspense>
            </ErrorBoundary>

            <View style={{ height: 12 }} />
          </>
        )}

        <View style={{ height: TAB_H + insets.bottom + 20 }} />
      </SmartRefresh>

      {!!user?.id && itemCount > 0 && (
        <TouchableOpacity activeOpacity={0.7}
          onPress={() => router.push("/cart")}
          style={[s.cartFab, { bottom: TAB_H + insets.bottom + 16 }]}
          accessibilityRole="button"
          accessibilityLabel={`Cart — ${itemCount} item${itemCount > 1 ? "s" : ""}`}
        >
          <LinearGradient colors={["#0047B3", "#0066FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.cartFabGrad}>
            <Ionicons name="bag" size={18} color="#fff" />
            <Text style={s.cartFabTxt}>Cart</Text>
            <View style={s.cartFabBadge}>
              <Text style={s.cartFabBadgeTxt}>{itemCount > 9 ? "9+" : itemCount}</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      <Modal
        visible={locationPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setLocationPickerVisible(false); setLocationInput(""); }}
      >
        <TouchableOpacity
          style={lp.overlay}
          activeOpacity={1}
          onPress={() => { setLocationPickerVisible(false); setLocationInput(""); }}
        />
        <View style={lp.sheet}>
          <View style={lp.handle} />
          <View style={lp.header}>
            <Text style={lp.title}>Select Your Area</Text>
            <TouchableOpacity
              onPress={() => { setLocationPickerVisible(false); setLocationInput(""); }}
              style={lp.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close location picker"
            >
              <Ionicons name="close" size={20} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={lp.searchRow}>
            <Ionicons name="search" size={16} color={C.textMuted} />
            <TextInput
              style={lp.searchInput}
              placeholder="Search area..."
              placeholderTextColor={C.textMuted}
              value={locationInput}
              onChangeText={setLocationInput}
              autoCapitalize="words"
              returnKeyType="search"
            />
            {locationInput.length > 0 && (
              <TouchableOpacity onPress={() => setLocationInput("")} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView style={lp.list} keyboardShouldPersistTaps="handled">
            {filteredAreas.map(area => (
              <TouchableOpacity
                key={area}
                style={[lp.areaRow, selectedLocation === area && lp.areaRowSelected]}
                onPress={() => handleSelectArea(area)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={area}
              >
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={selectedLocation === area ? C.primary : C.textMuted}
                />
                <Text style={[lp.areaTxt, selectedLocation === area && lp.areaTxtSelected]}>{area}</Text>
                {selectedLocation === area && <Ionicons name="checkmark" size={18} color={C.primary} />}
              </TouchableOpacity>
            ))}
            {filteredAreas.length === 0 && (
              <View style={lp.emptyRow}>
                <Text style={lp.emptyTxt}>No areas found for "{locationInput}"</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

interface HeaderContentProps {
  selectedLocation: string | null;
  platformConfig: { platform: { businessAddress?: string } };
  itemCount: number;
  handleLocationPress: () => void;
  searchOpacity: Animated.Value | Animated.AnimatedInterpolation<number | string>;
  searchTranslateY: Animated.Value | Animated.AnimatedInterpolation<number | string>;
  searchMaxHeight: Animated.Value | Animated.AnimatedInterpolation<number | string>;
  T: (key: Parameters<typeof tDual>[0]) => string;
  topPad?: number;
  announcement?: string;
  announceDismissed?: boolean;
}

function HeaderContent({ selectedLocation, platformConfig, itemCount, handleLocationPress, searchOpacity, searchTranslateY, searchMaxHeight, T }: HeaderContentProps) {
  return (
    <>
      <View style={s.hdrRow}>
        <TouchableOpacity activeOpacity={0.7} style={s.locBtn} onPress={handleLocationPress} accessibilityRole="button" accessibilityLabel="Location selector">
          <Ionicons name="location" size={14} color="#fff" />
          <Text style={s.locTxt} numberOfLines={1}>{selectedLocation || platformConfig.platform.businessAddress || "AJK, Pakistan"}</Text>
          <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={() => router.push("/cart")}
            style={s.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={`Cart${itemCount > 0 ? `, ${itemCount} items` : ""}`}
          >
            <Ionicons name="cart-outline" size={20} color="#fff" />
            {itemCount > 0 && (
              <View style={s.cartBadge}>
                <Text style={s.cartBadgeTxt}>{itemCount > 99 ? "99+" : itemCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View style={{ opacity: searchOpacity, maxHeight: searchMaxHeight, transform: [{ translateY: searchTranslateY }], overflow: "hidden" }}>
        <View style={s.searchBar}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push("/search")}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
            accessibilityRole="search"
            accessibilityLabel={T("search")}
          >
            <Ionicons name="search" size={16} color={C.textMuted} />
            <Text style={s.searchText}>{T("search")}</Text>
          </TouchableOpacity>
          <View style={s.searchDivider} />
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push("/scan")}
            accessibilityRole="button"
            accessibilityLabel="Scan barcode"
            hitSlop={8}
          >
            <Ionicons name="camera-outline" size={16} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },

  header: { paddingHorizontal: H_PAD, paddingBottom: 8 },
  hdrRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  locBtn: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, marginRight: 12 },
  locTxt: { fontFamily: Font.semiBold, fontSize: 13, color: "#fff", flex: 1 },

  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  cartBadge: {
    position: "absolute", top: -4, right: -4,
    backgroundColor: "#FF3B30", borderRadius: 8,
    minWidth: 16, height: 16,
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3, borderWidth: 1.5, borderColor: "#0066FF",
  },
  cartBadgeTxt: { fontFamily: Font.bold, fontSize: 9, color: "#fff" },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchText: { flex: 1, fontFamily: Font.regular, fontSize: 13, color: C.textMuted },
  searchDivider: { width: 1, height: 18, backgroundColor: C.borderLight },

  cartFab: { position: "absolute", right: H_PAD, borderRadius: 99, overflow: "hidden", ...shadows.xl },
  cartFabGrad: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 99 },
  cartFabTxt: { fontFamily: Font.bold, fontSize: 13, color: "#fff" },
  cartFabBadge: { backgroundColor: "#FF3B30", borderRadius: 11, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: C.primary },
  cartFabBadgeTxt: { fontFamily: Font.bold, fontSize: 10, color: "#fff" },

  announceBar: {
    backgroundColor: C.primary, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingBottom: 6, gap: 8, zIndex: 10,
  },
  announceIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  announceTxt: { flex: 1, fontFamily: Font.medium, fontSize: 12, color: "#fff" },
  announceClose: { padding: 4 },

  promoBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: H_PAD, marginTop: 10, marginBottom: 2,
    backgroundColor: C.primarySoft, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: C.blueLightBorder,
  },
  promoBannerTxt: { flex: 1, fontFamily: Font.medium, fontSize: 12, color: C.primary },

  scroll: { paddingBottom: 0 },
});

const lp = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: "70%",
    ...shadows.xl,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: C.borderLight,
    alignSelf: "center", marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.borderLight,
  },
  title: { fontFamily: Font.semiBold, fontSize: 16, color: C.text },
  closeBtn: { padding: 4 },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginVertical: 10,
    backgroundColor: C.surfaceSecondary,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: C.borderLight,
  },
  searchInput: {
    flex: 1, fontFamily: Font.regular, fontSize: 14, color: C.text,
    paddingVertical: 0,
  },
  list: { flex: 1 },
  areaRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderLight,
  },
  areaRowSelected: { backgroundColor: C.primarySoft },
  areaTxt: { flex: 1, fontFamily: Font.regular, fontSize: 15, color: C.text },
  areaTxtSelected: { fontFamily: Font.semiBold, color: C.primary },
  emptyRow: { padding: 24, alignItems: "center" },
  emptyTxt: { fontFamily: Font.regular, fontSize: 14, color: C.textMuted },
});
