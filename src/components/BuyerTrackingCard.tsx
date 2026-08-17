import React from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";

import { colors, radius, spacing, shadows } from "@/src/theme";
import type { OrderTrackingRow } from "@/src/types";

// v1.0.51 - one per-seller tracking card. Renders carrier + number, a
// "Track this shipment" tap-through when we have a tracking URL, a
// shipped-at line, and a "Shippo label" badge when the seller bought a
// prepaid label through us. Groups the seller's items above it in the
// buyer order screen (parent renders the item list, we're just the
// status card).
export function BuyerTrackingCard({ row }: { row: OrderTrackingRow }) {
  const carrierLine = [row.carrier, row.service].filter(Boolean).join(" ");
  const shipped =
    row.status === "shipped" || row.status === "completed" || !!row.shipped_at;
  const canTapThrough = !!row.tracking_url;
  const openTracking = async () => {
    if (row.tracking_url) {
      try {
        await Linking.openURL(row.tracking_url);
      } catch {
        /* Silent: URL may have been sanitized out on the server. */
      }
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons
          name={shipped ? "cube" : "time-outline"}
          size={18}
          color={shipped ? colors.brand : colors.onSurfaceMuted}
        />
        <Text style={styles.headerText}>
          {shipped ? "Shipped" : "Preparing to ship"} · {row.seller_name || "Seller"}
        </Text>
        {row.label_source === "shippo" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Shippo label</Text>
          </View>
        ) : null}
      </View>

      {row.shipped_at && shipped ? (
        <Text style={styles.subline}>
          Shipped {(() => {
            try {
              return format(new Date(row.shipped_at.replace(" ", "T") + "Z"), "PP");
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
            <Text style={styles.number} selectable>
              {row.number}
            </Text>
          </View>
          {canTapThrough ? (
            <TouchableOpacity onPress={openTracking} style={styles.trackBtn} testID={`order-track-${row.seller_id}`}>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    color: colors.onSurface,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.onSurfaceMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  subline: {
    fontSize: 12,
    color: colors.onSurfaceMuted,
    marginBottom: spacing.sm,
  },
  trackingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  carrier: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.4 },
  number: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  trackBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 12 },
  pending: { fontSize: 13, color: colors.onSurfaceMuted, lineHeight: 19 },
});
