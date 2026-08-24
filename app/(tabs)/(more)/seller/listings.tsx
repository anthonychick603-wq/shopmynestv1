import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { AppImage } from "@/src/components/AppImage";
import { toast } from "@/src/components/Toast";
import { decodeEntities } from "@/src/utils/html";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

const PER_PAGE = 50;

// v1.0.145 — filter chip modes for the listings screen. Mirrors the
// Sold/Bought segmented control on the orders screen so the pattern is
// consistent for sellers. The dashboard's "Out of stock (N)" link deep-links
// into this screen with `?filter=oos` so tapping the red count opens the
// filtered view directly.
// v1.0.146 — added Drafts tab. The plugin's ship-from guard reverts newly
// created listings to draft when the seller's ship-from address or the
// product's package details are incomplete. Before v1.0.146 those listings
// looked identical to published ones because the adapter hardcoded status
// to "published"; now drafts are honored and visible in their own tab.
// v1.0.148 — drop the "All" tab. In stock + Out of stock + Drafts already
// partition the listing set (a product is either published-in-stock,
// published-out-of-stock, or a draft), so "All" was just a fourth pill that
// duplicated one of the others. Default to In stock so sellers land on
// their live inventory.
type Filter = "in" | "oos" | "draft";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "in", label: "In stock" },
  { key: "oos", label: "Out of stock" },
  { key: "draft", label: "Drafts" },
];

