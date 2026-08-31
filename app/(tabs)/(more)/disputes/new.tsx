import React, { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";

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
  const [evidence, setEvidence] = useState<ImagePicker.ImagePickerAsset[]>([]);


  const addEvidence = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return toast.error("Photo permission is needed to attach evidence.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 5 - evidence.length),
      });
      if (!result.canceled) setEvidence((cur) => [...cur, ...result.assets].slice(0, 5));
    } catch {
      toast.error("Could not open your photo library.");
    }
  };

  const uploadEvidence = async (): Promise<string[]> => {
    const urls: string[] = [];
    for (const asset of evidence) {
      const uri = asset.uri;
      const name = asset.fileName || uri.split("/").pop() || `evidence-${Date.now()}.jpg`;
      const type = asset.mimeType || "image/jpeg";
      const form = new FormData();
      form.append("file", { uri, name, type } as unknown as Blob);
      const media = await nest.uploadMedia(form);
      if (media.url) urls.push(media.url);
    }
    return urls;
  };

  const submit = async () => {
    if (!order) return toast.error("Missing order reference");
    if (description.trim().length < 10) return toast.error("Please describe the issue (at least 10 characters)");
    setSubmitting(true);
    try {
      const [refund, existingRaw] = await Promise.all([
        nest.getOrderRefund(order),
        nest.trust.listDisputes(),
      ]);
      const existingRows = Array.isArray(existingRaw) ? existingRaw : existingRaw.disputes || [];
      const existing = existingRows.find((d) => String(d.order_id) === String(order) && !String(d.status || "").startsWith("resolved_"));
      if (existing) {
        toast.show("A buyer-protection case is already open for this order.", "info");
        router.replace(`/disputes/${existing.id}`);
        return;
      }
      if (["requested", "approved", "processing", "completed"].includes(refund.state)) {
        toast.show("This order already has an active or completed refund resolution. Open the order to view it.", "info");
        router.replace(`/order/${order}`);
        return;
      }
      if (refund.state === "none" && refund.eligibility?.can_request) {
        toast.show("Start with the refund request on the order. Buyer protection is the escalation path if that cannot resolve the issue.", "info");
        router.replace(`/order/${order}`);
        return;
      }

      const evidenceUrls = await uploadEvidence();
      const res = await nest.trust.createDispute({
        order_id: Number(order),
        reason,
        description: description.trim(),
        contacted_seller_at: contacted ? new Date().toISOString() : undefined,
        evidence: evidenceUrls.length ? evidenceUrls : undefined,
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
        <AlertsBellButton />
      </View>
      <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
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


        <Text style={styles.label}>Evidence photos <Text style={styles.optional}>(optional)</Text></Text>
        <Text style={styles.evidenceHelp}>Attach up to 5 photos that show damage, the wrong item, packaging, or other details that help explain the issue.</Text>
        {evidence.length ? (
          <View style={styles.evidenceRow}>
            {evidence.map((asset, index) => (
              <View key={`${asset.uri}-${index}`} style={styles.evidenceThumbWrap}>
                <Image source={{ uri: asset.uri }} style={styles.evidenceThumb} />
                <TouchableOpacity
                  style={styles.removeEvidence}
                  onPress={() => setEvidence((cur) => cur.filter((_, i) => i !== index))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove evidence photo ${index + 1}`}
                >
                  <Ionicons name="close" size={14} color={colors.onBrand} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        {evidence.length < 5 ? (
          <TouchableOpacity style={styles.addEvidenceBtn} onPress={addEvidence} testID="dispute-add-evidence">
            <Ionicons name="images-outline" size={18} color={colors.brand} />
            <Text style={styles.addEvidenceText}>{evidence.length ? "Add another photo" : "Add evidence photos"}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.checkRow} onPress={() => { haptics.tap(); setContacted((c) => !c); }} testID="dispute-contacted">
          <Ionicons name={contacted ? "checkbox" : "square-outline"} size={22} color={contacted ? colors.brand : colors.onSurfaceMuted} />
          <Text style={styles.checkText}>I already contacted the seller about this</Text>
        </TouchableOpacity>

        <Button title="Submit dispute" onPress={() => { haptics.press(); submit(); }} loading={submitting} testID="dispute-submit" style={{ marginTop: spacing.lg }} />
      </KeyboardAwareScroll>
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
  optional: { fontWeight: "500", color: colors.onSurfaceMuted },
  evidenceHelp: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  evidenceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  evidenceThumbWrap: { width: 68, height: 68, position: "relative" },
  evidenceThumb: { width: 68, height: 68, borderRadius: radius.sm, backgroundColor: colors.surfaceTertiary },
  removeEvidence: { position: "absolute", top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.error, alignItems: "center", justifyContent: "center" },
  addEvidenceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  addEvidenceText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  checkText: { flex: 1, color: colors.onSurface, fontSize: 13 },
});
