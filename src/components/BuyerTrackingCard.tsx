import React from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, shadows } from "@/src/theme";
import type { OrderTrackingRow } from "@/src/types";

// v1.0.133 — per-seller shipment card. Originally showed a compact
// Preparing → Shipped → Delivered progression, but the order-level
// OrderStatusTimeline directly above already covers those states.
//
// v1.0.139 — removed the redundant inline mini-timeline (and the
// "Shipped MMM d" subline) so this card focuses on what only it can
// show: carrier, tracking number, and the Track button. Header still
// summarizes state so the card reads standalone if scrolled past the
// order timeline.
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
        {/* v1.0.245 — was "Shipped · <seller>" (or Delivered/Preparing +
            seller). The parent Order screen already shows the shipment
            status in the timeline strip and the seller name at the top,
            so repeating either here was redundant. Simplify to just
            "Tracking" so the card reads as what it actually is. */}
        <Text style={styles.headerText}>Tracking</Text>
        {row.label_source === "shippo" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Shippo label</Text>
          </View>
        ) : null}
      </View>

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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  headerText: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.onSurface },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  badgeText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  trackingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceTertiary, padding: spacing.md, borderRadius: radius.md },
  carrier: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  number: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  trackBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  trackBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 12 },
  pending: { fontSize: 13, color: colors.onSurfaceMuted, lineHeight: 19 },
});
