import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/src/theme";

// v1.0.71 — extracted from the seller dashboard (v1.0.70). Any list that
// shows an order/dispute/status label should use this component instead of
// rendering the raw uppercase string. Buyer-facing screens now share the
// same color language as the seller dashboard: green complete/paid,
// blue shipped/in-transit, orange pending/processing, red cancelled/refunded.
export function statusColors(status: string): { bg: string; fg: string } {
  const s = status.toLowerCase();
  if (s.includes("cancel") || s.includes("refund") || s.includes("fail")) {
    return { bg: "#F8D7DA", fg: "#8B2E36" };
  }
  if (s.includes("ship") || s.includes("transit")) {
    return { bg: "#E7EEF7", fg: "#2F5AA3" };
  }
  if (s.includes("complete") || s.includes("delivered") || s.includes("paid")) {
    return { bg: "#DFF3E3", fg: "#2A6B3A" };
  }
  if (s.includes("pending") || s.includes("hold") || s.includes("processing")) {
    return { bg: "#FFEED9", fg: "#8A4B10" };
  }
  return { bg: colors.surfaceTertiary, fg: colors.onSurface };
}

export function StatusPill({ status, style }: { status: string; style?: object }) {
  const c = statusColors(status);
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }, style]}>
      <Text style={[styles.text, { color: c.fg }]}>{status.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  text: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
});
