import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, friendlyMessage, type NestConversationRaw } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { ErrorState } from "@/src/components/ErrorState";
import { AppImage } from "@/src/components/AppImage";
import { decodeEntities } from "@/src/utils/html";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { parseServerDate } from "@/src/utils/datetime";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { useAdminFocusRefetch } from "@/src/hooks/use-admin-focus-refetch";

// Format an ISO/MySQL UTC timestamp as a relative label (e.g. "3m", "2h", "Yesterday", "Mar 4").
function formatRelative(iso: string): string {
  if (!iso) return "";
  // The-nest returns MySQL UTC ("YYYY-MM-DD HH:MM:SS"); make it a real ISO string.
  const utc = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  // v1.0.250 — parseServerDate returns null on invalid input, so a
  // second NaN check is dead code. One guard is enough.
  const d = parseServerDate(utc);
  if (!d) return "";
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
  useBackFallback("/(tabs)/account");
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<NestConversationRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatestRequest();

  // v1.0.250 — load now uses useLatestRequest so unmount mid-fetch or a
  // superseded call (fast focus refetch → pull-to-refresh) can't paint
  // stale rows or toast into a torn-down tree.
  const load = useCallback(async () => {
    if (!user) return;
    const id = begin();
    setError(null);
    try {
      const rows = await nest.getConversations();
      if (!isCurrent(id)) return;
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e: unknown) {
      if (!isCurrent(id)) return;
      setError(friendlyMessage(e) || "Could not load messages.");
    } finally {
      if (isCurrent(id)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user, begin, isCurrent]);

  // v1.0.167 — load once on mount. Pull to refresh to force reload.
  // v1.0.250 — restored a self-throttled focus refetch. Prior to today the
  // inbox stayed stale for the entire session; the original concern (scroll
  // reset) is handled by FlatList's default behavior when the data array
  // identity stays reference-stable across a refetch, and useAdminFocusRefetch
  // self-throttles so a rapid tab switch doesn't spam the endpoint.
  useEffect(() => { load(); }, [load]);
  useAdminFocusRefetch(load, { staleMs: 30_000 });

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} style={styles.topBtn} testID="messages-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Messages</Text>
          <AlertsBellButton />
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
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} style={styles.topBtn} testID="messages-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Messages</Text>
        <AlertsBellButton />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : error ? (
        // v1.0.243 — promote inline error to shared ErrorState primitive
        // so it exposes a retry action, matching the rest of the app.
        <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} testID="messages-error" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => String(c.user.id)}
          contentContainerStyle={{ paddingBottom: spacing["3xl"] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (loading || refreshing) return; /* v1.0.250 dedupe */ setRefreshing(true); load(); }} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const name = decodeEntities(item.user.store_name || item.user.display_name || "Shop");
            return (
              // v1.0.250 — Pressable with pressed-state feedback matches every
              // other row list in the app (orders, products, seller list).
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => { haptics.tap(); router.push({ pathname: "/messages/[userId]", params: { userId: String(item.user.id), name } }); }}
                testID={`msg-row-${item.user.id}`}
               accessibilityRole="button">
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
              </Pressable>
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
  // v1.0.224 — Refinement pass. Inbox now uses Poshmark-style row rhythm:
  //   • Larger avatar (52px) with hairline border so the shape reads as
  //     an object even against a busy background image.
  //   • Name in bodyLg (16/22 500–7) with a wider tracking budget.
  //   • Preview text in caption tone — recedes on read messages, bumps
  //     to primary + medium weight on unread.
  //   • Unread pill instead of a floating dot — easier to read at a
  //     glance and doesn't collide with the timestamp.
  //   • Divider inset aligned with the avatar so it reads as a
  //     structural rhythm, not a boxed row.
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  topTitle: { ...typeTokens.h2, flex: 1, textAlign: "center" },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  rowPressed: { backgroundColor: colors.surfaceSecondary },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0 },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, alignItems: "center" },
  name: { ...typeTokens.bodyLg, fontWeight: "600", flex: 1 },
  nameUnread: { fontWeight: "800" },
  date: { ...typeTokens.caption },
  preview: { ...typeTokens.caption, marginTop: 2, color: colors.onSurfaceMuted },
  previewUnread: { color: colors.onSurface, fontWeight: "600" },
  unreadDot: {
    minWidth: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    marginLeft: spacing.sm,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginLeft: spacing.lg + 52 + spacing.md,
  },
});
