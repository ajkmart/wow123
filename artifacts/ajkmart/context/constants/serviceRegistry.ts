import { type Href } from "expo-router";
import type { Ionicons } from "@expo/vector-icons";
import Colors from "./colors";
import { type ServiceKey, SERVICE_KEYS } from "@workspace/service-constants";
export { type ServiceKey, SERVICE_KEYS as SERVICE_KEY_LIST, SERVICE_METADATA } from "@workspace/service-constants";

const C = Colors.light;

type IoniconName = keyof typeof Ionicons.glyphMap;

export const APP_ROUTES = {
  mart:     "/mart",
  food:     "/food",
  rides:    "/ride",
  pharmacy: "/pharmacy",
  parcel:   "/parcel",
  orders:   "/(tabs)/orders",
  van:      "/van",
  school:   "/school" as unknown as Href,
} as const satisfies Record<string, Href>;

export interface ServiceDefinition {
  key: ServiceKey;
  featureFlag: string;
  label: string;
  description: string;
  icon: IoniconName;
  iconFocused: IoniconName;
  route: Href;
  color: string;
  colorLight: string;
  gradient: [string, string];
  cardGradient: [string, string];
  iconGradient: [string, string];
  textColor: string;
  tagColor: string;
  tagBg: string;
  tag: string;
  tagIcon: IoniconName;
  heroConfig: {
    badgeIcon: IoniconName;
    badgeLabel: string;
    title: string;
    subtitle: string;
    stats: { icon: IoniconName; label: string }[];
    cta: string;
    gradient: [string, string, string];
  };
  banners: {
    title: string;
    desc: string;
    tag: string;
    c1: string;
    c2: string;
    icon: IoniconName;
    cta: string;
  }[];
  quickActions: {
    icon: IoniconName;
    label: string;
    color: string;
    bg: string;
    route: Href;
  }[];
  tabLabel: string;
  adminDescription: string;
  adminIcon: string;
}

