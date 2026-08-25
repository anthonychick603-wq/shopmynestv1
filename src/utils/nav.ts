// v1.0.166 — Vinted-style navigation.
//
// The Aug 21, 2026 rule ("back from any (more) screen jumps to the owning
// tab, skipping intermediate hops") was reversed on Aug 25, 2026. Every
// push now stacks. Every back pops exactly one screen. There is no
// origin-tab collapse; if the user walked Home → Product → Seller →
// Product #2, four backs return them Home step by step.
//
// The helpers below (pushFromTab, pushFromCard, pushDetail) are kept as
// thin router.push wrappers so every existing call site keeps compiling.
// They no longer track "origin tab" or "in-flow" markers because there is
// nothing left to disambiguate — a push is a push, and safeBack is just
// router.back().
//
// Bottom-tab presses are still an intentional navigation action (handled
// by expo-router's Tabs), not part of the back stack. Switching tabs does
// NOT pop the (more) stack anymore — the user can hop over to Alerts,
// come back, and still walk their history.

import { router as globalRouter, type Router } from "expo-router";

import { peekPreviousRoute } from "./nav-history";

// -----------------------------------------------------------------------
// Referring tab. Kept only as a last-resort fallback destination when a
// cold-start deep link presses back with an empty history. Nothing else
// consults it anymore.

let referringTab: string | null = null;

export function getReferringTab(): string | null {
  return referringTab;
}

export function clearReferringTab(): void {
  referringTab = null;
}

export function setReferringTab(path: string | null): void {
  referringTab = path;
}

// -----------------------------------------------------------------------
// Legacy compatibility stubs. Older code calls pushMoreEntry /
// consumeMoreEntry / peekMoreEntry / clearMoreStack / dismissMoreStackIfAny
// and expects them to exist. We keep the exports so nothing breaks, but
// they are now no-ops: safeBack no longer needs an origin-tab stack.

type MoreEntry = { originTab: string; inFlow: boolean };

export function pushMoreEntry(_originTab: string, _inFlow: boolean): void {
  // no-op — no origin tracking under Vinted-style back
}

export function consumeMoreEntry(): MoreEntry | null {
  return null;
}

export function peekMoreEntry(): MoreEntry | null {
  return null;
}

export function clearMoreStack(): void {
  // no-op
}

export function dismissMoreStackIfAny(): void {
  // no-op — under Vinted-style back, tab re-entry MUST NOT dismiss the
  // (more) stack. Doing so would erase history the user still expects to
  // walk back through when they return to the tab.
}

// -----------------------------------------------------------------------
// Back.
//
// Priority:
//   1. router.canGoBack() → router.back() (native stack pop).
//   2. If the router thinks it can't (rare: cold-start deep link), fall
//      back to the module-level nav-history tracker which remembers the
//      last few unique route paths, and replace() to whatever came right
//      before the current entry.
//   3. Last resort: replace() to the referring tab, else the caller's
//      hard-coded fallback (defaults to /(tabs)).

export function safeBack(router: Router, fallback: string = "/(tabs)") {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    // canGoBack throws mid-transition sometimes; treat as "no".
  }

  // Deep-link / cold-start path.
  const prev = peekPreviousRoute();
  if (prev) {
    router.replace(prev as any);
    return;
  }

  router.replace((referringTab ?? fallback) as any);
}

// -----------------------------------------------------------------------
// Push helpers. All three are now the SAME operation — a plain
// router.push. The three separate names remain so call sites still
// compile; new code should just call pushFromCard everywhere for clarity.

function _push(
  router: Router,
  path: string,
  params?: Record<string, unknown>,
): void {
  if (params) {
    router.push({ pathname: path as any, params: params as any });
  } else {
    router.push(path as any);
  }
}

/**
 * Navigate from a tab root to a (more) screen. Under Vinted-style back
 * this is identical to pushFromCard/pushDetail — kept as a separate
 * export so existing call sites need no changes.
 */
export function pushFromTab(
  router: Router,
  path: string,
  params?: Record<string, unknown>,
): void {
  _push(router, path, params);
}

/**
 * Card / feed push. `insideMore` is ignored — under Vinted-style back
 * every push is the same. Kept in the signature so existing call sites
 * (ProductCard, PostCard, category screens) need no changes.
 */
export function pushFromCard(
  router: Router,
  path: string,
  _insideMore: boolean,
  params?: Record<string, unknown>,
): void {
  _push(router, path, params);
}

/**
 * Index-of-details push (e.g. Orders list → specific order). Same as
 * pushFromCard now — the "in-flow" flag was only meaningful under the
 * old origin-tab collapse rule.
 */
export function pushDetail(
  router: Router,
  path: string,
  params?: Record<string, unknown>,
): void {
  _push(router, path, params);
}

// Kept exported so anything that imported it (imports elsewhere in the
// tree) resolves. Not used by safeBack anymore.
export { globalRouter };
