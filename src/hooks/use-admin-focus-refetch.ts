/**
 * useAdminFocusRefetch — v1.0.236
 *
 * Focus-refetch for admin console screens. Every admin queue (orders,
 * refunds, payouts, users, products, operations, reports, seller
 * applications, dashboard tiles) needs to re-hit the server when the
 * admin comes back to it, so that a change made in a pushed detail
 * screen — approve refund, mark shipped, ban user, resolve report —
 * is reflected on the next paint.
 *
 * We deliberately do NOT re-fire load() on first focus (mount handles
 * that). We also gate on a short stale window (default 3s) so that
 * bouncing forward-then-back inside a tight interaction doesn't
 * hammer the server on every micro-navigation.
 *
 * Usage:
 *
 *   const load = useCallback(async () => { ... }, [deps]);
 *   useEffect(() => { void load(); }, [load]);  // mount fetch
 *   useAdminFocusRefetch(load);                 // focus refetch
 *
 * Or with a custom stale window:
 *
 *   useAdminFocusRefetch(load, { staleMs: 10_000 });
 */
import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";

type Options = {
  /** Milliseconds after which a focus event triggers a refetch. Default 3s. */
  staleMs?: number;
  /** If false, no focus refetch ever fires. Default true. */
  enabled?: boolean;
};

export function useAdminFocusRefetch(
  load: () => void | Promise<void>,
  opts: Options = {},
) {
  const { staleMs = 3_000, enabled = true } = opts;
  // Start with "just loaded" so the first focus event (which fires on
  // mount) doesn't trigger a second load on top of the caller's mount
  // effect.
  const lastLoadedRef = useRef<number>(Date.now());
  const mountedRef = useRef(false);

  // Reset the marker whenever `load` changes — a caller changing its
  // deps is effectively a re-request, so the next focus should still
  // respect the fresh window.
  useEffect(() => {
    lastLoadedRef.current = Date.now();
  }, [load]);

  const markLoaded = useCallback(() => {
    lastLoadedRef.current = Date.now();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      // Skip the very first focus (concurrent with mount fetch); the
      // caller's own useEffect(mount → load) covers it.
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }
      if (Date.now() - lastLoadedRef.current < staleMs) return;
      Promise.resolve(load()).finally(markLoaded);
    }, [load, staleMs, enabled, markLoaded]),
  );

  return { markLoaded };
}
