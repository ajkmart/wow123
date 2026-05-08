import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";

interface LoadingStateProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingState({ message, fullScreen = false }: LoadingStateProps) {
  const { colors: C } = useTheme();
  const T = useTypography();

  return (
    <View style={[{ alignItems: "center", justifyContent: "center", padding: 40 }, fullScreen && { flex: 1, backgroundColor: C.background }]}>
      <ActivityIndicator size="large" color={C.primary} />
      {message && <Text style={{ ...T.body, color: C.textMuted, marginTop: 16, textAlign: "center" }}>{message}</Text>}
    </View>
  );
}
