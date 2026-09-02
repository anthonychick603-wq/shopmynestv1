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

export default function SellerApplicationsAdmin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<AdminSellerApplication[]>([]);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [working, setWorking] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (user?.role !== "admin") return;
    try {
      const r = await nest.adminListSellerApplications({ status: "pending", per_page: 50 });
      setItems(r.items || []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not load applications");
    } finally { setLoading(false); setRefreshing(false); }
  }, [user?.role]);
  React.useEffect(() => { void load(); }, [load]);

  const approve = (app: AdminSellerApplication) => Alert.alert("Approve seller?", `${app.store_name || app.seller_name} will become an approved seller.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Approve", onPress: async () => { setWorking(app.id); try { await nest.adminApproveSellerApplication(app.id); setItems((x) => x.filter((i) => i.id !== app.id)); toast.success("Seller approved"); } catch (e) { toast.error(e instanceof ApiError ? e.friendly : "Could not approve seller"); } finally { setWorking(null); } } },
  ]);

  const reject = (app: AdminSellerApplication) => {
    const reason = (reasons[app.id] || "").trim();
    if (reason.length < 3) return toast.error("Add a short rejection reason first");
    Alert.alert("Reject application?", "The seller will be allowed to correct the application and resubmit.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: async () => { setWorking(app.id); try { await nest.adminRejectSellerApplication(app.id, { reason, can_resubmit: true }); setItems((x) => x.filter((i) => i.id !== app.id)); toast.success("Application rejected with feedback"); } catch (e) { toast.error(e instanceof ApiError ? e.friendly : "Could not reject application"); } finally { setWorking(null); } } },
    ]);
  };

  if (user?.role !== "admin") return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin/operations")} /><EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." /></SafeAreaView>;
  if (loading) return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin/operations")} /><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/admin/operations")} /><ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />} keyboardShouldPersistTaps="handled">
    {!items.length ? <EmptyState icon="checkmark-circle-outline" title="Queue clear" message="No seller applications are waiting for review." /> : items.map((app) => <View key={app.id} style={styles.card}>
      <Text style={styles.title}>{app.store_name || app.seller_name}</Text>
      <Text style={styles.sub}>{app.seller_name} · {app.seller_email}</Text>
      {app.about ? <Text style={styles.body}>{app.about}</Text> : null}
      {app.products ? <Text style={styles.meta}>Products: {app.products}</Text> : null}
      {app.categories ? <Text style={styles.meta}>Categories: {app.categories}</Text> : null}
      <TextInput value={reasons[app.id] || ""} onChangeText={(v) => setReasons((r) => ({ ...r, [app.id]: v }))} placeholder="Reason if rejecting…" placeholderTextColor={colors.onSurfaceMuted} multiline style={styles.input} />
      <View style={styles.actions}><Button title="Approve" size="sm" onPress={() => approve(app)} loading={working === app.id} style={{ flex: 1 }} /><Button title="Reject" size="sm" variant="outline" onPress={() => reject(app)} disabled={working === app.id} style={{ flex: 1 }} /></View>
    </View>)}
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
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
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
});
