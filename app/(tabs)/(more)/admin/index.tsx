// v1.0.86 — Admin drawer entry point. Small in-app control panel for
// marketplace owners; gated at the account.tsx entry by user.role === "admin",
// and every REST route it consumes rejects non-admins with 403 (plugin v3.7.114
// MNU_Admin_Console).
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";

import { nest, ApiError, type AdminStats, type AdminAnalytics } from "@/src/api/nest";
import { MiniBarChart } from "@/src/components/admin/MiniBarChart";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack, pushFromTab } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { useLoadOnce } from "@/src/hooks/use-load-once";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { parseServerDate } from "@/src/utils/datetime";

export default function AdminDashboard() {
  useBackFallback("/(tabs)/account");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatestRequest();

  // v1.0.196 — hydrate both the stat counts and the 7-day analytics
  // snapshot in parallel so the redesigned overview can render its
  // revenue chart alongside the existing tiles without a second visible
  // spinner. Failure of the analytics call is non-fatal — the stats
  // section still renders.
  // v1.0.249 — guard every post-await setter with useLatestRequest so a
  // rapid pull-to-refresh + focus-refetch collision can't overwrite the
  // newer response with the older one.
  const load = useCallback(async () => {
    const id = begin();
    setError(null);
    try {
      const [statsRes, analyticsRes] = await Promise.allSettled([
        nest.adminStats(),
        nest.adminAnalytics(7),
      ]);
      if (!isCurrent(id)) return;
      if (statsRes.status === "fulfilled") setStats(statsRes.value);
      else throw statsRes.reason;
      if (analyticsRes.status === "fulfilled") setAnalytics(analyticsRes.value);
    } catch (e) {
      if (!isCurrent(id)) return;
      setError(e instanceof ApiError ? e.friendly : "Could not load admin stats.");
    } finally {
      if (isCurrent(id)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [begin, isCurrent]);

  // v1.0.167 — load once on mount, refetch when the screen has been out
  // of focus long enough that the tiles could be stale.
  // v1.0.236 — dropped from 5 minutes to 30 seconds. The admin dashboard
  // tiles show live counts (pending refunds, unpaid payouts, seller apps,
  // reports); five minutes was too long. The plugin‑side no-store and
  // cache-purge changes make this cheap.
  // v1.0.249 — call markLoaded on manual pull-to-refresh so the stale
  // timer restarts against the fresh data rather than piling another
  // fetch on top.
  const { markLoaded } = useLoadOnce(load, { staleMs: 30_000 });

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
            onRefresh={() => {
              if (loading || refreshing) return; // v1.0.249 dedupe
              setRefreshing(true);
              void load().then(() => markLoaded());
            }}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        testID="admin-scroll"
       keyboardShouldPersistTaps="handled">
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
                onPress={() => router.replace("/(tabs)/browse" as Href)}
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

            {/* v1.0.196 — Mini revenue chart at the top of the overview.
                Tapping it deep-links into the full Analytics screen. Kept
                intentionally small (90 px) so it doesn't crowd the tile
                grid above. */}
            {analytics && analytics.revenue_series.length > 0 ? (
              <TouchableOpacity
                onPress={() => { haptics.tap(); pushFromTab(router, "/admin/analytics"); }}
                style={styles.revenueCard}
                accessibilityRole="button"
                accessibilityLabel={`Revenue in the last 7 days: ${analytics.totals.gross_revenue}`}
                testID="admin-mini-revenue"
              >
                <View style={styles.revenueHeader}>
                  <View>
                    <Text style={styles.revenueLabel}>Revenue (7d)</Text>
                    <Text style={styles.revenueValue}>{fmtCurrency(analytics.totals.gross_revenue, analytics.currency)}</Text>
                  </View>
                  <View style={styles.revenueMetaCol}>
                    <Text style={styles.revenueMeta}>{analytics.totals.paid_orders} orders</Text>
                    <Text style={styles.revenueMeta}>AOV {fmtCurrency(analytics.totals.avg_order_value, analytics.currency)}</Text>
                  </View>
                </View>
                <MiniBarChart
                  points={analytics.revenue_series}
                  height={64}
                  format={(n) => fmtCurrency(n, analytics.currency)}
                  showEndpointLabels={false}
                  showPeakLabel={false}
                />
                <View style={styles.revenueFooter}>
                  <Text style={styles.revenueFooterText}>Tap for full analytics</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.brand} />
                </View>
              </TouchableOpacity>
            ) : null}

            {/* v1.0.193 — People section: user + seller management. */}
            <Text style={styles.sectionTitle}>People</Text>
            <View style={styles.card}>
              <Row
                icon="people-outline"
                label="Users"
                sub="Search accounts, promote, or suspend"
                onPress={() => pushFromTab(router, "/admin/users")}
                testID="admin-nav-users"
              />
              <Row
                icon="cube-outline"
                label="Products"
                sub="Feature, hide, or unlist listings across every seller"
                onPress={() => pushFromTab(router, "/admin/products")}
                testID="admin-nav-products"
              />
              <Row
                icon="bar-chart-outline"
                label="Analytics"
                sub="Revenue, orders, top sellers, and refund rate"
                onPress={() => pushFromTab(router, "/admin/analytics")}
                testID="admin-nav-analytics"
              />
            </View>

            {/* v1.0.200 — Catalog section: taxonomy management. */}
            <Text style={styles.sectionTitle}>Catalog</Text>
            <View style={styles.card}>
              <Row
                icon="pricetags-outline"
                label="Categories"
                sub="Browse, add, rename, and reorganize product categories"
                onPress={() => pushFromTab(router, "/admin/categories")}
                testID="admin-nav-categories"
              />
            </View>

            <Text style={styles.sectionTitle}>Operations</Text>
            <View style={styles.card}>
              <Row
                icon="pulse-outline"
                label="Operational queues"
                sub="Order exceptions, buyer-protection cases, and pending reports"
                onPress={() => pushFromTab(router, "/admin/operations")}
                testID="admin-nav-operations"
              />
              <Row
                icon="bag-check-outline"
                label="All orders"
                sub="Marketplace-wide order history"
                onPress={() => pushFromTab(router, "/admin/orders")}
                testID="admin-nav-orders"
              />
            </View>

            {/* v1.0.192 — Money section pulls the previously-buried
                payouts / refunds / coupons / reconciliation surfaces up
                to first-class rows so admins don't have to drill through
                the Operations screen to reach them. */}
            <Text style={styles.sectionTitle}>Money</Text>
            <View style={styles.card}>
              <Row
                icon="cash-outline"
                label="Payouts"
                sub="Process, retry, or cancel seller payouts"
                onPress={() => pushFromTab(router, "/admin/payouts")}
                testID="admin-nav-payouts"
              />
              <Row
                icon="return-down-back-outline"
                label="Refund review"
                sub="Approve or deny buyer refund requests"
                onPress={() => pushFromTab(router, "/admin/refunds")}
                testID="admin-nav-refunds"
              />
              <Row
                icon="pricetags-outline"
                label="Site-wide coupons"
                sub="Marketplace-wide promo codes that stack over seller coupons"
                onPress={() => pushFromTab(router, "/admin/coupons")}
                testID="admin-nav-coupons"
              />
              <Row
                icon="shield-checkmark-outline"
                label="Reconciliation"
                sub="Ledger, transfer, and refund state mismatches"
                onPress={() => pushFromTab(router, "/admin/reconciliation")}
                testID="admin-nav-reconciliation"
              />
              <Row
                icon="person-add-outline"
                label="Seller applications"
                sub="Approve or reject handmade shop applications"
                onPress={() => pushFromTab(router, "/admin/seller-applications")}
                testID="admin-nav-seller-applications"
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
              <Text style={styles.refreshedAt}>Refreshed {(parseServerDate(stats.refreshed_at) ?? new Date()).toLocaleTimeString()}</Text>
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
      <AlertsBellButton />
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

// v1.0.196 — shared currency formatter for the mini revenue card.
// Kept local to avoid a util-file dance; the analytics screen has its
// own equivalent.
function fmtCurrency(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(0)}`;
  }
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

// v1.0.229 — Admin dashboard refinement. Revenue hero, KPI tiles, and
// nav rows migrate to white cards on cream with hairline structure.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { ...typeTokens.h1, fontSize: 18 },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  revenueCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  revenueHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.sm },
  revenueLabel: { ...typeTokens.caption, fontWeight: "600" },
  revenueValue: { ...typeTokens.display, fontSize: 22, marginTop: 2 },
  revenueMetaCol: { alignItems: "flex-end" },
  revenueMeta: { ...typeTokens.micro, fontWeight: "600" },
  revenueFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: spacing.xs, marginTop: spacing.sm },
  revenueFooterText: { ...typeTokens.micro, color: colors.brand, fontWeight: "700" },

  tileRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  tile: {
    flex: 1,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  tileFull: { flex: 1 },
  tileIcon: { width: 34, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  tileValue: { ...typeTokens.display, fontSize: 22 },
  tileLabel: { ...typeTokens.caption, fontWeight: "600", marginTop: 2 },

  sectionTitle: { ...typeTokens.micro, fontWeight: "800", color: colors.onSurfaceMuted, marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 0.5, textTransform: "uppercase" },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline },
  rowLabel: { ...typeTokens.body, fontWeight: "700", fontSize: 15 },
  rowSub: { ...typeTokens.caption, marginTop: 2 },

  refreshedAt: { ...typeTokens.micro, textAlign: "center", marginTop: spacing.lg },
});
