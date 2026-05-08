import type { TranslationKey } from "@workspace/i18n";
import Colors from "@/constants/colors";
export {
  ORDER_VALID_STATUSES, RIDE_VALID_STATUSES, PARCEL_VALID_STATUSES, PHARMACY_ORDER_VALID_STATUSES,
  type OrderStatus, type RideStatus, type ParcelStatus, type PharmacyOrderStatus,
  getSocketRoom,
} from "@workspace/service-constants";

const C = Colors.light;

export type StatusConfig = {
  color: string;
  bg: string;
  icon: string;
  labelKey: TranslationKey;
};

export const ORDER_STATUS_MAP: Record<string, StatusConfig> = {
  pending:          { color: C.amber, bg: C.amberSoft, icon: "time-outline",                  labelKey: "pending" },
  confirmed:        { color: C.brandBlue, bg: C.brandBlueSoft, icon: "checkmark-circle-outline",  labelKey: "confirmed" },
  preparing:        { color: C.purple, bg: C.purpleSoft, icon: "flame-outline",               labelKey: "preparing" },
  ready:            { color: C.indigo, bg: C.indigoSoft, icon: "bag-check-outline",           labelKey: "readyForPickup" },
  picked_up:        { color: C.cyan, bg: C.cyanSoft, icon: "cube-outline",                labelKey: "pickedUp" },
  out_for_delivery: { color: C.emerald, bg: C.emeraldSoft, icon: "bicycle-outline",            labelKey: "onTheWay" },
  delivered:        { color: C.gray, bg: C.graySoft, icon: "checkmark-done-outline",     labelKey: "delivered" },
  cancelled:        { color: C.red, bg: C.redSoft, icon: "close-circle-outline",       labelKey: "cancelled" },
};

export const RIDE_STATUS_MAP: Record<string, StatusConfig> = {
  searching:   { color: C.amber, bg: C.amberSoft, icon: "search-outline",             labelKey: "searching" },
  bargaining:  { color: C.brandBlue, bg: C.brandBlueSoft, icon: "swap-horizontal-outline",   labelKey: "bargaining" },
  accepted:    { color: C.brandBlue, bg: C.brandBlueSoft, icon: "person-outline",             labelKey: "statusAccepted" },
  arrived:     { color: C.purple, bg: C.purpleSoft, icon: "location-outline",           labelKey: "arrived" },
  in_transit:  { color: C.emerald, bg: C.emeraldSoft, icon: "car-outline",                labelKey: "inTransit" },
  ongoing:     { color: C.brandBlue, bg: C.brandBlueSoft, icon: "navigate-outline",        labelKey: "onTheWay" },
  completed:   { color: C.gray, bg: C.graySoft, icon: "checkmark-done-outline",     labelKey: "completed" },
  cancelled:   { color: C.red, bg: C.redSoft, icon: "close-circle-outline",       labelKey: "cancelled" },
};

export const PARCEL_STATUS_MAP: Record<string, StatusConfig> = {
  pending:    { color: C.amber, bg: C.amberSoft, icon: "time-outline",               labelKey: "pending" },
  accepted:   { color: C.brandBlue, bg: C.brandBlueSoft, icon: "person-outline",             labelKey: "statusAccepted" },
  in_transit: { color: C.emerald, bg: C.emeraldSoft, icon: "cube-outline",               labelKey: "inTransit" },
  completed:  { color: C.gray, bg: C.graySoft, icon: "checkmark-done-outline",     labelKey: "delivered" },
  cancelled:  { color: C.red, bg: C.redSoft, icon: "close-circle-outline",       labelKey: "cancelled" },
};

export const ORDER_STEPS = ["pending", "confirmed", "preparing", "out_for_delivery", "delivered"];
export const PARCEL_STEPS = ["pending", "accepted", "in_transit", "completed"];
export const RIDE_STEPS = ["searching", "accepted", "arrived", "in_transit", "completed"];

export type OrderType = "mart" | "food" | "ride" | "pharmacy" | "parcel";

export function getOrderStatusConfig(status: string, orderType?: string): StatusConfig {
  if (orderType === "ride") {
    return RIDE_STATUS_MAP[status] ?? RIDE_STATUS_MAP["searching"]!;
  }
  if (orderType === "parcel") {
    return PARCEL_STATUS_MAP[status] ?? PARCEL_STATUS_MAP["pending"]!;
  }
  return ORDER_STATUS_MAP[status] ?? ORDER_STATUS_MAP["pending"]!;
}
