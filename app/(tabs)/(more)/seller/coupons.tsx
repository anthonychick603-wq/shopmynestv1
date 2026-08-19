import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestCoupon } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

// v1.0.92 (Build #10) — seller coupons list. Managed per-shop; the server
// scopes each coupon to the current seller's product ids so a Vermont
// Woodworks 10% code can't be redeemed against a ceramics-studio order.

function formatAmount(c: NestCoupon): string {
  if (c.discount_type === "percent") return `${c.amount}% off`;
  return `$${c.amount.toFixed(2)} off`;
}

export default function SellerCouponsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NestCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await nest.listSellerCoupons();
      setItems(res.items || []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not load coupons");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDelete = (c: NestCoupon) => {
    haptics.tap();
    (async () => {
      try {
        await nest.deleteSellerCoupon(c.id);
        setItems(prev => prev.filter(x => x.id !== c.id));
        toast.success("Coupon removed");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.friendly : "Delete failed");
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/seller/dashboard"); }} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Coupons</Text>
        <CartHeaderButton />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={c => String(c.id)}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          ListEmptyComponent={
            <EmptyState
              icon="pricetag-outline"
              title="No coupons yet"
              message="Create a promo code to run a sale on your listings."
              actionLabel="Create coupon"
              onAction={() => router.push("/seller/coupon-edit" as never)}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => { haptics.tap(); router.push({ pathname: "/seller/coupon-edit", params: { id: String(item.id) } } as never); }}
              accessibilityLabel={`Edit coupon ${item.code}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.code} numberOfLines={1}>{item.code}</Text>
                <Text style={styles.meta}>
                  {formatAmount(item)} · {item.usage_count}/{item.usage_limit || "∞"} used
                  {item.expires_at ? ` · expires ${item.expires_at}` : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => onDelete(item)} style={styles.iconBtn} accessibilityLabel="Delete">
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: 24 + insets.bottom }]}
        onPress={() => { haptics.tap(); router.push("/seller/coupon-edit" as never); }}
        accessibilityLabel="New coupon"
      >
        <Ionicons name="add" size={26} color={colors.onBrand} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  iconBtn: { padding: spacing.xs, borderRadius: radius.pill },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  code: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  meta: { color: colors.onSurfaceMuted, marginTop: 2 },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
});
