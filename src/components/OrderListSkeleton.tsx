import React from "react";
import { StyleSheet, View } from "react-native";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { SkeletonBlock, useSkeletonPulse } from "@/src/components/SkeletonBlock";

// v1.0.75 — placeholder for the orders list so the buyer sees the card layout
// during first load instead of a lonely spinner. Mirrors the real card shape:
// id + status pill on top, date under, thumb strip + total on the bottom.
export function OrderListSkeleton({ count = 4 }: { count?: number }) {
  const pulse = useSkeletonPulse();
  return (
    <View style={{ padding: spacing.lg }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.headerRow}>
            <SkeletonBlock pulse={pulse} style={styles.orderId} />
            <SkeletonBlock pulse={pulse} style={styles.pill} />
          </View>
          <SkeletonBlock pulse={pulse} style={styles.date} />
          <View style={styles.footerRow}>
            <View style={{ flexDirection: "row" }}>
              <SkeletonBlock pulse={pulse} style={[styles.thumb, { marginLeft: 0 }]} />
              <SkeletonBlock pulse={pulse} style={[styles.thumb, { marginLeft: -12 }]} />
              <SkeletonBlock pulse={pulse} style={[styles.thumb, { marginLeft: -12 }]} />
            </View>
            <SkeletonBlock pulse={pulse} style={styles.total} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { width: 120, height: 16, borderRadius: 6 },
  pill: { width: 74, height: 20, borderRadius: 999 },
  date: { width: 90, height: 12, borderRadius: 6, marginTop: 6 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  thumb: { width: 42, height: 42, borderRadius: 21 },
  total: { width: 60, height: 16, borderRadius: 6 },
});
