// v1.0.63 — Saved searches list. Backed by the-nest/v1/saved-searches.
//
// Each row shows the label (the search term, or a filter summary) and the
// toggle for "notify me". Tapping the row replays the search on Browse by
// deep-linking with the stored query as URL params. Deleting is a swipe-away
// via an inline trash icon (a Modal confirm would be overkill for this).

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestSavedSearchRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function SavedSearchesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [items, setItems] = useState<NestSavedSearchRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await nest.getSavedSearches();
      setItems(res.items || []);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.friendly);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const onToggle = async (row: NestSavedSearchRaw, next: boolean) => {
    // Optimistic — flip locally, roll back on error.
    setItems((cur) => cur.map((r) => (r.id === row.id ? { ...r, notify: next } : r)));
    try {
      await nest.updateSavedSearch(row.id, { notify: next });
    } catch (e) {
      setItems((cur) => cur.map((r) => (r.id === row.id ? { ...r, notify: !next } : r)));
      toast.error(e instanceof ApiError ? e.friendly : "Could not update");
    }
  };

  const onDelete = async (row: NestSavedSearchRaw) => {
    const prev = items;
    setItems((cur) => cur.filter((r) => r.id !== row.id));
    try {
      await nest.deleteSavedSearch(row.id);
    } catch (e) {
      setItems(prev);
      toast.error(e instanceof ApiError ? e.friendly : "Could not delete");
    }
  };

  const onOpen = (row: NestSavedSearchRaw) => {
    // Replay the search on Browse. Only pass params Browse understands; the
    // stored query is a superset (server-side pa_condition/pa_size/pa_brand
    // aren't yet plumbed as URL params on Browse, but category + text are).
    const params: Record<string, string> = {};
    if (row.query.search) params.search = row.query.search;
    if (row.query.category) params.category = String(row.query.category);
    const search = new URLSearchParams(params).toString();
    router.push(`/(tabs)/browse${search ? `?${search}` : ""}` as never);
  };

  const renderItem = ({ item }: { item: NestSavedSearchRaw }) => {
    const summary = summariseQuery(item);
    return (
      <View style={styles.row}>
        <TouchableOpacity style={styles.rowMain} onPress={() => { haptics.tap(); onOpen(item); }} testID={`saved-search-${item.id}`}>
          <Ionicons name="search-outline" size={18} color={colors.onSurfaceMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
            {summary ? <Text style={styles.summary} numberOfLines={1}>{summary}</Text> : null}
          </View>
        </TouchableOpacity>
        <Switch
          value={item.notify}
          onValueChange={(v) => onToggle(item, v)}
          trackColor={{ true: colors.brand, false: colors.border }}
          thumbColor={colors.surface}
          testID={`saved-search-toggle-${item.id}`}
        />
        <TouchableOpacity onPress={() => { haptics.warning(); onDelete(item); }} style={styles.delBtn} testID={`saved-search-delete-${item.id}`} accessibilityRole="button" accessibilityLabel={`Delete saved search ${item.label}`} hitSlop={10}>
          <Ionicons name="trash-outline" size={18} color={colors.onSurfaceMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} style={styles.topBtn} testID="saved-searches-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Saved searches</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>

      {!user ? (
        <EmptyState
          icon="notifications-circle-outline"
          title="Sign in to save searches"
          message="Get notified when new items match a search or filter you care about."
          actionLabel="Sign in"
          onAction={() => router.push("/(auth)/login")}
          testID="saved-searches-signed-out"
        />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-circle-outline"
          title="No saved searches yet"
          message="On Browse, tap Save alert on any search or filter to get a push when new items match."
          actionLabel="Go to Browse"
          onAction={() => router.push("/(tabs)/browse")}
          testID="saved-searches-empty"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100, gap: spacing.sm }}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
          testID="saved-searches-list"
        />
      )}
    </SafeAreaView>
  );
}

/**
 * Human-readable second line under the label. Skipped if the label already
 * captures everything (e.g. a plain text search with no filters).
 */
function summariseQuery(row: NestSavedSearchRaw): string {
  const q = row.query || {};
  const parts: string[] = [];
  if (q.pa_condition) parts.push(q.pa_condition);
  if (q.pa_size) parts.push(`size ${q.pa_size}`);
  if (q.pa_brand) parts.push(q.pa_brand);
  if (q.min_price || q.max_price) {
    parts.push(`$${q.min_price || "0"}–${q.max_price || "∞"}`);
  }
  return parts.join(" · ");
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface },
  topBtn: { padding: spacing.xs },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, ...shadows.card },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  label: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  summary: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  delBtn: { padding: spacing.xs, marginLeft: spacing.xs },
});
