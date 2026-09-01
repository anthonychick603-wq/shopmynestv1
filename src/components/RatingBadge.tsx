import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "@/src/theme";

// v1.0.64 - compact star + rating + review count badge. Used on seller cards,
// product cards (seller row), and the seller profile header. Renders nothing
// when the seller has zero approved reviews so shops don't start life with
// "0.0 · 0 reviews" — that reads as "bad" instead of "new". Callers can pass
// `showEmpty` to force the "No reviews yet" placeholder when the emptiness
// is itself information (e.g. the seller profile header, where the absence
// of stars is expected instead of implying data was omitted).
export function RatingBadge({
  rating,
  reviewCount,
  size = "sm",
  showEmpty = false,
}: {
  rating?: number;
  reviewCount?: number;
  size?: "sm" | "md" | "lg";
  showEmpty?: boolean;
}) {
  const count = reviewCount ?? 0;
  const value = rating ?? 0;

  if (count < 1) {
    if (!showEmpty) return null;
    return (
      <View style={styles.row}>
        <Ionicons name="star-outline" size={ICON[size]} color={colors.onSurfaceMuted} />
        <Text style={[styles.empty, TEXT[size]]}>No reviews yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Ionicons name="star" size={ICON[size]} color={colors.brand} />
      <Text style={[styles.value, TEXT[size]]}>{value.toFixed(1)}</Text>
      <Text style={[styles.count, TEXTMUTED[size]]}>
        ({count.toLocaleString()})
      </Text>
    </View>
  );
}

const ICON = { sm: 12, md: 14, lg: 18 } as const;
const TEXT = {
  sm: { fontSize: 12, fontWeight: "800" as const },
  md: { fontSize: 13, fontWeight: "800" as const },
  lg: { fontSize: 16, fontWeight: "800" as const },
};
const TEXTMUTED = {
  sm: { fontSize: 12 },
  md: { fontSize: 13 },
  lg: { fontSize: 14 },
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  value: { color: colors.onSurface },
  count: { color: colors.onSurfaceMuted },
  empty: { color: colors.onSurfaceMuted },
});
