import React, { useCallback, useRef, useState } from "react";
import { Alert, Animated, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError, type NestSellerReadiness } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product, SellerBadge as SellerBadgeType } from "@/src/types";

// The dashboard's order list only needs an id, a status label, and a total.
// The two sources (dashboard `recent_orders` and the seller-orders list) use
// different shapes, so normalize to this minimal row.
type DashOrder = { id: string; status: string; total: number };
import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { EmptyState } from "@/src/components/EmptyState";
import { SellerBadge } from "@/src/components/SellerBadge";
import { BoostSheet } from "@/src/components/BoostSheet";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { pushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { SellerReadinessCard } from "@/src/components/SellerReadinessCard";
import { StatusPill } from "@/src/components/StatusPill";

export default function SellerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<DashOrder[]>([]);
  const [totals, setTotals] = useState<{ orders?: number; revenue?: number; earnings?: number }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [badge, setBadge] = useState<SellerBadgeType | null>(null);
  const [proSeller, setProSeller] = useState(false);
  const [boostProduct, setBoostProduct] = useState<Product | null>(null);
  const [readiness, setReadiness] = useState<NestSellerReadiness | null>(null);

  const lastLoadAt = useRef(0);
  const load = useCallback(async () => {
    if (!user || (user.role !== "seller" && user.role !== "admin")) return;
    try {
      // Fire all requests in parallel. Trust the dashboard endpoint as primary
      // and only fall back to list endpoints if dashboard is missing sections.
      const trustPromises = user.seller_id
        ? [
            nest.trust.getSellerBadge(user.seller_id).catch(() => null),
            nest.trust.getProStatus(user.seller_id).catch(() => null),
          ]
        : [Promise.resolve(null), Promise.resolve(null)];

      const [dashboard, b, pro, r] = await Promise.all([
        nest.getSellerDashboard().catch(() => null),
        trustPromises[0],
        trustPromises[1],
        // v3.7.93 — the readiness endpoint is safe to call on every focus;
        // if the plugin isn't upgraded yet we silently skip the card.
        nest.getSellerReadiness().catch(() => null),
      ]);
      setReadiness(r);

      if (dashboard) {
        setTotals(dashboard.totals || {});
        // v1.0.144 — the dashboard endpoint returns a truncated top-N slice of
        // products, which meant out-of-stock items past that slice never showed
        // up in the seller's product list. Always fetch the seller's full list
        // in parallel so the OOS section header link (and the dedicated OOS
        // screen) can count and surface every affected item.
        nest.getMyProducts({ per_page: 200 }).then((full) => {
          if (full?.items?.length) setProducts(full.items.map(toProduct));
        }).catch(() => { /* fall back to the dashboard slice below */ });
        if (dashboard.products) setProducts(dashboard.products.map(toProduct));
        if (dashboard.recent_orders) {
          // v1.0.46 — the seller-scoped order shape ships `gross`/`total`
          // (v3.7.88+ adds `total`; older plugins only have `gross`). Read
          // either so a seller who has an order never sees $0.00 next to it.
          setOrders(dashboard.recent_orders.map((r) => ({
            id: String(r.id),
            status: r.status,
            total: Number((r as { total?: number | string; gross?: number | string }).total ?? (r as { gross?: number | string }).gross ?? 0),
          })));
        }
      } else {
        // Only fetch list endpoints when the aggregate dashboard call failed.
        const [p, o] = await Promise.all([
          nest.getMyProducts({ per_page: 50 }).catch(() => ({ items: [], total: 0 })),
          nest.getSellerOrders({ per_page: 20 }).catch(() => ({ orders: [], total: 0 })),
        ]);
        if (p.items?.length) setProducts(p.items.map(toProduct));
        if (o.orders?.length) setOrders(o.orders.map((r) => ({ id: String(r.id), status: r.status, total: Number(r.gross ?? 0) })));
      }

      setBadge(b as SellerBadgeType | null);
      setProSeller(!!(pro && (pro as { pro_seller?: boolean }).pro_seller));
      lastLoadAt.current = Date.now();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // v1.0.167 — only reload on focus if data is older than 5 minutes.
  // Preserves scroll position when returning from a pushed edit or
  // detail screen. Pull to refresh forces a reload.
  useFocusEffect(useCallback(() => {
    const stale = Date.now() - lastLoadAt.current > 5 * 60_000;
    if (stale) load();
  }, [load]));

  const confirmDelete = (p: Product) => {
    // v1.0.69 — warn haptic tells the user this is destructive before the
    // dialog animates in; success/error haptic fires after the request.
    haptics.warning();
    Alert.alert("Delete listing", `Remove "${p.title}"? This moves it to trash and hides it from buyers.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await nest.deleteProduct(p.id);
            setProducts((cur) => cur.filter((x) => x.id !== p.id));
            haptics.success();
          } catch (e) {
            haptics.error();
            Alert.alert("Could not delete", e instanceof ApiError ? e.friendly : "Please try again.");
          }
        },
      },
    ]);
  };

  if (!user || (user.role !== "seller" && user.role !== "admin")) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top />
        <EmptyState icon="lock-closed-outline" title="Maker only" message="Apply to become a seller first." actionLabel="Apply" onAction={() => pushFromTab(router, "/seller/apply")} />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top />
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  const earnings = totals.earnings ?? totals.revenue ?? 0;
  // v1.0.153 — drafts have stock=0 while waiting on ship-from / package
  // details; excluding them keeps this count aligned with the listings
  // screen's Out of stock tab.
  const oosCount = products.filter((p) => p.status !== "draft" && (!p.in_stock || p.stock <= 0)).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              // v1.0.70 — manual pull-to-refresh; the on-focus 60s freshness
              // gate stays in place, this just lets a seller force a reload
              // after taking an action outside the app.
              setRefreshing(true);
              load();
            }}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        <Text style={styles.hello}>Hi {user.name.split(" ")[0]},</Text>
        <Text style={styles.shopName}>{user.seller_profile?.shop_name ?? "Your shop"}</Text>

        {badge ? (
          <View style={{ marginBottom: spacing.lg }}>
            <SellerBadge badge={badge} proSeller={proSeller} />
            {/* v1.0.78 — Pro Seller upsell copy removed. Reduced platform fee is
                not an active offer, so the badge stands on its own. */}
          </View>
        ) : null}

        {/* v1.0.52 - stat cards are now real buttons. Tapping Products jumps
            to the seller product list, Orders to the seller orders tab, and
            Earnings to payouts. v1.0.70 — icon backdrops, dollar formatting,
            haptics; Earnings shows cents so tiny orders aren't rounded away. */}
        <View style={styles.statsRow}>
          <Stat
            label="Products"
            value={String(products.length || 0)}
            hint={oosCount > 0 ? `${oosCount} out of stock` : undefined}
            hintTone={oosCount > 0 ? "warning" : undefined}
            icon="cube-outline"
            onPress={() => pushFromTab(router, "/seller/listings")}
            testID="dash-stat-products"
          />
          <Stat
            label="Orders"
            value={String(orders.length || totals.orders || 0)}
            icon="bag-check-outline"
            onPress={() => pushFromTab(router, "/orders")}
            testID="dash-stat-orders"
          />
          <Stat
            label="Earnings"
            value={formatMoney(earnings)}
            hint="Lifetime"
            icon="cash-outline"
            onPress={() => pushFromTab(router, "/seller/payouts")}
            testID="dash-stat-earnings"
          />
        </View>

        <SellerReadinessCard readiness={readiness} />

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Quick actions</Text></View>
        <Button title="+ Create a new listing" onPress={() => pushFromTab(router, "/seller/product-form")} testID="dash-new-product" />

        {/* v1.0.70 — settings destinations moved into a compact 2-column grid
            so the dashboard stops burning half a screen on chevron rows. */}
        <View style={styles.actionGrid}>
          <ActionTile
            icon="storefront-outline"
            label="Shop profile"
            onPress={() => pushFromTab(router, "/seller/shop-settings")}
            testID="dash-shop-profile"
          />
          <ActionTile
            icon="analytics-outline"
            label="Analytics"
            onPress={() => pushFromTab(router, "/seller/analytics")}
            testID="dash-analytics"
          />
          <ActionTile
            icon="cash-outline"
            label="Earnings & payouts"
            onPress={() => pushFromTab(router, "/seller/payouts")}
            testID="dash-payouts"
          />
          {/* v1.0.127 — tile renamed. The old "Shipping (Shippo)" label
              named a vendor sellers never see and lied about where the
              tile went (address form, not a shipping settings screen).
              Route path stays /seller/shippo so the readiness deep link
              keeps working. */}
          <ActionTile
            icon="location-outline"
            label="Ship-from address"
            onPress={() => pushFromTab(router, "/seller/shippo")}
            testID="dash-shippo"
          />
          <ActionTile
            icon="business-outline"
            label="Payout account"
            onPress={() => pushFromTab(router, "/seller/bank")}
            testID="dash-connect"
          />
          <ActionTile
            icon="cloud-upload-outline"
            label="Import CSV"
            onPress={() => pushFromTab(router, "/seller/import")}
            testID="dash-import"
          />
          <ActionTile
            icon="list-outline"
            label="All listings"
            onPress={() => pushFromTab(router, "/seller/listings")}
            testID="dash-listings"
          />
          <ActionTile
            icon="star-outline"
            label="Reviews"
            onPress={() => pushFromTab(router, "/seller/reviews")}
            testID="dash-reviews"
          />
        </View>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent orders</Text></View>
        {orders.length === 0 ? (
          <Text style={styles.empty}>No orders yet.</Text>
        ) : (
          orders.slice(0, 8).map((o) => (
            <TouchableOpacity
              key={o.id}
              style={styles.orderRow}
              onPress={() => {
                haptics.tap();
                pushFromTab(router, `/order/${o.id}`);
              }}
              testID={`dash-order-${o.id}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.orderId}>#{o.id}</Text>
                <StatusPill status={o.status} />
              </View>
              <Text style={styles.orderTotal}>${o.total.toFixed(2)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ))
        )}

        {/* v1.0.144 — surface out-of-stock count in the section header. Tapping
            it routes to a dedicated /seller/out-of-stock page. Only rendered
            when the count is > 0 so a healthy shop sees no red text. */}
        {(() => {
          const oosCount = products.filter((p) => p.status !== "draft" && (!p.in_stock || p.stock <= 0)).length;
          return (
            <View style={[styles.sectionHeader, styles.productsHeaderRow]}>
              <Text style={styles.sectionTitle}>Your products</Text>
              {oosCount > 0 ? (
                <TouchableOpacity
                  onPress={() => {
                    haptics.tap();
                    // v1.0.145 — deep-link the dashboard's OOS count into the
                    // Your listings screen's Out of stock tab so the filter
                    // lives in one place (the listings screen), not on a
                    // separate route.
                    pushFromTab(router, "/seller/listings?filter=oos");
                  }}
                  testID="dash-oos-link"
                  accessibilityLabel={`View ${oosCount} out of stock items`}
                  style={styles.oosLink}
                >
                  <Ionicons name="alert-circle" size={14} color={colors.error} />
                  <Text style={styles.oosLinkText}>Out of stock ({oosCount})</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.error} />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })()}
        {products.length === 0 ? (
          <Text style={styles.empty}>{'No products yet. Tap "Create a new listing".'}</Text>
        ) : (
          products.map((p) => {
            const oos = p.status !== "draft" && (!p.in_stock || p.stock <= 0);
            const low = !oos && p.stock > 0 && p.stock <= 3;
            return (
              <View key={p.id} style={styles.prodRow}>
                <View>
                  <Image
                    source={p.images?.[0] ?? undefined}
                    style={styles.prodImg}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="memory-disk"
                    recyclingKey={String(p.id)}
                  />
                  {oos ? (
                    <View style={styles.oosPill}>
                      <Text style={styles.oosPillText}>OOS</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                  <Text style={styles.prodTitle} numberOfLines={1}>{p.title}</Text>
                  <View style={styles.prodMetaRow}>
                    <Text style={[styles.prodMeta, oos && styles.prodMetaOos, low && styles.prodMetaLow]}>
                      {oos ? "Out of stock" : `Stock: ${p.stock}`}
                    </Text>
                    <Text style={styles.prodMetaDot}> · </Text>
                    <Text style={styles.prodMeta}>${p.price.toFixed(2)}</Text>
                  </View>
                </View>
                <View style={styles.prodActions}>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => {
                      haptics.tap();
                      pushFromTab(router, `/seller/product-form?id=${p.id}`);
                    }}
                    testID={`dash-edit-${p.id}`}
                    accessibilityLabel={`Edit ${p.title}`}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => {
                      haptics.tap();
                      setBoostProduct(p);
                    }}
                    testID={`dash-boost-${p.id}`}
                    accessibilityLabel={`Boost ${p.title}`}
                  >
                    <Ionicons name="rocket-outline" size={18} color={colors.brand} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => confirmDelete(p)}
                    testID={`dash-delete-${p.id}`}
                    accessibilityLabel={`Delete ${p.title}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {boostProduct ? (
        <BoostSheet visible={!!boostProduct} product={boostProduct} onClose={() => setBoostProduct(null)} />
      ) : null}
    </SafeAreaView>
  );
}

// v1.0.70 — small helpers colocated with the dashboard because they're only
// meaningful here. If any of these get reused elsewhere, promote to
// src/components/.

function formatMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

function Stat({
  label,
  value,
  icon,
  onPress,
  testID,
  hint,
  hintTone,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  testID?: string;
  hint?: string;
  hintTone?: "warning" | "info";
}) {
  return (
    <TouchableOpacity
      style={styles.stat}
      onPress={() => {
        if (!onPress) return;
        haptics.tap();
        onPress();
      }}
      disabled={!onPress}
      activeOpacity={0.7}
      testID={testID}
    >
      <View style={styles.statIconWrap}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? (
        <Text style={[styles.statHint, hintTone === "warning" && styles.statHintWarn]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.actionTile}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      activeOpacity={0.75}
      testID={testID}
    >
      <View style={styles.actionIconWrap}>
        <Ionicons name={icon} size={20} color={colors.brand} />
      </View>
      <Text style={styles.actionLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

// v1.0.70 — mirrors the ScrollView layout so first load doesn't collapse to a
// naked spinner. Pulses opacity (native-driven) instead of drawing a gradient
// so it stays cheap on Android.
function DashboardSkeleton() {
  const pulse = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const Block = ({ style }: { style?: object }) => (
    <Animated.View style={[styles.skelBlock, { opacity: pulse }, style]} />
  );
  return (
    <View style={{ padding: spacing.lg }}>
      <Block style={{ width: 100, height: 12, marginBottom: 8 }} />
      <Block style={{ width: 200, height: 24, marginBottom: spacing.lg }} />
      <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg }}>
        <Block style={{ flex: 1, height: 96, borderRadius: radius.lg }} />
        <Block style={{ flex: 1, height: 96, borderRadius: radius.lg }} />
        <Block style={{ flex: 1, height: 96, borderRadius: radius.lg }} />
      </View>
      <Block style={{ height: 48, marginBottom: spacing.md, borderRadius: radius.pill }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Block key={i} style={{ width: "47%", height: 76, borderRadius: radius.md }} />
        ))}
      </View>
      <Block style={{ width: 140, height: 16, marginTop: spacing.lg, marginBottom: spacing.sm }} />
      {Array.from({ length: 3 }).map((_, i) => (
        <Block key={i} style={{ height: 62, borderRadius: radius.md, marginBottom: spacing.sm }} />
      ))}
    </View>
  );
}

// Peer tab header — no back arrow (the dashboard is a primary tab, not a pushed screen).
// v1.0.126 — group bell + cart together on the right instead of spacing them
// apart. Title stays flush-left, action icons cluster flush-right.
function Top() {
  return (
    <View style={styles.top}>
      <Text style={styles.topTitle}>My Nest</Text>
      <View style={styles.topActions}>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  topTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  hello: { fontSize: 14, color: colors.onSurfaceMuted },
  shopName: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.lg },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  stat: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, alignItems: "flex-start", ...shadows.card },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: 2 },
  statLabel: { fontSize: 11, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  statHint: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2 },
  statHintWarn: { color: colors.error, fontWeight: "700" },
  sectionHeader: { marginTop: spacing.lg, marginBottom: spacing.sm },
  productsHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  oosLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  oosLinkText: { color: colors.error, fontWeight: "800", fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.sm },
  empty: { color: colors.onSurfaceMuted, fontStyle: "italic", marginTop: spacing.sm },
  orderRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, gap: spacing.md, ...shadows.card },
  orderId: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: 4 },
  orderTotal: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  prodRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, ...shadows.card },
  prodImg: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  oosPill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(139, 46, 54, 0.85)",
    paddingVertical: 2,
    alignItems: "center",
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  oosPillText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  prodTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  prodMetaRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  prodMeta: { fontSize: 12, color: colors.onSurfaceMuted },
  prodMetaDot: { fontSize: 12, color: colors.onSurfaceMuted },
  prodMetaOos: { color: colors.error, fontWeight: "700" },
  prodMetaLow: { color: colors.warning, fontWeight: "700" },
  prodActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  actionTile: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    ...shadows.card,
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { flex: 1, color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  skelBlock: { backgroundColor: colors.surfaceTertiary, borderRadius: 6 },
});
