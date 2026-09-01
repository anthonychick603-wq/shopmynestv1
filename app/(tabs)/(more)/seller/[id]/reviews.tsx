import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, type NestSellerReviewRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { RatingBadge } from "@/src/components/RatingBadge";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { decodeEntities } from "@/src/utils/html";
import { parseServerDate } from "@/src/utils/datetime";

const PAGE_SIZE = 20;

export default function PublicSellerReviewsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<NestSellerReviewRaw[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [average, setAverage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadPage = useCallback(async (nextPage: number) => {
    const res = await nest.getSellerReviews(id!, { page: nextPage, per_page: PAGE_SIZE })
      .catch(() => ({ items: [], total: 0, average: 0, page: nextPage, total_pages: 0 }));
    setTotalPages(res.total_pages || 1);
    setTotal(res.total || 0);
    setAverage(res.average || 0);
    setItems((previous) => nextPage === 1 ? res.items || [] : [...previous, ...(res.items || [])]);
    setPage(nextPage);
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadPage(1);
      setLoading(false);
    })();
  }, [loadPage]);

  const onEnd = useCallback(async () => {
    if (loadingMore || loading || page >= totalPages) return;
    setLoadingMore(true);
    await loadPage(page + 1);
    setLoadingMore(false);
  }, [loadPage, page, totalPages, loading, loadingMore]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, `/seller/${id}`); }} style={styles.topBtn} testID="reviews-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{decodeEntities(name || "Reviews")}</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.brand} /></View> : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadPage(1); setRefreshing(false); }} tintColor={colors.brand} colors={[colors.brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={onEnd}
          ListHeaderComponent={<View style={styles.summary}><Text style={styles.summaryTitle}>Shop rating</Text><RatingBadge rating={average} reviewCount={total} size="lg" showEmpty /></View>}
          renderItem={({ item }) => <ReviewRow row={item} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.brand} /> : null}
          ListEmptyComponent={<EmptyState icon="star-outline" title="No reviews yet" message="Buyers can leave a review after their order is completed." testID="reviews-empty" />}
        />
      )}
    </SafeAreaView>
  );
}

function ReviewRow({ row }: { row: NestSellerReviewRaw }) {
  const stars = Math.max(1, Math.min(5, row.rating || 0));
  const when = parseServerDate(row.created_at)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) || "";
  return (
    <View style={reviewStyles.card}>
      <View style={reviewStyles.headerRow}>
        {row.reviewer?.avatar ? <AppImage source={{ uri: row.reviewer.avatar }} style={reviewStyles.avatar} fallbackIcon="person-outline" /> : <View style={[reviewStyles.avatar, reviewStyles.avatarFallback]}><Ionicons name="person" size={18} color={colors.onSurfaceMuted} /></View>}
        <View style={{ flex: 1 }}>
          <Text style={reviewStyles.reviewer} numberOfLines={1}>{decodeEntities(row.reviewer?.display_name || "Anonymous")}</Text>
          <View style={reviewStyles.starsRow}>{[1, 2, 3, 4, 5].map((number) => <Ionicons key={number} name={number <= stars ? "star" : "star-outline"} size={14} color={colors.brand} />)}{when ? <Text style={reviewStyles.when}>{when}</Text> : null}</View>
        </View>
      </View>
      {row.review ? <Text style={reviewStyles.body}>{decodeEntities(row.review)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, flex: 1, textAlign: "center" },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  summary: { paddingVertical: spacing.md, marginBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.xs },
  summaryTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
});

const reviewStyles = StyleSheet.create({
  card: { padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  reviewer: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  when: { fontSize: 12, color: colors.onSurfaceMuted, marginLeft: spacing.sm },
  body: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
});
