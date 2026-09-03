import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { ApiError, nest, type NestProductRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { appendFilePart } from "@/src/utils/upload";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { RequireAuth } from "@/src/components/RequireAuth";

type UploadedPhoto = { id: number; uri: string };

export default function NewCustomRequest() {
  return (
    <RequireAuth message={'Sign in to send a custom request to a seller.'}>
      <NewCustomRequestImpl />
    </RequireAuth>
  );
}

function NewCustomRequestImpl() {
  useBackFallback("/(tabs)/browse");
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const [product, setProduct] = useState<NestProductRaw | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(!!productId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await nest.getProduct(productId);
        if (!cancelled) setProduct(response);
      } catch {
        if (!cancelled) setError("We couldn't load this product.");
      } finally {
        if (!cancelled) setLoadingProduct(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const addPhotos = async () => {
    if (uploading || photos.length >= 3) return;
    // v1.0.241 — wrap the native permission + picker call in
    // try/catch so an OS rejection doesn't become an unhandled
    // promise rejection.
    let result: Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Photo permission is needed to add reference photos.");
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: true, selectionLimit: 3 - photos.length });
    } catch {
      setError("Couldn't open the photo library. Please try again.");
      return;
    }
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    setError(null);
    try {
      const nextPhotos: UploadedPhoto[] = [];
      for (const asset of result.assets.slice(0, 3 - photos.length)) {
        const name = asset.fileName || asset.uri.split("/").pop() || `reference-${Date.now()}.jpg`;
        const type = asset.mimeType || "image/jpeg";
        const form = new FormData();
        appendFilePart(form, "file", { uri: asset.uri, name, type });
        const uploaded = await nest.uploadMedia(form);
        nextPhotos.push({ id: uploaded.id, uri: uploaded.url || asset.uri });
      }
      setPhotos((current) => [...current, ...nextPhotos].slice(0, 3));
    } catch (e) {
      haptics.error();
      setError(e instanceof ApiError ? e.friendly : "Could not upload your photo. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!productId || !title.trim() || !description.trim()) return;
    const parsedBudget = Number(budget);
    const parsedQuantity = Math.max(1, parseInt(quantity, 10) || 1);
    setSubmitting(true);
    setError(null);
    try {
      const result = await nest.custom.createRequest({
        product_id: Number(productId),
        title: title.trim(),
        description: description.trim(),
        budget_cents: budget.trim() && Number.isFinite(parsedBudget) ? Math.round(parsedBudget * 100) : undefined,
        quantity: parsedQuantity,
        reference_photo_ids: photos.map((photo) => photo.id),
      });
      haptics.success();
      router.replace(`/(tabs)/(more)/custom-request/${result.id}`);
    } catch (e) {
      haptics.warning();
      setError(e instanceof ApiError ? e.friendly : "Could not send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!productId) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/(tabs)/browse")} /><EmptyState icon="alert-circle-outline" title="Product missing" message="Choose a product before starting a customization request." actionLabel="Back" onAction={() => safeBack(router, "/(tabs)/browse")} testID="new-custom-request-missing-product" /></SafeAreaView>;
  }

  if (loadingProduct) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/product/" + productId)} /><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, `/product/${productId}`)} />
      <KeyboardAwareScroll style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {product ? <ProductSummary product={product} /> : null}
          {error ? <View style={styles.errorBanner}><Ionicons name="alert-circle-outline" size={18} color={colors.error} /><Text style={styles.errorText}>{error}</Text></View> : null}

          <FieldLabel label="Title" count={`${title.length}/120`} />
          <TextInput value={title} onChangeText={(text) => setTitle(text.slice(0, 120))} maxLength={120} placeholder="What would you like made?" placeholderTextColor={colors.onSurfaceMuted} style={styles.input} testID="custom-request-title" />

          <FieldLabel label="Description" count={`${description.length}/2000`} />
          <TextInput value={description} onChangeText={(text) => setDescription(text.slice(0, 2000))} maxLength={2000} placeholder="Describe materials, colors, dimensions, or any details that matter." placeholderTextColor={colors.onSurfaceMuted} multiline style={styles.textarea} testID="custom-request-description" />

          <FieldLabel label="Budget hint (optional)" />
          <View style={styles.moneyField}><Text style={styles.currency}>$</Text><TextInput value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.onSurfaceMuted} style={styles.moneyInput} testID="custom-request-budget" /></View>

          <FieldLabel label="Quantity" />
          <TextInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" style={styles.input} testID="custom-request-quantity" />

          <FieldLabel label="Reference photos" count={`${photos.length}/3`} />
          <View style={styles.photosRow}>
            {photos.map((photo) => <PhotoThumb key={photo.id} photo={photo} onRemove={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))} />)}
            {photos.length < 3 ? <TouchableOpacity style={styles.photoAdd} onPress={() => { haptics.tap(); void addPhotos(); }} disabled={uploading} testID="custom-request-add-photo" accessibilityRole="button" accessibilityLabel="Add reference photos">{uploading ? <ActivityIndicator color={colors.brand} /> : <><Ionicons name="image-outline" size={24} color={colors.brand} /><Text style={styles.photoAddText}>Add photo</Text></>}</TouchableOpacity> : null}
          </View>
          <Text style={styles.help}>Add up to three photos to help the seller understand your idea.</Text>

          <Button title="Send request" onPress={() => { haptics.tap(); void submit(); }} disabled={!title.trim() || !description.trim() || !productId || uploading} loading={submitting} style={styles.submit} testID="custom-request-submit" />
        </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function ProductSummary({ product }: { product: NestProductRaw }) {
  return <View style={styles.productCard}><AppImage source={{ uri: product.image }} style={styles.productImage} fallbackIcon="pricetag-outline" /><View style={styles.productBody}><Text style={styles.productEyebrow}>REQUESTING CUSTOM WORK FOR</Text><Text style={styles.productName} numberOfLines={2}>{product.name}</Text></View></View>;
}

