import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { BlogPostCard } from "@/src/components/BlogPostCard";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

// v1.0.55 - tabs switch between favorited products and favorited blog posts,
// both surfaced from the same "Favorites" entry point.
type Tab = "items" | "posts";

export default function Favorites() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { addProduct } = useCart();
  const { ids, isFavorite, toggle, refresh, blogPosts, isBlogFavorite, toggleBlog } = useFavorites();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("items");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
      const idList = Array.from(ids);
      const products = await Promise.all(
        idList.map((id) => nest.getProduct(id).then(toProduct).catch(() => null)),
      );
      setItems(products.filter((p): p is Product => !!p));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the visible list in sync when a heart is toggled off here.
  useEffect(() => {
    setItems((cur) => cur.filter((p) => ids.has(p.id)));
  }, [ids]);

  const onAdd = async (p: Product) => {
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
        <TouchableOpacity accessibilityLabel="Go back" accessibilityRole="button" onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} testID="favorites-back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={styles.topTitle}>Your favorites</Text>
        <CartHeaderButton />
      </View>
      {!user ? (
        <EmptyState icon="heart-outline" title="Sign in to see favorites" message="Save items you love and find them here." actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} testID="favorites-signed-out" />
      ) : (
        <>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === "items" && styles.tabActive]}
              onPress={() => { haptics.tap(); setTab("items"); }}
              testID="favorites-tab-items"
            >
              <Text style={[styles.tabText, tab === "items" && styles.tabTextActive]}>
                Items {items.length > 0 ? `(${items.length})` : ""}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === "posts" && styles.tabActive]}
              onPress={() => { haptics.tap(); setTab("posts"); }}
              testID="favorites-tab-posts"
            >
              <Text style={[styles.tabText, tab === "posts" && styles.tabTextActive]}>
                Posts {blogPosts.length > 0 ? `(${blogPosts.length})` : ""}
              </Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            tab === "items" ? <ProductGridSkeleton count={4} /> : <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
          ) : tab === "items" ? (
            <FlatList
              data={items}
              keyExtractor={(p) => p.id}
              numColumns={2}
              columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
              contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + 40 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    load();
                  }}
                  tintColor={colors.brand}
                  colors={[colors.brand]}
                />
              }
              renderItem={({ item }) => <ProductCard product={item} layout="grid" onAddToCart={() => onAdd(item)} onToggleFavorite={() => toggle(item.id)} isFavorite={isFavorite(item.id)} />}
              ListEmptyComponent={<EmptyState icon="heart-outline" title="No favorites yet" message="Tap the heart on any item to save it here." actionLabel="Browse the shop" onAction={() => router.push("/(tabs)/browse")} testID="favorites-empty" />}
            />
          ) : (
            <FlatList
              data={blogPosts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    load();
                  }}
                  tintColor={colors.brand}
                  colors={[colors.brand]}
                />
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    haptics.tap();
                    router.push({
                      pathname: "/(tabs)/(more)/blog/[id]",
                      params: { id: item.id, post: JSON.stringify(item) },
                    });
                  }}
                  testID={`favorites-blog-open-${item.id}`}
                >
                  <BlogPostCard
                    post={item}
                    isFavorite={isBlogFavorite(item.id)}
                    onToggleFavorite={() => toggleBlog(item.id)}
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<EmptyState icon="heart-outline" title="No favorited posts yet" message="Tap the heart on any Fresh from the Nest post to save it here." actionLabel="Explore the feed" onAction={() => router.push("/(tabs)")} testID="favorites-posts-empty" />}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  tabActive: { backgroundColor: colors.brand },
  tabText: { fontSize: 14, fontWeight: "800", color: colors.onSurfaceMuted },
  tabTextActive: { color: colors.onBrand },
});
