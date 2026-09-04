/**
 * useHardwareBack — v1.0.255
 *
 * Strict back-history contract for every non-tab-root screen: back
 * (whether the hardware button, the gesture, or the chevron) pops
 * exactly one entry off the navigation stack. It never jumps to a
 * hard-coded ancestor when there is real history to pop.
 *
 * Tab roots (Home, Browse, Account, Create, Seller Dashboard) keep
 * Android's default behavior — back exits the app or switches tabs —
 * because bottom tabs are peer navigations in React Navigation, not
 * stack pushes, and forcing a peer-tab tap into the back stack would
 * require rewriting the tab bar. Users expecting "back returns me to
 * the previous tab" have the tab bar itself as the affordance.
 *
 * Rules:
 *   • Any non-tab-root screen with history → router.back() (pop one entry).
 *   • Any non-tab-root screen with no history → the fallback the screen
 *     registered via useBackFallback(...), or a segment-based guess:
 *       - admin/*   → /(tabs)/(more)/admin
 *       - seller/*  → /(tabs)/seller/dashboard
 *       - (auth)/*  → /(auth)/login
 *       - other     → /(tabs)/account
 *   • Tab-root screen → return false so Android handles it (tab switch
 *     or app exit).
 */
import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { useRouter, useSegments } from "expo-router";

import { safeBack } from "@/src/utils/nav";
import { useBackFallbackReader } from "@/src/context/BackFallback";

export function useHardwareBack(): void {
  const router = useRouter();
  const segments = useSegments();
  const readFallback = useBackFallbackReader();

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onBack = (): boolean => {
      const isAuth = segments.some((s) => s === "(auth)");
      const inMore = segments.includes("(more)" as never);
      const isTabRoot =
        segments[0] === "(tabs)" &&
        !inMore &&
        segments.length <= 2;

      // Tab roots (Home, Browse, Account, Create, Seller dashboard) let
      // Android use its default behavior: tab switch or app exit.
      if (isTabRoot && !isAuth) return false;

      // Prefer the fallback the current screen registered — that's what
      // its own chevron would use. Falls back to a segment guess when
      // nothing is registered.
      const registered = readFallback();
      if (registered) {
        safeBack(router, registered);
        return true;
      }

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
  }, [router, segments, readFallback]);
}
