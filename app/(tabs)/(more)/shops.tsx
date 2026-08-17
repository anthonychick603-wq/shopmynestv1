// v1.0.44 — Full "All shops" grid, reached from the Discover shops "See all"
// link on the Browse tab. Public read; no auth required.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, type NestSellerListItem } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { safeBack } from "@/src/utils/nav";

export default function AllShops() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shops, setShops] = useState<NestSellerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await nest.getSellers({ per_page: 100 });
      const sorted = [...(res.items || [])].sort((a, b) => (b.product_count ?? 0) - (a.product_count ?? 0));
      setShops(sorted);
    } catch {
      setError("Couldn't load shops.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)")} style={styles.topBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>All shops</Text>
        <View style={{ width: 36 }} />
      </View>
      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="Unable to load" message={error} actionLabel="Retry" onAction={load} />
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(s) => String(s.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: spacing.md, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/(tabs)/(more)/seller/${item.id}`)} testID={`shop-full-${item.id}`}>
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPh]}>
                  <Ionicons name="storefront-outline" size={28} color={colors.onSurfaceMuted} />
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>{item.store_name || item.display_name || "Shop"}</Text>
              {item.tagline ? <Text style={styles.tag} numberOfLines={2}>{item.tagline}</Text> : null}
              <Text style={styles.meta}>{item.product_count ?? 0} item{(item.product_count ?? 0) === 1 ? "" : "s"}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState icon="storefront-outline" title="No shops yet" message="Check back soon." />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  topBtn: { padding: 6 },
  topTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  card: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, alignItems: "center", ...shadows.card },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  avatarPh: { alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm, textAlign: "center" },
  tag: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 4, textAlign: "center" },
  meta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.xs, fontWeight: "700" },
});
