import React from "react";
import { StyleSheet, View } from "react-native";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { SkeletonBlock, useSkeletonPulse } from "@/src/components/SkeletonBlock";

// v1.0.75 — placeholder for BlogPostCard rows (favorites "Posts" tab, blog
// listing). Mirrors the real card: avatar + author, caption line, wide image,
// footer with comment count.
export function BlogPostSkeleton({ count = 3 }: { count?: number }) {
  const pulse = useSkeletonPulse();
  return (
    <View style={{ padding: spacing.lg }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.headRow}>
            <SkeletonBlock pulse={pulse} style={styles.avatar} />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <SkeletonBlock pulse={pulse} style={styles.author} />
              <SkeletonBlock pulse={pulse} style={styles.meta} />
            </View>
          </View>
          <SkeletonBlock pulse={pulse} style={styles.caption} />
          <SkeletonBlock pulse={pulse} style={styles.image} />
          <SkeletonBlock pulse={pulse} style={styles.footer} />
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
  headRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  author: { width: 120, height: 14, borderRadius: 6 },
  meta: { width: 70, height: 10, borderRadius: 6, marginTop: 6 },
  caption: { width: "90%", height: 14, borderRadius: 6, marginTop: spacing.md },
  image: { width: "100%", height: 180, borderRadius: radius.md, marginTop: spacing.md },
  footer: { width: 100, height: 12, borderRadius: 6, marginTop: spacing.md },
});
