import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { nest, ApiError, type NestProductWritePayload, type NestSellerShippingProfile } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { CategorySubcategoryPicker } from "@/src/components/CategorySubcategoryPicker";
import { toast } from "@/src/components/Toast";
import { appendFilePart } from "@/src/utils/upload";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { AppImage } from "@/src/components/AppImage";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import {
  categoryIdsForSelection,
  isCategorySelectionComplete,
  selectionFromProductSlugs,
  toHierarchicalCategory,
  type HierarchicalCategory,
} from "@/src/utils/categories";

type PackageSize = "small" | "medium" | "large" | "custom";

const PACKAGE_SIZES: { value: PackageSize; label: string }[] = [
  { value: "small", label: "Small — 8×6×2 in" },
  { value: "medium", label: "Medium — 12×10×6 in" },
  { value: "large", label: "Large — 16×14×10 in" },
  { value: "custom", label: "Custom dimensions" },
];

// v1.0.127 — Mirror of the server's mnu_ship_from_required_fields() in
// class-mnu-ship-from-guard.php. When any of these is empty on the
// seller's profile, the readiness endpoint marks the ship_from_complete
// step incomplete and the platform's label buy fails on the first order.
// Keep this list in lock-step with the plugin.
const SHIP_FROM_REQUIRED: Array<keyof NestSellerShippingProfile> = [
  "ship_from_name",
  "ship_from_street1",
  "ship_from_city",
  "ship_from_state",
  "ship_from_zip",
  "ship_from_country",
];

function isShipFromComplete(profile: NestSellerShippingProfile | null | undefined): boolean {
  if (!profile) return false;
  for (const key of SHIP_FROM_REQUIRED) {
    const v = String((profile as Record<string, unknown>)[key] ?? "").trim();
    if (v === "") return false;
  }
  return true;
}

