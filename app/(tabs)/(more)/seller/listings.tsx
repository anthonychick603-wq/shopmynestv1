import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { toast } from "@/src/components/Toast";
import { decodeEntities } from "@/src/utils/html";
import { safeBack } from "@/src/utils/nav";

const PER_PAGE = 50;

export default function SellerListings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch the seller's full inventory (not a capped page) by walking pages until
  // we've collected every listing the API reports.
  const load = useCallback(async () => {
    try {
      const all: Product[] = [];
      let page = 1;
      // Guard against a missing total by stopping when a page returns nothing.
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
            setDuplicatingId(p.id);
            try {
              const raw = await nest.duplicateProduct(p.id);
              const copy = toProduct(raw);
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
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/seller/dashboard")} style={styles.topBtn} testID="listings-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>Your listings</Text>
        <View style={styles.topRight}>
          <TouchableOpacity onPress={createNew} style={styles.addBtn} testID="listings-add-new">
            <Ionicons name="add" size={18} color={colors.onBrand} />
            <Text style={styles.addBtnText}>Add New</Text>
          </TouchableOpacity>
          <CartHeaderButton />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => edit(item)} activeOpacity={0.85} testID={`listing-${item.id}`}>
              <Image source={{ uri: item.images?.[0] }} style={styles.rowImg} />
              <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{decodeEntities(item.title)}</Text>
                <Text style={styles.rowMeta}>Stock: {item.stock} · ${item.price.toFixed(2)}</Text>
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
                onPress={() => duplicate(item)}
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
            <EmptyState
              icon="cube-outline"
              title="No listings yet"
              message="Add your first product to start selling on My Nest."
              actionLabel="Add your first listing"
              onAction={createNew}
              testID="listings-empty"
            />
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
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill, backgroundColor: colors.brand, ...shadows.card },
  addBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, ...shadows.card },
  rowImg: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowMeta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  rowFavRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  rowFavText: { fontSize: 12, color: colors.brand, fontWeight: "600" },
  rowAction: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
});
