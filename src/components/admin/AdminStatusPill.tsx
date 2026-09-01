// v1.0.192 — Admin-scoped status pill. The buyer-facing StatusPill in
// src/components/StatusPill.tsx maps only the buyer/seller-visible states
// ("processing", "shipped", "delivered", …). The admin console needs to
// visualize richer server states like "requested", "denied", "failed",
// "returned", "cancelled" — pulling the buyer StatusPill list into that
// scope would over-couple the two.
//
// This component maps every admin state we render, using the same
// statusPalette tokens so pills stay visually consistent across the app.
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, statusPalette, type StatusTone } from "@/src/theme";

// Explicit mapping keeps the switch statement out of every screen and
// lets designers change one state without hunting through screens.
const STATE_TONE: Record<string, StatusTone> = {
  // payouts
  pending: "waiting",
  requested: "waiting",
  processing: "inMotion",
  paid: "done",
  failed: "error",
  returned: "error",
  cancelled: "error",
  // refunds
  approved: "inMotion",
  completed: "done",
  denied: "error",
  // seller applications
  rejected: "error",
  // orders
  on_hold: "waiting",
  refunded: "error",
  // moderation
  resolved: "done",
  dismissed: "neutral",
  // users
  banned: "error",
  active: "done",
  suspended: "waiting",
  admin: "inMotion",
  seller: "waiting",
  // products (WP post_status)
  publish: "done",
  draft: "neutral",
  private: "waiting",
  trash: "error",
};

export function AdminStatusPill({ status, style }: { status: string; style?: object }) {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "_");
  const tone: StatusTone = STATE_TONE[key] ?? "neutral";
  const palette = statusPalette[tone];
  const label = String(status || "").replace(/_/g, " ") || "unknown";
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }, style]}>
      <Text style={[styles.text, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
});
