/**
 * useRedirectAdmins \u2014 v1.0.237
 *
 * A tiny hook for seller-only screens that must never render for an admin
 * user. When the current user's role is "admin", we bounce them to a
 * safe destination (default: the admin console). If they arrive here
 * because a deep link, notification, or old dashboard tile pointed them
 * at a seller-only path, we return them to somewhere sensible instead of
 * throwing a confusing 404 toast from the backend.
 *
 * The screen should still guard its render (return null / EmptyState)
 * while the redirect is in flight so a flash of seller UI isn't visible
 * before the router swaps stacks.
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";

export function useRedirectAdmins(destination: string = "/admin") {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    if (isAdmin) {
      // replace, not push \u2014 so the back button doesn't strand the admin
      // right back on the seller screen they just got bounced off of.
      router.replace(destination as never);
    }
  }, [isAdmin, destination, router]);
  return { isAdmin };
}
