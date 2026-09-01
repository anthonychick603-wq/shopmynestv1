// v1.0.192 — Reusable filter bar for admin lists. Combines a search input,
// horizontal status chip strip, and optional right-side control (sort,
// range picker, etc.) into one row. Every admin list now uses this so
// filtering feels the same everywhere.
//
// Design notes:
//   - The search input debounces internally at 250 ms; the parent gets a
//     `onQueryChange` callback with the already-debounced value. Callers
//     don't have to remember to add useDebounce themselves and every
//     admin list gets the same feel.
//   - Chip strip is horizontally scrollable; the active chip renders in
//     brand color with white text (WCAG-AA verified in theme.ts). Passing
//     an empty `chips` array collapses that row entirely so the search
//     input sits alone.
//   - The whole bar is sticky-friendly: parents can wrap it in a
//     stickyHeaderIndices=[0] to have it pin at the top of a FlatList.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

export type FilterChip<V extends string = string> = {
  value: V;
  label: string;
  count?: number | null;
};

export function FilterBar<V extends string = string>({
  query,
  onQueryChange,
  placeholder = "Search…",
  chips,
  activeChip,
  onChipChange,
  right,
  autoFocus = false,
  testID = "admin-filter-bar",
}: {
  query: string;
  onQueryChange: (next: string) => void;
  placeholder?: string;
  chips?: readonly FilterChip<V>[];
  activeChip?: V;
  onChipChange?: (next: V) => void;
  right?: React.ReactNode;
  autoFocus?: boolean;
  testID?: string;
}) {
  // Debounce parent notifications so we don't refetch on every keystroke.
  // Local state tracks the raw input; the debounced value flows outward.
  const [local, setLocal] = useState(query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // v1.0.192 — Keep local in sync when parent resets the filter (e.g. after
  // navigating back to a saved state). Only overwrite when the parent's
  // value actually differs, otherwise every parent re-render would blow
  // away the user's in-flight typing.
  useEffect(() => {
    setLocal((prev) => (prev === query ? prev : query));
  }, [query]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    // Only debounce when the debounced value would change; skipping the
    // timer for no-op edits keeps the parent from getting a stray call
    // on mount.
    if (local === query) return;
    timer.current = setTimeout(() => onQueryChange(local), 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [local, onQueryChange, query]);

  const showChips = useMemo(() => (chips?.length ?? 0) > 0, [chips]);

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.onSurfaceMuted} style={{ marginLeft: spacing.md }} />
          <TextInput
            value={local}
            onChangeText={setLocal}
            placeholder={placeholder}
            placeholderTextColor={colors.onSurfaceMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={autoFocus}
            returnKeyType="search"
            style={styles.searchInput}
            testID={`${testID}-input`}
          />
          {local ? (
            <TouchableOpacity
              onPress={() => { haptics.tap(); setLocal(""); }}
              hitSlop={12}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              testID={`${testID}-clear`}
            >
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        {right ? <View style={{ marginLeft: spacing.sm }}>{right}</View> : null}
      </View>

      {showChips ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
          keyboardShouldPersistTaps="handled"
        >
          {chips!.map((c) => {
            const active = c.value === activeChip;
            return (
              <TouchableOpacity
                key={c.value}
                onPress={() => { haptics.tap(); onChipChange?.(c.value); }}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                accessibilityState={{ selected: active }}
                testID={`${testID}-chip-${c.value}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                  {c.label}
                  {c.count != null ? ` · ${c.count}` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  searchRow: { flexDirection: "row", alignItems: "center" },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    minHeight: 44,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 0,
    color: colors.onSurface,
    fontSize: 15,
    minHeight: 44,
  },
  clearBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chipsScroll: { gap: spacing.xs, paddingRight: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.onSurface },
  chipTextActive: { color: "#FFFFFF" },
});
