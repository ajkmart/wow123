import React from "react";
import { TouchableOpacity, View, type ViewStyle } from "react-native";
import { radii, shadows } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  variant?: "elevated" | "outlined" | "filled";
  padding?: number;
}

export function Card({
  children,
  style,
  onPress,
  variant = "elevated",
  padding = 16,
}: CardProps) {
  const { colors: C } = useTheme();

  const baseStyle: ViewStyle = {
    borderRadius: radii.xl,
    backgroundColor: variant === "filled" ? C.surfaceSecondary : C.surface,
    overflow: "hidden",
    padding,
    ...(variant === "elevated" ? { ...shadows.md, borderWidth: 1, borderColor: "rgba(226,232,240,0.5)" } : {}),
    ...(variant === "outlined" ? { borderWidth: 1.5, borderColor: C.border } : {}),
  };

  const cardStyle = [baseStyle, style].filter(Boolean) as ViewStyle[];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}
