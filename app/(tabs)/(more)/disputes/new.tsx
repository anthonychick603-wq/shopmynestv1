import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

const REASONS: { slug: string; label: string }[] = [
  { slug: "not_arrived", label: "Item never arrived" },
  { slug: "not_as_described", label: "Not as described" },
  { slug: "damaged", label: "Arrived damaged" },
  { slug: "wrong_item", label: "Wrong item sent" },
  { slug: "other", label: "Something else" },
];

export default function NewDispute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { order } = useLocalSearchParams<{ order?: string }>();
  const [reason, setReason] = useState<string>("not_arrived");
  const [description, setDescription] = useState("");
  const [contacted, setContacted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!order) return toast.error("Missing order reference");
    if (description.trim().length < 10) return toast.error("Please describe the issue (at least 10 characters)");
    setSubmitting(true);
    try {
      const res = await nest.trust.createDispute({
        order_id: Number(order),
        reason,
        description: description.trim(),
        contacted_seller_at: contacted ? new Date().toISOString() : undefined,
      });
      if (res.warning) toast.show(res.warning, "info");
      else toast.success("Dispute opened");
      router.replace(`/disputes/${res.dispute.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not open dispute");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} style={styles.topBtn} testID="new-dispute-close" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={styles.topTitle}>Open a dispute</Text>
        <View style={styles.topBtn} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
          <Text style={styles.infoText}>Buyer protection holds the seller's payout while we review. Most issues resolve faster if you message the seller first.</Text>
        </View>

        <Text style={styles.label}>Order</Text>
        <Text style={styles.orderRef}>#{order}</Text>

        <Text style={styles.label}>What went wrong?</Text>
        {REASONS.map((r) => {
          const selected = reason === r.slug;
          return (
            <TouchableOpacity key={r.slug} style={[styles.reasonRow, selected && styles.reasonRowSelected]} onPress={() => { haptics.tap(); setReason(r.slug); }} testID={`dispute-reason-${r.slug}`}>
              <Text style={[styles.reasonText, selected && { color: colors.brand, fontWeight: "800" }]}>{r.label}</Text>
              <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={20} color={selected ? colors.brand : colors.onSurfaceMuted} />
            </TouchableOpacity>
          );
        })}

        <Text style={styles.label}>Details</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Tell us what happened…"
          placeholderTextColor={colors.onSurfaceMuted}
          multiline
          style={styles.textarea}
          testID="dispute-description"
        />

        <TouchableOpacity style={styles.checkRow} onPress={() => { haptics.tap(); setContacted((c) => !c); }} testID="dispute-contacted">
          <Ionicons name={contacted ? "checkbox" : "square-outline"} size={22} color={contacted ? colors.brand : colors.onSurfaceMuted} />
          <Text style={styles.checkText}>I already contacted the seller about this</Text>
        </TouchableOpacity>

        <Button title="Submit dispute" onPress={() => { haptics.press(); submit(); }} loading={submitting} testID="dispute-submit" style={{ marginTop: spacing.lg }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  infoCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  infoText: { flex: 1, color: colors.onSurface, fontSize: 13 },
  label: { fontSize: 14, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.sm },
  orderRef: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  reasonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: "transparent" },
  reasonRowSelected: { borderColor: colors.brand },
  reasonText: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
  textarea: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, minHeight: 110, color: colors.onSurface, fontSize: 15, textAlignVertical: "top" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  checkText: { flex: 1, color: colors.onSurface, fontSize: 13 },
});
