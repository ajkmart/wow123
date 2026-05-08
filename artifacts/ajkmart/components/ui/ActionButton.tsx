import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  AccessibilityRole,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { radii, shadows } from "@/constants/colors";
import { useFontSize } from "@/context/FontSizeContext";
import { useTheme } from "@/context/ThemeContext";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
}

const SIZE_MAP: Record<Size, { h: number; px: number; iconSize: number }> = {
  sm: { h: 38, px: 14, iconSize: 16 },
  md: { h: 48, px: 20, iconSize: 18 },
  lg: { h: 54, px: 24, iconSize: 20 },
};

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityHint,
}: ActionButtonProps) {
  const { colors: C } = useTheme();
  const { fontScale } = useFontSize();

  const VARIANT_STYLES: Record<Variant, { bg: string; text: string; border?: string }> = {
    primary: { bg: C.primary, text: "#FFFFFF" },
    secondary: { bg: C.primarySoft, text: C.primary },
    outline: { bg: "transparent", text: C.primary, border: C.primary },
    ghost: { bg: "transparent", text: C.textSecondary },
    danger: { bg: C.danger, text: "#FFFFFF" },
  };

  const v = VARIANT_STYLES[variant];
  const s = SIZE_MAP[size];
  const isDisabled = disabled || loading;

  const buttonFontSize = size === "sm" ? Math.round(13 * fontScale * 10) / 10 : Math.round(15 * fontScale * 10) / 10;
  const buttonLineHeight = size === "sm" ? Math.round(18 * fontScale * 10) / 10 : Math.round(20 * fontScale * 10) / 10;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        {
          height: s.h,
          paddingHorizontal: s.px,
          backgroundColor: v.bg,
          borderRadius: radii.lg,
          opacity: isDisabled ? 0.55 : 1,
        },
        v.border ? { borderWidth: 1.5, borderColor: v.border } : null,
        fullWidth ? { width: "100%" } : null,
        variant === "primary" ? shadows.md : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <View style={styles.inner}>
          {icon && <Ionicons name={icon} size={s.iconSize} color={v.text} />}
          <Text
            style={{
              fontFamily: "Inter_600SemiBold",
              fontSize: buttonFontSize,
              lineHeight: buttonLineHeight,
              color: v.text,
            }}
          >
            {label}
          </Text>
          {iconRight && <Ionicons name={iconRight} size={s.iconSize} color={v.text} />}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
