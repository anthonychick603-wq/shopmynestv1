// v1.0.86 — Admin reports queue. Reads mynest_report CPT rows from
// the-nest/v1/admin/reports and lets the marketplace owner resolve or
// dismiss each report. Non-admins hit the same guard as index.tsx and
// the backend gates every route with tnm_is_admin_or_manager.
import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type AdminReport } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { parseServerDate } from "@/src/utils/datetime";

type Status = "pending" | "resolved" | "dismissed";
const TABS: Status[] = ["pending", "resolved", "dismissed"];

export default function AdminReports() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [status, setStatus] = useState<Status>("pending");
  const [items, setItems] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  const load = useCallback(async (next: Status) => {
    setLoading(true);
    setError(null);
    try {
      const res = await nest.adminListReports({ status: next, per_page: 30 });
      setItems(res.items || []);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load reports.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // v1.0.167 — load on mount and when the status filter changes.
  // Focus refetch removed to preserve state on return.
  React.useEffect(() => { load(status); }, [load, status]);

  const act = async (id: number, action: "resolve" | "dismiss") => {
    setActing(id);
    try {
      if (action === "resolve") await nest.adminResolveReport(id);
      else await nest.adminDismissReport(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
      toast.success(action === "resolve" ? "Report resolved" : "Report dismissed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not update that report.");
    } finally {
      setActing(null);
    }
  };

  if (user?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/admin")} />
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          message="Admin controls are limited to marketplace owners."
          testID="admin-reports-forbidden"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/admin")} />

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => { haptics.tap(); setStatus(t); }}
            style={[styles.tab, status === t && styles.tabActive]}
            testID={`admin-reports-tab-${t}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: status === t }}
            accessibilityLabel={`${t.charAt(0).toUpperCase() + t.slice(1)} reports${status === t ? ", selected" : ""}`}
          >
            <Text style={[styles.tabText, status === t && styles.tabTextActive]}>{t.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : error ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="We couldn't load reports"
          message={error}
          actionLabel="Retry"
          onAction={() => load(status)}
          testID="admin-reports-error"
        />
      ) : (
        <FlatList
          testID="admin-reports-list"
          data={items}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(status); }}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          renderItem={({ item }) => (
            <ReportRow
              report={item}
              status={status}
              acting={acting === item.id}
              onResolve={() => { haptics.success(); act(item.id, "resolve"); }}
              onDismiss={() => { haptics.warning(); act(item.id, "dismiss"); }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-done-outline"
              title={`Nothing ${status}`}
              message="Reports will appear here as members flag content."
              testID="admin-reports-empty"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="admin-reports-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Reports</Text>
      <AlertsBellButton />
    </View>
  );
}

function ReportRow({ report, status, acting, onResolve, onDismiss }: { report: AdminReport; status: Status; acting: boolean; onResolve: () => void; onDismiss: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.kindBadge}>
          <Text style={styles.kindBadgeText}>{report.subject_label.toUpperCase()}</Text>
        </View>
        <Text style={styles.createdAt}>{(parseServerDate(report.created_at) ?? new Date(0)).toLocaleDateString()}</Text>
      </View>
      {report.reason ? <Text style={styles.reason}>{report.reason}</Text> : null}
      {report.subject_body ? <Text style={styles.subjectBody} numberOfLines={4}>{report.subject_body}</Text> : null}
      {report.reporter ? (
        <Text style={styles.reporter}>Reported by {report.reporter.name}</Text>
      ) : null}
      {status === "pending" ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.action, styles.resolve]}
            onPress={onResolve}
            disabled={acting}
            testID={`admin-report-resolve-${report.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Resolve report #${report.id}`}
            accessibilityState={{ disabled: acting }}
          >
            <Text style={styles.resolveText}>Resolve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.action, styles.dismiss]}
            onPress={onDismiss}
            disabled={acting}
            testID={`admin-report-dismiss-${report.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss report #${report.id}`}
            accessibilityState={{ disabled: acting }}
          >
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : report.resolved_at ? (
        <Text style={styles.resolvedMeta}>
          {status === "resolved" ? "Resolved" : "Dismissed"}
          {report.resolved_by ? ` by ${report.resolved_by.name}` : ""} ·{" "}
          {(parseServerDate(report.resolved_at) ?? new Date(0)).toLocaleString()}
        </Text>
      ) : null}
    </View>
  );
}

// v1.0.229 — Admin Reports refinement. Report cards, tabs, and action
// row migrate to white on cream with hairline structure; success action
// keeps its brand fill.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { ...typeTokens.h1, fontSize: 18 },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { ...typeTokens.micro, fontWeight: "800", color: colors.onSurface, letterSpacing: 0.5 },
  tabTextActive: { color: colors.onBrand },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  kindBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  kindBadgeText: { ...typeTokens.micro, fontWeight: "800", color: colors.onSurface, letterSpacing: 0.5 },
  createdAt: { ...typeTokens.caption },
  reason: { ...typeTokens.body, fontWeight: "700", marginBottom: 4 },
  subjectBody: { ...typeTokens.caption, color: colors.onSurfaceMuted, marginBottom: spacing.sm },
  reporter: { ...typeTokens.caption, marginBottom: spacing.sm },

  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.pill },
  resolve: { backgroundColor: colors.success },
  resolveText: { ...typeTokens.body, fontWeight: "800", color: colors.onBrand },
  dismiss: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairlineStrong },
  dismissText: { ...typeTokens.body, fontWeight: "800", color: colors.onSurface },

  resolvedMeta: { ...typeTokens.caption, marginTop: spacing.sm, fontStyle: "italic" },
});
