import React, { useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, shadows } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { nest, ApiError } from "@/src/api/nest";
import type { Order } from "@/src/types";

// v1.0.51 - buyer review CTA on the order screen. Shows once shipping_status
// is shipped or delivered and the plugin flags the order reviewable. One row
// per seller on the order (buyers can rate each seller separately). Persists
// a per-seller "reviewed" state locally so the CTA disappears after submit
// without waiting for a full order refetch.
export function OrderReviewCTA({ order }: { order: Order }) {
  const sellers = useMemo(() => {
    const bySeller: Record<number, string> = {};
    for (const it of order.items) {
      const sid = Number(it.product.seller?.id);
      if (!sid) continue;
      if (!bySeller[sid]) bySeller[sid] = it.product.seller?.name || "";
    }
    return order.reviewable_seller_ids
      .filter((sid) => bySeller[sid] !== undefined)
      .map((sid) => ({ id: sid, name: bySeller[sid] || "Seller" }));
  }, [order]);

  const [reviewed, setReviewed] = useState<Record<number, boolean>>({});
  const [active, setActive] = useState<{ id: number; name: string } | null>(null);
  const pending = sellers.filter((s) => !reviewed[s.id]);

  if (!order.can_review || pending.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="star-outline" size={20} color={colors.brand} />
        <Text style={styles.headerText}>How did your order go?</Text>
      </View>
      <Text style={styles.subline}>
        Rate the {pending.length === 1 ? "seller" : "sellers"} on this order so future buyers know what to expect.
      </Text>
      {pending.map((s) => (
        <TouchableOpacity
          key={s.id}
          onPress={() => setActive(s)}
          style={styles.row}
          testID={`order-review-${s.id}`}
        >
          <Text style={styles.rowName}>{s.name}</Text>
          <View style={styles.rowRight}>
            <Text style={styles.rowCta}>Leave a review</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceMuted} />
          </View>
        </TouchableOpacity>
      ))}
      {active ? (
        <ReviewModal
          orderId={order.id}
          seller={active}
          onClose={() => setActive(null)}
          onSubmitted={(sid) => {
            setReviewed((prev) => ({ ...prev, [sid]: true }));
            setActive(null);
          }}
        />
      ) : null}
    </View>
  );
}

function ReviewModal({
  orderId,
  seller,
  onClose,
  onSubmitted,
}: {
  orderId: string;
  seller: { id: number; name: string };
  onClose: () => void;
  onSubmitted: (sellerId: number) => void;
}) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await nest.submitSellerReview(seller.id, {
        rating,
        review: text.trim(),
        order_id: orderId,
      });
      toast.success("Review posted");
      onSubmitted(seller.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not post this review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Review {seller.name}</Text>
            <TouchableOpacity onPress={onClose} testID="order-review-close">
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} testID={`order-review-star-${n}`}>
                <Ionicons name={n <= rating ? "star" : "star-outline"} size={30} color={colors.brand} />
              </TouchableOpacity>
            ))}
          </View>
          <Input
            label="Your review (optional)"
            value={text}
            onChangeText={setText}
            placeholder="What stood out about this seller?"
            multiline
            numberOfLines={4}
            testID="order-review-text"
          />
          <Button title="Post review" onPress={submit} loading={busy} testID="order-review-submit" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  headerText: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  subline: { fontSize: 13, color: colors.onSurfaceMuted, lineHeight: 19, marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  rowName: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowCta: { fontSize: 13, fontWeight: "700", color: colors.brand },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  stars: { flexDirection: "row", gap: spacing.sm, alignSelf: "center", marginBottom: spacing.lg },
});
