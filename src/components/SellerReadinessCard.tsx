/**
 * SellerReadinessCard
 *
 * Compact vertical checklist rendered at the top of the seller dashboard.
 * Backed by GET /the-nest/v1/seller/readiness (v3.7.93+). Each step opens
 * the destination route so a partially-onboarded seller can finish setup
 * without hunting through the settings tabs.
 *
 * When ready_to_sell is true the card renders in a "you're all set" state
 * but still lists steps so the seller can revisit any of them.
 */
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import type { NestSellerReadiness, NestSellerReadinessStep } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { usePushFromTab } from "@/src/utils/nav";

// v1.0.61 — the readiness endpoint still returns a "Set your shop name"
// step but shops now have a display name at signup, so it never provides
// useful signal and just adds noise. Hide it client-side and recompute
// completed/total off the filtered list. When every remaining step is
// ok we hide the whole card.
const HIDDEN_STEP_KEYS = new Set(["store_name"]);

export function SellerReadinessCard({ readiness }: { readiness: NestSellerReadiness | null }) {
  const router = useRouter();
  const push = usePushFromTab();
  if (!readiness || !readiness.steps?.length) return null;

  const visibleSteps = readiness.steps.filter((s) => !HIDDEN_STEP_KEYS.has(s.key));
  if (visibleSteps.length === 0) return null;

  const completed = visibleSteps.filter((s) => s.ok).length;
  const total = visibleSteps.length;
  const ready_to_sell = completed === total;

  // Hide the entire card once every remaining step is complete.
  if (ready_to_sell) return null;

  const steps = visibleSteps;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handlePress = (step: NestSellerReadinessStep) => {
    if (!step.action_url) return;
    // Rendered only on the seller dashboard tab root, so every step opens a
    // (more) screen — reset the shared stack so back returns to the tab.
    push(String(step.action_url));
  };

  return (
    <View style={styles.card} testID="seller-readiness">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Finish setup to start selling</Text>
          <Text style={styles.subtitle}>
            {completed} of {total} complete · {pct}%
          </Text>
        </View>
        <View style={[styles.badge, styles.badgeWarn]}>
          <Ionicons name="alert-circle" size={18} color={colors.warning} />
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>

      {steps.map((step) => {
        const showAction = !step.ok && step.action_label;
        return (
          <TouchableOpacity
            key={step.key}
            style={styles.row}
            onPress={() => handlePress(step)}
            testID={`readiness-${step.key}`}
            activeOpacity={0.7}
           accessibilityRole="button">
            <View style={styles.iconWrap}>
              <Ionicons
                name={step.ok ? "checkmark-circle" : step.blocking ? "ellipse-outline" : "ellipse-outline"}
                size={22}
                color={step.ok ? colors.success : step.blocking ? colors.warning : colors.onSurfaceMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, step.ok ? styles.rowLabelOk : null]}>{step.label}</Text>
              {!step.ok ? (
                <Text style={styles.rowDesc} numberOfLines={2}>{step.description}</Text>
              ) : step.detail ? (
                <Text style={styles.rowDetail} numberOfLines={1}>{step.detail}</Text>
              ) : null}
            </View>
            {showAction ? (
              <View style={styles.action}>
                <Text style={styles.actionText}>{step.action_label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.brand} />
              </View>
            ) : step.ok ? null : (
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  header: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  title: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  badge: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  badgeOk: { backgroundColor: "rgba(67,122,34,0.12)" },
  badgeWarn: { backgroundColor: "rgba(150,66,25,0.12)" },
  progressTrack: {
    height: 4,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: spacing.md,
  },
  progressFill: { height: "100%", backgroundColor: colors.brand },
  progressFillOk: { backgroundColor: colors.success },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceTertiary,
  },
  iconWrap: { width: 26, alignItems: "center" },
  rowLabel: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowLabelOk: { color: colors.onSurfaceMuted },
  rowDesc: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2, lineHeight: 16 },
  rowDetail: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  action: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionText: { color: colors.brand, fontWeight: "700", fontSize: 13 },
});
