import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { colors, spacing, type as typeTokens } from "@/src/theme";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  /**
   * Title shown in the header. When both `title` and `eyebrow` are set,
   * the eyebrow (small uppercase caption) is rendered above the title.
   */
  title?: string;
  /**
   * Uppercase eyebrow (e.g. "ORDER", "SHOP") rendered above the title in
   * the micro type style. Optional.
   */
  eyebrow?: string;
  /**
   * When true (default), a chevron-back button is rendered on the left.
   * The button pops the current route; if no back stack exists, the
   * button is hidden entirely — this is a fix over the previous header
   * which showed a non-functional back arrow on some root screens.
   */
  showBack?: boolean;
  /**
   * Custom left element. Overrides showBack. Useful for menu icons.
   */
  left?: React.ReactNode;
  /**
   * Right-side action(s). Free-form — pass icon buttons, a Text link,
   * whatever the screen needs. Wrapped in a flex row automatically.
   */
  right?: React.ReactNode;
  /**
   * When set, the header renders a subtle bottom hairline. Off by
   * default because most screens now use whitespace to separate
   * header from content and the divider reads as noise.
   */
  divider?: boolean;
  /**
   * Optional callback fired instead of router.back() when the built-in
   * back button is tapped. Screens use this to intercept dismissals
   * (e.g. a "Discard changes?" confirmation).
   */
  onBack?: () => void;
};

// v1.0.224 — Unified header primitive.
//
// The header row across the app was drifting: some screens used
// `SafeAreaView + Text + IconButton`, some used a custom local Header
// component, some rendered nothing and just relied on the Stack default.
// The result was inconsistent spacing, mixed title sizes, and mismatched
// back-button treatments (chevron vs arrow vs missing).
//
// This primitive standardises all of it: cream surface, generous vertical
// rhythm, H1-sized title, real 44pt hit targets on the icon buttons,
// optional uppercase eyebrow, and a right slot that composes naturally
// with any icons (bell, bag, filter, more).
export function ScreenHeader({
  title,
  eyebrow,
  showBack = true,
  left,
  right,
  divider = false,
  onBack,
}: Props) {
  const router = useRouter();
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();

  const handleBack = React.useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if (canGoBack) router.back();
  }, [onBack, canGoBack, router]);

  const showBackButton = showBack && !left && canGoBack;

  return (
    <View style={[styles.wrap, divider && styles.divider]}>
      <View style={styles.left}>
        {left ? (
          left
        ) : showBackButton ? (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <View style={styles.center} pointerEvents="none">
        {eyebrow ? <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow.toUpperCase()}</Text> : null}
        {title ? <Text style={styles.title} numberOfLines={1}>{title}</Text> : null}
      </View>

      <View style={styles.right}>{right ?? null}</View>
    </View>
  );
}

const HEADER_STATUS = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: HEADER_STATUS + spacing.sm,
    paddingBottom: spacing.md,
    minHeight: HEADER_STATUS + 56,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  left: { width: 44, alignItems: "flex-start", justifyContent: "center" },
  right: {
    minWidth: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    ...typeTokens.micro,
  },
  title: {
    ...typeTokens.h2,
    textAlign: "center",
  },
});
