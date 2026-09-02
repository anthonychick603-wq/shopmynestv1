import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import { colors, spacing, type as typeTokens } from "@/src/theme";

type Props = {
  /**
   * Section title. Rendered in h2 (19/26 700). When absent, the section
   * renders as a plain padded container.
   */
  title?: string;
  /**
   * Small caption under the title. Kept muted to preserve hierarchy.
   */
  subtitle?: string;
  /**
   * Right-side action, e.g. "See all". Free-form node — most callers
   * pass a <TouchableOpacity><Text>See all</Text></TouchableOpacity>
   * or use the ready-made `SectionAction` below.
   */
  action?: React.ReactNode;
  /**
   * When true, adds top/bottom margin so the section separates from
   * neighbours. Default true. Turn off when the section is stacked
   * inside a scroll view that already manages gaps.
   */
  spaced?: boolean;
  /**
   * Style forwarded to the section's outer View. Rarely needed but
   * useful when a section needs a background or extra horizontal
   * padding beyond the shared gutter.
   */
  style?: ViewStyle;
  children: React.ReactNode;
};

// v1.0.224 — Section primitive.
//
// The design brief called out that the app has no consistent section
// header pattern. Some screens use plain Text with a hand-typed font size,
// some use SectionTitle from an old design file, some just leave a hero
// line with no label at all.
//
// This primitive gives every section a title row (with an optional right
// action), consistent gap between the header and its children, and a
// uniform vertical rhythm between neighbouring sections.
export function Section({ title, subtitle, action, spaced = true, style, children }: Props) {
  return (
    <View style={[spaced && styles.spaced, style]}>
      {title || action ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {action ? <View style={styles.action}>{action}</View> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * Ready-made "See all" style right-side action.
 * Renders muted-terracotta text with a chevron-forward affordance.
 */
export function SectionAction({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  spaced: { marginTop: spacing.xl },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerText: { flex: 1, paddingRight: spacing.md },
  title: { ...typeTokens.h2 },
  subtitle: { ...typeTokens.caption, marginTop: 2 },
  action: { alignItems: "flex-end", justifyContent: "flex-end" },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandDark,
    letterSpacing: 0.1,
  },
});
