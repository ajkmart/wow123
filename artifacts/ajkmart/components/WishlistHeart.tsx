import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, TouchableOpacity, StyleSheet, Alert, type StyleProp, type ViewStyle } from "react-native";
import { useQueryClient, useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { addToWishlist, removeFromWishlist, getWishlist, type WishlistItem } from "@workspace/api-client-react";
import { AuthGateSheet, useAuthGate } from "@/components/AuthGateSheet";

const C = Colors.light;

const PENDING_KEY_PREFIX = "@ajkmart_pending_wishlist_";

export function WishlistHeart({
  productId,
  size = 18,
  style,
  initialState,
}: {
  productId: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  initialState?: boolean;
}) {
  const { user, token, isCustomer } = useAuth();
  const isLoggedIn = !!user && !!token;
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const { requireAuth, sheetProps } = useAuthGate();
  const pendingFiredRef = useRef(false);

  const { data: wishlistItems } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => getWishlist(),
    enabled: isLoggedIn && isCustomer,
    staleTime: 60 * 1000,
  });

  const isInWishlistFromCache = wishlistItems?.some((item: WishlistItem) => item.productId === productId) ?? false;
  const [localOverride, setLocalOverride] = useState<boolean | null>(null);
  const isInWishlist = localOverride !== null ? localOverride : (initialState !== undefined ? initialState : isInWishlistFromCache);

  useEffect(() => {
    setLocalOverride(null);
  }, [isInWishlistFromCache]);

  useEffect(() => {
    if (!isLoggedIn || !isCustomer || pendingFiredRef.current) return;
    const key = `${PENDING_KEY_PREFIX}${productId}`;
    AsyncStorage.getItem(key).then(async (val) => {
      if (val !== "1") return;
      pendingFiredRef.current = true;
      await AsyncStorage.removeItem(key).catch(() => {});
      if (!isInWishlistFromCache) {
        setLocalOverride(true);
        try {
          await addToWishlist(productId);
          queryClient.invalidateQueries({ queryKey: ["wishlist"] });
        } catch {
          setLocalOverride(null);
        }
      }
    }).catch(() => {});
  }, [isLoggedIn, isCustomer, productId]);

  const toggle = useCallback(async () => {
    if (!isLoggedIn) {
      const key = `${PENDING_KEY_PREFIX}${productId}`;
      await AsyncStorage.setItem(key, "1").catch(() => {});
      requireAuth(() => {}, { message: "Sign in to save items to your wishlist" });
      return;
    }
    if (!isCustomer) {
      return;
    }
    if (loading) return;
    setLoading(true);
    const was = isInWishlist;
    setLocalOverride(!was);
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
    ]).start();
    try {
      if (was) {
        await removeFromWishlist(productId);
      } else {
        await addToWishlist(productId);
      }
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (err: unknown) {
      setLocalOverride(was);
      const code = (err as any)?.code ?? (err as any)?.data?.code;
      if (code !== "ROLE_DENIED") {
        Alert.alert("Wishlist Error", "Could not update wishlist. Please try again.");
      }
    }
    setLoading(false);
  }, [isLoggedIn, isCustomer, productId, isInWishlist, loading, queryClient]);

  if (isLoggedIn && !isCustomer) {
    return null;
  }

  return (
    <>
      <AuthGateSheet {...sheetProps} />
      <Animated.View style={[{ transform: [{ scale: heartScale }] }, style]}>
        <TouchableOpacity activeOpacity={0.7}
          onPress={(e) => { e?.stopPropagation?.(); toggle(); }}
          style={s.btn}
          hitSlop={6}
        >
          <Ionicons
            name={isInWishlist ? "heart" : "heart-outline"}
            size={size}
            color={isInWishlist ? C.danger : "rgba(255,255,255,0.9)"}
          />
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center", justifyContent: "center",
  },
});
