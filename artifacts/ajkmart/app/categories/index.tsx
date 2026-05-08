import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSmartBack } from "@/hooks/useSmartBack";
import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { Font } from "@/constants/typography";
import { getHierarchicalCategories, useGetProducts } from "@workspace/api-client-react";

const C = Colors.light;
const { width } = Dimensions.get("window");
const SIDEBAR_W = 90;
const RIGHT_W = width - SIDEBAR_W;

type SortKey = "newest" | "popular" | "price_asc" | "price_desc" | "rating";

const SORT_OPTIONS: { key: SortKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "newest",     label: "Newest",     icon: "time-outline" },
  { key: "popular",    label: "Popular",    icon: "flame-outline" },
  { key: "price_asc",  label: "Price ↑",   icon: "trending-up-outline" },
  { key: "price_desc", label: "Price ↓",   icon: "trending-down-outline" },
  { key: "rating",     label: "Top Rated",  icon: "star-outline" },
];

export default function CategoriesBrowseScreen() {
  const insets = useSafeAreaInsets();
  const { goBack } = useSmartBack();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { type: initialType } = useLocalSearchParams<{ type?: string }>();
  const serviceType = initialType || "mart";

  const [sortBy, setSortBy] = useState<SortKey>("newest");

  const { data: categories, isLoading, refetch: refetchCats } = useQuery({
    queryKey: ["hierarchical-categories", serviceType],
    queryFn: () => getHierarchicalCategories({ type: serviceType }),
    staleTime: 5 * 60 * 1000,
  });

  const cats = categories ?? [];
  const [selectedId, setSelectedId] = useState<string>("");
  const [subFilter, setSubFilter] = useState<string | null>(null);

  useEffect(() => {
    if (cats.length > 0 && !selectedId) {
      setSelectedId(cats[0]?.id ?? "");
    }
  }, [cats]);

  useEffect(() => {
    setSubFilter(null);
  }, [selectedId]);

  const selectedCat = cats.find(c => c.id === selectedId);
  const subCategories = selectedCat?.children ?? [];

  const productType = (serviceType === "food" || serviceType === "pharmacy" || serviceType === "mart")
    ? serviceType as "food" | "pharmacy" | "mart"
    : "mart";

  const [catRefreshing, setCatRefreshing] = useState(false);
  const { data: productsData, isLoading: productsLoading, refetch: refetchProducts } = useGetProducts({
    type: productType as NonNullable<Parameters<typeof useGetProducts>[0]>["type"],
    category: subFilter ?? selectedId ?? undefined,
    sort: sortBy,
  });

  const products = productsData?.products ?? [];

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.header}>
        <TouchableOpacity activeOpacity={0.7} onPress={goBack} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {serviceType === "food" ? "Food Categories" : serviceType === "pharmacy" ? "Pharmacy" : "Categories"}
        </Text>
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/search")} style={s.searchBtn}>
          <Ionicons name="search-outline" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : cats.length === 0 ? (
        <View style={s.emptyWrap}>
          <Ionicons name="folder-open-outline" size={48} color={C.textMuted} />
          <Text style={s.emptyText}>No categories available</Text>
        </View>
      ) : (
        <View style={s.body}>
          <ScrollView
            style={s.sidebar}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          >
            {cats.map(cat => {
              const isActive = cat.id === selectedId;
              return (
                <TouchableOpacity activeOpacity={0.7}
                  key={cat.id}
                  onPress={() => setSelectedId(cat.id)}
                  style={[s.sidebarItem, isActive && s.sidebarItemActive]}
                >
                  {isActive && <View style={s.activeIndicator} />}
                  <View style={[s.sidebarIcon, isActive && s.sidebarIconActive]}>
                    <Ionicons
                      name={(cat.icon || "grid-outline") as keyof typeof Ionicons.glyphMap}
                      size={20}
                      color={isActive ? C.primary : C.textMuted}
                    />
                  </View>
                  <Text
                    style={[s.sidebarLabel, isActive && s.sidebarLabelActive]}
                    numberOfLines={2}
                  >
                    {cat.name}
                  </Text>
                  {cat.productCount > 0 && (
                    <View style={[s.countBadge, isActive && s.countBadgeActive]}>
                      <Text style={[s.sidebarCount, isActive && s.sidebarCountActive]}>
                        {cat.productCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <ScrollView
            style={s.rightPanel}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            refreshControl={<RefreshControl refreshing={catRefreshing} onRefresh={async () => { setCatRefreshing(true); await Promise.all([refetchCats(), refetchProducts()]); setCatRefreshing(false); }} tintColor={C.primary} />}
          >
            {selectedCat && (
              <View style={s.catHeader}>
                <Text style={s.catTitle}>{selectedCat.name}</Text>
                {selectedCat.productCount > 0 && (
                  <Text style={s.catCount}>{selectedCat.productCount} items</Text>
                )}
              </View>
            )}

            {subCategories.length > 0 && (
              <View style={s.subGrid}>
                {subCategories.map(sub => {
                  const subActive = subFilter === sub.id;
                  return (
                    <TouchableOpacity activeOpacity={0.7}
                      key={sub.id}
                      onPress={() => setSubFilter(subActive ? null : sub.id)}
                      style={[s.subCard, subActive && s.subCardActive]}
                    >
                      <View style={[s.subIcon, subActive && s.subIconActive]}>
                        <Ionicons
                          name={(sub.icon || "grid-outline") as keyof typeof Ionicons.glyphMap}
                          size={22}
                          color={subActive ? C.textInverse : C.primary}
                        />
                      </View>
                      <Text style={[s.subName, subActive && s.subNameActive]} numberOfLines={2}>{sub.name}</Text>
                      {sub.productCount > 0 && (
                        <Text style={s.subCount}>{sub.productCount}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {subCategories.length > 0 && <View style={s.divider} />}

            <View style={s.productsHeader}>
              <Text style={s.productsTitle}>
                {subCategories.length > 0 ? "All Products" : "Products"}
              </Text>
              <Text style={s.productsCountBadge}>{products.length}</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.sortRow}
            >
              {SORT_OPTIONS.map(opt => {
                const active = sortBy === opt.key;
                return (
                  <TouchableOpacity activeOpacity={0.7}
                    key={opt.key}
                    onPress={() => setSortBy(opt.key)}
                    style={[s.sortPill, active && s.sortPillActive]}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={12}
                      color={active ? C.textInverse : C.textMuted}
                    />
                    <Text style={[s.sortPillText, active && s.sortPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {productsLoading ? (
              <View style={s.productsLoadingWrap}>
                <ActivityIndicator color={C.primary} size="small" />
              </View>
            ) : products.length === 0 ? (
              <View style={s.productsEmptyWrap}>
                <Ionicons name="cube-outline" size={36} color={C.border} />
                <Text style={s.productsEmptyText}>No products in this category</Text>
              </View>
            ) : (
              <View style={s.productsList}>
                {products.map(product => {
                  const hasDiscount = product.originalPrice && Number(product.originalPrice) > Number(product.price);
                  const discountPct = hasDiscount
                    ? Math.round(((Number(product.originalPrice) - Number(product.price)) / Number(product.originalPrice)) * 100)
                    : 0;
                  return (
                    <TouchableOpacity activeOpacity={0.7}
                      key={product.id}
                      onPress={() => router.push({ pathname: "/product/[id]", params: { id: product.id } })}
                      style={s.productCard}
                    >
                      <View style={s.productImg}>
                        {product.image ? (
                          <Image source={{ uri: product.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        ) : (
                          <Ionicons name="cube-outline" size={24} color={C.textMuted} />
                        )}
                        {discountPct > 0 && (
                          <View style={s.discBadge}>
                            <Text style={s.discBadgeText}>{discountPct}%</Text>
                          </View>
                        )}
                      </View>
                      <View style={s.productInfo}>
                        <Text style={s.productName} numberOfLines={2}>{product.name}</Text>
                        {product.unit && <Text style={s.productUnit}>{product.unit}</Text>}
                        <View style={s.productFooter}>
                          <View>
                            <Text style={s.productPrice}>Rs. {product.price}</Text>
                            {hasDiscount && (
                              <Text style={s.productOldPrice}>Rs. {product.originalPrice}</Text>
                            )}
                          </View>
                          {product.rating != null && (
                            <View style={s.ratingBadge}>
                              <Ionicons name="star" size={10} color="#F59E0B" />
                              <Text style={s.ratingText}>{product.rating}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.surface,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: {
    flex: 1, fontFamily: Font.bold, fontSize: 18, color: C.text,
  },
  searchBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontFamily: Font.medium, fontSize: 14, color: C.textMuted },

  body: { flex: 1, flexDirection: "row" },

  sidebar: {
    width: SIDEBAR_W,
    backgroundColor: C.surfaceSecondary,
    borderRightWidth: 1,
    borderRightColor: C.border,
  },
  sidebarItem: {
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    position: "relative",
  },
  sidebarItemActive: { backgroundColor: C.surface },
  activeIndicator: {
    position: "absolute",
    left: 0, top: 8, bottom: 8,
    width: 3,
    backgroundColor: C.primary,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  sidebarIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.background,
    alignItems: "center", justifyContent: "center",
    marginBottom: 6,
  },
  sidebarIconActive: { backgroundColor: C.primarySoft || "#EEF2FF" },
  sidebarLabel: {
    fontFamily: Font.medium, fontSize: 10,
    color: C.textMuted, textAlign: "center",
    lineHeight: 13,
  },
  sidebarLabelActive: { fontFamily: Font.bold, color: C.primary },
  countBadge: {
    marginTop: 3,
    backgroundColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  countBadgeActive: { backgroundColor: C.primarySoft || "#EEF2FF" },
  sidebarCount: { fontFamily: Font.bold, fontSize: 9, color: C.textMuted },
  sidebarCountActive: { color: C.primary },

  rightPanel: { flex: 1, backgroundColor: C.surface },

  catHeader: {
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  catTitle: { fontFamily: Font.bold, fontSize: 16, color: C.text },
  catCount: { fontFamily: Font.regular, fontSize: 12, color: C.textMuted },

  subGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 10, gap: 8,
    paddingBottom: 4,
  },
  subCard: {
    width: (RIGHT_W - 20 - 16) / 3,
    alignItems: "center", paddingVertical: 12, paddingHorizontal: 4,
    backgroundColor: C.background, borderRadius: 14,
    borderWidth: 1, borderColor: C.borderLight || C.border,
  },
  subCardActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  subIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: C.primarySoft || "#EEF2FF",
    alignItems: "center", justifyContent: "center",
    marginBottom: 6,
  },
  subIconActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  subName: {
    fontFamily: Font.medium, fontSize: 10,
    color: C.text, textAlign: "center", lineHeight: 13,
  },
  subNameActive: {
    color: C.textInverse,
    fontFamily: Font.bold,
  },
  subCount: { fontFamily: Font.regular, fontSize: 9, color: C.textMuted, marginTop: 2 },

  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 14, marginVertical: 10 },

  productsHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 6,
  },
  productsTitle: { fontFamily: Font.bold, fontSize: 14, color: C.text },
  productsCountBadge: {
    fontFamily: Font.bold, fontSize: 11, color: C.textInverse,
    backgroundColor: C.primary,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 10, overflow: "hidden",
  },

  sortRow: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 6,
    flexDirection: "row",
  },
  sortPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: C.surfaceSecondary,
    borderWidth: 1,
    borderColor: C.border,
  },
  sortPillActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  sortPillText: {
    fontFamily: Font.medium,
    fontSize: 11,
    color: C.textMuted,
  },
  sortPillTextActive: {
    color: C.textInverse,
    fontFamily: Font.bold,
  },

  productsLoadingWrap: { paddingVertical: 40, alignItems: "center" },
  productsEmptyWrap: { paddingVertical: 40, alignItems: "center", gap: 8 },
  productsEmptyText: { fontFamily: Font.regular, fontSize: 13, color: C.textMuted },

  productsList: { paddingHorizontal: 10, gap: 8, paddingBottom: 10 },
  productCard: {
    flexDirection: "row", backgroundColor: C.background,
    borderRadius: 14, overflow: "hidden",
    borderWidth: 1, borderColor: C.borderLight || C.border,
  },
  productImg: {
    width: 80, height: 80,
    backgroundColor: C.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
  },
  discBadge: {
    position: "absolute", top: 4, left: 4,
    backgroundColor: "#EF4444",
    borderRadius: 6,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  discBadgeText: { fontFamily: Font.bold, fontSize: 9, color: "#fff" },
  productInfo: { flex: 1, padding: 10, justifyContent: "center" },
  productName: { fontFamily: Font.semiBold, fontSize: 13, color: C.text, marginBottom: 2 },
  productUnit: { fontFamily: Font.regular, fontSize: 11, color: C.textMuted, marginBottom: 4 },
  productFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  productPrice: { fontFamily: Font.bold, fontSize: 14, color: C.primary },
  productOldPrice: {
    fontFamily: Font.regular, fontSize: 11,
    color: C.textMuted, textDecorationLine: "line-through",
  },
  ratingBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8,
  },
  ratingText: { fontFamily: Font.semiBold, fontSize: 10, color: "#D97706" },
});
