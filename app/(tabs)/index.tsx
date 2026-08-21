import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toBlogPost, toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { BlogPost, Product } from "@/src/types";
import { BlogPostCard } from "@/src/components/BlogPostCard";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { ScrollView } from "react-native";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { EmptyState } from "@/src/components/EmptyState";
import { Button } from "@/src/components/Button";
import { pushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { useAuth } from "@/src/context/AuthContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useCart } from "@/src/context/CartContext";
import { toast } from "@/src/components/Toast";

const PER_PAGE = 20;

export default function Blog() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [homeItems, setHomeItems] = useState<Product[]>([]);
  const [hasFollowed, setHasFollowed] = useState(false);
  // v1.0.94 (Build #18a) — recently viewed carousel. Only shown when logged
  // in and there's at least one row from the server MRU.
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const { isFavorite, toggle: toggleFavorite, isBlogFavorite, toggleBlog: toggleBlogFavorite } = useFavorites();
  const { addProduct } = useCart();

  // v1.0.53 - the Fresh from the Nest carousel previously rendered
  // ProductCard with no callbacks, so tapping the heart or plus button did
  // nothing (silent no-op). Mirror the browse-tab handlers here so the same
  // heart-toggles-favorite / plus-adds-to-cart contract works on the home
  // feed too.
  const onFav = (p: Product) => {
    if (!user) return pushFromTab(router, "/(auth)/login");
    toggleFavorite(p.id);
  };
  const onAdd = async (p: Product) => {
    if (!user) return pushFromTab(router, "/(auth)/login");
    try {
      const fresh = toProduct(await nest.getProduct(p.id));
      if (!fresh.in_stock) return toast.error("Out of stock");
      addProduct(fresh, 1);
      toast.success("Added to cart");
    } catch {
      toast.error("Could not add to cart");
    }
  };

  const loadHomeFeed = useCallback(async () => {
    try {
      const res = await nest.getHomeFeed({ per_page: 12 });
      setHomeItems((res.items || []).map(toProduct));
      setHasFollowed(res.has_followed);
    } catch {
      // Non-fatal; home feed just stays empty.
    }
  }, []);

  // v1.0.94 (Build #18a) — recently viewed for the signed-in buyer. Silent
  // failure keeps the row simply absent, so no error UI on the home tab.
  const loadRecentlyViewed = useCallback(async () => {
    if (!user) { setRecentlyViewed([]); return; }
    try {
      const res = await nest.getRecentlyViewed(12);
      setRecentlyViewed((res.items || []).map(toProduct));
    } catch {
      setRecentlyViewed([]);
    }
  }, [user]);

  const load = useCallback(async (nextPage = 1) => {
    setError(null);
    try {
      if (nextPage === 1) {
        await Promise.all([loadHomeFeed(), loadRecentlyViewed()]);
      }
      const res = await nest.getBlogPosts({ page: nextPage, per_page: PER_PAGE });
      const items = (res.items || []).map(toBlogPost);
      setPosts((prev) => (nextPage === 1 ? items : [...prev, ...items]));
      setPage(res.page ?? nextPage);
      setTotalPages(res.total_pages ?? 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load the blog.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [loadHomeFeed]);

  // Reload on focus so a newly approved post shows up without a manual pull.
  useFocusEffect(
    useCallback(() => {
      load(1);
    }, [load]),
  );

  const showBecomeMaker = !user || (!user.is_approved_seller && user.seller_application_status !== "pending");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <NestLogo subtitle="Handmade, with love" />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity testID="header-search" accessibilityLabel="Search products" accessibilityRole="button" onPress={() => { haptics.tap(); router.push("/(tabs)/browse"); }} style={styles.iconBtn}>
            <Ionicons name="search" size={20} color={colors.onSurface} />
          </TouchableOpacity>
          {/* v1.0.116 — shared bell component so the unread badge is
              consistent across every screen that shows it. */}
          <AlertsBellButton />
          <CartHeaderButton />
        </View>
      </View>

      {loading ? (
        // v1.0.69 — skeleton grid keeps the layout during first load so the
        // home feed doesn't flash from spinner to content.
        <ProductGridSkeleton count={4} />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="We couldn't load the blog" message={error} actionLabel="Retry" onAction={() => load(1)} testID="blog-error" />
      ) : (
        <FlatList
          testID="blog-list"
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            // v1.0.54 - approved blog posts open the comments detail screen
            // on tap. Pending/rejected posts stay non-interactive so authors
            // and moderators still see their moderation status without a
            // dead-end tap into a 404.
            item.status === "approved" ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  haptics.tap();
                  pushFromTab(router, "/(tabs)/(more)/blog/[id]", { id: item.id, post: JSON.stringify(item) });
                }}
                testID={`blog-open-${item.id}`}
              >
                <BlogPostCard
                  post={item}
                  isFavorite={isBlogFavorite(item.id)}
                  onToggleFavorite={() => toggleBlogFavorite(item.id)}
                />
              </TouchableOpacity>
            ) : (
              <BlogPostCard post={item} />
            )
          )}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} tintColor={colors.brand} colors={[colors.brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loadingMore || page >= totalPages) return;
            setLoadingMore(true);
            load(page + 1);
          }}
          ListHeaderComponent={
            <View>
              {recentlyViewed.length > 0 ? (
                <View style={styles.homeFeedSection}>
                  <View style={styles.homeFeedHeader}>
                    <Text style={styles.homeFeedTitle}>Keep browsing</Text>
                    <TouchableOpacity accessibilityLabel="See all recently viewed products" accessibilityRole="button" onPress={() => { haptics.tap(); pushFromTab(router, "/me/recently-viewed"); }} testID="home-recent-see-all">
                      <Text style={styles.homeFeedSeeAll}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.homeFeedRow}
                    testID="home-recent-scroller"
                  >
                    {recentlyViewed.map((item) => (
                      <View key={item.id} style={styles.homeFeedItem}>
                        <ProductCard
                          product={item}
                          layout="full"
                          onAddToCart={() => onAdd(item)}
                          onToggleFavorite={() => onFav(item)}
                          isFavorite={isFavorite(item.id)}
                          testID={`home-recent-card-${item.id}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              {homeItems.length > 0 ? (
                <View style={styles.homeFeedSection}>
                  <View style={styles.homeFeedHeader}>
                    <Text style={styles.homeFeedTitle}>
                      {hasFollowed ? "Fresh from shops you follow" : "Fresh from the Nest"}
                    </Text>
                    <TouchableOpacity accessibilityLabel="See all products in browse" accessibilityRole="button" onPress={() => { haptics.tap(); router.push("/(tabs)/browse"); }} testID="home-feed-see-all">
                      <Text style={styles.homeFeedSeeAll}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.homeFeedRow}
                    testID="home-feed-scroller"
                  >
                    {homeItems.map((item) => (
                      <View key={item.id} style={styles.homeFeedItem}>
                        <ProductCard
                          product={item}
                          layout="full"
                          onAddToCart={() => onAdd(item)}
                          onToggleFavorite={() => onFav(item)}
                          isFavorite={isFavorite(item.id)}
                          testID={`home-feed-card-${item.id}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.composeCard}>
                <Text style={styles.composeTitle}>Share something with the Nest</Text>
                <Text style={styles.composeBody}>Post a photo and a caption. An admin reviews every post before it goes live.</Text>
                <Button
                  title="New Post"
                  onPress={() => { haptics.tap(); (user ? pushFromTab(router, "/blog/compose") : pushFromTab(router, "/(auth)/login")); }}
                  style={{ marginTop: spacing.md }}
                  testID="blog-new-post"
                />
              </View>

              {showBecomeMaker ? (
                <TouchableOpacity
                  testID="become-seller-cta"
                  onPress={() => { haptics.tap(); (user ? pushFromTab(router, "/seller/apply") : pushFromTab(router, "/(auth)/login")); }}
                  style={styles.becomeSellerCard}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.becomeSellerTitle}>Build your Nest</Text>
                    <Text style={styles.becomeSellerBody}>Apply to sell your handmade goods on My Nest.</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={32} color={colors.onSurface} />
                </TouchableOpacity>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="newspaper-outline"
              title="No posts yet"
              message="Approved posts from the My Nest community will show up here."
              testID="blog-empty"
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.onSurface} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", ...shadows.card },
  composeCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.card },
  composeTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  composeBody: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  becomeSellerCard: { padding: spacing.lg, backgroundColor: colors.surfaceTertiary, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  becomeSellerTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  becomeSellerBody: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  homeFeedSection: { marginBottom: spacing.lg },
  homeFeedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  homeFeedTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  homeFeedSeeAll: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceMuted },
  homeFeedRow: { gap: spacing.md, paddingRight: spacing.md },
  homeFeedItem: { width: 200 },
});
