import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/src/theme";
import { statusPalette, StatusTone } from "@/src/theme";

type Tone = StatusTone | "brand";

type Props = {
  label: string;
  tone?: Tone;
  /**
   * When true, renders as a small dot instead of a full label. Used for
   * unread indicators on avatars and list rows.
   */
  dot?: boolean;
  /**
   * When true, uses a small uppercase micro style. Best for labels like
   * "MAKER", "PRO", "NEW".
   */
  micro?: boolean;
};

// v1.0.224 — Unified badge / pill primitive.
//
// Consolidates the "MAKER" pill, the unread dot, the small status pills,
// and the notification count into one component with a single palette
// language.
export function Badge({ label, tone = "neutral", dot, micro }: Props) {
  const palette = tone === "brand"
    ? { bg: colors.brand, fg: colors.onBrand }
    : statusPalette[tone];

  if (dot) {
    return <View style={[styles.dot, { backgroundColor: palette.bg }]} />;
  }
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text
        style={[
          micro ? styles.microLabel : styles.label,
          { color: palette.fg },
        ]}
        numberOfLines={1}
      >
        {micro ? label.toUpperCase() : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: "flex-start",
    minHeight: 20,
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: { fontSize: 12, fontWeight: "700" },
  microLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
});
