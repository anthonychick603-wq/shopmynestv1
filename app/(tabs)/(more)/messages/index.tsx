import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, type NestConversationRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { AppImage } from "@/src/components/AppImage";
import { decodeEntities } from "@/src/utils/html";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";

// Format an ISO/MySQL UTC timestamp as a relative label (e.g. "3m", "2h", "Yesterday", "Mar 4").
function formatRelative(iso: string): string {
  if (!iso) return "";
  // The-nest returns MySQL UTC ("YYYY-MM-DD HH:MM:SS"); make it a real ISO string.
  const utc = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function MessagesInbox() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<NestConversationRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const rows = await nest.getConversations();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setError(e?.friendly || "Could not load messages.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  // Refresh whenever the inbox regains focus so a just-sent thread appears.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} testID="messages-back" accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Messages</Text>
          <View style={styles.topBtn} />
        </View>
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title="Sign in to view messages"
          message="Sign in to chat with makers about their shops and listings."
          testID="messages-signin"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} testID="messages-back" accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Messages</Text>
        <View style={styles.topBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        <EmptyState icon="alert-circle-outline" title="Something went wrong" message={error} testID="messages-error" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => String(c.user.id)}
          contentContainerStyle={{ paddingBottom: spacing["3xl"] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const name = decodeEntities(item.user.store_name || item.user.display_name || "Shop");
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push({ pathname: "/messages/[userId]", params: { userId: String(item.user.id), name } })}
                testID={`msg-row-${item.user.id}`}
              >
                {item.user.avatar ? (
                  <AppImage source={{ uri: item.user.avatar }} style={styles.avatar} fallbackIcon="person-outline" />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}><Ionicons name="leaf" size={22} color={colors.brand} /></View>
                )}
                <View style={styles.rowBody}>
                  <View style={styles.rowHeader}>
                    <Text style={[styles.name, item.unread && styles.nameUnread]} numberOfLines={1}>{name}</Text>
                    <Text style={styles.date}>{formatRelative(item.date)}</Text>
                  </View>
                  <Text style={[styles.preview, item.unread && styles.previewUnread]} numberOfLines={2}>
                    {item.last_message}
                  </Text>
                </View>
                {item.unread ? <View style={styles.unreadDot} /> : null}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="No messages yet"
              message="When you message a shop, the conversation shows up here."
              testID="messages-empty"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface, flex: 1, textAlign: "center" },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  name: { fontSize: 15, fontWeight: "700", color: colors.onSurface, flex: 1 },
  nameUnread: { fontWeight: "800" },
  date: { fontSize: 12, color: colors.onSurfaceMuted },
  preview: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  previewUnread: { color: colors.onSurface, fontWeight: "600" },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  sep: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg + 48 + spacing.md },
});
