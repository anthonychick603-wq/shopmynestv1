import React, { useCallback, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";

import { nest, ApiError, type NestShippoStatus } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { toast } from "@/src/components/Toast";
import { haptics } from "@/src/utils/haptics";

/**
 * Seller-side Shippo Connect screen.
 *
 * Two paths, live at the same time:
 *  - Manual (B2, always available): paste a Shippo API token. Server hits
 *    Shippo /v1/accounts/me to validate, then stores it encrypted.
 *  - One-click OAuth (B1): appears only when the server reports
 *    `oauth_ready: true`, which requires an admin to configure platform
 *    client_id/secret. Until then the button is hidden.
 */
export default function SellerShippoConnect() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<NestShippoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await nest.getShippoStatus();
      setStatus(s);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load Shippo status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async () => {
    if (!token.trim()) {
      setError("Paste your Shippo API token to connect.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const res = await nest.connectShippoManual(token.trim());
      setStatus(res.status);
      setToken("");
      toast.success("Shippo connected");
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not connect Shippo.");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    Alert.alert(
      "Disconnect Shippo?",
      "New labels will fall back to the platform's Shippo account until you reconnect. Existing labels aren't affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            haptics.warning();
            setDisconnecting(true);
            try {
              const res = await nest.disconnectShippo();
              setStatus(res.status);
              haptics.success();
              toast.success("Shippo disconnected");
            } catch (e) {
              setError(e instanceof ApiError ? e.friendly : "Could not disconnect Shippo.");
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ]
    );
  };

  const startOAuth = async () => {
    try {
      const { authorize_url } = await nest.startShippoOAuth();
      await Linking.openURL(authorize_url);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "One-click Shippo Connect isn't available yet.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["bottom"]}>
      <Stack.Screen options={{ title: "Connect Shippo" }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Ionicons name="cube-outline" size={28} color={colors.brand} />
            <Text style={styles.heroTitle}>Ship on your own Shippo account</Text>
            <Text style={styles.heroBody}>
              Connect your Shippo account and postage will be billed to you directly by Shippo. You keep control of your carrier accounts, your USPS commercial rates, and your own dashboard. If you don't connect, we'll keep buying labels on your behalf and deducting the postage from your next payout.
            </Text>
          </View>

          {loading ? (
            <Text style={styles.dim}>Loading…</Text>
          ) : status?.connected ? (
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.rowStart}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  <Text style={styles.connectedTitle}>Connected</Text>
                </View>
                <Text style={styles.modeBadge}>{status.mode === "live" ? "LIVE" : "TEST"}</Text>
              </View>
              {status.account?.email ? (
                <Text style={styles.dim}>{status.account.email}</Text>
              ) : null}
              {status.account?.company || status.account?.name ? (
                <Text style={styles.dim}>{[status.account.company, status.account.name].filter(Boolean).join(" • ")}</Text>
              ) : null}
              {status.connected_at ? (
                <Text style={styles.dimSmall}>Connected {new Date(status.connected_at).toLocaleString()} • {status.source === "oauth" ? "One-click" : "API token"}</Text>
              ) : null}
              <View style={{ marginTop: spacing.md }}>
                <Button title={disconnecting ? "Disconnecting…" : "Disconnect"} variant="secondary" onPress={() => { haptics.warning(); disconnect(); }} loading={disconnecting} testID="shippo-disconnect" />
              </View>
            </View>
          ) : (
            <>
              {status?.oauth_ready ? (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>One-click Connect</Text>
                  <Text style={styles.dim}>Sign in to Shippo and authorize ShopMyNest — no copy-pasting.</Text>
                  <View style={{ marginTop: spacing.md }}>
                    <Button title="Connect with Shippo" onPress={() => { haptics.press(); startOAuth(); }} testID="shippo-oauth" />
                  </View>
                </View>
              ) : null}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Don’t have a Shippo account yet?</Text>
                <Text style={styles.dim}>
                  Sign up free at Shippo, then come back here and paste your API token to connect. Signup takes about a minute.
                </Text>
                <View style={{ marginTop: spacing.md }}>
                  <Button
                    title="Create a Shippo account"
                    variant="secondary"
                    onPress={() => {
                      haptics.press();
                      Linking.openURL("https://apps.goshippo.com/join").catch(() => {
                        toast.error("Could not open Shippo signup.");
                      });
                    }}
                    testID="shippo-signup"
                  />
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Paste your Shippo API token</Text>
                <Text style={styles.dim}>
                  In Shippo, go to Settings → API. Copy the Live token (starts with <Text style={styles.mono}>shippo_live_</Text>) or a Test token, and paste it below.
                </Text>
                <Input
                  label="Shippo API token"
                  value={token}
                  onChangeText={setToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  placeholder="shippo_live_…"
                  testID="shippo-token-input"
                />
                {error ? <Text style={styles.err}>{error}</Text> : null}
                <View style={{ marginTop: spacing.md }}>
                  <Button title={connecting ? "Validating…" : "Connect Shippo"} onPress={() => { haptics.press(); connect(); }} loading={connecting} testID="shippo-manual-connect" />
                </View>
              </View>
            </>
          )}

          <View style={styles.footNote}>
            <Text style={styles.dimSmall}>
              Your token is validated against Shippo before it's saved and stored encrypted at rest. It's used only to buy labels for your own orders.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  hero: { gap: spacing.sm },
  heroTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
  heroBody: { fontSize: 14, color: colors.onSurfaceMuted, lineHeight: 20 },
  card: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, ...shadows.card, gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowStart: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  connectedTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  modeBadge: { fontSize: 11, fontWeight: "800", color: colors.brand, letterSpacing: 1 },
  dim: { color: colors.onSurfaceMuted, fontSize: 13 },
  dimSmall: { color: colors.onSurfaceMuted, fontSize: 12 },
  err: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  footNote: { paddingHorizontal: spacing.sm },
});
