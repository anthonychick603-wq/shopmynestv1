// v1.0.144 — dedicated screen listing every out-of-stock product the seller
// owns. Reached from the "Out of stock (N)" link that appears in the seller
// dashboard's "Your products" section header whenever there is at least one
// affected item. The list stays scoped to the current seller by using the
// same /seller/products endpoint the dashboard uses; we simply filter to
// `!in_stock || stock <= 0` locally so the plugin does not need a new query
// param.
//
// Actions on each row mirror the dashboard's product row: edit (jumps to
// the seller product form so the seller can raise the stock count) and
// delete (soft-guarded confirm). We intentionally omit the boost action
// here — boosting an out-of-stock item would waste ad spend on a listing
// that can't be purchased.
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { pushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function SellerOutOfStockScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await nest.getMyProducts({ per_page: 200 });
      const all = (res.items || []).map(toProduct);
      // Match the dashboard's OOS predicate exactly so the count you see on
      // the dashboard link matches the count on this screen.
      setItems(all.filter((p) => !p.in_stock || p.stock <= 0));
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't load your products.";
      Alert.alert("Something went wrong", msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const confirmDelete = (p: Product) => {
    Alert.alert(
      "Delete listing?",
      `"${p.title}" will be removed from your shop. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await nest.deleteProduct(p.id);
              setItems((cur) => cur.filter((x) => x.id !== p.id));
              haptics.success();
            } catch (e) {
              const msg = e instanceof ApiError ? e.message : "Couldn't delete this listing.";
              Alert.alert("Something went wrong", msg);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Out of stock</Text>
        <View style={styles.topRight}>
          <AlertsBellButton />
          <CartHeaderButton />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            icon="checkmark-circle"
            title="You're fully stocked"
            message="Every listing in your shop has stock available. Great work."
          />
        ) : (
          <>
            <Text style={styles.leadIn}>
              {items.length === 1
                ? "1 listing is out of stock. Restock it or delete it to keep your shop tidy."
                : `${items.length} listings are out of stock. Restock them or delete listings you no longer sell.`}
            </Text>
            {items.map((p) => (
              <View key={p.id} style={styles.row}>
                <View>
                  <Image
                    source={p.images?.[0] ?? undefined}
                    style={styles.thumb}
                    contentFit="cover"
                    transition={150}
                    cachePolicy="memory-disk"
                    recyclingKey={String(p.id)}
                  />
                  <View style={styles.oosPill}>
                    <Text style={styles.oosPillText}>OOS</Text>
                  </View>
                </View>
                <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                  <Text style={styles.title} numberOfLines={2}>{p.title}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaOos}>Out of stock</Text>
                    <Text style={styles.metaDot}> · </Text>
                    <Text style={styles.meta}>${p.price.toFixed(2)}</Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      haptics.tap();
                      pushFromTab(router, `/seller/product-form?id=${p.id}`);
                    }}
                    testID={`oos-edit-${p.id}`}
                    accessibilityLabel={`Restock ${p.title}`}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.onSurface} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => confirmDelete(p)}
                    testID={`oos-delete-${p.id}`}
                    accessibilityLabel={`Delete ${p.title}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  iconBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  centered: { alignItems: "center", justifyContent: "center", paddingVertical: spacing["3xl"] },
  leadIn: { color: colors.onSurfaceMuted, fontSize: 13, marginBottom: spacing.md, lineHeight: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  oosPill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.error,
    paddingVertical: 2,
    alignItems: "center",
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  oosPillText: { color: colors.onBrand, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  title: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  meta: { fontSize: 12, color: colors.onSurfaceMuted },
  metaDot: { fontSize: 12, color: colors.onSurfaceMuted },
  metaOos: { fontSize: 12, color: colors.error, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
});
