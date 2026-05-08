/* ── Unified Design System Tokens ─────────────────────────────
   All pages MUST use these constants so every element looks
   identical across the whole app.
─────────────────────────────────────────────────────────────── */

export const DEFAULT_COMMISSION_PCT = 15;
export const BOTTOM_PADDING = "calc(64px + max(8px, env(safe-area-inset-bottom, 8px)))";

export const BTN_PRIMARY   = "h-12 w-full bg-orange-500 text-white font-bold rounded-2xl text-base android-press flex items-center justify-center gap-2 disabled:opacity-60";
export const BTN_SECONDARY = "h-12 w-full border-2 border-gray-200 text-gray-600 font-bold rounded-2xl text-base android-press flex items-center justify-center";
export const BTN_SM        = "h-9 px-4 text-sm font-bold rounded-xl android-press min-h-0 flex items-center";
export const BTN_XS        = "h-8 px-3 text-xs font-bold rounded-xl android-press min-h-0 flex items-center";

export const INPUT  = "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-orange-400 focus:bg-white transition-colors";
export const SELECT = "w-full h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-orange-400 transition-colors appearance-none";
export const TEXTAREA = "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-base focus:outline-none focus:border-orange-400 focus:bg-white transition-colors resize-none";

export const CARD        = "bg-white rounded-2xl shadow-sm overflow-hidden";
export const CARD_HEADER = "px-4 py-3.5 border-b border-gray-100 flex items-center justify-between";
export const CARD_BODY   = "p-4";
export const ROW         = "flex items-center justify-between py-3 border-b border-gray-50 last:border-0";

export const LABEL    = "block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5";
export const STAT_VAL = "text-2xl font-extrabold leading-none";
export const STAT_LBL = "text-xs text-gray-500 font-medium mt-1";

export const BADGE_GREEN  = "text-xs font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700";
export const BADGE_ORANGE = "text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-600";
export const BADGE_BLUE   = "text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700";
export const BADGE_RED    = "text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-600";
export const BADGE_PURPLE = "text-xs font-bold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700";
export const BADGE_GRAY   = "text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600";

export const SECTION = "px-4 py-4 space-y-3";
export const PAGE    = "min-h-screen bg-gray-50";

export function fc(n: number, currencySymbol = "Rs."): string { return `${currencySymbol} ${Math.round(n).toLocaleString()}`; }
export function fd(d: string | Date): string {
  return new Date(d).toLocaleString("en-PK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}
