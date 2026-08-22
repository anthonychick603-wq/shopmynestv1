// v1.0.117 \u2014 records every route the user visits so safeBack can return
// to the actual previous screen even when router.back() doesn't have a
// stack entry to pop (tab switches, deep links, dismissAll cleanups).
//
// Mounted once at the root of the tree (app/_layout.tsx). Uses
// expo-router's useSegments + useLocalSearchParams so the recorded path
// includes both the current route and its params \u2014 that's what lets us
// return a user from Alerts back to `/(tabs)/(more)/product/[id]?id=42`
// with the same product they were viewing before tapping the bell.
import { useEffect } from "react";
import { useSegments, useGlobalSearchParams } from "expo-router";

import { recordRoute } from "@/src/utils/nav-history";

function buildPath(segments: readonly string[], params: Record<string, unknown>): string {
  // Filter route-group segments \u2014 those are structural (like "(tabs)"
  // or "(more)") and never appear in a real URL. Reconstruct a clean
  // path so the recorded entry matches what expo-router accepts on
  // router.replace().
  const parts = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  const pathname = "/" + parts.join("/");
  // Preserve params (id, tab, etc.) so returning to a detail screen
  // renders the same content. Ignore expo-router internal keys.
  const query: string[] = [];
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null) continue;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    query.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return query.length > 0 ? `${pathname}?${query.join("&")}` : pathname;
}

export function useNavHistory(): void {
  const segments = useSegments();
  // useGlobalSearchParams re-renders whenever ANY params change, which
  // is exactly what we want for a history tracker.
  const params = useGlobalSearchParams();

  useEffect(() => {
    // Cast to number: expo-router types `segments` as a non-empty tuple
    // so TS thinks .length is always ≥1, but at first mount / edge cases
    // it can genuinely be empty. Comparing via a number cast keeps the
    // guard while satisfying strict TS.
    if (!segments || (segments.length as number) === 0) return;
    const path = buildPath(segments as unknown as string[], params as Record<string, unknown>);
    recordRoute(path);
  }, [segments, params]);
}
