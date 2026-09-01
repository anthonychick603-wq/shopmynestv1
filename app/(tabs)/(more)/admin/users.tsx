// v1.0.193 — Admin users management. Powers the /admin/users REST surface
// added to plugin v3.13.57. Owner can:
//   - Browse every account on the marketplace (paginated, 25/page)
//   - Filter by status: all / active / banned / sellers only / admins only
//   - Search across username, email, and display name
//   - Promote or demote administrators
//   - Soft-ban or unban accounts (server preserves the WP user so historic
//     orders keep resolving; ban revokes tokens and blocks re-login)
//
// A ban is intentionally a soft state — see the header comment in
// class-mnu-admin-users.php for the rationale. The row action sheet
// mirrors that: "Ban account" is destructive-red but the language is
// "Suspend" not "Delete", and the confirm dialog explains what actually
// happens ("this hides them from the marketplace but keeps their order
// history").
import React, { useCallback, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { nest, ApiError, type AdminUser, type AdminUserStatus } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { AdminHeader } from "@/src/components/admin/AdminHeader";
import { AdminCard } from "@/src/components/admin/AdminCard";
import { FilterBar, type FilterChip } from "@/src/components/admin/FilterBar";
import { InfiniteList } from "@/src/components/admin/InfiniteList";
import { AdminStatusPill } from "@/src/components/admin/AdminStatusPill";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { parseServerDate } from "@/src/utils/datetime";
import { haptics } from "@/src/utils/haptics";

const CHIPS: readonly FilterChip<AdminUserStatus>[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "banned", label: "Banned" },
  { value: "sellers", label: "Sellers" },
  { value: "admins", label: "Admins" },
];

