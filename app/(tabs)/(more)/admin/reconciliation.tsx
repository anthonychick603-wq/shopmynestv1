// v1.0.192 — Reconciliation console. Surfaces the marketplace ledger
// scan that has been running server-side since day one (nightly cron
// digests owner email) but was never exposed in the app. This screen
// gives the owner an at-a-glance view of any Stripe/PayPal/Woo state
// mismatches so they can jump into wp-admin to fix them (or, for common
// cases, open the underlying order).
//
// Signals rendered:
//   - Window picker (7 / 30 / 90 days) at the top; changing it refetches
//   - Category count grid: which discrepancy bucket has how many orders
//   - Discrepancy row list: first 50 rows, each showing order #, status,
//     detected categories, and the human-readable issue text the server
//     already computed
//   - "Truncated" hint if more than 50 rows exist, pointing at the
//     WordPress CSV export for full audits
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type AdminReconciliationReport } from "@/src/api/nest";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { AdminHeader } from "@/src/components/admin/AdminHeader";
import { AdminCard } from "@/src/components/admin/AdminCard";
import { AdminListSkeleton } from "@/src/components/admin/AdminSkeleton";
import { useAuth } from "@/src/context/AuthContext";
import { useLoadOnce } from "@/src/hooks/use-load-once";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { pushFromTab } from "@/src/utils/nav";
import { parseServerDate } from "@/src/utils/datetime";
import { haptics } from "@/src/utils/haptics";

const WINDOWS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export default function ReconciliationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<AdminReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setError(null);
    try {
      const res = await nest.adminReconciliation(days);
      setReport(res);
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Could not load reconciliation.";
      setError(msg);
      if (report) toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days, report, user?.role]);

  // v1.0.192 — treat the window switch as a hard reload; the report is
  // small enough that we don't need to cache per-window results.
  const { markLoaded } = useLoadOnce(load, { staleMs: 5 * 60_000 });
  void markLoaded;

  if (user?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AdminHeader title="Reconciliation" backTo="/admin" />
        <EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." testID="admin-forbidden" />
      </SafeAreaView>
    );
  }

  const totalIssues = report?.total ?? 0;
  const scannedAt = useMemo(() => new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), [report]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader
        title="Reconciliation"
        subtitle={report ? `${totalIssues} issue${totalIssues === 1 ? "" : "s"} · window ${report.window_days}d` : undefined}
        backTo="/admin"
        actions={[
          {
            icon: "refresh-outline",
            label: "Refresh",
            onPress: () => { setRefreshing(true); void load(); },
            testID: "reconciliation-refresh",
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.windowRow}>
          {WINDOWS.map((w) => {
            const active = w.days === days;
            return (
              <TouchableOpacity
                key={w.days}
                onPress={() => { haptics.tap(); setDays(w.days); setLoading(true); }}
                style={[styles.windowBtn, active && styles.windowBtnActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`reconciliation-window-${w.days}`}
              >
                <Text style={[styles.windowText, active && styles.windowTextActive]}>Last {w.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading && !report ? (
          <AdminListSkeleton rows={3} />
        ) : error && !report ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load" message={error} actionLabel="Retry" onAction={load} />
        ) : !report ? null : totalIssues === 0 ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="Everything reconciles"
            message={`No mismatches detected in the last ${report.window_days} days. Nightly digest last ran on the server.`}
            testID="reconciliation-clean"
          />
        ) : (
          <>
            <Text style={styles.sectionTitle}>By category</Text>
            <View style={styles.grid}>
              {report.categories.map((c) => (
                <View key={c.key} style={styles.tile}>
                  <View style={styles.tileHeader}>
                    <Ionicons
                      name={c.count > 0 ? "warning-outline" : "checkmark-circle-outline"}
                      size={16}
                      color={c.count > 0 ? colors.warning : colors.success}
                    />
                    <Text style={[styles.tileCount, c.count > 0 && { color: colors.warning }]}>{c.count}</Text>
                  </View>
                  <Text style={styles.tileLabel} numberOfLines={3}>{c.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Discrepant orders</Text>
            {report.truncated ? (
              <View style={styles.hint}>
                <Ionicons name="information-circle-outline" size={16} color={colors.onSurfaceMuted} />
                <Text style={styles.hintText}>
                  Showing first 50 of {report.total}. Use the WordPress admin CSV export for full audits.
                </Text>
              </View>
            ) : null}

            {report.rows.map((r) => {
              const created = parseServerDate(r.date_created);
              const createdLabel = created
                ? created.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "";
              return (
                <AdminCard key={r.order_id} onPress={() => pushFromTab(router, `/order/${r.order_id}`)}>
                  <View style={styles.rowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>Order #{r.order_number}</Text>
                      <Text style={styles.rowSub}>
                        {r.order_status}
                        {createdLabel ? ` · ${createdLabel}` : ""}
                        {r.total ? ` · $${Number(r.total).toFixed(2)}` : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
                  </View>
                  <View style={styles.chipRow}>
                    {r.categories.map((cat) => (
                      <View key={cat} style={styles.chip}>
                        <Text style={styles.chipText}>{cat.replace(/_/g, " ")}</Text>
                      </View>
                    ))}
                  </View>
                  {r.issues?.length ? (
                    <View style={styles.issues}>
                      {r.issues.slice(0, 3).map((iss, i) => (
                        <Text key={i} style={styles.issueLine} numberOfLines={2}>· {iss}</Text>
                      ))}
                      {r.issues.length > 3 ? (
                        <Text style={styles.issueLine}>+ {r.issues.length - 3} more</Text>
                      ) : null}
                    </View>
                  ) : null}
                </AdminCard>
              );
            })}

            <Text style={styles.footerAt}>Scanned at {scannedAt}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  windowRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  windowBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    ...shadows.card,
  },
  windowBtnActive: { backgroundColor: colors.brand },
  windowText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  windowTextActive: { color: "#FFFFFF" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 90,
    ...shadows.card,
  },
  tileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileCount: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  tileLabel: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.xs, lineHeight: 16 },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
  },
  hintText: { flex: 1, fontSize: 12, color: colors.onSurfaceMuted, lineHeight: 17 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2, textTransform: "capitalize" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  chipText: { fontSize: 11, fontWeight: "700", color: colors.onSurface, textTransform: "capitalize" },
  issues: { marginTop: spacing.sm, gap: 2 },
  issueLine: { fontSize: 12, color: colors.onSurfaceMuted, lineHeight: 17 },
  footerAt: { textAlign: "center", fontSize: 11, color: colors.onSurfaceMuted, marginTop: spacing.xl },
});
