// v1.0.91 — Visual order timeline. Renders a 4-step progress bar
// (Placed → Paid → Shipped → Delivered) with completed steps in brand
// color, current step pulsing subtly, and future steps muted. Reads
// order.status + order.shipping_status. Pure presentational — no
// network calls.
//
// v1.0.94 (Build #16) — each completed step now shows its timestamp
// underneath so the buyer sees WHEN each step happened.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNowStrict } from "date-fns";

import { colors, radius, spacing } from "@/src/theme";
import type { Order } from "@/src/types";

type Step = {
  key: "placed" | "paid" | "shipped" | "delivered";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const STEPS: Step[] = [
  { key: "placed", label: "Placed", icon: "bag-check-outline" },
  { key: "paid", label: "Paid", icon: "card-outline" },
  { key: "shipped", label: "Shipped", icon: "cube-outline" },
  { key: "delivered", label: "Delivered", icon: "checkmark-done-outline" },
];

function currentStepIndex(order: Order): number {
  // Cancelled/refunded orders show the timeline reaching only as far as
  // they got: placed for cancelled, paid for refunded (payment was
  // captured then reversed).
  const s = (order.status || "").toLowerCase();
  if (s === "cancelled" || s === "failed") return 0;
  if (s === "refunded") return 1;

  const ship = order.shipping_status || "awaiting";
  if (ship === "delivered") return 3;
  if (ship === "shipped" || ship === "partial") return 2;

  // Paid but not shipped: processing, on-hold, or completed-with-no-shipping.
  if (s === "processing" || s === "on-hold" || s === "completed") return 1;

  // Fallback — order was created but payment status unclear. Show only
  // the first step lit.
  return 0;
}

// v1.0.94 (Build #16) — relative-time formatter for the timeline
// timestamps. Shorter than the full timestamp and easier to scan ("2d
// ago", "3h ago"). Absolute time is still exposed via the a11y label.
function relTime(iso?: string | null): { rel: string; abs: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return { rel: `${formatDistanceToNowStrict(d, { addSuffix: false })} ago`, abs: d.toLocaleString() };
  } catch {
    return null;
  }
}

export function OrderStatusTimeline({ order }: { order: Order }) {
  const active = currentStepIndex(order);
  const isTerminated = ["cancelled", "failed", "refunded"].includes((order.status || "").toLowerCase());

  // v1.0.94 (Build #16) — pull the per-step timestamps from the domain Order.
  // shipped_at is the aggregate of per-seller ship timestamps (adapters.ts).
  const timestamps: Array<string | undefined> = [order.created_at, order.paid_at, order.shipped_at, order.completed_at];

  return (
    <View style={styles.wrap} accessibilityRole="summary" accessibilityLabel={`Order status: ${STEPS[active].label}`}>
      <View style={styles.row}>
        {STEPS.map((step, i) => {
          const done = i <= active;
          const isCurrent = i === active;
          const dotBg = done ? colors.brand : colors.surfaceTertiary;
          const dotColor = done ? colors.onBrand : colors.onSurfaceMuted;
          const ts = done ? relTime(timestamps[i]) : null;
          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepCol}>
                <View style={[styles.dot, { backgroundColor: dotBg }, isCurrent && !isTerminated && styles.dotCurrent]}>
                  <Ionicons name={step.icon} size={16} color={dotColor} />
                </View>
                <Text style={[styles.label, done && styles.labelDone, isCurrent && styles.labelCurrent]} numberOfLines={1}>
                  {step.label}
                </Text>
                {ts ? (
                  <Text style={styles.stamp} numberOfLines={1} accessibilityLabel={ts.abs}>{ts.rel}</Text>
                ) : null}
              </View>
              {i < STEPS.length - 1 ? (
                <View
                  style={[styles.connector, i < active ? styles.connectorDone : null]}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      {isTerminated ? (
        <View style={styles.terminated} testID="order-timeline-terminated">
          <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
          <Text style={styles.terminatedText}>
            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  stepCol: { alignItems: "center", width: 60 },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCurrent: {
    borderWidth: 2,
    borderColor: colors.brandDark,
  },
  label: {
    marginTop: spacing.xs,
    fontSize: 11,
    fontWeight: "600",
    color: colors.onSurfaceMuted,
    textAlign: "center",
  },
  labelDone: { color: colors.onSurface },
  labelCurrent: { color: colors.brandDark, fontWeight: "800" },
  // v1.0.94 (Build #16) — relative timestamp under each completed step.
  stamp: { marginTop: 2, fontSize: 10, color: colors.onSurfaceMuted, textAlign: "center" },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.surfaceTertiary,
    marginTop: 17,
    marginHorizontal: 2,
    borderRadius: 1,
  },
  connectorDone: { backgroundColor: colors.brand },
  terminated: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.error + "12",
    borderRadius: radius.pill,
    alignSelf: "center",
  },
  terminatedText: { fontSize: 12, fontWeight: "700", color: colors.error, textTransform: "capitalize" },
});
