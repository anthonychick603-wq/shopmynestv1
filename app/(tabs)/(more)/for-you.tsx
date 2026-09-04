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
import { useLatestRequest } from "@/src/hooks/use-latest-request";
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
import { ErrorState } from "@/src/components/ErrorState";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { useAuth } from "@/src/context/AuthContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useCart } from "@/src/context/CartContext";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";

const PER_PAGE = 20;

export default function ForYouScreen() {
  useBackFallback("/(tabs)");
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
  // v1.0.243 — dedicated error state so a failed load isn't disguised as
  // "Nothing to recommend yet." Fixes the P1 where a network outage looked
  // identical to a genuine empty recommendation list and offered no retry.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // v1.0.243 — track per-product add-in-progress so rapid taps on the
  // same recommendation card can't spawn parallel fetches, add multiple
  // units, or produce a false success toast.
  const [addingId, setAddingId] = useState<string | null>(null);

  // v1.0.242 — gate all post-await state writes with useLatestRequest
  // so pull-to-refresh, infinite scroll, and mount-load don't race
  // and can't commit state after unmount.
  const { begin, isCurrent } = useLatestRequest();

  // The trust plugin returns { items, page, per_page, total, total_pages? }.
  // total_pages is optional in the type; derive it from total/per_page when
  // the server omits it so infinite scroll knows when to stop.
  const load = useCallback(async (nextPage = 1) => {
    if (!user) { setLoading(false); setRefreshing(false); return; }
    const _tok = begin();
    if (nextPage === 1) setErrorMsg(null);
    try {
      const res = await nest.trust.getPersonalizedFeed({ page: nextPage, per_page: PER_PAGE });
      if (!isCurrent(_tok)) return;
      // v1.0.243 — filter out unavailable recommendations before render.
      // Matches Home discovery-feed behavior and stops the P1 where
      // out-of-stock listings were surfaced as personalized picks.
      const rows = (res.items || [])
        .map(feedRowToProduct)
        .filter((p) => p.in_stock !== false);
      setItems((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
      setPage(res.page ?? nextPage);
      const derivedTotalPages = res.total_pages
        ?? (res.total && res.per_page ? Math.max(1, Math.ceil(res.total / res.per_page)) : nextPage);
      setTotalPages(derivedTotalPages);
    } catch (e) {
      if (!isCurrent(_tok)) return;
      const msg = e instanceof ApiError ? e.friendly : "Could not load your picks";
      if (nextPage === 1) setErrorMsg(msg);
      else toast.error(msg);
    } finally {
      if (isCurrent(_tok)) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [user, begin, isCurrent]);

  useEffect(() => { load(1); }, [load]);
  const invalidate = useCallback(async () => { await load(1); }, [load]);
  useInvalidateOnFocus(["products"], invalidate);

  const onFav = (p: Product) => {
    if (!user) return router.push("/(auth)/login");
    toggleFavorite(p.id);
  };
  const onAdd = async (p: Product) => {
    if (!user) return router.push("/(auth)/login");
    // v1.0.243 — in-flight guard + honor the addProduct boolean so rapid
    // taps can't add multiple units or produce a false success toast.
    if (addingId != null) return;
    setAddingId(p.id);
    try {
      const fresh = toProduct(await nest.getProduct(p.id));
      if (!fresh.in_stock) return toast.error("Out of stock");
      const ok = await Promise.resolve(addProduct(fresh, 1));
      if (ok) toast.success("Added to cart");
      else toast.error("Couldn't add — please try again");
    } catch {
      toast.error("Could not add to cart");
    } finally {
      setAddingId(null);
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
      ) : errorMsg ? (
        <View style={{ flex: 1, padding: spacing.lg }}>
          <ErrorState message={errorMsg} onRetry={() => { setLoading(true); load(1); }} />
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
