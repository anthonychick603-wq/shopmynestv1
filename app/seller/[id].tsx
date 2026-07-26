import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, type NestSellerRaw } from "@/src/api/nest";
import { toPost, toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Post, Product, SellerBadge as SellerBadgeType } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { PostCard } from "@/src/components/PostCard";
import { SellerBadge } from "@/src/components/SellerBadge";
import { EmptyState } from "@/src/components/EmptyState";
import { decodeEntities } from "@/src/utils/html";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";

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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [sellerRes, badgeRes, proRes, prodRes] = await Promise.all([
      nest.getSeller(id!).catch(() => null),
      nest.trust.getSellerBadge(id!).catch(() => null),
      nest.trust.getProStatus(id!).catch(() => null),
      nest.getSellerProducts(id!, { per_page: 50 }).catch(() => ({ items: [], total: 0 })),
    ]);
    setSeller(sellerRes);
    setBadge(badgeRes as SellerBadgeType | null);
    setProSeller(!!proRes?.pro_seller);
    setProducts((prodRes.items || []).map(toProduct));
    setPosts((sellerRes?.posts || []).map(toPost));
    setLoading(false);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.topBtn} testID="seller-back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{storeName}</Text>
        <CartHeaderButton />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
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
                  {seller?.bio ? <Text style={styles.bio} numberOfLines={3}>{decodeEntities(seller.bio)}</Text> : null}
                </View>
              </View>

              {badge ? <View style={{ marginTop: spacing.lg }}><SellerBadge badge={badge} proSeller={proSeller} /></View> : null}

              {posts.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Posts</Text>
                  {posts.map((p) => <PostCard key={p.id} post={p} />)}
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
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  storeName: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  bio: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
});