export default function ProductForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // v1.0.164 — Track whether the loaded listing is currently a draft so
  // the primary button reads "Publish" for drafts vs "Save changes" for
  // live listings. Defaults to false; hydrated below in the load effect.
  const [existingIsDraft, setExistingIsDraft] = useState(false);

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
  const [categories, setCategories] = useState<HierarchicalCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string | null>(null);
  const [existingCategoryIds, setExistingCategoryIds] = useState<number[]>([]);
  // v1.0.124 — Payout account gate. Only enforced for brand-new listings,
  // never for edits. Under the v3.8.0 money model the seller just needs to
  // have a bank account saved (routing + account number) so ACH payouts can
  // run. The plugin's server-side gate is `MNU_Bank_Account::has_bank_account`.
  // v1.0.124 — Shippo per-seller gate removed. Platform Shippo token covers
  // every seller by default, so we don't check `getShippoStatus` on mount.
  // v1.0.127 — Ship-from address gate added. If the seller has no
  // ship-from address on file (or is missing any of the six fields the
  // server treats as required), the first order's label buy would fail.
  // Server-side validators live in class-mnu-ship-from-guard.php
  // (mnu_ship_from_required_fields() lists them); we mirror the same six
  // fields client-side so the gate matches.
  const [gateChecking, setGateChecking] = useState(!isEdit);
  const [hasBank, setHasBank] = useState<boolean | null>(null);
  const [hasShipFrom, setHasShipFrom] = useState<boolean | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [sku, setSku] = useState("");
  const [customizable, setCustomizable] = useState(false);

  // v1.0.204 — multi-photo gallery + optional single video.
  //
  // A "slot" is either an existing remote asset (edit) or a freshly picked
  // local asset queued for upload. The FIRST photo slot is the primary
  // product photo (WooCommerce `image_id`); slots 2..N become the gallery
  // (`gallery_image_ids`). Photos are capped at MAX_PHOTOS to match the
  // server's cap of 1 primary + 7 gallery = 8 total.
  //
  // Videos are a separate single slot. On the wire we send `video_id` and
  // the server stores it as post meta; sending video_id=0 or null clears
  // the previously saved video.
  const MAX_PHOTOS = 8;
  type PhotoSlot =
    | { kind: "remote"; id?: number; url: string }
    | { kind: "local"; asset: ImagePicker.ImagePickerAsset };
  type VideoSlot =
    | { kind: "remote"; url: string }
    | { kind: "local"; asset: ImagePicker.ImagePickerAsset };
  const [photos, setPhotos] = useState<PhotoSlot[]>([]);
  const [video, setVideo] = useState<VideoSlot | null>(null);
  // Tracks whether the seller has explicitly removed the pre-existing video
  // (or gallery) on this edit so submit() sends the right clear signal.
  const [videoCleared, setVideoCleared] = useState(false);
  const [galleryDirty, setGalleryDirty] = useState(false);

  // Shipping (persisted on both create and edit; the size preset sets real WC dims).
  const [packageSize, setPackageSize] = useState<PackageSize>("custom");
  const [weightOz, setWeightOz] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [widthIn, setWidthIn] = useState("");
  const [heightIn, setHeightIn] = useState("");

  // v1.0.95 — cancel guard: quickly navigating away from the edit form
  // used to fire setState after unmount when the product/shipping fetches
  // resolved.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cs = await nest.getCategories().catch(() => []);
        if (cancelled) return;
        const mappedCategories = cs.map(toHierarchicalCategory);
        setCategories(mappedCategories);
        if (isEdit && id) {
          const p = await nest.getProduct(id);
          if (cancelled) return;
          setTitle(p.name ? decode(p.name) : "");
          setDescription(p.description || p.short_description || "");
          setPrice(p.price != null ? String(p.price) : "");
          setStock(p.stock_quantity != null ? String(p.stock_quantity) : "");
          // v1.0.204 — hydrate the multi-photo grid from primary + gallery.
          // Plugin v3.13.63+ also returns numeric attachment ids so the
          // edit form can preserve a seller's existing photos across saves
          // without re-uploading anything.
          const initialPhotos: PhotoSlot[] = [];
          if (p.image) {
            initialPhotos.push({
              kind: "remote",
              url: p.image,
              id: typeof p.image_id === "number" && p.image_id > 0 ? p.image_id : undefined,
            });
          }
          const galleryUrls = p.gallery ?? [];
          const galleryIds = p.gallery_image_ids ?? [];
          for (let i = 0; i < galleryUrls.length; i += 1) {
            const url = galleryUrls[i];
            if (!url) continue;
            const rid = galleryIds[i];
            initialPhotos.push({
              kind: "remote",
              url,
              id: typeof rid === "number" && rid > 0 ? rid : undefined,
            });
          }
          setPhotos(initialPhotos.slice(0, MAX_PHOTOS));
          if (typeof p.video_url === "string" && p.video_url !== "") {
            setVideo({ kind: "remote", url: p.video_url });
          } else {
            setVideo(null);
          }
          setCustomizable(p.customizable === true);
          setExistingCategoryIds((p.categories || []).map((category) => Number(category.id)).filter(Number.isFinite));
          const categorySelection = selectionFromProductSlugs(
            mappedCategories,
            (p.categories || []).map((category) => category.slug),
          );
          setSelectedCategoryId(categorySelection.categoryId);
          setSelectedSubcategoryId(categorySelection.subcategoryId);
          // v1.0.164 — remember draft state so we can label the primary CTA
          // "Publish" (for drafts) vs "Save changes" (for live listings).
          setExistingIsDraft(p.status === "draft" || p.status === "pending" || p.status === "private");
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

  // v1.0.124 — New listings require a saved bank account. Check on mount so
  // we can block the form up front (edits are exempt). A failed check leaves
  // the gate unknown and defers to the re-check inside submit().
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    (async () => {
      // v1.0.127 — Run both readiness checks in parallel so a slow one
      // doesn't gate the other. Each failure independently sets its
      // corresponding gate to `null` so submit() re-verifies on tap.
      const [bankRes, shipRes] = await Promise.allSettled([
        nest.getSellerBank(),
        nest.getSellerShippingProfile(),
      ]);
      if (cancelled) return;
      if (bankRes.status === "fulfilled") {
        setHasBank(!!bankRes.value.has_bank);
      } else {
        setHasBank(null);
      }
      if (shipRes.status === "fulfilled") {
        setHasShipFrom(isShipFromComplete(shipRes.value.profile));
      } else {
        setHasShipFrom(null);
      }
      setGateChecking(false);
    })();
    return () => { cancelled = true; };
  }, [isEdit]);

  // v1.0.204 — multi-photo picker. Enforces MAX_PHOTOS by picking up to the
  // remaining slot count; the OS picker on iOS/Android surfaces multi-select
  // when `allowsMultipleSelection` is on.
  const pickPhotos = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return toast.error("Photo permission is needed to add product images.");
      }
      const remaining = MAX_PHOTOS - photos.length;
      if (remaining <= 0) {
        return toast.error(`You can attach up to ${MAX_PHOTOS} photos per listing.`);
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: remaining > 1,
        selectionLimit: remaining,
      });
      if (result.canceled || !result.assets?.length) return;
      const additions: PhotoSlot[] = result.assets
        .slice(0, remaining)
        .map((asset) => ({ kind: "local" as const, asset }));
      setPhotos((prev) => [...prev, ...additions].slice(0, MAX_PHOTOS));
      setGalleryDirty(true);
    } catch {
      toast.error("Could not open your photo library. Please try again.");
    }
  };

  const removePhotoAt = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setGalleryDirty(true);
  };

  const makePrimaryPhoto = (index: number) => {
    if (index === 0) return;
    setPhotos((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      const [pick] = next.splice(index, 1);
      next.unshift(pick);
      return next;
    });
    setGalleryDirty(true);
  };

  const pickVideo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return toast.error("Photo permission is needed to add a product video.");
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        quality: 0.8,
        videoMaxDuration: 60,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      // Guard: mimeType may be missing on some Android picks; accept if the
      // asset says it's a video OR the filename looks like one.
      const mime = (asset.mimeType || "").toLowerCase();
      const looksVideo =
        mime.startsWith("video/") ||
        /\.(mp4|mov|m4v|webm|3gp)$/i.test(asset.fileName || asset.uri || "");
      if (!looksVideo) {
        return toast.error("Choose a video file (MP4, MOV, or WEBM).");
      }
      setVideo({ kind: "local", asset });
      setVideoCleared(false);
    } catch {
      toast.error("Could not open your photo library. Please try again.");
    }
  };

  const removeVideo = () => {
    setVideo(null);
    setVideoCleared(true);
  };

  // v1.0.204 — upload every locally picked photo + the video (if any),
  // then return the resolved attachment ids in slot order. Remote slots
  // that carry an id from the server are preserved in place so a seller
  // who only reorders their photos never re-uploads anything.
  type UploadResult = {
    photoIds: (number | null)[]; // null = remote slot with no known id (skipped in payload)
    videoId: number | null | undefined; // undefined = no change; null = clear
  };
  const uploadAssets = async (): Promise<UploadResult> => {
    const photoIds = await Promise.all(
      photos.map(async (slot) => {
        if (slot.kind === "remote") {
          return typeof slot.id === "number" && slot.id > 0 ? slot.id : null;
        }
        const asset = slot.asset;
        const uri = asset.uri;
        const name = asset.fileName || uri.split("/").pop() || `photo-${Date.now()}.jpg`;
        const type = asset.mimeType || "image/jpeg";
        const form = new FormData();
        appendFilePart(form, "file", { uri, name, type });
        const media = await nest.uploadMedia(form);
        return media.id;
      })
    );

    let videoId: number | null | undefined = undefined;
    if (video && video.kind === "local") {
      const asset = video.asset;
      const uri = asset.uri;
      const name = asset.fileName || uri.split("/").pop() || `video-${Date.now()}.mp4`;
      const type = asset.mimeType || "video/mp4";
      const form = new FormData();
      appendFilePart(form, "file", { uri, name, type });
      const media = await nest.uploadMedia(form);
      videoId = media.id;
    } else if (videoCleared && !video) {
      videoId = null;
    }

    return { photoIds, videoId };
  };

  // v1.0.164 — One submit function, two modes. `mode='publish'` behaves
  // exactly like the old submit did (with the bank + ship-from gates on
  // new listings). `mode='draft'` skips those publish-time gates, sends
  // status='draft' so the plugin saves without a price or photo, and
  // only requires a product name so the draft has something searchable.
  type SaveMode = "publish" | "draft";
  const submit = async (mode: SaveMode = "publish") => {
    if (!title.trim()) return toast.error("Product name is required.");
    if (mode === "publish") {
      if (price === "" || Number(price) < 0 || Number.isNaN(Number(price))) {
        return toast.error("Enter a valid price.");
      }
      if (categories.length === 0) {
        if (!isEdit || existingCategoryIds.length === 0) {
          return toast.error("Could not load product categories. Please try again.");
        }
      } else if (!isCategorySelectionComplete(categories, selectedCategoryId, selectedSubcategoryId)) {
        return toast.error("Choose a product category and sub-category before publishing.");
      }
      // v1.0.124 — Authoritative gate for new-and-publishing listings:
      // re-verify a bank account is on file. Drafts skip this (the plugin
      // re-checks when the seller publishes the draft later).
      if (!isEdit) {
        try {
          const bank = await nest.getSellerBank();
          setHasBank(!!bank.has_bank);
          if (!bank.has_bank) {
            toast.error("Add a bank account before you publish a new listing.");
            return;
          }
        } catch (e) {
          toast.error(e instanceof ApiError ? e.friendly : "Could not verify your payout account. Please try again.");
          return;
        }
        // v1.0.127 — Authoritative ship-from gate; drafts skip.
        try {
          const ship = await nest.getSellerShippingProfile();
          const ok = isShipFromComplete(ship.profile);
          setHasShipFrom(ok);
          if (!ok) {
            toast.error("Add your ship-from address before you publish a new listing.");
            return;
          }
        } catch (e) {
          toast.error(e instanceof ApiError ? e.friendly : "Could not verify your ship-from address. Please try again.");
          return;
        }
      }
    }
    if (mode === "draft") setSavingDraft(true); else setBusy(true);
    try {
      // v1.0.204 — upload every locally picked photo + video, then map the
      // resulting attachment ids into image_id (first slot) + gallery_image_ids
      // (rest) + video_id.
      const { photoIds, videoId } = await uploadAssets();
      const resolvedPhotoIds = photoIds.filter((n): n is number => typeof n === "number" && n > 0);
      const primaryPhotoId = resolvedPhotoIds[0];
      const galleryPhotoIds = resolvedPhotoIds.slice(1);

      let category_ids = categoryIdsForSelection(categories, selectedCategoryId, selectedSubcategoryId);
      // If an existing listing is edited while the taxonomy endpoint is
      // temporarily unavailable, preserve its current category assignments
      // instead of accidentally clearing them on save.
      if (category_ids.length === 0 && isEdit && existingCategoryIds.length > 0) {
        category_ids = existingCategoryIds;
      }

      const payload: NestProductWritePayload & { customizable: boolean } = {
        name: title.trim(),
        description,
        // Drafts allow blank price — send 0 so WC has a numeric value; the
        // seller fills it in before publishing.
        price: price === "" || Number.isNaN(Number(price)) ? 0 : Number(price),
        stock: stock === "" ? 0 : Math.max(0, parseInt(stock, 10) || 0),
        category_ids,
        customizable,
      };
      if (sku.trim()) payload.sku = sku.trim();
      if (primaryPhotoId) payload.image_id = primaryPhotoId;
      // Send gallery_image_ids whenever the gallery changed OR we uploaded
      // any new photo. Sending an empty array clears the gallery on the
      // server, which is what a seller expects after removing every extra.
      if (galleryDirty || galleryPhotoIds.length > 0) {
        payload.gallery_image_ids = galleryPhotoIds;
      }
      // Video: `undefined` means no change; `null` clears; a number sets it.
      if (videoId !== undefined) {
        payload.video_id = videoId;
      }

      // Shipping persists on both create and edit. A preset (small/medium/large)
      // sets the real WC dimensions server-side; only "custom" sends L/W/H.
      payload.package_size = packageSize;
      if (weightOz.trim()) payload.weight_oz = Number(weightOz);
      if (packageSize === "custom") {
        if (lengthIn.trim()) payload.length_in = Number(lengthIn);
        if (widthIn.trim()) payload.width_in = Number(widthIn);
        if (heightIn.trim()) payload.height_in = Number(heightIn);
      }

      // v1.0.164 — On explicit publish of an existing draft, tell the server
      // to flip status. On "Save changes" for a live listing, omit status so
      // the server keeps it live. On "Save as draft", always send draft.
      if (mode === "draft") {
        payload.status = "draft";
      } else if (isEdit && existingIsDraft) {
        payload.status = "publish";
      }

      if (isEdit && id) {
        await nest.updateProduct(id, payload);
        haptics.success();
        toast.success(mode === "draft" ? "Draft saved" : existingIsDraft ? "Listing published" : "Listing updated");
      } else {
        await nest.createProduct(payload);
        haptics.success();
        toast.success(mode === "draft" ? "Draft saved" : "Listing created");
      }
      safeBack(router, "/(tabs)/seller/dashboard");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : mode === "draft" ? "Could not save draft." : "Could not save the listing.");
    } finally {
      if (mode === "draft") setSavingDraft(false); else setBusy(false);
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

  if (!isEdit && hasBank === false) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title="New listing" />
        <EmptyState
          icon="business-outline"
          title="Add a payout account first"
          message="Before you can publish a new listing, save your bank routing and account numbers. Earnings become available after the 7-day hold, then you can request an ACH payout."
          actionLabel="Add bank account"
          onAction={() => router.push("/seller/bank")}
          testID="pf-connect-required"
        />
      </SafeAreaView>
    );
  }

  // v1.0.127 — Ship-from address gate. Only shown for new listings
  // (edits pass through). This block deliberately runs AFTER the bank
  // gate above so a brand-new seller is walked through onboarding in
  // the same order as the readiness checklist: bank first, then
  // ship-from address, then list.
  if (!isEdit && hasBank === true && hasShipFrom === false) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} title="New listing" />
        <EmptyState
          icon="location-outline"
          title="Add your ship-from address first"
          message="We use this address as the origin on every shipping label ShopMyNest buys for your orders. Fill it in once and every new listing can go live."
          actionLabel="Add ship-from address"
          onAction={() => router.push("/seller/shippo")}
          testID="pf-ship-from-required"
        />
      </SafeAreaView>
    );
  }

  // v1.0.124 — Shippo per-seller gate removed (platform Shippo token covers
  // every seller by default).

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
      <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {/* v1.0.204 — multi-photo grid + optional single video. Tap the
              [+] tile to add photos (multi-select on iOS/Android). Tap a
              non-primary photo to promote it to primary; tap the trash
              icon to remove. Video is a separate tile below with its own
              picker + preview + remove control. */}
          <Text style={styles.label}>Photos</Text>
          <Text style={styles.photoHint}>The first photo is the cover. Tap any other photo to make it the cover. You can add up to {MAX_PHOTOS} photos.</Text>
          <View style={styles.photoGrid}>
            {photos.map((slot, i) => {
              const uri = slot.kind === "remote" ? slot.url : slot.asset.uri;
              const isPrimary = i === 0;
              return (
                <View key={`${uri}-${i}`} style={styles.photoTile}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { haptics.tap(); makePrimaryPhoto(i); }}
                    disabled={isPrimary}
                    style={styles.photoTileTouch}
                    testID={`pf-photo-tile-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={isPrimary ? "Cover photo" : "Make this the cover photo"}
                  >
                    <AppImage source={{ uri }} style={styles.photoTileImg} fallbackIcon="image-outline" />
                    {isPrimary ? (
                      <View style={styles.photoPrimaryBadge}>
                        <Text style={styles.photoPrimaryBadgeText}>Cover</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { haptics.tap(); removePhotoAt(i); }}
                    style={styles.photoRemoveBtn}
                    testID={`pf-photo-remove-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="close" size={14} color={colors.onBrand} />
                  </TouchableOpacity>
                </View>
              );
            })}
            {photos.length < MAX_PHOTOS ? (
              <TouchableOpacity
                onPress={() => { haptics.tap(); pickPhotos(); }}
                style={[styles.photoTile, styles.photoAddTile]}
                testID="pf-photo-add"
                accessibilityRole="button"
                accessibilityLabel="Add product photos"
              >
                <Ionicons name="add" size={28} color={colors.brand} />
                <Text style={styles.photoAddText}>Add photos</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.label}>Video (optional)</Text>
          <Text style={styles.photoHint}>One short clip up to 60 seconds. MP4, MOV, or WEBM. Buyers see it on the listing.</Text>
          {video ? (
            <View style={styles.videoTile}>
              <View style={styles.videoThumbWrap}>
                <Ionicons name="play-circle" size={40} color={colors.onBrand} />
                <Text style={styles.videoThumbText} numberOfLines={1}>
                  {video.kind === "local" ? (video.asset.fileName || "New video") : "Uploaded video"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { haptics.tap(); removeVideo(); }}
                style={styles.videoRemoveBtn}
                testID="pf-video-remove"
                accessibilityRole="button"
                accessibilityLabel="Remove video"
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={styles.videoRemoveText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => { haptics.tap(); pickVideo(); }}
              style={styles.videoAddTile}
              testID="pf-video-add"
              accessibilityRole="button"
              accessibilityLabel="Add a product video"
            >
              <Ionicons name="videocam-outline" size={22} color={colors.brand} />
              <Text style={styles.videoAddText}>Add a product video</Text>
            </TouchableOpacity>
          )}

          <Input label="Product name" value={title} onChangeText={setTitle} testID="pf-name" />
          <Input label="Description" value={description} onChangeText={setDescription} multiline style={{ height: 110, textAlignVertical: "top" }} testID="pf-desc" />
          <Input label="Price (USD)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" testID="pf-price" />
          <Input label="Stock quantity" value={stock} onChangeText={setStock} keyboardType="number-pad" testID="pf-stock" />
          <Input label="SKU (optional)" value={sku} onChangeText={setSku} autoCapitalize="characters" testID="pf-sku" />
          <View style={styles.customizableRow}>
            <View style={styles.customizableCopy}>
              <Text style={styles.customizableTitle}>Customizable</Text>
              <Text style={styles.customizableSubtitle}>Accept custom-work requests from buyers on this listing.</Text>
            </View>
            <Switch
              value={customizable}
              onValueChange={(value) => { haptics.tap(); setCustomizable(value); }}
              trackColor={{ true: colors.brand, false: colors.border }}
              testID="pf-customizable"
            />
          </View>

          <Text style={styles.label}>Product category</Text>
          <Text style={styles.categoryHint}>Choose the major category first, then choose the sub-category underneath it.</Text>
          <CategorySubcategoryPicker
            categories={categories}
            categoryId={selectedCategoryId}
            subcategoryId={selectedSubcategoryId}
            onChange={(categoryId, subcategoryId) => {
              haptics.tap();
              setSelectedCategoryId(categoryId);
              setSelectedSubcategoryId(subcategoryId);
            }}
            testIDPrefix="pf-category"
          />

          {/* v1.0.156 — shipping fields now render on BOTH create and edit.
              Previously wrapped in {isEdit ? null : (...)} which meant a
              seller who saved a draft with missing weight/dims had no way
              to fix it in-app; they had to go to WooCommerce. The form
              already pre-fills from getProductShipping(id) and submit
              already sends package_size / weight_oz / L·W·H. */}
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

          {/* v1.0.164 — Primary button label depends on state:
              • New listing → "Publish"
              • Existing draft being edited → "Publish" (server flips status)
              • Existing live listing → "Save changes" (status omitted)
              Secondary "Save as draft" is offered when the listing hasn't
              been published yet (new, or existing draft). Once a listing is
              live, going back to draft is a WooCommerce admin action —
              sellers unlist instead by setting stock to 0. */}
          <Button
            title={isEdit ? (existingIsDraft ? "Publish" : "Save changes") : "Publish"}
            onPress={() => { haptics.press(); submit("publish"); }}
            loading={busy}
            disabled={savingDraft}
            testID="pf-submit"
            style={{ marginTop: spacing.md }}
          />
          {(!isEdit || existingIsDraft) ? (
            <Button
              title="Save as draft"
              variant="secondary"
              onPress={() => { haptics.tap(); submit("draft"); }}
              loading={savingDraft}
              disabled={busy}
              testID="pf-save-draft"
              style={{ marginTop: spacing.sm }}
            />
          ) : null}

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
        </KeyboardAwareScroll>
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
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
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
           hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {duplicating ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Ionicons name="copy-outline" size={20} color={colors.brand} />
            )}
          </TouchableOpacity>
        ) : null}
        <AlertsBellButton />
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
  // v1.0.204 — multi-photo grid + video tiles.
  photoHint: { color: colors.onSurfaceMuted, fontSize: 12, marginBottom: spacing.sm },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  photoTile: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, overflow: "hidden", position: "relative" },
  photoTileTouch: { width: "100%", height: "100%" },
  photoTileImg: { width: "100%", height: "100%" },
  photoAddTile: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.surfaceSecondary, gap: 2 },
  photoAddText: { color: colors.brand, fontSize: 11, fontWeight: "700" },
  photoRemoveBtn: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  photoPrimaryBadge: { position: "absolute", left: 4, bottom: 4, backgroundColor: colors.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  photoPrimaryBadgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  videoAddTile: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, height: 60, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.lg },
  videoAddText: { color: colors.brand, fontWeight: "700" },
  videoTile: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, marginBottom: spacing.lg },
  videoThumbWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  videoThumbText: { flex: 1, color: colors.onSurface, fontWeight: "600" },
  videoRemoveBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.surface },
  videoRemoveText: { color: colors.error, fontWeight: "700", fontSize: 12 },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.sm },
  categoryHint: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.xs },
  sizeRow: { gap: spacing.sm, marginBottom: spacing.md },
  sizeOpt: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  sizeOptOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  sizeText: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  sizeTextOn: { color: colors.onBrand },
  dims: { flexDirection: "row", gap: spacing.sm },
  dimCol: { flex: 1 },
  customizableRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  customizableCopy: { flex: 1 },
  customizableTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  customizableSubtitle: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17, marginTop: spacing.xs },
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
