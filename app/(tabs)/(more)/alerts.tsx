import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { formatDistanceToNow } from "date-fns";

import { nest, ApiError } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { toNotification } from "@/src/api/adapters";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import type { NotificationItem } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { ErrorState } from "@/src/components/ErrorState";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { useAuth } from "@/src/context/AuthContext";
import { useAlerts } from "@/src/context/AlertsContext";
import { pushFromTab, safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { routeForPush } from "@/src/hooks/use-notification-routing";
import { parseServerDate } from "@/src/utils/datetime";

const ICON_FOR: Record<string, keyof typeof Ionicons.glyphMap> = {
  new_order_for_seller: "bag-check-outline",
  order_confirmed: "checkmark-circle-outline",
  order_processing: "cog-outline",
  order_shipped: "cube-outline",
  tracking_added: "location-outline",
  order_delivered: "sparkles-outline",
  seller_application_update: "storefront-outline",
  new_follower: "person-add-outline",
  new_product: "gift-outline",
  new_message: "chatbubbles-outline",
  announcement: "megaphone-outline",
  // v1.0.66 Build #5 - Favorites growth loop.
  favorite_added: "heart-outline",
  favorites_digest: "heart-outline",
  back_in_stock: "notifications-outline",
};

/**
 * v1.0.168 — chevron shown whenever the underlying navigation stack
 * has an entry to pop. Alerts now lives inside the (more) Stack, so
 * router.canGoBack() is true whenever the user got here via the
 * header bell from another screen, and false when they cold-started
 * directly into /alerts (deep link). No parallel history tracker.
 */
function BackChip({ router }: { router: ReturnType<typeof useRouter> }) {
  const [hasPrev, setHasPrev] = useState<boolean>(() => {
    try { return router.canGoBack(); } catch { return false; }
  });
  useFocusEffect(
    useCallback(() => {
      try { setHasPrev(router.canGoBack()); } catch { setHasPrev(false); }
    }, [router]),
  );
  if (!hasPrev) return null;
  return (
    <TouchableOpacity
      onPress={() => { haptics.tap(); safeBack(router, "/(tabs)"); }}
      style={styles.backBtn}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      testID="alerts-back"
    >
      <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
    </TouchableOpacity>
  );
}

export default function Alerts() {
  useBackFallback("/(tabs)");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  // v1.0.116 — keep the shared badge in sync with local mark-read
  // actions so the bell on every other screen updates instantly.
  const { refresh: refreshAlertsBadge, setUnreadCount, decrementUnread } = useAlerts();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.243 — dedicated error state + load-more pagination + bulk
  // mutation working flag. Fixes 3 P1s at once: silent-failure disguised
  // as "caught up", 50-item hard cap on alert history, and rapid
  // double-tap of mark-all/clear-all firing the mutation twice.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // v1.0.163 — Token so a resolve after unmount / user change can't stomp
  // fresher state or hard-close the app.
  const loadTokenRef = React.useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    setErrorMsg(null);
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const data = await nest.getNotifications({ per_page: 50, page: 1 });
      if (token !== loadTokenRef.current) return;
      setItems(data.items.map(toNotification));
      setPage(1);
      // v1.0.243 — the notifications endpoint returns `total` but not
      // `total_pages`, so derive it here to seed the paginator.
      setTotalPages(data.total ? Math.max(1, Math.ceil(data.total / 50)) : 1);
    } catch (e) {
      if (token !== loadTokenRef.current) return;
      setErrorMsg(e instanceof ApiError ? e.friendly : "Couldn't load alerts.");
      setItems([]);
    } finally {
      if (token === loadTokenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || page >= totalPages) return;
    setLoadingMore(true);
    const token = loadTokenRef.current;
    try {
      const nextPage = page + 1;
      const data = await nest.getNotifications({ per_page: 50, page: nextPage });
      if (token !== loadTokenRef.current) return;
      setItems((prev) => [...prev, ...data.items.map(toNotification)]);
      setPage(nextPage);
      if (data.total) setTotalPages(Math.max(1, Math.ceil(data.total / 50)));
    } catch { /* silent — don't disturb infinite scroll */ }
    finally {
      if (token === loadTokenRef.current) setLoadingMore(false);
    }
  }, [page, totalPages, loading, loadingMore]);

  useEffect(() => {
    load();
    return () => { loadTokenRef.current++; };
  }, [load]);

  const markAllRead = async () => {
    // v1.0.243 — lock while inflight so rapid double-taps don't fire
    // duplicate bulk mutations against the server.
    if (bulkBusy) return;
    setBulkBusy(true);
    // v1.0.107 — optimistic flip so the badge/count updates immediately even
    // if the server round-trip is slow. On failure we surface the error AND
    // reload from server, which will restore the true state.
    setItems((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    // v1.0.116 — optimistically zero the shared badge so the bell on
    // other screens drops its dot immediately.
    setUnreadCount(0);
    try {
      await nest.markNotificationsRead();
      load();
      refreshAlertsBadge();
    } catch (e) {
      // v1.0.97 — previously swallowed. If the server is down or auth
      // expired mid-session, the user would tap "mark all read" and get
      // silence; the list would then still show unread on next load and
      // they'd think the button was broken. Now we surface it.
      toast.error(e instanceof ApiError ? e.friendly : "Couldn’t mark alerts as read");
      load();
      refreshAlertsBadge();
    } finally {
      setBulkBusy(false);
    }
  };

  // v1.0.107 — mark a single notification read optimistically, roll back
  // if the server rejects. Shared by the card body tap and the Open button.
  const markOneRead = useCallback(
    (item: NotificationItem) => {
      if (item.read) return;
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      // v1.0.116 — decrement the shared badge before the network call so
      // the bell drops in real time; roll back below if the server rejects.
      decrementUnread(1);
      const numericId = Number(item.id);
      if (Number.isFinite(numericId) && numericId > 0) {
        nest.markNotificationsRead([numericId]).catch(() => {
          setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: false } : n)));
          refreshAlertsBadge();
        });
      }
    },
    [decrementUnread, refreshAlertsBadge],
  );

  // v1.0.190 — The founder's preferred pattern is inbox-style: tapping
  // the row body BOTH marks-as-read AND navigates. The previous split
  // (row-body = mark-read only, right-side Open button = navigate) was
  // hard to discover and made the title look truncated when a wide
  // Open pill sat next to it. Tapping the row now marks-as-read AND
  // navigates in one gesture. A chevron-forward hint remains on the
  // right for affordance, but no longer intercepts the press.
  const onRowPress = useCallback(
    (item: NotificationItem, targetRoute: string | null) => {
      haptics.tap();
      markOneRead(item);
      if (targetRoute && targetRoute !== "/alerts") {
        pushFromTab(router, targetRoute);
      }
    },
    [markOneRead, router],
  );

  // v1.0.190 — onOpenPress removed. Row-body tap handles both mark-read
  // and navigate; there is no longer a separate Open button.

  // v1.0.191 — dismiss a single alert. Optimistic: pull it out of local
  // state immediately and shrink the badge if it was unread, then fire
  // the server call. On failure we surface a toast and reload the
  // canonical list. Non-numeric ids (defensive; the server only issues
  // numeric IDs, but the client type is `string`) short-circuit so we
  // never send garbage to the server.
  const dismissOne = useCallback(
    (item: NotificationItem) => {
      haptics.tap();
      const wasUnread = !item.read;
      setItems((prev) => prev.filter((n) => n.id !== item.id));
      if (wasUnread) decrementUnread(1);
      const numericId = Number(item.id);
      if (!Number.isFinite(numericId) || numericId <= 0) return;
      nest.dismissNotifications([numericId]).catch((e) => {
        toast.error(e instanceof ApiError ? e.friendly : "Couldn’t dismiss that alert");
        load();
        refreshAlertsBadge();
      });
    },
    [decrementUnread, load, refreshAlertsBadge],
  );

  // v1.0.191 — clear-all is destructive so we confirm first. Optimistic
  // wipe of the local list and badge; on failure we reload from server.
  const dismissAll = useCallback(() => {
    if (items.length === 0) return;
    // v1.0.243 — lock while a prior bulk mutation is inflight to
    // prevent double-firing the clear.
    if (bulkBusy) return;
    haptics.tap();
    Alert.alert(
      "Clear all alerts?",
      "This will permanently remove every alert from your list. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: () => {
            setBulkBusy(true);
            setItems([]);
            setUnreadCount(0);
            nest.dismissAllNotifications()
              .catch((e) => {
                toast.error(e instanceof ApiError ? e.friendly : "Couldn’t clear alerts");
                load();
                refreshAlertsBadge();
              })
              .finally(() => setBulkBusy(false));
          },
        },
      ],
    );
  }, [items.length, bulkBusy, load, refreshAlertsBadge, setUnreadCount]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}><BackChip router={router} /><NestLogo compact /><CartHeaderButton /></View>
        <EmptyState
          icon="notifications-off-outline"
          title="Sign in to see alerts"
          message="Log in to see order updates, follower alerts, and news from your favorite sellers."
          actionLabel="Sign in"
          onAction={() => pushFromTab(router, "/(auth)/login")}
          testID="alerts-signed-out"
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}><BackChip router={router} /><NestLogo compact /><CartHeaderButton /></View>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <BackChip router={router} />
        <NestLogo compact title="Alerts" subtitle={unread > 0 ? `${unread} unread` : undefined} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {unread > 0 ? (
            <TouchableOpacity onPress={() => { haptics.tap(); markAllRead(); }} disabled={bulkBusy} testID="alerts-mark-all-read" accessibilityRole="button" accessibilityLabel="Mark all notifications as read">
              <Text style={[styles.markRead, bulkBusy && { opacity: 0.5 }]}>Mark all read</Text>
            </TouchableOpacity>
          ) : null}
          {/* v1.0.191 — Clear-all pill: destructive, so it confirms first. */}
          {items.length > 0 ? (
            <TouchableOpacity onPress={dismissAll} disabled={bulkBusy} testID="alerts-clear-all" accessibilityRole="button" accessibilityLabel="Clear all alerts" hitSlop={8}>
              <Text style={[styles.clearAll, bulkBusy && { opacity: 0.5 }]}>Clear all</Text>
            </TouchableOpacity>
          ) : null}
          <CartHeaderButton />
        </View>
      </View>
      {errorMsg && !loading ? (
        <ErrorState message={errorMsg} onRetry={() => { setLoading(true); load(); }} />
      ) : (
      <FlatList
        testID="alerts-list"
        data={items}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 100 }}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={loadingMore ? <View style={{ padding: spacing.lg }}><ActivityIndicator color={colors.brand} /></View> : null}
        ListEmptyComponent={loading ? null : <EmptyState icon="notifications-outline" title="You're all caught up" message="No notifications yet. New orders and updates will land here." testID="alerts-empty" />}
        renderItem={({ item }) => {
          // v1.0.190 — One-tap inbox pattern. Tapping anywhere on the
          // row body marks-as-read AND navigates in a single gesture.
          // A chevron on the right hints that the row is tappable
          // when a route exists, but it is decorative (inside the same
          // Touchable) so the whole row remains one big hit target.
          const meta = (item.meta ?? {}) as Record<string, unknown>;
          const targetRoute = routeForPush({
            type: item.type,
            order_id: meta.order_id as number | string | undefined,
            object_id: meta.object_id as number | string | undefined,
            object_type: meta.object_type as string | undefined,
            actor_id: meta.actor_id as number | string | undefined,
            status: meta.status as string | undefined,
          });
          const hasRoute = !!targetRoute && targetRoute !== "/alerts";
          return (
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => onRowPress(item, targetRoute)}
              style={[styles.row, !item.read && styles.rowUnread]}
              testID={`alert-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? "" : "Unread. "}${item.title}${item.body ? ". " + item.body : ""}`}
              accessibilityHint={hasRoute ? "Opens details" : (item.read ? undefined : "Marks as read")}
            >
              <View style={styles.rowIcon}>
                <Ionicons name={ICON_FOR[item.type] ?? "notifications-outline"} size={20} color={colors.brand} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                {item.body ? <Text style={styles.rowBodyText} numberOfLines={3}>{item.body}</Text> : null}
                <Text style={styles.rowTime}>{formatDistanceToNow(parseServerDate(item.created_at) ?? new Date(0), { addSuffix: true })}</Text>
              </View>
              {!item.read ? <View style={styles.dot} /> : null}
              {hasRoute ? (
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} style={{ marginLeft: spacing.xs }} />
              ) : null}
              {/* v1.0.191 — per-row dismiss. Sits AFTER the chevron and
                  stops propagation so tapping the × doesn't also
                  fire the row's mark-read + navigate. hitSlop keeps
                  the visual small while the touch target stays
                  comfortable (>= 44pt). */}
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); dismissOne(item); }}
                style={styles.dismissBtn}
                testID={`alert-${item.id}-dismiss`}
                accessibilityRole="button"
                accessibilityLabel={`Dismiss ${item.title}`}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={18} color={colors.onSurfaceMuted} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  // v1.0.226 — Notifications inbox refinement. Rows become white cards
  // with a hairline border and no shadow; unread rows are indicated by
  // a subtle left rail + the brand dot rather than colored surfaces so
  // the list reads like a Gmail/Linear inbox, not a stack of buttons.
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  backBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  markRead: { ...typeTokens.caption, color: colors.brand, fontWeight: "700" },
  clearAll: { ...typeTokens.caption, color: colors.error, fontWeight: "700" },
  dismissBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", marginLeft: spacing.xs, borderRadius: radius.pill },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: colors.brand },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { ...typeTokens.body, fontWeight: "800" },
  rowBodyText: { ...typeTokens.caption, marginTop: 2 },
  rowTime: { ...typeTokens.micro, textTransform: "none", letterSpacing: 0, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6, marginLeft: spacing.xs },
});
