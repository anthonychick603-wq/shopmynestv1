/**
 * useTrackReferringTab — v1.0.166
 *
 * Under Vinted-style back (Aug 25, 2026) this hook no longer dismisses
 * the (more) stack when the user returns to a tab root — doing so would
 * erase history the user still expects to walk back through.
 *
 * What it still does:
 *   • Tracks the current tab in `referringTab` so safeBack has a last-
 *     resort destination when a cold-start deep link has no history.
 *   • Nothing else. The old cross-tab bleed logic (dismissMoreStackIfAny
 *     + clearMoreStack on tab-root re-entry) is intentionally gone.
 */
import { useEffect } from "react";
import { useSegments } from "expo-router";

import { setReferringTab } from "@/src/utils/nav";

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

  useEffect(() => {
    const inTabs = segments.includes("(tabs)" as never);
    const inMore = segments.includes("(more)" as never);
    if (!inTabs || inMore) return;

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
