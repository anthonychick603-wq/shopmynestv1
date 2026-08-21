// v1.0.108 — back-button restore + hardened cross-tab (more) stack reset.
//
// Design rules (must hold for every screen):
//   1. Back button (in-app chevron OR Android hardware back) always returns
//      to the direct previous screen the user was on.
//   2. If there is no previous entry (deep link, cold start, notification
//      into a detail), back goes to the tab we recorded on the last tab
//      root visit — else the caller's fallback — else the tabs root.
//
// Historical context (v1.0.60):
//   The (more) group is a single Stack shared across every tab, so if the
//   user pushed A from tab 1, switched to tab 2, and pushed B, then
//   returned to tab 1 and pushed C, the raw stack held [A, B, C] and back
//   popped through B (a completely unrelated flow). Old code worked around
//   this by refusing to pop and always replacing to the referring tab —
//   which broke ordinary within-flow back (Product → Seller → Product B →
//   back should return to Seller, but replaced all the way to a tab root).
//
// New strategy:
//   • useTrackReferringTab (mounted at the root) calls router.dismissAll()
//     the moment the user lands back on a tab root, so the (more) stack is
//     guaranteed empty before the next tab pushes into it.
//   • pushFromTab / pushFromCard keep their existing push semantics — they
//     don't need to clear the stack themselves because the tracker has
//     already cleared it.
//   • safeBack calls router.back() when there's stack history (which is
//     now guaranteed to be within-flow entries only), and falls back to
//     the referring tab / caller fallback / tabs root only when there's
//     none.
import { router as globalRouter, type Router } from "expo-router";

import { consumePreviousRoute, peekPreviousRoute } from "./nav-history";

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

/**
 * v1.0.117 — return to the direct previous screen the user was on. The
 * nav-history tracker (useNavHistory, mounted at the root) records every
 * route change with its params, so we can walk back to the exact prior
 * URL even across tab switches and dismissAll() cleanups.
 *
 * Order of preference:
 *   1. If the tracker has a previous entry AND router.canGoBack(): pop
 *      both in lockstep so the visible tail of the tracker matches the
 *      screen we return to.
 *   2. If the tracker has a previous entry but router has no stack: use
 *      router.replace() with the tracker's previous entry. This is the
 *      case for tab-to-tab "back" (Product → Alerts → back → Product)
 *      and deep-link entries.
 *   3. No tracker entry: fall back to the recorded tab → caller fallback
 *      → tabs root. Preserves the pre-v1.0.117 behaviour for cold-start
 *      cases.
 */
export function safeBack(router: Router, fallback: string = "/(tabs)") {
  const prev = peekPreviousRoute();
  if (prev) {
    let canBack = false;
    try { canBack = router.canGoBack(); } catch { canBack = false; }
    if (canBack) {
      // Sync the tracker with the router pop so the next safeBack sees
      // the correct "previous" entry.
      consumePreviousRoute();
      try { router.back(); return; } catch { /* fall through */ }
    }
    // No stack to pop but the tracker knows where we came from — jump
    // there directly. Consume so subsequent backs walk further into the
    // history.
    const target = consumePreviousRoute() ?? prev;
    router.replace(target as any);
    return;
  }

  // No tracked history — fall back to the old behaviour for cold-start
  // and deep-link entries that beat the tracker's first record.
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // canGoBack is safe to call at any time in expo-router 6, but guard
    // anyway so a mid-transition tap can't crash the app.
  }
  const target = referringTab ?? fallback;
  router.replace(target as any);
}

/**
 * Navigate from a tab root (Account, Home, Browse, Seller dashboard...) to
 * a screen inside the shared (more) Stack. The (more) stack is guaranteed
 * empty at this point because useTrackReferringTab called dismissAll the
 * moment the user last landed on a tab root, so this push always creates
 * a fresh single entry — subsequent within-flow pushes stack on top of it,
 * and back returns to each in order until the stack is empty, at which
 * point safeBack falls back to the referring tab.
 *
 * Use this for entries reached from a top-level menu row. Do NOT use it
 * for within-flow pushes (product → seller → product), which want the
 * default stacking behaviour (pushFromCard handles both cases).
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
  if (params) {
    router.push({ pathname: path as any, params: params as any });
  } else {
    router.push(path as any);
  }
}

/**
 * Reusable card / feed navigation. Cards live inside both tab roots and
 * (more) screens; from a tab root the tap needs to launch a fresh (more)
 * flow, and from within (more) it needs to stack on top of the current
 * flow so back returns to the previous flow screen (e.g. seller → product
 * → back → seller). Callers pass `insideMore` (from useSegments) so this
 * helper can pick the right behaviour without importing hooks itself.
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

/**
 * v1.0.108 — internal helper used by useTrackReferringTab. Dismisses the
 * (more) stack from the global router. Safe to call from a tab root
 * effect because expo-router 6 dispatches dismissAll against the deepest
 * active stack navigator, which is the (more) Stack we care about — even
 * when the currently focused screen is a tab root, the (more) navigator
 * remains mounted (the tabs layout keeps it hidden but instantiated) and
 * receives the action.
 */
export function dismissMoreStackIfAny(): void {
  try {
    // canDismiss is not exposed on the router type in 6.0.x but is a
    // runtime method. Guard both existence and truthiness.
    const r: any = globalRouter as any;
    if (typeof r.canDismiss === "function" && r.canDismiss()) {
      r.dismissAll();
    }
  } catch {
    // Never let a navigation cleanup crash the tree; a stuck stack entry
    // is a lesser evil than an unhandled render throw.
  }
}
