// v1.0.168 — Navigation architecture rewrite.
//
// One rule: Back means "pop the current screen off the navigation stack."
// It does not consult a parallel history tracker, a referring-tab
// register, or any hard-coded fallback destination. It calls
// router.back() and lets Expo Router's underlying React Navigation stack
// do exactly what it's designed to do.
//
// Every previous back-related mechanism (nav-history.ts,
// use-nav-history.ts, use-track-referring-tab.ts, referringTab,
// dismissMoreStackIfAny, clearMoreStack, pushMoreEntry, peekMoreEntry,
// consumeMoreEntry, peekPreviousRoute, consumePreviousRoute) is either
// deleted or reduced to a no-op export so old call sites keep compiling
// while the real behavior collapses to router.back().
//
// This is what makes the following work:
//
//   Home Feed
//     → Product A     (push onto (more) stack)
//       → Seller      (push onto (more) stack)
//         → Product B (push onto (more) stack)
//
//   Back → pops Product B, reveals Seller.
//   Back → pops Seller, reveals Product A.
//   Back → pops Product A, reveals Home Feed at its previous scroll.
//
// v1.0.255 — Strict back-history contract. Every navigation is now a
// plain router.push, including tab-root → (more) entries. The
// pre-v1.0.255 usePushFromTab() dismissed the (more) stack when a
// tab-root screen pushed into (more), which erased history the user
// expected to be able to back through. Under the strict rule the tab
// bar itself is the affordance for jumping to a tab root; back is
// reserved for "the screen immediately before this one."

import { useCallback } from "react";
import { router as globalRouter, useRouter, type Router } from "expo-router";

// -----------------------------------------------------------------------
// Back.
//
//   Priority 1: router.canGoBack() → router.back().
//   Priority 2: no history to pop (cold-start deep link, restored route,
//               or a screen opened as the first route). Replace to that
//               screen's natural parent. This is the only time fallback
//               is used; normal back always pops the actual stack.

export function safeBack(router: Router, fallback = "/(tabs)") {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // canGoBack throws mid-transition sometimes; treat as "no".
  }
  // No stack entry exists to pop. Respect the natural parent supplied by
  // the screen instead of always jumping to Home. That keeps deep links
  // and restored screens consistent with the same screen reached normally.
  router.replace((fallback || "/(tabs)") as never);
}

// -----------------------------------------------------------------------
// v1.0.176 — legacy no-op exports (getReferringTab, clearReferringTab,
// setReferringTab, pushMoreEntry, consumeMoreEntry, peekMoreEntry,
// clearMoreStack, dismissMoreStackIfAny) plus their sibling stub hooks
// were removed. Every call site had already migrated off them; a grep
// across app/ and src/ found zero external references, so keeping the
// exports as stubs was pure dead weight. If a downstream fork still
// depends on them, restore from git history — they never did anything.

// The three push wrappers all reduce to router.push. Kept as separate
// exports so existing call sites (ProductCard, PostCard, category
// screens, tab-root headers) don't need to be touched.
function _push(
  router: Router,
  path: string,
  params?: Record<string, unknown>,
): void {
  if (params) {
    router.push({ pathname: path as never, params: params as never });
  } else {
    router.push(path as never);
  }
}

// v1.0.255 — plain push, no dismissAll. See file-top comment for the
// rationale. Kept as a named export so tab-root header buttons (Cart,
// Alerts) don't need to be touched.
export function pushFromTab(
  router: Router,
  path: string,
  params?: Record<string, unknown>,
): void {
  _push(router, path, params);
}

/**
 * Hook version of pushFromTab. Under the strict back-history contract
 * (v1.0.255) this is identical to router.push(); the segment-aware
 * dismissAll was removed because it erased (more)-stack history the
 * user expected to be able to back through.
 */
export function usePushFromTab() {
  const router = useRouter();
  return useCallback(
    (path: string, params?: Record<string, unknown>) => {
      _push(router, path, params);
    },
    [router],
  );
}

export function pushFromCard(
  router: Router,
  path: string,
  _insideMore: boolean,
  params?: Record<string, unknown>,
): void {
  _push(router, path, params);
}
export function pushDetail(
  router: Router,
  path: string,
  params?: Record<string, unknown>,
): void {
  _push(router, path, params);
}

export { globalRouter };
