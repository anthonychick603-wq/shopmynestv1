import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { format } from "date-fns";

import { nest, ApiError, type NestBalances, type NestPayoutRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";

export default function Payouts() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isSeller = !!user && (user.role === "seller" || user.role === "admin");

  const [balances, setBalances] = useState<NestBalances | null>(null);
  const [payouts, setPayouts] = useState<NestPayoutRaw[]>([]);
  const [minimum, setMinimum] = useState(25);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isSeller) return;
    try {
      const res = await nest.getSellerPayouts();
      setBalances(res.balances);
      setPayouts(res.payouts || []);
      setMinimum(res.minimum ?? 25);
    } finally {
      setLoading(false);
    }
  }, [isSeller]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const available = balances?.available ?? 0;
  const canRequest = available >= minimum && available > 0;

  const requestPayout = () => {
    Alert.alert(
      "Request payout",
      `Request a payout of your full available balance ($${available.toFixed(2)})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request",
          onPress: async () => {
            setBusy(true);
            try {
              await nest.requestPayout();
              toast.success("Payout requested");
              await load();
            } catch (e) {
              toast.error(e instanceof ApiError ? e.friendly : "Could not request a payout.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (!isSeller) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => router.back()} />
        <EmptyState icon="lock-closed-outline" title="Maker only" message="Only sellers can view payouts." />
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

  const cur = balances?.currency || "USD";
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available to withdraw</Text>
          <Text style={styles.balanceValue}>${available.toFixed(2)}</Text>
          <Text style={styles.balanceCurrency}>{cur}</Text>
        </View>

        <View style={styles.miniRow}>
          <Mini label="Pending" value={`$${(balances?.pending ?? 0).toFixed(2)}`} />
          <Mini label="Reserved" value={`$${(balances?.reserved ?? 0).toFixed(2)}`} />
          <Mini label="Paid out" value={`$${(balances?.paid ?? 0).toFixed(2)}`} />
        </View>

        <Button
          title={canRequest ? "Request payout" : `Minimum payout is $${minimum.toFixed(2)}`}
          onPress={requestPayout}
          disabled={!canRequest}
          loading={busy}
          testID="payouts-request"
          style={{ marginTop: spacing.lg }}
        />
        {!canRequest ? (
          <Text style={styles.hint}>You can request a payout once your available balance reaches ${minimum.toFixed(2)}.</Text>
        ) : null}

        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Payout history</Text></View>
        {payouts.length === 0 ? (
          <Text style={styles.empty}>No payouts yet.</Text>
        ) : (
          payouts.map((p) => (
            <View key={p.id} style={styles.payoutRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payoutAmount}>${p.amount.toFixed(2)} {p.currency}</Text>
                <Text style={styles.payoutMeta}>
                  {p.method?.toUpperCase()} · {p.requested_at ? format(new Date(p.requested_at.replace(" ", "T") + "Z"), "PP") : ""}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: statusStyle(p.status).backgroundColor }]}>
                <Text style={[styles.statusPillText, { color: statusStyle(p.status).color }]}>{(p.status || "").toUpperCase()}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function statusStyle(status: string): { backgroundColor: string; color: string } {
  if (status === "paid") return { backgroundColor: colors.green, color: colors.onBrand };
  if (status === "cancelled" || status === "failed") return { backgroundColor: colors.error, color: colors.onBrand };
  return { backgroundColor: colors.yellow, color: colors.onBrand };
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={onBack} style={styles.topBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Earnings & payouts</Text>
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
  balanceCard: { backgroundColor: colors.brand, borderRadius: radius.lg, padding: spacing.xl, alignItems: "center", ...shadows.card },
  balanceLabel: { color: colors.onBrand, opacity: 0.9, fontSize: 13, fontWeight: "700" },
  balanceValue: { color: colors.onBrand, fontSize: 40, fontWeight: "800", marginTop: 4 },
  balanceCurrency: { color: colors.onBrand, opacity: 0.9, fontSize: 12, letterSpacing: 1 },
  miniRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  mini: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, alignItems: "center", ...shadows.card },
  miniValue: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  miniLabel: { fontSize: 11, color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: spacing.sm, textAlign: "center" },
  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  empty: { color: colors.onSurfaceMuted, fontStyle: "italic" },
  payoutRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.sm, ...shadows.card },
  payoutAmount: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  payoutMeta: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  statusPillText: { fontWeight: "800", fontSize: 11 },
});
