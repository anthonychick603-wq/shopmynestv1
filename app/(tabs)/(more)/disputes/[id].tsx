import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
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
import { ErrorState } from "@/src/components/ErrorState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { statusStyle, statusLabel, isResolved } from "@/src/utils/disputeStatus";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { parseServerDate } from "@/src/utils/datetime";
import { RequireAuth } from "@/src/components/RequireAuth";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";

export default function DisputeDetail() {
  return (
    <RequireAuth message={'Sign in to view this dispute.'}>
      <DisputeDetailImpl />
    </RequireAuth>
  );
}

function DisputeDetailImpl() {
  useBackFallback("/(tabs)/account");
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [working, setWorking] = useState(false);
  // v1.0.243 — distinguish "not found" (real 404) from "couldn't load"
  // (transient error). Failing dispute detail loads previously all
  // rendered as "not found", making network hiccups look permanent.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setNotFound(false);
    try {
      const raw = await nest.trust.getDispute(id!);
      setDispute(toDispute(raw));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true);
      } else {
        setErrorMsg(e instanceof ApiError ? e.friendly : "Couldn't load this dispute.");
      }
      setDispute(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useInvalidateOnFocus(["orders"], load);

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

  const resolveAsAdmin = async (status: "resolved_refund" | "resolved_partial" | "resolved_no_refund") => {
    const amount = Number(partialAmount.replace(/[^0-9.]/g, ""));
    if (status === "resolved_partial" && (!Number.isFinite(amount) || amount <= 0)) {
      return toast.error("Enter the partial refund amount first");
    }
    const label = status === "resolved_refund" ? "full refund" : status === "resolved_partial" ? `partial refund of $${amount.toFixed(2)}` : "no refund";
    Alert.alert("Resolve buyer protection?", `This will close the case with ${label}.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Resolve", style: status === "resolved_no_refund" ? "destructive" : "default", onPress: async () => {
        setWorking(true);
        try {
          const raw = await nest.trust.updateDispute(id!, {
            status,
            resolution_note: note.trim() || (status === "resolved_no_refund" ? "Reviewed by My Nest; no refund approved." : "Refund approved by My Nest buyer protection."),
            ...(status === "resolved_partial" ? { refund_amount: amount } : {}),
          });
          setDispute(toDispute(raw));
          setNote("");
          setPartialAmount("");
          toast.success("Buyer-protection case resolved");
        } catch (e) {
          toast.error(e instanceof ApiError ? e.friendly : "Could not resolve case");
        } finally {
          setWorking(false);
        }
      } },
    ]);
  };

  if (loading) return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/(tabs)/account")} /><View style={styles.center}><ActivityIndicator color={colors.brand} /></View></SafeAreaView>;
  if (errorMsg) return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/(tabs)/account")} /><ErrorState message={errorMsg} onRetry={() => load()} /></SafeAreaView>;
  if (notFound || !dispute) return <SafeAreaView style={styles.safe} edges={["top"]}><Top onBack={() => safeBack(router, "/(tabs)/account")} /><EmptyState icon="alert-circle-outline" title="Not found" message="This dispute could not be loaded." /></SafeAreaView>;

  const s = statusStyle(dispute.status);
  const isAdmin = user?.role === "admin";
  const isSeller = user?.role === "seller";
  const canRespond = isSeller && (dispute.status === "open" || dispute.status === "awaiting_seller");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/account")} />
      <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.statusCard}>
          <View style={[styles.statusDot, { backgroundColor: s.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>{statusLabel(dispute.status)}</Text>
            <Text style={styles.statusSub}>Dispute #{dispute.id} · Order #{dispute.order_id}</Text>
          </View>
          <TouchableOpacity onPress={() => { haptics.tap(); router.push(`/order/${dispute.order_id}`); }} testID="dispute-view-order" accessibilityRole="button">
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
          <Text style={styles.meta}>Opened {format(parseServerDate(dispute.created_at) ?? new Date(0), "PPp")}</Text>
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

        {isAdmin && !isResolved(dispute.status) ? (
          <View style={styles.actionBlock}>
            <Text style={styles.label}>Admin resolution</Text>
            <Text style={styles.escalateHint}>Resolve the case here. Refund decisions are processed through the same server refund lifecycle used by the order.</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="Decision note…" placeholderTextColor={colors.onSurfaceMuted} multiline style={styles.textarea} />
            <TextInput value={partialAmount} onChangeText={setPartialAmount} placeholder="Partial refund amount" placeholderTextColor={colors.onSurfaceMuted} keyboardType="decimal-pad" style={styles.amountInput} />
            <Button title="Approve full refund" onPress={() => void resolveAsAdmin("resolved_refund")} loading={working} style={{ marginTop: spacing.sm }} />
            <Button title="Approve partial refund" variant="outline" onPress={() => void resolveAsAdmin("resolved_partial")} disabled={working} style={{ marginTop: spacing.sm }} />
            <Button title="Resolve with no refund" variant="ghost" onPress={() => void resolveAsAdmin("resolved_no_refund")} disabled={working} style={{ marginTop: spacing.xs }} />
          </View>
        ) : null}

        {!isSeller && !isAdmin && dispute.can_escalate && !isResolved(dispute.status) && dispute.status !== "escalated" ? (
          <View style={styles.actionBlock}>
            <Text style={styles.escalateHint}>Not resolved yet? You can ask My Nest to step in and review.</Text>
            <Button title="Escalate to My Nest" variant="outline" onPress={() => { haptics.warning(); escalate(); }} loading={working} testID="dispute-escalate" />
          </View>
        ) : null}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Dispute</Text>
      <AlertsBellButton />
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
  amountInput: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 48, color: colors.onSurface, fontSize: 15, marginTop: spacing.sm },
});
