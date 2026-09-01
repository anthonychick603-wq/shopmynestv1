import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toBlogPost, toProduct, feedRowToProduct } from "@/src/api/adapters";
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
  // v1.0.132 — Picked for you carousel powered by the trust suite's
  // /nest-trust/v1/feed personalized ranker. Silent failure keeps the row
  // absent (same pattern as Fresh from the Nest / Keep browsing) so a bad
  // network doesn't paint an error state on the home tab.
  const [forYouItems, setForYouItems] = useState<Product[]>([]);
  // v1.0.134 — abandoned-cart banner. Populated by /cart/abandoned when the
  // user has items in their cart but hasn't checked out. Hidden after tap or
  // dismiss; server also hides it on order placement (row deleted server-side).
  const [abandoned, setAbandoned] = useState<{ line_count: number; total_cents: number } | null>(null);
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
      // v1.0.157 — request 25 items and enforce in-stock client-side so
      // Fresh from the Nest is exactly "25 most recent, in stock."
      // Server (plugin ≥ v3.13.18) already hides OOS, but the client
      // filter is a belt-and-suspenders for older plugin builds.
      const res = await nest.getHomeFeed({ per_page: 25 });
      const items = (res.items || [])
        .map(toProduct)
        .filter((p) => p.in_stock && p.stock > 0)
        .slice(0, 25);
      setHomeItems(items);
      setHasFollowed(res.has_followed);
    } catch {
      // Non-fatal; home feed just stays empty.
    }
  }, []);

  // v1.0.132 — Personalized ranker: recency + favorites + follows + badge +
  // sales + boost. We only show the row when the user is signed in AND the
  // ranker returned at least 6 items — for a brand-new signed-in user the
  // score collapses to recency+sales, which duplicates "Fresh from the
  // Nest", so gating on a full row keeps the home tab from repeating itself.
  const loadForYouFeed = useCallback(async () => {
    if (!user) { setForYouItems([]); return; }
    try {
      const res = await nest.trust.getPersonalizedFeed({ per_page: 12 });
      // v1.0.159 — also filter OOS from Picked for you so the whole home
      // tab is consistent: no home carousel should ever surface a listing
      // the buyer can't add to cart.
      const items = (res.items || [])
        .map(feedRowToProduct)
        .filter((p) => p.in_stock && p.stock > 0);
      setForYouItems(items.length >= 6 ? items : []);
    } catch {
      setForYouItems([]);
    }
  }, [user]);

  // v1.0.94 (Build #18a) — recently viewed for the signed-in buyer. Silent
  // failure keeps the row simply absent, so no error UI on the home tab.
  const loadRecentlyViewed = useCallback(async () => {
    if (!user) { setRecentlyViewed([]); return; }
    try {
      const res = await nest.getRecentlyViewed(12);
      // v1.0.159 — hide out-of-stock items from Keep browsing. A greyed-out
      // "you viewed this but can't buy it" row is worse than not showing
      // the item at all; when it restocks it will come back into the feed
      // via the same MRU list.
      const items = (res.items || [])
        .map(toProduct)
        .filter((p) => p.in_stock && p.stock > 0);
      setRecentlyViewed(items);
    } catch {
      setRecentlyViewed([]);
    }
  }, [user]);

  const load = useCallback(async (nextPage = 1) => {
    setError(null);
    try {
      if (nextPage === 1) {
        await Promise.all([loadHomeFeed(), loadRecentlyViewed(), loadForYouFeed()]);
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
  }, [loadHomeFeed, loadRecentlyViewed, loadForYouFeed]);

  // v1.0.166 — Vinted-style state preservation. Load the home feed once
  // on mount; do NOT reload on every focus. Returning to Home from a
  // pushed screen (product, seller, cart) used to blow away the user's
  // scroll position and pagination because useFocusEffect fired load(1)
  // every time. Now we only refetch when the user explicitly pulls to
  // refresh, or when the tab has been out of focus for a very long time
  // (>5 min) so an app resumed hours later still feels fresh.
  //
  // v1.0.202 — blank-Home-on-cold-launch fix. On some Android devices the
  // mount effect's first load() would settle with loading=true still in
  // effect (or the JS bridge would race with the tab layout mount and
  // drop the skeleton frame), leaving the tab visually empty until the
  // user pulled to refresh. Two guards:
  //   1. A 12-second watchdog forces loading=false so the empty state
  //      or error state can paint even if a request never resolves.
  //   2. useFocusEffect now also retries when the tab regains focus
  //      with no posts loaded and no in-flight request — that way
  //      simply switching tabs recovers the screen without needing a
  //      pull gesture.
  const mountedRef = useRef(false);
  const lastLoadRef = useRef(0);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    load(1);
    lastLoadRef.current = Date.now();
    const watchdog = setTimeout(() => {
      // If load(1) hasn't cleared `loading` in 12 s, unblock the UI so
      // the user sees either an empty-state or an error instead of a
      // blank screen forever.
      setLoading((prev) => (prev ? false : prev));
    }, 12000);
    return () => clearTimeout(watchdog);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount
  }, []);
  useFocusEffect(
    useCallback(() => {
      const STALE_MS = 5 * 60 * 1000;
      // Stale-refresh path: unchanged.
      if (mountedRef.current && Date.now() - lastLoadRef.current > STALE_MS) {
        load(1);
        lastLoadRef.current = Date.now();
        return;
      }
      // v1.0.202 recovery path: nothing loaded yet, nothing in flight,
      // and we've been mounted at least a second (so we're not fighting
      // the initial useEffect). Fire load(1) so tab-switch counts as a
      // retry.
      const beenMountedAWhile = Date.now() - lastLoadRef.current > 1000;
      if (
        mountedRef.current &&
        beenMountedAWhile &&
        posts.length === 0 &&
        !loading &&
        !loadingMore &&
        !refreshing
      ) {
        load(1);
        lastLoadRef.current = Date.now();
      }
    }, [load, posts.length, loading, loadingMore, refreshing]),
  );

  // v1.0.134 — poll the abandoned-cart snapshot on focus for logged-in
  // users. This is decoupled from the home-feed load path so a slow blog
  // fetch never blocks the banner from showing, and vice-versa.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setAbandoned(null);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const res = await nest.getAbandonedCart();
          if (cancelled) return;
          if (res.has_cart && (res.line_count ?? 0) > 0) {
            setAbandoned({ line_count: res.line_count ?? 0, total_cents: res.total_cents ?? 0 });
          } else {
            setAbandoned(null);
          }
        } catch {
          // Silent fail — the banner is an ambient assist, not a hard
          // requirement. Guests get a 401 here (permission_callback is
          // is_user_logged_in) and land in this branch.
          if (!cancelled) setAbandoned(null);
        }
      })();
      return () => { cancelled = true; };
    }, [user]),
  );

  // v1.0.136 — long-press a Recently Viewed card on Home to drop it from
  // the MRU. Same UX as the dedicated screen: confirm, then optimistic
  // local update + server delete. Failures roll back only via toast —
  // the row stays hidden locally so the tap doesn't feel dead, and the
  // next Home focus reconciles with the server.
  const onRemoveRecentlyViewed = useCallback((p: Product) => {
    haptics.tap();
    Alert.alert("Remove from recently viewed?", p.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        setRecentlyViewed((prev) => prev.filter((r) => r.id !== p.id));
        try {
          await nest.removeRecentlyViewed(p.id);
          haptics.success();
        } catch (e) {
          haptics.error();
          toast.error(e instanceof ApiError ? e.friendly : "Could not remove");
        }
      } },
    ]);
  }, []);

  const dismissAbandonedBanner = useCallback(async () => {
    setAbandoned(null);
    try {
      await nest.dismissAbandonedCart();
    } catch {
      // Best-effort — the banner is already hidden locally; the row will
      // re-armed on the next cart mutation regardless.
    }
  }, []);

  const showBecomeMaker = !user || (!user.is_approved_seller && user.seller_application_status !== "pending");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <NestLogo subtitle="Handmade, with love" />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity testID="header-search" accessibilityLabel="Search products" accessibilityRole="button" onPress={() => { haptics.tap(); router.push("/(tabs)/browse"); }} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
               accessibilityRole="button">
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
              {abandoned && abandoned.line_count > 0 ? (
                <View style={styles.abandonedBanner} testID="home-abandoned-banner">
                  <TouchableOpacity
                    style={styles.abandonedBannerBody}
                    accessibilityRole="button"
                    accessibilityLabel={`You have ${abandoned.line_count} item${abandoned.line_count === 1 ? "" : "s"} in your cart. Tap to open your cart.`}
                    onPress={() => { haptics.tap(); router.push("/(tabs)/cart"); }}
                    testID="home-abandoned-open"
                  >
                    <View style={styles.abandonedBannerIcon}>
                      <Ionicons name="bag-outline" size={20} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.abandonedBannerTitle}>
                        You left {abandoned.line_count} item{abandoned.line_count === 1 ? "" : "s"} in your cart
                      </Text>
                      <Text style={styles.abandonedBannerSub}>Pick up where you left off</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { haptics.tap(); void dismissAbandonedBanner(); }}
                    style={styles.abandonedBannerDismiss}
                    accessibilityLabel="Dismiss cart reminder"
                    accessibilityRole="button"
                    hitSlop={8}
                    testID="home-abandoned-dismiss"
                  >
                    <Ionicons name="close" size={16} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}
              {forYouItems.length > 0 ? (
                <View style={styles.homeFeedSection}>
                  <View style={styles.homeFeedHeader}>
                    <Text style={styles.homeFeedTitle}>Picked for you</Text>
                    <TouchableOpacity
                      accessibilityLabel="See all personalized picks"
                      accessibilityRole="button"
                      onPress={() => { haptics.tap(); pushFromTab(router, "/for-you"); }}
                      testID="home-foryou-see-all"
                    >
                      <Text style={styles.homeFeedSeeAll}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.homeFeedRow}
                    testID="home-foryou-scroller"
                   keyboardShouldPersistTaps="handled">
                    {forYouItems.map((item) => (
                      <View key={item.id} style={styles.homeFeedItem}>
                        <ProductCard
                          product={item}
                          layout="full"
                          onAddToCart={() => onAdd(item)}
                          onToggleFavorite={() => onFav(item)}
                          isFavorite={isFavorite(item.id)}
                          testID={`home-foryou-card-${item.id}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
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
                   keyboardShouldPersistTaps="handled">
                    {recentlyViewed.map((item) => (
                      <View key={item.id} style={styles.homeFeedItem}>
                        <ProductCard
                          product={item}
                          layout="full"
                          onAddToCart={() => onAdd(item)}
                          onToggleFavorite={() => onFav(item)}
                          onLongPress={() => onRemoveRecentlyViewed(item)}
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
                    {/* v1.0.157 — always title as "Fresh from the Nest". Per
                        user spec: 25 most recent, in stock, regardless of
                        who they follow. Followed-shops row was misleading
                        because it hid new listings from unfollowed sellers. */}
                    <Text style={styles.homeFeedTitle}>Fresh from the Nest</Text>
                    <TouchableOpacity accessibilityLabel="See all products in browse" accessibilityRole="button" onPress={() => { haptics.tap(); router.push("/(tabs)/browse"); }} testID="home-feed-see-all">
                      <Text style={styles.homeFeedSeeAll}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.homeFeedRow}
                    testID="home-feed-scroller"
                   keyboardShouldPersistTaps="handled">
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
                 accessibilityRole="button">
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
  abandonedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    paddingRight: spacing.sm,
    ...shadows.card,
  },
  abandonedBannerBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  abandonedBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  abandonedBannerTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  abandonedBannerSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  abandonedBannerDismiss: { padding: spacing.sm },
});
