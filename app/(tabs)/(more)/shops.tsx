// v1.0.44 — Full "All shops" grid, reached from the Discover shops "See all"
// link on the Browse tab. Public read; no auth required.
// v1.0.83 — added a search bar. Empty query loads the full seller directory
// (paginated); non-empty query hits the server's ?search= param so shoppers
// can find a shop by store name / display name.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, type NestSellerListItem } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { RatingBadge } from "@/src/components/RatingBadge";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { shareSeller } from "@/src/utils/share";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";

export default function AllShops() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shops, setShops] = useState<NestSellerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  // Empty query → walk pages until we've pulled the entire directory.
  // Non-empty → first page of server-filtered results (typically small).
  const load = useCallback(async (search: string) => {
    setError(null);
    try {
      const first = await nest.getSellers({ per_page: 100, page: 1, search: search || undefined });
      const collected: NestSellerListItem[] = [...(first.items || [])];
      if (!search) {
        const totalPages = Math.max(1, first.total_pages ?? 1);
        for (let p = 2; p <= totalPages; p++) {
          try {
            const next = await nest.getSellers({ per_page: 100, page: p });
            collected.push(...(next.items || []));
          } catch {
            break;
          }
        }
      }
      const sorted = collected.sort((a, b) => (b.product_count ?? 0) - (a.product_count ?? 0));
      setShops(sorted);
    } catch {
      setError("Couldn't load shops.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(submitted); }, [load, submitted]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)"); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>All shops</Text>
        <AlertsBellButton />
      </View>
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.onSurfaceMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => { haptics.tap(); setSubmitted(query.trim()); }}
            returnKeyType="search"
            placeholder="Search shops"
            placeholderTextColor={colors.onSurfaceMuted}
            autoCorrect={false}
            autoCapitalize="none"
            testID="shops-search-input"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              onPress={() => { haptics.tap(); setQuery(""); setSubmitted(""); }}
              hitSlop={8}
              testID="shops-search-clear"
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {loading && !refreshing ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="Unable to load" message={error} actionLabel="Retry" onAction={() => load(submitted)} />
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(s) => String(s.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: spacing.md, gap: spacing.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(submitted); }} tintColor={colors.brand} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => { haptics.tap(); router.push(`/(tabs)/(more)/seller/${item.id}`); }} testID={`shop-full-${item.id}`}>
              {/* v1.0.56 - share icon in the corner opens the share sheet with
                  the shop's tagline + public shop URL. Stops propagation so
                  tapping it doesn't also navigate into the shop. */}
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); haptics.tap(); shareSeller({ id: item.id, store_name: item.store_name || item.display_name, tagline: item.tagline, shop_url: item.shop_url }); }}
                hitSlop={8}
                style={styles.shareBtn}
                testID={`shop-share-${item.id}`}
                accessibilityLabel={`Share ${item.store_name || item.display_name || "shop"}`}
                accessibilityRole="button"
              >
                <Ionicons name="share-outline" size={16} color={colors.onSurface} />
              </TouchableOpacity>
              {item.avatar ? (
                <AppImage source={{ uri: item.avatar }} style={styles.avatar} fallbackIcon="storefront-outline" />
              ) : (
                <View style={[styles.avatar, styles.avatarPh]}>
                  <Ionicons name="storefront-outline" size={28} color={colors.onSurfaceMuted} />
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>{item.store_name || item.display_name || "Shop"}</Text>
              {item.tagline ? <Text style={styles.tag} numberOfLines={2}>{item.tagline}</Text> : null}
              <View style={{ marginTop: 4 }}>
                <RatingBadge rating={item.rating} reviewCount={item.review_count} size="sm" />
              </View>
              <Text style={styles.meta}>{item.product_count ?? 0} item{(item.product_count ?? 0) === 1 ? "" : "s"}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            submitted
              ? <EmptyState icon="search-outline" title="No matches" message={`No shops match "${submitted}".`} actionLabel="Clear search" onAction={() => { setQuery(""); setSubmitted(""); }} />
              : <EmptyState icon="storefront-outline" title="No shops yet" message="Check back soon." />
          }
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
  searchWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.surface },
  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 14, color: colors.onSurface, paddingVertical: 4 },
  card: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, alignItems: "center", ...shadows.card },
  shareBtn: { position: "absolute", top: spacing.sm, right: spacing.sm, width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  avatarPh: { alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm, textAlign: "center" },
  tag: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 4, textAlign: "center" },
  meta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.xs, fontWeight: "700" },
});
