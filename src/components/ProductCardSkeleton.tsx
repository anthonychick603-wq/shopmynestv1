import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors, radius, shadows, spacing } from "@/src/theme";

type Layout = "full" | "grid";

/**
 * v1.0.69 — a card-shaped shimmer that mirrors ProductCard's outline so the
 * grid doesn't collapse when data lands. Uses opacity pulse (not gradient
 * translation) so it works cheaply on Android without extra libraries.
 */
export function ProductCardSkeleton({ layout = "full" }: { layout?: Layout }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const imgStyle = layout === "grid" ? styles.gridImage : styles.fullImage;

  return (
    <View style={[styles.card, layout === "grid" ? styles.gridCard : styles.fullCard]}>
      <Animated.View style={[imgStyle, styles.block, { opacity: pulse }]} />
      <View style={styles.body}>
        <Animated.View style={[styles.line, { opacity: pulse, width: "85%" }]} />
        <Animated.View style={[styles.line, { opacity: pulse, width: "55%", marginTop: 8 }]} />
        <View style={styles.rowSpread}>
          <Animated.View style={[styles.linePrice, { opacity: pulse }]} />
          <Animated.View style={[styles.dot, { opacity: pulse }]} />
        </View>
      </View>
    </View>
  );
}

/** Convenience grid of N skeletons for a two-column FlatList placeholder. */
export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  const rows = Math.ceil(count / 2);
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.rowPair}>
          <View style={{ flex: 1 }}><ProductCardSkeleton layout="grid" /></View>
          <View style={{ flex: 1 }}><ProductCardSkeleton layout="grid" /></View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  fullCard: { marginBottom: spacing.md },
  gridCard: {},
  fullImage: { width: "100%", height: 220 },
  gridImage: { width: "100%", height: 150 },
  block: { backgroundColor: colors.surfaceTertiary },
  body: { padding: spacing.md },
  line: { height: 12, borderRadius: 6, backgroundColor: colors.surfaceTertiary },
  linePrice: { width: 60, height: 16, borderRadius: 8, backgroundColor: colors.surfaceTertiary },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary },
  rowSpread: {
    marginTop: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowPair: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
});
