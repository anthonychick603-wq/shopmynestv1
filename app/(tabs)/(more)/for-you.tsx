// v1.0.132 — "Picked for you" full-screen paginated grid, "See all" target
// of the home-tab Picked for you carousel. Wraps
// nest.trust.getPersonalizedFeed (endpoint /nest-trust/v1/feed in the
// mynest-trust-suite plugin). Ranker weights: recency + favorites +
// follows + seller-badge tier + total sales + active boost.
//
// Signed-out users see the auth-required empty state — the endpoint would
// return a recency-ordered guest feed, but the whole point of this row is
// personalization, so we route guests to sign in rather than showing them
// the same thing they'd see under "Fresh from the Nest".
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { feedRowToProduct, toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { useAuth } from "@/src/context/AuthContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useCart } from "@/src/context/CartContext";

const PER_PAGE = 20;

export default function ForYouScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const { addProduct } = useCart();

  const [items, setItems] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The trust plugin returns { items, page, per_page, total, total_pages? }.
  // total_pages is optional in the type; derive it from total/per_page when
  // the server omits it so infinite scroll knows when to stop.
  const load = useCallback(async (nextPage = 1) => {
    if (!user) { setLoading(false); setRefreshing(false); return; }
    try {
      const res = await nest.trust.getPersonalizedFeed({ page: nextPage, per_page: PER_PAGE });
      const rows = (res.items || []).map(feedRowToProduct);
      setItems((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
      setPage(res.page ?? nextPage);
      const derivedTotalPages = res.total_pages
        ?? (res.total && res.per_page ? Math.max(1, Math.ceil(res.total / res.per_page)) : nextPage);
      setTotalPages(derivedTotalPages);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not load your picks");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(1); }, [load]);

  const onFav = (p: Product) => {
    if (!user) return router.push("/(auth)/login");
    toggleFavorite(p.id);
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
        <Text style={styles.topTitle}>Picked for you</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <AlertsBellButton />
          <CartHeaderButton />
        </View>
      </View>
      {!user ? (
        <View style={{ flex: 1, padding: spacing.lg }}>
          <EmptyState
            icon="sparkles-outline"
            title="Sign in for a personalized feed"
            message="We rank the Nest based on the shops you follow, products you've favorited, and things you've bought."
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
            icon="sparkles-outline"
            title="Nothing to recommend yet"
            message="Follow a few makers or favorite some products and we'll start picking things you'll love."
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => String(p.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + 40, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={colors.brand} colors={[colors.brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loadingMore || page >= totalPages) return;
            setLoadingMore(true);
            load(page + 1);
          }}
          ListFooterComponent={loadingMore ? (
            <View style={{ paddingVertical: spacing.lg }}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : null}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <ProductCard
                product={item}
                layout="full"
                onAddToCart={() => onAdd(item)}
                onToggleFavorite={() => onFav(item)}
                isFavorite={isFavorite(item.id)}
                testID={`foryou-card-${item.id}`}
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
});
