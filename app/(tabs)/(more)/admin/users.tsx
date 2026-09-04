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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionSheetIOS, Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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
import { useAdminFocusRefetch } from "@/src/hooks/use-admin-focus-refetch";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { parseServerDate } from "@/src/utils/datetime";
import { haptics } from "@/src/utils/haptics";
import { useBackFallback } from "@/src/context/BackFallback";

const CHIPS: readonly FilterChip<AdminUserStatus>[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "banned", label: "Banned" },
  { value: "sellers", label: "Sellers" },
  { value: "admins", label: "Admins" },
];

export default function UsersScreen() {
  useBackFallback("/admin");
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  // v1.0.249 — debounced search: type freely without a network round-trip
  // on every keystroke; the fetcher only re-runs 250ms after the last edit.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<AdminUserStatus>("all");
  const [reloadToken, setReloadToken] = useState(0);
  const [totalKnown, setTotalKnown] = useState<number | null>(null);
  const { begin, isCurrent } = useLatestRequest();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const fetcher = useCallback(
    async (page: number) => {
      const res = await nest.adminListUsers({ page, per_page: 25, search: debouncedQuery || undefined, status });
      setTotalKnown(res.total);
      return { items: res.items, total_pages: res.total_pages, total: res.total };
    },
    [debouncedQuery, status]
  );

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  useAdminFocusRefetch(reload); // v1.0.236 admin console focus refetch

  // v1.0.249 — Android suspend reason capture. iOS keeps Alert.prompt;
  // Android now surfaces a real TextInput modal so the ban_reason we
  // send matches iOS parity instead of always going through as empty.
  const [suspendModal, setSuspendModal] = useState<{ user: AdminUser } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const suspendResolveRef = useRef<((v: string) => void) | null>(null);
  const openAndroidSuspend = useCallback((u: AdminUser): Promise<string> => {
    return new Promise<string>((resolve) => {
      suspendResolveRef.current = resolve;
      setSuspendReason("");
      setSuspendModal({ user: u });
    });
  }, []);
  const closeSuspend = useCallback((reason: string) => {
    const r = suspendResolveRef.current;
    suspendResolveRef.current = null;
    setSuspendModal(null);
    if (r) r(reason);
  }, []);

  // v1.0.193 — Action sheet for a user row. Only the actions valid for the
  // current user state are shown (no "Ban" for admins, no "Unban" for
  // non-banned users, etc.). Every mutation is optimistically NOT applied;
  // instead we refetch on success so the ban/demote guardrails in the
  // server land in one deterministic path.
  const openRowActions = useCallback(
    (u: AdminUser) => {
      const isSelf = String(me?.id ?? "") === String(u.id);
      type Action = { label: string; destructive?: boolean; run: () => Promise<void>; needsConfirm?: { title: string; body: string; cta: string; destructive?: boolean } };
      const actions: Action[] = [];

      if (!u.is_admin && !u.is_banned && !isSelf) {
        actions.push({
          label: "Promote to admin",
          // v1.0.249 — promote is nearly as consequential as suspend; require
          // an explicit confirmation before granting admin privileges.
          needsConfirm: {
            title: "Promote to admin?",
            body: `${u.display_name} will gain full administrator access to the marketplace.`,
            cta: "Promote",
          },
          run: async () => {
            const id = begin();
            try {
              await nest.adminPromoteUser(u.id);
              if (!isCurrent(id)) return;
              toast.success(`${u.display_name} is now an administrator`);
              reload();
            } catch (e) {
              if (!isCurrent(id)) return;
              toast.error(e instanceof ApiError ? e.friendly : "Something went wrong.");
            }
          },
        });
      }
      if (u.is_admin && !isSelf) {
        actions.push({
          label: "Remove admin role",
          run: async () => {
            const id = begin();
            try {
              await nest.adminDemoteUser(u.id);
              if (!isCurrent(id)) return;
              toast.success(`${u.display_name} is no longer an administrator`);
              reload();
            } catch (e) {
              if (!isCurrent(id)) return;
              toast.error(e instanceof ApiError ? e.friendly : "Something went wrong.");
            }
          },
        });
      }
      if (!u.is_admin && !u.is_banned && !isSelf) {
        actions.push({
          label: "Suspend account",
          destructive: true,
          run: async () => {
            // v1.0.249 — on Android, capture a real reason via the modal
            // below; iOS keeps Alert.prompt. This makes ban_reason parity
            // between platforms instead of silently sending "" on Android.
            const reason = Platform.OS === "ios" ? await promptReasonIOS() : await openAndroidSuspend(u);
            const id = begin();
            try {
              await nest.adminBanUser(u.id, reason);
              if (!isCurrent(id)) return;
              toast.success(`${u.display_name} suspended`);
              reload();
            } catch (e) {
              if (!isCurrent(id)) return;
              toast.error(e instanceof ApiError ? e.friendly : "Something went wrong.");
            }
          },
        });
      }
      // v1.0.249 — admin-on-admin suspend clarification. If the target is
      // an admin (and not self), the server rejects the ban outright, so
      // surface that up front instead of letting the user watch a spinner
      // and get a generic error.
      if (u.is_admin && !isSelf && !u.is_banned) {
        actions.push({
          label: "Suspend admin (blocked)",
          destructive: true,
          run: async () => {
            toast.info("Remove the admin role first, then suspend the account.");
          },
        });
      }
      if (u.is_banned) {
        actions.push({
          label: "Restore account",
          run: async () => {
            const id = begin();
            try {
              await nest.adminUnbanUser(u.id);
              if (!isCurrent(id)) return;
              toast.success(`${u.display_name} restored`);
              reload();
            } catch (e) {
              if (!isCurrent(id)) return;
              toast.error(e instanceof ApiError ? e.friendly : "Something went wrong.");
            }
          },
        });
      }

      if (actions.length === 0) {
        toast.info(isSelf ? "Use the WordPress dashboard to change your own role." : "No actions available for this user.");
        return;
      }

      const wrap = (a: Action) => async () => {
        if (a.needsConfirm) {
          Alert.alert(
            a.needsConfirm.title,
            a.needsConfirm.body,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: a.needsConfirm.cta,
                style: a.needsConfirm.destructive ? "destructive" : "default",
                onPress: () => { void a.run().catch((e) => toast.error(e instanceof ApiError ? e.friendly : "Something went wrong.")); },
              },
            ],
          );
          return;
        }
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
    [me?.id, reload, begin, isCurrent, openAndroidSuspend]
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
          // v1.0.249 — no synchronous reload on every keystroke; the
          // debouncedQuery effect drives the refetch after 250ms of quiet.
          onQueryChange={(next) => setQuery(next)}
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

      {/* v1.0.249 — Android suspend reason modal. Matches iOS Alert.prompt UX. */}
      <Modal transparent visible={!!suspendModal} animationType="fade" onRequestClose={() => closeSuspend("")}>
        <Pressable style={styles.modalBackdrop} onPress={() => closeSuspend("")}>
          <Pressable style={styles.modalCard} onPress={() => { /* swallow */ }}>
            <Text style={styles.modalTitle}>Suspend account?</Text>
            <Text style={styles.modalBody}>
              This hides {suspendModal?.user.display_name ?? "the user"} from the marketplace but keeps their order history. Optional reason:
            </Text>
            <TextInput
              value={suspendReason}
              onChangeText={setSuspendReason}
              placeholder="Reason (optional)"
              placeholderTextColor={colors.onSurfaceMuted}
              multiline
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => closeSuspend("")} style={[styles.modalBtn, styles.modalBtnGhost]}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => closeSuspend(suspendReason.trim())} style={[styles.modalBtn, styles.modalBtnDanger]}>
                <Text style={styles.modalBtnDangerText}>Suspend</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// v1.0.193 — prompt for a ban reason. Keeps the flow inline (no route
