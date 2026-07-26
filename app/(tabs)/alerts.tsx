import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { formatDistanceToNow } from "date-fns";

import { nest } from "@/src/api/nest";
import { toNotification } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { NotificationItem } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { useAuth } from "@/src/context/AuthContext";

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
};

export default function Alerts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

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
    try {
      await nest.markNotificationsRead();
      load();
    } catch {}
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}><NestLogo compact /><CartHeaderButton /></View>
        <EmptyState
          icon="notifications-off-outline"
          title="Sign in to see alerts"
          message="Log in to see order updates, follower alerts, and news from your favorite sellers."
          actionLabel="Sign in"
          onAction={() => router.push("/(auth)/login")}
          testID="alerts-signed-out"
        />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}><NestLogo compact /><CartHeaderButton /></View>
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const unread = items.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <NestLogo compact title="Alerts" subtitle={unread > 0 ? `${unread} unread` : undefined} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          {unread > 0 ? (
            <TouchableOpacity onPress={markAllRead} testID="alerts-mark-all-read">
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
          <View style={[styles.row, !item.read && styles.rowUnread]} testID={`alert-${item.id}`}>
            <View style={styles.rowIcon}><Ionicons name={ICON_FOR[item.type] ?? "notifications-outline"} size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowBody}>{item.body}</Text>
              <Text style={styles.rowTime}>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</Text>
            </View>
            {!item.read ? <View style={styles.dot} /> : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  markRead: { color: colors.brand, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.md, ...shadows.card },
  rowUnread: { borderLeftWidth: 3, borderLeftColor: colors.brand },
  rowIcon: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  rowBody: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  rowTime: { fontSize: 11, color: colors.onSurfaceMuted, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
});
