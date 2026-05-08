export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  picked_up: "Picked Up",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "out_for_delivery", "picked_up", "cancelled"],
  ready: ["picked_up", "out_for_delivery", "delivered", "cancelled"],
  picked_up: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export type SortKey = "id" | "customer" | "type" | "total" | "status" | "date";
export type SortDir = "asc" | "desc";

export const PAGE_SIZES = [10, 25, 50];

export const isTerminal = (s: string) => s === "delivered" || s === "cancelled";
export const canCancel = (o: any) => !isTerminal(o.status);
export const allowedNext = (o: any) => ALLOWED_TRANSITIONS[o.status] ?? [];

export function escapeCSV(val: string): string {
  let safe = val;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = "'" + safe;
  }
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportOrdersCSV(orders: any[]) {
  const header = "ID,Type,Status,Total,Payment,Customer,Rider,Date";
  const rows = orders.map((o: any) =>
    [
      escapeCSV(o.id),
      escapeCSV(o.type || ""),
      escapeCSV(o.status || ""),
      String(o.total ?? ""),
      escapeCSV(o.paymentMethod || ""),
      escapeCSV(o.userName || ""),
      escapeCSV(o.riderName || ""),
      escapeCSV(o.createdAt?.slice(0, 10) || ""),
    ].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
