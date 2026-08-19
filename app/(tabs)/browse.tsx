import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestSellerListItem } from "@/src/api/nest";
import { addRecentSearch, loadRecentSearches, clearRecentSearches } from "@/src/utils/recent-searches";
import { toCategory, toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { pushFromTab } from "@/src/utils/nav";
import type { Category, Product } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toast } from "@/src/components/Toast";
import { Button } from "@/src/components/Button";
import { haptics } from "@/src/utils/haptics";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";

// WooCommerce `pa_condition` global attribute — fixed terms registered by the
// Trust Suite plugin. Values are the term slugs passed to the products query.
const CONDITION_TERMS: { slug: string; label: string }[] = [
  { slug: "new", label: "New" },
  { slug: "like-new", label: "Like New" },
  { slug: "good", label: "Good" },
  { slug: "fair", label: "Fair" },
  { slug: "poor", label: "Poor" },
];

type SortKey = "" | "popular" | "price_asc" | "price_desc";
const SORT_LABEL: Record<SortKey, string> = {
  "": "Newest",
  popular: "Most popular",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
};

export default function Browse() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { category: initialCat } = useLocalSearchParams<{ category?: string }>();
  const { user } = useAuth();
  const { addProduct } = useCart();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();

  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [category, setCategory] = useState<string | undefined>(initialCat);
  const [sort, setSort] = useState<SortKey>("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [condition, setCondition] = useState<string | undefined>();
  const [size, setSize] = useState("");
  const [brand, setBrand] = useState("");
  const [appliedAttrs, setAppliedAttrs] = useState<{ condition?: string; size?: string; brand?: string }>({});
  const [categories, setCategories] = useState<Category[]>([]);
  // v1.0.44 — Discover shops row. Sorted by product count descending so the
  // most active shops surface first. Fails silently — the row just doesn't
  // render if the endpoint 500s or the seller list is empty.
  // v1.0.83 — show ALL shops here (no product_count > 0 filter) and pull the
  // full seller list so the horizontal strip is the complete directory.
  const [shops, setShops] = useState<NestSellerListItem[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // v1.0.63 — recent searches (client-side) and saving-alert affordance.
  const [recent, setRecent] = useState<string[]>([]);
  const [savingAlert, setSavingAlert] = useState(false);

  useEffect(() => {
    nest.getCategories().then((cs) => setCategories(cs.map(toCategory))).catch(() => {});
    // v1.0.83 — pull the full seller directory so the horizontal strip shows
    // every shop. The server caps per_page at 100, so we fetch page 1 and then
    // walk any remaining pages in the background. Fails silently — the row
    // just doesn't render if the endpoint errors or returns nothing.
    (async () => {
      try {
        const first = await nest.getSellers({ per_page: 100, page: 1 });
        const collected: NestSellerListItem[] = [...(first.items || [])];
        const totalPages = Math.max(1, first.total_pages ?? 1);
        for (let p = 2; p <= totalPages; p++) {
          try {
            const next = await nest.getSellers({ per_page: 100, page: p });
            collected.push(...(next.items || []));
          } catch {
            break;
          }
        }
        const sorted = collected.sort((a, b) => (b.product_count ?? 0) - (a.product_count ?? 0));
        setShops(sorted);
      } catch {
        setShops([]);
      }
    })();
    loadRecentSearches().then(setRecent);
  }, []);

  const commitSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    setSubmitted(trimmed);
    if (trimmed) {
      addRecentSearch(trimmed).then(setRecent);
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await nest.getProducts({
        per_page: 50,
        category: category || undefined,
        search: submitted || undefined,
        sort: sort || undefined,
        min_price: minPrice || undefined,
        max_price: maxPrice || undefined,
        // Structured WooCommerce attribute filters (pa_condition/pa_size/pa_brand).
        pa_condition: appliedAttrs.condition || undefined,
        pa_size: appliedAttrs.size || undefined,
        pa_brand: appliedAttrs.brand || undefined,
      });
      setItems(res.items.map(toProduct));
      setTotal(res.total || res.items.length);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, submitted, sort, minPrice, maxPrice, appliedAttrs]);

  useEffect(() => { load(); }, [load]);

  const onAdd = async (p: Product) => {
    if (!user) return pushFromTab(router, "/(auth)/login");
    try {
      const fresh = toProduct(await nest.getProduct(p.id));
      if (!fresh.in_stock) return toast.error("Out of stock");
      addProduct(fresh, 1);
      toast.success("Added to cart");
    } catch {
      toast.error("Could not add to cart");
    }
  };

  const onFav = (p: Product) => {
    if (!user) return pushFromTab(router, "/(auth)/login");
    toggleFavorite(p.id);
  };

  const activeFilters = (appliedAttrs.condition ? 1 : 0) + (appliedAttrs.size ? 1 : 0) + (appliedAttrs.brand ? 1 : 0) + (minPrice || maxPrice ? 1 : 0);

  const applyFilters = () => {
    setAppliedAttrs({ condition, size: size.trim() || undefined, brand: brand.trim() || undefined });
    setFilterOpen(false);
  };

  const clearFilters = () => {
    setMinPrice("");
    setMaxPrice("");
    setCondition(undefined);
    setSize("");
    setBrand("");
    setAppliedAttrs({});
    setFilterOpen(false);
  };

  // v1.0.63 — "Save alert" persists the current search + filters as a
  // saved search on the server. The backend cron pushes a notification
  // when new listings match. Requires login.
  const onSaveAlert = async () => {
    if (!user) {
      pushFromTab(router, "/(auth)/login");
      return;
    }
    haptics.press();
    // v1.0.67 hotfix - if the user typed a search term but never hit
    // return, treat the current input as the search term for the alert.
    // Otherwise the pill was useless on Android where onSubmitEditing
    // doesn't always fire when the user just moves on.
    const effectiveSearch = (submitted || search).trim();
    if (effectiveSearch && effectiveSearch !== submitted) {
      setSubmitted(effectiveSearch);
      addRecentSearch(effectiveSearch).then(loadRecentSearches).catch(() => {});
    }
    const hasAnyCriteria =
      !!effectiveSearch ||
      !!category ||
      !!appliedAttrs.condition ||
      !!appliedAttrs.size ||
      !!appliedAttrs.brand ||
      !!minPrice ||
      !!maxPrice;
    if (!hasAnyCriteria) {
      toast.error("Add a search term or filter first");
      return;
    }
    setSavingAlert(true);
    try {
      await nest.saveSearch({
        search: effectiveSearch || undefined,
        category: category || undefined,
        sort: sort || undefined,
        min_price: minPrice || undefined,
        max_price: maxPrice || undefined,
        pa_condition: appliedAttrs.condition || undefined,
        pa_size: appliedAttrs.size || undefined,
        pa_brand: appliedAttrs.brand || undefined,
      });
      toast.success("Alert saved — we'll notify you of new matches");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not save alert");
    } finally {
      setSavingAlert(false);
    }
  };

  // v1.0.67 hotfix - show the pill as soon as the user has *any*
  // discoverable criterion, including unsubmitted text they're typing.
  // Previously we required `submitted`, which on Android meant the pill
  // never surfaced for anyone who typed and tapped a filter without
  // hitting the return key first.
  const hasAnyCriteria =
    !!submitted ||
    !!search.trim() ||
    !!category ||
    !!appliedAttrs.condition ||
    !!appliedAttrs.size ||
    !!appliedAttrs.brand ||
    !!minPrice ||
    !!maxPrice;

  const StickyHeader = useMemo(() => (
    <View style={styles.stickyHeader}>
      <View style={styles.topRow}>
        <View style={[styles.searchWrap, styles.searchWrapFlex]}>
          <Ionicons name="search" size={18} color={colors.onSurfaceMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => commitSearch(search)}
            returnKeyType="search"
            placeholder="Search handmade goods…"
            placeholderTextColor={colors.onSurfaceMuted}
            style={styles.searchInput}
            testID="browse-search-input"
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(""); setSubmitted(""); }} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <CartHeaderButton />
      </View>

      {/* v1.0.63 — recent searches strip. Shown only when the input is empty
          so it doesn't compete with an active search's category row. */}
      {!search && !submitted && recent.length > 0 ? (
        <View style={styles.recentBlock}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent searches</Text>
            <TouchableOpacity onPress={() => { clearRecentSearches().then(() => setRecent([])); }} testID="recent-clear">
              <Text style={styles.recentClear}>Clear</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
            {recent.map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.recentChip}
                onPress={() => { setSearch(q); commitSearch(q); }}
                testID={`recent-${q}`}
              >
                <Ionicons name="time-outline" size={14} color={colors.onSurfaceMuted} />
                <Text style={styles.recentChipText} numberOfLines={1}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        <CategoryChip label="All" selected={!category} onPress={() => { haptics.tap(); setCategory(undefined); }} testID="cat-all" />
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            selected={category === c.id}
            onPress={() => { haptics.tap(); setCategory(c.id === category ? undefined : c.id); }}
            testID={`cat-${c.id}`}
          />
        ))}
      </ScrollView>

      {shops.length > 0 ? (
        <View style={styles.shopsBlock}>
          <View style={styles.shopsHeader}>
            <Text style={styles.shopsTitle}>Discover shops</Text>
            <TouchableOpacity onPress={() => pushFromTab(router, "/(tabs)/(more)/shops")} testID="shops-see-all">
              <Text style={styles.shopsSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shopsRow}>
            {shops.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.shopCard}
                onPress={() => pushFromTab(router, `/(tabs)/(more)/seller/${s.id}`)}
                testID={`shop-${s.id}`}
              >
                {s.avatar ? (
                  <AppImage source={{ uri: s.avatar }} style={styles.shopAvatar} fallbackIcon="storefront-outline" />
                ) : (
                  <View style={[styles.shopAvatar, styles.shopAvatarPlaceholder]}>
                    <Ionicons name="storefront-outline" size={22} color={colors.onSurfaceMuted} />
                  </View>
                )}
                <Text style={styles.shopName} numberOfLines={1}>{s.store_name || s.display_name || "Shop"}</Text>
                <Text style={styles.shopMeta} numberOfLines={1}>
                  {(s.product_count ?? 0)} item{(s.product_count ?? 0) === 1 ? "" : "s"}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.controlsRow}>
        <Text style={styles.count}>{total} items</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {hasAnyCriteria ? (
            <TouchableOpacity style={[styles.controlBtn, styles.saveAlertBtn]} onPress={onSaveAlert} disabled={savingAlert} testID="btn-save-alert">
              <Ionicons name={savingAlert ? "hourglass-outline" : "notifications-outline"} size={16} color={colors.onBrand} />
              <Text style={[styles.controlText, { color: colors.onBrand }]}>{savingAlert ? "Saving…" : "Save alert"}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity accessibilityLabel="Sort results" accessibilityRole="button" style={styles.controlBtn} onPress={() => { haptics.tap(); setSortOpen(true); }} testID="btn-sort">
            <Ionicons name="swap-vertical" size={16} color={colors.onSurface} />
            <Text style={styles.controlText}>Sort</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel={activeFilters > 0 ? `Open filters, ${activeFilters} active` : "Open filters"} accessibilityRole="button" style={[styles.controlBtn, activeFilters > 0 && styles.controlBtnActive]} onPress={() => { haptics.tap(); setFilterOpen(true); }} testID="btn-filter">
            <Ionicons name="options" size={16} color={activeFilters > 0 ? colors.onBrand : colors.onSurface} />
            <Text style={[styles.controlText, activeFilters > 0 && { color: colors.onBrand }]}>{activeFilters > 0 ? `Filter (${activeFilters})` : "Filter"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ), [search, category, categories, total, activeFilters, shops, recent, hasAnyCriteria, savingAlert]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {loading && !refreshing ? (
        <>
          {StickyHeader}
          {/* v1.0.69 — shimmer grid instead of a lonely spinner keeps the
              layout weight during the first load; feels dramatically faster. */}
          <ProductGridSkeleton count={6} />
        </>
      ) : error ? (
        <>
          {StickyHeader}
          <EmptyState icon="cloud-offline-outline" title="Unable to load" message={error} actionLabel="Retry" onAction={load} testID="browse-error" />
        </>
      ) : (
        <FlatList
          testID="browse-list"
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          ListHeaderComponent={StickyHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          renderItem={({ item }) => <ProductCard product={item} layout="grid" onAddToCart={() => onAdd(item)} onToggleFavorite={() => onFav(item)} isFavorite={isFavorite(item.id)} />}
          ListEmptyComponent={<EmptyState icon="search-outline" title="No products found" message="Try a different search or category." testID="browse-empty" />}
        />
      )}

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSortOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Sort by</Text>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <TouchableOpacity key={k} onPress={() => { haptics.tap(); setSort(k); setSortOpen(false); }} style={styles.sortRow} testID={`sort-${k || 'newest'}`}>
                <Text style={{ color: colors.onSurface, fontSize: 15 }}>{SORT_LABEL[k]}</Text>
                {sort === k ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFilterOpen(false)}>
          <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: spacing.md }} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Filters</Text>

            <Text style={styles.filterLabel}>Condition</Text>
            <View style={styles.attrChipsRow}>
              {CONDITION_TERMS.map((t) => {
                const selected = condition === t.slug;
                return (
                  <TouchableOpacity
                    key={t.slug}
                    onPress={() => { haptics.tap(); setCondition(selected ? undefined : t.slug); }}
                    style={[styles.attrChip, selected && styles.attrChipSelected]}
                    testID={`filter-condition-${t.slug}`}
                  >
                    <Text style={[styles.attrChipText, selected && { color: colors.onBrand }]}>{t.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.filterLabel}>Size</Text>
            <TextInput value={size} onChangeText={setSize} placeholder="e.g. M, 10, One size" placeholderTextColor={colors.onSurfaceMuted} style={[styles.filterInput, { marginBottom: spacing.md }]} testID="filter-size" autoCapitalize="none" />

            <Text style={styles.filterLabel}>Brand</Text>
            <TextInput value={brand} onChangeText={setBrand} placeholder="e.g. Handmade, Vintage" placeholderTextColor={colors.onSurfaceMuted} style={[styles.filterInput, { marginBottom: spacing.md }]} testID="filter-brand" autoCapitalize="none" />

            <Text style={styles.filterLabel}>Price range</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
              <TextInput value={minPrice} onChangeText={setMinPrice} placeholder="Min $" placeholderTextColor={colors.onSurfaceMuted} keyboardType="numeric" style={styles.filterInput} testID="filter-min-price" />
              <TextInput value={maxPrice} onChangeText={setMaxPrice} placeholder="Max $" placeholderTextColor={colors.onSurfaceMuted} keyboardType="numeric" style={styles.filterInput} testID="filter-max-price" />
            </View>
            <Button title="Apply filters" onPress={applyFilters} testID="filter-apply" />
            <Button title="Clear all" variant="ghost" onPress={clearFilters} testID="filter-clear" />
          </ScrollView>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function CategoryChip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity onPress={onPress} testID={testID} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stickyHeader: { backgroundColor: colors.surface, paddingBottom: spacing.sm },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md },
  searchWrap: { marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm, ...shadows.card },
  searchWrapFlex: { flex: 1, marginHorizontal: 0, marginTop: 0, marginBottom: 0 },
  searchInput: { flex: 1, fontSize: 15, color: colors.onSurface, paddingVertical: 6 },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm, height: 56, alignItems: "center" },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  chipTextSelected: { color: colors.onBrand },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  count: { color: colors.onSurfaceMuted, fontSize: 13, fontWeight: "700" },
  controlBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, ...shadows.card },
  controlBtnActive: { backgroundColor: colors.brand },
  // v1.0.67 hotfix - saved-search pill uses the brand color so it doesn't
  // sit invisibly next to Sort/Filter.
  saveAlertBtn: { backgroundColor: colors.brand },
  controlText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing["2xl"], maxHeight: "80%" },
  attrChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  attrChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  attrChipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  attrChipText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface, marginBottom: spacing.md },
  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  filterLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  filterInput: { flex: 1, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.onSurface },
  // v1.0.44 — Discover shops strip.
  shopsBlock: { paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  shopsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  shopsTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  shopsSeeAll: { fontSize: 13, fontWeight: "700", color: colors.brand },
  shopsRow: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
  shopCard: { width: 92, alignItems: "center" },
  shopAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  shopAvatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  shopName: { fontSize: 12, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs, textAlign: "center" },
  shopMeta: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 2, textAlign: "center" },
  // v1.0.63 — recent searches strip.
  recentBlock: { paddingTop: spacing.xs, paddingBottom: spacing.sm },
  recentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  recentTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  recentClear: { fontSize: 12, fontWeight: "700", color: colors.brand },
  recentRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xs },
  recentChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, maxWidth: 220 },
  recentChipText: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
});
