import React from "react";
import { View } from "react-native";

import { colors, radius, spacing } from "@/src/theme";
import { SkeletonBlock, useSkeletonPulse } from "@/src/components/SkeletonBlock";

// v1.0.71 — shown while the cart hydrates from storage + fetches live rates.
// Matches the real cart: address block, 2 item rows, rate row, totals.
export function CartSkeleton() {
  const pulse = useSkeletonPulse();
  return (
    <View style={{ backgroundColor: colors.surface, flex: 1, padding: spacing.lg, gap: spacing.md }}>
      {/* Address block */}
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 8 }}>
        <SkeletonBlock pulse={pulse} style={{ width: 120, height: 14 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "70%", height: 14 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "50%", height: 14 }} />
      </View>

      {/* Items */}
      {[0, 1].map((i) => (
        <View key={i} style={{ flexDirection: "row", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }}>
          <SkeletonBlock pulse={pulse} style={{ width: 72, height: 72, borderRadius: radius.md }} />
          <View style={{ flex: 1, gap: 8, justifyContent: "center" }}>
            <SkeletonBlock pulse={pulse} style={{ width: "85%", height: 14 }} />
            <SkeletonBlock pulse={pulse} style={{ width: "40%", height: 12 }} />
            <SkeletonBlock pulse={pulse} style={{ width: 100, height: 28, borderRadius: radius.md, marginTop: 4 }} />
          </View>
        </View>
      ))}

      {/* Rate + summary */}
      <SkeletonBlock pulse={pulse} style={{ width: 150, height: 14, marginTop: spacing.md }} />
      <SkeletonBlock pulse={pulse} style={{ width: "100%", height: 52, borderRadius: radius.md }} />
      <View style={{ marginTop: spacing.md, gap: 6 }}>
        <SkeletonBlock pulse={pulse} style={{ width: "40%", height: 14 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "50%", height: 14 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "60%", height: 18 }} />
      </View>
    </View>
  );
}
