// v1.0.215 (P0 #9) — server-backed search dropdown for the Browse tab.
//
// On focus:
//   - Shows the buyer's Recent searches (server-synced when signed-in;
//     local-only otherwise) and the marketplace's Trending queries.
// While typing (q ≥ 2, debounced ~220ms):
//   - Replaces the two lists with three suggestion sections — Products,
//     Categories, Shops — plus a "Search for '<q>'" footer so submit is
//     always one tap away.
//
// Every terminal tap runs a callback provided by the parent so the parent
// screen keeps ownership of routing (PDP for products, filtered browse for
// categories, shop page for shops, and full search for typed terms).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { nest, ApiError, type NestSearchSuggestRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { AppImage } from "@/src/components/AppImage";

// Match the inline formatting other simple product rows use (e.g. cart
// line items) — no currency-aware util is available yet.
const formatPrice = (n: number): string => `$${Number(n || 0).toFixed(2)}`;

export type SearchSuggestOverlayProps = {
  // Current input value. Determines "typing" vs "focus-only" mode.
  query: string;
  // Server-synced recent list (already resolved by the parent). Parent
  // decides whether to fetch from the server or fall back to local storage
  // so this overlay stays UI-only.
  recent: string[];
  // Called when the buyer clears their recent history from the overlay.
  onClearRecent: () => void;
  // Called when a chip/row is tapped that should run a full search on
  // that term (recent chip, trending chip, "Search for <q>" footer).
  onPickTerm: (term: string) => void;
  // Called when a product suggestion is tapped.
  onPickProduct: (id: number) => void;
  // Called when a category suggestion is tapped.
  onPickCategory: (id: number, name: string) => void;
  // Called when a shop suggestion is tapped.
  onPickShop: (id: number) => void;
};

const EMPTY_SUGGEST: NestSearchSuggestRaw = { q: "", products: [], categories: [], shops: [] };

