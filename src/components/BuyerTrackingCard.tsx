import React from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";

import { colors, radius, spacing, shadows } from "@/src/theme";
import type { OrderTrackingRow } from "@/src/types";
import { parseServerDate } from "@/src/utils/datetime";

// v1.0.133 — per-seller shipment card with a compact status progression.
// We only render states the marketplace backend can actually establish:
// Preparing → Shipped → Delivered. Carrier scan events such as "out for
// delivery" are intentionally not guessed from the existence of tracking.
export function BuyerTrackingCard({ row }: { row: OrderTrackingRow }) {
  const status = String(row.status || "").toLowerCase();
  const delivered = status === "delivered" || status === "completed";
  const shipped = delivered || status === "shipped" || !!row.shipped_at || !!row.number;
  const carrierLine = [row.carrier, row.service].filter(Boolean).join(" ");
  const canTapThrough = !!row.tracking_url;

  const openTracking = async () => {
    if (!row.tracking_url) return;
    try {
      await Linking.openURL(row.tracking_url);
    } catch {
      // URL may have been removed or sanitized server-side.
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons
          name={delivered ? "checkmark-circle" : shipped ? "cube" : "time-outline"}
          size={18}
          color={shipped ? colors.brand : colors.onSurfaceMuted}
        />
        <Text style={styles.headerText}>
          {delivered ? "Delivered" : shipped ? "Shipped" : "Preparing to ship"} · {row.seller_name || "Seller"}
        </Text>
        {row.label_source === "shippo" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Shippo label</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.progressRow} accessibilityLabel={`Shipment status: ${delivered ? "Delivered" : shipped ? "Shipped" : "Preparing"}`}>
        <ProgressStep label="Preparing" active />
        <View style={[styles.progressLine, shipped && styles.progressLineOn]} />
        <ProgressStep label="Shipped" active={shipped} />
        <View style={[styles.progressLine, delivered && styles.progressLineOn]} />
        <ProgressStep label="Delivered" active={delivered} />
      </View>

      {row.shipped_at && shipped ? (
        <Text style={styles.subline}>
          Shipped {(() => {
            try {
              return format(parseServerDate(row.shipped_at) ?? new Date(0), "PP");
            } catch {
              return "";
            }
          })()}
        </Text>
      ) : null}

      {row.number ? (
        <View style={styles.trackingRow}>
          <View style={{ flex: 1 }}>
            {carrierLine ? <Text style={styles.carrier}>{carrierLine}</Text> : null}
            <Text style={styles.number} selectable>{row.number}</Text>
          </View>
          {canTapThrough ? (
            <TouchableOpacity onPress={openTracking} style={styles.trackBtn} testID={`order-track-${row.seller_id}`} accessibilityRole="button" accessibilityLabel="Track this shipment">
              <Ionicons name="open-outline" size={16} color={colors.onBrand} />
              <Text style={styles.trackBtnText}>Track</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <Text style={styles.pending}>
          The seller hasn't added tracking yet. We'll notify you when your items ship.
        </Text>
      )}
    </View>
  );
}

function ProgressStep({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={styles.progressStep}>
      <View style={[styles.progressDot, active && styles.progressDotOn]}>
        {active ? <Ionicons name="checkmark" size={10} color={colors.onBrand} /> : null}
      </View>
      <Text style={[styles.progressLabel, active && styles.progressLabelOn]} numberOfLines={1}>{label}</Text>
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
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  headerText: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.onSurface },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  badgeText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  progressRow: { flexDirection: "row", alignItems: "flex-start", marginVertical: spacing.md },
  progressStep: { width: 66, alignItems: "center" },
  progressDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  progressDotOn: { backgroundColor: colors.brand },
  progressLabel: { marginTop: 4, fontSize: 10, color: colors.onSurfaceMuted, fontWeight: "600" },
  progressLabelOn: { color: colors.onSurface, fontWeight: "700" },
  progressLine: { flex: 1, height: 2, backgroundColor: colors.surfaceTertiary, marginTop: 9, marginHorizontal: -5 },
  progressLineOn: { backgroundColor: colors.brand },
  subline: { fontSize: 12, color: colors.onSurfaceMuted, marginBottom: spacing.sm },
  trackingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.md },
  carrier: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  number: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  trackBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  trackBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 12 },
  pending: { fontSize: 13, color: colors.onSurfaceMuted, lineHeight: 19 },
});
