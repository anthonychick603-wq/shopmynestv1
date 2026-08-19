/**
 * RefundStatusCard
 *
 * Buyer-facing view of the marketplace refund lifecycle. Renders:
 *   - Current state (badge + plain-English label)
 *   - Amount summary (requested / refunded)
 *   - Reason + denial note when relevant
 *   - Timeline of state transitions
 *   - "Request refund" CTA when eligible, or plain-English blockers
 *
 * Backed by the /orders/{id}/refund and /orders/{id}/refund-request
 * endpoints introduced in MNU v3.7.90 (class-mnu-refund-lifecycle.php).
 *
 * @since v1.0.49
 */

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";

import { nest, ApiError, type NestRefundStatus, type NestRefundState } from "@/src/api/nest";
import { colors, radius, shadows, spacing, statusPalette } from "@/src/theme";
import { Input } from "@/src/components/Input";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";

type Props = {
  orderId: number | string;
  refund: NestRefundStatus;
  onChange: (next: NestRefundStatus) => void;
};

const REASONS: { key: string; label: string }[] = [
  { key: "not_as_described", label: "Item not as described" },
  { key: "damaged", label: "Arrived damaged or broken" },
  { key: "wrong_item", label: "Wrong item received" },
  { key: "never_arrived", label: "Never arrived" },
  { key: "changed_mind", label: "Changed my mind" },
  { key: "other", label: "Something else" },
];

// v1.0.95 — refund badge tone now comes from the shared statusPalette so
// this badge and the order-status pill next to it read as the same color
// language (waiting/inMotion/done/error/neutral).
function badgeColorFor(state: NestRefundState): { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (state) {
    case "requested":  return { ...statusPalette.waiting,  icon: "time-outline" };
    case "approved":   return { ...statusPalette.inMotion, icon: "checkmark-circle-outline" };
    case "processing": return { ...statusPalette.inMotion, icon: "sync-outline" };
    case "completed":  return { ...statusPalette.done,     icon: "checkmark-done-outline" };
    case "denied":     return { ...statusPalette.error,    icon: "close-circle-outline" };
    case "none":
    default:           return { ...statusPalette.neutral,  icon: "receipt-outline" };
  }
}

