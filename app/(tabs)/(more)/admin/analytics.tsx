// v1.0.195 — Admin analytics screen. Powered by /admin/analytics from
// plugin v3.13.59. Sections:
//
//   1. Window picker (7 / 30 / 90 days)
//   2. Headline KPIs: gross revenue, paid orders, AOV, unique buyers
//   3. Revenue timeseries bar chart (daily)
//   4. Orders timeseries bar chart (daily) with refund/new-buyer rates
//   5. Top 5 sellers by revenue
//   6. Top 5 products by units
//
// This is deliberately read-only — no interactions on the rows. The goal
// is a phone-shaped snapshot the marketplace owner can look at once a
// morning, not an analytics workbench.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type AdminAnalytics } from "@/src/api/nest";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { AdminHeader } from "@/src/components/admin/AdminHeader";
import { AdminCard } from "@/src/components/admin/AdminCard";
import { AdminListSkeleton } from "@/src/components/admin/AdminSkeleton";
import { MiniBarChart } from "@/src/components/admin/MiniBarChart";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { pushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

const WINDOWS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export default function AnalyticsScreen() {
  const { user: me } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (me?.role !== "admin") return;
    setError(null);
    try {
      const res = await nest.adminAnalytics(days);
      setData(res);
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Could not load analytics.";
      setError(msg);
      if (data) toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [days, me?.role, data]);

  useEffect(() => {
    setLoading(true);
    void load();
    // Intentionally re-run only when the window changes; `data` is
    // included in load() only for the toast-vs-error decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const fmtMoney = useCallback(
    (n: number) => {
      const cur = data?.currency ?? "USD";
      try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 0 }).format(n);
      } catch {
        return `${cur} ${n.toFixed(0)}`;
      }
    },
    [data?.currency]
  );

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Revenue", value: fmtMoney(data.totals.gross_revenue), icon: "cash-outline" as const, tint: colors.brand },
      { label: "Paid orders", value: data.totals.paid_orders.toLocaleString(), icon: "receipt-outline" as const, tint: colors.success },
      { label: "AOV", value: fmtMoney(data.totals.avg_order_value), icon: "trending-up-outline" as const, tint: colors.warning },
      { label: "Buyers", value: data.totals.unique_buyers.toLocaleString(), icon: "people-outline" as const, tint: colors.brand },
    ];
  }, [data, fmtMoney]);

  if (me?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AdminHeader title="Analytics" backTo="/admin" />
        <EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader
        title="Analytics"
        subtitle={data ? `Last ${data.window_days} days` : undefined}
        backTo="/admin"
        actions={[{ icon: "refresh-outline", label: "Refresh", onPress: () => { setLoading(true); void load(); }, testID: "analytics-refresh" }]}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.windowRow}>
          {WINDOWS.map((w) => {
            const active = w.days === days;
            return (
              <TouchableOpacity
                key={w.days}
                onPress={() => { haptics.tap(); setDays(w.days); }}
                style={[styles.windowBtn, active && styles.windowBtnActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`analytics-window-${w.days}`}
              >
                <Text style={[styles.windowText, active && styles.windowTextActive]}>Last {w.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading && !data ? (
          <AdminListSkeleton rows={4} />
        ) : error && !data ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load" message={error} actionLabel="Retry" onAction={() => { setLoading(true); void load(); }} />
        ) : !data ? null : data.woo_active === false ? (
          <EmptyState icon="storefront-outline" title="WooCommerce off" message="Analytics needs WooCommerce active on the site." />
        ) : (
          <>
            <View style={styles.kpiGrid}>
              {kpis.map((k) => (
                <View key={k.label} style={styles.kpiTile}>
                  <View style={[styles.kpiIcon, { backgroundColor: k.tint + "22" }]}>
                    <Ionicons name={k.icon} size={16} color={k.tint} />
                  </View>
                  <Text style={styles.kpiValue}>{k.value}</Text>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                </View>
              ))}
            </View>

            <AdminCard>
              <Text style={styles.chartTitle}>Revenue by day</Text>
              <MiniBarChart points={data.revenue_series} height={110} format={fmtMoney} testID="analytics-revenue-chart" />
            </AdminCard>

            <AdminCard>
              <Text style={styles.chartTitle}>Orders by day</Text>
              <MiniBarChart points={data.order_series} height={90} color={colors.success} testID="analytics-orders-chart" />
              <View style={styles.rateRow}>
                <RateChip label="Refund rate" value={pct(data.rates.refund_rate)} tone={data.rates.refund_rate > 0.05 ? "warn" : "neutral"} />
                <RateChip label="New buyer share" value={pct(data.rates.new_buyer_share)} tone="good" />
                <RateChip label="Refunded orders" value={String(data.totals.refunded)} tone={data.totals.refunded > 0 ? "warn" : "neutral"} />
              </View>
            </AdminCard>

            <Text style={styles.sectionTitle}>Top sellers</Text>
            {data.top_sellers.length === 0 ? (
              <AdminCard><Text style={styles.emptyRow}>No sales in the window</Text></AdminCard>
            ) : (
              <View style={styles.card}>
                {data.top_sellers.map((s, i) => (
                  <View key={s.seller_id} style={styles.rankRow}>
                    <Text style={styles.rank}>#{i + 1}</Text>
                    <Text style={styles.rankName} numberOfLines={1}>{s.name}</Text>
                    <Text style={styles.rankValue}>{fmtMoney(s.revenue)}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>Top products</Text>
            {data.top_products.length === 0 ? (
              <AdminCard><Text style={styles.emptyRow}>No sales in the window</Text></AdminCard>
            ) : (
              <View style={styles.card}>
                {data.top_products.map((p, i) => (
                  <TouchableOpacity key={p.product_id} style={styles.rankRow} onPress={() => pushFromTab(router, `/product/${p.product_id}`)}>
                    <Text style={styles.rank}>#{i + 1}</Text>
                    <Text style={styles.rankName} numberOfLines={2}>{p.title || `#${p.product_id}`}</Text>
                    <Text style={styles.rankValue}>{p.units} sold</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.footer}>Refreshed {relTime(data.refreshed_at)}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- helpers ---

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function relTime(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - t);
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

function RateChip({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "neutral" }) {
  const bg = tone === "good" ? colors.success + "1A" : tone === "warn" ? colors.warning + "22" : colors.surfaceTertiary;
  const fg = tone === "good" ? colors.success : tone === "warn" ? colors.warning : colors.onSurfaceMuted;
  return (
    <View style={[styles.rateChip, { backgroundColor: bg }]}>
      <Text style={[styles.rateChipValue, { color: fg }]}>{value}</Text>
      <Text style={styles.rateChipLabel}>{label}</Text>
    </View>
  );
}

// v1.0.229 — Admin Analytics refinement. Window tabs, KPI tiles,
// ranked-lists card, and rate chips move to white cards on cream with
// hairline borders and typography tokens.
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
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  kpiTile: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  kpiIcon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  kpiValue: { ...typeTokens.display, fontSize: 20 },
  kpiLabel: { ...typeTokens.caption, marginTop: 2 },
  chartTitle: { ...typeTokens.caption, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  rateRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  rateChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.chip, minWidth: 90 },
  rateChipValue: { ...typeTokens.body, fontWeight: "800", fontSize: 15 },
  rateChipLabel: { ...typeTokens.micro, marginTop: 2 },
  sectionTitle: { ...typeTokens.micro, fontWeight: "800", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  rankRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rank: { ...typeTokens.micro, fontWeight: "800", width: 28 },
  rankName: { flex: 1, ...typeTokens.body, fontWeight: "700" },
  rankValue: { ...typeTokens.caption, fontWeight: "800", color: colors.brand },
  emptyRow: { ...typeTokens.caption, textAlign: "center" },
  footer: { ...typeTokens.micro, textAlign: "center", marginTop: spacing.xl },
});