export const SERVICE_REGISTRY: Record<ServiceKey, ServiceDefinition> = {
  mart: {
    key: "mart",
    featureFlag: "feature_mart",
    label: "Grocery Mart",
    description: "Fresh groceries & essentials delivered to your door",
    icon: "storefront-outline",
    iconFocused: "storefront",
    route: APP_ROUTES.mart,
    color: C.mart,
    colorLight: C.martLight,
    gradient: ["#0052CC", "#3385FF"],
    cardGradient: [C.martLight, "#CCF0E0"],
    iconGradient: [C.mart, "#33D4A7"],
    textColor: "#005C44",
    tagColor: "#005C44",
    tagBg: "#99ECCC",
    tag: "500+ items",
    tagIcon: "cube-outline",
    heroConfig: {
      badgeIcon: "storefront",
      badgeLabel: "Grocery Mart",
      title: "AJKMart",
      subtitle: "Fresh groceries & essentials\ndelivered to your door",
      stats: [
        { icon: "cube-outline", label: "500+ items" },
        { icon: "time-outline", label: "20 min delivery" },
      ],
      cta: "Shop Now",
      gradient: ["#0052CC", C.primary, "#3385FF"],
    },
    banners: [
      {
        title: "Free Delivery",
        desc: "Free delivery on your first order — try it today!",
        tag: "New Users",
        c1: C.primary,
        c2: "#3385FF",
        icon: "cart-outline",
        cta: "Shop Now",
      },
      {
        title: "Flash Deals",
        desc: "New deals daily — save 20% on fruits, veggies, milk & more!",
        tag: "Flash Sale",
        c1: "#4B47D6",
        c2: C.info,
        icon: "flash-outline",
        cta: "View Deals",
      },
    ],
    quickActions: [
      { icon: "leaf-outline", label: "Fruits", color: C.mart, bg: C.martLight, route: APP_ROUTES.mart },
      { icon: "flash-outline", label: "Deals", color: C.danger, bg: C.dangerSoft, route: APP_ROUTES.mart },
    ],
    tabLabel: "Mart",
    adminDescription: "Grocery & essentials marketplace with 500+ products",
    adminIcon: "🛒",
  },

  food: {
    key: "food",
    featureFlag: "feature_food",
    label: "Food Delivery",
    description: "Restaurants near you, delivered fast",
    icon: "restaurant-outline",
    iconFocused: "restaurant",
    route: APP_ROUTES.food,
    color: C.food,
    colorLight: C.foodLight,
    gradient: [C.foodLight, "#FEE8CC"],
    cardGradient: [C.foodLight, "#FEE8CC"],
    iconGradient: [C.food, "#FFB340"],
    textColor: "#7A5A00",
    tagColor: "#7A5A00",
    tagBg: "#FFE6B3",
    tag: "30 min",
    tagIcon: "time-outline",
    heroConfig: {
      badgeIcon: "restaurant",
      badgeLabel: "Food Delivery",
      title: "Food",
      subtitle: "Restaurants near you\ndelivered in 30 minutes",
      stats: [
        { icon: "restaurant-outline", label: "50+ restaurants" },
        { icon: "time-outline", label: "30 min delivery" },
      ],
      cta: "Order Now",
      gradient: ["#E68600", C.food, "#FFB340"],
    },
    banners: [
      {
        title: "Local Food Deal",
        desc: "Place 2 food orders and get 20% off your next one!",
        tag: "Food Deal",
        c1: "#E68600",
        c2: C.food,
        icon: "restaurant-outline",
        cta: "Order Now",
      },
    ],
    quickActions: [
      { icon: "pizza-outline", label: "Pizza", color: C.food, bg: C.foodLight, route: APP_ROUTES.food },
    ],
    tabLabel: "Food",
    adminDescription: "Restaurant food ordering & delivery service",
    adminIcon: "🍔",
  },

  rides: {
    key: "rides",
    featureFlag: "feature_rides",
    label: "Rides",
    description: "Safe & affordable bike and car rides",
    icon: "car-outline",
    iconFocused: "car",
    route: APP_ROUTES.rides,
    color: C.success,
    colorLight: C.successSoft,
    gradient: [C.successSoft, "#CCF5E7"],
    cardGradient: [C.successSoft, "#CCF5E7"],
    iconGradient: [C.success, "#33D4A7"],
    textColor: "#005C44",
    tagColor: "#005C44",
    tagBg: "#99ECCC",
    tag: "Instant",
    tagIcon: "flash-outline",
    heroConfig: {
      badgeIcon: "car",
      badgeLabel: "Rides",
      title: "Rides",
      subtitle: "Safe & affordable rides\nanywhere in AJK",
      stats: [
        { icon: "bicycle-outline", label: "Bike from Rs.45" },
        { icon: "car-outline", label: "Car from Rs.80" },
      ],
      cta: "Book a Ride",
      gradient: [C.success, "#00C48C", "#00E6A0"],
    },
    banners: [
      {
        title: "Bike Ride 10% Off",
        desc: "Book a bike from just Rs. 45 — anywhere in AJK!",
        tag: "Weekend Deal",
        c1: C.success,
        c2: "#00E6A0",
        icon: "bicycle-outline",
        cta: "Book a Ride",
      },
    ],
    quickActions: [
      { icon: "bicycle-outline", label: "Bike", color: C.info, bg: C.infoSoft, route: APP_ROUTES.rides },
      { icon: "car-outline", label: "Car", color: C.success, bg: C.successSoft, route: APP_ROUTES.rides },
    ],
    tabLabel: "Rides",
    adminDescription: "Bike & car ride booking with live tracking",
    adminIcon: "🚗",
  },

  pharmacy: {
    key: "pharmacy",
    featureFlag: "feature_pharmacy",
    label: "Pharmacy",
    description: "Medicines delivered from home in 25-40 min",
    icon: "medkit-outline",
    iconFocused: "medkit",
    route: APP_ROUTES.pharmacy,
    color: C.pharmacy,
    colorLight: C.pharmacyLight,
    gradient: [C.pharmacyLight, "#EDD6FF"],
    cardGradient: [C.pharmacyLight, "#EDD6FF"],
    iconGradient: [C.pharmacy, "#C77DEB"],
    textColor: "#5A1D8C",
    tagColor: "#5A1D8C",
    tagBg: "#DDB8FF",
    tag: "25-40 min",
    tagIcon: "medkit-outline",
    heroConfig: {
      badgeIcon: "medkit",
      badgeLabel: "Pharmacy",
      title: "Pharmacy",
      subtitle: "Order medicines from home\ndelivery in 25-40 min",
      stats: [
        { icon: "medkit-outline", label: "All medicines" },
        { icon: "time-outline", label: "25-40 min" },
      ],
      cta: "Order Now",
      gradient: ["#9B40D6", C.pharmacy, "#C77DEB"],
    },
    banners: [
      {
        title: "Pharmacy",
        desc: "Order medicines from home — delivery in 25-40 min!",
        tag: "On-Demand",
        c1: "#9B40D6",
        c2: C.pharmacy,
        icon: "medkit-outline",
        cta: "Order Now",
      },
    ],
    quickActions: [
      { icon: "medkit-outline", label: "Pharmacy", color: C.pharmacy, bg: C.pharmacyLight, route: APP_ROUTES.pharmacy },
    ],
    tabLabel: "Pharmacy",
    adminDescription: "On-demand medicine delivery with prescriptions",
    adminIcon: "💊",
  },

  parcel: {
    key: "parcel",
    featureFlag: "feature_parcel",
    label: "Parcel Delivery",
    description: "Send parcels anywhere in AJK",
    icon: "cube-outline",
    iconFocused: "cube",
    route: APP_ROUTES.parcel,
    color: C.parcel,
    colorLight: C.parcelLight,
    gradient: [C.parcelLight, "#FFD9CC"],
    cardGradient: [C.parcelLight, "#FFD9CC"],
    iconGradient: [C.parcel, "#FF8F66"],
    textColor: "#8C3300",
    tagColor: "#8C3300",
    tagBg: "#FFBFA3",
    tag: "Rs. 150+",
    tagIcon: "cube-outline",
    heroConfig: {
      badgeIcon: "cube",
      badgeLabel: "Parcel Delivery",
      title: "Parcel",
      subtitle: "Send parcels anywhere in AJK\nstarting from Rs. 150",
      stats: [
        { icon: "cube-outline", label: "Any size" },
        { icon: "time-outline", label: "Same day" },
      ],
      cta: "Book Now",
      gradient: ["#E65500", C.parcel, "#FF8F66"],
    },
    banners: [
      {
        title: "Parcel Delivery",
        desc: "Send parcels anywhere in AJK — starting from Rs. 150!",
        tag: "Fast Delivery",
        c1: "#E65500",
        c2: C.parcel,
        icon: "cube-outline",
        cta: "Book Now",
      },
    ],
    quickActions: [
      { icon: "cube-outline", label: "Parcel", color: C.parcel, bg: C.parcelLight, route: APP_ROUTES.parcel },
    ],
    tabLabel: "Parcel",
    adminDescription: "Same-day parcel & package delivery across AJK",
    adminIcon: "📦",
  },

  van: {
    key: "van",
    featureFlag: "feature_van",
    label: "Van Service",
    description: "Intercity shared van booking across AJK",
    icon: "bus-outline",
    iconFocused: "bus",
    route: APP_ROUTES.van,
    color: "#6366F1",
    colorLight: "#EEF2FF",
    gradient: ["#EEF2FF", "#E0E7FF"],
    cardGradient: ["#EEF2FF", "#E0E7FF"],
    iconGradient: ["#6366F1", "#818CF8"],
    textColor: "#3730A3",
    tagColor: "#3730A3",
    tagBg: "#C7D2FE",
    tag: "Shared",
    tagIcon: "bus-outline",
    heroConfig: {
      badgeIcon: "bus",
      badgeLabel: "Van Service",
      title: "Van",
      subtitle: "Intercity shared vans\nacross AJK region",
      stats: [
        { icon: "bus-outline", label: "Shared vans" },
        { icon: "time-outline", label: "Scheduled trips" },
      ],
      cta: "Book a Seat",
      gradient: ["#4F46E5", "#6366F1", "#818CF8"],
    },
    banners: [
      {
        title: "Van Service",
        desc: "Book a seat on shared vans across AJK — safe & affordable!",
        tag: "Intercity",
        c1: "#4F46E5",
        c2: "#6366F1",
        icon: "bus-outline",
        cta: "Book Now",
      },
    ],
    quickActions: [
      { icon: "bus-outline", label: "Van", color: "#6366F1", bg: "#EEF2FF", route: APP_ROUTES.van },
    ],
    tabLabel: "Van",
    adminDescription: "Intercity shared van booking across AJK",
    adminIcon: "🚐",
  },

  school: {
    key: "school",
    featureFlag: "feature_school",
    label: "School Transport",
    description: "Safe & scheduled school transport for students",
    icon: "school-outline",
    iconFocused: "school",
    route: APP_ROUTES.school,
    color: "#0EA5E9",
    colorLight: "#E0F2FE",
    gradient: ["#E0F2FE", "#BAE6FD"],
    cardGradient: ["#E0F2FE", "#BAE6FD"],
    iconGradient: ["#0EA5E9", "#38BDF8"],
    textColor: "#075985",
    tagColor: "#075985",
    tagBg: "#BAE6FD",
    tag: "Scheduled",
    tagIcon: "time-outline",
    heroConfig: {
      badgeIcon: "school",
      badgeLabel: "School Transport",
      title: "School Transport",
      subtitle: "Safe daily rides for\nyour children to school",
      stats: [
        { icon: "shield-checkmark-outline", label: "GPS tracked" },
        { icon: "time-outline", label: "On-time pickup" },
      ],
      cta: "Book a Route",
      gradient: ["#0284C7", "#0EA5E9", "#38BDF8"],
    },
    banners: [
      {
        title: "School Transport",
        desc: "Safe, GPS-tracked school transport for your children — affordable monthly subscriptions!",
        tag: "Students",
        c1: "#0284C7",
        c2: "#0EA5E9",
        icon: "school-outline",
        cta: "Book Now",
      },
    ],
    quickActions: [
      { icon: "school-outline", label: "School", color: "#0EA5E9", bg: "#E0F2FE", route: APP_ROUTES.school },
    ],
    tabLabel: "School",
    adminDescription: "Safe & scheduled school transport for students",
    adminIcon: "🏫",
  },
};


