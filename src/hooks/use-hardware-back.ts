/**
 * useHardwareBack — v1.0.231
 *
 * Bridges the Android hardware / gesture back button to the same navigation
 * semantics as the in-app chevron (safeBack). Without this, hardware back
 * calls navigation.goBack() at the native level, which for screens reached
 * via a deep link (or an already-dismissed stack) either does nothing or
 * exits the app instead of returning to a sensible parent.
 *
 * Rules (must match safeBack exactly):
 *   • Any non-tab-root screen with history → router.back() (pop one entry).
 *   • Any non-tab-root screen with no history → replace to the natural
 *     parent based on the current segment:
 *       - admin/* → /(tabs)/(more)/admin  (fully-qualified so Expo Router
 *         resolves it identically to the chevron's default)
 *       - seller/* → /(tabs)/seller/dashboard
 *       - (auth)/*  → /(auth)/login  (v1.0.231 — previously untreated,
 *         meaning hardware back from a magic-link deep-link exited the app)
 *       - everything else → /(tabs)/account
 *   • Tab-root screen → do nothing, let Android handle it (tab switch /
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
      // v1.0.231 — previously this hook only handled routes inside the
      // (more) group. That left (auth)/* deep links (and any future
      // top-level route) falling through to Android's default handler,
      // which exits the app instead of routing to a natural parent.
      //
      // A "tab root" is a route whose top-level segment is (tabs) and
      // whose second segment is a real tab (browse, seller, account,
      // create, index) — NOT (more). Everything else is a pushed screen
      // and should be handled by us.
      const isAuth = segments.some((s) => s === "(auth)");
      const inMore = segments.includes("(more)" as never);
      const isTabRoot =
        segments[0] === "(tabs)" &&
        !inMore &&
        // Tab roots are exactly one level below (tabs). Anything deeper
        // is a pushed detail screen even if it isn't under (more).
        segments.length <= 2;

      if (isTabRoot && !isAuth) return false;

      const isSellerFlow = segments.some((s) => s === "seller");
      const isAdminFlow = segments.some((s) => s === "admin");
      const fallback = isAuth
        ? "/(auth)/login"
        : isAdminFlow
          ? "/(tabs)/(more)/admin"
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
