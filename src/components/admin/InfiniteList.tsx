// v1.0.192 — Reusable infinite-scroll wrapper on top of FlatList. Every
// admin list paginates server-side; before this component each screen
// re-implemented the loadMore / onEndReached / hasMore logic slightly
// differently. InfiniteList takes a fetcher `(page) => Promise<{ items,
// total_pages }>` and handles the rest: initial load, refresh, load-more
// footer spinner, hard error state, and empty state.
//
// Deliberately not a hook — screens usually need to render header UI,
// filter bars, and the list together, and doing that with a hook would
// mean threading props down manually. Passing the fetcher into a
// component keeps the API tight.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View, type ListRenderItem } from "react-native";

import { ApiError } from "@/src/api/nest";
import { EmptyState } from "@/src/components/EmptyState";
import { AdminListSkeleton } from "@/src/components/admin/AdminSkeleton";
import { colors, spacing } from "@/src/theme";

export type InfinitePage<T> = { items: T[]; total_pages: number; total?: number };
export type InfiniteFetcher<T> = (page: number) => Promise<InfinitePage<T>>;

export function InfiniteList<T>({
  fetcher,
  renderItem,
  keyExtractor,
  emptyIcon = "checkmark-circle-outline",
  emptyTitle = "Nothing here yet",
  emptyMessage,
  headerComponent,
  reloadToken,
  contentContainerStyle,
  testID = "admin-infinite-list",
  onLoaded,
  ListEmptyOverride,
}: {
  fetcher: InfiniteFetcher<T>;
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  emptyIcon?: React.ComponentProps<typeof EmptyState>["icon"];
  emptyTitle?: string;
  emptyMessage?: string;
  headerComponent?: React.ReactElement | null;
  // v1.0.192 — bumping this integer forces a full reload (used by filter
  // changes). We watch it in an effect so callers don't need to import
  // ref-based imperatives.
  reloadToken?: number | string;
  contentContainerStyle?: object;
  testID?: string;
  onLoaded?: (page: InfinitePage<T>) => void;
  ListEmptyOverride?: React.ReactElement | null;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // v1.0.192 — Guard against out-of-order responses when the filter
  // changes mid-flight. Each request captures a token; if a fresh reload
  // has bumped the token by the time the response arrives, we drop it.
  const tokenRef = useRef(0);

  const load = useCallback(
    async (nextPage: number, mode: "initial" | "refresh" | "more") => {
      const token = ++tokenRef.current;
      try {
        if (mode === "more") setLoadingMore(true);
        const res = await fetcher(nextPage);
        if (token !== tokenRef.current) return;
        setItems((prev) => (mode === "more" ? [...prev, ...res.items] : res.items));
        setPage(nextPage);
        setTotalPages(Math.max(1, res.total_pages || 1));
        setError(null);
        onLoaded?.(res);
      } catch (e) {
        if (token !== tokenRef.current) return;
        setError(e instanceof ApiError ? e.friendly : "Something went wrong. Pull to retry.");
      } finally {
        if (token !== tokenRef.current) return;
        if (mode === "initial") setInitialLoading(false);
        if (mode === "refresh") setRefreshing(false);
        if (mode === "more") setLoadingMore(false);
      }
    },
    [fetcher, onLoaded],
  );

  // Initial load + reload-on-token-change.
  useEffect(() => {
    setInitialLoading(true);
    void load(1, "initial");
    // Deliberately depend on reloadToken so filter changes reset to page 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(1, "refresh");
  }, [load]);

  const onEndReached = useCallback(() => {
    if (loadingMore || initialLoading || refreshing) return;
    if (page >= totalPages) return;
    void load(page + 1, "more");
  }, [initialLoading, load, loadingMore, page, refreshing, totalPages]);

  if (initialLoading) {
    return (
      <View style={{ flex: 1 }} testID={`${testID}-loading`}>
        {headerComponent ?? null}
        <AdminListSkeleton />
      </View>
    );
  }

  return (
    <FlatList
      testID={testID}
      data={items}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={headerComponent ?? null}
      stickyHeaderIndices={headerComponent ? [0] : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        error ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load" message={error} actionLabel="Retry" onAction={() => load(1, "refresh")} />
        ) : ListEmptyOverride !== undefined ? (
          ListEmptyOverride
        ) : (
          <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />
        )
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}><ActivityIndicator color={colors.brand} /></View>
        ) : page >= totalPages && items.length > 20 ? (
          <View style={styles.footer}><Text style={styles.footerText}>You've reached the end</Text></View>
        ) : null
      }
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  footer: { paddingVertical: spacing.xl, alignItems: "center" },
  footerText: { color: colors.onSurfaceMuted, fontSize: 12 },
});
