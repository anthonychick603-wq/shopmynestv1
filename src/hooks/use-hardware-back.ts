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

import { safeBack } from "@/src/utils/nav";

export function useHardwareBack(): void {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onBack = (): boolean => {
      // Bottom-tab roots have no in-app back destination; let Android use
      // its normal tab/app behavior. Every detail/tool screen lives in
      // (more) and is handled exactly like its visible chevron.
      const inMore = segments.includes("(more)" as never);
      if (!inMore) return false;

      const isSellerFlow = segments.some((s) => s === "seller");
      const isAdminFlow = segments.some((s) => s === "admin");
      const fallback = isAdminFlow
        ? "/admin"
        : isSellerFlow
          ? "/(tabs)/seller/dashboard"
          : "/(tabs)/account";
      safeBack(router, fallback);
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [router, segments]);
}
