/**
 * useHardwareBack — v1.0.108
 *
 * Bridges the Android hardware / gesture back button to the same navigation
 * semantics as the in-app chevron (safeBack). Without this, hardware back
 * calls navigation.goBack() at the native level, which for (more) screens
 * reached via a deep link (or an already-dismissed stack) either does
 * nothing or exits the app instead of returning to a sensible tab parent.
 *
 * Rules (must match safeBack exactly):
 *   • (more) screen with history → router.back() (pop one entry)
 *   • (more) screen with no history → route to the referring tab if we
 *     have one, else fall back to a natural parent tab based on the
 *     current segment (seller/* → Seller dashboard, everything else →
 *     Account).
 *   • Tab root screen → do nothing, let Android handle it (tab switch /
 *     exit the app as expected).
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

      // In (more) → prefer a real stack pop. Because useTrackReferringTab
      // dismisses the (more) stack whenever the user lands back on a tab
      // root, any stack history that remains is guaranteed to be within
      // the same flow (Product → Seller → Product B → back → Seller),
      // so router.back() is now the correct behaviour.
      try {
        if (router.canGoBack()) {
          router.back();
          return true;
        }
      } catch {
        // fall through to referring-tab fallback
      }

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
