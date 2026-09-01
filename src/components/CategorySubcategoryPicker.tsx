// v1.0.179 — Chip-grid category picker.
//
// This replaces the native <Picker> dropdown with a scrollable, tappable
// grid of chips. Tapping an unselected chip selects it; tapping the
// already-selected chip clears the selection back to null (or to the
// "All" state when `allowAll` is enabled). Sub-category chips only
// render once a top-level category is selected, so the screen stays
// short until the user drills in.
//
// The public API is identical to the previous dropdown implementation,
// so every call site (apply.tsx, product-form.tsx, seller/[id].tsx) can
// keep using it unchanged.
import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";
import { rootCategories, subcategoriesFor, type HierarchicalCategory } from "@/src/utils/categories";

type Props = {
  categories: HierarchicalCategory[];
  categoryId: string | null;
  subcategoryId: string | null;
  onChange: (categoryId: string | null, subcategoryId: string | null) => void;
  categoryLabel?: string;
  subcategoryLabel?: string;
  categoryPlaceholder?: string;
  subcategoryPlaceholder?: string;
  /** When true, "no selection" reads as "All categories" instead of an empty state. */
  allowAll?: boolean;
  disabled?: boolean;
  testIDPrefix?: string;
};

export function CategorySubcategoryPicker({
  categories,
  categoryId,
  subcategoryId,
  onChange,
  categoryLabel = "Category",
  subcategoryLabel = "Sub-category",
  categoryPlaceholder = "Select a category",
  subcategoryPlaceholder = "Select a sub-category",
  allowAll = false,
  disabled = false,
  testIDPrefix = "category-picker",
}: Props) {
  const roots = useMemo(() => rootCategories(categories), [categories]);
  const children = useMemo(() => subcategoriesFor(categories, categoryId), [categories, categoryId]);

  const selectCategory = (id: string) => {
    if (disabled) return;
    haptics.tap();
    // Tap the already-selected chip → deselect (also clears sub-category).
    if (categoryId === id) {
      onChange(null, null);
    } else {
      onChange(id, null);
    }
  };

  const selectSubcategory = (id: string) => {
    if (disabled || !categoryId) return;
    haptics.tap();
    // Tap the already-selected sub-category chip → deselect back to "any
    // sub-category under this category".
    if (subcategoryId === id) {
      onChange(categoryId, null);
    } else {
      onChange(categoryId, id);
    }
  };

  return (
    <View style={styles.group}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{categoryLabel}</Text>
        {categoryId ? (
          <TouchableOpacity
            onPress={() => { haptics.tap(); onChange(null, null); }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Clear category selection"
            testID={`${testIDPrefix}-clear`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearLink}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {allowAll || roots.length > 0 ? (
        <Text style={styles.helper}>
          {categoryId
            ? "Tap the highlighted chip again to clear it."
            : allowAll
              ? `All ${categoryLabel.toLowerCase()} — tap one to filter.`
              : categoryPlaceholder}
        </Text>
      ) : null}

      <View style={[styles.chipGrid, disabled && styles.disabled]} testID={`${testIDPrefix}-category-grid`}>
        {roots.map((category) => {
          const selected = category.id === categoryId;
          return (
            <Chip
              key={category.id}
              label={category.name}
              selected={selected}
              disabled={disabled}
              onPress={() => selectCategory(category.id)}
              testID={`${testIDPrefix}-category-${category.id}`}
            />
          );
        })}
      </View>

      {categoryId ? (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.label}>{subcategoryLabel}</Text>
            {subcategoryId ? (
              <TouchableOpacity
                onPress={() => { haptics.tap(); onChange(categoryId, null); }}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel="Clear sub-category selection"
                testID={`${testIDPrefix}-sub-clear`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.clearLink}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {children.length > 0 ? (
            <View style={[styles.chipGrid, disabled && styles.disabled]} testID={`${testIDPrefix}-subcategory-grid`}>
              {children.map((subcategory) => {
                const selected = subcategory.id === subcategoryId;
                return (
                  <Chip
                    key={subcategory.id}
                    label={subcategory.name}
                    selected={selected}
                    disabled={disabled}
                    onPress={() => selectSubcategory(subcategory.id)}
                    testID={`${testIDPrefix}-subcategory-${subcategory.id}`}
                  />
                );
              })}
            </View>
          ) : (
            <View style={styles.noChildren} testID={`${testIDPrefix}-no-subcategories`}>
              <Text style={styles.noChildrenText}>No sub-categories are configured under this category yet.</Text>
            </View>
          )}
          {children.length > 0 && !subcategoryId ? (
            <Text style={styles.helper}>{subcategoryPlaceholder}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

type ChipProps = {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
};

function Chip({ label, selected, disabled, onPress, testID }: ChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={selected ? `${label}, selected. Tap to deselect.` : `${label}. Tap to select.`}
      testID={testID}
      style={[
        styles.chip,
        selected ? styles.chipSelected : styles.chipUnselected,
        disabled && styles.chipDisabled,
      ]}
    >
      <Text
        style={[
          styles.chipText,
          selected ? styles.chipTextSelected : styles.chipTextUnselected,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons
          name="close"
          size={14}
          color={colors.onBrand}
          style={styles.chipDismiss}
        />
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface },
  clearLink: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brand,
    textDecorationLine: "underline",
  },
  helper: {
    fontSize: 12,
    color: colors.onSurfaceMuted,
    marginBottom: spacing.xs,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 36,
  },
  chipUnselected: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipDisabled: {
    opacity: 0.55,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextUnselected: {
    color: colors.onSurface,
  },
  chipTextSelected: {
    color: colors.onBrand,
    fontWeight: "700",
  },
  chipDismiss: {
    marginLeft: 6,
  },
  disabled: { opacity: 0.55 },
  noChildren: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noChildrenText: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17 },
});
