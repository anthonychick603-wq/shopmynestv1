import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, type as typeTokens } from "@/src/theme";

type Props = {
  /**
   * Ionicon shown on the left. Wrapped in a soft peach square so every
   * list row has a consistent visual anchor point.
   */
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /**
   * Alternative to `icon` — pass any custom left node (e.g. an Image
   * for shop avatars).
   */
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  /**
   * Optional right-side value (e.g. "$0.00"). Rendered next to the chevron.
   */
  value?: string;
  /**
   * When true, replaces the trailing chevron with the given badge count.
   */
  count?: number;
  /**
   * When true, no trailing chevron is rendered (used for terminal rows
   * like "App version 1.0.224").
   */
  hideChevron?: boolean;
  onPress?: () => void;
  /**
   * When true, the title is coloured with the error tone. Used for
   * destructive rows like "Log out" or "Delete account".
   */
  destructive?: boolean;
};

// v1.0.224 — List row primitive.
//
// The Account screen and settings screens across the app were writing
// their own list rows inline with slightly different padding, icon size,
// title weight, and chevron treatment. This primitive standardises the
// full pattern: fixed-width icon slot, single-line title, optional
// subtitle, optional right-side value / count / chevron.
export function ListRow({
  icon,
  leading,
  title,
  subtitle,
  value,
  count,
  hideChevron,
  onPress,
  destructive,
}: Props) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={!onPress}
      style={styles.row}
    >
      {leading ? (
        <View style={styles.leadingCustom}>{leading}</View>
      ) : icon ? (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={destructive ? colors.error : colors.brandDark} />
        </View>
      ) : null}

      <View style={styles.textCol}>
        <Text
          style={[styles.title, destructive && styles.titleDestructive]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>

      {value ? <Text style={styles.value} numberOfLines={1}>{value}</Text> : null}

      {typeof count === "number" && count > 0 ? (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count > 99 ? "99+" : String(count)}</Text>
        </View>
      ) : hideChevron ? null : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    gap: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    minHeight: 56,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  leadingCustom: { width: 36, height: 36, borderRadius: 18, overflow: "hidden" },
  textCol: { flex: 1 },
  title: { ...typeTokens.bodyLg },
  titleDestructive: { color: colors.error },
  subtitle: { ...typeTokens.caption, marginTop: 2 },
  value: { ...typeTokens.body, color: colors.onSurfaceMuted, marginRight: 4 },
  countPill: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: colors.onBrand, fontSize: 12, fontWeight: "800" },
});
