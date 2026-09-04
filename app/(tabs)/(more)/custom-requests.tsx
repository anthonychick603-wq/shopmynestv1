import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestCustomRequestRaw, type NestCustomRequestStatus } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ErrorState } from "@/src/components/ErrorState";
import { AppImage } from "@/src/components/AppImage";
import { useAuth } from "@/src/context/AuthContext";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { pushDetail, safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";

type RequestRole = "buyer" | "seller";

export default function CustomRequestsList() {
  useBackFallback("/(tabs)/account");
  const router = useRouter();
  const { user } = useAuth();
  const canSell = user?.is_approved_seller === true;
  const [role, setRole] = useState<RequestRole>("buyer");
  const [requests, setRequests] = useState<NestCustomRequestRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.243 — dedicated error state and load-more pagination.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (nextRole: RequestRole = role) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await nest.custom.listRequests({ role: nextRole, page: 1, per_page: 50 });
      setRequests(response.items || []);
      setPage(response.page ?? 1);
      setTotalPages(response.total_pages ?? 1);
    } catch (e) {
      setErrorMsg(e instanceof ApiError ? e.friendly : "Couldn't load custom requests.");
      setRequests([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await nest.custom.listRequests({ role, page: nextPage, per_page: 50 });
      setRequests((prev) => [...prev, ...(res.items || [])]);
      setPage(res.page ?? nextPage);
      if (res.total_pages) setTotalPages(res.total_pages);
    } catch { /* silent */ }
    finally { setLoadingMore(false); }
  }, [role, page, totalPages, loading, loadingMore]);

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  const changeRole = (nextRole: RequestRole) => {
    if (nextRole === role) return;
    haptics.tap();
    setRole(nextRole);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/account")} />
        <EmptyState icon="lock-closed-outline" title="Sign in" message="Sign in to see your custom requests." actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} testID="custom-requests-signed-out" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/account")} />
      {canSell ? (
        <View style={styles.segmented}>
          <Segment label="As Buyer" active={role === "buyer"} onPress={() => changeRole("buyer")} testID="custom-requests-buyer" />
          <Segment label="As Seller" active={role === "seller"} onPress={() => changeRole("seller")} testID="custom-requests-seller" />
        </View>
      ) : null}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : errorMsg ? (
        <ErrorState message={errorMsg} onRetry={() => { void load(); }} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListFooterComponent={loadingMore ? <View style={{ padding: spacing.lg }}><ActivityIndicator color={colors.brand} /></View> : null}
          renderItem={({ item }) => <RequestRow item={item} role={role} onPress={() => pushDetail(router, `/custom-request/${item.id}`)} />}
          ListEmptyComponent={<EmptyState icon="hammer-outline" title="No custom requests" message="Requests you send or receive appear here." testID="custom-requests-empty" />}
        />
      )}
    </SafeAreaView>
  );
}

function RequestRow({ item, role, onPress }: { item: NestCustomRequestRaw; role: RequestRole; onPress: () => void }) {
  const otherParty = role === "buyer" ? item.seller : item.buyer;
  const status = statusAppearance(item.status);
  return (
    <TouchableOpacity style={styles.row} onPress={() => { haptics.tap(); onPress(); }} testID={`custom-request-row-${item.id}`} accessibilityRole="button" accessibilityLabel={`Open custom request ${item.title}`}>
      <AppImage source={{ uri: item.product?.image_url }} style={styles.thumb} fallbackIcon="image-outline" />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title || item.product?.name || "Custom request"}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>with @{otherParty?.display_name || "seller"}</Text>
      </View>
      <View style={[styles.pill, status.container]}><Text style={[styles.pillText, status.text]}>{statusLabel(item.status)}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
    </TouchableOpacity>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Custom requests</Text>
      <View style={styles.headerActions}><AlertsBellButton /><CartHeaderButton /></View>
    </View>
  );
}

function Segment({ label, active, onPress, testID }: { label: string; active: boolean; onPress: () => void; testID: string }) {
  return <TouchableOpacity style={[styles.segment, active && styles.segmentActive]} onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected: active }}><Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text></TouchableOpacity>;
}

function statusAppearance(status: NestCustomRequestStatus) {
  if (status === "quoted" || status === "accepted") return { container: styles.statusBrand, text: styles.statusOnBrand };
  if (status === "paid") return { container: styles.statusSuccess, text: styles.statusOnBrand };
  if (status === "completed") return { container: styles.statusCompleted, text: styles.statusMuted };
  if (status === "declined" || status === "withdrawn") return { container: styles.statusMutedBg, text: styles.statusMuted };
  return { container: styles.statusNeutral, text: styles.statusNeutralText };
}

function statusLabel(status: NestCustomRequestStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.onSurface, marginLeft: spacing.md },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  segmented: { flexDirection: "row", marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  segment: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.surfaceSecondary, ...shadows.card },
  segmentText: { color: colors.onSurfaceMuted, fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: colors.onSurface },
  list: { padding: spacing.lg, paddingBottom: spacing["3xl"], flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadows.card },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "800" },
  rowMeta: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 3 },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pillText: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  statusNeutral: { backgroundColor: colors.surfaceTertiary },
  statusNeutralText: { color: colors.onSurface },
  statusBrand: { backgroundColor: colors.brand },
  statusSuccess: { backgroundColor: colors.success },
  statusCompleted: { backgroundColor: colors.surfaceTertiary, opacity: 0.72 },
  statusMutedBg: { backgroundColor: colors.surfaceTertiary },
  statusOnBrand: { color: colors.onBrand },
  statusMuted: { color: colors.onSurfaceMuted },
});
