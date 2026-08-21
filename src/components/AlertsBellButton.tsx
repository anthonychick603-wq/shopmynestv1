// v1.0.116 — Single-source header bell + unread badge. Placed next to
// the CartHeaderButton (and on the few screens without a cart) so every
// signed-in screen has the same alerts entry point. Reads unread count
// from AlertsContext, so the badge is always in sync app-wide.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors, radius, shadows } from "@/src/theme";
import { useAlerts } from "@/src/context/AlertsContext";
import { haptics } from "@/src/utils/haptics";

// Cap the visible badge at 99+ so the pill doesn't stretch across the
// header when there's a runaway alert backlog.
function formatCount(n: number): string {
  if (n > 99) return "99+";
  return String(n);
}

export function AlertsBellButton({ style, testID = "header-alerts" }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const router = useRouter();
  const { unreadCount } = useAlerts();
  const has = unreadCount > 0;
  return (
    <TouchableOpacity
      testID={testID}
      onPress={() => { haptics.tap(); router.push("/(tabs)/alerts"); }}
      style={[styles.iconBtn, style]}
      accessibilityLabel={has ? `Alerts, ${unreadCount} unread` : "Alerts"}
      accessibilityRole="button"
    >
      <Ionicons name="notifications-outline" size={20} color={colors.onSurface} />
      {has ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatCount(unreadCount)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", ...shadows.card },
  badge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.brand, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "800" },
});
