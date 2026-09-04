// v1.0.63 — Saved searches list. Backed by the-nest/v1/saved-searches.
//
// Each row shows the label (the search term, or a filter summary) and the
// toggle for "notify me". Tapping the row replays the search on Browse by
// deep-linking with the stored query as URL params. Deleting is a swipe-away
// via an inline trash icon (a Modal confirm would be overkill for this).

import React, { useCallback, useEffect, useState } from "react";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestSavedSearchRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ErrorState } from "@/src/components/ErrorState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";

export default function SavedSearchesScreen() {
  useBackFallback("/(tabs)/account");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [items, setItems] = useState<NestSavedSearchRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.243 — dedicated error state (retryable) so failed loads aren't
  // disguised as "No saved searches yet." Plus per-row pending set to lock
  // toggle/delete against each other and stop stale-snapshot rollbacks
  // from restoring a search the buyer just deleted.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(() => new Set());
  const setBusy = React.useCallback((id: number, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  // v1.0.242 — gate post-await state with useLatestRequest.
  const { begin, isCurrent } = useLatestRequest();

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const _tok = begin();
    setErrorMsg(null);
    try {
      const res = await nest.getSavedSearches();
      if (!isCurrent(_tok)) return;
      setItems(res.items || []);
    } catch (e) {
      if (!isCurrent(_tok)) return;
      setErrorMsg(e instanceof ApiError ? e.friendly : "Couldn't load your saved searches.");
    } finally {
      if (isCurrent(_tok)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user, begin, isCurrent]);

  useEffect(() => { load(); }, [load]);

  const onToggle = async (row: NestSavedSearchRaw, next: boolean) => {
    // v1.0.243 — per-row lock + rollback-by-id. Fixes the P1 where a stale
    // rollback could restore a row that had already been deleted, or where
    // rapid toggles could leave the notify state out of sync.
    if (busyIds.has(row.id)) return;
    setBusy(row.id, true);
    setItems((cur) => cur.map((r) => (r.id === row.id ? { ...r, notify: next } : r)));
    try {
      await nest.updateSavedSearch(row.id, { notify: next });
    } catch (e) {
      setItems((cur) => cur.map((r) => (r.id === row.id ? { ...r, notify: !next } : r)));
      toast.error(e instanceof ApiError ? e.friendly : "Could not update");
    } finally {
      setBusy(row.id, false);
    }
  };

  const onDelete = async (row: NestSavedSearchRaw) => {
    if (busyIds.has(row.id)) return;
    setBusy(row.id, true);
    // v1.0.243 — capture only this row and its original position; roll
    // back against the *latest* list by id instead of restoring a whole
    // snapshot that could resurrect a concurrently-modified row.
    let restoreIndex = -1;
    setItems((cur) => {
      restoreIndex = cur.findIndex((r) => r.id === row.id);
      return cur.filter((r) => r.id !== row.id);
    });
    try {
      await nest.deleteSavedSearch(row.id);
    } catch (e) {
      setItems((current) => {
        if (current.some((r) => r.id === row.id)) return current;
        const idx = restoreIndex >= 0 && restoreIndex <= current.length ? restoreIndex : current.length;
        const next = current.slice();
        next.splice(idx, 0, row);
        return next;
      });
      toast.error(e instanceof ApiError ? e.friendly : "Could not delete");
    } finally {
      setBusy(row.id, false);
    }
  };

  const onOpen = (row: NestSavedSearchRaw) => {
    // v1.0.243 — hydrate the full saved-search contract onto Browse, not
    // just search+category. Pairs with browse.tsx accepting sort, price
    // range, condition/size/brand as deep-link params.
    const params: Record<string, string> = {};
    const q = row.query || {};
    if (q.search) params.search = q.search;
    if (q.category) params.category = String(q.category);
    if (q.sort) params.sort = q.sort;
    if (q.min_price) params.min_price = q.min_price;
    if (q.max_price) params.max_price = q.max_price;
    if (q.pa_condition) params.pa_condition = q.pa_condition;
    if (q.pa_size) params.pa_size = q.pa_size;
    if (q.pa_brand) params.pa_brand = q.pa_brand;
    const search = new URLSearchParams(params).toString();
    router.push(`/(tabs)/browse${search ? `?${search}` : ""}` as never);
  };

  const renderItem = ({ item }: { item: NestSavedSearchRaw }) => {
    const summary = summariseQuery(item);
    return (
      <View style={styles.row}>
        <TouchableOpacity style={styles.rowMain} onPress={() => { haptics.tap(); onOpen(item); }} testID={`saved-search-${item.id}`} accessibilityRole="button">
          <Ionicons name="search-outline" size={18} color={colors.onSurfaceMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
            {summary ? <Text style={styles.summary} numberOfLines={1}>{summary}</Text> : null}
          </View>
        </TouchableOpacity>
        <Switch
          value={item.notify}
          onValueChange={(v) => onToggle(item, v)}
          disabled={busyIds.has(item.id)}
          trackColor={{ true: colors.brand, false: colors.border }}
          thumbColor={colors.surface}
          testID={`saved-search-toggle-${item.id}`}
        />
        <TouchableOpacity
          onPress={() => { haptics.warning(); onDelete(item); }}
          disabled={busyIds.has(item.id)}
          style={[styles.delBtn, busyIds.has(item.id) && { opacity: 0.5 }]}
          testID={`saved-search-delete-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Delete saved search ${item.label}`}
          hitSlop={10}
        >
          <Ionicons name="trash-outline" size={18} color={colors.onSurfaceMuted} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} style={styles.topBtn} testID="saved-searches-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
      ) : errorMsg ? (
        <ErrorState message={errorMsg} onRetry={() => { setLoading(true); load(); }} />
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
