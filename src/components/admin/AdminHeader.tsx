// v1.0.192 — Unified header for every admin screen. Before this component
// existed each admin screen shipped its own inline top-bar; some had the
// AlertsBellButton on the right, others had an empty <View width={40}/>
// placeholder, and the back button used a mix of hitSlop values. That
// inconsistency made the admin console feel like a stitched-together set
// of prototypes rather than a native app.
//
// AdminHeader is the single source of truth. It:
//   - always renders a back chevron on the left (uses safeBack with a
//     configurable fallback so cold-launched deep links don't dead-end)
//   - shows a plain-text title and optional subtitle
//   - supports an optional right-side action (icon button + accessibility
//     label) for screens that need a filter, export, or add affordance
//   - uses the same padding, weight, and typography everywhere so the
//     drawer, list, and detail screens all read as one product
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";
import { safeBack } from "@/src/utils/nav";

export type AdminHeaderAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
  badge?: number | null;
};

export function AdminHeader({
  title,
  subtitle,
  backTo = "/(tabs)/(more)/admin",
  actions,
}: {
  title: string;
  subtitle?: string | null;
  // Fallback route when there's nothing to pop (cold-launched deep link).
  // Kept as `string` since safeBack accepts only string fallbacks; the
  // router.push overloads are far wider than what this fallback needs.
  backTo?: string;
  actions?: AdminHeaderAction[];
}) {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={() => { haptics.tap(); safeBack(router, backTo); }}
        style={styles.backBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        testID="admin-header-back"
      >
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </TouchableOpacity>

      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      <View style={styles.actions}>
        {(actions ?? []).map((a) => (
          <TouchableOpacity
            key={a.label}
            onPress={() => { haptics.tap(); a.onPress(); }}
            style={styles.actionBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            testID={a.testID}
          >
            <Ionicons name={a.icon} size={20} color={colors.onSurface} />
            {a.badge != null && a.badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{a.badge > 99 ? "99+" : String(a.badge)}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    ...shadows.card,
  },
  titleWrap: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
  subtitle: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    ...shadows.card,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
