import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError, type NestSellerListItem } from "@/src/api/nest";
import { addRecentSearch, loadRecentSearches, clearRecentSearches } from "@/src/utils/recent-searches";
// v1.0.215 (P0 #9) — server-backed search dropdown (autocomplete + trending
// + server-synced recent). Sits directly under the search input while the
// buyer is focused / typing.
import { SearchSuggestOverlay } from "@/src/components/SearchSuggestOverlay";
import { toProduct } from "@/src/api/adapters";
import { MultiCategoryDropdown } from "@/src/components/MultiCategoryDropdown";
import {
  toHierarchicalCategory,
  type HierarchicalCategory,
} from "@/src/utils/categories";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { usePushFromTab } from "@/src/utils/nav";
import type { Product } from "@/src/types";
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

import { AlertsBellButton } from "@/src/components/AlertsBellButton";
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
  const push = usePushFromTab();
  // v1.0.243 — accept the full saved-search deep-link contract so tapping
  // a saved search actually replays the exact criteria that were saved.
  // Fixes the P1 where only category was hydrated and sort, price range,
  // condition, size, brand, and even the free-text search were silently
  // discarded, giving buyers materially different results than they saved.
  const {
    category: initialCat,
    search: initialSearch,
    sort: initialSort,
    min_price: initialMin,
    max_price: initialMax,
    pa_condition: initialCondition,
    pa_size: initialSize,
    pa_brand: initialBrand,
  } = useLocalSearchParams<{
    category?: string;
    search?: string;
    sort?: string;
    min_price?: string;
    max_price?: string;
    pa_condition?: string;
    pa_size?: string;
    pa_brand?: string;
  }>();
  // v1.0.187 — browse-side filter is multi-select: shoppers can pick any
  // number of categories AND drill in with sub-category checkboxes.
  // We preserve the deep-link `?category=<id>` shape by seeding the array
  // with just that one id.
  const initialCategoryIds = useMemo(
    () => (initialCat ? [initialCat] : []),
    [initialCat],
  );
  const { user, refresh: refreshAuth } = useAuth();
  const { addProduct } = useCart();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();

  // v1.0.243 — seed every filter from the deep-link params. Empty string
  // and undefined stay behaviorally identical to "unset" so nothing changes
  // for a plain /browse entry.
  const _sortSeed: SortKey = (
    initialSort === "popular" || initialSort === "price_asc" || initialSort === "price_desc"
      ? initialSort
      : ""
  );
  const [search, setSearch] = useState(initialSearch ?? "");
  const [submitted, setSubmitted] = useState(initialSearch ?? "");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(initialCategoryIds);
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>(_sortSeed);
  const [minPrice, setMinPrice] = useState(initialMin ?? "");
  const [maxPrice, setMaxPrice] = useState(initialMax ?? "");
  const [condition, setCondition] = useState<string | undefined>(initialCondition);
  const [size, setSize] = useState(initialSize ?? "");
  const [brand, setBrand] = useState(initialBrand ?? "");
  const [appliedAttrs, setAppliedAttrs] = useState<{ condition?: string; size?: string; brand?: string }>({
    condition: initialCondition,
    size: initialSize,
    brand: initialBrand,
  });
  const [categories, setCategories] = useState<HierarchicalCategory[]>([]);
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
  // v1.0.215 (P0 #9) — server-synced recent searches. Populated only when
  // signed in; falls back to the local list otherwise. Kept in sync every
  // time the buyer submits a search (server logs it, then we re-fetch).
  const [serverRecent, setServerRecent] = useState<string[]>([]);
  // v1.0.215 — whether the input is focused / has content. Controls whether
  // the suggest overlay is visible.
  const [searchFocused, setSearchFocused] = useState(false);
  const [savingAlert, setSavingAlert] = useState(false);

  useEffect(() => {
    // v1.0.163 — Guard every resolve with an `alive` flag so a fetch that
    // finishes after the tab is torn down (freezeOnBlur/lazy tore it down,
    // or the user backed out to another route) cannot call setState on an
    // unmounted native view. Fabric release builds could hard-close on this.
    let alive = true;
    nest.getCategories().then((cs) => { if (alive) setCategories(cs.map(toHierarchicalCategory)); }).catch(() => {});
    // v1.0.83 — show the first 25 shops here (sorted by product count desc);
    // "See all" opens the searchable directory. Fails silently — the row just
    // doesn't render if the endpoint errors or returns nothing.
    nest
      .getSellers({ per_page: 25, page: 1 })
      .then((res) => {
        if (!alive) return;
        const sorted = [...(res.items || [])].sort((a, b) => (b.product_count ?? 0) - (a.product_count ?? 0));
        setShops(sorted.slice(0, 25));
      })
      .catch(() => { if (alive) setShops([]); });
    loadRecentSearches().then((r) => { if (alive) setRecent(r); });
    return () => { alive = false; };
  }, []);

  // v1.0.215 (P0 #9) — pull the server-synced recent list on mount and
  // whenever the sign-in state flips. Fails silently on error — the local
  // list (loaded above) is the fallback the overlay shows in that case.
  useEffect(() => {
    if (!user) { setServerRecent([]); return; }
    let alive = true;
    nest.getRecentSearches()
      .then((res) => { if (alive) setServerRecent((res.items || []).map((i) => i.term).filter(Boolean)); })
      .catch(() => { if (alive) setServerRecent([]); });
    return () => { alive = false; };
  }, [user]);

  const commitSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    setSubmitted(trimmed);
    // Dismiss the overlay so the results become visible immediately on
    // submit — the buyer has committed to this term.
    setSearchFocused(false);
    if (trimmed) {
      addRecentSearch(trimmed).then(setRecent);
      // v1.0.215 (P0 #9) — fire-and-forget server log. If the user is
      // signed in, the server stamps their id and the recent list will
      // include this term next time we refresh below.
      nest.searchLog(trimmed).catch(() => {});
      if (user) {
        nest.getRecentSearches()
          .then((res) => setServerRecent((res.items || []).map((i) => i.term).filter(Boolean)))
          .catch(() => {});
      }
    }
  }, [user]);

  // v1.0.163 — Store the latest in-flight load's identity so that if the
  // user changes filters (or leaves the tab) before it resolves, the old
  // response is dropped instead of stomping the fresher one — which also
  // avoids a setState-after-unmount hard close.
  const loadTokenRef = React.useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    setError(null);
    setLoading(true);
    try {
      // v1.0.187 — union the two arrays so WooCommerce's /products endpoint
      // receives one comma-joined `category` filter (it accepts a CSV of ids).
      // Sub-category ids are terminal category ids in the tree — filtering by
      // both sets is a strict AND against the product→category assignment,
      // which is what shoppers expect when they check both.
      const combinedCategoryIds = [
        ...selectedCategoryIds,
        ...selectedSubcategoryIds,
      ];
      const res = await nest.getProducts({
        per_page: 50,
        category: combinedCategoryIds.length > 0 ? combinedCategoryIds.join(",") : undefined,
        search: submitted || undefined,
        sort: sort || undefined,
        min_price: minPrice || undefined,
        max_price: maxPrice || undefined,
        // Structured WooCommerce attribute filters (pa_condition/pa_size/pa_brand).
        pa_condition: appliedAttrs.condition || undefined,
        pa_size: appliedAttrs.size || undefined,
        pa_brand: appliedAttrs.brand || undefined,
      });
      if (token !== loadTokenRef.current) return;
      // v1.0.154 — belt-and-suspenders OOS filter. Older plugin builds could
      // leak listings whose stock_status stayed 'instock' while stock_quantity
      // dropped to 0 (seller left manage_stock off). Server-side v3.13.18
      // catches this, but keep the client filter so older installs behave.
      const filtered = res.items
        .map(toProduct)
        .filter((p) => p.in_stock && p.stock > 0);
      setItems(filtered);
      setTotal(res.total || filtered.length);
    } catch (e) {
      if (token !== loadTokenRef.current) return;
      setError(e instanceof ApiError ? e.friendly : "Could not load products.");
    } finally {
      if (token === loadTokenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [selectedCategoryIds, selectedSubcategoryIds, submitted, sort, minPrice, maxPrice, appliedAttrs]);

  useEffect(() => {
    load();
    // Bumping the token on unmount invalidates any in-flight load so its
    // resolve becomes a no-op.
    return () => { loadTokenRef.current++; };
  }, [load]);

  // v1.0.243 — per-card add-in-progress guard so rapid taps on the
  // grid card plus button cannot fire duplicate stock fetches or add
  // multiple units.
  const [addingId, setAddingId] = useState<string | null>(null);
  const onAdd = async (p: Product) => {
    if (!user) return push("/(auth)/login");
    if (addingId != null) return;
    setAddingId(p.id);
    try {
      const fresh = toProduct(await nest.getProduct(p.id));
      if (!fresh.in_stock) return toast.error("Out of stock");
      const ok = await Promise.resolve(addProduct(fresh, 1));
      if (ok) toast.success("Added to cart");
      else toast.error("Couldn't add — please try again");
    } catch {
      toast.error("Could not add to cart");
    } finally {
      setAddingId(null);
    }
  };

  const onFav = (p: Product) => {
    if (!user) return push("/(auth)/login");
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
      push("/(auth)/login");
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
    const combinedCategoryIds = [
      ...selectedCategoryIds,
      ...selectedSubcategoryIds,
    ];
    const hasAnyCriteria =
      !!effectiveSearch ||
      combinedCategoryIds.length > 0 ||
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
        category: combinedCategoryIds.length > 0 ? combinedCategoryIds.join(",") : undefined,
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
    selectedCategoryIds.length > 0 ||
    selectedSubcategoryIds.length > 0 ||
    !!appliedAttrs.condition ||
    !!appliedAttrs.size ||
    !!appliedAttrs.brand ||
    !!minPrice ||
    !!maxPrice;

  // v1.0.215 (P0 #9) — merge server-recent (authoritative for signed-in
  // buyers) with the local strip so the overlay never looks empty when we
  // do have local history. Dedupe by lowercased term while preserving
  // server order first, then local for anything the server hasn't seen.
  const mergedRecent = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...serverRecent, ...recent]) {
      const k = t.trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(t);
      if (out.length >= 12) break;
    }
    return out;
  }, [serverRecent, recent]);

  // v1.0.215 (P0 #9) — wipe local + server recent from the overlay's
  // "Clear" affordance. Both fire in parallel so the UI reflects the
  // change immediately without a round-trip wait.
  const onClearBothRecents = useCallback(() => {
    clearRecentSearches().then(() => setRecent([]));
    setServerRecent([]);
    if (user) {
      nest.clearRecentSearches().catch(() => {});
    }
  }, [user]);

  const showSuggestOverlay = searchFocused;

  const StickyHeader = useMemo(() => (
    <View style={styles.stickyHeader}>
      <View style={styles.topRow}>
        <View style={[styles.searchWrap, styles.searchWrapFlex]}>
          <Ionicons name="search" size={18} color={colors.onSurfaceMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => commitSearch(search)}
            onFocus={() => setSearchFocused(true)}
            // v1.0.215 — don't blur on tap-inside-overlay; the overlay's
            // keyboardShouldPersistTaps setting keeps the keyboard up while
            // a suggestion is being tapped. onBlur only fires when focus
            // legitimately leaves the input (tap outside / hardware back).
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            placeholder="Search handmade goods…"
            placeholderTextColor={colors.onSurfaceMuted}
            style={styles.searchInput}
            testID="browse-search-input"
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(""); setSubmitted(""); setSearchFocused(false); }} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>

      {/* v1.0.215 (P0 #9) — suggest overlay replaces the old client-only
          recent-searches strip. Shown while the input is focused OR while
          the buyer is typing (≥2 chars). Contains recent + trending when
          empty; live suggestions (products / categories / shops) while
          typing. Old strip is retired; server-synced recent is authoritative. */}
      {showSuggestOverlay ? (
        <SearchSuggestOverlay
          query={search}
          recent={mergedRecent}
          onClearRecent={onClearBothRecents}
          onPickTerm={(t) => { setSearch(t); commitSearch(t); }}
          onPickProduct={(id) => { setSearchFocused(false); push(`/(tabs)/(more)/product/${id}`); }}
          onPickCategory={(id, name) => {
            // Bounce back into the same screen with the category id preselected.
            // Clear the typed text so results reflect the filter, not the term.
            setSearchFocused(false);
            setSearch("");
            setSubmitted("");
            setSelectedCategoryIds([String(id)]);
            setSelectedSubcategoryIds([]);
            haptics.tap();
          }}
          onPickShop={(id) => { setSearchFocused(false); push(`/(tabs)/(more)/seller/${id}`); }}
        />
      ) : null}

      {/* v1.0.187 — chained multi-select dropdowns replace the horizontal
          chip strip. Buyers can pick any number of categories, then drill
          in with sub-category checkboxes for tighter filtering. */}
      <View style={styles.dropdownWrap}>
        <MultiCategoryDropdown
          categories={categories}
          selectedCategoryIds={selectedCategoryIds}
          selectedSubcategoryIds={selectedSubcategoryIds}
          onChange={(catIds, subIds) => {
            haptics.tap();
            setSelectedCategoryIds(catIds);
            setSelectedSubcategoryIds(subIds);
          }}
          testIDPrefix="browse-cats"
        />
      </View>

      {shops.length > 0 ? (
        <View style={styles.shopsBlock}>
          <View style={styles.shopsHeader}>
            <Text style={styles.shopsTitle}>Discover shops</Text>
            <TouchableOpacity onPress={() => push("/(tabs)/(more)/shops")} testID="shops-see-all" accessibilityRole="button" accessibilityLabel="See all shops">
              <Text style={styles.shopsSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shopsRow} keyboardShouldPersistTaps="handled">
            {shops.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.shopCard}
                accessibilityRole="button"
                accessibilityLabel={`Open ${s.store_name || s.display_name || "shop"}`}
                onPress={() => push(`/(tabs)/(more)/seller/${s.id}`)}
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
            <TouchableOpacity style={[styles.controlBtn, styles.saveAlertBtn]} onPress={onSaveAlert} disabled={savingAlert} testID="btn-save-alert" accessibilityRole="button" accessibilityLabel={savingAlert ? "Saving alert" : "Save search as alert"}>
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
  ), [search, submitted, selectedCategoryIds, selectedSubcategoryIds, categories, total, activeFilters, shops, recent, hasAnyCriteria, savingAlert, showSuggestOverlay, mergedRecent, onClearBothRecents, router, commitSearch]);

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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refreshAuth().catch(() => {}); load(); }} tintColor={colors.brand} />}
          renderItem={({ item }) => <ProductCard product={item} layout="grid" onAddToCart={() => onAdd(item)} onToggleFavorite={() => onFav(item)} isFavorite={isFavorite(item.id)} />}
          ListEmptyComponent={<EmptyState icon="search-outline" title="No products found" message="Try a different search or category." testID="browse-empty" />}
        />
      )}

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSortOpen(false)} accessibilityRole="button" accessibilityLabel="Close sort options">
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Sort by</Text>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <TouchableOpacity key={k} onPress={() => { haptics.tap(); setSort(k); setSortOpen(false); }} style={styles.sortRow} testID={`sort-${k || 'newest'}`} accessibilityRole="button" accessibilityLabel={`Sort by ${SORT_LABEL[k]}${sort === k ? ", selected" : ""}`}>
                <Text style={{ color: colors.onSurface, fontSize: 15 }}>{SORT_LABEL[k]}</Text>
                {sort === k ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setFilterOpen(false)} accessibilityRole="button" accessibilityLabel="Close filters">
          <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: spacing.md }} onStartShouldSetResponder={() => true} keyboardShouldPersistTaps="handled">
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
                    accessibilityRole="button"
                    accessibilityLabel={`Condition: ${t.label}${selected ? ", selected" : ""}`}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  stickyHeader: { backgroundColor: colors.surface, paddingBottom: spacing.sm },
  topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md },
  // v1.0.225 — Discover refinement. Search bar reads as a real input:
  // white surface + hairline border, no floating shadow. Chips and
  // control buttons drop shadows and gain hairline borders so they read
  // as objects, not floating pills.
  searchWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.field,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  searchWrapFlex: { flex: 1, marginHorizontal: 0, marginTop: 0, marginBottom: 0 },
  searchInput: { ...typeTokens.body, flex: 1, paddingVertical: 6 },
  // v1.0.187 — the category-chip strip was replaced by MultiCategoryDropdown;
  // its styles were removed along with the CategoryChip helper. `dropdownWrap`
  // is the horizontal padding around the dropdown block inside the sticky header.
  dropdownWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.xs },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  count: { ...typeTokens.caption, fontWeight: "600" },
  controlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  controlBtnActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  // v1.0.67 hotfix - saved-search pill uses the brand color so it doesn't
  // sit invisibly next to Sort/Filter.
  saveAlertBtn: { backgroundColor: colors.brand },
  controlText: { ...typeTokens.caption, color: colors.onSurface, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing["2xl"], maxHeight: "80%" },
  attrChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  attrChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  attrChipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  attrChipText: { ...typeTokens.caption, color: colors.onSurface, fontWeight: "700" },
  sheetTitle: { ...typeTokens.h1, fontSize: 20, lineHeight: 26, marginBottom: spacing.md },
  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  filterLabel: { ...typeTokens.micro, marginBottom: spacing.sm },
  filterInput: {
    flex: 1,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.field,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.onSurface,
  },
  // v1.0.44 — Discover shops strip.
  shopsBlock: { paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  shopsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  shopsTitle: { ...typeTokens.h3 },
  shopsSeeAll: { ...typeTokens.caption, color: colors.brand, fontWeight: "700" },
  shopsRow: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
  shopCard: { width: 92, alignItems: "center" },
  shopAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairline },
  shopAvatarPlaceholder: { alignItems: "center", justifyContent: "center" },
  shopName: { ...typeTokens.caption, fontWeight: "700", color: colors.onSurface, marginTop: spacing.xs, textAlign: "center" },
  shopMeta: { ...typeTokens.caption, fontSize: 11, marginTop: 2, textAlign: "center" },
  // v1.0.63 — recent searches strip.
  recentBlock: { paddingTop: spacing.xs, paddingBottom: spacing.sm },
  recentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  recentTitle: { ...typeTokens.micro },
  recentClear: { ...typeTokens.caption, color: colors.brand, fontWeight: "700" },
  recentRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xs },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    maxWidth: 220,
  },
  recentChipText: { ...typeTokens.caption, color: colors.onSurface, fontWeight: "600" },
});
