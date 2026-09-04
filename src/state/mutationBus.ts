/**
 * mutationBus — v1.0.254
 *
 * Cross-screen data invalidation bus. Solves the "created a post but Home
 * still says 'No posts yet'" class of bug where a mutation on one screen
 * leaves another screen showing pre-mutation data.
 *
 * The problem it solves:
 *   Prior to this, list screens used passive time-based staleness (see
 *   useLoadOnce, useAdminFocusRefetch). A mutation (createBlogPost,
 *   updateProduct, followSeller, submitReview, …) had no way to say "the
 *   blog list is now stale everywhere". The consumer screen would only
 *   refetch when its own stale window (60s for buyer, 3s for admin)
 *   elapsed, meaning quick composer→home round-trips almost always
 *   painted stale data.
 *
 * Design:
 *   • DataClass — a small, closed set of coarse tags. Coarser is better
 *     here because the alternative is invalidating individual query keys,
 *     which becomes an ongoing bookkeeping tax across every screen. A
 *     coarse tag (e.g. "products") triggers slightly more refetches on
 *     focus than strictly needed; that's fine — refetches happen only on
 *     focus, and each affected screen has at most one active fetch.
 *   • bump(cls) — publish an event; every subscriber to that class sees
 *     the new revision. Idempotent across the render tick.
 *   • useMutationRevision(cls) — subscribe. Returns the current revision.
 *     Combine with useFocusEffect to refetch on focus if the revision
 *     has changed since the last successful load.
 *
 * See useInvalidateOnFocus below (in this file) for the convenience hook
 * that wraps the whole pattern.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

// Coarse data classes. Adding one is fine — but be sparing. The more
// specific the class, the more places you have to remember to bump it
// from. Keep this list stable and cover 90% of use cases with these.
export type DataClass =
  // Blog posts feed + individual post details.
  | "blog"
  // Blog comments (nested under a post).
  | "blogComments"
  // Product catalog: home widgets, browse grid, seller listings, product
  // detail, favorites (product cards). Any product create/update/delete.
  | "products"
  // Seller directory + individual seller profile (bio, follower count, etc.).
  | "sellers"
  // Follow/unfollow: any list of followed shops or "from followed" rails.
  | "following"
  // Buyer orders + seller orders.
  | "orders"
  // Direct message threads + conversation list.
  | "messages"
  // Product reviews + seller reviews.
  | "reviews"
  // Shopping cart. CartContext already self-syncs; this class exists so
  // non-cart screens (e.g. the abandoned-cart banner on Home) can react
  // to cart changes without wiring through the context.
  | "cart"
  // Notifications / alerts bell.
  | "alerts";

type Listener = () => void;

// Module-singleton state. Revisions monotonically increase on every
// bump; listeners re-render when their subscribed class's revision
// changes, which prompts their useInvalidateOnFocus effect to compare
// vs. lastLoaded and refetch if stale.
const revisions: Record<DataClass, number> = {
  blog: 0,
  blogComments: 0,
  products: 0,
  sellers: 0,
  following: 0,
  orders: 0,
  messages: 0,
  reviews: 0,
  cart: 0,
  alerts: 0,
};

const listenersByClass: Record<DataClass, Set<Listener>> = {
  blog: new Set(),
  blogComments: new Set(),
  products: new Set(),
  sellers: new Set(),
  following: new Set(),
  orders: new Set(),
  messages: new Set(),
  reviews: new Set(),
  cart: new Set(),
  alerts: new Set(),
};

/**
 * Publish an invalidation. Call this from mutation code paths after the
 * server confirms the write. Cheap and synchronous.
 *
 * Example:
 *   await nest.createBlogPost(form);
 *   bump("blog");
 *
 * You can bump multiple classes when a mutation affects several:
 *   await nest.followSeller(id);
 *   bump("following", "sellers");
 */
export function bump(...classes: DataClass[]): void {
  for (const cls of classes) {
    revisions[cls] = (revisions[cls] ?? 0) + 1;
    // Snapshot listeners so a listener that unsubscribes itself during
    // the notify pass doesn't invalidate our iteration.
    const snapshot = Array.from(listenersByClass[cls]);
    for (const fn of snapshot) {
      try { fn(); } catch { /* ignore listener errors */ }
    }
  }
}

/**
 * Read the current revision for a class + subscribe to changes. The
 * returned value only changes when that class is bumped.
 */
