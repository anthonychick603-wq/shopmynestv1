// v1.0.90 — Admin orders list. Reads marketplace-wide orders from
// the-nest/v1/admin/orders (plugin v3.7.117). Non-admins hit the same
// guard as index.tsx; the backend gates the route with
// tnm_is_admin_or_manager.
import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { format } from "date-fns";

import { nest, ApiError, type AdminOrder } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";

type Range = "7d" | "30d" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All" },
];

const STATUS_COLOR: Record<string, string> = {
  processing: colors.warning,
  "on-hold": colors.warning,
  pending: colors.warning,
  completed: colors.success,
  refunded: colors.onSurfaceMuted,
  cancelled: colors.onSurfaceMuted,
  failed: colors.error,
};

export default function AdminOrders() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [range, setRange] = useState<Range>("7d");
  const [items, setItems] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next: Range) => {
    setLoading(true);
    setError(null);
    try {
      const res = await nest.adminListOrders({ range: next, per_page: 30 });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      setError(e instanceof ApiError ? e.friendly : "Could not load orders.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(range);
    }, [load, range]),
  );

  if (user?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Top onBack={() => safeBack(router, "/admin")} />
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          message="Admin controls are limited to marketplace owners."
          testID="admin-orders-forbidden"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Top onBack={() => safeBack(router, "/admin")} />

      <View style={styles.tabs}>
        {RANGES.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => { haptics.tap(); setRange(t.key); }}
            style={[styles.tab, range === t.key && styles.tabActive]}
            testID={`admin-orders-range-${t.key}`}
            accessibilityRole="button"
          >
            <Text style={[styles.tabLabel, range === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={colors.onSurface} /></View>
      ) : error && items.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="We couldn't load orders"
          message={error}
          actionLabel="Retry"
          onAction={() => load(range)}
          testID="admin-orders-error"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(range); }}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
          ListHeaderComponent={
            total > 0 ? <Text style={styles.totalLabel}>{total.toLocaleString()} order{total === 1 ? "" : "s"}</Text> : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="bag-check-outline"
              title="No orders"
              message="No orders were placed in this range."
              testID="admin-orders-empty"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => { haptics.tap(); router.push(`/order/${item.id}` as any); }}
              accessibilityRole="button"
              accessibilityLabel={`Order ${item.number}`}
              testID={`admin-order-${item.id}`}
            >
              <View style={styles.cardTop}>
                <Text style={styles.orderNumber}>#{item.number}</Text>
                <View style={[styles.statusPill, { backgroundColor: (STATUS_COLOR[item.status] || colors.onSurfaceMuted) + "22" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] || colors.onSurfaceMuted }]}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.buyer} numberOfLines={1}>{item.buyer || "\u2014"}</Text>
              <View style={styles.cardBottom}>
                <Text style={styles.meta}>
                  {item.item_count} item{item.item_count === 1 ? "" : "s"}
                  {item.created_at ? ` · ${format(new Date(item.created_at), "MMM d, yyyy")}` : ""}
                </Text>
                <Text style={styles.total}>${item.total.toFixed(2)}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Top({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.top}>
      <TouchableOpacity onPress={() => { haptics.tap(); onBack(); }} style={styles.topBtn} testID="admin-orders-back" accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Orders</Text>
      <AlertsBellButton />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },

  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  tab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary },
  tabActive: { backgroundColor: colors.brand },
  tabLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted },
  tabLabelActive: { color: colors.onBrand },

  totalLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted, marginBottom: spacing.sm, letterSpacing: 0.3, textTransform: "uppercase" },

  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.card },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  orderNumber: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  buyer: { fontSize: 13, color: colors.onSurface, marginBottom: spacing.sm },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { fontSize: 12, color: colors.onSurfaceMuted },
  total: { fontSize: 15, fontWeight: "800", color: colors.onSurface },
});
