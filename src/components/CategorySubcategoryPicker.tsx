import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";

import { colors, radius, spacing } from "@/src/theme";
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

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{categoryLabel}</Text>
      <View style={[styles.pickerShell, disabled && styles.disabled]}>
        <Picker
          selectedValue={categoryId ?? ""}
          enabled={!disabled}
          onValueChange={(value) => {
            const next = String(value || "") || null;
            onChange(next, null);
          }}
          dropdownIconColor={colors.onSurface}
          style={styles.picker}
          testID={`${testIDPrefix}-category`}
        >
          <Picker.Item label={allowAll ? categoryPlaceholder : categoryPlaceholder} value="" />
          {roots.map((category) => (
            <Picker.Item key={category.id} label={category.name} value={category.id} />
          ))}
        </Picker>
      </View>

      {categoryId ? (
        <>
          <Text style={styles.label}>{subcategoryLabel}</Text>
          {children.length ? (
            <View style={[styles.pickerShell, disabled && styles.disabled]}>
              <Picker
                selectedValue={subcategoryId ?? ""}
                enabled={!disabled}
                onValueChange={(value) => {
                  const next = String(value || "") || null;
                  onChange(categoryId, next);
                }}
                dropdownIconColor={colors.onSurface}
                style={styles.picker}
                testID={`${testIDPrefix}-subcategory`}
              >
                <Picker.Item label={subcategoryPlaceholder} value="" />
                {children.map((subcategory) => (
                  <Picker.Item key={subcategory.id} label={subcategory.name} value={subcategory.id} />
                ))}
              </Picker>
            </View>
          ) : (
            <View style={styles.noChildren} testID={`${testIDPrefix}-no-subcategories`}>
              <Text style={styles.noChildrenText}>No sub-categories are configured under this category yet.</Text>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: { fontSize: 13, fontWeight: "800", color: colors.onSurface, marginTop: spacing.sm },
  pickerShell: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  picker: { color: colors.onSurface, minHeight: 50 },
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
