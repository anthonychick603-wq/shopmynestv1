// v1.0.86 — Admin drawer entry point. Small in-app control panel for
// marketplace owners; gated at the account.tsx entry by user.role === "admin",
// and every REST route it consumes rejects non-admins with 403 (plugin v3.7.114
// MNU_Admin_Console).
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError, type AdminStats } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack, pushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await nest.adminStats();
      setStats(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load admin stats.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (user?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/account")} />
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          message="Admin controls are limited to marketplace owners."
          testID="admin-forbidden"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/account")} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        testID="admin-scroll"
      >
        {loading && !stats ? (
          <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
        ) : error && !stats ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="We couldn't load the console"
            message={error}
            actionLabel="Retry"
            onAction={load}
            testID="admin-error"
          />
        ) : (
          <>
            <View style={styles.tileRow}>
              <StatTile
                label="Pending posts"
                value={stats?.pending_blog_posts ?? 0}
                icon="newspaper-outline"
                tint={colors.warning}
                onPress={() => pushFromTab(router, "/blog/moderation")}
                testID="admin-tile-pending-posts"
              />
              <StatTile
                label="Pending reports"
                value={stats?.pending_reports ?? 0}
                icon="flag-outline"
                tint={colors.error}
                onPress={() => pushFromTab(router, "/admin/reports")}
                testID="admin-tile-pending-reports"
              />
            </View>
            <View style={styles.tileRow}>
              <StatTile
                label="Sellers"
                value={stats?.sellers_total ?? 0}
                icon="storefront-outline"
                tint={colors.brand}
                onPress={() => pushFromTab(router, "/shops")}
                testID="admin-tile-sellers"
              />
              <StatTile
                label="Products"
                value={stats?.products_total ?? 0}
                icon="cube-outline"
                tint={colors.brand}
                onPress={() => router.replace("/(tabs)/browse" as any)}
                testID="admin-tile-products"
              />
            </View>
            <View style={styles.tileRow}>
              <StatTile
                label="Orders (7d)"
                value={stats?.orders_7d ?? 0}
                icon="bag-check-outline"
                tint={colors.success}
                full
                onPress={() => pushFromTab(router, "/admin/orders")}
                testID="admin-tile-orders"
              />
            </View>

            <Text style={styles.sectionTitle}>Moderation</Text>
            <View style={styles.card}>
              <Row
                icon="newspaper-outline"
                label="Blog posts awaiting review"
                sub="Approve or reject member submissions"
                onPress={() => pushFromTab(router, "/blog/moderation")}
                testID="admin-nav-blog-moderation"
              />
              <Row
                icon="flag-outline"
                label="User reports"
                sub="Reports on posts, comments, and products"
                onPress={() => pushFromTab(router, "/admin/reports")}
                testID="admin-nav-reports"
              />
            </View>

            <Text style={styles.sectionTitle}>Directory</Text>
            <View style={styles.card}>
              <Row
                icon="storefront-outline"
                label="All sellers"
                sub={`${stats?.sellers_total ?? 0} shops on the marketplace`}
                onPress={() => pushFromTab(router, "/shops")}
                testID="admin-nav-sellers"
              />
            </View>

            {stats?.refreshed_at ? (
              <Text style={styles.refreshedAt}>Refreshed {new Date(stats.refreshed_at).toLocaleTimeString()}</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="admin-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Admin</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function StatTile({
  label,
  value,
  icon,
  tint,
  full = false,
  onPress,
  testID,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  tint: string;
  full?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const content = (
    <>
      <View style={[styles.tileIcon, { backgroundColor: tint + "22" }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <Text style={styles.tileValue}>{value.toLocaleString()}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.tile, full && styles.tileFull]}
        onPress={() => { haptics.tap(); onPress(); }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value.toLocaleString()}`}
        testID={testID}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return (
    <View style={[styles.tile, full && styles.tileFull]} testID={testID}>
      {content}
    </View>
  );
}

function Row({ icon, label, sub, onPress, testID }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; sub?: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity onPress={() => { haptics.tap(); onPress(); }} style={styles.row} testID={testID} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.rowIcon}><Ionicons name={icon} size={20} color={colors.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },

  tileRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  tile: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.lg, ...shadows.card },
  tileFull: { flex: 1 },
  tileIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  tileValue: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  tileLabel: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceMuted, marginTop: 2 },

  sectionTitle: { fontSize: 12, fontWeight: "800", color: colors.onSurfaceMuted, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5, textTransform: "uppercase" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden", ...shadows.card },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },

  refreshedAt: { textAlign: "center", fontSize: 11, color: colors.onSurfaceMuted, marginTop: spacing.lg },
});
