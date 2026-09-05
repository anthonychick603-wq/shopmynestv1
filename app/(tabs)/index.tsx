import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRequest } from "@/src/hooks/use-latest-request";
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { useInvalidateOnFocus } from "@/src/state/mutationBus";
import { readSwr, writeSwr } from "@/src/state/swrCache";
import { toBlogPost, toProduct, feedRowToProduct } from "@/src/api/adapters";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import type { BlogPost, Product } from "@/src/types";
import { BlogPostCard } from "@/src/components/BlogPostCard";
import { ProductCard } from "@/src/components/ProductCard";
import { ProductGridSkeleton } from "@/src/components/ProductCardSkeleton";
import { ScrollView } from "react-native";
import { NestLogo } from "@/src/components/NestLogo";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { EmptyState } from "@/src/components/EmptyState";
import { Button } from "@/src/components/Button";
import { usePushFromTab } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { useAuth } from "@/src/context/AuthContext";
import { useFavorites } from "@/src/context/FavoritesContext";
import { useCart } from "@/src/context/CartContext";
import { toast } from "@/src/components/Toast";

const PER_PAGE = 20;

export default function Blog() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const push = usePushFromTab();
  const { user, refresh: refreshAuth } = useAuth();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  // v1.0.253 — blog fetch is now decoupled from the outer `loading` flag.
  // The Home tab now paints the widgets (home feed, recently viewed, for-you)
  // as soon as they resolve, and shows an inline skeleton at the top of the
  // blog list while `blogLoading` is true. Prior to this the entire Home tab
  // stayed on the skeleton grid until blog resolved, so a slow blog fetch
  // (or the 12 s watchdog) was the perceived Home load time even when the
  // widgets were ready in 1 s.
  const [blogLoading, setBlogLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [homeItems, setHomeItems] = useState<Product[]>([]);
  const [hasFollowed, setHasFollowed] = useState(false);
  // v1.0.94 (Build #18a) — recently viewed carousel. Only shown when logged
  // in and there's at least one row from the server MRU.
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  // v1.0.132 — Picked for you carousel powered by the trust suite's
  // /nest-trust/v1/feed personalized ranker. Silent failure keeps the row
  // absent (same pattern as Fresh from the Nest / Keep browsing) so a bad
  // network doesn't paint an error state on the home tab.
  const [forYouItems, setForYouItems] = useState<Product[]>([]);
  // v1.0.134 — abandoned-cart banner. Populated by /cart/abandoned when the
  // user has items in their cart but hasn't checked out. Hidden after tap or
  // dismiss; server also hides it on order placement (row deleted server-side).
  const [abandoned, setAbandoned] = useState<{ line_count: number; total_cents: number } | null>(null);
  const { isFavorite, toggle: toggleFavorite, isBlogFavorite, toggleBlog: toggleBlogFavorite } = useFavorites();
  const { addProduct } = useCart();

  // v1.0.53 - the Fresh from the Nest carousel previously rendered
  // ProductCard with no callbacks, so tapping the heart or plus button did
  // nothing (silent no-op). Mirror the browse-tab handlers here so the same
  // heart-toggles-favorite / plus-adds-to-cart contract works on the home
  // feed too.
  const onFav = (p: Product) => {
    if (!user) return push("/(auth)/login");
    toggleFavorite(p.id);
  };
  // v1.0.243 — per-card add-in-progress guard. Prevents rapid taps on
  // the plus button from firing two /products/{id} fetches and adding
  // multiple units when only one was intended.
  const [addingId, setAddingId] = useState<string | null>(null);
  const onAdd = async (p: Product) => {
    if (!user) return push("/(auth)/login");
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

  // v1.0.242 — useLatestRequest gates each home-tab async pipeline so fast
  // navigations and back-to-back refreshes can't commit stale state.
  //
  // v1.0.259 — CRITICAL FIX: previously a SINGLE useLatestRequest was
  // shared across four independent concurrent pipelines (blog, home
  // widget, for-you, recently-viewed). Each one called `begin()`
  // synchronously at the top, bumping the shared counter and
  // invalidating the sibling tokens. Only the LAST caller's token
  // survived, so three of the four post-await state setters were
  // ALWAYS skipped on cold install (when SWR cache is empty and
  // there's no fallback paint). That's why fresh v1.0.257 installs saw
  // an empty blog with only skeleton — the blog `setPosts` was
  // skipped by isCurrent guard. Now each fetch owns its own counter,
  // and the guard only fires when the SAME fetch is superseded by a
  // newer call to the SAME fetch (which is what we want).
  const blogGate = useLatestRequest();
  const homeGate = useLatestRequest();
  const forYouGate = useLatestRequest();
  const recentsGate = useLatestRequest();

  const loadHomeFeed = useCallback(async () => {
    const _tok = homeGate.begin();
    try {
      // v1.0.157 — request 25 items and enforce in-stock client-side so
      // Fresh from the Nest is exactly "25 most recent, in stock."
      // Server (plugin ≥ v3.13.18) already hides OOS, but the client
      // filter is a belt-and-suspenders for older plugin builds.
      const res = await nest.getHomeFeed({ per_page: 25 });
      if (!homeGate.isCurrent(_tok)) return;
      const items = (res.items || [])
        .map(toProduct)
        .filter((p) => p.in_stock && p.stock > 0)
        .slice(0, 25);
      setHomeItems(items);
      setHasFollowed(res.has_followed);
      // v1.0.254 — persist for next cold start.
      void writeSwr(user?.id, "home_feed", { items, has_followed: res.has_followed });
    } catch {
      // Non-fatal; home feed just stays empty.
    }
  }, [homeGate, user]);

  // v1.0.132 — Personalized ranker: recency + favorites + follows + badge +
  // sales + boost. We only show the row when the user is signed in AND the
  // ranker returned at least 6 items — for a brand-new signed-in user the
  // score collapses to recency+sales, which duplicates "Fresh from the
  // Nest", so gating on a full row keeps the home tab from repeating itself.
  const loadForYouFeed = useCallback(async () => {
    if (!user) { setForYouItems([]); return; }
    const _tok = forYouGate.begin();
    try {
      const res = await nest.trust.getPersonalizedFeed({ per_page: 12 });
      if (!forYouGate.isCurrent(_tok)) return;
      // v1.0.159 — also filter OOS from Picked for you so the whole home
      // tab is consistent: no home carousel should ever surface a listing
      // the buyer can't add to cart.
      const items = (res.items || [])
        .map(feedRowToProduct)
        .filter((p) => p.in_stock && p.stock > 0);
      const visible = items.length >= 6 ? items : [];
      setForYouItems(visible);
      void writeSwr(user.id, "for_you", { items: visible });
    } catch {
      if (!forYouGate.isCurrent(_tok)) return;
      setForYouItems([]);
    }
  }, [user, forYouGate]);

  // v1.0.94 (Build #18a) — recently viewed for the signed-in buyer. Silent
  // failure keeps the row simply absent, so no error UI on the home tab.
  const loadRecentlyViewed = useCallback(async () => {
    if (!user) { setRecentlyViewed([]); return; }
    const _tok = recentsGate.begin();
    try {
      const res = await nest.getRecentlyViewed(12);
      if (!recentsGate.isCurrent(_tok)) return;
      // v1.0.159 — hide out-of-stock items from Keep browsing. A greyed-out
      // "you viewed this but can't buy it" row is worse than not showing
      // the item at all; when it restocks it will come back into the feed
      // via the same MRU list.
      const items = (res.items || [])
        .map(toProduct)
        .filter((p) => p.in_stock && p.stock > 0);
      setRecentlyViewed(items);
      void writeSwr(user.id, "recently_viewed", { items });
    } catch {
      if (!recentsGate.isCurrent(_tok)) return;
      setRecentlyViewed([]);
    }
  }, [user, recentsGate]);

  const load = useCallback(async (nextPage = 1) => {
    // v1.0.259 — use the dedicated blogGate rather than the removed shared
    // `begin`/`isCurrent`. This token now guards ONLY the blog fetch (and
    // the ancillary outer flags like refreshing/loading which are also
    // tied to "is this the current blog load"). Widget invalidation is
    // handled inside each widget loader with its own gate.
    const _tok = blogGate.begin();
    setError(null);
    try {
      // v1.0.253 — truly independent fetch fan-out on page 1. Each of the
      // four fetches (home widgets × 3, blog) resolves and clears its own
      // spinner without waiting on the others. The outer `loading` flag
      // clears as soon as *any* of the widgets settles — the perceived
      // Home-tab load is now bounded by the fastest widget, not the
      // slowest fetch. The blog list gets an inline skeleton via
      // `blogLoading`; it stays true until getBlogPosts resolves or fails.
      //
      // Timing logs (dev-only) let us confirm on-device wall-clock times
      // for each fetch when triaging slow-Home reports. Metro / adb
      // logcat shows the labels.
      if (nextPage === 1) {
        setBlogLoading(true);
        const t0 = Date.now();
        const mark = (label: string, tStart: number) => {
          if (__DEV__) console.log(`[home:timing] ${label} took ${Date.now() - tStart}ms`);
        };
        // Blog gets its own tracking so `loading` can settle on widgets alone.
        const blogPromise = (async () => {
          const bStart = Date.now();
          try {
            const res = await nest.getBlogPosts({ page: nextPage, per_page: PER_PAGE });
            mark("blog", bStart);
            if (!blogGate.isCurrent(_tok)) return;
            const items = (res.items || []).map(toBlogPost);
            setPosts(items);
            setPage(res.page ?? nextPage);
            setTotalPages(res.total_pages ?? 1);
            // v1.0.254 — SWR: cache blog page 1 for instant next-launch paint.
            void writeSwr(user?.id, "blog_page1", { items, page: res.page ?? 1, total_pages: res.total_pages ?? 1 });
          } catch (e) {
            mark("blog(err)", bStart);
            if (!blogGate.isCurrent(_tok)) return;
            setError(e instanceof ApiError ? e.friendly : "Could not load the blog.");
          } finally {
            // v1.0.258 — always clear blogLoading, even for a superseded
            // token. Previously this was `if (isCurrent(_tok))`, which meant
            // that when a second `load(1)` invalidated the first one
            // (e.g. via useInvalidateOnFocus firing on mount), the first
            // load's blog finally would skip clearing the flag. If the
            // second load then errored or was itself superseded, the
            // skeleton stuck forever. A superseded fetch should still
            // clear its own loading flag; a newer load will re-set it to
            // true when it starts. Fixes stuck blog skeleton reported in
            // the v1.0.257 build video.
            setBlogLoading(false);
          }
        })();
        // Wrap each widget so we can log its wall-clock time. Each widget's
        // loader already updates its own state + swallows errors, so all we
        // do here is time it and hook first-resolution to clear `loading`.
        // The Promise-per-widget is created ONCE and reused for both the
        // race (first-in unblocks the skeleton grid) and the all (final
        // "widgets done" timing log). Do not call these twice or we
        // double-fire the fetches.
        const timedWidget = (label: string, fn: () => Promise<void>): Promise<void> => {
          const s = Date.now();
          return fn().then(
            () => { mark(label, s); },
            () => { mark(`${label}(err)`, s); },
          );
        };
        const widgetPromises = [
          timedWidget("home", loadHomeFeed),
          timedWidget("recentlyViewed", loadRecentlyViewed),
          timedWidget("forYou", loadForYouFeed),
        ];
        // As soon as ANY widget resolves, unblock the skeleton grid and
        // dismiss the pull-to-refresh spinner. Blog and the remaining
        // widgets continue in the background. `timedWidget` never rejects
        // (it swallows errors above), so Promise.race here is effectively
        // "first to settle".
        void Promise.race(widgetPromises).then(() => {
          if (!blogGate.isCurrent(_tok)) return;
          setLoading(false);
          setRefreshing(false);
        });
        // NOTE: we deliberately don't `await` blogPromise or widgetPromises
        // here. The blog list paints when blogLoading flips, the widgets
        // paint when their own state setters fire, and the refresh
        // control clears in the finally block below on the first
        // widget race. If the user pulls to refresh while blog is still
        // pending, `refreshing` clears with the widgets — the inline blog
        // skeleton keeps them informed.
        void Promise.all(widgetPromises).finally(() => {
          if (__DEV__) mark("widgets(all)", t0);
        });
        void blogPromise;
      } else {
        setBlogLoading(true);
        const res = await nest.getBlogPosts({ page: nextPage, per_page: PER_PAGE });
        if (!blogGate.isCurrent(_tok)) return;
        const items = (res.items || []).map(toBlogPost);
        setPosts((prev) => [...prev, ...items]);
        setPage(res.page ?? nextPage);
        setTotalPages(res.total_pages ?? 1);
      }
    } catch (e) {
      // Only page 2+ reaches here now; page 1 handles its own errors inside
      // the fan-out above.
      if (!blogGate.isCurrent(_tok)) return;
      setError(e instanceof ApiError ? e.friendly : "Could not load the blog.");
    } finally {
      // v1.0.253 — loading + refreshing now clear on the first widget race
      // (page 1) or after the page-2+ blog fetch resolves in the try block.
      // We still clear loadingMore here since it's tied to the page-2+ path
      // and page 1 never sets it. For page 2+ we also need to belt-and-
      // suspenders clear setLoading / setRefreshing in case the caller
      // set them (e.g. mount effect never fires setRefreshing but a stale
      // refresh path might). Idempotent setState calls are cheap.
      //
      // v1.0.259 — always clear these flags on page 2+; the token guard
      // prevented recovery when a superseded page-2 load left blogLoading
      // stuck true (same bug pattern as v1.0.258's blog page-1 fix).
      setLoadingMore(false);
      if (nextPage !== 1) {
        setLoading(false);
        setRefreshing(false);
        setBlogLoading(false);
      }
    }
  }, [loadHomeFeed, loadRecentlyViewed, loadForYouFeed, blogGate]);

  // v1.0.166 — Vinted-style state preservation. Load the home feed once
  // on mount; do NOT reload on every focus. Returning to Home from a
  // pushed screen (product, seller, cart) used to blow away the user's
  // scroll position and pagination because useFocusEffect fired load(1)
  // every time. Now we only refetch when the user explicitly pulls to
  // refresh, or when the tab has been out of focus for a very long time
  // (>5 min) so an app resumed hours later still feels fresh.
  //
  // v1.0.202 — blank-Home-on-cold-launch fix. On some Android devices the
  // mount effect's first load() would settle with loading=true still in
  // effect (or the JS bridge would race with the tab layout mount and
  // drop the skeleton frame), leaving the tab visually empty until the
  // user pulled to refresh. Two guards:
  //   1. A 12-second watchdog forces loading=false so the empty state
  //      or error state can paint even if a request never resolves.
  //   2. useFocusEffect now also retries when the tab regains focus
  //      with no posts loaded and no in-flight request — that way
  //      simply switching tabs recovers the screen without needing a
  //      pull gesture.
  const mountedRef = useRef(false);
  const lastLoadRef = useRef(0);
  // v1.0.254 — SWR-style instant paint. Read disk-cached page-1 payloads
  // synchronously (well, on the next microtask) and set them BEFORE the
  // network load resolves so a returning user sees the exact grid they
  // saw yesterday within a frame. The `loading` flag also flips to false
  // as soon as ANY cached widget hydrates — the network fan-out then
  // overwrites each widget with fresh data.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    (async () => {
      try {
        const uid = user?.id;
        const [blog, home, forYou, recents] = await Promise.all([
          readSwr<{ items: BlogPost[]; page: number; total_pages: number }>(uid, "blog_page1"),
          readSwr<{ items: Product[]; has_followed?: boolean }>(uid, "home_feed"),
          readSwr<{ items: Product[] }>(uid, "for_you"),
          readSwr<{ items: Product[] }>(uid, "recently_viewed"),
        ]);
        let anyHydrated = false;
        if (blog?.body?.items?.length) {
          // Only hydrate blog cache if the network hasn't already painted
          // — avoids clobbering fresher data on a rehydration after a fast
          // network response.
          setPosts((prev) => (prev.length === 0 ? blog.body.items : prev));
          setTotalPages((prev) => (prev === 1 ? blog.body.total_pages : prev));
          anyHydrated = true;
        }
        if (home?.body?.items?.length) {
          setHomeItems((prev) => (prev.length === 0 ? home.body.items : prev));
          if (typeof home.body.has_followed === "boolean") {
            setHasFollowed(home.body.has_followed);
          }
          anyHydrated = true;
        }
        if (forYou?.body?.items?.length) {
          setForYouItems((prev) => (prev.length === 0 ? forYou.body.items : prev));
          anyHydrated = true;
        }
        if (recents?.body?.items?.length) {
          setRecentlyViewed((prev) => (prev.length === 0 ? recents.body.items : prev));
          anyHydrated = true;
        }
        // If we hydrated any widget from cache, drop the top-level
        // spinner immediately — the network fetch below is now the
        // "revalidate" half of SWR and paints silently.
        if (anyHydrated) setLoading(false);
      } catch {
        /* cache miss / parse error — fall through to the network path */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount
  }, []);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    load(1);
    lastLoadRef.current = Date.now();
    const watchdog = setTimeout(() => {
      // If load(1) hasn't cleared `loading` in 12 s, unblock the UI so
      // the user sees either an empty-state or an error instead of a
      // blank screen forever.
      setLoading((prev) => (prev ? false : prev));
    }, 12000);
    return () => clearTimeout(watchdog);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount
  }, []);

  // v1.0.254 — mutation-driven invalidation. When another screen creates
  // or edits a blog post, product, or seller-visibility change, Home
  // needs to reload page 1 on next focus regardless of the 5-min stale
  // window. Fixes the reported bug: user submits a post from the
  // composer, taps back to Home, and sees "No posts yet" because the
  // 5-min stale guard suppressed the refetch.
  const invalidateHome = useCallback(async () => {
    await load(1);
    lastLoadRef.current = Date.now();
  }, [load]);
  useInvalidateOnFocus(["blog", "products", "following"], invalidateHome);
  useFocusEffect(
    useCallback(() => {
      const STALE_MS = 5 * 60 * 1000;
      // Stale-refresh path: unchanged.
      if (mountedRef.current && Date.now() - lastLoadRef.current > STALE_MS) {
        load(1);
        lastLoadRef.current = Date.now();
        return;
      }
      // v1.0.202 recovery path: nothing loaded yet, nothing in flight,
      // and we've been mounted at least a second (so we're not fighting
      // the initial useEffect). Fire load(1) so tab-switch counts as a
      // retry.
      const beenMountedAWhile = Date.now() - lastLoadRef.current > 1000;
      if (
        mountedRef.current &&
        beenMountedAWhile &&
        posts.length === 0 &&
        !loading &&
        !loadingMore &&
        !refreshing
      ) {
        load(1);
        lastLoadRef.current = Date.now();
      }
    }, [load, posts.length, loading, loadingMore, refreshing]),
  );

  // v1.0.134 — poll the abandoned-cart snapshot on focus for logged-in
  // users. This is decoupled from the home-feed load path so a slow blog
  // fetch never blocks the banner from showing, and vice-versa.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setAbandoned(null);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const res = await nest.getAbandonedCart();
          if (cancelled) return;
          if (res.has_cart && (res.line_count ?? 0) > 0) {
            setAbandoned({ line_count: res.line_count ?? 0, total_cents: res.total_cents ?? 0 });
          } else {
            setAbandoned(null);
          }
        } catch {
          // Silent fail — the banner is an ambient assist, not a hard
          // requirement. Guests get a 401 here (permission_callback is
          // is_user_logged_in) and land in this branch.
          if (!cancelled) setAbandoned(null);
        }
      })();
      return () => { cancelled = true; };
    }, [user]),
  );

  // v1.0.136 — long-press a Recently Viewed card on Home to drop it from
  // the MRU. Same UX as the dedicated screen: confirm, then optimistic
  // local update + server delete. Failures roll back only via toast —
  // the row stays hidden locally so the tap doesn't feel dead, and the
  // next Home focus reconciles with the server.
  const onRemoveRecentlyViewed = useCallback((p: Product) => {
    haptics.tap();
    Alert.alert("Remove from recently viewed?", p.title, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        setRecentlyViewed((prev) => prev.filter((r) => r.id !== p.id));
        try {
          await nest.removeRecentlyViewed(p.id);
          haptics.success();
        } catch (e) {
          haptics.error();
          toast.error(e instanceof ApiError ? e.friendly : "Could not remove");
        }
      } },
    ]);
  }, []);

  const dismissAbandonedBanner = useCallback(async () => {
    setAbandoned(null);
    try {
      await nest.dismissAbandonedCart();
    } catch {
      // Best-effort — the banner is already hidden locally; the row will
      // re-armed on the next cart mutation regardless.
    }
  }, []);

  const showBecomeMaker = !user || (!user.is_approved_seller && user.seller_application_status !== "pending");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <NestLogo subtitle="Handmade, with love" />
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TouchableOpacity testID="header-search" accessibilityLabel="Search products" accessibilityRole="button" onPress={() => { haptics.tap(); router.push("/(tabs)/browse"); }} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="search" size={20} color={colors.onSurface} />
          </TouchableOpacity>
          {/* v1.0.116 — shared bell component so the unread badge is
              consistent across every screen that shows it. */}
          <AlertsBellButton />
          <CartHeaderButton />
        </View>
      </View>

      {loading ? (
        // v1.0.69 — skeleton grid keeps the layout during first load so the
        // home feed doesn't flash from spinner to content.
        <ProductGridSkeleton count={4} />
      ) : error ? (
        <EmptyState icon="cloud-offline-outline" title="We couldn't load the blog" message={error} actionLabel="Retry" onAction={() => load(1)} testID="blog-error" />
      ) : (
        <FlatList
          testID="blog-list"
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            // v1.0.54 - approved blog posts open the comments detail screen
            // on tap. Pending/rejected posts stay non-interactive so authors
            // and moderators still see their moderation status without a
            // dead-end tap into a 404.
            item.status === "approved" ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  haptics.tap();
                  push("/(tabs)/(more)/blog/[id]", { id: item.id, post: JSON.stringify(item) });
                }}
                testID={`blog-open-${item.id}`}
               accessibilityRole="button">
                <BlogPostCard
                  post={item}
                  isFavorite={isBlogFavorite(item.id)}
                  onToggleFavorite={() => toggleBlogFavorite(item.id)}
                />
              </TouchableOpacity>
            ) : (
              <BlogPostCard post={item} />
            )
          )}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refreshAuth().catch(() => {}); load(1); }} tintColor={colors.brand} colors={[colors.brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (loadingMore || page >= totalPages) return;
            setLoadingMore(true);
            load(page + 1);
          }}
          ListHeaderComponent={
            <View>
              {abandoned && abandoned.line_count > 0 ? (
                <View style={styles.abandonedBanner} testID="home-abandoned-banner">
                  <TouchableOpacity
                    style={styles.abandonedBannerBody}
                    accessibilityRole="button"
                    accessibilityLabel={`You have ${abandoned.line_count} item${abandoned.line_count === 1 ? "" : "s"} in your cart. Tap to open your cart.`}
                    onPress={() => { haptics.tap(); router.push("/(tabs)/cart"); }}
                    testID="home-abandoned-open"
                  >
                    <View style={styles.abandonedBannerIcon}>
                      <Ionicons name="bag-outline" size={20} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.abandonedBannerTitle}>
                        You left {abandoned.line_count} item{abandoned.line_count === 1 ? "" : "s"} in your cart
                      </Text>
                      <Text style={styles.abandonedBannerSub}>Pick up where you left off</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { haptics.tap(); void dismissAbandonedBanner(); }}
                    style={styles.abandonedBannerDismiss}
                    accessibilityLabel="Dismiss cart reminder"
                    accessibilityRole="button"
                    hitSlop={8}
                    testID="home-abandoned-dismiss"
                  >
                    <Ionicons name="close" size={16} color={colors.onSurfaceMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}
              {/* v1.0.208 (P0 #2) — recently-viewed rail moved to the top
                  of Home (right under the abandoned-cart banner, which
                  is a stronger CTA when present). Gated to ≥3 items so
                  first-time / low-history sessions don't show a thin
                  rail. Long-press a card to drop it from the MRU. */}
              {recentlyViewed.length >= 3 ? (
                <View style={styles.homeFeedSection}>
                  <View style={styles.homeFeedHeader}>
                    <Text style={styles.homeFeedTitle}>Keep browsing</Text>
                    <TouchableOpacity accessibilityLabel="See all recently viewed products" accessibilityRole="button" onPress={() => { haptics.tap(); push("/me/recently-viewed"); }} testID="home-recent-see-all">
                      <Text style={styles.homeFeedSeeAll}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.homeFeedRow}
                    testID="home-recent-scroller"
                   keyboardShouldPersistTaps="handled">
                    {recentlyViewed.map((item) => (
                      <View key={item.id} style={styles.homeFeedItem}>
                        <ProductCard
                          product={item}
                          layout="full"
                          onAddToCart={() => onAdd(item)}
                          onToggleFavorite={() => onFav(item)}
                          onLongPress={() => onRemoveRecentlyViewed(item)}
                          isFavorite={isFavorite(item.id)}
                          testID={`home-recent-card-${item.id}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              {forYouItems.length > 0 ? (
                <View style={styles.homeFeedSection}>
                  <View style={styles.homeFeedHeader}>
                    <Text style={styles.homeFeedTitle}>Picked for you</Text>
                    <TouchableOpacity
                      accessibilityLabel="See all personalized picks"
                      accessibilityRole="button"
                      onPress={() => { haptics.tap(); push("/for-you"); }}
                      testID="home-foryou-see-all"
                    >
                      <Text style={styles.homeFeedSeeAll}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.homeFeedRow}
                    testID="home-foryou-scroller"
                   keyboardShouldPersistTaps="handled">
                    {forYouItems.map((item) => (
                      <View key={item.id} style={styles.homeFeedItem}>
                        <ProductCard
                          product={item}
                          layout="full"
                          onAddToCart={() => onAdd(item)}
                          onToggleFavorite={() => onFav(item)}
                          isFavorite={isFavorite(item.id)}
                          testID={`home-foryou-card-${item.id}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
              {homeItems.length > 0 ? (
                <View style={styles.homeFeedSection}>
                  <View style={styles.homeFeedHeader}>
                    {/* v1.0.157 — always title as "Fresh from the Nest". Per
                        user spec: 25 most recent, in stock, regardless of
                        who they follow. Followed-shops row was misleading
                        because it hid new listings from unfollowed sellers. */}
                    <Text style={styles.homeFeedTitle}>Fresh from the Nest</Text>
                    <TouchableOpacity accessibilityLabel="See all products in browse" accessibilityRole="button" onPress={() => { haptics.tap(); router.push("/(tabs)/browse"); }} testID="home-feed-see-all">
                      <Text style={styles.homeFeedSeeAll}>See all</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.homeFeedRow}
                    testID="home-feed-scroller"
                   keyboardShouldPersistTaps="handled">
                    {homeItems.map((item) => (
                      <View key={item.id} style={styles.homeFeedItem}>
                        <ProductCard
                          product={item}
                          layout="full"
                          onAddToCart={() => onAdd(item)}
                          onToggleFavorite={() => onFav(item)}
                          isFavorite={isFavorite(item.id)}
                          testID={`home-feed-card-${item.id}`}
                        />
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              <View style={styles.composeCard}>
                <Text style={styles.composeTitle}>Share something with the Nest</Text>
                <Button
                  title="New Post"
                  onPress={() => { haptics.tap(); (user ? push("/blog/compose") : push("/(auth)/login")); }}
                  style={{ marginTop: spacing.md }}
                  testID="blog-new-post"
                />
              </View>

              {showBecomeMaker ? (
                <TouchableOpacity
                  testID="become-seller-cta"
                  onPress={() => { haptics.tap(); (user ? push("/seller/apply") : push("/(auth)/login")); }}
                  style={styles.becomeSellerCard}
                  activeOpacity={0.85}
                 accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={styles.becomeSellerTitle}>Build your Nest</Text>
                    <Text style={styles.becomeSellerBody}>Apply to sell your handmade goods on My Nest.</Text>
                  </View>
                  <Ionicons name="arrow-forward-circle" size={32} color={colors.onSurface} />
                </TouchableOpacity>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            // v1.0.253 — while blog is still fetching (but the widgets have
            // already painted so we're past the outer skeleton), show a
            // small inline skeleton so the section doesn't flash "No posts
            // yet" and then flip to a full list a second later. When blog
            // truly returns zero items, blogLoading is false and the empty
            // state paints as before.
            blogLoading ? (
              <View testID="blog-inline-skeleton">
                <ProductGridSkeleton count={2} />
              </View>
            ) : (
              <EmptyState
                icon="newspaper-outline"
                title="No posts yet"
                message="Approved posts from the My Nest community will show up here."
                testID="blog-empty"
              />
            )
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: spacing.lg }} color={colors.onSurface} /> : null}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  // v1.0.225 — Home refinement. Header icon buttons drop shadows;
  // compose card and become-seller card become white with hairline
  // borders; section titles use h3 scale so they sit clearly above the
  // rails. Abandoned-cart banner keeps its warm accent but gains
  // structure.
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  composeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  composeTitle: { ...typeTokens.h3 },
  composeBody: { ...typeTokens.caption, marginTop: 2 },
  becomeSellerCard: {
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  becomeSellerTitle: { ...typeTokens.h3 },
  becomeSellerBody: { ...typeTokens.caption, marginTop: 2 },
  homeFeedSection: { marginBottom: spacing.xl },
  homeFeedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  homeFeedTitle: { ...typeTokens.h2 },
  homeFeedSeeAll: { ...typeTokens.caption, fontWeight: "700", color: colors.brand },
  homeFeedRow: { gap: spacing.md, paddingRight: spacing.md },
  homeFeedItem: { width: 200 },
  abandonedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.lg,
    paddingRight: spacing.sm,
  },
  abandonedBannerBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  abandonedBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  abandonedBannerTitle: { ...typeTokens.body, fontWeight: "700" },
  abandonedBannerSub: { ...typeTokens.caption, marginTop: 2 },
  abandonedBannerDismiss: { padding: spacing.sm },
});
