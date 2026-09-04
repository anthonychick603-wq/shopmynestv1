// v1.0.91 — Seller analytics dashboard. Reads /seller/analytics (plugin
// v3.7.118+), lets the seller flip between 7/30/90-day windows, and shows
// a bar-based revenue sparkline, KPI tiles (net, orders, refund rate,
// pending payout), and the top 5 products by gross. No external chart
// dependency — bars are simple <View>s with computed heights.
//
// v1.0.137 — adds two new sections powered by plugin v3.13.4:
//   • Order status breakdown (processing / on-hold / completed / refunded)
//     so sellers can see "3 orders waiting to ship" at a glance.
//   • Customer summary (unique + new/repeat counts + repeat-rate KPI) so
//     sellers can watch marketplace-health metrics over time.
//
// v1.0.138 — adds an inline "Recent payouts" strip (3 most recent rows)
// sourced from the existing /seller/payouts endpoint. Tapping "See all"
// pushes into the dedicated payouts screen; taps on a row do the same.
// Kept intentionally compact so the analytics page stays a summary and
// the payouts screen remains the source of truth.
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { format, parseISO } from "date-fns";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { nest, ApiError, type SellerAnalytics, type NestPayoutRaw } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { useLatestRequest } from "@/src/hooks/use-latest-request";

type Range = 7 | 30 | 90;
const RANGES: { key: Range; label: string }[] = [
  { key: 7, label: "7d" },
  { key: 30, label: "30d" },
  { key: 90, label: "90d" },
];

