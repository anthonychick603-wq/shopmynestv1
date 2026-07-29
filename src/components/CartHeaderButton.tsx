import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors, radius, shadows } from "@/src/theme";
import { useCart } from "@/src/context/CartContext";

// Single source of truth for the header cart button + unread-count badge.
// Navigates to the (hidden) cart tab, so it reads as a tab switch, not a push.
export function CartHeaderButton({ style, testID = "header-cart" }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const router = useRouter();
  const { itemCount } = useCart();
  return (
    <TouchableOpacity testID={testID} onPress={() => router.push("/(tabs)/cart")} style={[styles.iconBtn, style]} accessibilityLabel={itemCount > 0 ? `Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Cart"} accessibilityRole="button">
      <Ionicons name="bag-handle-outline" size={20} color={colors.onSurface} />
      {itemCount > 0 ? (
        <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{itemCount}</Text></View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", ...shadows.card },
  cartBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  cartBadgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "800" },
});
