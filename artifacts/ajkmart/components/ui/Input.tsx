import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { radii } from "@/constants/colors";
import { useFontSize } from "@/context/FontSizeContext";
import { useTheme } from "@/context/ThemeContext";

interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  success?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  isPassword?: boolean;
  maxLength?: number;
  showCharCount?: boolean;
  clearable?: boolean;
  onClear?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: "search" | "text" | "none";
}

export function Input({
  label,
  hint,
  error,
  success,
  leftIcon,
  leftElement,
  rightElement,
  isPassword,
  maxLength,
  showCharCount,
  clearable,
  onClear,
  value,
  style,
  accessibilityLabel,
  accessibilityRole,
  ...props
}: InputProps) {
  const { colors: C } = useTheme();
  const { fontScale } = useFontSize();
  const [showPwd, setShowPwd] = useState(false);
  const hasError = !!error;
  const hasSuccess = !!success;

  const charCount = value?.length ?? 0;
  const showClear = clearable && charCount > 0;

  const derivedAccessibilityLabel = accessibilityLabel ?? label ?? (props.placeholder ? String(props.placeholder) : "Input field");

  const scaledBodyMedium = {
    fontFamily: "Inter_500Medium" as const,
    fontSize: Math.round(14 * fontScale * 10) / 10,
    lineHeight: Math.round(20 * fontScale * 10) / 10,
  };
  const scaledCaptionMedium = {
    fontFamily: "Inter_500Medium" as const,
    fontSize: Math.round(12 * fontScale * 10) / 10,
    lineHeight: Math.round(16 * fontScale * 10) / 10,
  };
  const scaledSmall = {
    fontFamily: "Inter_400Regular" as const,
    fontSize: Math.round(11 * fontScale * 10) / 10,
    lineHeight: Math.round(14 * fontScale * 10) / 10,
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[scaledCaptionMedium, { color: C.textSecondary, marginBottom: 6 }]}>
          {label}
        </Text>
      )}
      <View
        style={[
          styles.inputWrapper,
          { borderColor: C.border, backgroundColor: C.surfaceSecondary },
          hasError && { borderColor: C.danger, backgroundColor: C.dangerSoft },
          hasSuccess && { borderColor: C.success, backgroundColor: C.successSoft },
        ]}
      >
        {leftElement && (
          <View style={[styles.leftElement, { backgroundColor: C.surface, borderRightColor: C.border }]}>
            {leftElement}
          </View>
        )}
        {leftIcon && !leftElement && (
          <View style={styles.leftIconWrap}>
            <Ionicons
              name={leftIcon}
              size={18}
              color={hasError ? C.danger : hasSuccess ? C.success : C.textMuted}
            />
          </View>
        )}
        <TextInput
          style={[scaledBodyMedium, styles.input, { color: C.text }, style]}
          placeholderTextColor={C.textMuted}
          secureTextEntry={isPassword && !showPwd}
          value={value}
          maxLength={maxLength}
          accessibilityLabel={derivedAccessibilityLabel}
          accessibilityHint={error ? `Error: ${error}` : hint}
          accessibilityRole={accessibilityRole ?? "text"}
          {...props}
        />
        {showClear && !isPassword && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (onClear) onClear();
              else if (props.onChangeText) props.onChangeText("");
            }}
            style={styles.clearBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label ?? "input"}`}
          >
            <Ionicons name="close-circle" size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}
        {isPassword && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowPwd((v) => !v)}
            style={styles.eyeBtn}
            accessibilityRole="button"
            accessibilityLabel={showPwd ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={showPwd ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={C.textMuted}
            />
          </TouchableOpacity>
        )}
        {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
      </View>
      <View style={styles.footer}>
        {error ? (
          <View style={styles.feedbackRow}>
            <Ionicons name="alert-circle" size={13} color={C.danger} />
            <Text style={[scaledSmall, { color: C.danger }]}>{error}</Text>
          </View>
        ) : success ? (
          <View style={styles.feedbackRow}>
            <Ionicons name="checkmark-circle" size={13} color={C.success} />
            <Text style={[scaledSmall, { color: C.success }]}>{success}</Text>
          </View>
        ) : hint ? (
          <Text style={[scaledSmall, { color: C.textMuted }]}>{hint}</Text>
        ) : (
          <View />
        )}
        {showCharCount && maxLength && (
          <Text style={[scaledSmall, { color: charCount >= maxLength ? C.danger : C.textMuted, marginLeft: 8 }]}>
            {charCount}/{maxLength}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  leftElement: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRightWidth: 1,
  },
  leftIconWrap: {
    paddingLeft: 14,
  },
  rightElement: {
    paddingRight: 14,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingLeft: 2,
    minHeight: 16,
  },
  feedbackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
});
