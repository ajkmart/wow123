import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Redirect shim: `/order?orderId=X&type=Y` → `/orders/X?type=Y`
 * Maintains backward compatibility for any old links or cached navigation state.
 */
export default function OrderRedirect() {
  const { orderId, type, action } = useLocalSearchParams<{ orderId?: string; type?: string; action?: string }>();

  if (orderId) {
    const params: Record<string, string> = { id: orderId };
    if (type) params["type"] = type;
    if (action) params["action"] = action;
    return <Redirect href={{ pathname: "/orders/[id]", params: { ...params, id: orderId } }} />;
  }

  return <Redirect href="/(tabs)/orders" />;
}
