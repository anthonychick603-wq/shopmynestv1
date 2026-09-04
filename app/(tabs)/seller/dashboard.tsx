import React, { useCallback, useRef, useState } from "react";
import { Alert, Animated, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError, type NestSellerReadiness } from "@/src/api/nest";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing, type as typeTokens } from "@/src/theme";
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
import { usePushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { SellerReadinessCard } from "@/src/components/SellerReadinessCard";
import { StatusPill } from "@/src/components/StatusPill";
import { useRedirectAdmins } from "@/src/hooks/use-redirect-admins";
import { useLatestRequest } from "@/src/hooks/use-latest-request";

export default function SellerDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const push = usePushFromTab();
  const { user, refresh: refreshAuth } = useAuth();
  // v1.0.237 — seller tab is hidden for admins in _layout.tsx, but the
  // route is still registered so deep links resolve. If an admin arrives
  // here through a stale notification or a link, bounce them to /admin
  // instead of showing them a dashboard full of tiles that all lead to
  // seller-only backends.
  const { isAdmin } = useRedirectAdmins("/admin");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<DashOrder[]>([]);
  const [totals, setTotals] = useState<{ orders?: number; revenue?: number; earnings?: number }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [badge, setBadge] = useState<SellerBadgeType | null>(null);
  const [proSeller, setProSeller] = useState(false);
  const [boostProduct, setBoostProduct] = useState<Product | null>(null);
  const [readiness, setReadiness] = useState<NestSellerReadiness | null>(null);

  // v1.0.251 — hoisted above every early return. Was declared just below
  // `if (loading) return DashboardSkeleton`, which meant the first render
  // (loading=true, early return) skipped this hook entirely and the
  // second render (loading=false) invoked it for the first time. That
  // violates the Rules of Hooks and crashes the screen with
  // "Rendered more hooks than during the previous render" — caught by
  // the top-level ErrorBoundary as "Something went wrong" on the My Nest
  // tab. Bug was introduced in v1.0.247's dedupe of oosCount.
  //
  // v1.0.153 — drafts have stock=0 while waiting on ship-from / package
  // details; excluding them keeps this count aligned with the listings
  // screen's Out of stock tab.
  const oosCount = React.useMemo(
    () => products.filter((p) => p.status !== "draft" && (!p.in_stock || p.stock <= 0)).length,
    [products],
  );

  const lastLoadAt = useRef(0);
  // v1.0.247 — gate every post-await setter on this dashboard through
  // useLatestRequest. Without it, fast focus-blur cycles or a
  // pull-to-refresh chased by a back nav fire setState on an unmounted
  // component (seller-flow audit P0). Also protects against a stale
  // response from an earlier focus overwriting a fresh one — the
  // full-catalog `getMyProducts({ per_page: 200 })` .then() at the
  // bottom of the happy path is now gated on the SAME request id as
  // its outer load, so it can no longer race the dashboard slice.
  const { begin, isCurrent } = useLatestRequest();
  const load = useCallback(async () => {
    // v1.0.237 — admins are separated from sellers; they don't have a
    // seller dashboard payload at all. The screen redirects to /admin
    // above; make sure no seller-scoped requests fire in the meantime.
    if (!user || user.role !== "seller") return;
    const reqId = begin();
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
      if (!isCurrent(reqId)) return;
      setReadiness(r);

      if (dashboard) {
        setTotals(dashboard.totals || {});
        // v1.0.144 — the dashboard endpoint returns a truncated top-N slice of
        // products, which meant out-of-stock items past that slice never showed
        // up in the seller's product list. Always fetch the seller's full list
        // in parallel so the OOS section header link (and the dedicated OOS
        // screen) can count and surface every affected item.
        // v1.0.247 — gate the inner setter on the SAME request id as the
        // outer load so the two setProducts calls can't fight each other
        // (they used to; the .then() commonly resolved after the outer
        // dashboard.products setter and flickered the recent-products strip).
        nest.getMyProducts({ per_page: 200 }).then((full) => {
          if (!isCurrent(reqId)) return;
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
        if (!isCurrent(reqId)) return;
        if (p.items?.length) setProducts(p.items.map(toProduct));
        if (o.orders?.length) setOrders(o.orders.map((r) => ({ id: String(r.id), status: r.status, total: Number(r.gross ?? 0) })));
      }

      setBadge(b as SellerBadgeType | null);
      setProSeller(!!(pro && (pro as { pro_seller?: boolean }).pro_seller));
      lastLoadAt.current = Date.now();
    } finally {
      if (isCurrent(reqId)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user, begin, isCurrent]);

  // v1.0.167 — only reload on focus if data is older than 5 minutes.
  // Preserves scroll position when returning from a pushed edit or
  // detail screen. Pull to refresh forces a reload.
  useFocusEffect(useCallback(() => {
    const stale = Date.now() - lastLoadAt.current > 5 * 60_000;
    if (stale) load();
  }, [load]));
  // v1.0.254 — mutation-driven refetch. Any product create/edit/delete
  // (from the product-form) or seller-order state change bumps the
  // dashboard so orders + listings + readiness reflect it.
  useInvalidateOnFocus(["products", "orders", "sellers"], load);

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
          // v1.0.247 — snapshot the mount status via isCurrent(reqId) so
          // that if the seller backs out of the dashboard between the
          // Delete tap and the API response, we don't try to mutate the
          // products list or fire the error Alert on an unmounted screen.
          const reqId = begin();
          try {
            await nest.deleteProduct(p.id);
            if (!isCurrent(reqId)) { haptics.success(); return; }
            setProducts((cur) => cur.filter((x) => x.id !== p.id));
            haptics.success();
          } catch (e) {
            if (!isCurrent(reqId)) return;
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
        <EmptyState icon="lock-closed-outline" title="Maker only" message="Apply to become a seller first." actionLabel="Apply" onAction={() => push("/seller/apply")} />
      </SafeAreaView>
    );
  }

  // v1.0.237 — admins are being replaced to /admin by useRedirectAdmins;
  // return nothing while the router swap is in flight.
  if (isAdmin) return null;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top />
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  const earnings = totals.earnings ?? totals.revenue ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              // v1.0.70 — manual pull-to-refresh; the on-focus 5-minute
              // freshness gate stays in place, this just lets a seller
              // force a reload after taking an action outside the app.
              // (v1.0.247 note: the earlier "60s" comment was stale;
              // the freshness constant at L121 is 5 * 60_000.)
              // v1.0.240 — also re-fetch /me so role changes (approved
              // seller, admin) reflect immediately without a cold start.
              setRefreshing(true);
              refreshAuth().catch(() => {});
              load();
            }}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
       keyboardShouldPersistTaps="handled">
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
            onPress={() => push("/seller/listings")}
            testID="dash-stat-products"
          />
          <Stat
            label="Orders"
            // v1.0.247 — was `String(orders.length || totals.orders || 0)`,
            // which picked the paginated slice length whenever it was
            // non-zero. A seller with 200 sold orders saw "8" on this
            // tile because the dashboard slice is 8. Prefer the server
            // total (which counts every order); fall back to the slice
            // length only when the server didn't return a totals block.
            value={String(totals.orders ?? orders.length ?? 0)}
            icon="bag-check-outline"
            onPress={() => push("/orders")}
            testID="dash-stat-orders"
          />
          <Stat
            label="Earnings"
            value={formatMoney(earnings)}
            hint="Lifetime"
            icon="cash-outline"
            onPress={() => push("/seller/payouts")}
            testID="dash-stat-earnings"
          />
        </View>

        <SellerReadinessCard readiness={readiness} />

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Quick actions</Text></View>
        <Button title="+ Create a new listing" onPress={() => push("/seller/product-form")} testID="dash-new-product" />

        {/* v1.0.70 — settings destinations moved into a compact 2-column grid
            so the dashboard stops burning half a screen on chevron rows. */}
        <View style={styles.actionGrid}>
          <ActionTile
            icon="storefront-outline"
            label="Shop profile"
            onPress={() => push("/seller/shop-settings")}
            testID="dash-shop-profile"
          />
          <ActionTile
            icon="analytics-outline"
            label="Analytics"
            onPress={() => push("/seller/analytics")}
            testID="dash-analytics"
          />
          <ActionTile
            icon="cash-outline"
            label="Earnings & payouts"
            onPress={() => push("/seller/payouts")}
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
            onPress={() => push("/seller/shippo")}
            testID="dash-shippo"
          />
          <ActionTile
            icon="business-outline"
            label="Payout account"
            onPress={() => push("/seller/bank")}
            testID="dash-connect"
          />
          <ActionTile
            icon="cloud-upload-outline"
            label="Import CSV"
            onPress={() => push("/seller/import")}
            testID="dash-import"
          />
          <ActionTile
            icon="list-outline"
            label="All listings"
            onPress={() => push("/seller/listings")}
            testID="dash-listings"
          />
          <ActionTile
            icon="star-outline"
            label="Reviews"
            onPress={() => push("/seller/reviews")}
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
                push(`/order/${o.id}`);
              }}
              testID={`dash-order-${o.id}`}
             accessibilityRole="button">
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
          // v1.0.247 — was recomputing oosCount here; now reads the hoisted
          // memo above.
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
                    push("/seller/listings?filter=oos");
                  }}
                  testID="dash-oos-link"
                  accessibilityLabel={`View ${oosCount} out of stock items`}
                  style={styles.oosLink}
                 accessibilityRole="button">
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
                      push(`/seller/product-form?id=${p.id}`);
                    }}
                    testID={`dash-edit-${p.id}`}
                    accessibilityLabel={`Edit ${p.title}`}
                   hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
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
                   hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                    <Ionicons name="rocket-outline" size={18} color={colors.brand} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => confirmDelete(p)}
                    testID={`dash-delete-${p.id}`}
                    accessibilityLabel={`Delete ${p.title}`}
                   hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
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
     accessibilityRole="button">
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
     accessibilityRole="button">
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
  // v1.0.224 — Refinement pass. Prior dashboard had:
  //   • Cream-on-cream stat cards (0 products / 0 orders / 0 earnings)
  //     that visually vanished into the background.
  //   • A mixed shadow / no-border language across every widget.
  //   • h1-sized shop name competing with the top bar title.
  // New treatment matches Stripe/Robinhood card language: white surface,
  // hairline border, no shadow, real type jumps between label / value.
  topTitle: { ...typeTokens.h1, fontSize: 20, lineHeight: 26 },
  hello: { ...typeTokens.caption, marginTop: 2 },
  shopName: { ...typeTokens.display, fontSize: 28, lineHeight: 34, marginBottom: spacing.lg },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    alignItems: "flex-start",
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  statValue: { ...typeTokens.h1, fontSize: 22, lineHeight: 26, marginTop: 2 },
  statLabel: { ...typeTokens.micro },
  statHint: { ...typeTokens.caption, fontSize: 11, marginTop: 2 },
  statHintWarn: { color: colors.error, fontWeight: "700" },
  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.md },
  productsHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  oosLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  oosLinkText: { color: colors.error, fontWeight: "700", fontSize: 12 },
  sectionTitle: { ...typeTokens.h2 },
  hint: { ...typeTokens.caption, marginTop: spacing.sm },
  empty: { ...typeTokens.body, color: colors.onSurfaceMuted, marginTop: spacing.sm },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  orderId: { ...typeTokens.bodyLg, fontWeight: "700", marginBottom: 4 },
  orderTotal: { ...typeTokens.bodyLg, fontWeight: "800" },
  prodRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.sm,
  },
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
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionTile: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
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
