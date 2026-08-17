import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { safeBack } from "@/src/utils/nav";

export default function Favorites() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { addProduct } = useCart();
  const { ids, isFavorite, toggle, refresh } = useFavorites();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
      const idList = Array.from(ids);
      const products = await Promise.all(
        idList.map((id) => nest.getProduct(id).then(toProduct).catch(() => null)),
      );
      setItems(products.filter((p): p is Product => !!p));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep the visible list in sync when a heart is toggled off here.
  useEffect(() => {
    setItems((cur) => cur.filter((p) => ids.has(p.id)));
  }, [ids]);

  const onAdd = async (p: Product) => {
    try {
      const fresh = toProduct(await nest.getProduct(p.id));
      if (!fresh.in_stock) return toast.error("Out of stock");
      addProduct(fresh, 1);
      toast.success("Added to cart");
    } catch {
      toast.error("Could not add to cart");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} testID="favorites-back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={styles.topTitle}>Your favorites</Text>
        <CartHeaderButton />
      </View>
      {!user ? (
        <EmptyState icon="heart-outline" title="Sign in to see favorites" message="Save items you love and find them here." actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} testID="favorites-signed-out" />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + 40 }}
          renderItem={({ item }) => <ProductCard product={item} layout="grid" onAddToCart={() => onAdd(item)} onToggleFavorite={() => toggle(item.id)} isFavorite={isFavorite(item.id)} />}
          ListEmptyComponent={<EmptyState icon="heart-outline" title="No favorites yet" message="Tap the heart on any item to save it here." actionLabel="Browse the shop" onAction={() => router.push("/(tabs)/browse")} testID="favorites-empty" />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
});
