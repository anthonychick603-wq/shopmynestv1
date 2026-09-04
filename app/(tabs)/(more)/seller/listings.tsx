import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import type { Product } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { AppImage } from "@/src/components/AppImage";
import { toast } from "@/src/components/Toast";
import { decodeEntities } from "@/src/utils/html";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { ErrorState } from "@/src/components/ErrorState";

const PER_PAGE = 50;
// v1.0.247 — hard cap on the seller-listings pagination loop. Without
// a cap, a misbehaving backend that returned items with a stale total
// would spin forever, filling memory and battery. 20 pages × 50/page
// = 1000 rows, which is well beyond any active seller today; if a
// seller ever crosses it we'll surface the truncation warning rather
// than silently drop items or lock up (audit P2).
const MAX_PAGES = 20;

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
  useBackFallback("/(tabs)/seller/dashboard");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.247 — distinguish "loaded empty" (server returned zero) from
  // "failed to load" so a network hiccup doesn't render the friendly
  // "You're fully stocked" empty state and make the seller think their
  // listings vanished (audit P1).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>(() => {
    const q = String(params.filter || "").toLowerCase();
    return q === "oos" || q === "draft" ? (q as Filter) : "in";
  });

  // v1.0.247 — use useLatestRequest so pull-to-refresh chased by a back
  // nav can't setState on an unmounted component and so two overlapping
  // pull-to-refreshes converge on the fresher payload (audit P0).
  const { begin, isCurrent } = useLatestRequest();

  // Fetch the seller's full inventory (not a capped page) by walking pages
  // until we've collected every listing the API reports.
  const load = useCallback(async () => {
    const reqId = begin();
    let failed = false;
    try {
      const all: Product[] = [];
      let page = 1;
      for (;;) {
        // v1.0.247 — previously swallowed all errors into an empty
        // payload, then the caller couldn't tell "seller has zero
        // listings" from "the request failed". Track the failure locally
        // and surface an error state; only render the empty state on a
        // clean zero-item response.
        let res: { items?: unknown[]; total?: number; total_pages?: number };
        try {
          res = await nest.getMyProducts({ per_page: PER_PAGE, page });
        } catch {
          failed = true;
          break;
        }
        if (!isCurrent(reqId)) return;
        const items = (res.items as Parameters<typeof toProduct>[0][] | undefined) || [];
        all.push(...items.map(toProduct));
        const done =
          items.length < PER_PAGE ||
          (res.total_pages != null && page >= res.total_pages) ||
          (res.total != null && all.length >= res.total);
        if (done) break;
        page += 1;
        // v1.0.247 — hard ceiling per MAX_PAGES; log + toast so a real
        // regression is visible instead of spinning forever.
        if (page > MAX_PAGES) {
          if (__DEV__) console.warn("seller/listings: pagination hit MAX_PAGES; truncating");
          toast.error(`Showing first ${MAX_PAGES * PER_PAGE} listings. Contact support if this is wrong.`);
          break;
        }
      }
      if (!isCurrent(reqId)) return;
      if (failed) {
        // Only surface an error if we didn't manage to load anything.
        // If page 1 succeeded and only page 2 failed, keep what we have
        // and toast the partial failure.
        if (all.length === 0) {
          setLoadError("Couldn't load your listings. Check your connection and try again.");
        } else {
          setProducts(all);
          toast.error("Couldn't load all pages. Pull to retry.");
        }
      } else {
        setLoadError(null);
        setProducts(all);
      }
    } finally {
      if (isCurrent(reqId)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [begin, isCurrent]);

  // v1.0.167 — load once on mount. Pull to refresh to force reload.
  // Focus refetch removed so scroll position survives returning from
  // a pushed edit/detail screen.
  React.useEffect(() => { load(); }, [load]);
  // v1.0.254 — refetch when a product is created / edited / deleted /
  // duplicated from anywhere (including the product-form pushed screen).
  useInvalidateOnFocus(["products"], load);

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
            // v1.0.247 — clear the busy state BEFORE the router.push so
            // the setter runs while we're still mounted. The old shape
            // (`finally { setDuplicatingId(null) }`) always fired after
            // navigation, which meant the state update landed on an
            // unmounted component (audit P1).
            try {
              const raw = await nest.duplicateProduct(p.id);
              const copy = toProduct(raw);
              haptics.success();
              toast.success("Draft copy created");
              setDuplicatingId(null);
              router.push(`/seller/product-form?id=${copy.id}`);
            } catch (e) {
              setDuplicatingId(null);
              toast.error(e instanceof ApiError ? e.friendly : "Could not duplicate");
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/seller/dashboard"); }} style={styles.topBtn} testID="listings-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
      ) : loadError ? (
        // v1.0.247 — render the error state on load failure so the seller
        // sees "couldn't load your listings" with a Retry, not the friendly
        // "You're fully stocked" empty state (audit P1).
        <View style={{ padding: spacing.lg }}>
          <ErrorState
            title="Couldn't load your listings"
            message={loadError}
            onRetry={() => { setLoading(true); load(); }}
            testID="listings-load-error"
          />
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
                    {/* v1.0.155 — only prefix "Fix:" when there's an
                        actionable missing field (ship-from or package).
                        Manual drafts are the seller's own choice and don't
                        need a scolding "Fix: saved as draft" line. */}
                    {item.draft_reason?.kind === "ship_from" || item.draft_reason?.kind === "package" ? (
                      item.draft_reason.label ? (
                        <Text style={styles.rowDraftReason} numberOfLines={2}>
                          Fix: {item.draft_reason.label}
                        </Text>
                      ) : null
                    ) : (
                      <Text style={styles.rowDraftReason} numberOfLines={2}>
                        Tap to edit and publish
                      </Text>
                    )}
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

// v1.0.228 — Seller Listings refinement. List rows and top pill
// buttons are white cards with hairline borders (no shadow); segments
// become inactive hairline pills / active brand pills for a calmer feel.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  topTitle: { ...typeTokens.h2, fontSize: 16, flex: 1 },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
  segRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  seg: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  segActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segLabel: { ...typeTokens.caption, fontWeight: "700", textAlign: "center" },
  segLabelActive: { color: colors.onBrand },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  addBtnText: { ...typeTokens.body, color: colors.onBrand, fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.sm,
  },
  rowImg: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  rowTitle: { ...typeTokens.body, fontWeight: "700" },
  rowMeta: { ...typeTokens.caption, marginTop: 2 },
  rowFavRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  rowFavText: { ...typeTokens.caption, color: colors.brand, fontWeight: "600" },
  rowDraftRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 4, gap: 6 },
  rowDraftPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.warning, flexShrink: 0, marginTop: 1 },
  rowDraftPillText: { ...typeTokens.micro, fontWeight: "800", color: colors.onBrand },
  rowDraftReason: { ...typeTokens.caption, flex: 1, lineHeight: 16 },
  rowAction: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
});
