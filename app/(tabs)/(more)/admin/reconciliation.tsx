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
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { pushFromTab } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { parseServerDate } from "@/src/utils/datetime";
import { haptics } from "@/src/utils/haptics";

const WINDOWS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export default function ReconciliationScreen() {
  useBackFallback("/admin");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<AdminReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatestRequest();

  // v1.0.249 — track `report` in a ref so `load` doesn't need to depend
  // on it. Previously depending on `report` meant every load caused a
  // fresh `load` reference and re-fired useLoadOnce, which was subtle.
  const reportRef = useRef<AdminReconciliationReport | null>(null);
  useEffect(() => { reportRef.current = report; }, [report]);

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    const id = begin();
    setError(null);
    try {
      const res = await nest.adminReconciliation(days);
      if (!isCurrent(id)) return;
      setReport(res);
    } catch (e) {
      if (!isCurrent(id)) return;
      const msg = e instanceof ApiError ? e.friendly : "Could not load reconciliation.";
      setError(msg);
      if (reportRef.current) toast.error(msg);
    } finally {
      if (isCurrent(id)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [days, user?.role, begin, isCurrent]);

  // v1.0.249 — clear the stale report when the admin switches windows so
  // the skeleton shows instead of the previous window's data lingering.
  useEffect(() => { setReport(null); }, [days]);

  // v1.0.192 — treat the window switch as a hard reload; the report is
  // small enough that we don't need to cache per-window results.
  // v1.0.236 — dropped from 5 minutes to 30 seconds. Reconciliation is a
  // living operations report; when the admin returns after acting on a
  // payout batch or refund they expect the totals to reflect it.
  const { markLoaded } = useLoadOnce(load, { staleMs: 30_000 });

  if (user?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AdminHeader title="Reconciliation" backTo="/admin" />
        <EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." testID="admin-forbidden" />
      </SafeAreaView>
    );
  }

  const totalIssues = report?.total ?? 0;
  // v1.0.249 — anchor `scannedAt` to a captured moment when the report
  // arrives. Previously we recomputed `new Date()` on every render that
  // depended on `report`, so "Scanned at" drifted forward each rerender
  // even though the underlying report hadn't been refetched. Capturing a
  // stable ref of "the time this report landed" is the accurate
  // client-side signal for now (the API type doesn't expose a
  // server-side generated_at yet).
  const [scannedAtLabel, setScannedAtLabel] = useState<string>("");
  useEffect(() => {
    if (report) {
      setScannedAtLabel(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    }
  }, [report]);
  const scannedAt = scannedAtLabel;

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
            onPress: () => {
              if (loading || refreshing) return; // v1.0.249 dedupe stacked refreshes
              setRefreshing(true);
              void load().then(() => markLoaded());
            },
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
          <EmptyState icon="cloud-offline-outline" title="Couldn't load" message={error} actionLabel="Retry" onAction={() => { if (loading) return; setLoading(true); void load().then(() => markLoaded()); }} />
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

// v1.0.229 — Admin Reconciliation refinement. Window tabs, KPI tiles,
// hint strip, and issue chips move to white cards on cream with hairline
// structure and typography tokens.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  windowRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  windowBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  windowBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  windowText: { ...typeTokens.caption, fontWeight: "700", color: colors.onSurface },
  windowTextActive: { color: colors.onBrand },
  sectionTitle: { ...typeTokens.micro, fontWeight: "800", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  tileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileCount: { ...typeTokens.display, fontSize: 22 },
  tileLabel: { ...typeTokens.caption, marginTop: spacing.xs, lineHeight: 16 },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.card,
  },
  hintText: { flex: 1, ...typeTokens.caption, lineHeight: 17 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowTitle: { ...typeTokens.body, fontWeight: "800", fontSize: 15 },
  rowSub: { ...typeTokens.caption, marginTop: 2, textTransform: "capitalize" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.md },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipText: { ...typeTokens.micro, fontWeight: "700", color: colors.onSurface, textTransform: "capitalize" },
  issues: { marginTop: spacing.sm, gap: 2 },
  issueLine: { ...typeTokens.caption, lineHeight: 17 },
  footerAt: { ...typeTokens.micro, textAlign: "center", marginTop: spacing.xl },
});
