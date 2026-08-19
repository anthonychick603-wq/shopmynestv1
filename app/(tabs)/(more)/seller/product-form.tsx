import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { nest, ApiError, type NestProductWritePayload } from "@/src/api/nest";
import { toCategory, toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Category } from "@/src/types";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AppImage } from "@/src/components/AppImage";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

type PackageSize = "small" | "medium" | "large" | "custom";

const PACKAGE_SIZES: { value: PackageSize; label: string }[] = [
  { value: "small", label: "Small — 8×6×2 in" },
  { value: "medium", label: "Medium — 12×10×6 in" },
  { value: "large", label: "Large — 16×14×10 in" },
  { value: "custom", label: "Custom dimensions" },
];

export default function ProductForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // v1.0.64 (Build #3) — server clones and returns the new draft; we then
  // navigate to the form for that new id. `router.replace` (not push) so the
  // back stack stays clean — the user came from listings, not from their
  // original listing's form.
  const onDuplicate = async () => {
    if (!id) return;
    setDuplicating(true);
    try {
      const raw = await nest.duplicateProduct(id);
      const copy = toProduct(raw);
      toast.success("Draft copy created");
      router.replace(`/seller/product-form?id=${copy.id}` as never);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not duplicate");
    } finally {
      setDuplicating(false);
    }
  };
  const [categories, setCategories] = useState<Category[]>([]);
  // Stripe Connect gate — only enforced for brand-new listings, never for edits.
  const [gateChecking, setGateChecking] = useState(!isEdit);
  const [payoutsEnabled, setPayoutsEnabled] = useState<boolean | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [sku, setSku] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  // Photo: existing remote URL (edit) and/or a freshly picked local asset to upload.
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [localImage, setLocalImage] = useState<ImagePicker.ImagePickerAsset | null>(null);

  // Shipping (persisted on both create and edit; the size preset sets real WC dims).
  const [packageSize, setPackageSize] = useState<PackageSize>("custom");
  const [weightOz, setWeightOz] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [widthIn, setWidthIn] = useState("");
  const [heightIn, setHeightIn] = useState("");

  const catIdBySlug = useMemo(() => {
    const map: Record<string, number> = {};
    categories.forEach((c) => { map[c.slug] = Number(c.id); });
    return map;
  }, [categories]);

  // v1.0.95 — cancel guard: quickly navigating away from the edit form
  // used to fire setState after unmount when the product/shipping fetches
  // resolved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cs = await nest.getCategories().catch(() => []);
        if (cancelled) return;
        setCategories(cs.map(toCategory));
        if (isEdit && id) {
          const p = await nest.getProduct(id);
          if (cancelled) return;
          setTitle(p.name ? decode(p.name) : "");
          setDescription(p.description || p.short_description || "");
          setPrice(p.price != null ? String(p.price) : "");
          setStock(p.stock_quantity != null ? String(p.stock_quantity) : "");
          setImageUrl(p.image || null);
          setSelectedCats((p.categories || []).map((c) => c.slug));
          // Pre-fill the size selector + dimensions from stored shipping meta so an
          // edit reflects (and re-sends) the product's real package size.
          const ship = await nest.getProductShipping(id).then((r) => r.shipping).catch(() => null);
          if (cancelled) return;
          if (ship) {
            setPackageSize(ship.package_size);
            if (ship.weight_oz) setWeightOz(ship.weight_oz);
            if (ship.length_in) setLengthIn(ship.length_in);
            if (ship.width_in) setWidthIn(ship.width_in);
            if (ship.height_in) setHeightIn(ship.height_in);
          }
        }
      } catch (e) {
        if (cancelled) return;
        // Without this the rejection was unhandled and the user was left on an
        // "Edit listing" form with every field blank.
        toast.error(e instanceof ApiError ? e.friendly : "Could not load this listing.");
        safeBack(router, "/(tabs)/seller/dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable
  }, [id, isEdit]);

  // New listings require a connected Stripe payout account. Check on mount so we
  // can block the form up front (edits are exempt). A failed check leaves the
  // gate unknown and defers to the re-check inside submit().
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await nest.getStripeConnectStatus();
        if (cancelled) return;
        setPayoutsEnabled(s.payouts_enabled);
      } catch {
        if (cancelled) return;
        setPayoutsEnabled(null);
      } finally {
        if (!cancelled) setGateChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit]);

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return toast.error("Photo permission is needed to add product images.");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setLocalImage(result.assets[0]);
        setImageUrl(result.assets[0].uri);
      }
    } catch {
      toast.error("Could not open your photo library. Please try again.");
    }
  };

  const toggleCat = (slug: string) =>
    setSelectedCats((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  const uploadIfNeeded = async (): Promise<number | undefined> => {
    if (!localImage) return undefined;
    const uri = localImage.uri;
    const name = localImage.fileName || uri.split("/").pop() || `photo-${Date.now()}.jpg`;
    const type = localImage.mimeType || "image/jpeg";
    const form = new FormData();
    // React Native FormData file part.
    form.append("file", { uri, name, type } as unknown as Blob);
    const media = await nest.uploadMedia(form);
    return media.id;
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Product name is required.");
    if (price === "" || Number(price) < 0 || Number.isNaN(Number(price))) {
      return toast.error("Enter a valid price.");
    }
    // Authoritative gate for new listings: re-verify payouts are enabled before
    // creating. Editing an existing listing is never gated.
    if (!isEdit) {
      try {
        const s = await nest.getStripeConnectStatus();
        setPayoutsEnabled(s.payouts_enabled);
        if (!s.payouts_enabled) {
          toast.error("Connect your bank account with Stripe before publishing a new listing.");
          return;
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? e.friendly : "Could not verify your payout account. Please try again.");
        return;
      }
    }
    setBusy(true);
    try {
      const image_id = await uploadIfNeeded();
      const category_ids = selectedCats.map((slug) => catIdBySlug[slug]).filter((n) => Number.isFinite(n));

      const payload: NestProductWritePayload = {
        name: title.trim(),
        description,
        price: Number(price),
        stock: stock === "" ? 0 : Math.max(0, parseInt(stock, 10) || 0),
        category_ids,
      };
      if (sku.trim()) payload.sku = sku.trim();
      if (image_id) payload.image_id = image_id;

      // Shipping persists on both create and edit. A preset (small/medium/large)
      // sets the real WC dimensions server-side; only "custom" sends L/W/H.
      payload.package_size = packageSize;
      if (weightOz.trim()) payload.weight_oz = Number(weightOz);
      if (packageSize === "custom") {
        if (lengthIn.trim()) payload.length_in = Number(lengthIn);
        if (widthIn.trim()) payload.width_in = Number(widthIn);
        if (heightIn.trim()) payload.height_in = Number(heightIn);
      }

      if (isEdit && id) {
        await nest.updateProduct(id, payload);
        haptics.success();
        toast.success("Listing updated");
      } else {
        await nest.createProduct(payload);
        haptics.success();
        toast.success("Listing created");
      }
      safeBack(router, "/(tabs)/seller/dashboard");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not save the listing.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || gateChecking) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title={isEdit ? "Edit listing" : "New listing"} />
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!isEdit && payoutsEnabled === false) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title="New listing" />
        <EmptyState
          icon="business-outline"
          title="Connect your bank account first"
          message="Before you can publish a new listing, connect a bank account with Stripe so you can get paid."
          actionLabel="Connect with Stripe"
          onAction={() => router.push("/seller/connect")}
          testID="pf-connect-required"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top
        onBack={() => safeBack(router, "/(tabs)/seller/dashboard")}
        title={isEdit ? "Edit listing" : "New listing"}
        // v1.0.66 hotfix (Build #3) - duplicate is a header action too now.
        // Sellers weren't scrolling past Save to find the button at the
        // bottom, so the copy affordance is right next to the title.
        onDuplicate={isEdit ? onDuplicate : undefined}
        duplicating={duplicating}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.photo} onPress={() => { haptics.tap(); pickImage(); }} testID="pf-photo" accessibilityRole="button" accessibilityLabel="Pick product photo">
            {imageUrl ? (
              <AppImage source={{ uri: imageUrl }} style={styles.photoImg} fallbackIcon="image-outline" />
            ) : (
              <View style={styles.photoEmpty}>
                <Ionicons name="camera-outline" size={28} color={colors.onSurfaceMuted} />
                <Text style={styles.photoText}>Add a product photo</Text>
              </View>
            )}
          </TouchableOpacity>

          <Input label="Product name" value={title} onChangeText={setTitle} testID="pf-name" />
          <Input label="Description" value={description} onChangeText={setDescription} multiline style={{ height: 110, textAlignVertical: "top" }} testID="pf-desc" />
          <Input label="Price (USD)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" testID="pf-price" />
          <Input label="Stock quantity" value={stock} onChangeText={setStock} keyboardType="number-pad" testID="pf-stock" />
          <Input label="SKU (optional)" value={sku} onChangeText={setSku} autoCapitalize="characters" testID="pf-sku" />

          <Text style={styles.label}>Categories</Text>
          <View style={styles.chips}>
            {categories.map((c) => {
              const on = selectedCats.includes(c.slug);
              return (
                <TouchableOpacity key={c.id} onPress={() => { haptics.tap(); toggleCat(c.slug); }} style={[styles.chip, on && styles.chipOn]} testID={`pf-cat-${c.slug}`} accessibilityRole="button" accessibilityLabel={`${on ? "Remove" : "Add"} category ${c.name}`}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {isEdit ? null : (
            <>
              <Text style={styles.label}>Shipping package</Text>
              <View style={styles.sizeRow}>
                {PACKAGE_SIZES.map((s) => {
                  const on = packageSize === s.value;
                  return (
                    <TouchableOpacity key={s.value} onPress={() => { haptics.tap(); setPackageSize(s.value); }} style={[styles.sizeOpt, on && styles.sizeOptOn]} testID={`pf-size-${s.value}`} accessibilityRole="button" accessibilityLabel={`Package size ${s.label}`}>
                      <Text style={[styles.sizeText, on && styles.sizeTextOn]}>{s.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Input label="Weight (oz)" value={weightOz} onChangeText={setWeightOz} keyboardType="decimal-pad" testID="pf-weight" />
              {packageSize === "custom" ? (
                <View style={styles.dims}>
                  <View style={styles.dimCol}><Input label="Length (in)" value={lengthIn} onChangeText={setLengthIn} keyboardType="decimal-pad" testID="pf-length" /></View>
                  <View style={styles.dimCol}><Input label="Width (in)" value={widthIn} onChangeText={setWidthIn} keyboardType="decimal-pad" testID="pf-width" /></View>
                  <View style={styles.dimCol}><Input label="Height (in)" value={heightIn} onChangeText={setHeightIn} keyboardType="decimal-pad" testID="pf-height" /></View>
                </View>
              ) : null}
            </>
          )}

          <Button title={isEdit ? "Save changes" : "Create listing"} onPress={() => { haptics.press(); submit(); }} loading={busy} testID="pf-submit" style={{ marginTop: spacing.md }} />

          {/* v1.0.92 (Build #8) — open the variations editor for saved listings. */}
          {isEdit && id ? (
            <TouchableOpacity
              onPress={() => { haptics.tap(); router.push({ pathname: "/seller/product-variations", params: { id: String(id) } } as never); }}
              style={styles.duplicateBtn}
              testID="pf-variations"
              accessibilityRole="button"
              accessibilityLabel="Manage variations"
            >
              <Ionicons name="options-outline" size={18} color={colors.brand} />
              <Text style={styles.duplicateBtnText}>Manage variations</Text>
            </TouchableOpacity>
          ) : null}

          {/* v1.0.64 (Build #3) — duplicate button. Only shown when editing an
              existing listing; creates a draft copy on the server and pushes
              the form for the new draft. */}
          {isEdit ? (
            <TouchableOpacity
              onPress={() => { haptics.tap(); onDuplicate?.(); }}
              disabled={duplicating || busy}
              style={styles.duplicateBtn}
              testID="pf-duplicate"
              accessibilityRole="button"
              accessibilityLabel="Duplicate this listing"
            >
              {duplicating ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Ionicons name="copy-outline" size={18} color={colors.brand} />
              )}
              <Text style={styles.duplicateBtnText}>Duplicate this listing</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Minimal entity decode to match adapters' decodeEntities without importing UI helpers here.
function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function Top({ onBack, title, onDuplicate, duplicating }: { onBack: () => void; title: string; onDuplicate?: () => void; duplicating?: boolean }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        {onDuplicate ? (
          <TouchableOpacity
            onPress={() => { haptics.tap(); onDuplicate?.(); }}
            disabled={!!duplicating}
            style={styles.topBtn}
            testID="pf-duplicate-header"
            accessibilityRole="button"
            accessibilityLabel="Duplicate this listing"
          >
            {duplicating ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Ionicons name="copy-outline" size={20} color={colors.brand} />
            )}
          </TouchableOpacity>
        ) : null}
        <CartHeaderButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  photo: { height: 180, borderRadius: radius.lg, backgroundColor: colors.surfaceTertiary, overflow: "hidden", marginBottom: spacing.lg, alignItems: "center", justifyContent: "center" },
  photoImg: { width: "100%", height: "100%" },
  photoEmpty: { alignItems: "center", gap: spacing.sm },
  photoText: { color: colors.onSurfaceMuted, fontWeight: "700" },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: colors.onBrand },
  sizeRow: { gap: spacing.sm, marginBottom: spacing.md },
  sizeOpt: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  sizeOptOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  sizeText: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  sizeTextOn: { color: colors.onBrand },
  dims: { flexDirection: "row", gap: spacing.sm },
  dimCol: { flex: 1 },
  duplicateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  duplicateBtnText: { color: colors.brand, fontWeight: "800", fontSize: 15 },
});
