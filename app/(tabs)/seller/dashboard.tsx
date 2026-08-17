import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
import { SellerReadinessCard } from "@/src/components/SellerReadinessCard";

export default function SellerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<DashOrder[]>([]);
  const [totals, setTotals] = useState<{ orders?: number; revenue?: number; earnings?: number }>({});
  const [loading, setLoading] = useState(true);
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
    }
  }, [user]);

  // Only reload on focus if data is older than 60s to eliminate stutter
  // when quickly switching tabs.
  useFocusEffect(useCallback(() => {
    const stale = Date.now() - lastLoadAt.current > 60_000;
    if (stale) load();
  }, [load]));

  const confirmDelete = (p: Product) => {
    Alert.alert("Delete listing", `Remove "${p.title}"? This moves it to trash and hides it from buyers.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await nest.deleteProduct(p.id);
            setProducts((cur) => cur.filter((x) => x.id !== p.id));
          } catch (e) {
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
        <EmptyState icon="lock-closed-outline" title="Maker only" message="Apply to become a seller first." actionLabel="Apply" onAction={() => router.push("/seller/apply")} />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top />
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.hello}>Hi {user.name.split(" ")[0]},</Text>
        <Text style={styles.shopName}>{user.seller_profile?.shop_name ?? "Your shop"}</Text>

        {badge ? (
          <View style={{ marginBottom: spacing.lg }}>
            <SellerBadge badge={badge} proSeller={proSeller} />
            {!proSeller ? (
              <Text style={styles.proHint}>Pro Sellers get a reduced platform fee and priority placement. Managed from your web dashboard.</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <Stat label="Products" value={String(products.length || totals.orders || 0)} icon="cube-outline" />
          <Stat label="Orders" value={String(orders.length || totals.orders || 0)} icon="bag-check-outline" />
          <Stat label="Earnings" value={`$${(totals.earnings ?? totals.revenue ?? 0).toFixed(0)}`} icon="cash-outline" />
        </View>

        <SellerReadinessCard readiness={readiness} />

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Quick actions</Text></View>
        <Button title="+ Create a new listing" onPress={() => router.push("/seller/product-form")} testID="dash-new-product" />
        <TouchableOpacity style={styles.payoutsBtn} onPress={() => router.push("/seller/payouts")} testID="dash-payouts">
          <Ionicons name="cash-outline" size={18} color={colors.brand} />
          <Text style={styles.payoutsBtnText}>Earnings & payouts</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.payoutsBtn} onPress={() => router.push("/seller/shippo")} testID="dash-shippo">
          <Ionicons name="cube-outline" size={18} color={colors.brand} />
          <Text style={styles.payoutsBtnText}>Shipping account (Shippo)</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.payoutsBtn} onPress={() => router.push("/seller/connect")} testID="dash-connect">
          <Ionicons name="business-outline" size={18} color={colors.brand} />
          <Text style={styles.payoutsBtnText}>Payout account (Stripe)</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.payoutsBtn} onPress={() => router.push("/seller/import")} testID="dash-import">
          <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
          <Text style={styles.payoutsBtnText}>Import products from CSV</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
        </TouchableOpacity>

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent orders</Text></View>
        {orders.length === 0 ? (
          <Text style={styles.empty}>No orders yet.</Text>
        ) : (
          orders.slice(0, 8).map((o) => (
            <TouchableOpacity key={o.id} style={styles.orderRow} onPress={() => router.push(`/order/${o.id}`)} testID={`dash-order-${o.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderId}>#{o.id}</Text>
                <Text style={styles.orderStatus}>{o.status.toUpperCase()}</Text>
              </View>
              <Text style={styles.orderTotal}>${o.total.toFixed(2)}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ))
        )}

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Your products</Text></View>
        {products.length === 0 ? (
          <Text style={styles.empty}>{'No products yet. Tap "Create a new listing".'}</Text>
        ) : (
          products.map((p) => (
            <View key={p.id} style={styles.prodRow}>
              <Image
                source={p.images?.[0] ?? undefined}
                style={styles.prodImg}
                contentFit="cover"
                transition={150}
                cachePolicy="memory-disk"
                recyclingKey={String(p.id)}
              />
              <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                <Text style={styles.prodTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.prodMeta}>Stock: {p.stock} · ${p.price.toFixed(2)}</Text>
              </View>
              <View style={styles.prodActions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.push(`/seller/product-form?id=${p.id}`)} testID={`dash-edit-${p.id}`}>
                  <Ionicons name="create-outline" size={18} color={colors.onSurface} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setBoostProduct(p)} testID={`dash-boost-${p.id}`}>
                  <Ionicons name="rocket-outline" size={18} color={colors.brand} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => confirmDelete(p)} testID={`dash-delete-${p.id}`}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {boostProduct ? (
        <BoostSheet visible={!!boostProduct} product={boostProduct} onClose={() => setBoostProduct(null)} />
      ) : null}
    </SafeAreaView>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Peer tab header — no back arrow (the dashboard is a primary tab, not a pushed screen).
function Top() {
  return (
    <View style={styles.top}>
      <Text style={styles.topTitle}>My Nest</Text>
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  hello: { fontSize: 14, color: colors.onSurfaceMuted },
  shopName: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.lg },
  statsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  stat: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, alignItems: "flex-start", ...shadows.card },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.onSurface, marginTop: 4 },
  statLabel: { fontSize: 11, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionHeader: { marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.sm },
  empty: { color: colors.onSurfaceMuted, fontStyle: "italic", marginTop: spacing.sm },
  orderRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, gap: spacing.md, ...shadows.card },
  orderId: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  orderStatus: { fontSize: 11, color: colors.brand, fontWeight: "700" },
  orderTotal: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  prodRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, ...shadows.card },
  prodImg: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  prodTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  prodMeta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  proHint: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.sm },
  prodActions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  iconBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  payoutsBtn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, ...shadows.card },
  payoutsBtnText: { flex: 1, color: colors.onSurface, fontWeight: "800", fontSize: 14 },
});
