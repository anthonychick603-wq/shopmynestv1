import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { ApiError, nest, type ReviewableProduct } from "@/src/api/nest";
import { appendFilePart } from "@/src/utils/upload";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { RequireAuth } from "@/src/components/RequireAuth";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";

const MAX_PHOTOS = 5;

export default function ProductReviewComposer() {
  return (
    <RequireAuth message={'Sign in to leave a product review.'}>
      <ProductReviewComposerImpl />
    </RequireAuth>
  );
}

function ProductReviewComposerImpl() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, product_id } = useLocalSearchParams<{ id: string; product_id?: string }>();
  const orderId = Number(id);
  const initialProductId = Number(product_id);
  useBackFallback(`/order/${orderId}`);
  const [products, setProducts] = useState<ReviewableProduct[]>([]);
  const [selected, setSelected] = useState<ReviewableProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await nest.getReviewableProducts(orderId);
      const items = res.items || [];
      setProducts(items);
      if (initialProductId) {
        setSelected(items.find((item) => item.product_id === initialProductId) ?? {
          product_id: initialProductId, name: "Selected product", image: "", variation_id: 0, already_reviewed: false,
        });
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "We couldn't load products from this order.");
    } finally {
      setLoading(false);
    }
  }, [initialProductId, orderId]);

  useEffect(() => { load(); }, [load]);
  useInvalidateOnFocus(["orders"], load);

  const pickPhotos = async () => {
    // v1.0.241 — wrap the full permission + picker call in try/catch
    // so a native rejection (permission denied at OS level, picker
    // crash) becomes a toast, not an unhandled promise rejection.
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) return toast.info("You can add up to 5 photos.");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return toast.error("Photo library access is needed to add review photos.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.length) {
        setPhotos((current) => [...current, ...result.assets.slice(0, remaining)]);
      }
    } catch {
      toast.error("Couldn't open the photo library. Please try again.");
    }
  };

  const submit = async () => {
    if (!selected || selected.already_reviewed || submitting) return;
    setSubmitting(true);
    try {
      const uploads = await Promise.all(photos.map(async (asset, index) => {
        const formData = new FormData();
        appendFilePart(formData, "file", {
          uri: asset.uri,
          name: asset.fileName || `review-${Date.now()}-${index}.jpg`,
          type: asset.mimeType || "image/jpeg",
        });
        return nest.uploadReviewPhoto(formData);
      }));
      await nest.submitProductReview(selected.product_id, {
        order_id: orderId,
        rating,
        review: review.trim(),
        photo_ids: uploads.map((upload) => upload.id),
        ...(selected.variation_id ? { variation_id: selected.variation_id } : {}),
      });
      haptics.success();
      toast.success("Review posted");
      safeBack(router, `/order/${orderId}`);
    } catch (e) {
      haptics.error();
      toast.error(e instanceof ApiError ? e.friendly : "Couldn't post your review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, `/order/${orderId}`)} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Leave a review</Text>
        <View style={styles.topBtn} />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> : error ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load this order" message={error} actionLabel="Retry" onAction={load} />
      ) : !selected ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Which item would you like to review?</Text>
          {products.length === 0 ? <EmptyState icon="star-outline" title="Nothing to review yet" message="All eligible products in this completed order have already been reviewed." /> : products.map((product) => (
            <TouchableOpacity key={product.product_id} disabled={product.already_reviewed} style={[styles.productRow, product.already_reviewed && { opacity: 0.55 }]} onPress={() => setSelected(product)} accessibilityRole="button">
              {product.image ? <Image source={{ uri: product.image }} style={styles.productImage} /> : <View style={styles.productImage} />}
              <View style={{ flex: 1 }}><Text style={styles.productName}>{product.name}</Text><Text style={styles.productMeta}>{product.already_reviewed ? "Already reviewed" : "Leave a review"}</Text></View>
              <Ionicons name={product.already_reviewed ? "checkmark-circle" : "chevron-forward"} size={20} color={product.already_reviewed ? colors.success : colors.onSurfaceMuted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.selectedProduct} onPress={() => !initialProductId && setSelected(null)} accessibilityRole="button">
            <Text style={styles.selectedLabel}>Reviewing</Text><Text style={styles.productName}>{selected.name}</Text>
          </TouchableOpacity>
          {selected.already_reviewed ? <EmptyState icon="checkmark-circle-outline" title="Already reviewed" message="You already reviewed this product from this order." /> : <>
            <Text style={styles.label}>Your rating</Text>
            <View style={styles.stars}>{[1, 2, 3, 4, 5].map((star) => <TouchableOpacity key={star} onPress={() => { haptics.tap(); setRating(star); }} accessibilityLabel={`${star} stars`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button"><Ionicons name={star <= rating ? "star" : "star-outline"} size={36} color={colors.brand} /></TouchableOpacity>)}</View>
            <Text style={styles.label}>Your review</Text>
            <TextInput style={styles.input} value={review} onChangeText={(value) => setReview(value.slice(0, 2000))} multiline maxLength={2000} placeholder="Tell other buyers about this product…" placeholderTextColor={colors.onSurfaceMuted} />
            <Text style={styles.counter}>{review.length}/2000</Text>
            <View style={styles.photoHeader}><Text style={styles.label}>Photos (optional)</Text><TouchableOpacity onPress={pickPhotos} accessibilityRole="button"><Text style={styles.photoAction}>Add photos</Text></TouchableOpacity></View>
            <View style={styles.photos}>{photos.map((photo, index) => <View key={`${photo.uri}-${index}`} style={styles.photoTile}><Image source={{ uri: photo.uri }} style={styles.photo} /><TouchableOpacity onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))} style={styles.removePhoto} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={14} color={colors.onBrand} /></TouchableOpacity></View>)}</View>
            <Button title="Post review" onPress={submit} loading={submitting} disabled={submitting} testID="product-review-submit" />
          </>}
        </KeyboardAwareScroll>
      )}
    </SafeAreaView>
  );
}

// v1.0.227 — Write-review refinement. Product rows and text input read
// as white cards with hairline structure; body input uses field radius.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  topTitle: { ...typeTokens.h2, fontSize: 17 },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  label: { ...typeTokens.body, fontWeight: "800", marginBottom: spacing.sm },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  productImage: { width: 48, height: 48, borderRadius: radius.field, backgroundColor: colors.surfaceTertiary },
  productName: { ...typeTokens.body, fontWeight: "700" },
  productMeta: { ...typeTokens.caption, marginTop: 3 },
  selectedProduct: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  selectedLabel: { ...typeTokens.micro, fontWeight: "700", marginBottom: 3 },
  stars: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.xl },
  input: {
    ...typeTokens.body,
    minHeight: 130,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    padding: spacing.md,
    color: colors.onSurface,
    textAlignVertical: "top",
    backgroundColor: colors.surface,
  },
  counter: { ...typeTokens.caption, alignSelf: "flex-end", marginTop: spacing.xs, marginBottom: spacing.lg },
  photoHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  photoAction: { ...typeTokens.body, color: colors.brand, fontWeight: "700", marginBottom: spacing.sm },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  photoTile: { width: 72, height: 72, position: "relative" },
  photo: { width: "100%", height: "100%", borderRadius: radius.field },
  removePhoto: { position: "absolute", top: -5, right: -5, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
});
