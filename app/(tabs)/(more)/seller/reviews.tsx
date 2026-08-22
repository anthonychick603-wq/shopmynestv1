import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { ApiError, nest, type ProductReview } from "@/src/api/nest";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { decodeEntities } from "@/src/utils/html";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

const PAGE_SIZE = 20;

export default function SellerReviewsInbox() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ProductReview[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ProductReview | null>(null);

  const load = useCallback(async (next = 1) => {
    setError(null);
    try {
      const res = await nest.getSellerProductReviews({ page: next, per_page: PAGE_SIZE });
      setItems((current) => next === 1 ? res.items || [] : [...current, ...(res.items || [])]);
      setPage(next); setTotalPages(res.total_pages || 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "We couldn't load product reviews.");
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, []);
  useEffect(() => { load(1); }, [load]);

  if (loading) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <View style={styles.top}><TouchableOpacity onPress={() => safeBack(router, "/seller/dashboard")} style={styles.topBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity><Text style={styles.title}>Product reviews</Text><View style={styles.topBtn} /></View>
    {error ? <EmptyState icon="cloud-offline-outline" title="Couldn't load reviews" message={error} actionLabel="Retry" onAction={() => { setLoading(true); load(1); }} /> : <FlatList
      data={items} keyExtractor={(item) => String(item.id)}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(1)} tintColor={colors.brand} colors={[colors.brand]} />}
      renderItem={({ item }) => <ReviewRow item={item} onRespond={() => setActive(item)} />}
      ListEmptyComponent={<EmptyState icon="star-outline" title="No product reviews yet" message="New verified-purchase reviews will appear here." />}
      ListFooterComponent={page < totalPages ? <TouchableOpacity style={styles.more} disabled={loadingMore} onPress={() => { setLoadingMore(true); load(page + 1); }}>{loadingMore ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.moreText}>Load more</Text>}</TouchableOpacity> : null}
    />}
    {active ? <ResponseModal item={active} onClose={() => setActive(null)} onSaved={(updated) => { setItems((current) => current.map((item) => item.id === updated.id ? updated : item)); setActive(null); }} /> : null}
  </SafeAreaView>;
}

function ReviewRow({ item, onRespond }: { item: ProductReview; onRespond: () => void }) {
  return <View style={styles.card}>
    <Text style={styles.product}>{decodeEntities(item.product_name || "Product")}</Text>
    <Text style={styles.buyer}>{decodeEntities(item.reviewer?.display_name || "Buyer")} · <Text style={styles.stars}>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</Text></Text>
    {item.review ? <Text style={styles.review}>{decodeEntities(item.review)}</Text> : null}
    {item.seller_response ? <View style={styles.response}><Text style={styles.responseTitle}>Your response</Text><Text style={styles.responseText}>{decodeEntities(item.seller_response)}</Text></View> : <TouchableOpacity style={styles.respond} onPress={onRespond}><Text style={styles.respondText}>Respond</Text></TouchableOpacity>}
  </View>;
}

function ResponseModal({ item, onClose, onSaved }: { item: ProductReview; onClose: () => void; onSaved: (updated: ProductReview) => void }) {
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!response.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await nest.submitReviewResponse(item.product_id, item.id, response.trim());
      toast.success("Response posted"); haptics.success(); onSaved({ ...updated, product_name: item.product_name });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Couldn't post your response.");
    } finally { setSaving(false); }
  };
  return <Modal transparent animationType="fade" visible onRequestClose={onClose}><View style={styles.backdrop}><View style={styles.sheet}><View style={styles.sheetTop}><Text style={styles.sheetTitle}>Respond to review</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.onSurface} /></TouchableOpacity></View><TextInput style={styles.input} value={response} onChangeText={(value) => setResponse(value.slice(0, 2000))} multiline maxLength={2000} placeholder="Write a helpful response…" placeholderTextColor={colors.onSurfaceMuted} /><Text style={styles.counter}>{response.length}/2000</Text><Button title="Post response" onPress={submit} loading={saving} disabled={!response.trim() || saving} /></View></View></Modal>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md }, title: { color: colors.onSurface, fontSize: 17, fontWeight: "800" }, topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  card: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, marginBottom: spacing.md }, product: { color: colors.onSurface, fontWeight: "800", fontSize: 15 }, buyer: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 4 }, stars: { color: colors.brand }, review: { color: colors.onSurface, lineHeight: 21, marginTop: spacing.sm },
  respond: { alignSelf: "flex-start", marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.brand }, respondText: { color: colors.onBrand, fontWeight: "800", fontSize: 13 }, response: { marginTop: spacing.md, paddingLeft: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.brand }, responseTitle: { color: colors.onSurfaceMuted, fontWeight: "700", fontSize: 12 }, responseText: { color: colors.onSurface, lineHeight: 20, marginTop: 3 },
  more: { alignSelf: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill }, moreText: { color: colors.brand, fontWeight: "700" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }, sheet: { padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg }, sheetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }, sheetTitle: { color: colors.onSurface, fontWeight: "800", fontSize: 17 }, input: { minHeight: 120, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, textAlignVertical: "top", color: colors.onSurface }, counter: { alignSelf: "flex-end", color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.xs, marginBottom: spacing.md },
});
