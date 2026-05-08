import { Platform } from "react-native";

const primary = "#0066FF";
const primaryLight = "#4D94FF";
const primaryDark = "#0047B3";
const primarySoft = "#E8F1FF";
const accent = "#FF9500";
const accentSoft = "#FFF4E5";
const success = "#00C48C";
const successSoft = "#E5F9F2";
const danger = "#FF3B30";
const dangerSoft = "#FFE5E3";
const warning = "#FF9500";
const warningSoft = "#FFF4E5";
const info = "#5856D6";
const infoSoft = "#EEEEFF";
const amber = "#D97706";
const amberSoft = "#FEF3C7";
const amberDark = "#92400E";
const red = "#DC2626";
const redSoft = "#FEE2E2";
const blueSoft = "#EFF6FF";
const blueBorder = "#BFDBFE";
const brandBlue = "#1A56DB";
const brandBlueDark = "#0D3B93";
const brandBlueMid = "#3B82F6";
const brandBlueSoft = "#DBEAFE";
const emerald = "#059669";
const emeraldSoft = "#D1FAE5";
const emeraldDark = "#047857";
const emeraldDot = "#10B981";
const gold = "#F59E0B";
const goldSoft = "#FBBF24";
const purple = "#7C3AED";
const purpleSoft = "#EDE9FE";
const purpleBg = "#F5F3FF";
const indigo = "#6366F1";
const indigoSoft = "#E0E7FF";
const cyan = "#0891B2";
const cyanSoft = "#CFFAFE";
const gray = "#6B7280";
const graySoft = "#F3F4F6";
const slate = "#CBD5E1";
const slateBorder = "#E2E8F0";
const emeraldBg = "#ECFDF5";
const emeraldBorder = "#A7F3D0";
const emeraldMid = "#6EE7B7";
const emeraldDeep = "#065F46";
const redBright = "#EF4444";
const redDark = "#B91C1C";
const redBg = "#FEF2F2";
const redBorder = "#FECACA";
const amberBrown = "#B45309";
const amberBg = "#FFFBEB";
const amberBorder = "#FDE68A";
const orangeDark = "#9A3412";
const orangeBrand = "#EA580C";
const orangeBg = "#FFF7ED";
const orangeSoft = "#FFEDD5";
const orangeBorder = "#FED7AA";
const purpleLight = "#F3E8FF";
const purpleDeep = "#5B21B6";
const purpleBorder = "#DDD6FE";
const indigoDark = "#4F46E5";
const indigoDarkest = "#3730A3";
const indigoBorder = "#C7D2FE";
const navyDark = "#1E3A5F";
const blueMist = "#93C5FD";
const redMist = "#FCA5A5";
const blueLightBorder = "#B3D4FF";
const royalBlue = "#2563EB";
const greenBright = "#16A34A";
const greenBg = "#F0FDF4";
const greenBorder = "#BBF7D0";
const greenLightBg = "#DCFCE7";
const greenDeep = "#166534";
const navyDeep = "#1E40AF";
const slateDeep = "#1E293B";
const yellowLightBg = "#FEF9C3";
const roseBg = "#FFE4E6";
const roseDeep = "#BE123C";
const skyBg = "#E0F2FE";
const skyDark = "#0284C7";
const purpleMid = "#A78BFA";
const purpleVivid = "#6D28D9";
const redDeepest = "#991B1B";
const grayMid = "#9CA3AF";
const grayDark = "#374151";
const silverBg = "#D1D5DB";
const yellowWarm = "#FFFDE7";
const peachBg = "#FFF3E0";
const goldBright = "#FFD700";
const goldWarm = "#FFB340";
const silverGray = "#F5F5F5";
const goldAlpha = "#F59E0B22";
const bronzeAccent = "#CD7F32";
const neutralGray = "#8E8E93";
const whatsappGreen = "#25D366";
const facebookBlue = "#1877F2";
const mintGreen = "#00E6A0";
const slateGray = "#EDF2F7";
const crimson = "#CE2029";
const redDeep = "#7F1D1D";
const blueDeep = "#2B6CB0";
const greenVivid = "#1B8E3D";

