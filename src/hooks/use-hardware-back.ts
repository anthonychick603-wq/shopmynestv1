/**
 * useHardwareBack — v1.0.60
 *
 * Bridges the Android hardware / gesture back button to the same navigation
 * semantics as the in-app chevron. Without this, hardware back always calls
 * navigation.goBack() at the native level, which for (more) screens reached
 * via a deep link (or an already-dismissed stack) either does nothing or
 * exits the app — instead of returning to a sensible tab parent.
 *
 * Rules:
 *   • (more) screen with history → pop the stack (default behaviour)
 *   • (more) screen with no history → route to the natural parent tab
 *     based on the current segment (seller/* → Seller dashboard, everything
 *     else → Account, matching the in-app chevron fallbacks used across the
 *     app).
 *   • Tab root screen → do nothing, let Android handle it (switches tab or
 *     exits the app as expected).
 */
import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { useRouter, useSegments } from "expo-router";

import { getReferringTab } from "@/src/utils/nav";

export function useHardwareBack(): void {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onBack = (): boolean => {
      const inMore = segments.includes("(more)" as never);
      // Not in the (more) stack → let Android handle back (tab switch / exit).
      if (!inMore) return false;

      // In (more) → do NOT call router.back(). The (more) group is a
      // single shared Stack across every tab, so canGoBack() reports true
      // whenever another tab left an unrelated screen on the stack, and
      // back would pop through the user's entire session history. Instead
      // always route to a tab: the one they launched from, else a
      // natural parent based on the current segment.
      const remembered = getReferringTab();
      if (remembered) {
        router.replace(remembered as never);
        return true;
      }
      const isSellerFlow = segments.some((s) => s === "seller");
      const parent = isSellerFlow ? "/(tabs)/seller/dashboard" : "/(tabs)/account";
      router.replace(parent as never);
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [router, segments]);
}
