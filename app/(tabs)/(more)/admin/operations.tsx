import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { differenceInHours } from "date-fns";

import { nest, ApiError, type AdminOrder, type AdminReport, type NestDisputeRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { useAuth } from "@/src/context/AuthContext";
import { haptics } from "@/src/utils/haptics";
import { pushFromTab, safeBack } from "@/src/utils/nav";
import { parseServerDate } from "@/src/utils/datetime";

export default function AdminOperations() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [disputes, setDisputes] = useState<NestDisputeRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disputesUnavailable, setDisputesUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    setError(null);
    const [orderRes, reportRes, disputeRes] = await Promise.allSettled([
      nest.adminListOrders({ range: "30d", per_page: 100 }),
      nest.adminListReports({ status: "pending", per_page: 100 }),
      nest.trust.listDisputes(),
    ]);
    if (orderRes.status === "fulfilled") setOrders(orderRes.value.items || []);
    if (reportRes.status === "fulfilled") setReports(reportRes.value.items || []);
    if (disputeRes.status === "fulfilled") {
      const rows = Array.isArray(disputeRes.value) ? disputeRes.value : disputeRes.value.disputes || [];
      setDisputes(rows);
      setDisputesUnavailable(false);
    } else {
      setDisputesUnavailable(true);
    }
    if (orderRes.status === "rejected" && reportRes.status === "rejected") {
      const e = orderRes.reason;
      setError(e instanceof ApiError ? e.friendly : "Could not load operational queues.");
    }
    setLoading(false);
    setRefreshing(false);
  }, [user?.role]);

  React.useEffect(() => { void load(); }, [load]);

  const orderExceptions = useMemo(() => orders.filter((o) => {
    const status = (o.status || "").toLowerCase();
    if (["failed", "on-hold", "on_hold"].includes(status)) return true;
    if (status === "processing" && o.created_at) {
      const d = parseServerDate(o.created_at);
      return !!d && differenceInHours(new Date(), d) >= 72;
    }
    return false;
  }), [orders]);
  const openDisputes = useMemo(() => disputes.filter((d) => !String(d.status || "").startsWith("resolved_")), [disputes]);

  if (user?.role !== "admin") {
    return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin")} /><EmptyState icon="lock-closed-outline" title="Not available" message="Operations controls are limited to marketplace owners." /></SafeAreaView>;
  }
  if (loading) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin")} /><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  }
  if (error && !orders.length && !reports.length) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin")} /><EmptyState icon="cloud-offline-outline" title="Queues unavailable" message={error} actionLabel="Retry" onAction={load} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/admin")} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}
      >
        <Text style={styles.intro}>Anything that cannot finish automatically should land in a queue here. These queues use the operational endpoints currently available to the mobile app.</Text>
        <View style={styles.metrics}>
          <Metric value={orderExceptions.length} label="Order exceptions" />
          <Metric value={openDisputes.length} label="Open cases" />
          <Metric value={reports.length} label="Pending reports" />
        </View>

        <Section title="Order exceptions" empty="No failed, on-hold, or 72h+ processing orders in the last 30 days.">
          {orderExceptions.slice(0, 20).map((o) => (
            <QueueRow key={`order-${o.id}`} icon="alert-circle-outline" title={`Order #${o.number || o.id}`} sub={`${o.status} · ${o.buyer || "Buyer"}`} onPress={() => pushFromTab(router, `/order/${o.id}`)} />
          ))}
        </Section>

        <Section title="Buyer-protection cases" empty={disputesUnavailable ? "The current server does not expose the dispute queue to admins." : "No open buyer-protection cases."}>
          {openDisputes.slice(0, 20).map((d) => (
            <QueueRow key={`dispute-${d.id}`} icon="shield-checkmark-outline" title={`Case #${d.id} · Order #${d.order_id}`} sub={String(d.status || "open").replace(/_/g, " ")} onPress={() => pushFromTab(router, `/disputes/${d.id}`)} />
          ))}
        </Section>

        <Section title="Moderation reports" empty="No pending reports.">
          {reports.slice(0, 20).map((r) => (
            <QueueRow key={`report-${r.id}`} icon="flag-outline" title={r.subject_label || `Report #${r.id}`} sub={r.reason || r.kind} onPress={() => pushFromTab(router, "/admin/reports")} />
          ))}
        </Section>

        <View style={styles.coverageCard}>
          <Ionicons name="server-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.coverageTitle}>Server queues still required</Text>
            <Text style={styles.coverageText}>Payout failures, refund-review work, and seller-application review are not exposed by this mobile API yet. The app no longer pretends those queues exist; they require matching admin endpoints on the ShopMyNest backend.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return <View style={styles.top}><TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity><Text style={styles.topTitle}>Operations</Text><AlertsBellButton /></View>;
}
function Metric({ value, label }: { value: number; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = React.Children.count(children) > 0;
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{hasChildren ? children : <Text style={styles.empty}>{empty}</Text>}</View>;
}
function QueueRow({ icon, title, sub, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; sub: string; onPress: () => void }) {
  return <TouchableOpacity style={styles.row} onPress={() => { haptics.tap(); onPress(); }}><View style={styles.rowIcon}><Ionicons name={icon} size={18} color={colors.brand} /></View><View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSub}>{sub}</Text></View><Ionicons name="chevron-forward" size={17} color={colors.onSurfaceMuted} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  intro: { color: colors.onSurfaceMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  metrics: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  metric: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: "center", ...shadows.card },
  metricValue: { color: colors.onSurface, fontSize: 24, fontWeight: "800" },
  metricLabel: { color: colors.onSurfaceMuted, fontSize: 10, textAlign: "center", marginTop: 2 },
  section: { marginBottom: spacing.xl },
  sectionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginBottom: spacing.sm },
  empty: { color: colors.onSurfaceMuted, fontSize: 13, fontStyle: "italic" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, ...shadows.card },
  rowIcon: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  rowSub: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  coverageCard: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md },
  coverageTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800" },
  coverageText: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
