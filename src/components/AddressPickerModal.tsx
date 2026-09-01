// v1.0.97 — saved-address picker sheet. Previously an in-file component
// at the bottom of `app/(tabs)/cart.tsx`; extracted into its own module
// so cart.tsx can shrink and other screens (checkout, "ship to" from
// order detail) can reuse the same sheet without duplicating markup.
//
// Renders a bottom sheet listing entries from /me/addresses, with the
// default entry pinned at the top. "Enter a new address" falls through
// to the caller's <AddressFormModal>; "Manage addresses" is expected to
// navigate to the CRUD screen at /(tabs)/(more)/me/addresses.
import React from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing } from "@/src/theme";
import type { NestAddressBookEntry } from "@/src/api/nest";

type Props = {
  visible: boolean;
  loading: boolean;
  entries: NestAddressBookEntry[];
  onPick: (e: NestAddressBookEntry) => void;
  onEnterNew: () => void;
  onManage: () => void;
  onCancel: () => void;
};

export function AddressPickerModal({
  visible,
  loading,
  entries,
  onPick,
  onEnterNew,
  onManage,
  onCancel,
}: Props) {
  const sorted = React.useMemo(
    () => [...entries].sort((a, b) => (a.is_default === b.is_default ? 0 : a.is_default ? -1 : 1)),
    [entries],
  );
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Choose an address</Text>
            <TouchableOpacity
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Close address picker"
              testID="cart-picker-close"
             hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={{ paddingVertical: spacing.xl }}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }}>
              {sorted.map((e) => {
                const name =
                  [e.first_name, e.last_name].filter(Boolean).join(" ") || e.label || "Recipient";
                const line1 = [e.address_1, e.address_2].filter(Boolean).join(", ");
                const line2 = `${e.city}, ${e.state} ${e.postcode}`;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.row}
                    onPress={() => onPick(e)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`Ship to ${name} at ${line1}`}
                    testID={`cart-picker-row-${e.id}`}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="location" size={18} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={styles.rowLabel}>{e.label || "Address"}</Text>
                        {e.is_default ? <Text style={styles.badge}>Default</Text> : null}
                      </View>
                      <Text style={styles.rowName}>{name}</Text>
                      <Text style={styles.rowLine} numberOfLines={2}>{line1}</Text>
                      <Text style={styles.rowLine}>{line2}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.rowAction}
                onPress={onEnterNew}
                accessibilityRole="button"
                accessibilityLabel="Enter a new address"
                testID="cart-picker-new"
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="add" size={18} color={colors.brand} />
                </View>
                <Text style={styles.rowActionText}>Enter a new address</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rowAction}
                onPress={onManage}
                accessibilityRole="button"
                accessibilityLabel="Manage saved addresses"
                testID="cart-picker-manage"
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="settings-outline" size={18} color={colors.brand} />
                </View>
                <Text style={styles.rowActionText}>Manage saved addresses</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceMuted} />
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // v1.0.97 — modal backdrop scrim; previously `"#0007"` inline in cart.tsx.
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.47)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    maxHeight: "80%",
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong,
    alignSelf: "center", marginBottom: spacing.sm,
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
  },
  rowLabel: {
    fontSize: 12, color: colors.onSurfaceMuted,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  badge: {
    fontSize: 10, fontWeight: "800", color: colors.brand,
    backgroundColor: colors.brand + "15", paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radius.sm, overflow: "hidden",
  },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.onSurface, marginTop: 2 },
  rowLine: { fontSize: 13, color: colors.onSurfaceMuted, marginTop: 1 },
  rowAction: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowActionText: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.brandDark },
});