export const GLOBAL_QUICK_ACTIONS: {
  icon: IoniconName;
  label: string;
  color: string;
  bg: string;
  route: Href;
  service: ServiceKey | null;
}[] = [
  { icon: "time-outline", label: "Track", color: C.primary, bg: C.primarySoft, route: APP_ROUTES.orders, service: null },
  { icon: "bus-outline", label: "Van Service", color: "#6366F1", bg: "#EEF2FF", route: APP_ROUTES.van, service: null },
];

export interface BrandingOverrides {
  colorMart?: string;
  colorFood?: string;
  colorRides?: string;
  colorPharmacy?: string;
  colorParcel?: string;
  colorVan?: string;
}

export interface ServiceTextOverride {
  label?: string;
  description?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  cta?: string;
}

export type ContentOverrides = Partial<Record<ServiceKey, ServiceTextOverride>>;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

function lighten(hex: string, amount = 0.85): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function darken(hex: string, amount = 0.4): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}

function buildColorTheme(
  primary: string,
): Pick<ServiceDefinition, "color" | "colorLight" | "gradient" | "cardGradient" | "iconGradient" | "textColor" | "tagColor" | "tagBg"> {
  const light = lighten(primary, 0.87);
  const dark = darken(primary, 0.3);
  const lighter = lighten(primary, 0.93);
  return {
    color: primary,
    colorLight: light,
    gradient: [light, lighter],
    cardGradient: [light, lighter],
    iconGradient: [primary, lighten(primary, 0.3)],
    textColor: dark,
    tagColor: dark,
    tagBg: lighten(primary, 0.75),
  };
}

