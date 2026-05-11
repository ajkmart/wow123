import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";

import Colors, { spacing, radii, shadows, getFontFamily } from "@/constants/colors";
import { Font } from "@/constants/typography";

const C = Colors.light;
const W = Dimensions.get("window").width;

const WMO_ICONS: Record<number, { icon: string; label: string; gradient: [string, string] }> = {
  0: { icon: "sunny", label: "Clear Sky", gradient: ["#4facfe", "#00f2fe"] },
  1: { icon: "partly-sunny", label: "Mostly Clear", gradient: ["#a1c4fd", "#c2e9fb"] },
  2: { icon: "partly-sunny", label: "Partly Cloudy", gradient: ["#89ABE3", "#B6CEE8"] },
  3: { icon: "cloudy", label: "Overcast", gradient: ["#8e9eab", "#eef2f3"] },
  45: { icon: "cloud", label: "Foggy", gradient: ["#bdc3c7", "#2c3e50"] },
  48: { icon: "cloud", label: "Icy Fog", gradient: ["#E0EAFC", "#CFDEF3"] },
  51: { icon: "rainy", label: "Light Drizzle", gradient: ["#667db6", "#0082c8"] },
  53: { icon: "rainy", label: "Drizzle", gradient: ["#5f72bd", "#9b23ea"] },
  55: { icon: "rainy", label: "Heavy Drizzle", gradient: ["#373B44", "#4286f4"] },
  61: { icon: "rainy", label: "Light Rain", gradient: ["#74b9ff", "#0984e3"] },
  63: { icon: "rainy", label: "Rain", gradient: ["#6190E8", "#A7BFE8"] },
  65: { icon: "rainy", label: "Heavy Rain", gradient: ["#414345", "#232526"] },
  71: { icon: "snow", label: "Light Snow", gradient: ["#E0EAFC", "#CFDEF3"] },
  73: { icon: "snow", label: "Snow", gradient: ["#c9d6ff", "#e2e2e2"] },
  75: { icon: "snow", label: "Heavy Snow", gradient: ["#8e9eab", "#eef2f3"] },
  80: { icon: "rainy", label: "Showers", gradient: ["#667db6", "#0082c8"] },
  81: { icon: "rainy", label: "Moderate Showers", gradient: ["#373B44", "#4286f4"] },
  82: { icon: "thunderstorm", label: "Heavy Showers", gradient: ["#232526", "#414345"] },
  95: { icon: "thunderstorm", label: "Thunderstorm", gradient: ["#0f0c29", "#302b63"] },
  96: { icon: "thunderstorm", label: "Thunderstorm + Hail", gradient: ["#141E30", "#243B55"] },
  99: { icon: "thunderstorm", label: "Severe Thunderstorm", gradient: ["#0f0c29", "#24243e"] },
};

const SAVED_CITY_KEY = "weather_manual_city";
const FORECAST_CACHE_TTL = 30 * 60_000;

type ForecastData = {
  current: { temp: number; code: number; windSpeed: number; humidity: number; feelsLike: number; uvIndex: number; pressure: number; visibility: number };
  hourly: { time: string; temp: number; code: number; precipitation: number; windSpeed: number; humidity: number }[];
  daily: { date: string; tempMax: number; tempMin: number; code: number; precipitation: number; windSpeed: number; uvIndex: number; sunrise: string; sunset: string }[];
  locationName: string;
  isGps: boolean;
};

