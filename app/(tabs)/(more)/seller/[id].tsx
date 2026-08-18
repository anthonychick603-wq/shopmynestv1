import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, type NestSellerRaw, type NestSellerReviewRaw } from "@/src/api/nest";
import { toPost, toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Post, Product, SellerBadge as SellerBadgeType } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { PostCard } from "@/src/components/PostCard";
import { SellerBadge } from "@/src/components/SellerBadge";
import { RatingBadge } from "@/src/components/RatingBadge";
import { EmptyState } from "@/src/components/EmptyState";
import { decodeEntities } from "@/src/utils/html";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { safeBack } from "@/src/utils/nav";
import { shareSeller } from "@/src/utils/share";

export default function SellerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { addProduct } = useCart();
  const { isFavorite, toggle } = useFavorites();

  const [seller, setSeller] = useState<NestSellerRaw | null>(null);
  const [badge, setBadge] = useState<SellerBadgeType | null>(null);
  const [proSeller, setProSeller] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  // v1.0.64 - reviews section (Build #4). Only first page is shown inline;
  // "See all reviews" navigates to a dedicated screen when the shop has more
  // than can be shown here without pushing the listings grid off-screen.
  const [reviews, setReviews] = useState<NestSellerReviewRaw[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [sellerRes, badgeRes, proRes, prodRes, reviewsRes] = await Promise.all([
      nest.getSeller(id!).catch(() => null),
      nest.trust.getSellerBadge(id!).catch(() => null),
      nest.trust.getProStatus(id!).catch(() => null),
      nest.getSellerProducts(id!, { per_page: 50 }).catch(() => ({ items: [], total: 0 })),
      nest.getSellerReviews(id!, { per_page: 3 }).catch(() => ({ items: [], total: 0, average: 0, page: 1, total_pages: 0 })),
    ]);
    setSeller(sellerRes);
    setBadge(badgeRes as SellerBadgeType | null);
    setProSeller(!!proRes?.pro_seller);
    setProducts((prodRes.items || []).map(toProduct));
    setPosts((sellerRes?.posts || []).map(toPost));
    setReviews(reviewsRes.items || []);
    setReviewTotal(reviewsRes.total || 0);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

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

  const onFav = (p: Product) => {
    if (!user) return router.push("/(auth)/login");
    toggle(p.id);
  };

  const storeName = decodeEntities(seller?.store_name || "Seller");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/seller/dashboard")} style={styles.topBtn} testID="seller-back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{storeName}</Text>
        <View style={styles.topRight}>
          {/* v1.0.56 - share the shop. */}
          {seller ? (
            <TouchableOpacity
              onPress={() => shareSeller({ id: seller.id, store_name: seller.store_name, tagline: seller.tagline, about: seller.about })}
              style={styles.topBtn}
              testID="seller-share"
            >
              <Ionicons name="share-outline" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          ) : null}
          <CartHeaderButton />
        </View>
      </View>
      {loading ? (
        <ProductGridSkeleton count={4} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.profileRow}>
                {seller?.avatar ? (
                  <Image source={{ uri: seller.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="leaf" size={28} color={colors.brand} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.storeName}>{storeName}</Text>
                  {/* v1.0.64 - Build #4: shop rating under the store name. */}
                  <View style={{ marginTop: 4 }}>
                    <RatingBadge rating={seller?.rating} reviewCount={seller?.review_count} size="md" showEmpty />
                  </View>
                  {seller?.tagline ? <Text style={styles.tagline} numberOfLines={2}>{decodeEntities(seller.tagline)}</Text> : null}
                </View>
              </View>

              {user && seller && String(id) !== String(user.id) ? (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.messageBtn}
                    onPress={() => router.push({ pathname: "/messages/[userId]", params: { userId: String(id), name: storeName } })}
                    testID="seller-message"
                  >
                    <Ionicons name="chatbubble-ellipses" size={16} color={colors.onBrand} />
                    <Text style={styles.messageBtnText}>Message shop</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {badge ? <View style={{ marginTop: spacing.lg }}><SellerBadge badge={badge} proSeller={proSeller} /></View> : null}

              {seller?.about || seller?.bio ? (
                <View style={styles.aboutCard}>
                  <Text style={styles.aboutTitle}>About the shop</Text>
                  <Text style={styles.aboutBody}>{decodeEntities((seller?.about || seller?.bio) as string)}</Text>
                </View>
              ) : null}

              {posts.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Posts</Text>
                  {posts.map((p) => <PostCard key={p.id} post={p} />)}
                </>
              ) : null}

              {reviews.length > 0 ? (
                <>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Reviews</Text>
                    <RatingBadge rating={seller?.rating} reviewCount={reviewTotal} size="md" />
                  </View>
                  {reviews.map((r) => <ReviewRow key={r.id} row={r} />)}
                  {reviewTotal > reviews.length ? (
                    <TouchableOpacity
                      style={styles.seeAllReviews}
                      onPress={() => router.push({ pathname: "/seller/reviews", params: { id: String(id), name: storeName } })}
                      testID="seller-see-all-reviews"
                    >
                      <Text style={styles.seeAllReviewsText}>See all {reviewTotal} reviews</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.brand} />
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.sectionTitle}>Listings</Text>
            </View>
          }
          renderItem={({ item }) => <ProductCard product={item} layout="grid" onAddToCart={() => onAdd(item)} onToggleFavorite={() => onFav(item)} isFavorite={isFavorite(item.id)} />}
          ListEmptyComponent={<EmptyState icon="cube-outline" title="No listings yet" message="This seller hasn't posted any items." testID="seller-empty" />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, flex: 1, textAlign: "center" },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  storeName: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  tagline: { fontSize: 14, fontStyle: "italic", color: colors.onSurface, marginTop: 4, lineHeight: 19 },
  aboutCard: { marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  aboutTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.xs },
  aboutBody: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, flexWrap: "wrap" },
  messageBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, backgroundColor: colors.brand, borderRadius: radius.pill },
  messageBtnText: { color: colors.onBrand, fontWeight: "700", fontSize: 13 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAllReviews: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  seeAllReviewsText: { color: colors.brand, fontWeight: "700", fontSize: 14 },
});

// v1.0.64 - Build #4: single review row rendered in the seller profile
// "Reviews" section. Kept in this file because it's not reused elsewhere
// yet; move to /components if the reviews-list screen picks it up.
function ReviewRow({ row }: { row: NestSellerReviewRaw }) {
  const stars = Math.max(1, Math.min(5, row.rating || 0));
  const when = row.created_at ? new Date(row.created_at.replace(" ", "T") + "Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
  return (
    <View style={reviewStyles.card}>
      <View style={reviewStyles.headerRow}>
        {row.reviewer?.avatar ? (
          <Image source={{ uri: row.reviewer.avatar }} style={reviewStyles.avatar} />
        ) : (
          <View style={[reviewStyles.avatar, reviewStyles.avatarFallback]}><Ionicons name="person" size={16} color={colors.onSurfaceMuted} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={reviewStyles.reviewer} numberOfLines={1}>{decodeEntities(row.reviewer?.display_name || "Anonymous")}</Text>
          <View style={reviewStyles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons key={n} name={n <= stars ? "star" : "star-outline"} size={13} color={colors.brand} />
            ))}
            {when ? <Text style={reviewStyles.when}>{when}</Text> : null}
          </View>
        </View>
      </View>
      {row.review ? <Text style={reviewStyles.body}>{decodeEntities(row.review)}</Text> : null}
    </View>
  );
}

const reviewStyles = StyleSheet.create({
  card: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  reviewer: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  when: { fontSize: 12, color: colors.onSurfaceMuted, marginLeft: spacing.sm },
  body: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
});
