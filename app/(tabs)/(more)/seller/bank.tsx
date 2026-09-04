import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError, type NestSellerBank } from "@/src/api/nest";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { ErrorState } from "@/src/components/ErrorState";

// v3.8.0 — the Stripe Connect flow has been retired. Sellers now save a
// routing + account number directly on this screen; the platform ACHs
// their share from a business checking account after the holding window and a seller payout request.
//
// v1.0.128 — file moved from /seller/connect → /seller/bank so the path
// no longer reads like a Stripe Connect leftover. Plugin v3.10.0 emits
// the new deep link in the readiness endpoint; a legacy connect.tsx
// Redirect alias in this directory keeps older readiness payloads and
// any lingering deep links working for one release.

type UiState = "loading" | "empty" | "saved" | "editing" | "loadError";

const digitsOnly = (v: string) => v.replace(/\D+/g, "");

// v1.0.247 — ABA routing number checksum. The standard 3-7-1-3-7-1-3-7-1
// weighted sum modulo 10 catches most single-digit typos before the
// server round-trip. Length + all-digits is checked separately by the
// caller (audit P1).
const WEIGHTS = [3, 7, 1, 3, 7, 1, 3, 7, 1];
function isValidAbaRouting(digits: string): boolean {
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * WEIGHTS[i];
  return sum % 10 === 0;
}

export default function SellerBankAccount() {
  useBackFallback("/(tabs)/seller/dashboard");
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

  // v1.0.247 — use latest-request pattern so a fast focus refire or a
  // back-nav can't setState on an unmounted screen, and so overlapping
  // loads converge on the fresher one (audit P0).
  const { begin, isCurrent } = useLatestRequest();

  const load = useCallback(async () => {
    if (!isSeller) return;
    const reqId = begin();
    try {
      const res = await nest.getSellerBank();
      if (!isCurrent(reqId)) return;
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
      if (!isCurrent(reqId)) return;
      // v1.0.247 — previously fell through to "empty" on error, which
      // rendered the "Add your bank account" form. If the seller then
      // typed new details and hit Save, we'd silently overwrite a
      // perfectly good server-side bank record on what was actually a
      // transient network hiccup. Now we surface an explicit retry
      // state so the seller can distinguish "no bank on file" from
      // "couldn't reach the server" (audit P1).
      setError(e instanceof ApiError ? e.friendly : "Could not load your bank account details.");
      setUi("loadError");
    }
  }, [isSeller, begin, isCurrent]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // v1.0.247 — the previous `useEffect(() => { if (!isSeller) setUi("empty") })`
  // was redundant: the non-seller branch is already short-circuited on
  // the render path with a full Sellers-only EmptyState. Dropping the
  // effect removes an extra setter on the unmount edge (audit P3).

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!holderName.trim()) m.push("Account holder name");
    const routing = digitsOnly(routingNumber);
    if (routing.length !== 9) {
      m.push("9-digit routing number");
    } else if (!isValidAbaRouting(routing)) {
      // v1.0.247 — ABA checksum catches single-digit typos client-side
      // so the seller doesn't hit an opaque server rejection after Save
      // (audit P1).
      m.push("Routing number failed the bank checksum — double-check the digits");
    }
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
    const reqId = begin();
    setBusy(true);
    setError(null);
    try {
      const res = await nest.saveSellerBank({
        holder_name: holderName.trim(),
        routing_number: digitsOnly(routingNumber),
        account_number: digitsOnly(accountNumber),
      });
      if (!isCurrent(reqId)) return;
      setBank(res);
      setUi("saved");
      setRoutingNumber("");
      setAccountNumber("");
      setConfirmAccount("");
      toast.success("Bank account saved.");
      // Notify anything watching (dashboard readiness card).
      haptics.success();
    } catch (e) {
      if (!isCurrent(reqId)) return;
      const msg = e instanceof ApiError ? e.friendly : "Could not save your bank account. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      if (isCurrent(reqId)) setBusy(false);
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

  // v1.0.247 — explicit load-failure state. Retry re-runs the load;
  // does NOT fall through to the empty form.
  if (ui === "loadError") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={goBack} />
        <View style={{ padding: spacing.lg }}>
          <ErrorState
            title="Couldn't load your bank details"
            message={error || "Check your connection and try again."}
            onRetry={() => { setUi("loading"); load(); }}
            testID="bank-load-error"
          />
        </View>
      </SafeAreaView>
    );
  }

  // Saved: show a masked card + Edit button. This is the "on file" state.
  if (ui === "saved" && bank?.has_bank) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={goBack} />
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
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
              Earnings are held for 7 days after each order is paid. Once they become available, request a payout from Earnings & payouts. Approved ACH payouts usually settle within 1–2 business days.
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
      {/* v1.0.175 — KeyboardAwareScroll auto-scrolls the focused input above
          the keyboard on both iOS and Android, replacing the old
          KeyboardAvoidingView+ScrollView pair that only shrank the container. */}
      <KeyboardAwareScroll contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
          <Text style={styles.introTitle}>
            {isEditing ? "Update your bank account" : "Add your bank account"}
          </Text>
          <Text style={styles.introBody}>
            ShopMyNest sends requested payouts to this account by ACH after earnings clear the 7-day holding window. We never share your details with buyers or other sellers.
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
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Payout bank account</Text>
      <AlertsBellButton />
      <CartHeaderButton />
    </View>
  );
}

// v1.0.228 — Seller bank refinement. Saved account card keeps the brand
// fill (this is a "proof" surface); info + error blocks become white on
// cream with hairlines. Type migrated to shared tokens.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { ...typeTokens.h2, fontSize: 16 },
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

  introTitle: { ...typeTokens.h1, marginBottom: spacing.sm },
  introBody:  { ...typeTokens.caption, lineHeight: 19, marginBottom: spacing.lg },

  savedCard: { backgroundColor: colors.brand, borderRadius: radius.card, padding: spacing.xl, alignItems: "center" },
  savedIconWrap: { marginBottom: spacing.sm },
  savedTitle: { ...typeTokens.h2, color: colors.onBrand, fontSize: 18 },
  savedSub:   { ...typeTokens.body, color: colors.onBrand, fontSize: 15, marginTop: 4, letterSpacing: 1 },
  savedHolder:{ ...typeTokens.caption, color: colors.onBrand, opacity: 0.9, marginTop: spacing.sm },

  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.card,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  infoText: { ...typeTokens.caption, lineHeight: 17, flex: 1 },

  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.card,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { ...typeTokens.caption, color: colors.error, flex: 1 },

  cancelBtn: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelText: { ...typeTokens.body, color: colors.onSurfaceMuted, fontWeight: "700" },
});