const overlayLight10 = "rgba(255,255,255,0.1)";
const overlayLight15 = "rgba(255,255,255,0.15)";
const overlayLight20 = "rgba(255,255,255,0.2)";
const overlayLight22 = "rgba(255,255,255,0.22)";
const overlayLight25 = "rgba(255,255,255,0.25)";
const overlayLight30 = "rgba(255,255,255,0.3)";
const overlayLight40 = "rgba(255,255,255,0.4)";
const overlayLight50 = "rgba(255,255,255,0.5)";
const overlayLight70 = "rgba(255,255,255,0.7)";
const overlayLight75 = "rgba(255,255,255,0.75)";
const overlayLight80 = "rgba(255,255,255,0.8)";
const overlayLight85 = "rgba(255,255,255,0.85)";
const overlayLight90 = "rgba(255,255,255,0.9)";
const overlayDark15 = "rgba(0,0,0,0.15)";
const overlayDark35 = "rgba(0,0,0,0.35)";
const overlayDark40 = "rgba(0,0,0,0.4)";
const overlayDark50 = "rgba(0,0,0,0.5)";
const overlayDark60 = "rgba(0,0,0,0.6)";
const overlayPurple85 = "rgba(124,58,237,0.85)";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
} as const;

export const typography = {
  h1: { fontFamily: "Inter_700Bold", fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 28 },
  h3: { fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 24 },
  subtitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, lineHeight: 22 },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20 },
  bodyMedium: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20 },
  bodySemiBold: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16 },
  captionMedium: { fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 16 },
  small: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 14 },
  smallMedium: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 14 },
  button: { fontFamily: "Inter_600SemiBold", fontSize: 15, lineHeight: 20 },
  buttonMedium: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 20 },
  buttonSmall: { fontFamily: "Inter_600SemiBold", fontSize: 13, lineHeight: 18 },
  tabLabel: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 14 },
  otp: { fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 30 },
} as const;

export function getTypography(language: string) {
  const isUrdu = language === "ur" || language === "en_ur";

  const regular = isUrdu ? "NotoNastaliqUrdu_400Regular" : "Inter_400Regular";
  const medium = isUrdu ? "NotoNastaliqUrdu_500Medium" : "Inter_500Medium";
  const semiBold = isUrdu ? "NotoNastaliqUrdu_600SemiBold" : "Inter_600SemiBold";
  const bold = isUrdu ? "NotoNastaliqUrdu_700Bold" : "Inter_700Bold";

  return {
    h1: { fontFamily: bold, fontSize: 28, lineHeight: isUrdu ? 48 : 34 },
    h2: { fontFamily: bold, fontSize: 22, lineHeight: isUrdu ? 40 : 28 },
    h3: { fontFamily: bold, fontSize: 18, lineHeight: isUrdu ? 34 : 24 },
    subtitle: { fontFamily: semiBold, fontSize: 16, lineHeight: isUrdu ? 30 : 22 },
    body: { fontFamily: regular, fontSize: 14, lineHeight: isUrdu ? 30 : 20 },
    bodyMedium: { fontFamily: medium, fontSize: 14, lineHeight: isUrdu ? 30 : 20 },
    bodySemiBold: { fontFamily: semiBold, fontSize: 14, lineHeight: isUrdu ? 30 : 20 },
    caption: { fontFamily: regular, fontSize: 12, lineHeight: isUrdu ? 24 : 16 },
    captionMedium: { fontFamily: medium, fontSize: 12, lineHeight: isUrdu ? 24 : 16 },
    small: { fontFamily: regular, fontSize: 11, lineHeight: isUrdu ? 22 : 14 },
    smallMedium: { fontFamily: medium, fontSize: 11, lineHeight: isUrdu ? 22 : 14 },
    button: { fontFamily: semiBold, fontSize: 15, lineHeight: isUrdu ? 28 : 20 },
    buttonSmall: { fontFamily: semiBold, fontSize: 13, lineHeight: isUrdu ? 26 : 18 },
    tabLabel: { fontFamily: medium, fontSize: 11, lineHeight: isUrdu ? 22 : 14 },
    otp: { fontFamily: bold, fontSize: 24, lineHeight: isUrdu ? 44 : 30 },
  };
}

