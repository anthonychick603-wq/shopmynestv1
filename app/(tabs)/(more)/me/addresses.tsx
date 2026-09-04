import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestAddressBookEntry } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { Fab } from "@/src/components/Fab";
import { EmptyState } from "@/src/components/EmptyState";
import { ErrorState } from "@/src/components/ErrorState";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { RequireAuth } from "@/src/components/RequireAuth";

// v1.0.92 (Build #11) — buyer address book. Multi-address list backed by
// the user's tnm_address_book meta on the server. Exactly one entry can be
// the default at any time; the API enforces that server-side too.

export default function AddressBookScreen() {
  return (
    <RequireAuth message={'Sign in to manage your saved addresses.'}>
      <AddressBookScreenImpl />
    </RequireAuth>
  );
}

function AddressBookScreenImpl() {
  useBackFallback("/(tabs)/account");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NestAddressBookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // v1.0.243 — dedicated error state so a failed initial load can be
  // retried instead of showing a blank "no saved addresses" screen with
  // a fleeting toast the buyer probably missed.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await nest.listAddressBook();
      setItems(res.items || []);
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "Could not load addresses";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // v1.0.243 — confirmation prompt before delete. Fixes P1 where a
  // single tap on the trash icon permanently removed the address with
  // no confirm and no undo path.
  const onDelete = (a: NestAddressBookEntry) => {
    haptics.tap();
    const label = a.label || (a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : "this address");
    Alert.alert(
      "Remove address?",
      `"${label}" will be removed from your saved addresses. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await nest.deleteAddress(a.id);
              setItems(prev => prev.filter(x => x.id !== a.id));
              toast.success("Address removed");
            } catch (e) {
              toast.error(e instanceof ApiError ? e.friendly : "Delete failed");
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} style={styles.iconBtn} accessibilityLabel="Back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Addresses</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : errorMsg ? (
        <ErrorState message={errorMsg} onRetry={() => { setLoading(true); load(); }} />
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
             accessibilityRole="button">
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
              <TouchableOpacity onPress={() => onDelete(item)} style={styles.iconBtn} accessibilityLabel="Delete" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      {/* v1.0.95 — shared <Fab /> replaces the local duplicated fab style. */}
      <Fab
        onPress={() => router.push("/me/address-edit" as never)}
        accessibilityLabel="New address"
      />
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
});
