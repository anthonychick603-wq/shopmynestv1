// v1.0.57.1 — safeBack + pushFromTab + referring tab memory
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
  if (router.canGoBack()) {
    router.back();
    return;
  }
  // No history: prefer the tab the user launched from, then the caller's
  // fallback, then the tabs root. This keeps back predictable across the
  // full app: Account → Orders → back → Account (not seller dashboard),
  // Seller dashboard → Orders → back → Seller dashboard (not account).
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
  // Clear any leftover entries in the shared (more) stack so back returns
  // to the tab, not to whatever the user was doing in an earlier flow.
  //
  // canDismiss() must gate dismissAll(): calling dismissAll() when the
  // stack has no dismissable entries dispatches a POP_TO_TOP action that
  // no navigator claims, which surfaces as a red "action was not handled
  // by any navigator" error banner in dev builds (v1.0.58 regression).
  try {
    const r = router as unknown as {
      canDismiss?: () => boolean;
      dismissAll?: () => void;
    };
    if (r.canDismiss?.() && r.dismissAll) {
      r.dismissAll();
    }
  } catch {}
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
