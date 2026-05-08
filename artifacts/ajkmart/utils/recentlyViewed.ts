import AsyncStorage from "@react-native-async-storage/async-storage";

export const RECENTLY_VIEWED_KEY = "recently_viewed_products";
const MAX_ITEMS = 20;

export interface RecentItem {
  id: string;
  name: string;
  image: string | null;
  price: number;
  originalPrice?: number;
}

export async function addRecentItem(item: RecentItem): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    let items: RecentItem[] = [];
    try { items = raw ? JSON.parse(raw) : []; } catch {}
    items = [item, ...items.filter(i => i.id !== item.id)].slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(items));
  } catch {}
}

export async function getRecentItems(): Promise<RecentItem[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  } catch {
    return [];
  }
}

export async function clearRecentItems(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENTLY_VIEWED_KEY);
  } catch {}
}
