import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";
import type { SellerBadge as SellerBadgeType } from "@/src/types";

const TIER_STYLE: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  trusted_seller: { color: colors.green, icon: "shield-checkmark" },
  rising_seller: { color: colors.yellow, icon: "trending-up" },
  none: { color: colors.onSurfaceMuted, icon: "leaf-outline" },
};

function pct(n?: number) {
  return n == null ? "—" : `${Math.round(n)}%`;
}

type Props = { badge: SellerBadgeType; proSeller?: boolean };

// Renders nothing for un-badged sellers with no volume, mirroring the plugin's
// shortcode behavior.
export function SellerBadge({ badge, proSeller }: Props) {
  if (badge.tier === "none" && !badge.meets_minimum_volume && !proSeller) return null;
  const style = TIER_STYLE[badge.tier] ?? TIER_STYLE.none;
  const m = badge.metrics || {};

  return (
    <View style={styles.card} testID="seller-badge">
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: `${style.color}22` }]}>
          <Ionicons name={style.icon} size={20} color={style.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tierLabel}>{badge.tier === "none" ? "New Seller" : badge.tier_label}</Text>
          {!badge.meets_minimum_volume ? <Text style={styles.subtle}>Building their track record</Text> : null}
        </View>
        {proSeller ? (
          <View style={styles.proPill}>
            <Ionicons name="star" size={12} color={colors.onBrand} />
            <Text style={styles.proText}>PRO</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metricsRow}>
        <Metric label="On-time" value={pct(m.on_time_rate)} />
        <Metric label="Rating" value={m.avg_rating != null ? m.avg_rating.toFixed(1) : "—"} />
        <Metric label="Response" value={pct(m.response_rate)} />
        <Metric label="Orders" value={m.completed_orders != null ? String(m.completed_orders) : "—"} />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, ...({ shadowColor: "#000000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }) },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  tierLabel: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  subtle: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  proPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  proText: { color: colors.onBrand, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  metricsRow: { flexDirection: "row", marginTop: spacing.lg, gap: spacing.sm },
  metric: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingVertical: spacing.md },
  metricValue: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  metricLabel: { fontSize: 10, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
});