function FieldLabel({ label, count }: { label: string; count?: string }) {
  return <View style={styles.fieldLabelRow}><Text style={styles.fieldLabel}>{label}</Text>{count ? <Text style={styles.charCount}>{count}</Text> : null}</View>;
}

function PhotoThumb({ photo, onRemove }: { photo: UploadedPhoto; onRemove: () => void }) {
  return <View style={styles.photoWrap}><AppImage source={{ uri: photo.uri }} style={styles.photoThumb} fallbackIcon="image-outline" /><TouchableOpacity style={styles.removePhoto} onPress={() => { haptics.tap(); onRemove(); }} accessibilityLabel="Remove reference photo" accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="close" size={14} color={colors.onBrand} /></TouchableOpacity></View>;
}

function Top({ onBack }: { onBack: () => void }) {
  return <View style={styles.top}><TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="new-custom-request-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity><Text style={styles.topTitle}>New request</Text><View style={styles.headerActions}><AlertsBellButton /><CartHeaderButton /></View></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  topTitle: { flex: 1, marginLeft: spacing.md, color: colors.onSurface, fontSize: 18, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  content: { padding: spacing.lg, paddingBottom: spacing["3xl"] },
  productCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg, ...shadows.card },
  productImage: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  productBody: { flex: 1 },
  productEyebrow: { color: colors.onSurfaceMuted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  productName: { color: colors.onSurface, fontSize: 15, fontWeight: "800", marginTop: spacing.xs },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, padding: spacing.md, marginBottom: spacing.md },
  errorText: { flex: 1, color: colors.error, fontSize: 13, fontWeight: "700" },
  fieldLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md, marginBottom: spacing.sm },
  fieldLabel: { color: colors.onSurface, fontSize: 14, fontWeight: "800" },
  charCount: { color: colors.onSurfaceMuted, fontSize: 12 },
  input: { minHeight: 48, color: colors.onSurface, fontSize: 15, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  textarea: { minHeight: 132, color: colors.onSurface, fontSize: 15, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, textAlignVertical: "top" },
  moneyField: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingLeft: spacing.md },
  currency: { color: colors.onSurface, fontSize: 16, fontWeight: "800" },
  moneyInput: { flex: 1, minHeight: 48, color: colors.onSurface, fontSize: 15, paddingHorizontal: spacing.sm },
  photosRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  photoWrap: { width: 88, height: 88 },
  photoThumb: { width: 88, height: 88, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  removePhoto: { position: "absolute", top: spacing.xs, right: spacing.xs, width: 22, height: 22, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.error },
  photoAdd: { width: 88, height: 88, alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brand, borderStyle: "dashed", backgroundColor: colors.surfaceSecondary },
  photoAddText: { color: colors.brand, fontSize: 11, fontWeight: "800" },
  help: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
  submit: { marginTop: spacing.xl },
});
