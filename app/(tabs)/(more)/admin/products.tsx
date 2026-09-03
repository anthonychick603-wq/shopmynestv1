// v1.0.194 — Admin products management. Powers /admin/products from
// plugin v3.13.58. The admin can:
//   - Browse every product on the marketplace (paginated, 25/page)
//   - Filter by post_status (any / publish / draft / private / pending)
//   - Filter to only featured products
//   - Search across title + SKU + short description (WP native search)
//   - Feature / unfeature, hide (private), publish, unlist (draft), trash
//   - Enter multi-select mode to bulk-apply any of the above actions
//
// Anything richer than these actions (editing price/description/photos)
// still routes back to WordPress admin via the product permalink.
import React, { useCallback, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { nest, ApiError, type AdminProduct, type AdminProductAction, type AdminProductStatus } from "@/src/api/nest";
import { toast } from "@/src/components/Toast";
import { AdminHeader } from "@/src/components/admin/AdminHeader";
import { AdminCard } from "@/src/components/admin/AdminCard";
import { FilterBar, type FilterChip } from "@/src/components/admin/FilterBar";
import { InfiniteList } from "@/src/components/admin/InfiniteList";
import { AdminStatusPill } from "@/src/components/admin/AdminStatusPill";
import { EmptyState } from "@/src/components/EmptyState";
import { useAdminFocusRefetch } from "@/src/hooks/use-admin-focus-refetch";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";
import { useBackFallback } from "@/src/context/BackFallback";

const STATUS_CHIPS: readonly FilterChip<AdminProductStatus>[] = [
  { value: "any", label: "All" },
  { value: "publish", label: "Live" },
  { value: "draft", label: "Draft" },
  { value: "private", label: "Hidden" },
  { value: "pending", label: "Pending" },
];

const ACTION_LABELS: Record<AdminProductAction, { label: string; destructive?: boolean; hint: string }> = {
  feature: { label: "Feature", hint: "Show on featured shelf" },
  unfeature: { label: "Remove from featured", hint: "" },
  hide: { label: "Hide from buyers", hint: "Sets status to private" },
  publish: { label: "Publish", hint: "Sets status to live" },
  unlist: { label: "Unlist", hint: "Sets status to draft" },
  trash: { label: "Move to trash", destructive: true, hint: "Reversible in WordPress admin" },
};

export default function ProductsScreen() {
  useBackFallback("/admin");
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AdminProductStatus>("any");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [totalKnown, setTotalKnown] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fetcher = useCallback(
    async (page: number) => {
      const res = await nest.adminListProducts({
        page,
        per_page: 25,
        search: query || undefined,
        status,
        featured: featuredOnly ? 1 : undefined,
      });
      setTotalKnown(res.total);
      return { items: res.items, total_pages: res.total_pages, total: res.total };
    },
    [query, status, featuredOnly]
  );

  const reload = useCallback(() => {
    setReloadToken((t) => t + 1);
    setSelected(new Set());
  }, []);
  useAdminFocusRefetch(reload); // v1.0.236 admin console focus refetch

  const toggleSelect = useCallback((id: number) => {
    haptics.tap();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runSingleAction = useCallback(async (p: AdminProduct, action: AdminProductAction) => {
    try {
      await nest.adminProductAction(p.id, action);
      toast.success(`${ACTION_LABELS[action].label}: ${p.title}`);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Action failed.");
    }
  }, [reload]);

  const runBulkAction = useCallback(async (action: AdminProductAction) => {
    if (selected.size === 0) return;
    try {
      const res = await nest.adminProductsBulk(action, Array.from(selected));
      if (res.failed.length === 0) toast.success(`${ACTION_LABELS[action].label} applied to ${res.success}`);
      else toast.info(`${res.success} ok, ${res.failed.length} failed`);
      setSelected(new Set());
      setSelectMode(false);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.friendly : "Bulk action failed.");
    }
  }, [selected, reload]);

  const openRowActions = useCallback((p: AdminProduct) => {
    const availableActions: AdminProductAction[] = [];
    if (!p.featured) availableActions.push("feature"); else availableActions.push("unfeature");
    if (p.status === "publish") availableActions.push("hide", "unlist");
    if (p.status === "draft") availableActions.push("publish", "hide");
    if (p.status === "private") availableActions.push("publish", "unlist");
    if (p.status === "pending") availableActions.push("publish", "unlist");
    availableActions.push("trash");

    const openInWp = () => {
      if (p.permalink) Linking.openURL(p.permalink).catch(() => toast.error("Couldn't open product page."));
    };

    const items: { label: string; destructive?: boolean; run: () => void }[] = [
      ...availableActions.map((a) => ({
        label: ACTION_LABELS[a].label,
        destructive: ACTION_LABELS[a].destructive,
        run: () => { void runSingleAction(p, a); },
      })),
      { label: "Open in web admin", run: openInWp },
    ];

    if (Platform.OS === "ios") {
      const labels = items.map((i) => i.label).concat("Cancel");
      const destructiveIndex = items.findIndex((i) => i.destructive);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: p.title,
          message: p.sku ? `SKU: ${p.sku}` : undefined,
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
        },
        (idx) => { items[idx]?.run(); }
      );
    } else {
      Alert.alert(
        p.title,
        p.sku ? `SKU: ${p.sku}` : undefined,
        [
          ...items.map((i) => ({
            text: i.label,
            style: (i.destructive ? "destructive" : "default") as "default" | "destructive",
            onPress: i.run,
          })),
          { text: "Cancel", style: "cancel" as const },
        ],
        { cancelable: true }
      );
    }
  }, [runSingleAction]);

  const openBulkMenu = useCallback(() => {
    if (selected.size === 0) return;
    const items: { label: string; destructive?: boolean; action: AdminProductAction }[] = [
      { label: `Feature ${selected.size}`, action: "feature" },
      { label: `Publish ${selected.size}`, action: "publish" },
      { label: `Hide ${selected.size}`, action: "hide" },
      { label: `Unlist ${selected.size}`, action: "unlist" },
      { label: `Move ${selected.size} to trash`, action: "trash", destructive: true },
    ];
    if (Platform.OS === "ios") {
      const labels = items.map((i) => i.label).concat("Cancel");
      const destructiveIndex = items.findIndex((i) => i.destructive);
      ActionSheetIOS.showActionSheetWithOptions(
        { title: "Bulk action", options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined },
        (idx) => { const it = items[idx]; if (it) void runBulkAction(it.action); }
      );
    } else {
      Alert.alert("Bulk action", `${selected.size} product${selected.size === 1 ? "" : "s"} selected`, [
        ...items.map((i) => ({ text: i.label, style: (i.destructive ? "destructive" : "default") as "default" | "destructive", onPress: () => void runBulkAction(i.action) })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }, [selected, runBulkAction]);

  const renderItem = useCallback(
    ({ item: p }: { item: AdminProduct }) => {
      const checked = selected.has(p.id);
      const onPress = selectMode ? () => toggleSelect(p.id) : () => openRowActions(p);
      return (
        <AdminCard onPress={onPress}>
          <View style={styles.row}>
            {selectMode ? (
              <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
              </View>
            ) : null}
            {p.image ? (
              <Image source={{ uri: p.image }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <Ionicons name="cube-outline" size={22} color={colors.onSurfaceMuted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={2}>{p.title}</Text>
                {p.featured ? <Ionicons name="star" size={14} color={colors.warning} /> : null}
              </View>
              <View style={styles.meta}>
                <AdminStatusPill status={p.status} />
                <Text style={styles.metaText}>${p.price.toFixed(2)}</Text>
                {p.stock !== null ? (
                  <Text style={[styles.metaText, !p.in_stock && { color: colors.warning }]}>{p.stock} in stock</Text>
                ) : null}
              </View>
              {p.seller_name ? <Text style={styles.seller} numberOfLines={1}>Seller: {p.seller_name}</Text> : null}
            </View>
            {!selectMode ? <Ionicons name="ellipsis-horizontal" size={18} color={colors.onSurfaceMuted} /> : null}
          </View>
        </AdminCard>
      );
    },
    [selected, selectMode, toggleSelect, openRowActions]
  );

  const header = useMemo(
    () => (
      <View style={styles.headerWrap}>
        <FilterBar<AdminProductStatus>
          query={query}
          onQueryChange={(next) => { setQuery(next); reload(); }}
          placeholder="Search title, SKU"
          chips={STATUS_CHIPS}
          activeChip={status}
          onChipChange={(next) => { haptics.tap(); setStatus(next); reload(); }}
          right={
            <TouchableOpacity
              onPress={() => { haptics.tap(); setFeaturedOnly((v) => !v); reload(); }}
              style={[styles.featuredToggle, featuredOnly && styles.featuredToggleOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: featuredOnly }}
              testID="admin-products-featured-toggle"
            >
              <Ionicons name={featuredOnly ? "star" : "star-outline"} size={16} color={featuredOnly ? "#fff" : colors.onSurface} />
            </TouchableOpacity>
          }
        />
        <View style={styles.subHeader}>
          {totalKnown !== null ? (
            <Text style={styles.totalHint}>{totalKnown.toLocaleString()} products</Text>
          ) : <View />}
          <TouchableOpacity
            onPress={() => { haptics.tap(); setSelectMode((v) => !v); setSelected(new Set()); }}
            style={styles.selectToggle}
            accessibilityRole="button"
            testID="admin-products-select-toggle"
          >
            <Ionicons name={selectMode ? "close" : "checkbox-outline"} size={16} color={colors.brand} />
            <Text style={styles.selectToggleText}>{selectMode ? "Cancel select" : "Select"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    ),
    [query, status, featuredOnly, totalKnown, selectMode, reload]
  );

  if (me?.role !== "admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AdminHeader title="Products" backTo="/admin" />
        <EmptyState icon="lock-closed-outline" title="Not available" message="Admin access is required." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AdminHeader title="Products" backTo="/admin" />
      <InfiniteList<AdminProduct>
        fetcher={fetcher}
        reloadToken={reloadToken}
        headerComponent={header}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        emptyIcon="cube-outline"
        emptyTitle="No products match"
        emptyMessage="Try clearing filters or switching the status."
      />
      {selectMode && selected.size > 0 ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkCount}>{selected.size} selected</Text>
          <TouchableOpacity style={styles.bulkBtn} onPress={openBulkMenu} testID="admin-products-bulk-apply">
            <Text style={styles.bulkBtnText}>Apply action</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// v1.0.229 — Admin Products refinement. Featured toggle, thumb, and
// bulk action bar migrate to token surfaces; typography on shared tokens.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerWrap: { marginBottom: spacing.sm },
  subHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  totalHint: { ...typeTokens.caption },
  selectToggle: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: spacing.sm },
  selectToggleText: { ...typeTokens.caption, fontWeight: "700", color: colors.brand },
  featuredToggle: {
    width: 36, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.hairline,
  },
  featuredToggleOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  checkbox: {
    width: 22, height: 22, borderRadius: radius.sm,
    borderWidth: 2, borderColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.brand },
  thumb: { width: 54, height: 54, borderRadius: radius.field, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  title: { flex: 1, ...typeTokens.body, fontWeight: "700", lineHeight: 18 },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs, flexWrap: "wrap" },
  metaText: { ...typeTokens.caption, fontWeight: "600" },
  seller: { ...typeTokens.micro, marginTop: 2 },
  bulkBar: {
    position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md,
    backgroundColor: colors.onSurface, borderRadius: radius.card,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  bulkCount: { ...typeTokens.body, color: "#FFFFFF", fontWeight: "700" },
  bulkBtn: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  bulkBtnText: { ...typeTokens.caption, color: "#FFFFFF", fontWeight: "800" },
});
