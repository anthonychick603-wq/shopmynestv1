import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type AdminSellerApplication } from "@/src/api/nest";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { useAdminFocusRefetch } from "@/src/hooks/use-admin-focus-refetch";
import { useLatestRequest } from "@/src/hooks/use-latest-request";

export default function SellerApplicationsAdmin() {
  useBackFallback("/admin/operations");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<AdminSellerApplication[]>([]);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [working, setWorking] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { begin, isCurrent } = useLatestRequest();

  // v1.0.249 — wrap load + both mutations with useLatestRequest so a
  // navigation away mid-approve/reject (or a fast focus refetch) can't
  // paint stale rows or toast after the screen has unmounted.
  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    const id = begin();
    try {
      const r = await nest.adminListSellerApplications({ status: "pending", per_page: 50 });
      if (!isCurrent(id)) return;
      setItems(r.items || []);
    } catch (e) {
      if (!isCurrent(id)) return;
      toast.error(e instanceof ApiError ? e.friendly : "Could not load applications");
    } finally {
      if (isCurrent(id)) { setLoading(false); setRefreshing(false); }
    }
  }, [user?.role, begin, isCurrent]);
  React.useEffect(() => { void load(); }, [load]);
  useAdminFocusRefetch(load); // v1.0.236 admin console focus refetch

  const approve = (app: AdminSellerApplication) => Alert.alert("Approve seller?", `${app.store_name || app.seller_name} will become an approved seller.`, [
    { text: "Cancel", style: "cancel" },
    // v1.0.236 — after a successful approve we filter locally for a snappy
    // update and then re-hit the server so the counters/queues owned by
    // /admin/operations reflect reality on the next focus refetch too.
    // v1.0.249 — gate every state write on isCurrent so an unmount mid-
    // approve can't toast into a torn-down tree or push a stale filter.
    { text: "Approve", onPress: async () => {
      const id = begin();
      setWorking(app.id);
      try {
        await nest.adminApproveSellerApplication(app.id);
        if (!isCurrent(id)) return;
        setItems((x) => x.filter((i) => i.id !== app.id));
        toast.success("Seller approved");
        void load();
      } catch (e) {
        if (!isCurrent(id)) return;
        toast.error(e instanceof ApiError ? e.friendly : "Could not approve seller");
      } finally {
        if (isCurrent(id)) setWorking(null);
      }
    } },
  ]);

  const reject = (app: AdminSellerApplication) => {
    const reason = (reasons[app.id] || "").trim();
    // v1.0.249 — inline UX now shows the "min 3 chars" hint next to the
    // input and disables the Reject button until valid, so hitting this
    // path with reason.length < 3 should be impossible; keep the guard
    // as a defense in depth.
    if (reason.length < 3) return toast.error("Add a short rejection reason first");
    Alert.alert("Reject application?", "The seller will be allowed to correct the application and resubmit.", [
      { text: "Cancel", style: "cancel" },
      // v1.0.236 — same reload-after-mutation as approve.
      // v1.0.249 — same isCurrent gating.
      { text: "Reject", style: "destructive", onPress: async () => {
        const id = begin();
        setWorking(app.id);
        try {
          await nest.adminRejectSellerApplication(app.id, { reason, can_resubmit: true });
          if (!isCurrent(id)) return;
          setItems((x) => x.filter((i) => i.id !== app.id));
          toast.success("Application rejected with feedback");
          void load();
        } catch (e) {
          if (!isCurrent(id)) return;
          toast.error(e instanceof ApiError ? e.friendly : "Could not reject application");
        } finally {
          if (isCurrent(id)) setWorking(null);
        }
      } },
    ]);
  };

  if (user?.role !== "admin") return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin/operations")} /><EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." /></SafeAreaView>;
  if (loading) return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin/operations")} /><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin/operations")} /><ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { if (loading || refreshing) return; /* v1.0.249 dedupe */ setRefreshing(true); void load(); }} tintColor={colors.brand} />} keyboardShouldPersistTaps="handled">
    {!items.length ? <EmptyState icon="checkmark-circle-outline" title="Queue clear" message="No seller applications are waiting for review." /> : items.map((app) => {
      // v1.0.249 — truncate long free-text fields so a very long "about"
      // or product list doesn't push Approve/Reject off-screen. Full text
      // is still available on the seller detail page.
      const reason = (reasons[app.id] || "").trim();
      const canReject = reason.length >= 3;
      return <View key={app.id} style={styles.card}>
        <Text style={styles.title} numberOfLines={2}>{app.store_name || app.seller_name}</Text>
        <Text style={styles.sub} numberOfLines={1}>{app.seller_name} · {app.seller_email}</Text>
        {app.about ? <Text style={styles.body} numberOfLines={4}>{app.about}</Text> : null}
        {app.products ? <Text style={styles.meta} numberOfLines={4}>Products: {app.products}</Text> : null}
        {app.categories ? <Text style={styles.meta} numberOfLines={4}>Categories: {app.categories}</Text> : null}
        <TextInput value={reasons[app.id] || ""} onChangeText={(v) => setReasons((r) => ({ ...r, [app.id]: v }))} placeholder="Reason if rejecting…" placeholderTextColor={colors.onSurfaceMuted} multiline style={styles.input} />
        {/* v1.0.249 — inline hint so the min-length rule isn't a surprise toast. */}
        <Text style={styles.hint}>{canReject ? " " : "Minimum 3 characters required to reject."}</Text>
        <View style={styles.actions}>
          <Button title="Approve" size="sm" onPress={() => approve(app)} loading={working === app.id} style={{ flex: 1 }} />
          <Button title="Reject" size="sm" variant="outline" onPress={() => reject(app)} disabled={working === app.id || !canReject} style={{ flex: 1 }} />
        </View>
      </View>;
    })}
  </ScrollView></SafeAreaView>;
}
function Top({ onBack }: { onBack: () => void }) { return <View style={styles.top}><TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity><Text style={styles.topTitle}>Seller applications</Text><View style={{ width: 40 }} /></View>; }
// v1.0.229 — Admin: Seller applications refinement. Cards + top pill
// button move to white on cream with hairline borders; textarea uses
// field radius on a white surface.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { ...typeTokens.h2, fontSize: 17 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  title: { ...typeTokens.h2, fontSize: 17 },
  sub: { ...typeTokens.caption, marginTop: 2 },
  body: { ...typeTokens.body, lineHeight: 20, marginTop: spacing.md },
  meta: { ...typeTokens.caption, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.field,
    padding: spacing.md,
    minHeight: 70,
    color: colors.onSurface,
    textAlignVertical: "top",
    marginTop: spacing.md,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  hint: { ...typeTokens.caption, color: colors.onSurfaceMuted, marginTop: 4, minHeight: 16 },
});
