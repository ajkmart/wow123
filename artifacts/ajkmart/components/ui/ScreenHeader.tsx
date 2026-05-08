import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, TouchableOpacity, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, shadows } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  transparent?: boolean;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  rightElement,
  transparent = false,
}: ScreenHeaderProps) {
  const { colors: C } = useTheme();
  const T = useTypography();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View
      style={[
        { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, paddingTop: topPad + 12 },
        !transparent && { backgroundColor: C.surface, ...shadows.sm },
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        {onBack && (
          <TouchableOpacity activeOpacity={0.7} onPress={onBack} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(241,245,249,0.9)", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="chevron-back" size={22} color={transparent ? "#fff" : C.text} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[{ ...T.h3, color: C.text }, transparent && { color: "#fff" }]}>{title}</Text>
          {subtitle && (
            <Text style={[{ ...T.caption, color: C.textMuted, marginTop: 2 }, transparent && { color: "rgba(255,255,255,0.8)" }]}>
              {subtitle}
            </Text>
          )}
        </View>
        {rightElement}
      </View>
    </View>
  );
}
