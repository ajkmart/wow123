import React from "react";
import { Modal, Platform, TouchableOpacity, Text, View } from "react-native";
import { radii, spacing } from "@/constants/colors";
import { useTheme } from "@/context/ThemeContext";
import { useTypography } from "@/hooks/useTypography";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, title, subtitle, children }: BottomSheetProps) {
  const { colors: C } = useTheme();
  const T = useTypography();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={0.7} style={{ flex: 1, backgroundColor: C.overlay, justifyContent: "flex-end" }} onPress={onClose}>
        <TouchableOpacity activeOpacity={0.7} style={{ backgroundColor: C.surface, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, paddingHorizontal: spacing.xl, paddingBottom: Platform.OS === "web" ? 40 : 48, paddingTop: spacing.md, maxHeight: "90%" }} onPress={e => e.stopPropagation()}>
          <View style={{ width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: "center", marginBottom: spacing.xl }} />
          {title && <Text style={{ ...T.h2, color: C.text, marginBottom: 4 }}>{title}</Text>}
          {subtitle && <Text style={{ ...T.caption, color: C.textMuted, marginBottom: spacing.xl }}>{subtitle}</Text>}
          {children}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
