/**
 * useTrackReferringTab — v1.0.57
 *
 * Watches expo-router segments and stores the current tab whenever the
 * user is on a tab root (not inside the (more) stack). safeBack reads this
 * via getReferringTab() so pushes launched from Account return to Account
 * on empty-history back, and pushes launched from Seller dashboard return
 * to Seller dashboard — no matter which caller-provided fallback the
 * screen declared.
 */
import { useEffect } from "react";
import { useSegments } from "expo-router";

import { setReferringTab } from "@/src/utils/nav";

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

  useEffect(() => {
    // Only update when we're on a tab root (not inside the shared (more)
    // stack). This means: segments look like ["(tabs)", "<tab>"] with no
    // "(more)" entry.
    if (!segments.includes("(tabs)" as never)) return;
    if (segments.includes("(more)" as never)) return;

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
