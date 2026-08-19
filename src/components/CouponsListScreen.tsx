// v1.0.97 — shared coupons list screen. Previously `admin/coupons.tsx`
// and `seller/coupons.tsx` were ~90% identical (same layout, same styles,
// same FAB, differed only by the API method they called, the back path,
// and a bit of empty-state copy). This component collapses both into a
// scope-parametrized screen so a future coupon feature (search, expiry
// filter, bulk archive) only has to land in one place.
//
// Route files (`admin/coupons.tsx`, `seller/coupons.tsx`) are now thin
// wrappers that instantiate this with the right scope. Coupon edit routing
// hasn't changed: seller edits go to `/seller/coupon-edit`, admin edits go
// to the same edit screen with `?scope=admin` so the server writes without
// the `_tnm_seller_id` meta.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestCoupon } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { Fab } from "@/src/components/Fab";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

export type CouponsScope = "admin" | "seller";

type ScopeConfig = {
  title: string;
  backPath: string;
  emptyTitle: string;
  emptyMessage: string;
  list: () => Promise<{ items: NestCoupon[] }>;
  remove: (id: number) => Promise<unknown>;
  createHref: () => Parameters<ReturnType<typeof useRouter>["push"]>[0];
  editHref: (id: number) => Parameters<ReturnType<typeof useRouter>["push"]>[0];
};

const CONFIG: Record<CouponsScope, ScopeConfig> = {
  admin: {
    title: "Site-wide coupons",
    backPath: "/admin",
    emptyTitle: "No site coupons",
    emptyMessage:
      "Site-wide coupons apply across every seller. Sellers can still create their own shop coupons.",
    list: () => nest.listAdminCoupons(),
    remove: (id) => nest.deleteAdminCoupon(id),
    createHref: () => ({ pathname: "/seller/coupon-edit", params: { scope: "admin" } } as never),
    editHref: (id) => ({ pathname: "/seller/coupon-edit", params: { id: String(id), scope: "admin" } } as never),
  },
  seller: {
    title: "Coupons",
    backPath: "/(tabs)/seller/dashboard",
    emptyTitle: "No coupons yet",
    emptyMessage: "Create a promo code to run a sale on your listings.",
    list: () => nest.listSellerCoupons(),
    remove: (id) => nest.deleteSellerCoupon(id),
    createHref: () => "/seller/coupon-edit" as never,
    editHref: (id) => ({ pathname: "/seller/coupon-edit", params: { id: String(id) } } as never),
  },
};

function formatAmount(c: NestCoupon): string {
  if (c.discount_type === "percent") return `${c.amount}% off`;
  return `$${c.amount.toFixed(2)} off`;
}

type Props = { scope: CouponsScope };

export function CouponsListScreen({ scope }: Props) {
  const cfg = CONFIG[scope];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NestCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // v1.0.97 — cancel guard follows the pattern established in v1.0.95.
  const load = useCallback(async () => {
    let cancelled = false;
    try {
      const res = await cfg.list();
      if (cancelled) return;
      setItems(res.items || []);
    } catch (e) {
      if (cancelled) return;
      toast.error(e instanceof ApiError ? e.friendly : "Could not load coupons");
    } finally {
      if (!cancelled) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    return () => { cancelled = true; };
  }, [cfg]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);

  const onDelete = (c: NestCoupon) => {
    haptics.tap();
    (async () => {
      try {
        await cfg.remove(c.id);
        setItems((prev) => prev.filter((x) => x.id !== c.id));
        toast.success("Coupon removed");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.friendly : "Delete failed");
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { haptics.tap(); safeBack(router, cfg.backPath); }}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>{cfg.title}</Text>
        <CartHeaderButton />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 + insets.bottom }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="pricetag-outline"
              title={cfg.emptyTitle}
              message={cfg.emptyMessage}
              actionLabel="Create coupon"
              onAction={() => router.push(cfg.createHref() as never)}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => { haptics.tap(); router.push(cfg.editHref(item.id) as never); }}
              accessibilityRole="button"
              accessibilityLabel={`Edit coupon ${item.code}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.code} numberOfLines={1}>{item.code}</Text>
                <Text style={styles.meta}>
                  {formatAmount(item)} · {item.usage_count}/{item.usage_limit || "\u221E"} used
                  {item.expires_at ? ` · expires ${item.expires_at}` : ""}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onDelete(item)}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={`Delete coupon ${item.code}`}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <Fab
        onPress={() => router.push(cfg.createHref() as never)}
        accessibilityLabel="New coupon"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: colors.onSurface, textAlign: "center" },
  iconBtn: { padding: spacing.xs, borderRadius: radius.pill },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  code: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  meta: { color: colors.onSurfaceMuted, marginTop: 2 },
});
