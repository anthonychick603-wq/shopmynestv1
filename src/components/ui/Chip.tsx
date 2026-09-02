import React from "react";
import { TouchableOpacity, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";

type Props = {
  label: string;
  selected?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
  /**
   * Trailing chevron for chips that open a picker/sheet (e.g. "Sort by",
   * "Category"). Rendered muted, does not compete with the label.
   */
  trailing?: "chevron" | "close" | null;
  /**
   * Compact variant reduces padding for dense chip rows.
   */
  compact?: boolean;
};

// v1.0.224 — Chip primitive.
//
// The old Discover screen had a mix of pill buttons, filter chips, and
// sort selectors with three different visual treatments. This one gives
// a single, disciplined language:
//   • White card background + hairline border when unselected.
//   • Filled terracotta + white label when selected.
//   • Optional leading icon and trailing chevron/close.
export function Chip({ label, selected, icon, onPress, trailing, compact }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.chip,
        compact && styles.chipCompact,
        selected ? styles.chipSelected : styles.chipDefault,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={selected ? colors.onBrand : colors.onSurface}
          style={styles.iconLeading}
        />
      ) : null}
      <Text
        style={[
          styles.label,
          selected ? styles.labelSelected : styles.labelDefault,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {trailing === "chevron" ? (
        <Ionicons
          name="chevron-down"
          size={14}
          color={selected ? colors.onBrand : colors.onSurfaceMuted}
          style={styles.iconTrailing}
        />
      ) : trailing === "close" ? (
        <View style={styles.iconTrailing}>
          <Ionicons name="close" size={14} color={selected ? colors.onBrand : colors.onSurfaceMuted} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 34,
  },
  chipCompact: { paddingHorizontal: spacing.sm, paddingVertical: 4, minHeight: 28 },
  chipDefault: { backgroundColor: colors.card, borderColor: colors.hairline },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  label: { fontSize: 13, fontWeight: "600" },
  labelDefault: { color: colors.onSurface },
  labelSelected: { color: colors.onBrand },
  iconLeading: { marginRight: 6 },
  iconTrailing: { marginLeft: 6 },
});
