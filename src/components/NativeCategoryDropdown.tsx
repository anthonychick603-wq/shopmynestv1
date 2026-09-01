// v1.0.187 — Native single-select category / sub-category dropdown.
//
// Two chained dropdowns:
//   1. Category — tap to open a native picker with an all-inclusive
//      scrollable list of every top-level category.
//   2. Sub-category — hidden until a category is picked; then tap to
//      open a picker with only that category's sub-categories.
//
// Trigger style: a compact dropdown "field" with the current selection
// (or placeholder) and a chevron. On Android, the native <Picker> pops
// its own OS-styled scrollable menu. On iOS the wheel picker is not a
// dropdown, so we wrap iOS in a bottom sheet that hosts the native wheel
// plus a Done button — closer to what users expect from a dropdown on
// iOS today.
//
// This is a low-level primitive — the wider `CategorySubcategoryPicker`
// wraps it and keeps its original API stable for existing call sites.
import React, { useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";
import {
  rootCategories,
  subcategoriesFor,
  type HierarchicalCategory,
} from "@/src/utils/categories";

type Props = {
  categories: HierarchicalCategory[];
  categoryId: string | null;
  subcategoryId: string | null;
  onChange: (categoryId: string | null, subcategoryId: string | null) => void;
  categoryLabel?: string;
  subcategoryLabel?: string;
  categoryPlaceholder?: string;
  subcategoryPlaceholder?: string;
  /** When true, the top row of both pickers is "All" (null selection). */
  allowAll?: boolean;
  disabled?: boolean;
  testIDPrefix?: string;
};

export function NativeCategoryDropdown({
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
  testIDPrefix = "category-dropdown",
}: Props) {
  const roots = useMemo(() => rootCategories(categories), [categories]);
  const children = useMemo(
    () => subcategoriesFor(categories, categoryId),
    [categories, categoryId],
  );

  const currentCategoryName =
    roots.find((c) => c.id === categoryId)?.name ?? null;
  const currentSubcategoryName =
    children.find((c) => c.id === subcategoryId)?.name ?? null;

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{categoryLabel}</Text>
      <SingleField
        testID={`${testIDPrefix}-category`}
        label={categoryLabel}
        placeholder={allowAll ? "All categories" : categoryPlaceholder}
        selectedId={categoryId}
        selectedName={currentCategoryName}
        options={roots}
        allowAll={allowAll}
        allAllLabel="All categories"
        disabled={disabled || roots.length === 0}
        onSelect={(id) => {
          // Tapping the currently selected root again is a no-op;
          // to clear, use the (× Clear) affordance in the field.
          if (id === categoryId) return;
          onChange(id, null);
        }}
      />

      {categoryId ? (
        <>
          <Text style={[styles.label, styles.labelTop]}>{subcategoryLabel}</Text>
          {children.length > 0 ? (
            <SingleField
              testID={`${testIDPrefix}-subcategory`}
              label={subcategoryLabel}
              placeholder={allowAll ? "All sub-categories" : subcategoryPlaceholder}
              selectedId={subcategoryId}
              selectedName={currentSubcategoryName}
              options={children}
              allowAll={allowAll}
              allAllLabel="All sub-categories"
              disabled={disabled}
              onSelect={(id) => {
                if (id === subcategoryId) return;
                onChange(categoryId, id);
              }}
            />
          ) : (
            <View style={styles.noChildren} testID={`${testIDPrefix}-no-subcategories`}>
              <Text style={styles.noChildrenText}>
                No sub-categories are configured under this category yet.
              </Text>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

type SingleFieldProps = {
  testID: string;
  label: string;
  placeholder: string;
  selectedId: string | null;
  selectedName: string | null;
  options: HierarchicalCategory[];
  allowAll: boolean;
  allAllLabel: string;
  disabled: boolean;
  onSelect: (id: string | null) => void;
};

function SingleField({
  testID,
  label,
  placeholder,
  selectedId,
  selectedName,
  options,
  allowAll,
  allAllLabel,
  disabled,
  onSelect,
}: SingleFieldProps) {
  const [open, setOpen] = useState(false);
  const displayText =
    selectedName ??
    (allowAll ? allAllLabel : placeholder);
  const isEmpty = selectedId === null;

  return (
    <>
      <TouchableOpacity
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${selectedName ?? placeholder}. Double-tap to change.`}
        onPress={() => {
          if (disabled) return;
          haptics.tap();
          setOpen(true);
        }}
        disabled={disabled}
        activeOpacity={0.7}
        style={[styles.field, disabled && styles.fieldDisabled]}
      >
        <Text
          style={[
            styles.fieldText,
            isEmpty && !allowAll && styles.fieldPlaceholder,
          ]}
          numberOfLines={1}
        >
          {displayText}
        </Text>
        <View style={styles.fieldRight}>
          {selectedName ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                haptics.tap();
                onSelect(null);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label.toLowerCase()}`}
              testID={`${testID}-clear`}
              style={styles.clearBtn}
            >
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
          <Ionicons name="chevron-down" size={18} color={colors.onSurfaceMuted} />
        </View>
      </TouchableOpacity>

      {open ? (
        <NativePickerSheet
          testID={`${testID}-sheet`}
          title={label}
          options={options}
          selectedId={selectedId}
          allowAll={allowAll}
          allAllLabel={allAllLabel}
          onClose={() => setOpen(false)}
          onCommit={(id) => {
            onSelect(id);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

type SheetProps = {
  testID: string;
  title: string;
  options: HierarchicalCategory[];
  selectedId: string | null;
  allowAll: boolean;
  allAllLabel: string;
  onClose: () => void;
  onCommit: (id: string | null) => void;
};

/**
 * Bottom-sheet dropdown container. On iOS it hosts the native wheel
 * <Picker>. On Android it renders a scrollable list of tappable rows —
 * this matches the "dropdown" affordance the user asked for (Android's
 * native <Picker> in dropdownIconColor mode still requires a mounted
 * View to anchor it, so we use a plain scroll list here for full
 * control and consistent behavior across form factors).
 */
function NativePickerSheet({
  testID,
  title,
  options,
  selectedId,
  allowAll,
  allAllLabel,
  onClose,
  onCommit,
}: SheetProps) {
  // Draft state so the iOS wheel can spin without firing onChange on every tick.
  const [draftId, setDraftId] = useState<string | null>(selectedId);

  const commit = () => {
    haptics.tap();
    onCommit(draftId);
  };

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
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID={`${testID}-cancel`}
          >
            <Text style={styles.sheetCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={commit}
            accessibilityRole="button"
            accessibilityLabel="Done"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            testID={`${testID}-done`}
          >
            <Text style={styles.sheetDone}>Done</Text>
          </TouchableOpacity>
        </View>

        {Platform.OS === "ios" ? (
          <Picker
            selectedValue={draftId ?? "__all__"}
            onValueChange={(value) => {
              setDraftId(value === "__all__" ? null : String(value));
            }}
            style={styles.iosWheel}
            itemStyle={styles.iosWheelItem}
            testID={`${testID}-wheel`}
          >
            {allowAll ? (
              <Picker.Item
                key="__all__"
                label={allAllLabel}
                value="__all__"
                color={colors.onSurface}
              />
            ) : null}
            {options.map((opt) => (
              <Picker.Item
                key={opt.id}
                label={opt.name}
                value={opt.id}
                color={colors.onSurface}
              />
            ))}
          </Picker>
        ) : (
          <ScrollView
            style={styles.androidList}
            contentContainerStyle={styles.androidListContent}
            keyboardShouldPersistTaps="handled"
            testID={`${testID}-list`}
          >
            {allowAll ? (
              <SheetRow
                label={allAllLabel}
                selected={draftId === null}
                onPress={() => {
                  haptics.tap();
                  onCommit(null);
                }}
                testID={`${testID}-row-all`}
              />
            ) : null}
            {options.map((opt) => (
              <SheetRow
                key={opt.id}
                label={opt.name}
                selected={draftId === opt.id}
                onPress={() => {
                  haptics.tap();
                  onCommit(opt.id);
                }}
                testID={`${testID}-row-${opt.id}`}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function SheetRow({
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={selected ? `${label}, selected` : label}
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
      {selected ? (
        <Ionicons name="checkmark" size={20} color={colors.brand} />
      ) : null}
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

  noChildren: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noChildrenText: { color: colors.onSurfaceMuted, fontSize: 12, lineHeight: 17 },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "72%",
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
    color: colors.onSurfaceMuted,
    fontWeight: "600",
  },
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

  iosWheel: {
    // The native iOS wheel is 216pt tall by default; RN respects the container.
    width: "100%",
    backgroundColor: colors.surface,
  },
  iosWheelItem: {
    fontSize: 18,
    color: colors.onSurface,
  },

  androidList: { maxHeight: 480 },
  androidListContent: {
    paddingVertical: spacing.xs,
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
});