export default function SellerListings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>(() => {
    const q = String(params.filter || "").toLowerCase();
    return q === "oos" || q === "draft" ? (q as Filter) : "in";
  });

  // Fetch the seller's full inventory (not a capped page) by walking pages
  // until we've collected every listing the API reports.
  const load = useCallback(async () => {
    try {
      const all: Product[] = [];
      let page = 1;
      for (;;) {
        const res = await nest.getMyProducts({ per_page: PER_PAGE, page }).catch(() => ({ items: [], total: 0, total_pages: 0 }));
        const items = res.items || [];
        all.push(...items.map(toProduct));
        const done =
          items.length < PER_PAGE ||
          (res.total_pages != null && page >= res.total_pages) ||
          (res.total != null && all.length >= res.total);
        if (done) break;
        page += 1;
      }
      setProducts(all);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // v1.0.148 — three-way partition of the seller's listings:
  //   drafts    = anything not yet published (fix required)
  //   in stock  = published + stock > 0
  //   out of stock = published + stock <= 0
  // Drafts are always separated out (they have their own tab), so a draft
  // never shows in In stock or Out of stock even if it happens to have
  // positive/zero stock — otherwise sellers see the same product in two
  // tabs, which is confusing.
  const isDraft = useCallback((p: Product) => p.status === "draft", []);
  const visible = useMemo(() => {
    if (filter === "draft") return products.filter(isDraft);
    if (filter === "oos") return products.filter((p) => !isDraft(p) && (!p.in_stock || p.stock <= 0));
    return products.filter((p) => !isDraft(p) && p.in_stock && p.stock > 0);
  }, [products, filter, isDraft]);
  // v1.0.153 — exclude drafts from the OOS count so the pill matches what
  // the Out-of-stock tab actually shows. Before this, a draft (which has
  // stock=0 while it's waiting on ship-from / package details) got counted
  // as OOS in the pill but was hidden in the tab — the pill said "(3)" and
  // the tab said "You're fully stocked."
  const oosCount = useMemo(
    () => products.filter((p) => !isDraft(p) && (!p.in_stock || p.stock <= 0)).length,
    [products, isDraft],
  );
  const draftCount = useMemo(() => products.filter(isDraft).length, [products, isDraft]);

  const createNew = () => router.push("/seller/product-form");
  const edit = (p: Product) => router.push(`/seller/product-form?id=${p.id}`);

  // v1.0.64 (Build #3) — server duplicates the listing as a draft and returns
  // the new product. We then push the form for that new draft so the seller
  // can tweak color/size/photo and hit publish.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const duplicate = (p: Product) => {
    Alert.alert(
      "Duplicate this listing?",
      `A draft copy of "${decodeEntities(p.title)}" will be created. You can edit it before publishing.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Duplicate",
          onPress: async () => {
            haptics.press();
            setDuplicatingId(p.id);
            try {
              const raw = await nest.duplicateProduct(p.id);
              const copy = toProduct(raw);
              haptics.success();
              toast.success("Draft copy created");
              router.push(`/seller/product-form?id=${copy.id}`);
            } catch (e) {
              toast.error(e instanceof ApiError ? e.friendly : "Could not duplicate");
            } finally {
              setDuplicatingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/seller/dashboard"); }} style={styles.topBtn} testID="listings-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>
          {filter === "oos"
            ? "Out of stock"
            : filter === "in"
            ? "In stock"
            : filter === "draft"
            ? "Drafts"
            : "Your listings"}
        </Text>
        <View style={styles.topRight}>
          <TouchableOpacity onPress={() => { haptics.press(); createNew(); }} style={styles.addBtn} testID="listings-add-new" accessibilityRole="button" accessibilityLabel="Add a new listing">
            <Ionicons name="add" size={18} color={colors.onBrand} />
            <Text style={styles.addBtnText}>Add New</Text>
          </TouchableOpacity>
          <AlertsBellButton />
          <CartHeaderButton />
        </View>
      </View>

      {/* v1.0.148 — three-tab segmented control: In stock / Out of stock /
          Drafts. Same visual grammar as Sold/Bought on the orders screen.
          OOS and Drafts pills show a count when > 0 so the seller can see
          at a glance what needs attention without switching tabs. */}
      <View style={styles.segRow}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === "oos" ? oosCount : f.key === "draft" ? draftCount : 0;
          const showCount = count > 0;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => { haptics.tap(); setFilter(f.key); }}
              style={[styles.seg, active && styles.segActive]}
              testID={`listings-seg-${f.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={showCount ? `${f.label}, ${count} items` : f.label}
            >
              <Text
                style={[styles.segLabel, active && styles.segLabelActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {f.label}{showCount ? ` (${count})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <ProductGridSkeleton count={6} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => { haptics.tap(); edit(item); }} activeOpacity={0.85} testID={`listing-${item.id}`} accessibilityRole="button" accessibilityLabel={`Edit ${decodeEntities(item.title)}`}>
              <AppImage source={{ uri: item.images?.[0] }} style={styles.rowImg} fallbackIcon="pricetag-outline" />
              <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{decodeEntities(item.title)}</Text>
                <Text style={styles.rowMeta}>Stock: {item.stock} · ${item.price.toFixed(2)}</Text>
                {/* v1.0.146 — draft badge + reason so the seller can see WHY
                    something didn't publish. The plugin surfaces the first
                    missing field (ship-from ZIP, package weight, etc.); we
                    render it inline so the fix is obvious without opening
                    the listing. */}
                {item.status === "draft" ? (
                  <View style={styles.rowDraftRow}>
                    <View style={styles.rowDraftPill}>
                      <Text style={styles.rowDraftPillText}>Draft</Text>
                    </View>
                    {item.draft_reason?.label ? (
                      <Text style={styles.rowDraftReason} numberOfLines={2}>
                        Fix: {item.draft_reason.label}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {/* v1.0.66 - Build #5: surface favorites so the seller knows
                    which listings are drawing interest. Only shown when at
                    least one buyer has favorited the item so brand-new
                    listings don't display a "0" that reads as a bad score. */}
                {(item.favorites_count ?? 0) > 0 ? (
                  <View style={styles.rowFavRow}>
                    <Ionicons name="heart" size={12} color={colors.brand} />
                    <Text style={styles.rowFavText}>
                      {item.favorites_count === 1 ? "1 favorite" : `${item.favorites_count} favorites`}
                    </Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => { haptics.tap(); duplicate(item); }}
                accessibilityRole="button"
                accessibilityLabel={`Duplicate ${decodeEntities(item.title)}`}
                style={styles.rowAction}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={duplicatingId === item.id}
                testID={`listing-duplicate-${item.id}`}
              >
                {duplicatingId === item.id ? (
                  <ActivityIndicator size="small" color={colors.onSurfaceMuted} />
                ) : (
                  <Ionicons name="copy-outline" size={20} color={colors.onSurfaceMuted} />
                )}
              </TouchableOpacity>
              <Ionicons name="create-outline" size={20} color={colors.onSurfaceMuted} style={{ marginLeft: spacing.sm }} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            filter === "draft" ? (
              <EmptyState
                icon="checkmark-circle"
                title="No drafts"
                message="Every listing is live. Drafts show up here when a product can't be published\u2014usually because your ship-from address or a product's package details are missing."
                testID="listings-empty-draft"
              />
            ) : filter === "oos" ? (
              <EmptyState
                icon="checkmark-circle"
                title="You're fully stocked"
                message="Every listing in your shop has stock available. Great work."
                testID="listings-empty-oos"
              />
            ) : filter === "in" ? (
              <EmptyState
                icon="cube-outline"
                title="No in-stock listings"
                message="Every listing is out of stock right now. Switch to Out of stock to restock them."
                testID="listings-empty-in"
              />
            ) : (
              <EmptyState
                icon="cube-outline"
                title="No listings yet"
                message="Add your first product to start selling on My Nest."
                actionLabel="Add your first listing"
                onAction={createNew}
                testID="listings-empty"
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, flex: 1 },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  segRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  seg: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", minHeight: 36 },
  segActive: { backgroundColor: colors.brand },
  segLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceMuted, textAlign: "center" },
  segLabelActive: { color: colors.onBrand },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill, backgroundColor: colors.brand, ...shadows.card },
  addBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, ...shadows.card },
  rowImg: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowMeta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  rowFavRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  rowFavText: { fontSize: 12, color: colors.brand, fontWeight: "600" },
  rowDraftRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 4, gap: 6 },
  rowDraftPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.warning, flexShrink: 0, marginTop: 1 },
  rowDraftPillText: { fontSize: 11, fontWeight: "800", color: colors.onBrand },
  rowDraftReason: { fontSize: 12, color: colors.onSurfaceMuted, flex: 1, lineHeight: 16 },
  rowAction: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
});
