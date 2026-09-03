/**
 * useHardwareBack — v1.0.232
 *
 * Bridges the Android hardware / gesture back button to the same navigation
 * semantics as the in-app chevron (safeBack). Since v1.0.232 the fallback
 * path is read from the BackFallback registry, which every screen with a
 * chevron declares via useBackFallback("…"). That guarantees the chevron
 * and hardware back go to the SAME place on cold-start deep links.
 *
 * If the current screen didn't register a fallback (older / unmigrated
 * screen, or a route we didn't know about), we fall back to a segment
 * guess so the hook still degrades gracefully.
 *
 * Rules:
 *   • Any non-tab-root screen with history → router.back() (pop one entry).
 *   • Any non-tab-root screen with no history → replace to the registered
 *     fallback, or the segment guess if none was registered:
 *       - admin/*   → /(tabs)/(more)/admin
 *       - seller/*  → /(tabs)/seller/dashboard
 *       - (auth)/*  → /(auth)/login
 *       - other     → /(tabs)/account
 *   • Tab-root screen → do nothing, let Android handle it (tab switch or
 *     exit the app as expected).
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
