// v1.0.200 — Admin category manager. Powers /admin/categories from
// plugin v3.13.61. The admin can:
//   - Browse the full product-category tree (roots + children), searchable
//   - Add a new category, optionally under an existing parent
//   - Rename or re-slug a category
//   - Reparent (move under a different root, or promote to root)
//   - Delete a category, with an optional "move products to..." reassignment
//
// The whole taxonomy fits comfortably in one payload (~300 items today),
// so we fetch once and build the tree client-side. This keeps expansion
// snappy and lets us search across every level without extra round-trips.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import { nest, ApiError, type AdminCategory } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { AdminHeader } from "@/src/components/admin/AdminHeader";
import { AdminCard } from "@/src/components/admin/AdminCard";
import { EmptyState } from "@/src/components/EmptyState";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

type ItemWithMeta = AdminCategory & { depth: number; childCount: number };

/**
 * Flatten the tree in display order: each root followed by its children
 * (recursively). We only show children when the root is expanded to
 * keep the list scannable when nothing is being edited.
 */
function buildDisplayList(
  items: AdminCategory[],
  expanded: Set<number>,
  filter: string,
): ItemWithMeta[] {
  const byParent = new Map<number, AdminCategory[]>();
  for (const it of items) {
    const list = byParent.get(it.parent) ?? [];
    list.push(it);
    byParent.set(it.parent, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const needle = filter.trim().toLowerCase();
  const matches = (it: AdminCategory) =>
    !needle ||
    it.name.toLowerCase().includes(needle) ||
    it.slug.toLowerCase().includes(needle);

  const output: ItemWithMeta[] = [];
  const walk = (parentId: number, depth: number) => {
    const kids = byParent.get(parentId) ?? [];
    for (const kid of kids) {
      const kidChildren = byParent.get(kid.id) ?? [];
      const childrenMatch = needle
        ? kidChildren.some(
            (c) => matches(c) || (byParent.get(c.id) ?? []).some(matches),
          )
        : false;
      if (matches(kid) || childrenMatch) {
        output.push({ ...kid, depth, childCount: kidChildren.length });
        // Show children when the row is expanded, or when we're
        // searching and something below matched (so the match is
        // actually visible).
        if (expanded.has(kid.id) || (needle && childrenMatch)) {
          walk(kid.id, depth + 1);
        }
      }
    }
  };
  walk(0, 0);
  return output;
}

export default function CategoriesScreen() {
  const [items, setItems] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState("");

  // Composer state — shared by "New category" and "Rename".
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"create" | "edit">("create");
  const [composerTarget, setComposerTarget] = useState<AdminCategory | null>(null);
  const [composerName, setComposerName] = useState("");
  const [composerSlug, setComposerSlug] = useState("");
  const [composerParent, setComposerParent] = useState<number>(0);
  const [composerBusy, setComposerBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await nest.adminCategoriesList();
      setItems(res.items);
      setError(null);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Could not load categories.";
      setError(msg);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const display = useMemo(
    () => buildDisplayList(items, expanded, filter),
    [items, expanded, filter],
  );

  const toggle = useCallback((id: number) => {
    haptics.tap();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const rootChoices = useMemo(
    () => [
      { id: 0, name: "— No parent (root category) —" },
      ...items
        .filter((i) => i.parent === 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => ({ id: i.id, name: i.name })),
    ],
    [items],
  );

  const pickParent = useCallback(
    (excludeId?: number) => {
      const options = rootChoices.filter((c) => c.id !== excludeId);
      const labels = options.map((c) => c.name);
      const cancelLabel = "Cancel";
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: [...labels, cancelLabel],
            cancelButtonIndex: labels.length,
            title: "Move under…",
          },
          (idx) => {
            if (idx < labels.length) {
              setComposerParent(options[idx].id);
            }
          },
        );
      } else {
        Alert.alert(
          "Move under…",
          undefined,
          [
            ...options.map((o) => ({
              text: o.name,
              onPress: () => setComposerParent(o.id),
            })),
            { text: cancelLabel, style: "cancel" as const },
          ],
        );
      }
    },
    [rootChoices],
  );

  const openCreate = useCallback(
    (parentId: number = 0) => {
      haptics.tap();
      setComposerMode("create");
      setComposerTarget(null);
      setComposerName("");
      setComposerSlug("");
      setComposerParent(parentId);
      setComposerOpen(true);
    },
    [],
  );

  const openEdit = useCallback((cat: AdminCategory) => {
    haptics.tap();
    setComposerMode("edit");
    setComposerTarget(cat);
    setComposerName(cat.name);
    setComposerSlug(cat.slug);
    setComposerParent(cat.parent);
    setComposerOpen(true);
  }, []);

  const submitComposer = useCallback(async () => {
    const name = composerName.trim();
    if (!name) {
      toast.error("Please give this category a name.");
      return;
    }
    setComposerBusy(true);
    try {
      if (composerMode === "create") {
        await nest.adminCategoryCreate({
          name,
          slug: composerSlug.trim() || undefined,
          parent: composerParent || 0,
        });
        toast.success("Category created.");
      } else if (composerTarget) {
        const patch: { name?: string; slug?: string; parent?: number } = {};
        if (name !== composerTarget.name) patch.name = name;
        const nextSlug = composerSlug.trim();
        if (nextSlug && nextSlug !== composerTarget.slug) patch.slug = nextSlug;
        if (composerParent !== composerTarget.parent) patch.parent = composerParent;
        if (Object.keys(patch).length > 0) {
          await nest.adminCategoryUpdate(composerTarget.id, patch);
          toast.success("Category updated.");
        }
      }
      setComposerOpen(false);
      await load();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Save failed.";
      toast.error(msg);
    } finally {
      setComposerBusy(false);
    }
  }, [composerMode, composerName, composerSlug, composerParent, composerTarget, load]);

  const confirmDelete = useCallback(
    (cat: AdminCategory) => {
      const doDelete = async (reassignTo?: number) => {
        try {
          const res = await nest.adminCategoryDelete(cat.id, reassignTo);
          const movedText = res.moved > 0 ? ` Moved ${res.moved} product${res.moved === 1 ? "" : "s"}.` : "";
          toast.success(`Category deleted.${movedText}`);
          await load();
        } catch (e) {
          const msg = e instanceof ApiError ? e.message : "Delete failed.";
          toast.error(msg);
        }
      };
      if (cat.count > 0) {
        // Offer to reassign products before wiping the term.
        const roots = items
          .filter((i) => i.id !== cat.id && i.parent === 0)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 6);
        const labels = [
          `Delete without reassigning (${cat.count} product${cat.count === 1 ? "" : "s"} lose this tag)`,
          ...roots.map((r) => `Move products to “${r.name}”`),
          "Cancel",
        ];
        if (Platform.OS === "ios") {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              title: `Delete “${cat.name}”?`,
              options: labels,
              destructiveButtonIndex: 0,
              cancelButtonIndex: labels.length - 1,
            },
            (idx) => {
              if (idx === 0) doDelete();
              else if (idx > 0 && idx <= roots.length) doDelete(roots[idx - 1].id);
            },
          );
        } else {
          Alert.alert(
            `Delete “${cat.name}”?`,
            `${cat.count} product${cat.count === 1 ? "" : "s"} currently use this category.`,
            [
              { text: "Delete anyway", style: "destructive", onPress: () => doDelete() },
              ...roots.map((r) => ({
                text: `Move to ${r.name}`,
                onPress: () => doDelete(r.id),
              })),
              { text: "Cancel", style: "cancel" as const },
            ],
          );
        }
      } else {
        Alert.alert(
          `Delete “${cat.name}”?`,
          "This category has no products attached.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => doDelete() },
          ],
        );
      }
    },
    [items, load],
  );

  const openRowActions = useCallback(
    (cat: AdminCategory) => {
      const actions = [
        { label: "Rename or move…", run: () => openEdit(cat) },
        { label: "Add subcategory…", run: () => openCreate(cat.id) },
        { label: "Delete…", run: () => confirmDelete(cat), destructive: true },
      ];
      const labels = [...actions.map((a) => a.label), "Cancel"];
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: cat.name,
            options: labels,
            destructiveButtonIndex: actions.findIndex((a) => a.destructive),
            cancelButtonIndex: labels.length - 1,
          },
          (idx) => {
            if (idx >= 0 && idx < actions.length) actions[idx].run();
          },
        );
      } else {
        Alert.alert(cat.name, undefined, [
          ...actions.map((a) => ({
            text: a.label,
            style: (a.destructive ? "destructive" : "default") as "default" | "destructive",
            onPress: a.run,
          })),
          { text: "Cancel", style: "cancel" as const },
        ]);
      }
    },
    [confirmDelete, openCreate, openEdit],
  );

  const totalRoots = useMemo(() => items.filter((i) => i.parent === 0).length, [items]);
  const totalSubs = items.length - totalRoots;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <AdminHeader
        title="Categories"
        subtitle={loading ? "Loading…" : `${totalRoots} roots · ${totalSubs} subcategories`}
        actions={[
          {
            icon: "add",
            label: "Add category",
            onPress: () => openCreate(0),
            testID: "admin-categories-add",
          },
        ]}
      />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.onSurfaceMuted} style={styles.searchIcon} />
        <TextInput
          placeholder="Filter categories…"
          placeholderTextColor={colors.onSurfaceMuted}
          value={filter}
          onChangeText={setFilter}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          testID="admin-categories-search"
        />
        {filter ? (
          <TouchableOpacity onPress={() => setFilter("")} accessibilityLabel="Clear filter">
            <Ionicons name="close-circle" size={18} color={colors.onSurfaceMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Loading categories…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState title="Could not load categories" message={error} />
          <TouchableOpacity onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : display.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            title="No categories match"
            message={filter ? "Try a different search." : "Tap + to add the first one."}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <AdminCard style={styles.card}>
            {display.map((item, idx) => {
              const isOpen = expanded.has(item.id);
              const canExpand = item.childCount > 0;
              const isLast = idx === display.length - 1;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.row, !isLast && styles.rowBorder]}
                  activeOpacity={0.7}
                  onPress={() => (canExpand ? toggle(item.id) : openRowActions(item))}
                  onLongPress={() => openRowActions(item)}
                  testID={`admin-category-row-${item.id}`}
                >
                  <View style={[styles.chevron, { marginLeft: item.depth * spacing.md }]}>
                    {canExpand ? (
                      <Ionicons
                        name={isOpen ? "chevron-down" : "chevron-forward"}
                        size={16}
                        color={colors.onSurfaceMuted}
                      />
                    ) : (
                      <View style={styles.dot} />
                    )}
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.slug}
                      {item.count > 0
                        ? ` · ${item.count} product${item.count === 1 ? "" : "s"}`
                        : ""}
                      {canExpand
                        ? ` · ${item.childCount} sub${item.childCount === 1 ? "" : "s"}`
                        : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openRowActions(item)}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel="Row actions"
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </AdminCard>
        </ScrollView>
      )}

      {composerOpen ? (
        <View style={styles.composerBackdrop}>
          <View style={styles.composer}>
            <Text style={styles.composerTitle}>
              {composerMode === "create" ? "New category" : "Edit category"}
            </Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              value={composerName}
              onChangeText={setComposerName}
              placeholder="e.g. Vintage Cameras"
              placeholderTextColor={colors.onSurfaceMuted}
              style={styles.input}
              autoFocus
              testID="admin-category-name"
            />

            <Text style={styles.label}>Slug (optional)</Text>
            <TextInput
              value={composerSlug}
              onChangeText={setComposerSlug}
              placeholder="auto-generated from name"
              placeholderTextColor={colors.onSurfaceMuted}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              testID="admin-category-slug"
            />

            <Text style={styles.label}>Parent</Text>
            <TouchableOpacity
              onPress={() => pickParent(composerTarget?.id)}
              style={styles.input}
              testID="admin-category-parent"
            >
              <Text style={styles.inputText}>
                {rootChoices.find((r) => r.id === composerParent)?.name ??
                  "— No parent (root category) —"}
              </Text>
            </TouchableOpacity>

            <View style={styles.composerActions}>
              <TouchableOpacity
                onPress={() => setComposerOpen(false)}
                style={[styles.btn, styles.btnGhost]}
                disabled={composerBusy}
              >
                <Text style={styles.btnGhostText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitComposer}
                style={[styles.btn, styles.btnPrimary, composerBusy && styles.btnDisabled]}
                disabled={composerBusy}
                testID="admin-category-save"
              >
                <Text style={styles.btnPrimaryText}>
                  {composerBusy ? "Saving…" : composerMode === "create" ? "Create" : "Save"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.field,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, ...typeTokens.body, paddingVertical: 0 },
  list: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { padding: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  chevron: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.hairlineStrong },
  rowBody: { flex: 1, marginRight: spacing.sm },
  name: { ...typeTokens.body, fontWeight: "600", fontSize: 15 },
  sub: { ...typeTokens.caption, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  muted: { color: colors.onSurfaceMuted },
  retry: { marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  retryText: { color: colors.brand, fontWeight: "600" },

  composerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  composer: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  composerTitle: { ...typeTokens.h1, fontSize: 18, marginBottom: spacing.md },
  label: { ...typeTokens.micro, marginTop: spacing.sm, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    height: 44,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  inputText: { ...typeTokens.body, color: colors.onSurface },
  composerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  btn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.field,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryText: { ...typeTokens.body, color: colors.onBrand, fontWeight: "600" },
  btnGhost: { backgroundColor: "transparent" },
  btnGhostText: { ...typeTokens.body, fontWeight: "500" },
  btnDisabled: { opacity: 0.6 },
});
