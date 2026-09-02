import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radius, type as typeTokens } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";

type Delta = { value: string; direction: "up" | "down" | "neutral" };

type Props = {
  /**
   * Small uppercase eyebrow above the number ("EARNED", "ORDERS").
   */
  label: string;
  /**
   * The KPI value. Kept as a string so callers control formatting
   * ("$0.00", "12", "3.2k") without the primitive making assumptions.
   */
  value: string;
  /**
   * Optional short caption below the value ("this month", "pending").
   */
  caption?: string;
  /**
   * Optional trend delta. When present, renders next to the value
   * with a green/red pill.
   */
  delta?: Delta;
  /**
   * Ionicon name shown as a small decorative glyph in the top-right.
   * Optional. Rendered muted so it doesn't compete with the value.
   */
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
};

// v1.0.224 — KPI tile.
//
// Meant to replace the ad-hoc "little stat card" pattern the seller
// dashboard and earnings screen were using. The old cards had inconsistent
// vertical rhythm, competing terracotta accents, and no delta support at
// all. This tile:
//   • Uppercase micro label at the top (eyebrow).
//   • Big price-style number.
//   • Optional short caption below.
//   • Optional colored delta pill (Robinhood/Stripe style).
//   • Optional muted icon in the top-right.
export function KPI({ label, value, caption, delta, icon, onPress }: Props) {
  const inner = (
    <View style={styles.body}>
      <View style={styles.row}>
        <Text style={styles.label} numberOfLines={1}>{label.toUpperCase()}</Text>
        {icon ? <Ionicons name={icon} size={14} color={colors.onSurfaceMuted} /> : null}
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        {delta ? (
          <View style={[styles.delta, deltaTone(delta.direction).container]}>
            <Ionicons
              name={
                delta.direction === "up"
                  ? "arrow-up"
                  : delta.direction === "down"
                  ? "arrow-down"
                  : "remove"
              }
              size={11}
              color={deltaTone(delta.direction).text.color}
            />
            <Text style={[styles.deltaText, deltaTone(delta.direction).text]}>{delta.value}</Text>
          </View>
        ) : null}
      </View>
      {caption ? <Text style={styles.caption} numberOfLines={1}>{caption}</Text> : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={styles.card}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.card}>{inner}</View>;
}

function deltaTone(direction: Delta["direction"]) {
  if (direction === "up") return { container: styles.deltaUp, text: styles.deltaUpText };
  if (direction === "down") return { container: styles.deltaDown, text: styles.deltaDownText };
  return { container: styles.deltaNeutral, text: styles.deltaNeutralText };
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 100,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
  },
  body: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...typeTokens.micro, flex: 1 },
  valueRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, flexWrap: "wrap" },
  value: { ...typeTokens.display, fontSize: 26, lineHeight: 30 },
  caption: { ...typeTokens.caption, marginTop: 2 },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    marginBottom: 4,
  },
  deltaText: { fontSize: 11, fontWeight: "700" },
  deltaUp: { backgroundColor: "#DFF3E3" },
  deltaUpText: { color: "#2A6B3A" },
  deltaDown: { backgroundColor: "#F8D7DA" },
  deltaDownText: { color: "#8B2E36" },
  deltaNeutral: { backgroundColor: "#F1EEE7" },
  deltaNeutralText: { color: "#6B6558" },
});
