import React from "react";
import { TouchableOpacity, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, subtitle, actionLabel, onAction }: SectionHeaderProps) {
  const { colors: C } = useTheme();
  const T = useTypography();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md }}>
      <View style={{ flex: 1 }}>
        <Text style={{ ...T.h3, color: C.text }}>{title}</Text>
        {subtitle && <Text style={{ ...T.caption, color: C.textMuted, marginTop: 2 }}>{subtitle}</Text>}
      </View>
      {actionLabel && onAction && (
        <TouchableOpacity activeOpacity={0.7} onPress={onAction} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ ...T.captionMedium, color: C.primary }}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={C.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}
