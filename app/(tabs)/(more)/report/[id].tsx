import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";

const REASONS = [
  { id: "prohibited", label: "Prohibited item" },
  { id: "misleading", label: "Misleading description" },
  { id: "copyright", label: "Copyright concern" },
  { id: "inappropriate", label: "Inappropriate content" },
  { id: "scam", label: "Scam or fraud concern" },
  { id: "other", label: "Other" },
] as const;

export default function ReportItem() {
  // v1.0.76 — `type` selects which endpoint we hit. Default remains
  // "product" so all existing product-report entry points keep working with
  // no changes; blog posts pass `?type=blog_post` from the 3-dot menu.
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const isBlog = type === "blog_post";
  const headerTitle = isBlog ? "Report post" : "Report item";

  const submit = async () => {
    if (!reason) return toast.error("Please choose a reason");
    setBusy(true);
    try {
      if (isBlog) {
        await nest.reportBlogPost(id!, reason, details);
      } else {
        await nest.reportProduct(id!, reason, details);
      }
      toast.success("Thanks — our team will review.");
      safeBack(router, "/(tabs)");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not submit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.top}>
          <TouchableOpacity onPress={() => safeBack(router, "/(tabs)")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
          <Text style={styles.topTitle}>{headerTitle}</Text>
          <View style={styles.topBtn} />
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <Text style={styles.body}>{"Tell us what's wrong — our team will review your report."}</Text>
          {REASONS.map((r) => (
            <TouchableOpacity key={r.id} onPress={() => setReason(r.id)} style={[styles.row, reason === r.id && styles.rowActive]} testID={`report-reason-${r.id}`}>
              <Ionicons name={reason === r.id ? "radio-button-on" : "radio-button-off"} size={22} color={reason === r.id ? colors.brand : colors.onSurfaceMuted} />
              <Text style={styles.rowLabel}>{r.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ marginTop: spacing.md }}>
            <Input label="Additional details (optional)" value={details} onChangeText={setDetails} multiline testID="report-explain" style={{ height: 120, textAlignVertical: "top" }} />
          </View>
          <Button title="Submit report" onPress={submit} loading={busy} testID="report-submit" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  body: { color: colors.onSurfaceMuted, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: "transparent" },
  rowActive: { borderColor: colors.brand },
  rowLabel: { color: colors.onSurface, fontWeight: "600" },
});
