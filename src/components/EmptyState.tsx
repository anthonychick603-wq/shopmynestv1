import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { Button } from "./Button";

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * Optional secondary link-style action rendered under the primary
   * button. Great for "or, learn more" style escapes.
   */
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
  /**
   * When true, uses tighter vertical padding — useful when embedded
   * inside another card, tab, or list.
   */
  compact?: boolean;
};

// v1.0.224 — Empty state, refined.
//
// The prior empty state used a small terracotta icon on a peach circle
// and a semibold 18pt title. Reading the design brief and the
// screenshots, the app needed a warmer, more aspirational treatment:
//   • Larger icon halo with a soft two-tone fill so it looks intentional
//     instead of "we forgot a graphic here".
//   • Real h1 title (24/30 800) with tight tracking.
//   • Muted body copy at body size, not caption.
//   • Optional secondary text-link action.
export function EmptyState({
  icon = "leaf-outline",
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  testID,
  compact,
}: Props) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]} testID={testID}>
      <View style={styles.iconOuter}>
        <View style={styles.iconInner}>
          <Ionicons name={icon} size={42} color={colors.brandDark} />
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          style={{ marginTop: spacing.lg, alignSelf: "stretch", maxWidth: 320 }}
          testID={`${testID ?? "empty"}-action`}
        />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Text
          onPress={onSecondary}
          style={styles.secondary}
          accessibilityRole="link"
        >
          {secondaryLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing["2xl"],
  },
  wrapCompact: { paddingVertical: spacing.xl },
  iconOuter: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  iconInner: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typeTokens.h1,
    fontSize: 22,
    lineHeight: 28,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  message: {
    ...typeTokens.body,
    color: colors.onSurfaceMuted,
    textAlign: "center",
    maxWidth: 320,
  },
  secondary: {
    marginTop: spacing.md,
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
