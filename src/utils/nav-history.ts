// v1.0.117 — Full route history tracker. safeBack + hardware back use
// this as the ultimate source of truth so "back" always returns to the
// screen the user was JUST on, regardless of whether that screen is a
// tab root, a (more) push, or a peer tab reached via a header shortcut
// (alerts / cart).
//
// Why we can't just rely on router.canGoBack() / router.back():
//
//   1. expo-router's Tabs treat a Tabs.Screen jump as a peer switch, not a
//      Stack push. Going Blog \u2192 tap the bell \u2192 Alerts is a tab switch,
//      not a push, so router.back() from Alerts either does nothing or
//      pops an unrelated (more) entry.
//   2. Even inside the (more) Stack we occasionally do dismissAll() (on
//      tab-root re-entry) to prevent cross-flow bleed, which nukes any
//      history the user would still expect to walk back through.
//   3. Every screen currently passes a hard-coded fallback path to
//      safeBack, so back from a deep-linked-into screen jumps to that
//      fallback instead of the actual previous screen when the stack is
//      empty.
//
// The tracker records the last N unique route paths (segment array +
// stringified params) each time expo-router's segments change. safeBack
// now consults the tracker, prefers a real router.back() when both agree
// that the previous route is one Stack pop away, and otherwise
// router.replace()s the previous route directly.
//
// The tracker is a plain module-level array \u2014 no context, no hooks
// required at the call site \u2014 so any component can call safeBack
// synchronously from a press handler.

// Small but generous \u2014 covers a normal browse session and a deep-link
// entry with a couple of tab hops.
const MAX_HISTORY = 20;

// The full route path including query params, e.g.
//   "/(tabs)/(more)/product/[id]?id=42"
type Entry = { path: string };

const history: Entry[] = [];

/** Push a new entry. No-ops if it matches the current tail (so a single
 * screen re-render doesn't duplicate the history). */
export function recordRoute(path: string): void {
  if (!path) return;
  const tail = history[history.length - 1];
  if (tail && tail.path === path) return;
  history.push({ path });
  if (history.length > MAX_HISTORY) history.shift();
}

/** Return the entry immediately before the current one, without popping. */
export function peekPreviousRoute(): string | null {
  if (history.length < 2) return null;
  return history[history.length - 2].path;
}

/** Pop the current entry and return the new tail (i.e. the previous
 * route). Used when we actually consume "back" \u2014 the tracker's tail
 * should then reflect the screen we're returning TO, not the one we're
 * leaving. */
export function consumePreviousRoute(): string | null {
  if (history.length < 2) return null;
  history.pop();
  return history[history.length - 1].path;
}

/** Snapshot for debugging / tests. */
export function getHistorySnapshot(): string[] {
  return history.map((e) => e.path);
}

/** Reset. Used on hard sign-out / cold start. */
export function clearHistory(): void {
  history.length = 0;
}
