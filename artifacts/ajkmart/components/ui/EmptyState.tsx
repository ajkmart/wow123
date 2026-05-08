import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { radii, spacing } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";
import { ActionButton } from "./ActionButton";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon,
  emoji,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { colors: C } = useTheme();
  const T = useTypography();

  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: spacing.xxxl }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.surfaceSecondary, alignItems: "center", justifyContent: "center", marginBottom: spacing.xl }}>
        {emoji ? (
          <Text style={{ fontSize: 44 }}>{emoji}</Text>
        ) : icon ? (
          <Ionicons name={icon} size={44} color={C.textMuted} />
        ) : null}
      </View>
      <Text style={{ ...T.h3, color: C.text, textAlign: "center", marginBottom: spacing.sm }}>{title}</Text>
      {subtitle && <Text style={{ ...T.body, color: C.textMuted, textAlign: "center", lineHeight: 21 }}>{subtitle}</Text>}
      {actionLabel && onAction && (
        <View style={{ marginTop: spacing.lg, width: "100%", maxWidth: 200 }}>
          <ActionButton label={actionLabel} onPress={onAction} size="sm" />
        </View>
      )}
    </View>
  );
}