export function getFontFamily(language: string) {
  const isUrdu = language === "ur" || language === "en_ur";
  return {
    regular: isUrdu ? "NotoNastaliqUrdu_400Regular" : "Inter_400Regular",
    medium: isUrdu ? "NotoNastaliqUrdu_500Medium" : "Inter_500Medium",
    semiBold: isUrdu ? "NotoNastaliqUrdu_600SemiBold" : "Inter_600SemiBold",
    bold: isUrdu ? "NotoNastaliqUrdu_700Bold" : "Inter_700Bold",
    isUrdu,
  };
}

const _mkShadow = (yOff: number, blur: number, opacity: number, elev: number) =>
  Platform.select({
    web: { boxShadow: `0 ${yOff}px ${blur}px rgba(15,23,42,${opacity})` },
    default: { shadowColor: "#0F172A", shadowOffset: { width: 0, height: yOff }, shadowOpacity: opacity, shadowRadius: blur, elevation: elev },
  }) as { boxShadow?: string; shadowColor?: string; shadowOffset?: { width: number; height: number }; shadowOpacity?: number; shadowRadius?: number; elevation?: number };

export const shadows = {
  sm: _mkShadow(1, 3, 0.04, 1),
  md: _mkShadow(2, 8, 0.06, 3),
  lg: _mkShadow(4, 16, 0.08, 6),
  xl: _mkShadow(8, 24, 0.12, 10),
};

export const gradients = {
  primary: [primary, primaryDark] as const,
  mart: ["#00C48C", "#00A67A"] as const,
  food: ["#FF9500", "#E67E00"] as const,
  ride: [primary, "#0052CC"] as const,
  wallet: ["#5856D6", "#4644B0"] as const,
  pharmacy: ["#AF52DE", "#8E44AD"] as const,
  parcel: ["#FF6B35", "#D4541E"] as const,
  success: [success, "#00A67A"] as const,
  danger: [danger, "#CC2F26"] as const,
  dark: ["#1E293B", "#0F172A"] as const,
} as const;

export const serviceColors = {
  mart: { main: "#00C48C", light: "#E5F9F2", dark: "#00A67A" },
  food: { main: "#FF9500", light: "#FFF4E5", dark: "#E67E00" },
  ride: { main: primary, light: "#E8F1FF", dark: "#0052CC" },
  wallet: { main: "#5856D6", light: "#EEEEFF", dark: "#4644B0" },
  pharmacy: { main: "#AF52DE", light: "#F5E6FF", dark: "#8E44AD" },
  parcel: { main: "#FF6B35", light: "#FFF0EB", dark: "#D4541E" },
} as const;

