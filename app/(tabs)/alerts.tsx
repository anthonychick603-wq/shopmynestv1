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
import { peekPreviousRoute } from "@/src/utils/nav-history";
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
};

/**
 * v1.0.117 — chevron shown only when the nav-history tracker knows the
 * user got here from another screen (e.g. tapped the bell on a product).
 * On a cold start where Alerts is the first thing shown, the tracker
 * has one entry (this screen) and peekPreviousRoute() returns null, so
 * nothing renders. That keeps the header clean when there's genuinely
 * nowhere to go back to.
 */
function BackChip({ router }: { router: ReturnType<typeof useRouter> }) {
  const [hasPrev, setHasPrev] = useState<boolean>(!!peekPreviousRoute());
  // Re-check on every focus — the tracker only updates when segments
  // change, and useFocusEffect fires whenever the screen becomes the
  // active one. Together they guarantee the chip reflects whether
  // history exists to walk back through.
  useFocusEffect(
    useCallback(() => {
      setHasPrev(!!peekPreviousRoute());
    }, []),
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

  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const data = await nest.getNotifications({ per_page: 50 });
      setItems(data.items.map(toNotification));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

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

  // v1.0.107 — tapping a row now (a) marks that single notification read
  // optimistically, (b) POSTs the read to the server, and (c) navigates to
  // the target described by the notification metadata. The route mapping is
  // shared with push tap handling via routeForPush() so both entry points
  // land in the same place for the same notification type.
  const onRowPress = useCallback(
    async (item: NotificationItem) => {
      haptics.tap();
      if (!item.read) {
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
        const numericId = Number(item.id);
        // v1.0.116 — decrement the shared badge before the network call
        // so the bell drops in real time; if the server rejects we roll
        // back below.
        decrementUnread(1);
        if (Number.isFinite(numericId) && numericId > 0) {
          nest.markNotificationsRead([numericId]).catch(() => {
            // Rollback if the server rejected it — better to show the true
            // state than a stale optimistic one.
            setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: false } : n)));
            refreshAlertsBadge();
          });
        }
      }
      const meta = (item.meta ?? {}) as Record<string, unknown>;
      const path = routeForPush({
        type: item.type,
        order_id: meta.order_id as number | string | undefined,
        object_id: meta.object_id as number | string | undefined,
        object_type: meta.object_type as string | undefined,
        actor_id: meta.actor_id as number | string | undefined,
      });
      if (path && path !== "/alerts") {
        pushFromTab(router, path);
      }
    },
    [router],
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
        renderItem={({ item }) => (
          // v1.0.110 — rows now read visually as buttons: a chevron on the
          // right signals navigation, the whole card has an explicit press
          // state (activeOpacity 0.6 + accessibilityRole 'button'), and
          // empty body text is collapsed so a shipped-order row doesn't
          // leave dead vertical space that made the card feel static.
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => onRowPress(item)}
            style={[styles.row, !item.read && styles.rowUnread]}
            testID={`alert-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.read ? "" : "Unread. "}${item.title}${item.body ? ". " + item.body : ""}`}
            accessibilityHint="Opens details"
          >
            <View style={styles.rowIcon}><Ionicons name={ICON_FOR[item.type] ?? "notifications-outline"} size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {item.body ? <Text style={styles.rowBody}>{item.body}</Text> : null}
              <Text style={styles.rowTime}>{formatDistanceToNow(parseServerDate(item.created_at) ?? new Date(0), { addSuffix: true })}</Text>
            </View>
            {!item.read ? <View style={styles.dot} /> : null}
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} style={styles.chev} />
          </TouchableOpacity>
        )}
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
  row: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.md, ...shadows.card },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: colors.brand },
  rowIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  rowBody: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  rowTime: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
  chev: { marginLeft: spacing.sm, alignSelf: "center" },
});
