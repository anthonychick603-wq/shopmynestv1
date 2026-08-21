/**
 * useTrackReferringTab — v1.0.108
 *
 * Watches expo-router segments and:
 *   1. Stores the current tab whenever the user is on a tab root (not
 *      inside the (more) stack). safeBack reads this via getReferringTab()
 *      so back-with-no-history returns to the tab the user came from,
 *      not a hard-coded default.
 *   2. Dismisses the (more) stack the instant the user lands back on a
 *      tab root, so the shared (more) stack can't accumulate entries
 *      across tab switches. This is what makes router.canGoBack() safe
 *      to trust inside safeBack + useHardwareBack — any remaining stack
 *      history is guaranteed to be within-flow.
 */
import { useEffect, useRef } from "react";
import { useSegments } from "expo-router";

import { clearMoreStack, dismissMoreStackIfAny, setReferringTab } from "@/src/utils/nav";

// Map from the third path segment (the tab folder or file name) to the
// canonical tab route. Anything unknown falls back to the tabs root.
const TAB_ROUTES: Record<string, string> = {
  index: "/(tabs)",
  browse: "/(tabs)/browse",
  cart: "/(tabs)/cart",
  alerts: "/(tabs)/alerts",
  account: "/(tabs)/account",
  create: "/(tabs)/create",
  "seller/dashboard": "/(tabs)/seller/dashboard",
};

export function useTrackReferringTab(): void {
  const segments = useSegments();
  const wasInMore = useRef(false);

  useEffect(() => {
    // Only update / dismiss when we're on a tab root (not inside the
    // shared (more) stack). Tab roots have segments like ["(tabs)", "<tab>"]
    // with no "(more)" entry.
    const inTabs = segments.includes("(tabs)" as never);
    const inMore = segments.includes("(more)" as never);
    if (!inTabs) return;
    if (inMore) {
      wasInMore.current = true;
      return;
    }

    // We're on a tab root. If we just came back from (more), reset the
    // (more) stack so the next push starts fresh (avoids the cross-tab
    // "back jumps to unrelated screen" bug that safeBack used to work
    // around by refusing to pop).
    if (wasInMore.current) {
      dismissMoreStackIfAny();
      // v1.0.121 — keep the origin-tab stack in sync with the router.
      // Tab-root re-entry means every previous (more) push is gone.
      clearMoreStack();
      wasInMore.current = false;
    }

    // Second segment is the tab name (or "seller/dashboard" split into
    // ["seller", "dashboard"]). Handle both.
    const tabsIdx = segments.indexOf("(tabs)" as never);
    const rest = segments.slice(tabsIdx + 1) as string[];
    if (rest.length === 0) {
      setReferringTab("/(tabs)");
      return;
    }
    const key = rest.join("/");
    const route = TAB_ROUTES[key] ?? TAB_ROUTES[rest[0]] ?? "/(tabs)";
    setReferringTab(route);
  }, [segments]);
}
