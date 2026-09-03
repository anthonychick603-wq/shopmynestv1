import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import type { Product } from "@/src/types";
import { decodeEntities, stripHtml } from "@/src/utils/html";
import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useRestockAlerts } from "@/src/context/RestockAlertsContext";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { AppImage } from "@/src/components/AppImage";
import { ZoomableImage } from "@/src/components/ZoomableImage";
import { ZoomableImageViewer } from "@/src/components/ZoomableImageViewer";
import { InlineVideoHero, FullscreenVideoModal, isVideoSupported } from "@/src/components/InlineVideoHero";
import { useStripe } from "@stripe/stripe-react-native";
import { useStripeKey } from "@/src/context/StripePayment";
import { runExpressCheckout } from "@/src/utils/expressCheckout";
import { pushDetail, safeBack } from "@/src/utils/nav";
import { shareProduct } from "@/src/utils/share";
import { haptics } from "@/src/utils/haptics";
import { ProductDetailSkeleton } from "@/src/components/ProductDetailSkeleton";
import { VariationPicker, findMatchingVariation } from "@/src/components/VariationPicker";
import { ProductCard } from "@/src/components/ProductCard";
import type { ProductVariationDetail } from "@/src/types";

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { addProduct } = useCart();
  // v1.0.214 (P0 #8) — express checkout wires straight into the same
  // native Stripe PaymentSheet the cart uses. We only need the two sheet
  // methods + the publishable-key setter; the util does the rest.
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { setPublishableKey } = useStripeKey();
  const [expressPaying, setExpressPaying] = useState(false);
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const { enabled: restockAlertsEnabled, isWatching, addWatch, removeWatch } = useRestockAlerts();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [imageIdx, setImageIdx] = useState(0);
  // v1.0.207 — full-screen zoomable photo viewer. Tapping the hero
  // opens the viewer at the currently selected image.
  const [viewerOpen, setViewerOpen] = useState(false);
  // v1.0.213 (P0 #7) — fullscreen video modal state. Inline hero autoplays
  // muted; this flips true when the buyer taps the hero or the expand chip.
  const [videoFullscreenOpen, setVideoFullscreenOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.91 — for variable products, the buyer must pick each attribute
  // (e.g. Size, Color) before the add-to-cart button becomes enabled.
  const [picked, setPicked] = useState<Record<string, string>>({});
  // v1.0.210 (P0 #4) — similar-items rail. Loaded lazily once the main
  // product is on screen so it doesn't block the first paint.
  const [similar, setSimilar] = useState<Product[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

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

  // v1.0.210 (P0 #4) — fetch similar products after the main product is
  // available. We fire this off separately from the main load so a slow
  // similar query never delays PDP first paint. Silently ignore failures;
  // the rail simply doesn't render.
  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;
    setSimilarLoading(true);
    nest.getSimilarProducts(product.id, 12)
      .then((r) => {
        if (cancelled) return;
        setSimilar((r.items || []).map((it) => toProduct(it)));
      })
      .catch(() => { if (!cancelled) setSimilar([]); })
      .finally(() => { if (!cancelled) setSimilarLoading(false); });
    return () => { cancelled = true; };
  }, [product?.id]);

  // v1.0.94 (Build #18a) — track this view in the buyer's recently-viewed
  // list. Best-effort: silently ignore failures (guest users, offline).
  useEffect(() => {
    if (!user || !id) return;
    nest.trackRecentlyViewed(id).catch(() => { /* silent */ });
  }, [user, id]);

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

  const restockVariationId = isVariable && allPicked && matchedVariation ? matchedVariation.id : undefined;
  const restockVariationLabel = React.useMemo(() => {
    if (!isVariable || !allPicked || !product?.attributes) return undefined;
    return product.attributes.map((a) => {
      const value = picked[a.name];
      const option = a.options.find((o) => o.slug === value);
      return `${a.label}: ${option?.label ?? value}`;
    }).join(" · ");
  }, [allPicked, isVariable, picked, product]);
  const isOwnListing = !!user && !!product?.seller && user.id === product.seller.id;
  const canOfferRestockAlert = !isOwnListing && (!product?.in_stock || (isVariable && allPicked && !!matchedVariation && !variationAvailable));
  const restockWatching = product ? isWatching(product.id, restockVariationId) : false;

  const toggleRestockWatch = async () => {
    haptics.tap();
    if (!user) return router.push("/(auth)/login");
    if (!product) return;
    if (restockWatching) {
      await removeWatch(product.id, restockVariationId);
      toast.show("Restock alert removed.");
      return;
    }
    if (!restockAlertsEnabled) {
      toast.show("Back-in-stock alerts are turned off in Notifications settings.");
      return;
    }
    await addWatch({
      productId: product.id,
      variationId: restockVariationId,
      title: product.title,
      variationLabel: restockVariationLabel,
    });
    haptics.success();
    toast.success("We'll alert you when it's available again.");
  };

  // v1.0.214 (P0 #8) — express checkout: fires PaymentSheet for just this
  // product using the buyer's default saved address. Skips the cart. If
  // the buyer has no saved address we bounce them to the cart flow, where
  // the address form is already wired up.
  const doExpressCheckout = async () => {
    haptics.press();
    if (!user) return router.push("/(auth)/login");
    if (!product) return;
    if (expressPaying) return;
    if (isVariable) {
      if (!allPicked) { toast.error("Pick an option for each attribute."); return; }
      if (!matchedVariation) { toast.error("That combination isn't available."); return; }
      if (!variationAvailable) { toast.error("This combination is out of stock."); return; }
    }
    setExpressPaying(true);
    try {
      const items = [{
        product_id: Number(product.id),
        quantity: qty,
        // ProductVariationDetail uses `id` for the variation post id; the
        // checkout endpoint expects it under `variation_id`.
        ...(matchedVariation?.id ? { variation_id: Number(matchedVariation.id) } : {}),
      }];
      const result = await runExpressCheckout({
        items,
        buyerEmail: user.email ?? undefined,
        stripe: { initPaymentSheet, presentPaymentSheet, setPublishableKey },
      });
      if (result.kind === "success") {
        toast.success("Payment received! Your order is confirmed.");
        router.push("/orders");
      } else if (result.kind === "missing_address") {
        toast.show("Add a shipping address to check out. Take me to the cart to add one.", "info");
        // Land the buyer in cart with this item so they don't lose their
        // place, and can finish through the normal flow.
        addProduct(product, qty, matchedVariation);
        router.push("/cart");
      } else if (result.kind === "error") {
        toast.error(result.message);
      }
      // "cancelled" — user dismissed the sheet, stay quiet.
    } finally {
      setExpressPaying(false);
    }
  };

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
    return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.errText}>{err ?? "Product not found"}</Text><Button title="Back" onPress={() => safeBack(router, "/(tabs)/browse")} style={{ marginTop: spacing.md }} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/browse")} style={styles.topBtn} testID="product-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity style={styles.topBtn} onPress={onFav} testID="product-favorite" accessibilityRole="button" accessibilityLabel={isFavorite(product.id) ? "Remove from favorites" : "Add to favorites"} hitSlop={8}>
            <Ionicons name={isFavorite(product.id) ? "heart" : "heart-outline"} size={20} color={isFavorite(product.id) ? colors.error : colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.topBtn} onPress={doShare} testID="product-share" accessibilityRole="button" accessibilityLabel="Share this listing" hitSlop={8}><Ionicons name="share-outline" size={20} color={colors.onSurface} /></TouchableOpacity>
          <AlertsBellButton />
          <CartHeaderButton />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brand} colors={[colors.brand]} />}
       keyboardShouldPersistTaps="handled">
        {/* v1.0.213 (P0 #7) — hero region. If the seller uploaded a product
            video and expo-video is available, the video occupies a virtual
            slot 0 (thumbnails still show all images alongside a video tile
            at the front). Autoplays muted + looping; tapping the hero or
            expand chip opens the fullscreen player with sound. When the
            hero is on an image slot we keep the existing pinch-zoom flow. */}
        <View style={styles.heroWrap}>
          {product.video_url && imageIdx === 0 && isVideoSupported() ? (
            <InlineVideoHero
              uri={product.video_url}
              style={styles.hero}
              onOpenFullscreen={() => setVideoFullscreenOpen(true)}
            />
          ) : (
            <ZoomableImage
              uri={product.images[product.video_url ? Math.max(0, imageIdx - 1) : imageIdx]}
              style={styles.hero}
              resizeMode="cover"
              fallbackIcon="pricetag-outline"
              onSingleTap={() => { haptics.tap(); setViewerOpen(true); }}
            />
          )}
          {product.video_url && !isVideoSupported() ? (
            // Legacy fallback badge when expo-video isn't present in the
            // build — keeps the buyer aware there's a clip.
            <View style={styles.heroVideoBadge} accessibilityLabel="Product has a video">
              <Ionicons name="play-circle" size={22} color={colors.onBrand} />
              <Text style={styles.heroVideoBadgeText}>Video</Text>
            </View>
          ) : null}
        </View>
        {(product.images.length > 1 || (product.video_url && isVideoSupported())) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow} keyboardShouldPersistTaps="handled">
            {product.video_url && isVideoSupported() ? (
              <TouchableOpacity
                key="video-thumb"
                onPress={() => { haptics.tap(); setImageIdx(0); }}
                style={[styles.thumb, imageIdx === 0 && styles.thumbActive]}
                accessibilityLabel="Show product video"
                accessibilityRole="button"
                testID="pdp-video-thumb"
              >
                <View style={styles.videoThumbInner}>
                  <Ionicons name="play" size={22} color={colors.onBrand} />
                </View>
              </TouchableOpacity>
            ) : null}
            {product.images.map((img, i) => {
              // When a video occupies slot 0, image i corresponds to display
              // slot i + 1. Otherwise slots line up with the image array.
              const slot = product.video_url && isVideoSupported() ? i + 1 : i;
              return (
                <TouchableOpacity key={i} onPress={() => { haptics.tap(); setImageIdx(slot); }} style={[styles.thumb, imageIdx === slot && styles.thumbActive]} accessibilityLabel={`Show image ${i + 1}`} accessibilityRole="button">
                  <AppImage source={{ uri: img }} style={styles.thumbImg} resizeMode="cover" fallbackIcon="pricetag-outline" />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={{ padding: spacing.lg }}>
          <Text style={styles.title}>{product.title}</Text>
          {product.product_rating?.review_count ? (
            <TouchableOpacity
              style={styles.ratingRow}
              onPress={() => { haptics.tap(); router.push(`/product/${product.id}/reviews` as Href); }}
              testID="product-reviews-link"
              accessibilityLabel={`Read ${product.product_rating.review_count} product reviews`}
             accessibilityRole="button">
              <Text style={styles.ratingStars}>★</Text>
              <Text style={styles.ratingText}>{product.product_rating.rating.toFixed(1)} · {product.product_rating.review_count} {product.product_rating.review_count === 1 ? "review" : "reviews"}</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : <Text style={styles.noReviews}>No reviews yet</Text>}
          <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 6 }}>
            <Text style={styles.price}>${price.toFixed(2)}</Text>
            {onSale ? <Text style={styles.priceOld}>${product.price.toFixed(2)}</Text> : null}
          </View>
          <View style={styles.stockRow}>
            <View style={[styles.dot, { backgroundColor: product.in_stock ? colors.success : colors.error }]} />
            <Text style={styles.stockText}>{product.in_stock ? "In stock" : "Out of stock"}</Text>
          </View>

          {product.seller ? (
            <TouchableOpacity style={styles.sellerRow} onPress={() => { haptics.tap(); router.push(`/seller/${product.seller!.id}`); }} testID="product-seller-link" activeOpacity={0.85} accessibilityLabel={`View shop by ${product.seller!.name}`} accessibilityRole="button">
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
             accessibilityRole="button">
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
                const stockNum = Number(product?.stock);
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

          <TouchableOpacity style={styles.reportBtn} onPress={() => { haptics.tap(); router.push(`/report/${product.id}`); }} testID="product-report" accessibilityLabel="Report this item" accessibilityRole="button">
            <Ionicons name="flag-outline" size={16} color={colors.onSurfaceMuted} />
            <Text style={styles.reportText}>Report this item</Text>
          </TouchableOpacity>
        </View>

        {/* v1.0.210 (P0 #4) — similar items rail. Only render when we
            actually have results; skeletons here would just be noise
            because the rail is below the fold. */}
        {similar.length > 0 ? (
          <View style={styles.similarSection}>
            <View style={styles.similarHeader}>
              <Text style={styles.similarTitle}>You might also like</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.similarRow}
              testID="product-similar-scroller"
              keyboardShouldPersistTaps="handled"
            >
              {similar.map((item) => (
                <View key={item.id} style={styles.similarItem}>
                  <ProductCard
                    product={item}
                    layout="full"
                    onAddToCart={() => {
                      haptics.tap();
                      if (!user) return router.push("/(auth)/login");
                      addProduct(item, 1);
                    }}
                    onToggleFavorite={() => {
                      haptics.tap();
                      if (!user) return router.push("/(auth)/login");
                      toggleFavorite(item.id);
                    }}
                    isFavorite={isFavorite(item.id)}
                    testID={`product-similar-card-${item.id}`}
                  />
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </ScrollView>

      {/* No insets.bottom here: the tab bar sits below this screen and already
          clears the home indicator. */}
      <View style={[styles.bottomBar, { paddingBottom: spacing.md }]}>
        {canOfferRestockAlert ? (
          <TouchableOpacity
            onPress={toggleRestockWatch}
            style={[styles.restockAction, restockWatching && styles.restockActionActive]}
            testID="product-restock-alert"
            accessibilityRole="button"
            accessibilityLabel={restockWatching ? "Remove back in stock alert" : "Notify me when available"}
          >
            <Ionicons name={restockWatching ? "notifications" : "notifications-outline"} size={20} color={restockWatching ? colors.onBrand : colors.brand} />
            <Text style={[styles.restockActionText, restockWatching && styles.restockActionTextActive]}>
              {restockWatching ? "Restock alert on" : "Notify me when available"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.purchaseActions}>
            {/* v1.0.214 (P0 #8) — express checkout: one-tap PaymentSheet
                with wallets (Apple/Google Pay) + saved cards. Uses the
                buyer's default saved address; bounces to cart if there
                isn't one yet. Hidden for own listings and out-of-stock. */}
            {!isOwnListing && product.in_stock && variationAvailable && allPicked ? (
              <TouchableOpacity
                onPress={doExpressCheckout}
                disabled={expressPaying || adding}
                style={[styles.actionExpress, (expressPaying || adding) && styles.actionDisabled]}
                testID="product-express-checkout"
                accessibilityRole="button"
                accessibilityLabel="Express checkout with saved wallet"
              >
                {expressPaying ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <>
                    <Ionicons name="flash" size={18} color={colors.onBrand} />
                    <Text style={styles.actionExpressText}>Express checkout</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            <View style={styles.purchaseRow}>
              <TouchableOpacity onPress={() => doAdd(false)} disabled={adding || !product.in_stock || !variationAvailable || !allPicked} style={[styles.actionSecondary, (!product.in_stock || !variationAvailable || !allPicked || adding) && styles.actionDisabled]} testID="product-add-cart" accessibilityRole="button">
                <Ionicons name="bag-add-outline" size={20} color={colors.onSurface} />
                <Text style={styles.actionSecondaryText}>Add to cart</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => doAdd(true)} disabled={adding || !product.in_stock || !variationAvailable || !allPicked} style={[styles.actionPrimary, (!product.in_stock || !variationAvailable || !allPicked || adding) && styles.actionDisabled]} testID="product-buy-now" accessibilityRole="button">
                {adding ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.actionPrimaryText}>Buy now</Text>}
              </TouchableOpacity>
            </View>
            {product.customizable === true && user?.id !== product.seller?.id ? (
              <TouchableOpacity
                style={styles.requestCustomization}
                onPress={() => { haptics.tap(); pushDetail(router, `/custom-request/new?productId=${product.id}`); }}
                testID="product-request-customization"
                accessibilityRole="button"
                accessibilityLabel="Request customization"
              >
                <Ionicons name="hammer-outline" size={19} color={colors.brand} />
                <Text style={styles.requestCustomizationText}>Request customization</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>

      {/* v1.0.207 — full-screen zoomable photo viewer, opened by tapping
          the hero. Handles pinch, pan, double-tap-to-zoom, and horizontal
          swipe between images. */}
      <ZoomableImageViewer
        visible={viewerOpen}
        images={product.images}
        initialIndex={product.video_url && isVideoSupported() ? Math.max(0, imageIdx - 1) : imageIdx}
        onClose={() => setViewerOpen(false)}
      />
      {/* v1.0.213 (P0 #7) — fullscreen video player, opened from the
          inline hero. Unmuted, native controls, tap X to close. */}
      {product.video_url && isVideoSupported() ? (
        <FullscreenVideoModal
          uri={product.video_url}
          visible={videoFullscreenOpen}
          onClose={() => setVideoFullscreenOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  // v1.0.226 — Product Detail refinement.
  //   • Buy box (bottom bar) reads as one white raised strip with a
  //     hairline top edge, so the Add / Buy row sits on a real surface.
  //   • Secondary actions (Ask seller, Request customization, Restock)
  //     become white “ghost” pills with a hairline warm-gray border and
  //     a brand-tinted label — they read like Stripe outline buttons.
  //   • Seller strip and info card move to white + hairline.
  //   • Type hierarchy tightens: title uses h1, price uses the shared
  //     `price` token, section labels use `micro`.
  askSellerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  askSellerText: { ...typeTokens.caption, color: colors.brand, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errText: { color: colors.onSurfaceMuted },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, flexDirection: "row", justifyContent: "space-between", padding: spacing.md, paddingTop: spacing.lg },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: { width: "100%", aspectRatio: 1, backgroundColor: colors.surfaceTertiary },
  // v1.0.204 — hero wrapper for the optional video badge.
  heroWrap: { position: "relative" },
  heroVideoBadge: { position: "absolute", right: spacing.md, bottom: spacing.md, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.md, backgroundColor: "rgba(0,0,0,0.55)" },
  heroVideoBadgeText: { color: colors.onBrand, fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  thumbRow: { padding: spacing.md, gap: spacing.sm },
  thumb: { width: 64, height: 64, borderRadius: radius.md, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  thumbActive: { borderColor: colors.brand },
  thumbImg: { width: "100%", height: "100%" },
  // v1.0.213 (P0 #7) — video-slot thumbnail. Solid brand color w/ play
  // glyph so it's clearly distinguishable from the image tiles.
  videoThumbInner: { flex: 1, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  title: { ...typeTokens.h1, fontSize: 22, lineHeight: 28 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", marginTop: spacing.sm },
  ratingStars: { color: colors.brand, fontSize: 16 },
  ratingText: { ...typeTokens.caption, color: colors.onSurface, fontWeight: "700" },
  noReviews: { ...typeTokens.caption, marginTop: spacing.sm },
  price: { ...typeTokens.price, fontSize: 26, lineHeight: 30 },
  priceOld: { ...typeTokens.body, color: colors.onSurfaceMuted, marginLeft: 8, textDecorationLine: "line-through" },
  stockRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stockText: { ...typeTokens.caption, fontWeight: "700" },
  sellerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  sellerAvatar: { width: 40, height: 40, borderRadius: 20 },
  sellerLabel: { ...typeTokens.micro },
  sellerName: { ...typeTokens.body, fontWeight: "700" },
  varLabel: { ...typeTokens.micro, marginBottom: spacing.sm },
  variationPrice: { ...typeTokens.body, marginTop: spacing.sm, color: colors.brand, fontWeight: "700" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { ...typeTokens.h3, minWidth: 24, textAlign: "center" },
  description: { ...typeTokens.body, color: colors.onSurface },
  // v1.0.210 (P0 #4) — similar items rail. Matches the Home
  // "Keep browsing" rail so the whole app feels of a piece.
  similarSection: { marginTop: spacing.md, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  similarHeader: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  similarTitle: { ...typeTokens.h2 },
  similarRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  similarItem: { width: 160 },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  infoText: { ...typeTokens.caption, flex: 1, color: colors.onSurface },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, alignSelf: "flex-start" },
  reportText: { ...typeTokens.caption, textDecorationLine: "underline" },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairlineStrong,
  },
  purchaseActions: { width: "100%" },
  purchaseRow: { flexDirection: "row", gap: spacing.sm },
  actionExpress: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, borderRadius: radius.pill, marginBottom: spacing.sm },
  actionExpressText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
  actionSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.pill,
    minHeight: 52,
  },
  actionSecondaryText: { ...typeTokens.body, color: colors.onSurface, fontWeight: "700" },
  actionPrimary: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.pill, minHeight: 52 },
  actionPrimaryText: { color: colors.onBrand, fontWeight: "800", fontSize: 15 },
  actionDisabled: { opacity: 0.5 },
  requestCustomization: {
    minHeight: 46,
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  requestCustomizationText: { ...typeTokens.caption, color: colors.brand, fontWeight: "800" },
  restockAction: {
    width: "100%",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  restockActionActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  restockActionText: { ...typeTokens.body, color: colors.brand, fontWeight: "800" },
  restockActionTextActive: { color: colors.onBrand },
});
