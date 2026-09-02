import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ApiError, nest, type ProductReview } from "@/src/api/nest";
import { AppImage } from "@/src/components/AppImage";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { decodeEntities } from "@/src/utils/html";
import { parseServerDate } from "@/src/utils/datetime";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

const PAGE_SIZE = 20;

export default function ProductReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ProductReview[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [average, setAverage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ photos: string[]; index: number } | null>(null);

  const load = useCallback(async (nextPage = 1) => {
    setError(null);
    try {
      const res = await nest.getProductReviews(id, { page: nextPage, per_page: PAGE_SIZE });
      setItems((previous) => nextPage === 1 ? res.items || [] : [...previous, ...(res.items || [])]);
      setPage(nextPage); setTotal(res.total || 0); setAverage(res.average || 0); setTotalPages(res.total_pages || 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "We couldn't load reviews.");
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [id]);
  useEffect(() => { load(1); }, [load]);

  const onMore = () => {
    if (loadingMore || loading || page >= totalPages) return;
    setLoadingMore(true); load(page + 1);
  };
  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  if (error) return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, `/product/${id}`)} /><EmptyState icon="cloud-offline-outline" title="Couldn't load reviews" message={error} actionLabel="Retry" onAction={() => { setLoading(true); load(1); }} /></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <Top onBack={() => safeBack(router, `/product/${id}`)} />
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(1)} tintColor={colors.brand} colors={[colors.brand]} />}
      ListHeaderComponent={<View style={styles.summary}><Text style={styles.summaryStars}>★ {average.toFixed(1)}</Text><Text style={styles.summaryText}>{total} {total === 1 ? "review" : "reviews"}</Text></View>}
      renderItem={({ item }) => <ReviewCard item={item} onPhoto={(photos, index) => setViewer({ photos, index })} />}
      ListEmptyComponent={<EmptyState icon="star-outline" title="No reviews yet" message="Verified buyers can review this product after their order is completed." />}
      ListFooterComponent={page < totalPages ? <TouchableOpacity style={styles.more} onPress={onMore} disabled={loadingMore} accessibilityRole="button">{loadingMore ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.moreText}>Load more</Text>}</TouchableOpacity> : null}
    />
    <PhotoViewer viewer={viewer} onClose={() => setViewer(null)} onChange={(index) => viewer && setViewer({ ...viewer, index })} />
  </SafeAreaView>;
}

function Top({ onBack }: { onBack: () => void }) {
  return <View style={styles.top}><TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity><Text style={styles.topTitle}>Product reviews</Text><View style={styles.topBtn} /></View>;
}

function ReviewCard({ item, onPhoto }: { item: ProductReview; onPhoto: (photos: string[], index: number) => void }) {
  const date = parseServerDate(item.created_at)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) || "";
  return <View style={styles.card}>
    <View style={styles.row}>
      {item.reviewer?.avatar ? <AppImage source={{ uri: item.reviewer.avatar }} style={styles.avatar} fallbackIcon="person-outline" /> : <View style={styles.avatar} />}
      <View style={{ flex: 1 }}><Text style={styles.name}>{decodeEntities(item.reviewer?.display_name || "Buyer")}</Text><View style={styles.row}><Text style={styles.stars}>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</Text><Text style={styles.date}>{date}</Text></View></View>
    </View>
    <View style={styles.verified}><Ionicons name="checkmark-circle" size={14} color={colors.success} /><Text style={styles.verifiedText}>Verified purchase</Text></View>
    {item.variation_id ? <Text style={styles.variation}>{decodeEntities(item.variation_name || "Purchased variation")}</Text> : null}
    {item.review ? <Text style={styles.body}>{decodeEntities(item.review)}</Text> : null}
    {item.photos?.length ? <View style={styles.photoRow}>{item.photos.map((photo, index) => <TouchableOpacity key={`${photo}-${index}`} onPress={() => onPhoto(item.photos, index)} accessibilityRole="button"><Image source={{ uri: photo }} style={styles.thumbnail} /></TouchableOpacity>)}</View> : null}
    {item.seller_response ? <View style={styles.response}><Text style={styles.responseTitle}>Seller response</Text><Text style={styles.responseBody}>{decodeEntities(item.seller_response)}</Text></View> : null}
  </View>;
}

function PhotoViewer({ viewer, onClose, onChange }: { viewer: { photos: string[]; index: number } | null; onClose: () => void; onChange: (index: number) => void }) {
  return <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={onClose}><Pressable style={styles.viewer} onPress={onClose}>{viewer ? <><Image source={{ uri: viewer.photos[viewer.index] }} style={styles.viewerImage} resizeMode="contain" /><TouchableOpacity style={styles.close} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={24} color={colors.onBrand} /></TouchableOpacity>{viewer.index > 0 ? <TouchableOpacity style={[styles.nav, { left: spacing.md }]} onPress={() => onChange(viewer.index - 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={28} color={colors.onBrand} /></TouchableOpacity> : null}{viewer.index < viewer.photos.length - 1 ? <TouchableOpacity style={[styles.nav, { right: spacing.md }]} onPress={() => onChange(viewer.index + 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Open"><Ionicons name="chevron-forward" size={28} color={colors.onBrand} /></TouchableOpacity> : null}</> : null}</Pressable></Modal>;
}

// v1.0.227 — Reviews list refinement. Cards become white on cream
// with hairline structure; seller response reads as a nested surface
// tinted with the brand; summary uses the price token for the score.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  topTitle: { ...typeTokens.h2, fontSize: 17 },
  topBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  summary: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm, paddingBottom: spacing.lg },
  summaryStars: { ...typeTokens.price, fontSize: 27, color: colors.brand },
  summaryText: { ...typeTokens.body, color: colors.onSurfaceMuted },
  card: {
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceTertiary },
  name: { ...typeTokens.body, fontWeight: "700" },
  stars: { color: colors.brand, fontSize: 15 },
  date: { ...typeTokens.caption },
  verified: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  verifiedText: { ...typeTokens.caption, color: colors.success, fontWeight: "700" },
  variation: { ...typeTokens.caption, marginTop: spacing.sm },
  body: { ...typeTokens.body, color: colors.onSurface, lineHeight: 21, marginTop: spacing.sm },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  thumbnail: { width: 74, height: 74, borderRadius: radius.field, backgroundColor: colors.surfaceTertiary },
  response: {
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.sm,
    marginTop: spacing.md,
    borderRadius: radius.field,
  },
  responseTitle: { ...typeTokens.caption, fontWeight: "800", color: colors.onSurface, marginBottom: 3 },
  responseBody: { ...typeTokens.body, color: colors.onSurface, lineHeight: 19 },
  more: {
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
  },
  moreText: { ...typeTokens.body, fontWeight: "700", color: colors.brand },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
  close: { position: "absolute", top: 52, right: spacing.lg, width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  nav: { position: "absolute", top: "48%", width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 23, backgroundColor: "rgba(255,255,255,0.16)" },
});
