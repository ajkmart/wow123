export type ServiceKey = "mart" | "food" | "rides" | "pharmacy" | "parcel" | "van" | "school";

export const SERVICE_KEYS: ServiceKey[] = ["mart", "food", "rides", "pharmacy", "parcel", "van", "school"];

export interface ServiceMetadata {
  key: ServiceKey;
  featureFlag: string;
  label: string;
  description: string;
  adminIcon: string;
  color: string;
  colorLight: string;
}

export const SERVICE_METADATA: Record<ServiceKey, ServiceMetadata> = {
  mart: {
    key: "mart",
    featureFlag: "feature_mart",
    label: "Grocery Mart",
    description: "Grocery & essentials marketplace with 500+ products",
    adminIcon: "🛒",
    color: "#00C48C",
    colorLight: "#E5F9F2",
  },
  food: {
    key: "food",
    featureFlag: "feature_food",
    label: "Food Delivery",
    description: "Restaurant food ordering & delivery service",
    adminIcon: "🍔",
    color: "#FF9500",
    colorLight: "#FFF4E5",
  },
  rides: {
    key: "rides",
    featureFlag: "feature_rides",
    label: "Rides",
    description: "Bike & car ride booking with live tracking",
    adminIcon: "🚗",
    color: "#00C48C",
    colorLight: "#E5F9F2",
  },
  pharmacy: {
    key: "pharmacy",
    featureFlag: "feature_pharmacy",
    label: "Pharmacy",
    description: "On-demand medicine delivery with prescriptions",
    adminIcon: "💊",
    color: "#AF52DE",
    colorLight: "#F5E6FF",
  },
  parcel: {
    key: "parcel",
    featureFlag: "feature_parcel",
    label: "Parcel Delivery",
    description: "Same-day parcel & package delivery across AJK",
    adminIcon: "📦",
    color: "#FF6B35",
    colorLight: "#FFF0EB",
  },
  van: {
    key: "van",
    featureFlag: "feature_van",
    label: "Van Service",
    description: "Intercity shared van booking across AJK",
    adminIcon: "🚐",
    color: "#6366F1",
    colorLight: "#EEF2FF",
  },
  school: {
    key: "school",
    featureFlag: "feature_school",
    label: "School Transport",
    description: "Safe & scheduled school transport for students",
    adminIcon: "🏫",
    color: "#0EA5E9",
    colorLight: "#E0F2FE",
  },
};

export const ADMIN_SERVICE_LIST = SERVICE_KEYS.map((k) => ({
  key: k,
  label: SERVICE_METADATA[k].label,
  description: SERVICE_METADATA[k].description,
  icon: SERVICE_METADATA[k].adminIcon,
  setting: SERVICE_METADATA[k].featureFlag,
  color: SERVICE_METADATA[k].color,
  colorLight: SERVICE_METADATA[k].colorLight,
}));

/**
 * Returns the socket.io room name for an order.
 * Ride and parcel orders join `ride:{id}`; all other services join `order:{id}`.
 * Used by both the API server (emit targets) and the frontend (subscribe room).
 */
export function getSocketRoom(orderId: string, orderType: string): string {
  return orderType === "ride" || orderType === "parcel"
    ? `ride:${orderId}`
    : `order:${orderId}`;
}

/* Shared order status enumerations — single source of truth for API validation and frontend display */

export const ORDER_VALID_STATUSES = [
  "pending", "confirmed", "preparing", "ready", "picked_up",
  "out_for_delivery", "delivered", "cancelled",
] as const;
export type OrderStatus = typeof ORDER_VALID_STATUSES[number];

export const RIDE_VALID_STATUSES = [
  "searching", "bargaining", "accepted", "arrived",
  "in_transit", "ongoing", "completed", "cancelled",
] as const;
export type RideStatus = typeof RIDE_VALID_STATUSES[number];

export const PARCEL_VALID_STATUSES = [
  "pending", "accepted", "in_transit", "completed", "cancelled",
] as const;
export type ParcelStatus = typeof PARCEL_VALID_STATUSES[number];

export const PHARMACY_ORDER_VALID_STATUSES = [
  "pending", "confirmed", "preparing", "ready", "picked_up",
  "out_for_delivery", "delivered", "cancelled",
] as const;
export type PharmacyOrderStatus = typeof PHARMACY_ORDER_VALID_STATUSES[number];