// change) so admins don't lose their spot in the list.
// v1.0.249 — iOS-only Alert.prompt path. Android now uses openAndroidSuspend
// modal (declared inside the component) so we can capture a real reason.
function promptReasonIOS(): Promise<string> {
  return new Promise((resolve) => {
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
  });
}

// v1.0.249 — drop the "Joined " prefix on failure. The row already prints
// "Joined" outside this function; returning "—" is enough, and returning
// something like "Joined —" from the parent looks fine while returning
// "—" here keeps the fallback readable.
function joinedLabel(iso: string): string {
  const d = parseServerDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// v1.0.229 — Admin Users refinement. Type tokens applied; avatar
// fallback uses cream on a hairline‑bounded circle.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerWrap: { marginBottom: spacing.sm },
  totalHint: { ...typeTokens.caption, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  name: { ...typeTokens.body, fontWeight: "800", fontSize: 15, maxWidth: "80%" },
  email: { ...typeTokens.caption, marginTop: 2 },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs, flexWrap: "wrap" },
  metaText: { ...typeTokens.micro },
  metaDot: { ...typeTokens.micro, marginHorizontal: 2 },
  banReason: { ...typeTokens.caption, color: colors.warning, marginTop: spacing.xs, fontStyle: "italic" },

  // v1.0.249 — Android suspend modal.
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: colors.card, borderRadius: radius.card, padding: spacing.lg, borderWidth: 1, borderColor: colors.hairline },
  modalTitle: { ...typeTokens.h2, fontSize: 17 },
  modalBody: { ...typeTokens.body, color: colors.onSurfaceMuted, marginTop: spacing.sm },
  modalInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairlineStrong, borderRadius: radius.field, padding: spacing.md, minHeight: 70, color: colors.onSurface, textAlignVertical: "top", marginTop: spacing.md },
  modalActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, justifyContent: "flex-end" },
  modalBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  modalBtnGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.hairlineStrong },
  modalBtnGhostText: { ...typeTokens.body, fontWeight: "700", color: colors.onSurface },
  modalBtnDanger: { backgroundColor: colors.error },
  modalBtnDangerText: { ...typeTokens.body, fontWeight: "800", color: colors.onBrand },
});
