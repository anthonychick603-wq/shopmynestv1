import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest } from "@/src/api/nest";
import { toDispute } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Dispute } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { statusStyle, statusLabel } from "@/src/utils/disputeStatus";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { pushDetail, safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export default function DisputesList() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await nest.trust.listDisputes();
      const rows = Array.isArray(res) ? res : res.disputes || [];
      setDisputes(rows.map(toDispute));
    } catch {
      setDisputes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/account")} />
        <EmptyState icon="lock-closed-outline" title="Sign in" message="Sign in to see your disputes." actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/account")} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={disputes}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} colors={[colors.brand]} />}
          ListHeaderComponent={
            <View style={styles.infoCard}>
              <Ionicons name="shield-checkmark" size={20} color={colors.brand} />
              <Text style={styles.infoText}>Buyer protection tracks issues with your orders until they're resolved. Open a dispute from any order.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const s = statusStyle(item.status);
            return (
              <TouchableOpacity style={styles.row} onPress={() => { haptics.tap(); pushDetail(router, `/disputes/${item.id}`); }} testID={`dispute-row-${item.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Order #{item.order_id}</Text>
                  <Text style={styles.rowReason} numberOfLines={1}>{item.description || item.reason}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: `${s.color}22` }]}>
                  <Text style={[styles.pillText, { color: s.color }]}>{statusLabel(item.status)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<EmptyState icon="shield-checkmark-outline" title="No disputes" message="You haven't opened any disputes. That's a good thing!" testID="disputes-empty" />}
        />
      )}
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Disputes</Text>
      <AlertsBellButton />
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  infoCard: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  infoText: { flex: 1, color: colors.onSurface, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadows.card },
  rowTitle: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  rowReason: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 2 },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
});