export function SearchSuggestOverlay(props: SearchSuggestOverlayProps): React.ReactElement {
  const { query, recent, onClearRecent, onPickTerm, onPickProduct, onPickCategory, onPickShop } = props;

  const trimmed = query.trim();
  const isTyping = trimmed.length >= 2;

  const [trending, setTrending] = useState<string[]>([]);
  const [suggest, setSuggest] = useState<NestSearchSuggestRaw>(EMPTY_SUGGEST);
  const [loading, setLoading] = useState(false);

  // v1.0.215 — trending fetched once on mount. Fails silently — the block
  // just doesn't render if the server returns no rows (fresh install) or
  // errors, so an empty log doesn't break the dropdown.
  useEffect(() => {
    let alive = true;
    nest
      .searchTrending()
      .then((res) => {
        if (!alive) return;
        setTrending(
          (res.terms || [])
            .map((t) => (typeof t.term === "string" ? t.term.trim() : ""))
            .filter((t): t is string => !!t),
        );
      })
      .catch(() => { if (alive) setTrending([]); });
    return () => { alive = false; };
  }, []);

  // v1.0.215 — suggest fetched per keystroke behind a 220ms debounce.
  // Requests are versioned so an older response can't overwrite a newer
  // one (fixes the classic "flicker back to stale" bug on slow networks).
  const reqSeq = useRef(0);
  useEffect(() => {
    if (!isTyping) {
      setSuggest({ q: trimmed, products: [], categories: [], shops: [] });
      setLoading(false);
      return;
    }
    const mySeq = ++reqSeq.current;
    setLoading(true);
    const timer = setTimeout(() => {
      nest
        .searchSuggest(trimmed)
        .then((res) => {
          if (reqSeq.current !== mySeq) return;
          setSuggest(res);
        })
        .catch((e) => {
          if (reqSeq.current !== mySeq) return;
          // Treat any error as "no suggestions" — the parent still has the
          // typed term so the "Search for <q>" footer will submit.
          if (!(e instanceof ApiError)) {
            // Log unexpected errors in dev builds only.
            if (__DEV__) console.warn("[search] suggest failed", e);
          }
          setSuggest({ q: trimmed, products: [], categories: [], shops: [] });
        })
        .finally(() => {
          if (reqSeq.current === mySeq) setLoading(false);
        });
    }, 220);
    return () => { clearTimeout(timer); };
  }, [trimmed, isTyping]);

  const hasAnySuggest = useMemo(
    () =>
      isTyping &&
      (suggest.products.length > 0 || suggest.categories.length > 0 || suggest.shops.length > 0),
    [isTyping, suggest.products.length, suggest.categories.length, suggest.shops.length],
  );

  const renderChip = useCallback((label: string, icon: keyof typeof Ionicons.glyphMap, key: string) => (
    <TouchableOpacity
      key={key}
      style={styles.chip}
      accessibilityRole="button"
      accessibilityLabel={`Search for ${label}`}
      onPress={() => onPickTerm(label)}
      testID={`suggest-chip-${key}`}
    >
      <Ionicons name={icon} size={14} color={colors.onSurfaceMuted} />
      <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  ), [onPickTerm]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {isTyping ? (
          <>
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text style={styles.loadingText}>Searching…</Text>
              </View>
            ) : null}

            {suggest.products.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Products</Text>
                {suggest.products.map((p) => (
                  <TouchableOpacity
                    key={`p-${p.id}`}
                    style={styles.productRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${p.title}`}
                    onPress={() => onPickProduct(p.id)}
                    testID={`suggest-product-${p.id}`}
                  >
                    {p.image ? (
                      <AppImage source={{ uri: p.image }} style={styles.productImage} fallbackIcon="image-outline" />
                    ) : (
                      <View style={[styles.productImage, styles.productImageEmpty]}>
                        <Ionicons name="image-outline" size={18} color={colors.onSurfaceMuted} />
                      </View>
                    )}
                    <View style={styles.productBody}>
                      <Text style={styles.productTitle} numberOfLines={2}>{p.title}</Text>
                      {p.price > 0 ? <Text style={styles.productPrice}>{formatPrice(p.price)}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {suggest.categories.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Categories</Text>
                {suggest.categories.map((c) => (
                  <TouchableOpacity
                    key={`c-${c.id}`}
                    style={styles.simpleRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Browse ${c.name}`}
                    onPress={() => onPickCategory(c.id, c.name)}
                    testID={`suggest-category-${c.id}`}
                  >
                    <View style={styles.simpleIconWrap}>
                      <Ionicons name="pricetags-outline" size={18} color={colors.brand} />
                    </View>
                    <View style={styles.simpleBody}>
                      <Text style={styles.simpleTitle} numberOfLines={1}>{c.name}</Text>
                      <Text style={styles.simpleMeta} numberOfLines={1}>{c.count} item{c.count === 1 ? "" : "s"}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {suggest.shops.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Shops</Text>
                {suggest.shops.map((s) => (
                  <TouchableOpacity
                    key={`s-${s.id}`}
                    style={styles.simpleRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Open shop ${s.name}`}
                    onPress={() => onPickShop(s.id)}
                    testID={`suggest-shop-${s.id}`}
                  >
                    {s.logo ? (
                      <AppImage source={{ uri: s.logo }} style={styles.shopAvatar} fallbackIcon="storefront-outline" />
                    ) : (
                      <View style={[styles.shopAvatar, styles.simpleIconWrap]}>
                        <Ionicons name="storefront-outline" size={18} color={colors.brand} />
                      </View>
                    )}
                    <View style={styles.simpleBody}>
                      <Text style={styles.simpleTitle} numberOfLines={1}>{s.name || "Shop"}</Text>
                      <Text style={styles.simpleMeta} numberOfLines={1}>Shop</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {!loading && !hasAnySuggest ? (
              <Text style={styles.emptyText}>No suggestions. Tap below to search.</Text>
            ) : null}

            {/* Footer: always-available "search for what I typed" — useful
                when suggestions miss the term the buyer actually wants. */}
            <TouchableOpacity
              style={styles.footerRow}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${trimmed}`}
              onPress={() => onPickTerm(trimmed)}
              testID="suggest-search-footer"
            >
              <Ionicons name="search" size={16} color={colors.onBrand} />
              <Text style={styles.footerText} numberOfLines={1}>Search for “{trimmed}”</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {recent.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent</Text>
                  <TouchableOpacity onPress={onClearRecent} accessibilityRole="button" accessibilityLabel="Clear recent searches" testID="suggest-clear-recent">
                    <Text style={styles.clearLink}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.chipRow}>
                  {recent.map((t) => renderChip(t, "time-outline", `r-${t}`))}
                </View>
              </View>
            ) : null}

            {trending.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Trending</Text>
                <View style={styles.chipRow}>
                  {trending.map((t) => renderChip(t, "trending-up-outline", `t-${t}`))}
                </View>
              </View>
            ) : null}

            {recent.length === 0 && trending.length === 0 ? (
              <Text style={styles.emptyText}>Start typing to search products, categories, and shops.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    maxHeight: 480,
    overflow: "hidden",
    ...shadows.card,
  },
  content: { paddingVertical: spacing.sm },
  section: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: spacing.xs },
  clearLink: { fontSize: 13, color: colors.brand, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, maxWidth: 220 },
  chipText: { fontSize: 13, color: colors.onSurface, fontWeight: "600" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  loadingText: { color: colors.onSurfaceMuted, fontSize: 13 },
  productRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  productImage: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceSecondary },
  productImageEmpty: { alignItems: "center", justifyContent: "center" },
  productBody: { flex: 1 },
  productTitle: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  productPrice: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  simpleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  simpleIconWrap: { width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  shopAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary },
  simpleBody: { flex: 1 },
  simpleTitle: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  simpleMeta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  emptyText: { fontSize: 13, color: colors.onSurfaceMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: colors.brand },
  footerText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
});
