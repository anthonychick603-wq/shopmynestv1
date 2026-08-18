import React from "react";
import { View } from "react-native";

import { colors, radius, spacing } from "@/src/theme";
import { SkeletonBlock, useSkeletonPulse } from "@/src/components/SkeletonBlock";

// v1.0.71 — mirrors the order detail layout: status card, items list,
// tracking placeholder, address block.
export function OrderDetailSkeleton() {
  const pulse = useSkeletonPulse();
  return (
    <View style={{ backgroundColor: colors.surface, flex: 1, padding: spacing.lg, gap: spacing.md }}>
      {/* Header row: #id + status pill */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <SkeletonBlock pulse={pulse} style={{ width: 90, height: 22 }} />
        <SkeletonBlock pulse={pulse} style={{ width: 70, height: 18, borderRadius: radius.pill }} />
      </View>
      <SkeletonBlock pulse={pulse} style={{ width: 130, height: 12 }} />

      {/* Items */}
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: "row", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }}>
            <SkeletonBlock pulse={pulse} style={{ width: 56, height: 56, borderRadius: radius.md }} />
            <View style={{ flex: 1, gap: 8, justifyContent: "center" }}>
              <SkeletonBlock pulse={pulse} style={{ width: "80%", height: 14 }} />
              <SkeletonBlock pulse={pulse} style={{ width: "50%", height: 12 }} />
            </View>
            <SkeletonBlock pulse={pulse} style={{ width: 50, height: 14, alignSelf: "center" }} />
          </View>
        ))}
      </View>

      {/* Address / summary block */}
      <SkeletonBlock pulse={pulse} style={{ width: 120, height: 16, marginTop: spacing.lg }} />
      <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, gap: 8 }}>
        <SkeletonBlock pulse={pulse} style={{ width: "60%", height: 14 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "80%", height: 14 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "40%", height: 14 }} />
      </View>
    </View>
  );
}
