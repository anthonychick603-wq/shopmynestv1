import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { decodeEntities, stripHtml } from "@/src/utils/html";
import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { addProduct } = useCart();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [imageIdx, setImageIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  const onFav = () => {
    if (!user) return router.push("/(auth)/login");
    if (product) toggleFavorite(product.id);
  };

  const load = useCallback(async () => {
    setErr(null);
    try {
      const p = toProduct(await nest.getProduct(id!));
      setProduct(p);
    } catch (e) {
      setErr(e instanceof ApiError ? e.friendly : "Product not available");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const price = product?.sale_price ?? product?.price ?? 0;
  const onSale = product?.sale_price != null && product.sale_price < (product.price ?? 0);

  const doAdd = async (buyNow = false) => {
    if (!user) return router.push("/(auth)/login");
    if (!product) return;
    if (adding) return;
    setAdding(true);
    try {
      const ok = addProduct(product, qty);
      if (!ok) {
        toast.error("Out of stock");
      } else if (buyNow) {
        router.push("/cart");
      } else {
        toast.success("Added to cart");
      }
    } finally {
      setAdding(false);
    }
  };

  const doShare = async () => {
    if (!product) return;
    try {
      await Share.share({ message: `Check out ${product.title} on My Nest.` });
    } catch {}
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  }
  if (err || !product) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.errText}>{err ?? "Product not found"}</Text><Button title="Back" onPress={() => router.back()} style={{ marginTop: spacing.md }} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBtn} testID="product-back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity style={styles.topBtn} onPress={onFav} testID="product-favorite">
            <Ionicons name={isFavorite(product.id) ? "heart" : "heart-outline"} size={20} color={isFavorite(product.id) ? colors.error : colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={doShare} testID="product-share"><Ionicons name="share-outline" size={20} color={colors.onSurface} /></TouchableOpacity>
          <CartHeaderButton />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 130 }} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: product.images[imageIdx] }} style={styles.hero} resizeMode="cover" />
        {product.images.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {product.images.map((img, i) => (
              <TouchableOpacity key={i} onPress={() => setImageIdx(i)} style={[styles.thumb, imageIdx === i && styles.thumbActive]}>
                <Image source={{ uri: img }} style={styles.thumbImg} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ padding: spacing.lg }}>
          <Text style={styles.title}>{product.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 6 }}>
            <Text style={styles.price}>${price.toFixed(2)}</Text>
            {onSale ? <Text style={styles.priceOld}>${product.price.toFixed(2)}</Text> : null}
          </View>
          <View style={styles.stockRow}>
            <View style={[styles.dot, { backgroundColor: product.in_stock ? colors.success : colors.error }]} />
            <Text style={styles.stockText}>{product.in_stock ? "In stock" : "Out of stock"}</Text>
          </View>

          {product.seller ? (
            <TouchableOpacity style={styles.sellerRow} onPress={() => router.push(`/seller/${product.seller!.id}`)} testID="product-seller-link" activeOpacity={0.85}>
              {product.seller.profile_photo ? (
                <Image source={{ uri: product.seller.profile_photo }} style={styles.sellerAvatar} />
              ) : (
                <View style={[styles.sellerAvatar, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary }]}>
                  <Ionicons name="leaf" size={16} color={colors.brand} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.sellerLabel}>Sold by</Text>
                <Text style={styles.sellerName}>{product.seller.name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}

          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.varLabel}>Quantity</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity onPress={() => setQty((q) => Math.max(1, q - 1))} style={styles.qtyBtn} testID="qty-decrement"><Ionicons name="remove" size={18} color={colors.onSurface} /></TouchableOpacity>
              <Text style={styles.qtyText}>{qty}</Text>
              <TouchableOpacity onPress={() => setQty((q) => q + 1)} style={styles.qtyBtn} testID="qty-increment"><Ionicons name="add" size={18} color={colors.onSurface} /></TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.varLabel, { marginTop: spacing.xl }]}>About this item</Text>
          <Text style={styles.description}>{stripHtml(product.description)}</Text>

          <View style={styles.infoCard}>
            <Ionicons name="cube-outline" size={20} color={colors.brand} />
            <Text style={styles.infoText}>Ships from My Nest. Sellers set their own turnaround; delivery details finalize at checkout.</Text>
          </View>

          <TouchableOpacity style={styles.reportBtn} onPress={() => router.push(`/report/${product.id}`)} testID="product-report">
            <Ionicons name="flag-outline" size={16} color={colors.onSurfaceMuted} />
            <Text style={styles.reportText}>Report this item</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity onPress={() => doAdd(false)} disabled={adding || !product.in_stock} style={[styles.actionSecondary, (!product.in_stock || adding) && { opacity: 0.5 }]} testID="product-add-cart">
          <Ionicons name="bag-add-outline" size={20} color={colors.onSurface} />
          <Text style={styles.actionSecondaryText}>Add to cart</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => doAdd(true)} disabled={adding || !product.in_stock} style={[styles.actionPrimary, (!product.in_stock || adding) && { opacity: 0.5 }]} testID="product-buy-now">
          {adding ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.actionPrimaryText}>Buy now</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errText: { color: colors.onSurfaceMuted },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", justifyContent: "space-between", padding: spacing.md, paddingTop: spacing.lg },
  topBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", ...shadows.card },
  hero: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceTertiary },
  thumbRow: { padding: spacing.md, gap: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: radius.md, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  thumbActive: { borderColor: colors.brand },
  thumbImg: { width: "100%", height: "100%" },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  price: { fontSize: 26, fontWeight: "800", color: colors.onSurface },
  priceOld: { fontSize: 15, color: colors.onSurfaceMuted, marginLeft: 8, textDecorationLine: "line-through" },
  stockRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stockText: { color: colors.onSurfaceMuted, fontSize: 13, fontWeight: "700" },
  sellerRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.lg, gap: spacing.md, ...shadows.card },
  sellerAvatar: { width: 40, height: 40, borderRadius: 20 },
  sellerLabel: { fontSize: 11, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  sellerName: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  varLabel: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.sm },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  qtyBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 17, fontWeight: "800", color: colors.onSurface, minWidth: 24, textAlign: "center" },
  description: { color: colors.onSurface, lineHeight: 22, fontSize: 14 },
  infoCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  infoText: { flex: 1, color: colors.onSurface, fontSize: 13 },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, alignSelf: "flex-start" },
  reportText: { color: colors.onSurfaceMuted, textDecorationLine: "underline", fontSize: 13 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", backgroundColor: colors.surfaceSecondary, padding: spacing.md, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  actionSecondary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, minHeight: 52 },
  actionSecondaryText: { color: colors.onSurface, fontWeight: "700" },
  actionPrimary: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.pill, minHeight: 52 },
  actionPrimaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
});