export default function SellerAnalytics() {
  useBackFallback("/seller/dashboard");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [range, setRange] = useState<Range>(30);
  const [data, setData] = useState<SellerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v1.0.138 — recent payouts strip. Fetched alongside analytics but kept
  // in its own state so a payouts network failure doesn't blank out the
  // rest of the dashboard. Silent-fail on error (same pattern as the home
  // feed carousels).
  const [payouts, setPayouts] = useState<NestPayoutRaw[]>([]);
  // v1.0.247 — track payouts-only failure separately so a payouts fetch
  // failure no longer silently masquerades as "no payouts yet" (audit P1).
  const [payoutsError, setPayoutsError] = useState<string | null>(null);
  // v1.0.93 (Build #15) — CSV export state; export is a one-off action so
  // we only track a busy flag, not a full request lifecycle.
  const [exporting, setExporting] = useState(false);
  // v1.0.247 — last CSV export path so we can clean it up before writing
  // the next one. Avoids the cache growing unbounded on device (audit P1).
  const lastExportPathRef = React.useRef<string | null>(null);
  // v1.0.247 — useLatestRequest so a rapid 7d→30d→7d toggle can't let
  // the older range's response arrive last and overwrite the visible
  // chart with the wrong data (audit P0).
  const { begin, isCurrent } = useLatestRequest();

  const onExport = useCallback(async () => {
    if (exporting) return;
    // v1.0.247 — assert cacheDirectory is non-null. expo-file-system
    // /legacy types it as `string | null`; if it's null we'd write to
    // `"nullshopmynest-analytics-…"` and hit an opaque error (audit P1).
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      toast.error("Storage unavailable on this device. Can't export right now.");
      return;
    }
    setExporting(true);
    try {
      // v1.0.247 — delete the previous export before writing a new one
      // so the cache directory doesn't grow unbounded across many
      // exports (audit P1). Ignore errors on cleanup — old file may
      // already be gone.
      if (lastExportPathRef.current) {
        try {
          await FileSystem.deleteAsync(lastExportPathRef.current, { idempotent: true });
        } catch { /* best-effort cleanup */ }
      }
      const res = await nest.exportSellerAnalytics(range);
      const target = `${cacheDir}${res.filename}`;
      await FileSystem.writeAsStringAsync(target, res.csv, { encoding: FileSystem.EncodingType.UTF8 });
      lastExportPathRef.current = target;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(target, { mimeType: "text/csv", dialogTitle: "Export orders", UTI: "public.comma-separated-values-text" });
      } else {
        toast.success(`Saved ${res.filename}`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Couldn't export orders.");
    } finally {
      setExporting(false);
    }
  }, [exporting, range]);

  const load = useCallback(async (next: Range) => {
    const reqId = begin();
    setLoading(true);
    setError(null);
    try {
      // v1.0.138 — fetch analytics + payouts in parallel. Payout errors
      // don't fail the analytics load: they surface in their own strip.
      const [analyticsRes, payoutsRes] = await Promise.allSettled([
        nest.getSellerAnalytics(next),
        nest.getSellerPayouts(),
      ]);
      if (!isCurrent(reqId)) return;
      if (analyticsRes.status === "fulfilled") {
        setData(analyticsRes.value);
      } else {
        const reason = analyticsRes.reason;
        setError(reason instanceof ApiError ? reason.friendly : "Could not load analytics.");
      }
      if (payoutsRes.status === "fulfilled") {
        setPayouts(payoutsRes.value.payouts || []);
        setPayoutsError(null);
      } else {
        // v1.0.247 — surface a distinct error rather than silently
        // rendering an empty payouts strip (audit P1).
        const reason = payoutsRes.reason;
        setPayouts([]);
        setPayoutsError(reason instanceof ApiError ? reason.friendly : "Couldn't load recent payouts.");
      }
    } finally {
      if (isCurrent(reqId)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [begin, isCurrent]);

  // v1.0.167 — load on mount and when the range changes. Focus
  // refetch removed so scroll and pagination survive returning from
  // a pushed screen.
  React.useEffect(() => { load(range); }, [load, range]);

  if (!user || (user.role !== "seller" && user.role !== "admin")) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/seller/dashboard")} />
        <EmptyState icon="lock-closed-outline" title="Maker only" message="Analytics are for approved sellers." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/seller/dashboard")} />

      <View style={styles.tabs}>
        {RANGES.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => { haptics.tap(); setRange(t.key); }}
            style={[styles.tab, range === t.key && styles.tabActive]}
            testID={`analytics-range-${t.key}`}
            accessibilityRole="button"
          >
            <Text style={[styles.tabLabel, range === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !data ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : error && !data ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="We couldn't load analytics"
          message={error}
          actionLabel="Retry"
          onAction={() => load(range)}
          testID="analytics-error"
        />
      ) : !data ? null : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(range); }}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
         keyboardShouldPersistTaps="handled">
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>Revenue (net)</Text>
            <TouchableOpacity
              onPress={() => { haptics.tap(); onExport(); }}
              disabled={exporting}
              style={styles.exportBtn}
              testID="analytics-export"
              accessibilityRole="button"
              accessibilityLabel="Export orders as CSV"
            >
              <Ionicons name={exporting ? "time-outline" : "download-outline"} size={14} color={colors.brand} />
              <Text style={styles.exportBtnText}>{exporting ? "Exporting…" : "Export CSV"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.chartCard}>
            <Text style={styles.chartTotal}>${data.total_net.toFixed(2)}</Text>
            <Text style={styles.chartHint}>${data.total_gross.toFixed(2)} gross · ${data.total_fees.toFixed(2)} platform fees</Text>
            {data.compare ? (
              <View style={styles.compareRow}>
                <CompareChip
                  label="vs prior"
                  delta={data.compare.delta_gross}
                  pct={data.compare.pct_gross}
                  format="currency"
                />
                <CompareChip
                  label="orders"
                  delta={data.compare.delta_orders}
                  pct={data.compare.pct_orders}
                  format="count"
                />
              </View>
            ) : null}
            <RevenueBars series={data.revenue} />
          </View>

          <Text style={styles.sectionLabel}>Overview</Text>
          <View style={styles.kpiGrid}>
            <Kpi label="Orders" value={String(data.orders_count)} icon="bag-check-outline" />
            {/* v1.0.247 — refund_rate contract audit P2: the field is
                documented as a 0-1 decimal (`0.05 = 5%`). Clamp to a
                sane range so a server contract slip (returning `5` for
                `5%`) doesn't render the tile as "500.0%". */}
            <Kpi label="Refund rate" value={`${(Math.min(1, Math.max(0, data.refund_rate)) * 100).toFixed(1)}%`} icon="return-down-back-outline" tone={data.refund_rate > 0.05 ? "warning" : "default"} />
            <Kpi label="Pending payout" value={`$${data.pending_payout.toFixed(2)}`} icon="wallet-outline" />
            <Kpi label="Avg order" value={`$${data.orders_count > 0 ? (data.total_gross / data.orders_count).toFixed(2) : "0.00"}`} icon="analytics-outline" />
          </View>

          {data.status_breakdown ? (
            <>
              <Text style={styles.sectionLabel}>Order status</Text>
              <View style={styles.statusRow}>
                <StatusTile label="Processing" count={data.status_breakdown.processing} tone="info" icon="time-outline" />
                <StatusTile label="On hold" count={data.status_breakdown.on_hold} tone="warning" icon="pause-circle-outline" />
                <StatusTile label="Completed" count={data.status_breakdown.completed} tone="success" icon="checkmark-circle-outline" />
                <StatusTile label="Refunded" count={data.status_breakdown.refunded} tone="error" icon="return-down-back-outline" />
              </View>
            </>
          ) : null}

          {data.customers ? (
            <>
              <Text style={styles.sectionLabel}>Customers</Text>
              <View style={styles.kpiGrid}>
                <Kpi label="Unique buyers" value={String(data.customers.unique)} icon="people-outline" />
                <Kpi label="Repeat rate" value={`${(data.customers.repeat_rate * 100).toFixed(1)}%`} icon="repeat-outline" />
                <Kpi label="New" value={String(data.customers.new)} icon="person-add-outline" />
                <Kpi label="Returning" value={String(data.customers.repeat)} icon="person-circle-outline" />
              </View>
            </>
          ) : null}

          {/* v1.0.247 — payouts strip failure surface (audit P1). If
              the payouts fetch failed, show a compact retry affordance
              so the seller knows the strip is empty because the
              request failed, not because they've never had a payout. */}
          {payoutsError && payouts.length === 0 ? (
            <View style={styles.payoutErrorCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>Recent payouts</Text>
                <Text style={styles.payoutErrorText}>{payoutsError}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { haptics.tap(); load(range); }}
                style={styles.seeAllBtn}
                accessibilityRole="button"
                accessibilityLabel="Retry loading recent payouts"
                testID="analytics-payouts-retry"
              >
                <Text style={styles.seeAllText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {payouts.length > 0 ? (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>Recent payouts</Text>
                <TouchableOpacity
                  onPress={() => { haptics.tap(); router.push("/seller/payouts" as Href); }}
                  style={styles.seeAllBtn}
                  accessibilityRole="button"
                  accessibilityLabel="See all payouts"
                  testID="analytics-payouts-see-all"
                >
                  <Text style={styles.seeAllText}>See all</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.brand} />
                </TouchableOpacity>
              </View>
              {payouts.slice(0, 3).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.payoutRow}
                  activeOpacity={0.7}
                  onPress={() => { haptics.tap(); router.push("/seller/payouts" as Href); }}
                  testID={`analytics-payout-${p.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Payout of $${p.amount.toFixed(2)}, ${payoutStatusLabel(p.status)}`}
                >
                  <View style={[styles.payoutIcon, { backgroundColor: payoutTone(p.status) + "22" }]}>
                    <Ionicons name={payoutIcon(p.status)} size={16} color={payoutTone(p.status)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payoutAmount}>${p.amount.toFixed(2)}</Text>
                    <Text style={styles.payoutMeta} numberOfLines={1}>
                      {payoutStatusLabel(p.status)} · {payoutDate(p)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
                </TouchableOpacity>
              ))}
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Top products</Text>
          {data.top_products.length === 0 ? (
            <View style={styles.emptyProducts}>
              <Text style={styles.emptyProductsText}>No sales in this window yet.</Text>
            </View>
          ) : (
            data.top_products.map((p, i) => (
              <TouchableOpacity
                key={p.id}
                style={styles.productRow}
                activeOpacity={0.7}
                onPress={() => { haptics.tap(); router.push(`/product/${p.id}` as Href); }}
                testID={`analytics-top-${p.id}`}
               accessibilityRole="button">
                <Text style={styles.rank}>#{i + 1}</Text>
                <AppImage source={{ uri: p.image }} style={styles.productImg} fallbackIcon="pricetag-outline" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
                  <Text style={styles.productMeta}>${p.gross.toFixed(2)} gross</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RevenueBars({ series }: { series: SellerAnalytics["revenue"] }) {
  const max = Math.max(1, ...series.map((s) => s.revenue));
  // v1.0.247 — dropped unused `n` and the unused `i` in the first map
  // (audit P3). The second map still uses `i` for the label step.
  const labelStep = Math.max(1, Math.ceil(series.length / 6));
  return (
    <View style={styles.barsWrap}>
      <View style={styles.bars} accessibilityRole="summary">
        {series.map((pt) => {
          const h = Math.max(2, (pt.revenue / max) * 100);
          return (
            <View key={pt.date} style={styles.barCol}>
              <View style={[styles.bar, { height: `${h}%`, backgroundColor: pt.revenue > 0 ? colors.brand : colors.surfaceTertiary }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.barLabels}>
        {series.map((pt, i) => (
          <Text
            key={pt.date}
            style={[styles.barLabel, { flex: 1, textAlign: "center" }]}
            numberOfLines={1}
          >
            {i % labelStep === 0 ? safeFormat(pt.date) : " "}
          </Text>
        ))}
      </View>
    </View>
  );
}

function safeFormat(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return "";
  }
}

// v1.0.138 — payout row helpers. Status strings come from the plugin as
// lowercase snake / kebab-case; we normalize for display.
function payoutStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "paid") return "Paid";
  if (s === "processing") return "Processing";
  if (s === "requested") return "Requested";
  if (s === "cancelled" || s === "canceled") return "Cancelled";
  if (s === "failed") return "Failed";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function payoutTone(status: string): string {
  const s = status.toLowerCase();
  if (s === "paid") return colors.success;
  if (s === "processing" || s === "requested") return colors.brand;
  if (s === "failed") return colors.error;
  return colors.onSurfaceMuted;
}

function payoutIcon(status: string): keyof typeof import("@expo/vector-icons").Ionicons.glyphMap {
  const s = status.toLowerCase();
  if (s === "paid") return "checkmark-circle-outline";
  if (s === "processing") return "sync-outline";
  if (s === "requested") return "time-outline";
  if (s === "failed") return "alert-circle-outline";
  if (s === "cancelled" || s === "canceled") return "close-circle-outline";
  return "wallet-outline";
}

function payoutDate(p: NestPayoutRaw): string {
  const iso = p.processed_at || p.requested_at;
  if (!iso) return "";
  return safeFormat(iso);
}

// v1.0.137 — small tile for the Order status row. Purely informational
// (no tap target); sellers action orders from the seller dashboard tab.
// Zero-count tiles render in muted colors so the eye lands on rows that
// actually need attention.
function StatusTile({ label, count, tone, icon }: { label: string; count: number; tone: "info" | "warning" | "success" | "error"; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap }) {
  const active = count > 0;
  const toneColor =
    tone === "info" ? colors.brand :
    tone === "warning" ? colors.warning :
    tone === "success" ? colors.success :
    colors.error;
  return (
    <View style={[styles.statusTile, active ? { backgroundColor: toneColor + "14", borderColor: toneColor + "33" } : null]}>
      <Ionicons name={icon} size={14} color={active ? toneColor : colors.onSurfaceMuted} />
      <Text style={[styles.statusCount, { color: active ? toneColor : colors.onSurfaceMuted }]}>{count}</Text>
      <Text style={styles.statusLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap; tone?: "warning" | "default" }) {
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, tone === "warning" ? { backgroundColor: colors.warning + "22" } : null]}>
        <Ionicons name={icon} size={16} color={tone === "warning" ? colors.warning : colors.brand} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

// v1.0.93 (Build #15) — small delta pill used under the revenue headline
// to compare the current window to the previous same-length window.
// pct=null means the previous window had zero baseline; render — instead
// of an unbounded percentage.
function CompareChip({
  label,
  delta,
  pct,
  format,
}: {
  label: string;
  delta: number;
  pct: number | null;
  format: "currency" | "count";
}) {
  const positive = delta > 0;
  const negative = delta < 0;
  const tone = positive ? colors.success : negative ? colors.error : colors.onSurfaceMuted;
  const glyph: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap = positive
    ? "arrow-up"
    : negative
      ? "arrow-down"
      : "remove";
  const magnitude = Math.abs(delta);
  const primary =
    format === "currency"
      ? `${positive ? "+" : negative ? "-" : ""}$${magnitude.toFixed(2)}`
      : `${positive ? "+" : negative ? "-" : ""}${magnitude}`;
  const pctText = pct == null ? "—" : `${Math.abs(pct).toFixed(1)}%`;
  return (
    <View style={styles.compareChip}>
      <Ionicons name={glyph} size={12} color={tone} />
      <Text style={[styles.compareValue, { color: tone }]}>{primary}</Text>
      <Text style={styles.comparePct}>{pctText}</Text>
      <Text style={styles.compareLabel}>{label}</Text>
    </View>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="analytics-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Analytics</Text>
      <AlertsBellButton />
    </View>
  );
}

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
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },

  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, alignSelf: "flex-start" },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  tabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabLabel: { ...typeTokens.micro, fontWeight: "700", color: colors.onSurfaceMuted },
  tabLabelActive: { color: colors.onBrand },

  sectionLabel: { ...typeTokens.micro, fontWeight: "800", color: colors.onSurfaceMuted, letterSpacing: 0.6, textTransform: "uppercase", marginTop: spacing.md, marginBottom: spacing.sm },

  chartCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chartTotal: { ...typeTokens.display, fontSize: 28 },
  chartHint: { ...typeTokens.caption, marginBottom: spacing.md },
  barsWrap: { height: 130 },
  bars: { flexDirection: "row", alignItems: "flex-end", height: 100, gap: 2 },
  barCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 2, backgroundColor: colors.brand, minHeight: 2 },
  barLabels: { flexDirection: "row", marginTop: spacing.xs },
  barLabel: { fontSize: 9, color: colors.onSurfaceMuted },

  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kpi: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  kpiIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand + "22", alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  kpiValue: { ...typeTokens.h1, fontSize: 20 },
  kpiLabel: { ...typeTokens.micro, color: colors.onSurfaceMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.3 },

  emptyProducts: { padding: spacing.lg, alignItems: "center" },
  emptyProductsText: { ...typeTokens.caption },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  rank: { ...typeTokens.caption, width: 22, textAlign: "center", fontWeight: "800" },
  productImg: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  productName: { ...typeTokens.caption, fontWeight: "700", color: colors.onSurface },
  productMeta: { ...typeTokens.caption, marginTop: 2 },

  // v1.0.93 (Build #15) — header row with the CSV export chip inline.
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brand + "1a", borderWidth: 1, borderColor: colors.brand + "33" },
  exportBtnText: { ...typeTokens.micro, fontWeight: "800", color: colors.brand },
  compareRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  compareChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  compareValue: { ...typeTokens.micro, fontWeight: "800" },
  comparePct: { ...typeTokens.micro, color: colors.onSurfaceMuted, fontWeight: "700" },
  compareLabel: { ...typeTokens.micro, color: colors.onSurfaceMuted, marginLeft: 2 },

  // v1.0.137 — order-status row tiles.
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statusTile: {
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  statusCount: { ...typeTokens.h2, fontSize: 18, minWidth: 18 },
  statusLabel: { ...typeTokens.caption, fontWeight: "700", flexShrink: 1 },

  // v1.0.138 — Recent payouts strip.
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  seeAllText: { ...typeTokens.micro, fontWeight: "800", color: colors.brand },
  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  payoutIcon: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  payoutAmount: { ...typeTokens.body, fontWeight: "800", color: colors.onSurface },
  payoutMeta: { ...typeTokens.caption, marginTop: 2 },
  // v1.0.247 — payouts-strip failure surface.
  payoutErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  payoutErrorText: { ...typeTokens.caption, marginTop: 2, color: colors.onSurface },
});
