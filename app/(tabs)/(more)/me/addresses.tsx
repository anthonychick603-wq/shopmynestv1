import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestAddressBookEntry } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { EmptyState } from "@/src/components/EmptyState";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";

// v1.0.92 (Build #11) — buyer address book. Multi-address list backed by
// the user's tnm_address_book meta on the server. Exactly one entry can be
// the default at any time; the API enforces that server-side too.

export default function AddressBookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NestAddressBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await nest.listAddressBook();
      setItems(res.items || []);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Could not load addresses");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDelete = (a: NestAddressBookEntry) => {
    haptics.tap();
    (async () => {
      try {
        await nest.deleteAddress(a.id);
        setItems(prev => prev.filter(x => x.id !== a.id));
        toast.success("Address removed");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.friendly : "Delete failed");
      }
    })();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/more"); }} style={styles.iconBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Addresses</Text>
        <CartHeaderButton />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={a => a.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 + insets.bottom }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
          ListEmptyComponent={
            <EmptyState
              icon="home-outline"
              title="No saved addresses"
              message="Save your shipping addresses to check out faster."
              actionLabel="Add address"
              onAction={() => router.push("/me/address-edit" as never)}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => { haptics.tap(); router.push({ pathname: "/me/address-edit", params: { id: item.id } } as never); }}
              accessibilityLabel={`Edit address ${item.label || item.address_1}`}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.labelRow}>
                  <Text style={styles.label} numberOfLines={1}>{item.label || `${item.first_name} ${item.last_name}`.trim() || "Address"}</Text>
                  {item.is_default ? <Text style={styles.badge}>Default</Text> : null}
                </View>
                <Text style={styles.line} numberOfLines={2}>
                  {[item.address_1, item.address_2].filter(Boolean).join(", ")}
                </Text>
                <Text style={styles.line} numberOfLines={1}>
                  {[item.city, item.state, item.postcode, item.country].filter(Boolean).join(", ")}
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
        onPress={() => { haptics.tap(); router.push("/me/address-edit" as never); }}
        accessibilityLabel="New address"
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
  labelRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  label: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
  badge: { color: colors.brand, fontSize: 12, fontWeight: "600", backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  line: { color: colors.onSurfaceMuted, marginTop: 2 },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
});
