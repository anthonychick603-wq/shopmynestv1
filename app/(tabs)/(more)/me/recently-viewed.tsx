// v1.0.94 (Build #18a) — buyer recently-viewed screen. 2-column grid of
// ProductCard rows backed by /me/recently-viewed. "Clear" wipes the MRU
// list server-side; refresh reloads it. Kept intentionally simple — this
// isn't a paginated view, the server caps the list at 20 rows.
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { useAuth } from "@/src/context/AuthContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useCart } from "@/src/context/CartContext";

export default function RecentlyViewedScreen() {
  useBackFallback("/(tabs)");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const { addProduct } = useCart();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);

  // v1.0.95 — signed-out users used to hit /me/recently-viewed and get a
  // 401 toast on mount. Gate the fetch on `user` and render the same auth-
  // required empty state that favorites.tsx uses.
  const load = useCallback(async () => {
    if (!user) { setLoading(false); setRefreshing(false); return; }
    try {
      const res = await nest.getRecentlyViewed(20);
      setItems((res.items || []).map(toProduct));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not load recently viewed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onClear = () => {
    if (clearing || items.length === 0) return;
    Alert.alert("Clear recently viewed?", "This won't affect your favorites or saved searches.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: async () => {
        setClearing(true);
        try {
          await nest.clearRecentlyViewed();
          setItems([]);
          haptics.success();
        } catch (e) {
          haptics.error();
          toast.error(e instanceof ApiError ? e.friendly : "Could not clear");
        } finally {
          setClearing(false);
        }
      } },
    ]);
  };

  const onFav = (p: Product) => {
    if (!user) return router.push("/(auth)/login");
    toggleFavorite(p.id);
  };
  // v1.0.136 — long-press a card to remove just that product from the MRU.
  // Confirm first (destructive, feels like a swipe-to-delete) then update
  // local state optimistically. Best-effort on network error: we still
  // hide the row locally so the tap doesn't feel dead, and the next
  // pull-to-refresh reconciles with the server.
  const onLongPress = (p: Product) => {
    haptics.tap();
    Alert.alert("Remove from recently viewed?", p.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        setItems((prev) => prev.filter((r) => r.id !== p.id));
        try {
          await nest.removeRecentlyViewed(p.id);
          haptics.success();
        } catch (e) {
          haptics.error();
          toast.error(e instanceof ApiError ? e.friendly : "Could not remove");
        }
      } },
    ]);
  };
  const onAdd = async (p: Product) => {
    if (!user) return router.push("/(auth)/login");
    try {
      const fresh = toProduct(await nest.getProduct(p.id));
      if (!fresh.in_stock) return toast.error("Out of stock");
      addProduct(fresh, 1);
      toast.success("Added to cart");
    } catch {
      toast.error("Could not add to cart");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Recently viewed</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {items.length > 0 ? (
            <TouchableOpacity onPress={onClear} disabled={clearing} accessibilityRole="button" accessibilityLabel="Clear recently viewed" testID="rv-clear">
              <Text style={styles.clearText}>{clearing ? "…" : "Clear"}</Text>
            </TouchableOpacity>
          ) : null}
          <AlertsBellButton />
          <CartHeaderButton />
        </View>
      </View>
      {!user ? (
        <View style={{ flex: 1, padding: spacing.lg }}>
          {/* v1.0.95 — auth-required state; matches favorites.tsx pattern. */}
          <EmptyState
            icon="person-outline"
            title="Sign in to see recently viewed"
            message="We keep your last 20 products so you can pick up where you left off."
            actionLabel="Sign in"
            onAction={() => router.push("/(auth)/login")}
          />
        </View>
      ) : loading ? (
        <View style={{ padding: spacing.lg }}>
          <ProductGridSkeleton count={6} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, padding: spacing.lg }}>
          <EmptyState
            icon="time-outline"
            title="Nothing here yet"
            message="Products you open will show up here so you can pick up where you left off."
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => String(p.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + 40, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <ProductCard
                product={item}
                layout="full"
                onAddToCart={() => onAdd(item)}
                onToggleFavorite={() => onFav(item)}
                onLongPress={() => onLongPress(item)}
                isFavorite={isFavorite(item.id)}
                testID={`rv-card-${item.id}`}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  clearText: { fontSize: 14, fontWeight: "700", color: colors.brand, paddingHorizontal: spacing.sm },
});
