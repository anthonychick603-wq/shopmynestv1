import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { initStripe, useStripe, PaymentSheetError } from "@stripe/stripe-react-native";
import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { useStripeKey, STRIPE_MERCHANT_ID, STRIPE_URL_SCHEME } from "@/src/context/StripePayment";
import { Button } from "./Button";
import { toast } from "./Toast";

// Boost tiers. The plugin only supports "3day" and "7day"
// (class-tnm-trust-boosts.php TIERS); any other value silently falls back to
// "3day" server-side, so we expose exactly these two.
const TIERS: { slug: string; label: string; blurb: string }[] = [
  { slug: "3day", label: "3-day boost", blurb: "Featured placement for 3 days" },
  { slug: "7day", label: "7-day boost", blurb: "A full week of extra reach" },
];

type Props = { visible: boolean; product: Product; onClose: () => void };

export function BoostSheet({ visible, product, onClose }: Props) {
  const [tier, setTier] = useState("3day");
  const [submitting, setSubmitting] = useState(false);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { setPublishableKey } = useStripeKey();

  const purchase = async () => {
    setSubmitting(true);
    try {
      // 1. Create the boost order + PaymentIntent.
      const intent = await nest.trust.createBoost({ product_id: Number(product.id), tier });

      if (!intent.client_secret || !intent.publishable_key) {
        toast.error("Checkout is temporarily unavailable. Please try again.");
        return;
      }

      // 2. Initialize the native SDK with the publishable key from the response.
      setPublishableKey(intent.publishable_key);
      await initStripe({
        publishableKey: intent.publishable_key,
        merchantIdentifier: STRIPE_MERCHANT_ID,
        urlScheme: STRIPE_URL_SCHEME,
      });

      // 3. Build the PaymentSheet.
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "MyNest",
        paymentIntentClientSecret: intent.client_secret,
        customerId: intent.customer_id,
        customerEphemeralKeySecret: intent.ephemeral_key_secret,
        allowsDelayedPaymentMethods: false,
        applePay: { merchantCountryCode: "US" },
        googlePay: {
          merchantCountryCode: "US",
          currencyCode: intent.currency?.toUpperCase() || "USD",
          testEnv: true, // TODO: set to false for the production release.
        },
      });
      if (initError) {
        toast.error(initError.message || "Could not start checkout.");
        return;
      }

      // 4. Present the sheet and let the seller pay without leaving the app.
      const { error: sheetError } = await presentPaymentSheet();
      if (sheetError) {
        // User dismissing the sheet is not an error — stop quietly.
        if (sheetError.code === PaymentSheetError.Canceled) return;
        toast.error(sheetError.message || "Payment could not be completed.");
        return;
      }

      // 5. Payment succeeded — the Stripe webhook activates the boost server-side.
      onClose();
      toast.success("Boost activated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not start boost checkout");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Ionicons name="rocket" size={20} color={colors.brand} />
            <Text style={styles.title}>Boost this listing</Text>
          </View>
          <Text style={styles.subtitle} numberOfLines={2}>{product.title}</Text>

          {TIERS.map((t) => {
            const selected = tier === t.slug;
            return (
              <TouchableOpacity
                key={t.slug}
                onPress={() => setTier(t.slug)}
                style={[styles.tier, selected && styles.tierSelected]}
                testID={`boost-tier-${t.slug}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.tierLabel}>{t.label}</Text>
                  <Text style={styles.tierBlurb}>{t.blurb}</Text>
                </View>
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={22}
                  color={selected ? colors.brand : colors.onSurfaceMuted}
                />
              </TouchableOpacity>
            );
          })}

          <Text style={styles.hint}>Pay securely in the app — your boost activates automatically once payment completes.</Text>
          <Button title="Continue to payment" onPress={purchase} loading={submitting} testID="boost-submit" style={{ marginTop: spacing.md }} />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: spacing["2xl"] },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 14, color: colors.onSurfaceMuted, marginTop: 2, marginBottom: spacing.md },
  tier: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: "transparent" },
  tierSelected: { borderColor: colors.brand },
  tierLabel: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  tierBlurb: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  hint: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.sm },
});
