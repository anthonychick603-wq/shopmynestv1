// v1.0.94 (Build #17b) — push notification preferences center. One row
// per category, backed by /me/preferences (see class-tnm-rest.php).
// Toggling a switch does an optimistic UI flip + PUT; on failure we
// revert the local state and surface the error via toast.
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError, type NestMePreferences } from "@/src/api/nest";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { useRestockAlerts } from "@/src/context/RestockAlertsContext";

type PrefKey = keyof NestMePreferences;

const ROWS: Array<{
  key: PrefKey;
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}> = [
  { key: "orders", title: "Orders", description: "Payment confirmations, shipping updates, delivery, and refund status.", icon: "cube-outline" },
  { key: "messages", title: "Messages", description: "Chat replies and new conversations with sellers or buyers.", icon: "chatbubble-ellipses-outline" },
  { key: "price_drop_alerts", title: "Price drops", description: "When a favourited item drops in price.", icon: "pricetag-outline" },
  { key: "follows", title: "Follows", description: "When someone follows your shop or profile.", icon: "person-add-outline" },
  { key: "promos", title: "Promotions", description: "Occasional coupons, seasonal sales, and MyNest news.", icon: "megaphone-outline" },
];

// Older servers only return `price_drop_alerts`. We default every other
// category to ON so an upgrade doesn't silently mute anyone.
function withDefaults(p: NestMePreferences): Required<NestMePreferences> {
  return {
    orders: p.orders ?? true,
    messages: p.messages ?? true,
    price_drop_alerts: p.price_drop_alerts ?? true,
    follows: p.follows ?? true,
    promos: p.promos ?? true,
  };
}

export default function NotificationsPreferencesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<Required<NestMePreferences> | null>(null);
  const [loading, setLoading] = useState(true);
  const { watches: restockWatches, enabled: restockAlertsEnabled, setEnabled: setRestockAlertsEnabled } = useRestockAlerts();

  useEffect(() => {
    let cancelled = false;
    nest.getPreferences()
      .then((p) => { if (!cancelled) setPrefs(withDefaults(p)); })
      .catch((e) => { if (!cancelled) toast.error(e instanceof ApiError ? e.friendly : "Could not load preferences"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggle = useCallback(async (key: PrefKey, next: boolean) => {
    if (!prefs) return;
    haptics.tap();
    const prev = prefs;
    // Optimistic flip so the switch feels instant.
    setPrefs({ ...prefs, [key]: next });
    try {
      const server = await nest.setPreferences({ [key]: next });
      setPrefs(withDefaults(server));
    } catch (e) {
      setPrefs(prev);
      haptics.error();
      toast.error(e instanceof ApiError ? e.friendly : "Could not save that change");
    }
  }, [prefs]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Notifications</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>Choose which push notifications MyNest sends to this device.</Text>
        {loading || !prefs ? (
          <View style={{ paddingVertical: spacing.xl }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <View style={styles.card}>
            {ROWS.map((r) => (
              <View key={r.key} style={[styles.row, styles.rowDivider]}>
                <View style={styles.rowIcon}><Ionicons name={r.icon} size={20} color={colors.brand} /></View>
                <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                  <Text style={styles.rowTitle}>{r.title}</Text>
                  <Text style={styles.rowDesc}>{r.description}</Text>
                </View>
                <Switch
                  value={prefs[r.key]}
                  onValueChange={(v) => toggle(r.key, v)}
                  trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                  thumbColor={colors.surfaceSecondary}
                  ios_backgroundColor={colors.surfaceTertiary}
                  testID={`pref-${r.key}`}
                  accessibilityLabel={`${r.title} notifications`}
                />
              </View>
            ))}
            <View style={styles.row}>
              <View style={styles.rowIcon}><Ionicons name="notifications-outline" size={20} color={colors.brand} /></View>
              <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                <Text style={styles.rowTitle}>Back in stock</Text>
                <Text style={styles.rowDesc}>{restockWatches.length > 0 ? `${restockWatches.length} ${restockWatches.length === 1 ? "item" : "items"} watched. Alert me when available again.` : "Alert me when an item I chose to watch becomes available again."}</Text>
              </View>
              <Switch
                value={restockAlertsEnabled}
                onValueChange={async (v) => {
                  haptics.tap();
                  await setRestockAlertsEnabled(v);
                }}
                trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                thumbColor={colors.surfaceSecondary}
                ios_backgroundColor={colors.surfaceTertiary}
                testID="pref-back-in-stock"
                accessibilityLabel="Back in stock notifications"
              />
            </View>
          </View>
        )}
        <Text style={styles.footer}>These preferences control MyNest alerts on this device. Back-in-stock watches are checked when you open or return to the app. You can also disable MyNest notifications in your device settings.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  intro: { fontSize: 14, color: colors.onSurfaceMuted, marginBottom: spacing.md, lineHeight: 20 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, ...shadows.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowDesc: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2, lineHeight: 17 },
  footer: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.lg, lineHeight: 17, textAlign: "center" },
});
