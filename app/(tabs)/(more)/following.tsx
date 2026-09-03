// v1.0.93 (Build #13) — "Following" screen. Lists every shop the current
// user follows. Row tap → shop profile. Long-press or the small "Unfollow"
// chip removes the shop from the list optimistically. Reached from
// account.tsx and (when we add price-drop alerts in Build #14) from the
// alerts inbox as the "manage your shops" entry.
import React, { useCallback, useEffect, useState } from "react";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestFollowedShop } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { RatingBadge } from "@/src/components/RatingBadge";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { toast } from "@/src/components/Toast";
import { decodeEntities } from "@/src/utils/html";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";

export default function FollowingScreen() {
  useBackFallback("/(tabs)/account");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [shops, setShops] = useState<NestFollowedShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // v1.0.242 — guard against unmount + fast re-fetch races.
  const { begin, isCurrent } = useLatestRequest();

  const load = useCallback(async () => {
    const _tok = begin();
    setError(null);
    try {
      const items = await nest.getFollowing();
      if (!isCurrent(_tok)) return;
      setShops(Array.isArray(items) ? items : []);
    } catch (e) {
      if (!isCurrent(_tok)) return;
      setError(e instanceof ApiError ? e.friendly : "Couldn't load your shops.");
    } finally {
      if (isCurrent(_tok)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [begin, isCurrent]);

  useEffect(() => { load(); }, [load]);

  const onUnfollow = async (shop: NestFollowedShop) => {
    haptics.press();
    const prev = shops;
    setShops((rows) => rows.filter((r) => r.id !== shop.id));
    setBusyId(shop.id);
    try {
      await nest.unfollowSeller(shop.id);
    } catch (e) {
      setShops(prev);
      toast.error(e instanceof ApiError ? e.friendly : "Couldn't unfollow.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Following</Text>
        <AlertsBellButton />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>
      ) : (
        <FlatList
          data={shops}
          keyExtractor={(s) => String(s.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40, gap: spacing.md }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => { haptics.tap(); router.push({ pathname: "/seller/[id]", params: { id: String(item.id) } }); }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.store_name || "shop"}`}
            >
              {item.avatar ? (
                <AppImage source={{ uri: item.avatar }} style={styles.avatar} fallbackIcon="storefront-outline" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="leaf" size={22} color={colors.brand} /></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{decodeEntities(item.store_name || "Shop")}</Text>
                <View style={{ marginTop: 2 }}>
                  <RatingBadge rating={item.rating} reviewCount={item.review_count} size="sm" showEmpty />
                </View>
                <Text style={styles.meta}>{item.product_count ?? 0} items · {item.follower_count ?? 0} followers</Text>
              </View>
              <TouchableOpacity
                style={styles.unfollowChip}
                onPress={() => onUnfollow(item)}
                disabled={busyId === item.id}
                testID={`unfollow-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Unfollow ${item.store_name || "shop"}`}
                hitSlop={8}
              >
                <Text style={styles.unfollowText}>{busyId === item.id ? "…" : "Unfollow"}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title="You aren't following any shops yet"
              message="Tap Follow on any shop to keep new listings and updates in one place."
              testID="following-empty"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surfaceSecondary },
  topBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  topTitle: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  errorText: { color: colors.error, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadows.card },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  meta: { marginTop: 2, color: colors.onSurfaceMuted, fontSize: 12 },
  unfollowChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  unfollowText: { color: colors.brand, fontWeight: "700", fontSize: 12 },
});
