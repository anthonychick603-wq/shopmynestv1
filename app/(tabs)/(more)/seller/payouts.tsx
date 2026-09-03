import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { format } from "date-fns";

import { nest, ApiError, type NestBalances, type NestPayoutRaw } from "@/src/api/nest";
import { colors, radius, shadows, spacing, elevation, type as typeTokens } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { parseServerDate } from "@/src/utils/datetime";

export default function Payouts() {
  useBackFallback("/(tabs)/seller/dashboard");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isSeller = !!user && (user.role === "seller" || user.role === "admin");

  const [balances, setBalances] = useState<NestBalances | null>(null);
  const [payouts, setPayouts] = useState<NestPayoutRaw[]>([]);
  const [minimum, setMinimum] = useState(25);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSeller) return;
    try {
      const res = await nest.getSellerPayouts();
      setBalances(res.balances);
      setPayouts(res.payouts || []);
      setMinimum(res.minimum ?? 25);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.friendly : "Could not load your payout balance.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSeller]);

  // v1.0.167 — load once on mount. Focus refetch removed so the
  // scroll position through the payout ledger survives return trips.
  // Pull to refresh forces a reload.
  React.useEffect(() => { load(); }, [load]);

  // v1.0.104 — the plugin (v3.7.122.6+) already clamps `available` to ≥ 0 and
  // exposes any postage debit separately as `shipping_owed`. Guard against
  // older plugin builds by clamping client-side too.
  const available = balances ? Math.max(0, balances.available ?? 0) : 0;
  const shippingOwed = balances ? Math.max(0, balances.shipping_owed ?? 0) : 0;
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
            haptics.press();
            setBusy(true);
            try {
              await nest.requestPayout();
              haptics.success();
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
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} />
        <EmptyState icon="lock-closed-outline" title="Maker only" message="Only sellers can view payouts." />
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} />
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }


  if (!balances && loadError) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} />
        <EmptyState
          icon="cloud-offline-outline"
          title="Balance unavailable"
          message={`${loadError} We won't show $0.00 when we can't verify your balance.`}
          actionLabel="Retry"
          onAction={() => { setLoading(true); void load(); }}
          testID="payouts-load-error"
        />
      </SafeAreaView>
    );
  }

  const cur = balances?.currency || "USD";
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/seller/dashboard")} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
       keyboardShouldPersistTaps="handled">
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available to request</Text>
          <Text style={styles.balanceValue}>${available.toFixed(2)}</Text>
          <Text style={styles.balanceCurrency}>{cur}</Text>
        </View>

        <View style={styles.miniRow}>
          <Mini label="Pending" value={`$${(balances?.pending ?? 0).toFixed(2)}`} />
          <Mini label="Reserved" value={`$${(balances?.reserved ?? 0).toFixed(2)}`} />
          <Mini label="Paid out" value={`$${(balances?.paid ?? 0).toFixed(2)}`} />
        </View>

        {shippingOwed > 0 ? (
          <View style={styles.shippingRow}>
            <Ionicons name="cube-outline" size={16} color={colors.onSurfaceMuted} />
            <Text style={styles.shippingText}>
              <Text style={styles.shippingLabel}>Shipping labels: </Text>
              ${shippingOwed.toFixed(2)} is a legacy label charge and will be reconciled before your next payout is sent.
            </Text>
          </View>
        ) : null}

        <View style={styles.payoutInfo}>
          <Ionicons name="time-outline" size={16} color={colors.onSurfaceMuted} />
          <Text style={styles.payoutInfoText}>Earnings stay pending during the 7-day hold. When they become available, request an ACH payout here. Most payouts settle in 1–2 business days after processing.</Text>
        </View>

        <Button
          title={canRequest ? "Request payout" : `Minimum payout is $${minimum.toFixed(2)}`}
          onPress={() => { haptics.press(); requestPayout(); }}
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
          <View style={styles.emptyCard}>
            <Text style={styles.empty}>No payouts yet.</Text>
          </View>
        ) : (
          <View style={styles.historyCard}>
            {payouts.map((p, i) => (
              <View
                key={p.id}
                style={[
                  styles.payoutRow,
                  i === payouts.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.payoutAmount}>${p.amount.toFixed(2)} {p.currency}</Text>
                  <Text style={styles.payoutMeta}>
                    {p.method?.toUpperCase()} · {(parseServerDate(p.requested_at) ?? null) ? format(parseServerDate(p.requested_at) as Date, "PP") : ""}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: statusStyle(p.status).backgroundColor }]}>
                  <Text style={[styles.statusPillText, { color: statusStyle(p.status).color }]}>{(p.status || "").toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
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
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Earnings & payouts</Text>
      <AlertsBellButton />
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  // v1.0.224 — Refinement pass. Payouts is one of the highest-signal
  // screens in the app; historically the hero card sat on cream, mini
  // stat cards were also cream, and the whole screen looked flat because
  // the accent lived on everything. New treatment:
  //   • Hero balance card stays terracotta but with real vertical
  //     rhythm, tighter type, and no drop shadow (relies on the accent
  //     to lift itself).
  //   • Mini stat cards move to white + hairline border (Stripe cards).
  //   • Info boxes read as quiet advisory blocks with warm-neutral fill.
  //   • Payout history rows sit inside a single grouped white card so
  //     the list reads as one object, not three floating cards.
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  topTitle: { ...typeTokens.h2, flex: 1, textAlign: "center" },
  topBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  balanceCard: {
    backgroundColor: colors.brand,
    borderRadius: radius.card,
    paddingVertical: spacing["2xl"],
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  balanceLabel: {
    color: colors.onBrand,
    opacity: 0.85,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  balanceValue: {
    color: colors.onBrand,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "800",
    marginTop: 6,
    letterSpacing: -1,
  },
  balanceCurrency: {
    color: colors.onBrand,
    opacity: 0.85,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  miniRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  mini: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
  },
  miniValue: {
    ...typeTokens.h3,
    fontSize: 17,
  },
  miniLabel: {
    ...typeTokens.micro,
    marginTop: 2,
  },
  hint: { ...typeTokens.caption, marginTop: spacing.sm, textAlign: "center" },
  shippingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  shippingText: { flex: 1, ...typeTokens.caption, lineHeight: 18 },
  shippingLabel: { fontWeight: "700", color: colors.onSurface },
  payoutInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  payoutInfoText: { flex: 1, ...typeTokens.caption, lineHeight: 18 },
  sectionHeader: { marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { ...typeTokens.h2 },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    alignItems: "center",
  },
  empty: { ...typeTokens.body, color: colors.onSurfaceMuted },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: "hidden",
  },
  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  payoutAmount: { ...typeTokens.bodyLg, fontWeight: "700" },
  payoutMeta: { ...typeTokens.caption, marginTop: 2 },
  statusPill: { paddingHorizontal: spacing.sm + 2, paddingVertical: 3, borderRadius: 999 },
  statusPillText: { fontWeight: "700", fontSize: 11, letterSpacing: 0.4 },
});
