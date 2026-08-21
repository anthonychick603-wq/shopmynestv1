import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError, type NestSellerBank } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

// v3.8.0 — the Stripe Connect flow has been retired. Sellers now save a
// routing + account number directly on this screen; the platform ACHs
// their share from a business checking account after the holding window.
// The route path stays `/seller/connect` so every existing readiness link
// and dashboard button keeps working with no navigator changes.

type UiState = "loading" | "empty" | "saved" | "editing";

const digitsOnly = (v: string) => v.replace(/\D+/g, "");

export default function SellerBankAccount() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isSeller = !!user && (user.role === "seller" || user.role === "admin");

  const [bank, setBank] = useState<NestSellerBank | null>(null);
  const [ui, setUi] = useState<UiState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [holderName, setHolderName]     = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccount, setConfirmAccount] = useState("");

  const load = useCallback(async () => {
    if (!isSeller) return;
    try {
      const res = await nest.getSellerBank();
      setBank(res);
      setUi(res.has_bank ? "saved" : "empty");
      setError(null);
      if (res.has_bank) {
        // Prefill holder name so an "Edit" reveals what they typed last
        // time (routing/account numbers are never returned by the server
        // — the seller has to re-type those to change them).
        setHolderName(res.holder_name || "");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load your bank account details.");
      setUi("empty");
    }
  }, [isSeller]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => { if (!isSeller) setUi("empty"); }, [isSeller]);

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!holderName.trim()) m.push("Account holder name");
    if (digitsOnly(routingNumber).length !== 9) m.push("9-digit routing number");
    const acct = digitsOnly(accountNumber);
    if (acct.length < 4 || acct.length > 17) m.push("Account number (4–17 digits)");
    if (digitsOnly(confirmAccount) !== acct) m.push("Account number confirmation must match");
    return m;
  }, [holderName, routingNumber, accountNumber, confirmAccount]);

  const submit = async () => {
    if (missing.length) {
      toast.error("Please fix: " + missing.join(", "));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await nest.saveSellerBank({
        holder_name: holderName.trim(),
        routing_number: digitsOnly(routingNumber),
        account_number: digitsOnly(accountNumber),
      });
      setBank(res);
      setUi("saved");
      setRoutingNumber("");
      setAccountNumber("");
      setConfirmAccount("");
      toast.success("Bank account saved.");
      // Notify anything watching (dashboard readiness card).
      haptics.success();
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Could not save your bank account. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => safeBack(router, "/(tabs)/seller/dashboard");

  if (!isSeller) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={goBack} />
        <EmptyState icon="lock-closed-outline" title="Sellers only" message="Only marketplace sellers can add a payout bank account." />
      </SafeAreaView>
    );
  }

  if (ui === "loading") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={goBack} />
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  // Saved: show a masked card + Edit button. This is the "on file" state.
  if (ui === "saved" && bank?.has_bank) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={goBack} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
          <View style={styles.savedCard}>
            <View style={styles.savedIconWrap}>
              <Ionicons name="checkmark-circle" size={40} color={colors.onBrand} />
            </View>
            <Text style={styles.savedTitle}>Bank account on file</Text>
            <Text style={styles.savedSub}>Account ending in {"\u2022\u2022\u2022\u2022"}{bank.last4}</Text>
            {bank.holder_name ? <Text style={styles.savedHolder}>{bank.holder_name}</Text> : null}
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.onSurfaceMuted} />
            <Text style={styles.infoText}>
              Earnings are held for 7 days after each order is paid, then ACH&apos;d to this account. Payouts settle within 1–2 business days.
            </Text>
          </View>

          <Button
            title="Edit bank account"
            variant="secondary"
            onPress={() => {
              haptics.press();
              setRoutingNumber("");
              setAccountNumber("");
              setConfirmAccount("");
              setUi("editing");
            }}
            testID="bank-edit"
            style={{ marginTop: spacing.lg }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Empty or editing: show the form.
  const isEditing = ui === "editing";
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={goBack} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.introTitle}>
            {isEditing ? "Update your bank account" : "Add your bank account"}
          </Text>
          <Text style={styles.introBody}>
            ShopMyNest deposits your earnings directly into this account by ACH after the 7-day holding window. We never share your details with buyers or other sellers.
          </Text>

          <Input
            label="Account holder name"
            value={holderName}
            onChangeText={setHolderName}
            autoCapitalize="words"
            testID="bank-holder"
          />
          <Input
            label="Routing number"
            value={routingNumber}
            onChangeText={(v) => setRoutingNumber(digitsOnly(v).slice(0, 9))}
            keyboardType="number-pad"
            hint="9 digits, printed on the bottom-left of your checks"
            testID="bank-routing"
          />
          <Input
            label="Account number"
            value={accountNumber}
            onChangeText={(v) => setAccountNumber(digitsOnly(v).slice(0, 17))}
            keyboardType="number-pad"
            secureTextEntry
            testID="bank-account"
          />
          <Input
            label="Confirm account number"
            value={confirmAccount}
            onChangeText={(v) => setConfirmAccount(digitsOnly(v).slice(0, 17))}
            keyboardType="number-pad"
            secureTextEntry
            testID="bank-account-confirm"
          />

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            title={isEditing ? "Save changes" : "Save bank account"}
            onPress={() => { haptics.press(); submit(); }}
            loading={busy}
            testID="bank-submit"
            style={{ marginTop: spacing.lg }}
          />

          {isEditing ? (
            <TouchableOpacity
              onPress={() => { haptics.tap(); setUi("saved"); }}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Payout bank account</Text>
      <AlertsBellButton />
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },

  introTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "800", marginBottom: spacing.sm },
  introBody:  { color: colors.onSurfaceMuted, fontSize: 13, lineHeight: 19, marginBottom: spacing.lg },

  savedCard: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", ...shadows.card },
  savedIconWrap: { marginBottom: spacing.sm },
  savedTitle: { color: colors.onBrand, fontSize: 18, fontWeight: "800" },
  savedSub:   { color: colors.onBrand, fontSize: 15, marginTop: 4, letterSpacing: 1 },
  savedHolder:{ color: colors.onBrand, opacity: 0.9, fontSize: 13, marginTop: spacing.sm },

  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  infoText: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17, flex: 1 },

  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },

  cancelBtn: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelText: { color: colors.onSurfaceMuted, fontWeight: "700" },
});
