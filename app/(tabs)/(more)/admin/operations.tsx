import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type AdminOperationsSummary } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { useAuth } from "@/src/context/AuthContext";
import { haptics } from "@/src/utils/haptics";
import { pushFromTab, safeBack } from "@/src/utils/nav";

export default function AdminOperations() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [summary, setSummary] = useState<AdminOperationsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setError(null);
    try {
      setSummary(await nest.adminOperations());
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load operational queues.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.role]);

  React.useEffect(() => { void load(); }, [load]);

  if (user?.role !== "admin") {
    return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin")} /><EmptyState icon="lock-closed-outline" title="Not available" message="Operations controls are limited to marketplace owners." /></SafeAreaView>;
  }
  if (loading) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin")} /><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  }
  if (!summary && error) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin")} /><EmptyState icon="cloud-offline-outline" title="Queues unavailable" message={error} actionLabel="Retry" onAction={load} /></SafeAreaView>;
  }

  const s = summary!;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/admin")} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
       keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Server-authoritative queues for work that needs a person. Counts come directly from the marketplace backend rather than being inferred from client screens.</Text>
        {error ? <Text style={styles.warning}>{error}</Text> : null}

        <View style={styles.metrics}>
          <Metric value={s.seller_applications.count} label="Applications" />
          <Metric value={s.refunds.count} label="Refunds" />
          <Metric value={s.disputes.count} label="Protection cases" />
        </View>
        <View style={styles.metrics}>
          <Metric value={s.payouts_pending.count} label="Payouts" />
          <Metric value={s.payouts_failed.count} label="Payout failures" urgent={s.payouts_failed.count > 0} />
          <Metric value={s.reports.count} label="Reports" />
        </View>

        <Text style={styles.sectionTitle}>Money & seller operations</Text>
        <QueueRow icon="person-add-outline" title="Seller applications" metric={s.seller_applications} onPress={() => pushFromTab(router, "/admin/seller-applications")} />
        <QueueRow icon="return-down-back-outline" title="Refund review" metric={s.refunds} onPress={() => pushFromTab(router, "/admin/refunds")} />
        <QueueRow icon="cash-outline" title="Payout processing" metric={s.payouts_pending} onPress={() => pushFromTab(router, "/admin/payouts")} />
        <QueueRow icon="warning-outline" title="Failed / returned payouts" metric={s.payouts_failed} onPress={() => pushFromTab(router, "/admin/payouts")} urgent={s.payouts_failed.count > 0} />

        <Text style={styles.sectionTitle}>Customer & fulfillment exceptions</Text>
        <QueueRow icon="shield-checkmark-outline" title="Buyer-protection cases" metric={s.disputes} onPress={() => pushFromTab(router, "/disputes")} />
        <QueueRow icon="cube-outline" title="Shipping exceptions" metric={s.shipping_exceptions} onPress={() => pushFromTab(router, "/admin/orders")} urgent={s.shipping_exceptions.count > 0} />
        <QueueRow icon="alert-circle-outline" title="Order exceptions" metric={s.order_exceptions} onPress={() => pushFromTab(router, "/admin/orders")} urgent={s.order_exceptions.count > 0} />
        <QueueRow icon="flag-outline" title="Moderation reports" metric={s.reports} onPress={() => pushFromTab(router, "/admin/reports")} />

        <View style={styles.coverageCard}>
          <Ionicons name="checkmark-circle-outline" size={21} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.coverageTitle}>Operational API connected</Text>
            <Text style={styles.coverageText}>Applications, refunds, payouts, disputes, order exceptions, shipping exceptions, and moderation are now backed by live admin queues.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return <View style={styles.top}><TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity><Text style={styles.topTitle}>Operations</Text><AlertsBellButton /></View>;
}
function Metric({ value, label, urgent = false }: { value: number; label: string; urgent?: boolean }) {
  return <View style={styles.metric}><Text style={[styles.metricValue, urgent && { color: colors.error }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
function QueueRow({ icon, title, metric, onPress, urgent = false }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; metric: { count: number; oldest_hours: number }; onPress: () => void; urgent?: boolean }) {
  const age = metric.oldest_hours > 0 ? ` · oldest ${metric.oldest_hours}h` : "";
  return <TouchableOpacity style={styles.row} onPress={() => { haptics.tap(); onPress(); }} accessibilityRole="button"><View style={styles.rowIcon}><Ionicons name={icon} size={18} color={urgent ? colors.error : colors.brand} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSub}>{metric.count} waiting{age}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.onSurfaceMuted} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  intro: { color: colors.onSurfaceMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  warning: { color: colors.error, fontSize: 12, marginBottom: spacing.md },
  metrics: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  metric: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: "center", ...shadows.card },
  metricValue: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  metricLabel: { color: colors.onSurfaceMuted, fontSize: 10, textAlign: "center", marginTop: 2 },
  sectionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, ...shadows.card },
  rowIcon: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  rowSub: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  coverageCard: { flexDirection: "row", gap: spacing.md, padding: spacing.md, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md },
  coverageTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  coverageText: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