async function fetchForecast(lat: number, lng: number): Promise<Omit<ForecastData, "locationName" | "isGps">> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature,uv_index,surface_pressure,visibility&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset&timezone=auto&forecast_days=7`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Weather fetch failed");
  const data = await resp.json();

  const cur = data.current;
  const current = {
    temp: Math.round(cur.temperature_2m),
    code: cur.weather_code ?? 0,
    windSpeed: Math.round(cur.wind_speed_10m ?? 0),
    humidity: Math.round(cur.relative_humidity_2m ?? 0),
    feelsLike: Math.round(cur.apparent_temperature ?? cur.temperature_2m),
    uvIndex: Math.round((cur.uv_index ?? 0) * 10) / 10,
    pressure: Math.round(cur.surface_pressure ?? 0),
    visibility: Math.round((cur.visibility ?? 0) / 1000),
  };

  const hourly: ForecastData["hourly"] = [];
  const nowH = new Date().getHours();
  for (let i = 0; i < Math.min(48, data.hourly.time.length); i++) {
    hourly.push({
      time: data.hourly.time[i],
      temp: Math.round(data.hourly.temperature_2m[i]),
      code: data.hourly.weather_code[i] ?? 0,
      precipitation: data.hourly.precipitation_probability?.[i] ?? 0,
      windSpeed: Math.round(data.hourly.wind_speed_10m?.[i] ?? 0),
      humidity: Math.round(data.hourly.relative_humidity_2m?.[i] ?? 0),
    });
  }

  const daily: ForecastData["daily"] = [];
  for (let i = 0; i < data.daily.time.length; i++) {
    daily.push({
      date: data.daily.time[i],
      tempMax: Math.round(data.daily.temperature_2m_max[i]),
      tempMin: Math.round(data.daily.temperature_2m_min[i]),
      code: data.daily.weather_code[i] ?? 0,
      precipitation: Math.round((data.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
      windSpeed: Math.round(data.daily.wind_speed_10m_max?.[i] ?? 0),
      uvIndex: Math.round((data.daily.uv_index_max?.[i] ?? 0) * 10) / 10,
      sunrise: data.daily.sunrise?.[i] ?? "",
      sunset: data.daily.sunset?.[i] ?? "",
    });
  }

  return { current, hourly, daily };
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const result = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (result.length > 0) {
      const r = result[0];
      return [r.city || r.subregion, r.region].filter(Boolean).join(", ") || "Current Location";
    }
  } catch (err) {
    if (__DEV__) console.warn("[Weather] Reverse geocode failed:", err instanceof Error ? err.message : String(err));
  }
  return "Current Location";
}

async function geocodeCity(city: string): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.results?.length) return null;
    const r = data.results[0];
    return { lat: r.latitude, lng: r.longitude, name: [r.name, r.admin1, r.country].filter(Boolean).join(", ") };
  } catch {
    return null;
  }
}

type Tab = "hourly" | "daily";

export default function WeatherDetailScreen() {
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("hourly");
  const [showCityInput, setShowCityInput] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ lat: number; lng: number; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [savedCity, setSavedCity] = useState<{ lat: number; lng: number; name: string } | null>(null);

  const loadWeather = useCallback(async (manualCity?: { lat: number; lng: number; name: string }) => {
    setLoading(true);
    setError(null);
    try {
      let lat: number;
      let lng: number;
      let locName = "";
      let isGps = false;

      if (manualCity) {
        lat = manualCity.lat;
        lng = manualCity.lng;
        locName = manualCity.name;
        isGps = false;
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
            locName = await reverseGeocode(lat, lng);
            isGps = true;
          } catch {
            const saved = await AsyncStorage.getItem(SAVED_CITY_KEY).catch((err) => { console.warn("[Weather] AsyncStorage read failed for saved city:", err); return null; });
            if (saved) {
              const parsed = JSON.parse(saved);
              lat = parsed.lat;
              lng = parsed.lng;
              locName = parsed.name;
              isGps = false;
            } else {
              setError("Could not get location. Add a city manually.");
              setLoading(false);
              return;
            }
          }
        } else {
          const saved = await AsyncStorage.getItem(SAVED_CITY_KEY).catch((err) => { console.warn("[Weather] AsyncStorage read failed for saved city:", err); return null; });
          if (saved) {
            const parsed = JSON.parse(saved);
            lat = parsed.lat;
            lng = parsed.lng;
            locName = parsed.name;
            isGps = false;
          } else {
            setError("Location permission denied. Add a city manually.");
            setLoading(false);
            return;
          }
        }
      }

      const cacheKey = `forecast_cache_${Math.round(lat * 10)}_${Math.round(lng * 10)}`;
      const cached = await AsyncStorage.getItem(cacheKey).catch((err) => { console.warn("[Weather] AsyncStorage read failed for forecast cache:", err); return null; });
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed._ts < FORECAST_CACHE_TTL) {
            setForecast({ ...parsed, locationName: locName, isGps });
            setLoading(false);
            return;
          }
        } catch (parseErr) {
          if (__DEV__) console.warn("[Weather] Failed to parse forecast cache:", parseErr instanceof Error ? parseErr.message : String(parseErr));
        }
      }

      const result = await fetchForecast(lat, lng);
      const fullData = { ...result, locationName: locName, isGps, _ts: Date.now() };
      AsyncStorage.setItem(cacheKey, JSON.stringify(fullData)).catch((err) => {
        console.warn("[Weather] Failed to cache forecast data:", err);
      });
      setForecast(fullData);
    } catch (e) {
      setError("Failed to load weather data. Please try again.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(SAVED_CITY_KEY).catch((err) => { console.warn("[Weather] AsyncStorage read failed for saved city:", err); return null; });
      if (saved) {
        try {
          setSavedCity(JSON.parse(saved));
        } catch (parseErr) {
          if (__DEV__) console.warn("[Weather] Failed to parse saved city:", parseErr instanceof Error ? parseErr.message : String(parseErr));
        }
      }
      loadWeather();
    })();
  }, []);

  const handleSearchCity = useCallback(async () => {
    if (!cityQuery.trim()) return;
    setSearching(true);
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery.trim())}&count=5&language=en&format=json`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.results?.length) {
        setSearchResults(data.results.map((r: any) => ({
          lat: r.latitude,
          lng: r.longitude,
          name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
        })));
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, [cityQuery]);

  const handleSelectCity = useCallback(async (city: { lat: number; lng: number; name: string }) => {
    await AsyncStorage.setItem(SAVED_CITY_KEY, JSON.stringify(city)).catch((err) => {
      console.warn("[Weather] Failed to save selected city:", err);
    });
    setSavedCity(city);
    setShowCityInput(false);
    setCityQuery("");
    setSearchResults([]);
    loadWeather(city);
  }, [loadWeather]);

  const handleUseGps = useCallback(async () => {
    setShowCityInput(false);
    setCityQuery("");
    setSearchResults([]);
    loadWeather();
  }, [loadWeather]);

  const VALID_IONICON_WEATHER = new Set(["sunny", "partly-sunny", "cloudy", "cloud", "rainy", "snow", "thunderstorm"]);
  const safeWmoIcon = (icon: string): keyof typeof Ionicons.glyphMap => {
    if (VALID_IONICON_WEATHER.has(icon)) return icon as keyof typeof Ionicons.glyphMap;
    if (__DEV__) console.warn("[Weather] Invalid WMO icon name:", icon);
    return "cloud-outline";
  };
  const wmo = forecast ? (WMO_ICONS[forecast.current.code] ?? WMO_ICONS[0]!) : WMO_ICONS[0]!;
  const gradient = wmo.gradient;

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours();
    if (h === 0) return "12 AM";
    if (h === 12) return "12 PM";
    return h > 12 ? `${h - 12} PM` : `${h} AM`;
  };

  const formatDay = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
    return d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
  };

  const formatSunTime = (iso: string) => {
    if (!iso) return "--";
    const d = new Date(iso);
    return d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  const nowHourIndex = useMemo(() => {
    if (!forecast) return 0;
    const now = new Date();
    const idx = forecast.hourly.findIndex(h => new Date(h.time).getHours() === now.getHours());
    return Math.max(0, idx);
  }, [forecast]);

  const visibleHourly = forecast ? forecast.hourly.slice(nowHourIndex) : [];

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <LinearGradient colors={gradient} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 380 }} />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={goBack} style={s.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Weather</Text>
          <TouchableOpacity onPress={() => setShowCityInput(v => !v)} style={s.addCityBtn} activeOpacity={0.7}>
            <Ionicons name={showCityInput ? "close" : "location"} size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* City search */}
        {showCityInput && (
          <View style={s.searchWrap}>
            <View style={s.searchRow}>
              <Ionicons name="search" size={16} color={C.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Search city..."
                placeholderTextColor={C.textMuted}
                value={cityQuery}
                onChangeText={setCityQuery}
                onSubmitEditing={handleSearchCity}
                returnKeyType="search"
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={C.primary} />}
            </View>
            {savedCity && (
              <TouchableOpacity onPress={handleUseGps} style={s.gpsBtn} activeOpacity={0.7}>
                <Ionicons name="navigate" size={14} color={C.primary} />
                <Text style={s.gpsBtnText}>Use GPS Location</Text>
              </TouchableOpacity>
            )}
            {searchResults.map((city, i) => (
              <TouchableOpacity key={i} onPress={() => handleSelectCity(city)} style={s.resultRow} activeOpacity={0.7}>
                <Ionicons name="location-outline" size={16} color={C.primary} />
                <Text style={s.resultText} numberOfLines={1}>{city.name}</Text>
              </TouchableOpacity>
            ))}
            {searchResults.length === 0 && cityQuery.length > 0 && !searching && (
              <Text style={s.noResult}>No cities found. Try a different name.</Text>
            )}
          </View>
        )}

        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={s.loadingText}>Loading weather...</Text>
          </View>
        ) : error ? (
          <View style={s.errorWrap}>
            <Ionicons name="cloud-offline-outline" size={48} color="rgba(255,255,255,0.6)" />
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setShowCityInput(true)} style={s.errorBtn}>
              <Text style={s.errorBtnText}>Add City Manually</Text>
            </TouchableOpacity>
          </View>
        ) : forecast ? (
          <>
            {/* Current weather hero */}
            <View style={s.heroWrap}>
              <View style={s.locationRow}>
                <Ionicons name={forecast.isGps ? "navigate" : "location"} size={14} color="rgba(255,255,255,0.8)" />
                <Text style={s.locationText}>{forecast.locationName}</Text>
                {forecast.isGps && <View style={s.gpsDot} />}
              </View>
              <Text style={s.heroTemp}>{forecast.current.temp}°</Text>
              <View style={s.heroCondRow}>
                <Ionicons name={safeWmoIcon(wmo.icon)} size={24} color="rgba(255,255,255,0.9)" />
                <Text style={s.heroCondText}>{wmo.label}</Text>
              </View>
              <Text style={s.heroFeelsLike}>Feels like {forecast.current.feelsLike}°C</Text>

              {/* Quick stats */}
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Ionicons name="water-outline" size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={s.statValue}>{forecast.current.humidity}%</Text>
                  <Text style={s.statLabel}>Humidity</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Ionicons name="speedometer-outline" size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={s.statValue}>{forecast.current.windSpeed} km/h</Text>
                  <Text style={s.statLabel}>Wind</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Ionicons name="sunny-outline" size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={s.statValue}>{forecast.current.uvIndex}</Text>
                  <Text style={s.statLabel}>UV Index</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Ionicons name="eye-outline" size={16} color="rgba(255,255,255,0.7)" />
                  <Text style={s.statValue}>{forecast.current.visibility} km</Text>
                  <Text style={s.statLabel}>Visibility</Text>
                </View>
              </View>
            </View>

            {/* Tab selector */}
            <View style={s.tabRow}>
              {(["hourly", "daily"] as Tab[]).map(t => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTab(t)}
                  style={[s.tabBtn, tab === t && s.tabBtnActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                    {t === "hourly" ? "Hourly" : "7-Day"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Hourly forecast */}
            {tab === "hourly" && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.hScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                {visibleHourly.slice(0, 24).map((h, i) => {
                  const hWmo = WMO_ICONS[h.code] ?? WMO_ICONS[0];
                  const isNow = i === 0;
                  return (
                    <View key={i} style={[s.hourCard, isNow && s.hourCardNow]}>
                      <Text style={[s.hourTime, isNow && s.hourTimeNow]}>{isNow ? "Now" : formatTime(h.time)}</Text>
                      <Ionicons name={safeWmoIcon(hWmo.icon)} size={22} color={isNow ? C.primary : C.textSecondary} />
                      <Text style={[s.hourTemp, isNow && s.hourTempNow]}>{h.temp}°</Text>
                      <View style={s.hourPrecipRow}>
                        <Ionicons name="water" size={10} color="#60a5fa" />
                        <Text style={s.hourPrecip}>{h.precipitation}%</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Daily forecast */}
            {tab === "daily" && (
              <View style={s.dailyWrap}>
                {forecast.daily.map((d, i) => {
                  const dWmo = WMO_ICONS[d.code] ?? WMO_ICONS[0];
                  const maxT = Math.max(...forecast.daily.map(dd => dd.tempMax));
                  const minT = Math.min(...forecast.daily.map(dd => dd.tempMin));
                  const range = maxT - minT || 1;
                  const barLeft = ((d.tempMin - minT) / range) * 100;
                  const barWidth = ((d.tempMax - d.tempMin) / range) * 100;

                  return (
                    <View key={i} style={s.dayRow}>
                      <Text style={s.dayName}>{formatDay(d.date)}</Text>
                      <Ionicons name={safeWmoIcon(dWmo.icon)} size={20} color={C.textSecondary} style={{ width: 28 }} />
                      <Text style={s.dayTempMin}>{d.tempMin}°</Text>
                      <View style={s.dayBarTrack}>
                        <LinearGradient
                          colors={["#60a5fa", "#f97316"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[s.dayBarFill, { left: `${barLeft}%`, width: `${Math.max(barWidth, 8)}%` }]}
                        />
                      </View>
                      <Text style={s.dayTempMax}>{d.tempMax}°</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Details cards */}
            <View style={s.detailsGrid}>
              {forecast.daily[0] && (
                <>
                  <View style={s.detailCard}>
                    <View style={s.detailCardHeader}>
                      <Ionicons name="sunny-outline" size={14} color={C.primary} />
                      <Text style={s.detailCardTitle}>Sunrise & Sunset</Text>
                    </View>
                    <View style={s.sunRow}>
                      <View style={s.sunItem}>
                        <Ionicons name="arrow-up-outline" size={16} color="#f59e0b" />
                        <Text style={s.sunTime}>{formatSunTime(forecast.daily[0].sunrise)}</Text>
                        <Text style={s.sunLabel}>Sunrise</Text>
                      </View>
                      <View style={s.sunItem}>
                        <Ionicons name="arrow-down-outline" size={16} color="#ef4444" />
                        <Text style={s.sunTime}>{formatSunTime(forecast.daily[0].sunset)}</Text>
                        <Text style={s.sunLabel}>Sunset</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.detailCard}>
                    <View style={s.detailCardHeader}>
                      <Ionicons name="analytics-outline" size={14} color={C.primary} />
                      <Text style={s.detailCardTitle}>Pressure & Rain</Text>
                    </View>
                    <View style={s.sunRow}>
                      <View style={s.sunItem}>
                        <Text style={s.sunTime}>{forecast.current.pressure} hPa</Text>
                        <Text style={s.sunLabel}>Pressure</Text>
                      </View>
                      <View style={s.sunItem}>
                        <Text style={s.sunTime}>{forecast.daily[0].precipitation} mm</Text>
                        <Text style={s.sunLabel}>Rain Today</Text>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Source info */}
            <Text style={s.source}>Powered by Open-Meteo</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Font.semiBold,
    fontSize: 17,
    color: "#fff",
  },
  addCityBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchWrap: {
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    ...shadows.md,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: Font.regular,
    fontSize: 14,
    color: C.text,
  },
  gpsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  gpsBtnText: {
    fontFamily: Font.medium,
    fontSize: 13,
    color: C.primary,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  resultText: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: C.text,
    flex: 1,
  },
  noResult: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: C.textMuted,
    textAlign: "center",
    paddingVertical: 12,
  },
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    gap: 12,
  },
  loadingText: {
    fontFamily: Font.medium,
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
  },
  errorWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
    paddingHorizontal: 32,
  },
  errorText: {
    fontFamily: Font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
  },
  errorBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
  },
  errorBtnText: {
    fontFamily: Font.semiBold,
    fontSize: 13,
    color: "#fff",
  },
  heroWrap: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 24,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  locationText: {
    fontFamily: Font.medium,
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ade80",
  },
  heroTemp: {
    fontFamily: Font.bold,
    fontSize: 80,
    color: "#fff",
    lineHeight: 90,
    ...Platform.select({ web: { textShadow: "0px 2px 8px rgba(0,0,0,0.15)" }, default: { textShadowColor: "rgba(0,0,0,0.15)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 } }),
  },
  heroCondRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  heroCondText: {
    fontFamily: Font.semiBold,
    fontSize: 18,
    color: "rgba(255,255,255,0.9)",
  },
  heroFeelsLike: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontFamily: Font.semiBold,
    fontSize: 13,
    color: "#fff",
  },
  statLabel: {
    fontFamily: Font.regular,
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 3,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: C.surface,
    ...shadows.sm,
  },
  tabText: {
    fontFamily: Font.medium,
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
  },
  tabTextActive: {
    color: C.text,
    fontFamily: Font.semiBold,
  },
  hScroll: {
    marginBottom: 16,
  },
  hourCard: {
    width: 64,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  hourCardNow: {
    backgroundColor: C.surface,
    borderColor: C.primary + "30",
    ...shadows.sm,
  },
  hourTime: {
    fontFamily: Font.medium,
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
  },
  hourTimeNow: { color: C.primary },
  hourTemp: {
    fontFamily: Font.bold,
    fontSize: 16,
    color: "rgba(255,255,255,0.9)",
  },
  hourTempNow: { color: C.text },
  hourPrecipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  hourPrecip: {
    fontFamily: Font.regular,
    fontSize: 10,
    color: "#60a5fa",
  },
  dailyWrap: {
    marginHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    gap: 8,
  },
  dayName: {
    fontFamily: Font.medium,
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    width: 80,
  },
  dayTempMin: {
    fontFamily: Font.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    width: 30,
    textAlign: "right",
  },
  dayBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  dayBarFill: {
    position: "absolute",
    top: 0,
    height: 4,
    borderRadius: 2,
  },
  dayTempMax: {
    fontFamily: Font.semiBold,
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
    width: 30,
  },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  detailCard: {
    flex: 1,
    minWidth: (W - 42) / 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  detailCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailCardTitle: {
    fontFamily: Font.medium,
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sunRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  sunItem: {
    alignItems: "center",
    gap: 4,
  },
  sunTime: {
    fontFamily: Font.semiBold,
    fontSize: 15,
    color: "rgba(255,255,255,0.9)",
  },
  sunLabel: {
    fontFamily: Font.regular,
    fontSize: 10,
    color: "rgba(255,255,255,0.4)",
  },
  source: {
    fontFamily: Font.regular,
    fontSize: 11,
    color: "rgba(255,255,255,0.25)",
    textAlign: "center",
    marginTop: 8,
  },
});