export function applyBrandingToRegistry(
  branding: BrandingOverrides | undefined,
): Record<ServiceKey, ServiceDefinition> {
  if (!branding) return SERVICE_REGISTRY;
  const colorMap: Partial<Record<ServiceKey, string>> = {
    ...(branding.colorMart     ? { mart:     branding.colorMart }     : {}),
    ...(branding.colorFood     ? { food:     branding.colorFood }     : {}),
    ...(branding.colorRides    ? { rides:    branding.colorRides }    : {}),
    ...(branding.colorPharmacy ? { pharmacy: branding.colorPharmacy } : {}),
    ...(branding.colorParcel   ? { parcel:   branding.colorParcel }   : {}),
    ...(branding.colorVan      ? { van:      branding.colorVan }      : {}),
  };
  const result = { ...SERVICE_REGISTRY } as Record<ServiceKey, ServiceDefinition>;
  for (const key of SERVICE_KEYS as ServiceKey[]) {
    const primary = colorMap[key];
    if (primary) {
      result[key] = { ...result[key], ...buildColorTheme(primary) };
    }
  }
  return result;
}

function applyContentOverrides(
  svc: ServiceDefinition,
  overrides?: ContentOverrides,
): ServiceDefinition {
  const o = overrides?.[svc.key];
  if (!o) return svc;
  return {
    ...svc,
    ...(o.label       ? { label: o.label }             : {}),
    ...(o.description ? { description: o.description } : {}),
    heroConfig: {
      ...svc.heroConfig,
      ...(o.heroTitle    ? { title: o.heroTitle }       : {}),
      ...(o.heroSubtitle ? { subtitle: o.heroSubtitle } : {}),
      ...(o.cta          ? { cta: o.cta }               : {}),
    },
  };
}

