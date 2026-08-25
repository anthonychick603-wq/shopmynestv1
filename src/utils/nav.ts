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
// And this is why Alerts + Cart moved out of Tabs.Screen and into
// (more)/: the header bell / cart button on any screen used to be a
// peer tab switch, not a stack push, so router.back() had nothing to
// pop. Now the header buttons push onto the same (more) stack the
// current screen is already on, and router.back() returns the user to
// where they tapped from — no tracker required.

import { router as globalRouter, type Router } from "expo-router";

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
// Legacy no-op / thin-wrapper exports so call sites elsewhere in the
// tree keep compiling. New code should just call router.push directly.

export function getReferringTab(): string | null {
  return null;
}
export function clearReferringTab(): void {}
export function setReferringTab(_path: string | null): void {}

type MoreEntry = { originTab: string; inFlow: boolean };
export function pushMoreEntry(_originTab: string, _inFlow: boolean): void {}
export function consumeMoreEntry(): MoreEntry | null {
  return null;
}
export function peekMoreEntry(): MoreEntry | null {
  return null;
}
export function clearMoreStack(): void {}
export function dismissMoreStackIfAny(): void {}

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
export function pushFromTab(
  router: Router,
  path: string,
  params?: Record<string, unknown>,
): void {
  _push(router, path, params);
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
