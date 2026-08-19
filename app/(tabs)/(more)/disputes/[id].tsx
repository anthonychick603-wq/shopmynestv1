import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { format } from "date-fns";

import { nest, ApiError } from "@/src/api/nest";
import { toDispute } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Dispute } from "@/src/types";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { statusStyle, statusLabel, isResolved } from "@/src/utils/disputeStatus";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function DisputeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const raw = await nest.trust.getDispute(id!);
      setDispute(toDispute(raw));
    } catch {
      setDispute(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const escalate = async () => {
    setWorking(true);
    try {
      const raw = await nest.trust.escalateDispute(id!);
      setDispute(toDispute(raw));
      toast.success("Escalated to My Nest for review");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not escalate");
    } finally {
      setWorking(false);
    }
  };

  const respond = async () => {
    if (note.trim().length < 5) return toast.error("Please write a short response first");
    setWorking(true);
    try {
      const raw = await nest.trust.updateDispute(id!, { resolution_note: note.trim() });
      setDispute(toDispute(raw));
      setNote("");
      toast.success("Response sent");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not send response");
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/(tabs)/account")} /><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  if (!dispute) return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/(tabs)/account")} /><EmptyState icon="alert-circle-outline" title="Not found" message="This dispute could not be loaded." /></SafeAreaView>;

  const s = statusStyle(dispute.status);
  const isSeller = user?.role === "seller" || user?.role === "admin";
  const canRespond = isSeller && (dispute.status === "open" || dispute.status === "awaiting_seller");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/account")} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.statusCard}>
          <View style={[styles.statusDot, { backgroundColor: s.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>{statusLabel(dispute.status)}</Text>
            <Text style={styles.statusSub}>Dispute #{dispute.id} · Order #{dispute.order_id}</Text>
          </View>
          <TouchableOpacity onPress={() => { haptics.tap(); router.push(`/order/${dispute.order_id}`); }} testID="dispute-view-order">
            <Text style={styles.viewOrder}>View order</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Reason</Text>
        <Text style={styles.body}>{dispute.reason.replace(/_/g, " ")}</Text>

        <Text style={styles.label}>What happened</Text>
        <Text style={styles.body}>{dispute.description}</Text>

        {dispute.refund_amount != null ? (
          <>
            <Text style={styles.label}>Refund</Text>
            <Text style={styles.body}>${dispute.refund_amount.toFixed(2)}</Text>
          </>
        ) : null}

        {dispute.resolution_note ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>Latest response</Text>
            <Text style={styles.noteText}>{dispute.resolution_note}</Text>
          </View>
        ) : null}

        {dispute.created_at ? (
          <Text style={styles.meta}>Opened {format(new Date(dispute.created_at), "PPp")}</Text>
        ) : null}

        {canRespond ? (
          <View style={styles.actionBlock}>
            <Text style={styles.label}>Respond to the buyer</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Explain how you'll resolve this…"
              placeholderTextColor={colors.onSurfaceMuted}
              multiline
              style={styles.textarea}
              testID="dispute-response"
            />
            <Button title="Send response" onPress={() => { haptics.press(); respond(); }} loading={working} testID="dispute-respond-submit" style={{ marginTop: spacing.sm }} />
          </View>
        ) : null}

        {!isSeller && dispute.can_escalate && !isResolved(dispute.status) && dispute.status !== "escalated" ? (
          <View style={styles.actionBlock}>
            <Text style={styles.escalateHint}>Not resolved yet? You can ask My Nest to step in and review.</Text>
            <Button title="Escalate to My Nest" variant="outline" onPress={() => { haptics.warning(); escalate(); }} loading={working} testID="dispute-escalate" />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Dispute</Text>
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  statusCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, ...shadows.card },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusLabel: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  statusSub: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  viewOrder: { color: colors.brand, fontWeight: "800", fontSize: 13 },
  label: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.xs },
  body: { fontSize: 15, color: colors.onSurface, lineHeight: 22 },
  noteCard: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  noteLabel: { fontSize: 11, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  noteText: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
  meta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.lg },
  actionBlock: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.lg },
  escalateHint: { fontSize: 13, color: colors.onSurfaceMuted, marginBottom: spacing.md },
  textarea: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, minHeight: 90, color: colors.onSurface, fontSize: 15, textAlignVertical: "top" },
});
