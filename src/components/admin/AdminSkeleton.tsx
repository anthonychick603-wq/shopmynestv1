// v1.0.192 — Loading skeletons for admin lists. A shimmering placeholder
// beats a full-screen spinner because it gives an immediate sense of what
// the finished screen will look like and lets the eye rest in the right
// place instead of hunting for content. Uses Animated.loop so it stays
// smooth on Android without needing Reanimated.
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "@/src/theme";

function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // v1.0.192 — 1200ms is slow enough that repeated frames don't jitter
    // on low-end Android; fast enough that the user perceives motion
    // rather than a static tinted block.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
}

export function SkeletonBlock({ width, height, style }: { width?: number | string; height: number; style?: object }) {
  const opacity = useShimmer();
  return <Animated.View style={[styles.block, { width: (width ?? "100%") as number | undefined, height, opacity }, style]} />;
}

export function AdminListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={styles.list} testID="admin-skeleton-list">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.rowTop}>
            <SkeletonBlock width={"55%"} height={14} />
            <SkeletonBlock width={72} height={18} style={{ borderRadius: radius.pill }} />
          </View>
          <SkeletonBlock width={"40%"} height={11} style={{ marginTop: spacing.sm }} />
          <SkeletonBlock width={"90%"} height={11} style={{ marginTop: spacing.xs }} />
          <View style={styles.rowBottom}>
            <SkeletonBlock width={100} height={36} style={{ borderRadius: radius.pill }} />
            <SkeletonBlock width={80} height={36} style={{ borderRadius: radius.pill }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function StatTileSkeleton() {
  return (
    <View style={styles.tile}>
      <SkeletonBlock width={"70%"} height={12} />
      <SkeletonBlock width={"45%"} height={28} style={{ marginTop: spacing.md }} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.sm },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowBottom: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  tile: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 100,
  },
});