export function getActiveServices(
  features: Record<string, boolean>,
  branding?: BrandingOverrides,
  content?: ContentOverrides,
): ServiceDefinition[] {
  const registry = applyBrandingToRegistry(branding);
  return SERVICE_KEYS
    .filter((k) => features[k])
    .map((k) => applyContentOverrides(registry[k], content));
}

export type ServiceDefinitionWithState = ServiceDefinition & { isEnabled: boolean };

export function getAllServices(
  features: Record<string, boolean>,
  branding?: BrandingOverrides,
  content?: ContentOverrides,
): ServiceDefinitionWithState[] {
  const registry = applyBrandingToRegistry(branding);
  return SERVICE_KEYS.map((k) => ({
    ...applyContentOverrides(registry[k], content),
    isEnabled: !!features[k],
  }));
}

export function getActiveBanners(
  features: Record<string, boolean>,
  branding?: BrandingOverrides,
  content?: ContentOverrides,
) {
  const active = getActiveServices(features, branding, content);
  return active.flatMap((svc) =>
    svc.banners.map((b) => ({
      ...b,
      route: svc.route,
      service: svc.key,
    })),
  );
}

export function getActiveQuickActions(
  features: Record<string, boolean>,
  branding?: BrandingOverrides,
  content?: ContentOverrides,
) {
  const active = getActiveServices(features, branding, content);
  const serviceActions = active.flatMap((svc) =>
    svc.quickActions.map((qa) => ({ ...qa, service: svc.key as ServiceKey | null })),
  );
  const globalActions = active.length > 0 ? GLOBAL_QUICK_ACTIONS : [];
  return [...serviceActions, ...globalActions];
}