export function RefundStatusCard({ orderId, refund, onChange }: Props) {
  const badge = badgeColorFor(refund.state);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState<string>(REASONS[0].key);
  const [details, setDetails] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const currency = refund.currency || "USD";
  const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

  const canRequest = refund.eligibility?.can_request === true;
  const blockers = refund.eligibility?.blockers || [];

  const reasonLabel = useMemo(
    () => REASONS.find((r) => r.key === reason)?.label || REASONS[0].label,
    [reason]
  );

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const next = await nest.requestOrderRefund(orderId, { reason: reasonLabel, details });
      onChange(next);
      setModalOpen(false);
      setDetails("");
      toast.show("Refund request sent");
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.friendly || err.message
          : "Couldn't send your refund request. Please try again.";
      toast.show(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.card} testID="refund-status-card">
      <View style={styles.headerRow}>
        <Text style={styles.cardLabel}>Refund status</Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Ionicons name={badge.icon} size={14} color={badge.fg} />
          <Text style={[styles.badgeText, { color: badge.fg }]}>{refund.label}</Text>
        </View>
      </View>

      {refund.state === "none" ? (
        <Text style={styles.helper}>
          No refund activity on this order.{" "}
          {canRequest
            ? `Refunds are available within ${refund.eligibility.policy_days} days of delivery for unused items.`
            : ""}
        </Text>
      ) : null}

      {refund.requested_amount > 0 || refund.refunded_amount > 0 ? (
        <View style={styles.amountBox}>
          {refund.requested_amount > 0 ? (
            <View style={styles.amountRow}>
              <Text style={styles.amountKey}>Requested</Text>
              <Text style={styles.amountVal}>{money(refund.requested_amount)}</Text>
            </View>
          ) : null}
          {refund.refunded_amount > 0 ? (
            <View style={styles.amountRow}>
              <Text style={styles.amountKey}>Refunded to card</Text>
              <Text style={styles.amountVal}>{money(refund.refunded_amount)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {refund.reason ? (
        <View style={styles.metaBlock}>
          <Text style={styles.metaKey}>Reason</Text>
          <Text style={styles.metaVal}>{refund.reason}</Text>
          {refund.details ? <Text style={styles.metaSub}>{refund.details}</Text> : null}
        </View>
      ) : null}

      {refund.state === "denied" && refund.denial_note ? (
        <View style={[styles.metaBlock, styles.denialBlock]}>
          <Text style={styles.metaKey}>Note from our team</Text>
          <Text style={styles.metaVal}>{refund.denial_note}</Text>
        </View>
      ) : null}

      {refund.state === "processing" ? (
        <Text style={styles.helper}>
          Refunds take 5–10 business days to appear on your card. We'll email you when it's confirmed.
        </Text>
      ) : null}

      {refund.timeline && refund.timeline.length > 0 ? (
        <View style={styles.timeline}>
          {refund.timeline.map((t, i) => (
            <View key={`${t.at}-${i}`} style={styles.timelineRow}>
              <View style={styles.timelineDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineLabel}>{t.label}</Text>
                <Text style={styles.timelineWhen}>{safeDate(t.at)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {canRequest ? (
        <TouchableOpacity
          style={styles.cta}
          onPress={() => setModalOpen(true)}
          testID="refund-request-open"
        >
          <Ionicons name="return-down-back-outline" size={18} color={colors.onBrand} />
          <Text style={styles.ctaText}>Request refund</Text>
        </TouchableOpacity>
      ) : refund.state === "none" && blockers.length > 0 ? (
        <View style={styles.blockerBlock}>
          <Text style={styles.blockerHeader}>You can't request a refund on this order</Text>
          {blockers.map((b, i) => (
            <View key={i} style={styles.blockerRow}>
              <Ionicons name="alert-circle-outline" size={14} color={colors.onSurfaceMuted} />
              <Text style={styles.blockerText}>{b}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Modal
        transparent
        visible={modalOpen}
        animationType="slide"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Request a refund</Text>
            <Text style={styles.modalSub}>
              Tell us what happened. If approved, the refund will be issued to the card used at checkout.
            </Text>
            <Text style={styles.modalKey}>Reason</Text>
            <ScrollView style={styles.reasonList} showsVerticalScrollIndicator={false}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.reasonRow, reason === r.key && styles.reasonRowActive]}
                  onPress={() => setReason(r.key)}
                >
                  <Ionicons
                    name={reason === r.key ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={reason === r.key ? colors.brand : colors.onSurfaceMuted}
                  />
                  <Text style={styles.reasonLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.modalKey}>Details (optional)</Text>
            <Input
              value={details}
              onChangeText={setDetails}
              placeholder="Photos, dates, condition, anything that helps our team review."
              multiline
              numberOfLines={4}
              style={styles.detailsInput}
              testID="refund-request-details"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setModalOpen(false)}
                disabled={submitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Button
                title={submitting ? "Sending…" : "Send request"}
                onPress={submit}
                disabled={submitting}
                testID="refund-request-submit"
              />
              {submitting ? <ActivityIndicator style={{ marginLeft: spacing.sm }} /> : null}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function safeDate(iso: string): string {
  if (!iso) return "";
  try {
    return format(new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z")), "MMM d, h:mm a");
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardLabel: { color: colors.onSurfaceMuted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
  helper: { color: colors.onSurfaceMuted, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
  amountBox: {
    marginTop: spacing.md,
    backgroundColor: "#FBFAF6",
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  amountRow: { flexDirection: "row", justifyContent: "space-between" },
  amountKey: { color: colors.onSurfaceMuted, fontSize: 13 },
  amountVal: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  metaBlock: { marginTop: spacing.md },
  metaKey: { color: colors.onSurfaceMuted, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" },
  metaVal: { color: colors.onSurface, fontSize: 14, marginTop: 2 },
  metaSub: { color: colors.onSurfaceMuted, fontSize: 13, marginTop: 2 },
  denialBlock: { backgroundColor: "#FCF3F3", padding: spacing.md, borderRadius: radius.md },
  timeline: { marginTop: spacing.md, paddingLeft: spacing.xs },
  timelineRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm, alignItems: "flex-start" },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.brand,
    marginTop: 6,
  },
  timelineLabel: { color: colors.onSurface, fontSize: 13 },
  timelineWhen: { color: colors.onSurfaceMuted, fontSize: 11, marginTop: 1 },
  cta: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  ctaText: { color: colors.onBrand, fontWeight: "700", fontSize: 15 },
  blockerBlock: {
    marginTop: spacing.md,
    backgroundColor: "#FBFAF6",
    borderRadius: radius.md,
    padding: spacing.md,
  },
  blockerHeader: { color: colors.onSurface, fontSize: 13, fontWeight: "600", marginBottom: 4 },
  blockerRow: { flexDirection: "row", gap: 6, marginTop: 4, alignItems: "flex-start" },
  blockerText: { flex: 1, color: colors.onSurfaceMuted, fontSize: 13, lineHeight: 18 },

  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
    maxHeight: "85%",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  modalSub: { color: colors.onSurfaceMuted, fontSize: 13, lineHeight: 18 },
  modalKey: { color: colors.onSurfaceMuted, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase", marginTop: spacing.sm },
  reasonList: { maxHeight: 220 },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  reasonRowActive: { backgroundColor: "#FBFAF6" },
  reasonLabel: { fontSize: 14, color: colors.onSurface },
  detailsInput: { minHeight: 88, textAlignVertical: "top" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  modalCancel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  modalCancelText: { color: colors.onSurfaceMuted, fontWeight: "600" },
});
