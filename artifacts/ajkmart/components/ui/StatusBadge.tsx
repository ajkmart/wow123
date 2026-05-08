import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { radii } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "sm" | "md";
}

export function StatusBadge({ label, variant = "neutral", icon, size = "sm" }: StatusBadgeProps) {
  const { colors: C } = useTheme();
  const T = useTypography();
  const isSm = size === "sm";

  const VARIANT_MAP: Record<BadgeVariant, { bg: string; text: string }> = {
    success: { bg: C.successSoft, text: C.success },
    warning: { bg: C.warningSoft, text: "#B45309" },
    danger: { bg: C.dangerSoft, text: C.danger },
    info: { bg: C.primarySoft, text: C.primary },
    neutral: { bg: "#F1F5F9", text: C.textSecondary },
  };

  const v = VARIANT_MAP[variant];

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radii.full, alignSelf: "flex-start", backgroundColor: v.bg, paddingHorizontal: isSm ? 8 : 10, paddingVertical: isSm ? 3 : 5 }}>
      {icon && <Ionicons name={icon} size={isSm ? 11 : 13} color={v.text} />}
      <Text style={[isSm ? T.small : T.captionMedium, { color: v.text }]}>{label}</Text>
    </View>
  );
}