export function useMutationRevision(cls: DataClass): number {
  const [rev, setRev] = useState<number>(revisions[cls]);
  useEffect(() => {
    const listener = () => setRev(revisions[cls]);
    listenersByClass[cls].add(listener);
    // If a bump happened between hook mount and effect run (rare but
    // possible on re-renders), catch up.
    if (revisions[cls] !== rev) setRev(revisions[cls]);
    return () => {
      listenersByClass[cls].delete(listener);
    };
    // We deliberately subscribe once per cls; `rev` in deps would cause
    // add/remove churn on every bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls]);
  return rev;
}

/**
 * useInvalidateOnFocus — bind a fetch function to one or more data
 * classes. On mount, calls markLoaded() so the first focus doesn't
 * trigger a duplicate fetch on top of the caller's own mount fetch.
 *
 * On focus, if any subscribed class has bumped since the last markLoaded
 * (or the caller has never called markLoaded), fires `load()` and
 * markLoaded()s again.
 *
 * The caller MUST call `markLoaded()` from inside their own successful-
 * load path so that the "last load rev" matches the class's current
 * revision. Otherwise every focus will refetch. This is intentional —
 * we want to be sure the caller actually observed the fresh data before
 * counting it as loaded.
 *
 * Example:
 *
 *   const load = useCallback(async () => {
 *     const res = await nest.getBlogPosts({ page: 1 });
 *     setPosts(res.items);
 *     markLoaded();
 *   }, [markLoaded]);
 *
 *   const { markLoaded } = useInvalidateOnFocus(["blog"], load);
 *
 * Optional `enabled` flag skips the hook entirely (e.g. tab is offscreen
 * inside a screen-level layout, no user).
 */
export function useInvalidateOnFocus(
  classes: DataClass[],
  load: () => void | Promise<void>,
  opts: { enabled?: boolean } = {},
): { markLoaded: () => void } {
  const { enabled = true } = opts;
  // Track the revision each class was at when the caller last marked
  // itself loaded. A focus event with any class > loadedAt[class]
  // triggers a refetch.
  //
  // v1.0.258 — SYNCHRONOUS seeding. Previously this was initialized to
  // `{}` and a post-mount `useEffect` snapshotted current revisions.
  // But `useFocusEffect` fires on mount BEFORE effects run, so the very
  // first focus saw `loadedAt.<cls> ?? -1 === -1` and compared it to
  // `revisions.<cls> ?? 0 === 0` — `-1 < 0` is always true, so every
  // subscribed screen spuriously refetched on its first focus. On the
  // Home tab that meant `load(1)` fired TWICE concurrently (once from
  // the mount effect, once from useInvalidateOnFocus's first focus).
  // The first load's token was invalidated by `begin()` in the second,
  // so its blog `finally` block skipped `setBlogLoading(false)` and the
  // skeleton stayed forever. Seeding synchronously via useRef's lazy
  // initializer closes the race — first focus sees a matching snapshot
  // and does not refetch.
  const seededRef = useRef(false);
  const loadedAtRef = useRef<Partial<Record<DataClass, number>>>({});
  if (!seededRef.current) {
    seededRef.current = true;
    for (const cls of classes) loadedAtRef.current[cls] = revisions[cls];
  }

  const markLoaded = useCallback(() => {
    for (const cls of classes) loadedAtRef.current[cls] = revisions[cls];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.join("|")]);

  // Subscribe to all classes so re-renders don't drop us.
  // (These calls are cheap; each subscribes independently.)
  for (const cls of classes) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useMutationRevision(cls);
  }

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const stale = classes.some((cls) => (revisions[cls] ?? 0) > (loadedAtRef.current[cls] ?? -1));
      if (stale) {
        // Snapshot revisions *before* firing load so that a mutation that
        // races between the snapshot and load()'s response doesn't get
        // absorbed into loadedAt and skipped on the next focus. We only
        // advance the cursor to the pre-load revisions on success.
        const snapshot: Partial<Record<DataClass, number>> = {};
        for (const cls of classes) snapshot[cls] = revisions[cls];
        void Promise.resolve(load())
          .then(() => { loadedAtRef.current = { ...loadedAtRef.current, ...snapshot }; })
          .catch(() => { /* leave loadedAt as-is so a later focus retries */ });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, load, classes.join("|")]),
  );

  return useMemo(() => ({ markLoaded }), [markLoaded]);
}

/**
 * Test / debug helper — not for production use. Resets every class to 0.
 */
export function _resetMutationBusForTests(): void {
  for (const cls of Object.keys(revisions) as DataClass[]) {
    revisions[cls] = 0;
    listenersByClass[cls].clear();
  }
}
