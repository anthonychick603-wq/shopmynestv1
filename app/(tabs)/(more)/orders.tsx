import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { format } from "date-fns";

import { nest, ApiError, type NestSellerOrderRaw } from "@/src/api/nest";
import { toOrder } from "@/src/api/adapters";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import type { Order } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { ErrorState } from "@/src/components/ErrorState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { AppImage } from "@/src/components/AppImage";
import { OrderListSkeleton } from "@/src/components/OrderListSkeleton";
import { pushDetail, safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { StatusPill } from "@/src/components/StatusPill";
import { useAuth } from "@/src/context/AuthContext";
import { parseServerDate } from "@/src/utils/datetime";
import { RequireAuth } from "@/src/components/RequireAuth";

// v1.0.71 — status coloring is shared with the seller dashboard via StatusPill
// so buyers and sellers see the same color language across the app.
//
// v1.0.102 — this screen used to only render buyer orders, but the seller
// dashboard's "Orders" stat tile and the account screen's "Orders" row both
// pointed here. A seller tester (Jo) saw "No orders yet" even though she had
// 2 sold orders. Now the screen is role-aware:
//   • buyers  → buyer orders (`getBuyerOrders`)
//   • sellers → their sold orders (`getSellerOrders`, order.customer address hidden;
//               shows buyer name and item count instead)
//   • admins  → segmented control between the two views (defaults to seller)
// The `/order/[id]` detail already handles both perspectives (v1.0.101), so
// tapping into either list shows the right screen.

type Mode = "buyer" | "seller";

type SellerOrderRow = {
  id: string;
  status: string;
  buyerName: string;
  itemCount: number;
  gross: number;
  createdAt: string | null;
  firstImage: string | undefined;
};

export default function Orders() {
  return (
    <RequireAuth message={'Sign in to view your orders.'}>
      <OrdersImpl />
    </RequireAuth>
  );
}

function OrdersImpl() {
  useBackFallback("/(tabs)/account");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const isSeller = user?.role === "seller";
  const isAdmin = user?.role === "admin";
  const canSee = { buyer: true, seller: isSeller || isAdmin };
  const defaultMode: Mode = isSeller || isAdmin ? "seller" : "buyer";
  const [mode, setMode] = useState<Mode>(defaultMode);

  const [buyerOrders, setBuyerOrders] = useState<Order[]>([]);
  const [sellerOrders, setSellerOrders] = useState<SellerOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.243 — dedicated error state and load-more pagination. Fixes
  // the P1 where a failed order fetch was silently displayed as "no
  // orders yet", and the P1 where the buyer/seller list was capped at
  // 50 rows with no way to reach older orders.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [buyerPage, setBuyerPage] = useState(1);
  const [buyerTotalPages, setBuyerTotalPages] = useState(1);
  const [sellerPage, setSellerPage] = useState(1);
  const [sellerTotalPages, setSellerTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setErrorMsg(null);
    try {
      if (mode === "seller" && canSee.seller) {
        const res = await nest.getSellerOrders({ per_page: 50, page: 1 });
        setSellerOrders(res.orders.map(sellerRowFrom));
        setSellerPage(res.page ?? 1);
        setSellerTotalPages(res.total_pages ?? 1);
      } else {
        const res = await nest.getBuyerOrders({ per_page: 50, page: 1 });
        setBuyerOrders(res.orders.map(toOrder));
        setBuyerPage(res.page ?? 1);
        setBuyerTotalPages(res.total_pages ?? 1);
      }
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.friendly : "Couldn't load orders.");
      if (mode === "seller") setSellerOrders([]);
      else setBuyerOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // canSee.seller depends only on user.role which is stable across the
    // screen's lifetime; refetching when it flips would be misleading anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // v1.0.243 — append the next page when the buyer scrolls past the
  // bottom of the visible list. Failures are intentionally silent so
  // reaching the end of a long history isn't disrupted with a toast.
  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    if (mode === "seller") {
      if (sellerPage >= sellerTotalPages) return;
      setLoadingMore(true);
      try {
        const res = await nest.getSellerOrders({ per_page: 50, page: sellerPage + 1 });
        setSellerOrders((prev) => [...prev, ...res.orders.map(sellerRowFrom)]);
        setSellerPage(res.page ?? sellerPage + 1);
        if (res.total_pages) setSellerTotalPages(res.total_pages);
      } catch { /* silent */ }
      finally { setLoadingMore(false); }
    } else {
      if (buyerPage >= buyerTotalPages) return;
      setLoadingMore(true);
      try {
        const res = await nest.getBuyerOrders({ per_page: 50, page: buyerPage + 1 });
        setBuyerOrders((prev) => [...prev, ...res.orders.map(toOrder)]);
        setBuyerPage(res.page ?? buyerPage + 1);
        if (res.total_pages) setBuyerTotalPages(res.total_pages);
      } catch { /* silent */ }
      finally { setLoadingMore(false); }
    }
  }, [mode, loading, loadingMore, buyerPage, buyerTotalPages, sellerPage, sellerTotalPages]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const showSwitcher = canSee.seller && (isAdmin || isSeller);
  const title = mode === "seller" ? "Sold orders" : "Your orders";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top title={title} onBack={() => safeBack(router, "/(tabs)/account")} />

      {showSwitcher ? (
        <View style={styles.segRow}>
          <Segment label="Sold" active={mode === "seller"} onPress={() => { haptics.tap(); setMode("seller"); }} testID="orders-seg-seller" />
          <Segment label="Bought" active={mode === "buyer"} onPress={() => { haptics.tap(); setMode("buyer"); }} testID="orders-seg-buyer" />
        </View>
      ) : null}

      {loading ? (
        <OrderListSkeleton count={4} />
      ) : errorMsg ? (
        <ErrorState message={errorMsg} onRetry={() => { setLoading(true); load(); }} />
      ) : mode === "seller" ? (
        <FlatList
          data={sellerOrders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListFooterComponent={loadingMore ? <View style={{ padding: spacing.lg }}><ActivityIndicator color={colors.brand} /></View> : null}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="No sold orders yet"
              message="When a buyer purchases one of your listings, it will show up here."
              testID="orders-empty-seller"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => { haptics.tap(); pushDetail(router, `/order/${item.id}`); }}
              style={styles.card}
              testID={`seller-order-${item.id}`}
              accessibilityLabel={`Open sold order ${item.id}, status ${item.status}`}
             accessibilityRole="button">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.orderId}>#{item.id}</Text>
                <StatusPill status={item.status} />
              </View>
              <Text style={styles.date}>{item.createdAt ? format(parseServerDate(item.createdAt) ?? new Date(0), "MMM d, yyyy") : ""}</Text>
              <View style={{ flexDirection: "row", marginTop: spacing.md, alignItems: "center" }}>
                <AppImage source={{ uri: item.firstImage }} style={styles.thumb} fallbackIcon="pricetag-outline" />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.buyerName} numberOfLines={1}>{item.buyerName || "Buyer"}</Text>
                  <Text style={styles.itemCount}>{item.itemCount} {item.itemCount === 1 ? "item" : "items"}</Text>
                </View>
                <Text style={styles.total}>${item.gross.toFixed(2)}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceMuted} />
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={buyerOrders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListFooterComponent={loadingMore ? <View style={{ padding: spacing.lg }}><ActivityIndicator color={colors.brand} /></View> : null}
          ListEmptyComponent={<EmptyState icon="receipt-outline" title="No orders yet" message="Once you place an order it will show up here." testID="orders-empty" />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => { haptics.tap(); pushDetail(router, `/order/${item.id}`); }} style={styles.card} testID={`order-${item.id}`} accessibilityLabel={`Open order ${item.id}, status ${item.status}`} accessibilityRole="button">
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.orderId}>#{item.id}</Text>
                <StatusPill status={item.status} />
              </View>
              <Text style={styles.date}>{item.created_at ? format(parseServerDate(item.created_at) ?? new Date(0), "MMM d, yyyy") : ""}</Text>
              <View style={{ flexDirection: "row", marginTop: spacing.md }}>
                {item.items.slice(0, 3).map((it, i) => (
                  <AppImage key={i} source={{ uri: it.product.images?.[0] }} style={[styles.thumb, { marginLeft: i === 0 ? 0 : -12, zIndex: 5 - i }]} fallbackIcon="pricetag-outline" />
                ))}
                <View style={{ flex: 1, marginLeft: spacing.md, justifyContent: "center" }}>
                  <Text style={styles.itemCount}>{item.items.reduce((s, it) => s + it.quantity, 0)} items</Text>
                  <Text style={styles.total}>${item.total.toFixed(2)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceMuted} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function sellerRowFrom(r: NestSellerOrderRaw): SellerOrderRow {
  const itemCount = r.items.reduce((s, it) => s + (it.quantity || 0), 0);
  return {
    id: String(r.id),
    // Sellers care about their fulfillment status, not the buyer's payment
    // status — the WP endpoint already computes a per-seller status.
    status: r.seller_status || r.status,
    buyerName: r.customer?.name || "Buyer",
    itemCount,
    gross: Number(r.gross || 0),
    createdAt: r.date_created,
    firstImage: undefined, // seller orders payload has no image; falls back to icon
  };
}

function Top({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>{title}</Text>
      <AlertsBellButton />
      <CartHeaderButton />
    </View>
  );
}

function Segment({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.seg, active && styles.segActive]} testID={testID} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.segLabel, active && styles.segLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  // v1.0.225 — Orders refinement. Segmented control gets hairline
  // borders, order cards go white-on-cream, type hierarchy tightens.
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  topTitle: { ...typeTokens.h2, flex: 1, textAlign: "center" },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  segRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  seg: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  segActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segLabel: { ...typeTokens.caption, fontWeight: "700" },
  segLabelActive: { color: colors.onBrand },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  orderId: { ...typeTokens.h3 },
  date: { ...typeTokens.caption, marginTop: 2 },
  thumb: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: colors.card, backgroundColor: colors.surfaceTertiary },
  buyerName: { ...typeTokens.body, fontWeight: "600" },
  itemCount: { ...typeTokens.caption, marginTop: 2 },
  total: { ...typeTokens.h3, marginRight: spacing.sm },
});
