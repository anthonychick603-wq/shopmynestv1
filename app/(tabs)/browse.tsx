import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toCategory, toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Category, Product } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toast } from "@/src/components/Toast";
import { Button } from "@/src/components/Button";
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
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    nest.getCategories().then((cs) => setCategories(cs.map(toCategory))).catch(() => {});
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
    if (!user) return router.push("/(auth)/login");
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
    if (!user) return router.push("/(auth)/login");
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

  const StickyHeader = useMemo(() => (
    <View style={styles.stickyHeader}>
      <View style={styles.topRow}>
        <View style={[styles.searchWrap, styles.searchWrapFlex]}>
          <Ionicons name="search" size={18} color={colors.onSurfaceMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setSubmitted(search.trim())}
            returnKeyType="search"
            placeholder="Search handmade goods…"
            placeholderTextColor={colors.onSurfaceMuted}
            style={styles.searchInput}
            testID="browse-search-input"
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(""); setSubmitted(""); }}>
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <CartHeaderButton />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        <CategoryChip label="All" selected={!category} onPress={() => setCategory(undefined)} testID="cat-all" />
        {categories.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.name}
            selected={category === c.id}
            onPress={() => setCategory(c.id === category ? undefined : c.id)}
            testID={`cat-${c.id}`}
          />
        ))}
      </ScrollView>

      <View style={styles.controlsRow}>
        <Text style={styles.count}>{total} items</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity style={styles.controlBtn} onPress={() => setSortOpen(true)} testID="btn-sort">
            <Ionicons name="swap-vertical" size={16} color={colors.onSurface} />
            <Text style={styles.controlText}>Sort</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.controlBtn, activeFilters > 0 && styles.controlBtnActive]} onPress={() => setFilterOpen(true)} testID="btn-filter">
            <Ionicons name="options" size={16} color={activeFilters > 0 ? colors.onBrand : colors.onSurface} />
            <Text style={[styles.controlText, activeFilters > 0 && { color: colors.onBrand }]}>{activeFilters > 0 ? `Filter (${activeFilters})` : "Filter"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ), [search, category, categories, total, activeFilters]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {loading && !refreshing ? (
        <>
          {StickyHeader}
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
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
              <TouchableOpacity key={k} onPress={() => { setSort(k); setSortOpen(false); }} style={styles.sortRow} testID={`sort-${k || 'newest'}`}>
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
                    onPress={() => setCondition(selected ? undefined : t.slug)}
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
});
