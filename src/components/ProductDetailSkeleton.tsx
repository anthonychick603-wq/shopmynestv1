import React from "react";
import { View } from "react-native";

import { colors, radius, spacing } from "@/src/theme";
import { SkeletonBlock, useSkeletonPulse } from "@/src/components/SkeletonBlock";

// v1.0.71 — replaces the naked ActivityIndicator on the product detail
// screen. The layout mirrors the real screen (hero + thumbs + title + price
// + seller row + description) so the shimmer resolves in place instead of
// causing a big content shift.
export function ProductDetailSkeleton() {
  const pulse = useSkeletonPulse();
  return (
    <View style={{ backgroundColor: colors.surface, flex: 1 }}>
      {/* Hero image */}
      <SkeletonBlock pulse={pulse} style={{ width: "100%", aspectRatio: 1, borderRadius: 0 }} />
      {/* Thumb row */}
      <View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} pulse={pulse} style={{ width: 56, height: 56, borderRadius: radius.md }} />
        ))}
      </View>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <SkeletonBlock pulse={pulse} style={{ width: "85%", height: 22 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "40%", height: 26 }} />
        {/* Seller row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm }}>
          <SkeletonBlock pulse={pulse} style={{ width: 40, height: 40, borderRadius: 20 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBlock pulse={pulse} style={{ width: "50%", height: 14 }} />
            <SkeletonBlock pulse={pulse} style={{ width: "30%", height: 12 }} />
          </View>
        </View>
        {/* Quantity + about */}
        <SkeletonBlock pulse={pulse} style={{ width: 100, height: 14, marginTop: spacing.lg }} />
        <SkeletonBlock pulse={pulse} style={{ width: 140, height: 36, borderRadius: radius.md }} />
        <SkeletonBlock pulse={pulse} style={{ width: "100%", height: 14, marginTop: spacing.lg }} />
        <SkeletonBlock pulse={pulse} style={{ width: "95%", height: 14 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "80%", height: 14 }} />
        <SkeletonBlock pulse={pulse} style={{ width: "60%", height: 14 }} />
      </View>
    </View>
  );
}
