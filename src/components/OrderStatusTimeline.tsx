// v1.0.133 — Buyer order timeline. Adds a distinct Preparing stage so the
// customer can tell the difference between payment being accepted and the
// maker actually working on the order. The backend does not expose carrier
// scan events, so we intentionally stop at Shipped rather than inventing
// "in transit" / "out for delivery" states we cannot verify.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNowStrict } from "date-fns";

import { colors, radius, spacing } from "@/src/theme";
import type { Order } from "@/src/types";
import { parseServerDate } from "@/src/utils/datetime";
import { statusLabel } from "@/src/utils/orderStatus";

type Step = {
  key: "placed" | "paid" | "preparing" | "shipped" | "delivered";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const STEPS: Step[] = [
  { key: "placed", label: "Ordered", icon: "bag-check-outline" },
  { key: "paid", label: "Paid", icon: "card-outline" },
  { key: "preparing", label: "Preparing", icon: "hammer-outline" },
  { key: "shipped", label: "Shipped", icon: "cube-outline" },
  { key: "delivered", label: "Delivered", icon: "checkmark-done-outline" },
];

function currentStepIndex(order: Order): number {
  const s = (order.status || "").toLowerCase();
  if (s === "cancelled" || s === "failed") return 0;
  if (s === "refunded") return 1;

  const ship = order.shipping_status || "awaiting";
  if (ship === "delivered" || s === "delivered") return 4;
  if (ship === "shipped" || ship === "partial" || s === "shipped") return 3;
  if (s === "processing" || s === "on-hold" || s === "completed") return 2;
  if (s === "paid") return 1;
  return 0;
}

function relTime(iso?: string | null): { rel: string; abs: string } | null {
  if (!iso) return null;
  const d = parseServerDate(iso);
  if (!d || Number.isNaN(d.getTime())) return null;
  try {
    return { rel: `${formatDistanceToNowStrict(d, { addSuffix: false })} ago`, abs: d.toLocaleString() };
  } catch {
    return null;
  }
}

export function OrderStatusTimeline({ order }: { order: Order }) {
  const active = currentStepIndex(order);
  const isTerminated = ["cancelled", "failed", "refunded"].includes((order.status || "").toLowerCase());

  // Preparing does not have its own backend timestamp. Do not duplicate the
  // paid timestamp under it; leaving it blank is more accurate.
  const timestamps: Array<string | undefined> = [
    order.created_at,
    order.paid_at,
    undefined,
    order.shipped_at,
    order.completed_at,
  ];

  return (
    <View style={styles.wrap} accessibilityRole="summary" accessibilityLabel={`Order status: ${STEPS[active].label}`}>
      <View style={styles.row}>
        {STEPS.map((step, i) => {
          const done = i <= active;
          const isCurrent = i === active;
          const ts = done ? relTime(timestamps[i]) : null;
          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepCol}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: done ? colors.brand : colors.surfaceTertiary },
                    isCurrent && !isTerminated && styles.dotCurrent,
                  ]}
                >
                  <Ionicons name={step.icon} size={15} color={done ? colors.onBrand : colors.onSurfaceMuted} />
                </View>
                <Text style={[styles.label, done && styles.labelDone, isCurrent && styles.labelCurrent]} numberOfLines={1}>
                  {step.label}
                </Text>
                {ts ? (
                  <Text style={styles.stamp} numberOfLines={1} accessibilityLabel={ts.abs}>{ts.rel}</Text>
                ) : null}
              </View>
              {i < STEPS.length - 1 ? (
                <View style={[styles.connector, i < active ? styles.connectorDone : null]} />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      {isTerminated ? (
        <View style={styles.terminated} testID="order-timeline-terminated">
          <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
          {/* v1.0.222 — route through statusLabel so "refunded" renders as
              "Refunded" (not the raw enum) and copy matches the pill / hint. */}
          <Text style={styles.terminatedText}>{statusLabel(order.status, "buyer")}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  stepCol: { alignItems: "center", width: 49 },
  dot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCurrent: { borderWidth: 2, borderColor: colors.brandDark },
  label: {
    marginTop: spacing.xs,
    fontSize: 10,
    fontWeight: "600",
    color: colors.onSurfaceMuted,
    textAlign: "center",
  },
  labelDone: { color: colors.onSurface },
  labelCurrent: { color: colors.brandDark, fontWeight: "800" },
  stamp: { marginTop: 2, fontSize: 9, color: colors.onSurfaceMuted, textAlign: "center" },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.surfaceTertiary,
    marginTop: 16,
    marginHorizontal: 1,
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
  // v1.0.222 — statusLabel already returns Title Case, no need to force it here.
  terminatedText: { fontSize: 12, fontWeight: "700", color: colors.error },
});
