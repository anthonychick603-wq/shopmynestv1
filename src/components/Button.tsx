import React from "react";
import { StyleSheet, Text, TouchableOpacity, ViewStyle, TextStyle, ActivityIndicator } from "react-native";
import { colors, radius, spacing, shadows } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

type Props = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  testID?: string;
};

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  style,
  textStyle,
  testID,
}: Props) {
  const isDisabled = disabled || loading;
  // v1.0.69 — every button press gets a subtle haptic. Ghost and outline
  // buttons use a lighter selection tick; primary/secondary use a medium
  // impact so real CTAs feel more decisive than a secondary tap.
  const handlePress = React.useCallback(() => {
    if (isDisabled) return;
    if (variant === "primary" || variant === "secondary") {
      haptics.press();
    } else {
      haptics.tap();
    }
    onPress?.();
  }, [isDisabled, onPress, variant]);
  return (
    <TouchableOpacity
      testID={testID}
      onPress={handlePress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[
        styles.base,
        sizeStyles[size].container,
        variantStyles[variant].container,
        isDisabled && styles.disabled,
        variant === "primary" && shadows.card,
        style,
      ]}
     accessibilityRole="button">
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.onBrand : colors.brand} />
      ) : (
        <Text style={[styles.text, sizeStyles[size].text, variantStyles[variant].text, textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  text: {
    fontWeight: "700",
  },
  disabled: { opacity: 0.5 },
});

const sizeStyles = {
  sm: StyleSheet.create({
    container: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, minHeight: 40 },
    text: { fontSize: 13 },
  }),
  md: StyleSheet.create({
    container: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, minHeight: 48 },
    text: { fontSize: 15 },
  }),
  lg: StyleSheet.create({
    container: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, minHeight: 56 },
    text: { fontSize: 17 },
  }),
} as const;

const variantStyles = {
  primary: StyleSheet.create({
    container: { backgroundColor: colors.brand },
    text: { color: colors.onBrand },
  }),
  secondary: StyleSheet.create({
    container: { backgroundColor: colors.surfaceTertiary },
    text: { color: colors.onSurface },
  }),
  outline: StyleSheet.create({
    container: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.brand },
    text: { color: colors.brand },
  }),
  ghost: StyleSheet.create({
    container: { backgroundColor: "transparent" },
    text: { color: colors.brand },
  }),
} as const;
