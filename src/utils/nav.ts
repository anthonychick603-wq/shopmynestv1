// v1.0.121 — origin-tab back button.
//
// The spec (locked down by the user Aug 21, 2026):
//   • Every (more) screen has one owning tab. Back always returns to
//     that tab, not to whatever intermediate (more) screen the user
//     happened to hop through.
//   • The one exception is a detail-of-a-detail chain, e.g.
//     Orders → specific order → back → Orders (the parent screen
//     inside the same tab flow), then a second back → owning tab.
//
// How it works:
//   pushFromTab records the current tab as the "origin" for the (more)
//   push. pushFromCard from inside (more) marks the new entry as an
//   in-flow child, so its back pops the (more) stack instead of
//   replacing to the tab. safeBack consults these markers first, and
//   only falls back to the older nav-history / referring-tab logic
//   when nothing else is known (deep links, cold start).
import { router as globalRouter, type Router } from "expo-router";

import { consumePreviousRoute, peekPreviousRoute } from "./nav-history";

// Parallel stack to the (more) navigator: each entry is the tab the
// user was on when that (more) screen was pushed. Popped on router
// back / consumeMoreEntry, cleared on tab-root re-entry.
type MoreEntry = { originTab: string; inFlow: boolean };
const moreStack: MoreEntry[] = [];

export function pushMoreEntry(originTab: string, inFlow: boolean): void {
  moreStack.push({ originTab, inFlow });
}

export function consumeMoreEntry(): MoreEntry | null {
  return moreStack.pop() ?? null;
}

export function peekMoreEntry(): MoreEntry | null {
  return moreStack[moreStack.length - 1] ?? null;
}

export function clearMoreStack(): void {
  moreStack.length = 0;
}

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
 * v1.0.121 — spec-driven back.
 *
 * 1. If the top of the moreStack is an in-flow child (pushFromCard
 *    inside (more)) AND router.canGoBack(): pop one (more) entry.
 *    Keeps Orders → specific order → back → Orders working.
 * 2. Otherwise, if we know the origin tab for the current (more)
 *    entry: consume the entry AND dismissAll on the (more) stack
 *    (so switching back into this tab lands clean) AND replace to
 *    the origin tab.
 * 3. Otherwise: legacy nav-history / referring-tab fallback for deep
 *    links, notifications, cold starts.
 */
export function safeBack(router: Router, fallback: string = "/(tabs)") {
  const top = peekMoreEntry();
  if (top) {
    if (top.inFlow) {
      let canBack = false;
      try { canBack = router.canGoBack(); } catch { canBack = false; }
      if (canBack) {
        consumeMoreEntry();
        consumePreviousRoute();
        try { router.back(); return; } catch { /* fall through */ }
      }
    }
    // Top of the stack came directly from a tab — jump back to that
    // tab and clear the entire (more) stack so re-entering the tab
    // lands on the tab root, not on the popped screen.
    const target = top.originTab;
    clearMoreStack();
    dismissMoreStackIfAny();
    router.replace(target as any);
    return;
  }

  // No origin recorded (deep link, notification, cold start). Fall
  // back to the nav-history tracker so "back" still lands somewhere
  // reasonable.
  const prev = peekPreviousRoute();
  if (prev) {
    let canBack = false;
    try { canBack = router.canGoBack(); } catch { canBack = false; }
    if (canBack) {
      consumePreviousRoute();
      try { router.back(); return; } catch { /* fall through */ }
    }
    const target = consumePreviousRoute() ?? prev;
    router.replace(target as any);
    return;
  }

  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // Guard against mid-transition taps.
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
  // v1.0.121 — record the tab we're leaving so safeBack can return
  // straight to it, no matter how many in-flow pushes happen inside
  // this (more) session. If the tracker hasn't logged the current tab
  // yet (very early launch), default to /(tabs).
  const originTab = referringTab ?? "/(tabs)";
  pushMoreEntry(originTab, false);
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
  // v1.0.121 — spec: back from any (more) screen jumps to the owning
  // tab, skipping the intermediate (more) hop. So even when we're
  // already inside (more), a card push inherits the same origin tab
  // and marks itself NOT in-flow — the previous (more) entry is
  // effectively replaced. If the user goes shop → product → seller,
  // back from seller still lands on Browse.
  const parent = peekMoreEntry();
  const originTab = parent?.originTab ?? referringTab ?? "/(tabs)";
  pushMoreEntry(originTab, false);
  if (params) {
    router.push({ pathname: path as any, params: params as any });
  } else {
    router.push(path as any);
  }
}

/**
 * v1.0.121 — push from an index-of-details screen into one of its
 * children. Marks the new (more) entry as in-flow so safeBack pops
 * one (more) frame instead of jumping to the owning tab — the only
 * chain in the spec that uses this is Orders → specific order →
 * back → Orders. Add other detail chains here as they come up.
 */
export function pushDetail(
  router: Router,
  path: string,
  params?: Record<string, unknown>,
): void {
  const parent = peekMoreEntry();
  const originTab = parent?.originTab ?? referringTab ?? "/(tabs)";
  pushMoreEntry(originTab, true);
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
