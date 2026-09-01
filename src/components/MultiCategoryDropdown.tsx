// v1.0.187 — Multi-select category / sub-category dropdown for the
// buyer-side browse filter.
//
// Two chained dropdown fields:
//   1. Categories — tap to open a bottom-sheet listing every top-level
//      category with a checkbox. Any number can be checked.
//   2. Sub-categories — the field renders once at least one category is
//      selected. Opens a bottom sheet grouping sub-categories under
//      their category headers (only the picked categories are shown).
//
// The buyer flow needs multi-select (a shopper narrowing search) and
// no OS ships a native multi-select picker; the sheet mimics the
// platform's list-style dropdowns closely (iOS: right-aligned check;
// Android: Material checkbox on the right) so it still reads as a
// native picker.
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";
import {
  rootCategories,
  subcategoriesFor,
  type HierarchicalCategory,
} from "@/src/utils/categories";

type Props = {
  categories: HierarchicalCategory[];
  selectedCategoryIds: string[];
  selectedSubcategoryIds: string[];
  onChange: (categoryIds: string[], subcategoryIds: string[]) => void;
  disabled?: boolean;
  testIDPrefix?: string;
};

export function MultiCategoryDropdown({
  categories,
  selectedCategoryIds,
  selectedSubcategoryIds,
  onChange,
  disabled = false,
  testIDPrefix = "multi-category",
}: Props) {
  const [catOpen, setCatOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);

  const roots = useMemo(() => rootCategories(categories), [categories]);

  // Every sub-category grouped under its parent, but only for the
  // categories the user has actually picked.
  const groupedSubs = useMemo(() => {
    return selectedCategoryIds
      .map((id) => {
        const parent = roots.find((r) => r.id === id);
        const children = subcategoriesFor(categories, id);
        return parent && children.length > 0
          ? { parent, children }
          : null;
      })
      .filter((g): g is { parent: HierarchicalCategory; children: HierarchicalCategory[] } => !!g);
  }, [categories, roots, selectedCategoryIds]);

  // Prune orphaned sub selections when a parent category gets unchecked.
  const pruneSubs = (nextCategoryIds: string[], subs: string[]): string[] => {
    const validSubs = new Set(
      nextCategoryIds.flatMap((cid) =>
        subcategoriesFor(categories, cid).map((c) => c.id),
      ),
    );
    return subs.filter((s) => validSubs.has(s));
  };

  const toggleCategory = (id: string) => {
    const next = selectedCategoryIds.includes(id)
      ? selectedCategoryIds.filter((x) => x !== id)
      : [...selectedCategoryIds, id];
    const prunedSubs = pruneSubs(next, selectedSubcategoryIds);
    onChange(next, prunedSubs);
  };

  const toggleSubcategory = (id: string) => {
    const next = selectedSubcategoryIds.includes(id)
      ? selectedSubcategoryIds.filter((x) => x !== id)
      : [...selectedSubcategoryIds, id];
    onChange(selectedCategoryIds, next);
  };

  const clearCategories = () => {
    onChange([], []);
  };

  const clearSubcategories = () => {
    onChange(selectedCategoryIds, []);
  };

  const categorySummary =
    selectedCategoryIds.length === 0
      ? "All categories"
      : selectedCategoryIds.length === 1
        ? roots.find((c) => c.id === selectedCategoryIds[0])?.name ?? "1 category"
        : `${selectedCategoryIds.length} categories`;

  const totalSubs = groupedSubs.reduce((n, g) => n + g.children.length, 0);
  const subcategorySummary =
    selectedSubcategoryIds.length === 0
      ? "All sub-categories"
      : selectedSubcategoryIds.length === 1
        ? groupedSubs
            .flatMap((g) => g.children)
            .find((c) => c.id === selectedSubcategoryIds[0])?.name ?? "1 sub-category"
        : `${selectedSubcategoryIds.length} sub-categories`;

  return (
    <View style={styles.group}>
      <Text style={styles.label}>Categories</Text>
      <Field
        testID={`${testIDPrefix}-categories`}
        placeholder="All categories"
        summary={categorySummary}
        isEmpty={selectedCategoryIds.length === 0}
        showClear={selectedCategoryIds.length > 0}
        onClear={clearCategories}
        disabled={disabled || roots.length === 0}
        onPress={() => setCatOpen(true)}
      />

      {selectedCategoryIds.length > 0 && totalSubs > 0 ? (
        <>
          <Text style={[styles.label, styles.labelTop]}>Sub-categories</Text>
          <Field
            testID={`${testIDPrefix}-subcategories`}
            placeholder="All sub-categories"
            summary={subcategorySummary}
            isEmpty={selectedSubcategoryIds.length === 0}
            showClear={selectedSubcategoryIds.length > 0}
            onClear={clearSubcategories}
            disabled={disabled}
            onPress={() => setSubOpen(true)}
          />
        </>
      ) : null}

      {catOpen ? (
        <MultiSheet
          testID={`${testIDPrefix}-cat-sheet`}
          title="Categories"
          rows={roots.map((c) => ({ id: c.id, label: c.name }))}
          selectedIds={selectedCategoryIds}
          onToggle={toggleCategory}
          onClearAll={clearCategories}
          onClose={() => setCatOpen(false)}
        />
      ) : null}

      {subOpen ? (
        <MultiSheet
          testID={`${testIDPrefix}-sub-sheet`}
          title="Sub-categories"
          sections={groupedSubs.map((g) => ({
            title: g.parent.name,
            rows: g.children.map((c) => ({ id: c.id, label: c.name })),
          }))}
          selectedIds={selectedSubcategoryIds}
          onToggle={toggleSubcategory}
          onClearAll={clearSubcategories}
          onClose={() => setSubOpen(false)}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

function Field({
  testID,
  placeholder,
  summary,
  isEmpty,
  showClear,
  onClear,
  disabled,
  onPress,
}: {
  testID: string;
  placeholder: string;
  summary: string;
  isEmpty: boolean;
  showClear: boolean;
  onClear: () => void;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${placeholder}. ${summary}. Double-tap to change.`}
      onPress={() => {
        if (disabled) return;
        haptics.tap();
        onPress();
      }}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.field, disabled && styles.fieldDisabled]}
    >
      <Text
        style={[styles.fieldText, isEmpty && styles.fieldPlaceholder]}
        numberOfLines={1}
      >
        {summary}
      </Text>
      <View style={styles.fieldRight}>
        {showClear ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              haptics.tap();
              onClear();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear selection"
            testID={`${testID}-clear`}
            style={styles.clearBtn}
          >
            <Ionicons name="close-circle" size={18} color={colors.onSurfaceMuted} />
          </TouchableOpacity>
        ) : null}
        <Ionicons name="chevron-down" size={18} color={colors.onSurfaceMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------

type Row = { id: string; label: string };
type Section = { title: string; rows: Row[] };

function MultiSheet({
  testID,
  title,
  rows,
  sections,
  selectedIds,
  onToggle,
  onClearAll,
  onClose,
}: {
  testID: string;
  title: string;
  rows?: Row[];
  sections?: Section[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const totalRows =
    (rows?.length ?? 0) + (sections?.reduce((n, s) => n + s.rows.length, 0) ?? 0);

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
    >
      <Pressable style={styles.backdrop} onPress={onClose} testID={`${testID}-backdrop`} />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <TouchableOpacity
            onPress={() => {
              haptics.tap();
              onClearAll();
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear all"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID={`${testID}-clear-all`}
            disabled={selectedIds.length === 0}
          >
            <Text
              style={[
                styles.sheetCancel,
                selectedIds.length === 0 && styles.sheetCancelDisabled,
              ]}
            >
              Clear
            </Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {title}
            {selectedIds.length > 0 ? `  (${selectedIds.length})` : ""}
          </Text>
          <TouchableOpacity
            onPress={() => {
              haptics.tap();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Done"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID={`${testID}-done`}
          >
            <Text style={styles.sheetDone}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          testID={`${testID}-list`}
        >
          {totalRows === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No options to show.</Text>
            </View>
          ) : null}

          {rows?.map((r) => (
            <SheetCheckRow
              key={r.id}
              label={r.label}
              selected={selectedIds.includes(r.id)}
              onPress={() => {
                haptics.tap();
                onToggle(r.id);
              }}
              testID={`${testID}-row-${r.id}`}
            />
          ))}

          {sections?.map((s) => (
            <View key={s.title}>
              <Text style={styles.sectionHeader}>{s.title}</Text>
              {s.rows.map((r) => (
                <SheetCheckRow
                  key={r.id}
                  label={r.label}
                  selected={selectedIds.includes(r.id)}
                  onPress={() => {
                    haptics.tap();
                    onToggle(r.id);
                  }}
                  testID={`${testID}-row-${r.id}`}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SheetCheckRow({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={selected ? `${label}, checked` : label}
      testID={testID}
      style={[styles.row, selected && styles.rowSelected]}
      activeOpacity={0.65}
    >
      <Text
        style={[styles.rowText, selected && styles.rowTextSelected]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <View
        style={[
          styles.checkbox,
          selected ? styles.checkboxOn : styles.checkboxOff,
        ]}
      >
        {selected ? (
          <Ionicons name="checkmark" size={16} color={colors.onBrand} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.onSurface,
    marginBottom: 4,
  },
  labelTop: { marginTop: spacing.md },

  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  fieldDisabled: { opacity: 0.55 },
  fieldText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.onSurface,
  },
  fieldPlaceholder: {
    color: colors.onSurfaceMuted,
    fontWeight: "500",
  },
  fieldRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: spacing.sm,
  },
  clearBtn: { padding: 2 },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.lg,
    ...shadows.card,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetCancel: {
    fontSize: 15,
    color: colors.brand,
    fontWeight: "700",
  },
  sheetCancelDisabled: { color: colors.onSurfaceMuted, fontWeight: "500" },
  sheetTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: colors.onSurface,
    marginHorizontal: spacing.sm,
  },
  sheetDone: {
    fontSize: 15,
    color: colors.brand,
    fontWeight: "800",
  },

  list: { maxHeight: 560 },
  listContent: { paddingVertical: spacing.xs },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    fontSize: 11,
    fontWeight: "800",
    color: colors.onSurfaceMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    gap: spacing.md,
  },
  rowSelected: { backgroundColor: colors.surfaceSecondary },
  rowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: colors.onSurface,
  },
  rowTextSelected: {
    fontWeight: "700",
    color: colors.brand,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  checkboxOff: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  checkboxOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  emptyBox: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    color: colors.onSurfaceMuted,
    fontSize: 13,
  },
});
