// v1.0.60 — safeBack + pushFromTab + referring tab memory
//
// A one-liner router.back() will silently no-op when the current screen was
// opened as a router.replace() destination (no prior entry) or when the app
// was cold-started deep into a route (Play Store notification, share intent,
// share-a-link on the web build). Sellers then see the back arrow do
// nothing.
//
// The other failure mode: every route pushed from a tab root lives on a
// single shared Stack inside the (more) group, so the raw stack can hold
// entries from a completely unrelated flow (e.g. seller listings from an
// earlier session under the seller tab). Popping onto those unrelated
// entries feels like "the back button jumps around":
//   account → messages → back → listings (was previously visited)
//
// The clean fix is on the push side: when a tab root opens a (more)
// screen, dismiss the (more) stack first so it becomes a fresh single
// entry. Subsequent within-flow pushes (product → seller → product) still
// stack correctly, and back always returns to the actual previous page.
import type { Router } from "expo-router";

// Records the tab route that last called pushFromTab / pushFromCard. When a
// (more) screen with no stack history taps back, safeBack prefers this over
// the caller-provided fallback so the user returns to the tab they came from
// instead of a hard-coded default. Cleared when the user lands back on a
// tab root (see clearReferringTab, wired in _layout).
let referringTab: string | null = null;

/** Read the last-recorded tab route. Exposed for safeBack + tests. */
export function getReferringTab(): string | null {
  return referringTab;
}

/** Manually clear the referring tab. Call when a tab root regains focus. */
export function clearReferringTab(): void {
  referringTab = null;
}

export function safeBack(router: Router, fallback: string = "/(tabs)") {
  // We deliberately do NOT trust router.canGoBack() here. The (more)
  // group is a single Stack shared across every tab, so canGoBack() will
  // report true whenever another tab left an unrelated screen on that
  // stack — popping it feels like the back button is jumping through the
  // user's entire session history (Account → Messages → back → Listings
  // → back → Payouts → back → Home → back → exits app). Detail screens
  // reached from a menu row always want to return to the tab they were
  // launched from, not to whatever else lives on the shared stack.
  //
  // Priority: the tab we recorded when the user last left a tab root,
  // then the caller-provided fallback, then the tabs root.
  const target = referringTab ?? fallback;
  router.replace(target as any);
}

/**
 * Navigate from a tab root (Account, Home, Browse, Seller dashboard...) to
 * a screen inside the shared (more) Stack. Dismisses any leftover (more)
 * entries first so the next back press returns to the tab, not to whatever
 * the user was doing before in an unrelated flow.
 *
 * Use this for entries reached from a top-level menu row. Do NOT use it
 * for within-flow pushes (product → seller → product), which want the
 * default stacking behaviour.
 */
/**
 * Set the referring tab. Called by useTrackReferringTab (mounted at the
 * root) whenever the focused screen is a tab root. Event handlers can then
 * call pushFromTab without needing hooks to read the current path.
 */
export function setReferringTab(path: string | null): void {
  referringTab = path;
}

export function pushFromTab(router: Router, path: string, params?: Record<string, unknown>): void {
  // The (more) group is a single Stack shared across every tab. We can't
  // reliably clear it from outside (dismissAll/canDismiss only act on the
  // currently focused navigator, and from a tab root that's the Tabs
  // navigator, not the (more) Stack). So instead of trying to clear it,
  // we push normally — but safeBack on the destination ignores the stack
  // and returns to referringTab, which the tracker set the moment we
  // left the tab.
  if (params) {
    router.push({ pathname: path as any, params: params as any });
  } else {
    router.push(path as any);
  }
}

/**
 * Reusable card / feed navigation. Cards live inside both tab roots and
 * (more) screens; from a tab root the tap must reset the (more) stack so
 * back returns to the tab, and from within (more) it must stack so back
 * returns to the previous flow screen (e.g. seller → product → back →
 * seller). Callers pass `insideMore` (from useSegments) so this helper
 * can pick the right behaviour without importing hooks itself.
 */
export function pushFromCard(
  router: Router,
  path: string,
  insideMore: boolean,
  params?: Record<string, unknown>,
): void {
  if (!insideMore) {
    pushFromTab(router, path, params);
    return;
  }
  if (params) {
    router.push({ pathname: path as any, params: params as any });
  } else {
    router.push(path as any);
  }
}
