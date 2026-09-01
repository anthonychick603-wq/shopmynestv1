import React from "react";
import { ImageStyle, StyleProp, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppImage } from "@/src/components/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { decodeEntities } from "@/src/utils/html";
import { shareProduct } from "@/src/utils/share";
import { pushFromCard } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { RatingBadge } from "@/src/components/RatingBadge";
import type { Product } from "@/src/types";

type Layout = "full" | "grid";

type Props = {
  product: Product;
  layout?: Layout;
  onAddToCart?: () => void;
  onToggleFavorite?: () => void;
  // v1.0.136 — optional long-press hook. Used by Recently Viewed to remove
  // a single row from the MRU, and available to any future screen that
  // needs a "press and hold" affordance on a card. Undefined by default
  // so existing screens keep their tap-only behavior.
  onLongPress?: () => void;
  isFavorite?: boolean;
  testID?: string;
};

export function ProductCard({ product, layout = "full", onAddToCart, onToggleFavorite, onLongPress, isFavorite, testID }: Props) {
  const router = useRouter();
  // v1.0.57 — detect whether this card is being rendered inside a (more)
  // stack (product/seller/blog detail) vs at a tab root (browse feed, home
  // feed, favorites list). Tab-root taps must reset the (more) stack so
  // back returns to the tab; (more) taps stack normally so back returns to
  // the previous flow screen (product → seller → product).
  const segments = useSegments();
  const insideMore = segments.includes("(more)" as never);
  const image =
    product.images?.[product.featured_image_index ?? 0] ??
    product.images?.[0] ??
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80";
  const price = product.sale_price ?? product.price;
  const onSale = product.sale_price != null && product.sale_price < product.price;

  const imgStyle: StyleProp<ImageStyle> = layout === "grid" ? styles.gridImg : styles.fullImg;

  return (
    <TouchableOpacity
      testID={testID ?? `product-card-${product.id}`}
      activeOpacity={0.9}
      onPress={() => pushFromCard(router, `/product/${product.id}`, insideMore)}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.card, layout === "grid" ? styles.gridCard : styles.fullCard]}
     hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
      <View>
        <AppImage source={{ uri: image }} style={imgStyle} contentFit="cover" fallbackIcon="pricetag-outline" />
        <TouchableOpacity
          testID={`product-favorite-${product.id}`}
          onPress={() => {
            // v1.0.69 — light tap on favorite; the Toast will fire the
            // success/error haptic once the request lands.
            haptics.tap();
            onToggleFavorite?.();
          }}
          style={styles.favBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={isFavorite ? "Remove from favorites" : "Add to favorites"}
          accessibilityRole="button"
        >
          <Ionicons name={isFavorite ? "heart" : "heart-outline"} size={20} color={isFavorite ? colors.error : colors.onSurface} />
        </TouchableOpacity>
        {/* v1.0.56 - share icon lets buyers copy a product link straight from the
            feed without opening the detail screen. */}
        <TouchableOpacity
          testID={`product-share-${product.id}`}
          onPress={() => {
            haptics.tap();
            shareProduct(product);
          }}
          style={styles.shareBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={`Share ${decodeEntities(product.title)}`}
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={18} color={colors.onSurface} />
        </TouchableOpacity>
        {onSale ? (
          <View style={styles.saleTag}>
            <Text style={styles.saleTagText}>SALE</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {decodeEntities(product.title)}
        </Text>
        <View style={styles.sellerRow}>
          {product.seller?.profile_photo ? (
            <AppImage source={{ uri: product.seller.profile_photo }} style={styles.sellerAvatar} fallbackIcon="person-outline" />
          ) : (
            <View style={[styles.sellerAvatar, styles.sellerAvatarFallback]}>
              <Ionicons name="leaf" size={10} color={colors.brand} />
            </View>
          )}
          <Text style={styles.sellerName} numberOfLines={1}>
            {decodeEntities(product.seller?.name ?? "My Nest")}
          </Text>
          {/* v1.0.64 - Build #4: inline star badge when the seller has reviews. */}
          <RatingBadge rating={product.seller?.rating} reviewCount={product.seller?.review_count} size="sm" />
        </View>
        <View style={styles.priceRow}>
          <View style={styles.priceInline}>
            <Text style={styles.price}>${price.toFixed(2)}</Text>
            {onSale ? <Text style={styles.priceOld}>${product.price.toFixed(2)}</Text> : null}
          </View>
          {product.in_stock ? (
            onAddToCart ? (
              <TouchableOpacity
                testID={`product-add-cart-${product.id}`}
                onPress={() => {
                  // Add-to-cart uses a heavier tick; success toast then
                  // confirms with a notification haptic.
                  haptics.press();
                  onAddToCart?.();
                }}
                style={styles.addBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel={`Add ${product.title} to cart`}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color={colors.onBrand} />
              </TouchableOpacity>
            ) : null
          ) : (
            <Text style={styles.oos}>Out of stock</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  fullCard: { marginBottom: spacing.lg },
  gridCard: { flex: 1, marginBottom: spacing.lg },
  fullImg: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.surfaceTertiary,
  },
  gridImg: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.surfaceTertiary,
  },
  favBtn: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  shareBtn: {
    position: "absolute",
    top: spacing.md + 40,
    right: spacing.md,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  saleTag: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    backgroundColor: colors.yellow,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  saleTagText: {
    color: colors.onSurface,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  body: { padding: spacing.md },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.xs,
    lineHeight: 20,
  },
  sellerRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  sellerAvatar: { width: 18, height: 18, borderRadius: 9, marginRight: 6 },
  sellerAvatarFallback: {
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  sellerName: { fontSize: 12, color: colors.onSurfaceMuted, flex: 1 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  priceInline: { flexDirection: "row", alignItems: "baseline" },
  price: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  priceOld: { fontSize: 12, color: colors.onSurfaceMuted, marginLeft: 6, textDecorationLine: "line-through" },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  oos: { fontSize: 11, color: colors.error, fontWeight: "700" },
});
