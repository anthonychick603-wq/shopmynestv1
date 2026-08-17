import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { format } from "date-fns";

import { nest } from "@/src/api/nest";
import { toOrder } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Order } from "@/src/types";
import { EmptyState } from "@/src/components/EmptyState";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { safeBack } from "@/src/utils/nav";

// Every pill is a saturated fill so the white label stays legible.
const STATUS_COLOR: Record<string, { backgroundColor: string; color: string }> = {
  processing: { backgroundColor: colors.yellow, color: colors.onBrand },
  paid: { backgroundColor: colors.green, color: colors.onBrand },
  shipped: { backgroundColor: colors.green, color: colors.onBrand },
  delivered: { backgroundColor: colors.success, color: colors.onBrand },
  failed: { backgroundColor: colors.error, color: colors.onBrand },
  cancelled: { backgroundColor: colors.error, color: colors.onBrand },
};

const STATUS_FALLBACK = { backgroundColor: colors.brand, color: colors.onBrand };

export default function Orders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await nest.getBuyerOrders({ per_page: 50 });
      setOrders(res.orders.map(toOrder));
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/(tabs)/account")} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/(tabs)/account")} />
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        ListEmptyComponent={<EmptyState icon="receipt-outline" title="No orders yet" message="Once you place an order it will show up here." testID="orders-empty" />}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/order/${item.id}`)} style={styles.card} testID={`order-${item.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.orderId}>#{item.id}</Text>
              <View style={[styles.status, { backgroundColor: (STATUS_COLOR[item.status] ?? STATUS_FALLBACK).backgroundColor }]}>
                <Text style={[styles.statusText, { color: (STATUS_COLOR[item.status] ?? STATUS_FALLBACK).color }]}>{item.status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.date}>{item.created_at ? format(new Date(item.created_at), "MMM d, yyyy") : ""}</Text>
            <View style={{ flexDirection: "row", marginTop: spacing.md }}>
              {item.items.slice(0, 3).map((it, i) => (
                <Image key={i} source={{ uri: it.product.images?.[0] }} style={[styles.thumb, { marginLeft: i === 0 ? 0 : -12, zIndex: 5 - i }]} />
              ))}
              <View style={{ flex: 1, marginLeft: spacing.md, justifyContent: "center" }}>
                <Text style={styles.itemCount}>{item.items.reduce((s, it) => s + it.quantity, 0)} items</Text>
                <Text style={styles.total}>${item.total.toFixed(2)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceMuted} />
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={onBack} style={styles.topBtn}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
      <Text style={styles.topTitle}>Your orders</Text>
      <CartHeaderButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, ...shadows.card },
  orderId: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  status: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  date: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  thumb: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: colors.surface, backgroundColor: colors.surfaceTertiary },
  itemCount: { color: colors.onSurfaceMuted, fontSize: 12 },
  total: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
});