export default function UsersScreen() {
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminUserStatus>("all");
  const [reloadToken, setReloadToken] = useState(0);
  const [totalKnown, setTotalKnown] = useState<number | null>(null);

  const fetcher = useCallback(
    async (page: number) => {
      const res = await nest.adminListUsers({ page, per_page: 25, search: query || undefined, status });
      setTotalKnown(res.total);
      return { items: res.items, total_pages: res.total_pages, total: res.total };
    },
    [query, status]
  );

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  // v1.0.193 — Action sheet for a user row. Only the actions valid for the
  // current user state are shown (no "Ban" for admins, no "Unban" for
  // non-banned users, etc.). Every mutation is optimistically NOT applied;
  // instead we refetch on success so the ban/demote guardrails in the
  // server land in one deterministic path.
  const openRowActions = useCallback(
    (u: AdminUser) => {
      const isSelf = String(me?.id ?? "") === String(u.id);
      type Action = { label: string; destructive?: boolean; run: () => Promise<void> };
      const actions: Action[] = [];

      if (!u.is_admin && !u.is_banned && !isSelf) {
        actions.push({
          label: "Promote to admin",
          run: async () => {
            await nest.adminPromoteUser(u.id);
            toast.success(`${u.display_name} is now an administrator`);
            reload();
          },
        });
      }
      if (u.is_admin && !isSelf) {
        actions.push({
          label: "Remove admin role",
          run: async () => {
            await nest.adminDemoteUser(u.id);
            toast.success(`${u.display_name} is no longer an administrator`);
            reload();
          },
        });
      }
      if (!u.is_admin && !u.is_banned && !isSelf) {
        actions.push({
          label: "Suspend account",
          destructive: true,
          run: async () => {
            const reason = await promptReason();
            await nest.adminBanUser(u.id, reason);
            toast.success(`${u.display_name} suspended`);
            reload();
          },
        });
      }
      if (u.is_banned) {
        actions.push({
          label: "Restore account",
          run: async () => {
            await nest.adminUnbanUser(u.id);
            toast.success(`${u.display_name} restored`);
            reload();
          },
        });
      }

      if (actions.length === 0) {
        toast.info(isSelf ? "Use the WordPress dashboard to change your own role." : "No actions available for this user.");
        return;
      }

      const wrap = (a: Action) => async () => {
        try { await a.run(); }
        catch (e) { toast.error(e instanceof ApiError ? e.friendly : "Something went wrong."); }
      };

      if (Platform.OS === "ios") {
        const labels = actions.map((a) => a.label).concat("Cancel");
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: labels,
            cancelButtonIndex: labels.length - 1,
            destructiveButtonIndex: actions.findIndex((a) => a.destructive) >= 0 ? actions.findIndex((a) => a.destructive) : undefined,
            title: u.display_name,
            message: u.email,
          },
          (idx) => {
            const a = actions[idx];
            if (a) void wrap(a)();
          }
        );
      } else {
        Alert.alert(
          u.display_name,
          u.email,
          [
            ...actions.map((a) => ({
              text: a.label,
              style: (a.destructive ? "destructive" : "default") as "default" | "destructive",
              onPress: wrap(a),
            })),
            { text: "Cancel", style: "cancel" },
          ],
          { cancelable: true }
        );
      }
    },
    [me?.id, reload]
  );

  const renderItem = useCallback(
    ({ item: u }: { item: AdminUser }) => (
      <AdminCard onPress={() => openRowActions(u)}>
        <View style={styles.row}>
          {u.avatar ? (
            <Image source={{ uri: u.avatar }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={20} color={colors.onSurfaceMuted} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{u.display_name}</Text>
              {u.is_admin ? <AdminStatusPill status="admin" /> : null}
              {u.is_seller ? <AdminStatusPill status="seller" /> : null}
              {u.is_banned ? <AdminStatusPill status="banned" /> : null}
            </View>
            <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
            <View style={styles.meta}>
              <Ionicons name="bag-outline" size={12} color={colors.onSurfaceMuted} />
              <Text style={styles.metaText}>{u.order_count} order{u.order_count === 1 ? "" : "s"}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Ionicons name="calendar-outline" size={12} color={colors.onSurfaceMuted} />
              <Text style={styles.metaText}>Joined {joinedLabel(u.registered_at)}</Text>
            </View>
            {u.is_banned && u.banned_reason ? (
              <Text style={styles.banReason} numberOfLines={2}>Suspended: {u.banned_reason}</Text>
            ) : null}
          </View>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.onSurfaceMuted} />
        </View>
      </AdminCard>
    ),
    [openRowActions]
  );

  const header = useMemo(
    () => (
      <View style={styles.headerWrap}>
        <FilterBar<AdminUserStatus>
          query={query}
          onQueryChange={(next) => { setQuery(next); reload(); }}
          placeholder="Search name, username, or email"
          chips={CHIPS}
          activeChip={status}
          onChipChange={(next) => { haptics.tap(); setStatus(next); reload(); }}
        />
        {totalKnown !== null ? (
          <Text style={styles.totalHint}>{totalKnown.toLocaleString()} accounts</Text>
        ) : null}
      </View>
    ),
    [query, status, totalKnown, reload]
  );

  if (me?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AdminHeader title="Users" backTo="/admin" />
        <EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Users" backTo="/admin" />
      <InfiniteList<AdminUser>
        fetcher={fetcher}
        reloadToken={reloadToken}
        headerComponent={header}
        keyExtractor={(u) => String(u.id)}
        renderItem={renderItem}
        emptyIcon="people-outline"
        emptyTitle="No users match"
        emptyMessage="Try clearing the search or switching the status filter."
      />
    </SafeAreaView>
  );
}

// v1.0.193 — prompt for a ban reason. Keeps the flow inline (no route
// change) so admins don't lose their spot in the list.
function promptReason(): Promise<string> {
  return new Promise((resolve) => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Suspend account",
        "This hides the user from the marketplace but keeps their order history. Optional reason:",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve("") },
          { text: "Suspend", style: "destructive", onPress: (text?: string) => resolve((text || "").trim()) },
        ],
        "plain-text" as const,
        ""
      );
    } else {
      Alert.alert(
        "Suspend account?",
        "This hides the user from the marketplace but keeps their order history.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve("") },
          { text: "Suspend", style: "destructive", onPress: () => resolve("") },
        ]
      );
    }
  });
}

function joinedLabel(iso: string): string {
  const d = parseServerDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerWrap: { marginBottom: spacing.sm },
  totalHint: { fontSize: 12, color: colors.onSurfaceMuted, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  name: { fontSize: 15, fontWeight: "800", color: colors.onSurface, maxWidth: "80%" },
  email: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs, flexWrap: "wrap" },
  metaText: { fontSize: 11, color: colors.onSurfaceMuted },
  metaDot: { fontSize: 11, color: colors.onSurfaceMuted, marginHorizontal: 2 },
  banReason: { fontSize: 12, color: colors.warning, marginTop: spacing.xs, fontStyle: "italic" },
});