const lightTheme = {
    primary,
    primaryLight,
    primaryDark,
    primarySoft,
    accent,
    accentSoft,
    success,
    successSoft,
    danger,
    dangerSoft,
    warning,
    warningSoft,
    info,
    infoSoft,
    text: "#0F172A",
    textSecondary: "#475569",
    textMuted: "#94A3B8",
    textInverse: "#FFFFFF",
    background: "#F1F5F9",
    surface: "#FFFFFF",
    surfaceAlt: "#F8FAFC",
    surfaceSecondary: "#F8FAFC",
    surfaceElevated: "#FFFFFF",
    textTertiary: "#94A3B8",
    error: danger,
    warnBg: warningSoft,
    border: "#E2E8F0",
    borderLight: "#F1F5F9",
    inputBg: "#F8F9FA",
    tint: primary,
    tabIconDefault: "#94A3B8",
    tabIconSelected: primary,
    shadow: "rgba(15, 23, 42, 0.06)",
    overlay: "rgba(15, 23, 42, 0.5)",

    mart: "#00C48C",
    martLight: "#E5F9F2",
    food: "#FF9500",
    foodLight: "#FFF4E5",
    ride: "#0066FF",
    rideLight: "#E8F1FF",
    wallet: "#5856D6",
    walletLight: "#EEEEFF",
    amber,
    amberSoft,
    amberDark,
    red,
    redSoft,
    blueSoft,
    blueBorder,
    brandBlue,
    brandBlueDark,
    brandBlueMid,
    brandBlueSoft,
    emerald,
    emeraldSoft,
    emeraldDark,
    emeraldDot,
    gold,
    goldSoft,
    purple,
    purpleSoft,
    purpleBg,
    indigo,
    indigoSoft,
    cyan,
    cyanSoft,
    gray,
    graySoft,
    slate,
    slateBorder,
    emeraldBg,
    emeraldBorder,
    emeraldMid,
    emeraldDeep,
    redBright,
    redDark,
    redBg,
    redBorder,
    amberBrown,
    amberBg,
    amberBorder,
    orangeDark,
    orangeBrand,
    orangeBg,
    orangeSoft,
    orangeBorder,
    purpleLight,
    purpleDeep,
    purpleBorder,
    indigoDark,
    indigoDarkest,
    indigoBorder,
    navyDark,
    blueMist,
    redMist,
    blueLightBorder,
    royalBlue,
    greenBright,
    greenBg,
    greenBorder,
    greenLightBg,
    greenDeep,
    navyDeep,
    slateDeep,
    yellowLightBg,
    roseBg,
    roseDeep,
    skyBg,
    skyDark,
    purpleMid,
    purpleVivid,
    redDeepest,
    grayMid,
    grayDark,
    silverBg,
    yellowWarm,
    peachBg,
    goldBright,
    goldWarm,
    silverGray,
    goldAlpha,
    bronzeAccent,
    neutralGray,
    whatsappGreen,
    facebookBlue,
    mintGreen,
    slateGray,
    crimson,
    redDeep,
    blueDeep,
    greenVivid,
    pharmacy: "#AF52DE",
    pharmacyLight: "#F5E6FF",
    pharmacyDark: "#8E44AD",
    parcel: "#FF6B35",
    parcelLight: "#FFF0EB",
    parcelDark: "#D4541E",

    martDark: "#00A67A",
    foodDark: "#E67E00",
    rideDark: "#0052CC",
    walletDark: "#4644B0",
    overlayLight10,
    overlayLight15,
    overlayLight20,
    overlayLight22,
    overlayLight25,
    overlayLight30,
    overlayLight40,
    overlayLight50,
    overlayLight70,
    overlayLight75,
    overlayLight80,
    overlayLight85,
    overlayLight90,
    overlayDark15,
    overlayDark35,
    overlayDark40,
    overlayDark50,
    overlayDark60,
    overlayPurple85,
};

const darkTheme = {
  ...lightTheme,
  text: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textInverse: "#0F172A",
  background: "#0A0F1A",
  surface: "#141C2D",
  surfaceAlt: "#1A2440",
  surfaceSecondary: "#1A2440",
  surfaceElevated: "#1E2A40",
  textTertiary: "#64748B",
  border: "#2D3B56",
  borderLight: "#1A2440",
  inputBg: "#1A2440",
  shadow: "rgba(0,0,0,0.4)",
  overlay: "rgba(0,0,0,0.7)",
  blueSoft: "#1A2B4A",
  blueBorder: "#2D4A7A",
  brandBlueSoft: "#1A2B4A",
  yellowLightBg: "#2A2000",
  orangeBg: "#2A1200",
  orangeBorder: "#4A2510",
  orangeSoft: "#3A1E0A",
  redBg: "#2A0F0F",
  redBorder: "#4A1515",
  greenBg: "#0A1F12",
  greenLightBg: "#0A1A10",
  amberBg: "#1A1400",
  purpleBg: "#1A1230",
  purpleLight: "#1A1230",
  skyBg: "#0A1C2A",
  silverGray: "#1E293B",
  graySoft: "#1A2440",
  infoSoft: "#1A1840",
  warningSoft: "#2A2000",
  dangerSoft: "#2A0F0F",
  successSoft: "#0A1F12",
  primarySoft: "#0A1838",
  accentSoft: "#2A1800",
  slateGray: "#1A2440",
  roseBg: "#2A1015",
  peachBg: "#2A1A0A",
  yellowWarm: "#1A1500",
};

export default {
  light: lightTheme,
  dark: darkTheme,
};
