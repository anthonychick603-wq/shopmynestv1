import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { nest, ApiError, type NestConnectStatus } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";

// Deep-link back into this same screen once Stripe-hosted onboarding finishes.
// Scheme comes from app.json (`thenest`).
const RETURN_URL = "thenest://seller/connect";
const REFRESH_URL = "thenest://seller/connect";

type UiState = "not_connected" | "incomplete" | "ready";

function uiStateFor(s: NestConnectStatus): UiState {
  if (s.charges_enabled && s.payouts_enabled) return "ready";
  if (s.details_submitted) return "incomplete";
  return "not_connected";
}

export default function Connect() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isSeller = !!user && (user.role === "seller" || user.role === "admin");

  const [status, setStatus] = useState<NestConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSeller) return;
    try {
      const res = await nest.getStripeConnectStatus();
      setStatus(res);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load your Stripe status.");
    } finally {
      setLoading(false);
    }
  }, [isSeller]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startOnboarding = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await nest.getStripeConnectOnboardLink(RETURN_URL, REFRESH_URL);
      // Use openBrowserAsync (regular Chrome Custom Tab) instead of
      // openAuthSessionAsync. The auth-session variant force-closes when the
      // launching activity is backgrounded (e.g. switching to Google
      // Authenticator for a 2FA code), which breaks Stripe Connect onboarding
      // that requires 2FA. openBrowserAsync survives app-switch cycles; the
      // user manually dismisses when done (or Stripe redirects to our
      // thenest:// deep link, handled by expo-linking).
      await WebBrowser.openBrowserAsync(url, {
        // Match app theme; also improves survival across app-switches.
        dismissButtonStyle: "close",
        showTitle: true,
        enableBarCollapsing: false,
        // Android-only: keep the tab alive across app switches.
        showInRecents: Platform.OS === "android" ? true : undefined,
      });
      // When user returns (either by finishing onboarding or manually
      // dismissing), refresh status. AppState listener below also refreshes
      // when app foregrounds.
      setLoading(true);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not start Stripe onboarding. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Refresh Connect status whenever the app returns to the foreground while
  // this screen is mounted. Handles the case where user completed Stripe
  // onboarding, closed the browser, and returned to the app manually.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isSeller) {
        load();
      }
    });
    return () => sub.remove();
  }, [isSeller, load]);

  const openDashboard = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await nest.getStripeConnectDashboardLink();
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not open your Stripe dashboard. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!isSeller) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => router.back()} />
        <EmptyState icon="lock-closed-outline" title="Maker only" message="Only sellers can connect a payout account." />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => router.back()} />
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  const ui: UiState | null = status ? uiStateFor(status) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={[styles.statusCard, ui === "ready" ? styles.statusReady : styles.statusPending]}>
          <Ionicons
            name={ui === "ready" ? "checkmark-circle" : ui === "incomplete" ? "time-outline" : "business-outline"}
            size={40}
            color={colors.onBrand}
          />
          <Text style={styles.statusTitle}>
            {ui === "ready" ? "Connected & ready" : ui === "incomplete" ? "Onboarding incomplete" : "Not connected"}
          </Text>
          <Text style={styles.statusSub}>
            {ui === "ready"
              ? "Your bank account is linked. Payments and payouts are enabled."
              : ui === "incomplete"
                ? "Stripe still needs a bit more information before payouts can be enabled."
                : "Connect a bank account with Stripe to receive your earnings."}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {ui === "ready" ? (
          <Button
            title="View Stripe balance & payout history"
            onPress={openDashboard}
            loading={busy}
            testID="connect-dashboard"
            style={{ marginTop: spacing.lg }}
          />
        ) : (
          <>
            <Button
              title={ui === "incomplete" ? "Finish connecting with Stripe" : "Connect your bank account with Stripe"}
              onPress={startOnboarding}
              loading={busy}
              testID="connect-onboard"
              style={{ marginTop: spacing.lg }}
            />
            <Text style={styles.hint}>
              You&apos;ll be taken to Stripe&apos;s secure page to enter your details. You&apos;ll return here automatically when finished.
            </Text>
          </>
        )}

        <View style={styles.infoRow}>
          <StatusPill label="Details" on={!!status?.details_submitted} />
          <StatusPill label="Charges" on={!!status?.charges_enabled} />
          <StatusPill label="Payouts" on={!!status?.payouts_enabled} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusPill({ label, on }: { label: string; on: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: on ? colors.green : colors.surfaceTertiary }]}>
      <Ionicons name={on ? "checkmark" : "close"} size={13} color={on ? colors.onBrand : colors.onSurfaceMuted} />
      <Text style={[styles.pillText, { color: on ? colors.onBrand : colors.onSurfaceMuted }]}>{label}</Text>
    </View>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={onBack} style={styles.topBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Payout account</Text>
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
  statusCard: { borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", ...shadows.card },
  statusReady: { backgroundColor: colors.green },
  statusPending: { backgroundColor: colors.brand },
  statusTitle: { color: colors.onBrand, fontSize: 20, fontWeight: "800", marginTop: spacing.sm },
  statusSub: { color: colors.onBrand, opacity: 0.9, fontSize: 13, textAlign: "center", marginTop: 4 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  errorText: { color: colors.error, fontSize: 13, flex: 1 },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.sm, textAlign: "center" },
  infoRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl, justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  pillText: { fontSize: 12, fontWeight: "800" },
});
