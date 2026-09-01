import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { formatDistanceToNow } from "date-fns";

import { nest, ApiError } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { toNotification } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { NotificationItem } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { useAuth } from "@/src/context/AuthContext";
import { useAlerts } from "@/src/context/AlertsContext";
import { pushFromTab, safeBack } from "@/src/utils/nav";
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  // v1.0.116 — keep the shared badge in sync with local mark-read
  // actions so the bell on every other screen updates instantly.
  const { refresh: refreshAlertsBadge, setUnreadCount, decrementUnread } = useAlerts();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // v1.0.163 — Token so a resolve after unmount / user change can't stomp
  // fresher state or hard-close the app.
  const loadTokenRef = React.useRef(0);

  const load = useCallback(async () => {
    const token = ++loadTokenRef.current;
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const data = await nest.getNotifications({ per_page: 50 });
      if (token !== loadTokenRef.current) return;
      setItems(data.items.map(toNotification));
    } catch {
      if (token !== loadTokenRef.current) return;
      setItems([]);
    } finally {
      if (token === loadTokenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user]);

  useEffect(() => {
    load();
    return () => { loadTokenRef.current++; };
  }, [load]);

  const markAllRead = async () => {
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

  // v1.0.165 — tapping the row body only marks it read; the explicit
  // "Open" button on the right is what navigates. This makes the row
  // feel like a read receipt with a dedicated action button, so a user
  // scanning alerts can dismiss unread state without being yanked to
  // another screen.
  const onRowPress = useCallback(
    (item: NotificationItem) => {
      haptics.tap();
      markOneRead(item);
    },
    [markOneRead],
  );

  // v1.0.165 — Open button: mark read + navigate. The route mapping is
  // shared with push tap handling via routeForPush() so tapping the
  // Open button and tapping a push notification land in the same place.
  const onOpenPress = useCallback(
    (item: NotificationItem) => {
      haptics.press();
      markOneRead(item);
      const meta = (item.meta ?? {}) as Record<string, unknown>;
      const path = routeForPush({
        type: item.type,
        order_id: meta.order_id as number | string | undefined,
        object_id: meta.object_id as number | string | undefined,
        object_type: meta.object_type as string | undefined,
        actor_id: meta.actor_id as number | string | undefined,
        status: meta.status as string | undefined,
      });
      if (path && path !== "/alerts") {
        pushFromTab(router, path);
      }
    },
    [markOneRead, router],
  );

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
            <TouchableOpacity onPress={() => { haptics.tap(); markAllRead(); }} testID="alerts-mark-all-read" accessibilityRole="button" accessibilityLabel="Mark all notifications as read">
              <Text style={styles.markRead}>Mark all read</Text>
            </TouchableOpacity>
          ) : null}
          <CartHeaderButton />
        </View>
      </View>
      <FlatList
        testID="alerts-list"
        data={items}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 100 }}
        ListEmptyComponent={<EmptyState icon="notifications-outline" title="You're all caught up" message="No notifications yet. New orders and updates will land here." testID="alerts-empty" />}
        renderItem={({ item }) => {
          // v1.0.165 — Row body marks-as-read, right-side "Open" button
          // navigates. Nested Touchables need the outer one to allow child
          // presses; on RN we get that by hitting stopPropagation on the
          // inner press via a separate TouchableOpacity that is a sibling
          // (not a child) of the outer press target. To keep the layout
          // simple, we make the row a View and use two Touchables inside:
          // one wraps the icon + text block, the other is the Open button.
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
            <View style={[styles.row, !item.read && styles.rowUnread]} testID={`alert-${item.id}`}>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => onRowPress(item)}
                style={styles.rowBody}
                accessibilityRole="button"
                accessibilityLabel={`${item.read ? "" : "Unread. "}${item.title}${item.body ? ". " + item.body : ""}`}
                accessibilityHint={item.read ? undefined : "Marks as read"}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name={ICON_FOR[item.type] ?? "notifications-outline"} size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  {item.body ? <Text style={styles.rowBodyText}>{item.body}</Text> : null}
                  <Text style={styles.rowTime}>{formatDistanceToNow(parseServerDate(item.created_at) ?? new Date(0), { addSuffix: true })}</Text>
                </View>
                {!item.read ? <View style={styles.dot} /> : null}
              </TouchableOpacity>
              {hasRoute ? (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => onOpenPress(item)}
                  style={styles.openBtn}
                  testID={`alert-${item.id}-open`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.title}`}
                  hitSlop={8}
                >
                  <Text style={styles.openBtnText}>Open</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.onBrand} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  backBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  markRead: { color: colors.brand, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  // v1.0.165 — Card became a View wrapping two Touchables. `row` is the
  // container; `rowBody` is the tappable area for mark-as-read; `openBtn`
  // is the pill-shaped action button on the right that navigates.
  row: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingLeft: spacing.lg, paddingRight: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.md, gap: spacing.md, ...shadows.card },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: spacing.md, paddingVertical: spacing.sm },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: colors.brand },
  rowIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  rowBodyText: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  rowTime: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
  openBtn: { flexDirection: "row", alignItems: "center", backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, alignSelf: "center" },
  openBtnText: { color: colors.onBrand, fontWeight: "800", fontSize: 13 },
});
