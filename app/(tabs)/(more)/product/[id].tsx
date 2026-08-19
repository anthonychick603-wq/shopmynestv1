import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
import { AppImage } from "@/src/components/AppImage";
import { safeBack } from "@/src/utils/nav";
import { shareProduct } from "@/src/utils/share";
import { haptics } from "@/src/utils/haptics";
import { ProductDetailSkeleton } from "@/src/components/ProductDetailSkeleton";
import { VariationPicker, findMatchingVariation } from "@/src/components/VariationPicker";
import type { ProductVariationDetail } from "@/src/types";

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
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.91 — for variable products, the buyer must pick each attribute
  // (e.g. Size, Color) before the add-to-cart button becomes enabled.
  const [picked, setPicked] = useState<Record<string, string>>({});

  const onFav = () => {
    // v1.0.71 — haptic on every top-bar action so the buyer
    // gets consistent feedback between product detail and the seller
    // dashboard that shipped in v1.0.70.
    haptics.tap();
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

  // v1.0.91 — resolve the picked attribute map to a specific variation.
  const isVariable = product?.type === "variable" && Array.isArray(product.attributes) && product.attributes.length > 0;
  const matchedVariation: ProductVariationDetail | null = React.useMemo(() => {
    if (!isVariable || !product?.variation_details) return null;
    return findMatchingVariation(product.variation_details, picked) ?? null;
  }, [isVariable, product, picked]);
  const allPicked = !isVariable || (product?.attributes ?? []).every((a) => !!picked[a.name]);
  const variationAvailable = !isVariable || (matchedVariation?.is_purchasable && matchedVariation.stock_status !== "outofstock");

  const doAdd = async (buyNow = false) => {
    haptics.press();
    if (!user) return router.push("/(auth)/login");
    if (!product) return;
    if (adding) return;
    if (isVariable) {
      if (!allPicked) { toast.error("Pick an option for each attribute."); return; }
      if (!matchedVariation) { toast.error("That combination isn't available."); return; }
      if (!variationAvailable) { toast.error("This combination is out of stock."); return; }
    }
    setAdding(true);
    try {
      const ok = addProduct(product, qty, matchedVariation);
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
    haptics.tap();
    if (!product) return;
    // v1.0.56 - share sheet uses the shared util so product cards, product
    // detail, blog detail, and seller profile all produce the same title +
    // short description + link payload.
    await shareProduct(product);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ProductDetailSkeleton />
      </SafeAreaView>
    );
  }
  if (err || !product) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.errText}>{err ?? "Product not found"}</Text><Button title="Back" onPress={() => safeBack(router, "/(tabs)")} style={{ marginTop: spacing.md }} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)")} style={styles.topBtn} testID="product-back" accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity style={styles.topBtn} onPress={onFav} testID="product-favorite" accessibilityRole="button" accessibilityLabel={isFavorite(product.id) ? "Remove from favorites" : "Add to favorites"} hitSlop={8}>
            <Ionicons name={isFavorite(product.id) ? "heart" : "heart-outline"} size={20} color={isFavorite(product.id) ? colors.error : colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={doShare} testID="product-share" accessibilityRole="button" accessibilityLabel="Share this listing" hitSlop={8}><Ionicons name="share-outline" size={20} color={colors.onSurface} /></TouchableOpacity>
          <CartHeaderButton />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} colors={[colors.brand]} />}
      >
        <AppImage source={{ uri: product.images[imageIdx] }} style={styles.hero} resizeMode="cover" fallbackIcon="pricetag-outline" />
        {product.images.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {product.images.map((img, i) => (
              <TouchableOpacity key={i} onPress={() => { haptics.tap(); setImageIdx(i); }} style={[styles.thumb, imageIdx === i && styles.thumbActive]} accessibilityLabel={`Show image ${i + 1}`}>
                <AppImage source={{ uri: img }} style={styles.thumbImg} resizeMode="cover" fallbackIcon="pricetag-outline" />
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
            <TouchableOpacity style={styles.sellerRow} onPress={() => { haptics.tap(); router.push(`/seller/${product.seller!.id}`); }} testID="product-seller-link" activeOpacity={0.85} accessibilityLabel={`View shop by ${product.seller!.name}`}>
              {product.seller.profile_photo ? (
                <AppImage source={{ uri: product.seller.profile_photo }} style={styles.sellerAvatar} fallbackIcon="person-outline" />
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

          {product.seller && (!user || user.id !== product.seller.id) ? (
            <TouchableOpacity
              style={styles.askSellerBtn}
              onPress={() => {
                haptics.tap();
                if (!user) return router.push("/(auth)/login");
                router.push({
                  pathname: "/messages/[userId]",
                  params: {
                    userId: String(product.seller!.id),
                    name: product.seller!.name,
                    productId: String(product.id),
                    // v1.0.54 - Product.name doesn't exist on the mobile Product type
                    // (the adapter only produces `title`), so the prefill was
                    // literally rendering "about \"undefined\"." instead of the
                    // listing name. Use title, and decode entities so buyers
                    // don't see &#8217; in the draft.
                    draft: `Hi! I have a question about "${decodeEntities(product.title)}".`,
                  },
                });
              }}
              testID="product-ask-seller"
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
              <Text style={styles.askSellerText}>Ask the seller about this item</Text>
            </TouchableOpacity>
          ) : null}

          {isVariable && product.attributes ? (
            <View style={{ marginTop: spacing.lg }}>
              <VariationPicker
                attributes={product.attributes}
                variations={product.variation_details ?? []}
                picked={picked}
                onChange={setPicked}
              />
              {allPicked && matchedVariation && matchedVariation.price !== product.price ? (
                <Text style={styles.variationPrice}>
                  ${matchedVariation.price.toFixed(2)}
                  {matchedVariation.stock_status === "outofstock" || !matchedVariation.is_purchasable ? " · Out of stock" : ""}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.varLabel}>Quantity</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity onPress={() => { haptics.tap(); setQty((q) => Math.max(1, q - 1)); }} style={styles.qtyBtn} testID="qty-decrement" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Decrease quantity" accessibilityRole="button"><Ionicons name="remove" size={18} color={colors.onSurface} /></TouchableOpacity>
              <Text style={styles.qtyText} accessibilityLabel={`Quantity ${qty}`}>{qty}</Text>
              <TouchableOpacity onPress={() => { haptics.tap(); setQty((q) => {
                const stockNum = Number((product as any)?.stock);
                const cap = Number.isFinite(stockNum) && stockNum > 0 ? Math.min(99, stockNum) : 99;
                if (q + 1 > cap) {
                  toast.show(`Only ${cap} available.`);
                  return cap;
                }
                return q + 1;
              }); }} style={styles.qtyBtn} testID="qty-increment" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Increase quantity" accessibilityRole="button"><Ionicons name="add" size={18} color={colors.onSurface} /></TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.varLabel, { marginTop: spacing.xl }]}>About this item</Text>
          <Text style={styles.description}>{stripHtml(product.description)}</Text>

          <View style={styles.infoCard}>
            <Ionicons name="cube-outline" size={20} color={colors.brand} />
            <Text style={styles.infoText}>Ships from My Nest. Sellers set their own turnaround; delivery details finalize at checkout.</Text>
          </View>

          <TouchableOpacity style={styles.reportBtn} onPress={() => { haptics.tap(); router.push(`/report/${product.id}`); }} testID="product-report" accessibilityLabel="Report this item">
            <Ionicons name="flag-outline" size={16} color={colors.onSurfaceMuted} />
            <Text style={styles.reportText}>Report this item</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* No insets.bottom here: the tab bar sits below this screen and already
          clears the home indicator. */}
      <View style={[styles.bottomBar, { paddingBottom: spacing.md }]}>
        <TouchableOpacity onPress={() => doAdd(false)} disabled={adding || !product.in_stock || !variationAvailable || !allPicked} style={[styles.actionSecondary, (!product.in_stock || !variationAvailable || !allPicked || adding) && { opacity: 0.5 }]} testID="product-add-cart">
          <Ionicons name="bag-add-outline" size={20} color={colors.onSurface} />
          <Text style={styles.actionSecondaryText}>Add to cart</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => doAdd(true)} disabled={adding || !product.in_stock || !variationAvailable || !allPicked} style={[styles.actionPrimary, (!product.in_stock || !variationAvailable || !allPicked || adding) && { opacity: 0.5 }]} testID="product-buy-now">
          {adding ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.actionPrimaryText}>Buy now</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  askSellerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand },
  askSellerText: { color: colors.brand, fontWeight: "700", fontSize: 14 },
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
  variationPrice: { marginTop: spacing.sm, fontSize: 15, fontWeight: "700", color: colors.brand },
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
