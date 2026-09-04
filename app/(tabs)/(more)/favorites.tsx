import React, { useCallback, useEffect, useState } from "react";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { FlatList, RefreshControl, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest } from "@/src/api/nest";
import { toProduct } from "@/src/api/adapters";
import { colors, radius, shadows, spacing } from "@/src/theme";
import type { Product } from "@/src/types";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { BlogPostSkeleton } from "@/src/components/BlogPostSkeleton";
import { BlogPostCard } from "@/src/components/BlogPostCard";
import { EmptyState } from "@/src/components/EmptyState";
import { useAuth } from "@/src/context/AuthContext";
import { useCart } from "@/src/context/CartContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { toast } from "@/src/components/Toast";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";

// v1.0.55 - tabs switch between favorited products and favorited blog posts,
// both surfaced from the same "Favorites" entry point.
type Tab = "items" | "posts";

export default function Favorites() {
  useBackFallback("/(tabs)/account");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { addProduct } = useCart();
  const { ids, isFavorite, toggle, refresh, blogPosts, isBlogFavorite, toggleBlog } = useFavorites();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("items");
  // v1.0.93 (Build #14) — price-drop alerts toggle. We treat this as a
  // best-effort setting: if the fetch fails we assume enabled (matches
  // the server-side default) so the UI never blocks on a bad network.
  const [priceDropAlerts, setPriceDropAlerts] = useState(true);
  const [priceDropBusy, setPriceDropBusy] = useState(false);

  // v1.0.242 — gate favorites refresh so fast pull-to-refresh + focus
  // effects can't race and can't commit after unmount.
  const { begin, isCurrent } = useLatestRequest();

  // v1.0.243 — previously this useCallback had empty deps and captured
  // `ids` from its initial closure, so after `refresh()` swapped the
  // context to a newer favorites set the hydration step still fetched
  // the ORIGINAL list. Result: pull-to-refresh appeared to do nothing
  // when the buyer added a favorite on another device between mount
  // and the refresh tap. Fetch the authoritative list from the network
  // directly here so `load` never depends on stale context state.
  const load = useCallback(async () => {
    const _tok = begin();
    setLoading(true);
    try {
      // Kick the context refresh so `ids`, `isFavorite`, etc. downstream
      // in the tree reflect the new list. We don't rely on its return
      // value here.
      const refreshPromise = refresh();
      const raw = await nest.trust.listFavorites().catch(() => null);
      const idList: string[] = (() => {
        if (!raw) return Array.from(ids);
        // Normalize the same way FavoritesContext does: pull numeric or
        // string ids off the payload's `favorites` array.
        const arr = (raw as { favorites?: unknown[] }).favorites || [];
        return arr
          .map((entry) => {
            if (typeof entry === "string" || typeof entry === "number") return String(entry);
            if (entry && typeof entry === "object" && "id" in entry) return String((entry as { id: unknown }).id);
            return "";
          })
          .filter(Boolean);
      })();
      const products = await Promise.all(
        idList.map((id) => nest.getProduct(id).then(toProduct).catch(() => null)),
      );
      if (!isCurrent(_tok)) return;
      setItems(products.filter((p): p is Product => !!p));
      // Wait for the context to settle so downstream toggles work off
      // the fresh set. Errors are swallowed — the context handles its
      // own failure surfacing.
      await refreshPromise.catch(() => {});
    } finally {
      if (isCurrent(_tok)) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [begin, isCurrent, refresh, ids]);

  useEffect(() => { load(); }, [load]);

  // Load the current price-drop opt-in state on mount. Best-effort: on
  // failure we leave the default of "on" so the toggle still reflects
  // the server behavior.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    nest.getPreferences()
      .then((p) => { if (!cancelled) setPriceDropAlerts(!!p.price_drop_alerts); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const onTogglePriceDrop = async (next: boolean) => {
    setPriceDropAlerts(next);
    setPriceDropBusy(true);
    try {
      await nest.setPreferences({ price_drop_alerts: next });
    } catch {
      setPriceDropAlerts(!next);
      toast.error("Couldn't save your preference.");
    } finally {
      setPriceDropBusy(false);
    }
  };

  // Keep the visible list in sync when a heart is toggled off here.
  useEffect(() => {
    setItems((cur) => cur.filter((p) => ids.has(p.id)));
  }, [ids]);

  // v1.0.243 — per-card add-in-progress guard so rapid taps on the
  // plus button in the favorites grid cannot fire duplicate stock
  // fetches or add multiple units to the cart.
  const [addingId, setAddingId] = useState<string | null>(null);
  const onAdd = async (p: Product) => {
    if (addingId != null) return;
    setAddingId(p.id);
    try {
      const fresh = toProduct(await nest.getProduct(p.id));
      if (!fresh.in_stock) return toast.error("Out of stock");
      const ok = await Promise.resolve(addProduct(fresh, 1));
      if (ok) toast.success("Added to cart");
      else toast.error("Couldn't add — please try again");
    } catch {
      toast.error("Could not add to cart");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity accessibilityLabel="Go back" accessibilityRole="button" onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} testID="favorites-back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></TouchableOpacity>
        <Text style={styles.topTitle}>Your favorites</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
      {!user ? (
        <EmptyState icon="heart-outline" title="Sign in to see favorites" message="Save items you love and find them here." actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} testID="favorites-signed-out" />
      ) : (
        <>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, tab === "items" && styles.tabActive]}
              onPress={() => { haptics.tap(); setTab("items"); }}
              testID="favorites-tab-items"
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "items" }}
              accessibilityLabel={`Items tab${items.length > 0 ? `, ${items.length} saved` : ""}${tab === "items" ? ", selected" : ""}`}
            >
              <Text style={[styles.tabText, tab === "items" && styles.tabTextActive]}>
                Items {items.length > 0 ? `(${items.length})` : ""}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, tab === "posts" && styles.tabActive]}
              onPress={() => { haptics.tap(); setTab("posts"); }}
              testID="favorites-tab-posts"
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === "posts" }}
              accessibilityLabel={`Posts tab${blogPosts.length > 0 ? `, ${blogPosts.length} saved` : ""}${tab === "posts" ? ", selected" : ""}`}
            >
              <Text style={[styles.tabText, tab === "posts" && styles.tabTextActive]}>
                Posts {blogPosts.length > 0 ? `(${blogPosts.length})` : ""}
              </Text>
            </TouchableOpacity>
          </View>
          {tab === "items" ? (
            <View style={styles.alertRow} testID="favorites-price-drop-row">
              <View style={{ flex: 1 }}>
                <Text style={styles.alertTitle}>Price-drop alerts</Text>
                <Text style={styles.alertSub}>Get notified when a shop lowers the price on an item you saved.</Text>
              </View>
              <Switch
                value={priceDropAlerts}
                onValueChange={(v) => { haptics.tap(); onTogglePriceDrop(v); }}
                disabled={priceDropBusy}
                trackColor={{ true: colors.brand, false: colors.borderStrong }}
                thumbColor={colors.onBrand}
                testID="favorites-price-drop-switch"
              />
            </View>
          ) : null}
          {loading ? (
            tab === "items" ? <ProductGridSkeleton count={4} /> : <BlogPostSkeleton count={3} />
          ) : tab === "items" ? (
            <FlatList
              // v1.0.77 — distinct key per tab. Without this, React reconciles
              // the two FlatLists as the same instance and RN throws
              // "Changing numColumns on the fly is not supported" when
              // switching from Items (numColumns=2) to Posts (numColumns=1).
              key="favorites-items-grid"
              data={items}
              keyExtractor={(p) => p.id}
              numColumns={2}
              columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
              contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: insets.bottom + 40 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    load();
                  }}
                  tintColor={colors.brand}
                  colors={[colors.brand]}
                />
              }
              renderItem={({ item }) => <ProductCard product={item} layout="grid" onAddToCart={() => onAdd(item)} onToggleFavorite={() => toggle(item.id)} isFavorite={isFavorite(item.id)} />}
              ListEmptyComponent={<EmptyState icon="heart-outline" title="No favorites yet" message="Tap the heart on any item to save it here." actionLabel="Browse the shop" onAction={() => router.push("/(tabs)/browse")} testID="favorites-empty" />}
            />
          ) : (
            <FlatList
              key="favorites-posts-list"
              data={blogPosts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    load();
                  }}
                  tintColor={colors.brand}
                  colors={[colors.brand]}
                />
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    haptics.tap();
                    router.push({
                      pathname: "/(tabs)/(more)/blog/[id]",
                      params: { id: item.id, post: JSON.stringify(item) },
                    });
                  }}
                  testID={`favorites-blog-open-${item.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open blog post: ${item.caption ? item.caption.slice(0, 50) : "untitled"}`}
                >
                  <BlogPostCard
                    post={item}
                    isFavorite={isBlogFavorite(item.id)}
                    onToggleFavorite={() => toggleBlog(item.id)}
                  />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<EmptyState icon="heart-outline" title="No favorited posts yet" message="Tap the heart on any Fresh from the Nest post to save it here." actionLabel="Explore the feed" onAction={() => router.push("/(tabs)")} testID="favorites-posts-empty" />}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md },
  topTitle: { fontSize: 18, fontWeight: "800", color: colors.onSurface },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  tabs: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary },
  tabActive: { backgroundColor: colors.brand },
  tabText: { fontSize: 14, fontWeight: "800", color: colors.onSurfaceMuted },
  tabTextActive: { color: colors.onBrand },
  alertRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  alertTitle: { fontSize: 14, fontWeight: "800", color: colors.onSurface },
  alertSub: { marginTop: 2, fontSize: 12, color: colors.onSurfaceMuted },
});
