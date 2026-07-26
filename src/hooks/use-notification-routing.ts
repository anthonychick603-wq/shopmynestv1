import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useRootNavigationState, useRouter } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";

// Show pushes that arrive while the app is open. Without a handler, expo-notifications
// suppresses foreground notifications entirely, so there is nothing to tap.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// The `data` payload MNU_Ops::notify_user() sends. `type` is the same vocabulary
// the in-app alerts table uses, so both systems stay describable in one language.
type PushData = {
  source?: string;
  type?: string;
  order_id?: number | string;
  seller_id?: number | string;
  status?: string;
};

/**
 * Map a push payload to a route, or null to stay put.
 *
 * Only the three types the backend actually sends are handled. Unknown types
 * deliberately do not navigate — guessing a destination is worse than opening
 * the app where the user expects it.
 */
export function routeForPush(data: PushData): string | null {
  const orderId = data.order_id != null && data.order_id !== "" ? String(data.order_id) : "";
  switch (data.type) {
    // Buyer-facing: the recipient is the customer on the order, so the buyer
    // order detail screen can load it.
    case "order_shipped":
    case "order_update":
      return orderId ? `/order/${orderId}` : "/orders";
    // Seller-facing. Deliberately NOT /order/{id}: that screen loads through
    // GET the-nest/v1/orders/{id}, which only authorises the buyer (or a
    // manage_woocommerce admin), so a vendor would land on "Order not found".
    // The dashboard is where a seller's own orders actually are.
    case "new_order":
      return "/seller/dashboard";
    default:
      return null;
  }
}

/**
 * Navigates when the user taps a push notification — whether the app was
 * foregrounded, backgrounded, or launched cold by the tap.
 */
export function useNotificationRouting(): void {
  const router = useRouter();
  const { user, loading } = useAuth();
  const navState = useRootNavigationState();
  // Every destination is account-scoped, so hold the tap until auth has settled.
  const ready = !!navState?.key && !loading;
  const handled = useRef<Set<string>>(new Set());
  const pending = useRef<Notifications.NotificationResponse | null>(null);

  useEffect(() => {
    const consume = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;

      if (!ready) {
        // Router or auth not up yet (typical for a cold start). Hold the newest
        // tap and replay it from the effect below once both are.
        pending.current = response;
        return;
      }
      handled.current.add(id);
      pending.current = null;
      if (!user) return;
      const path = routeForPush((response.notification.request.content.data ?? {}) as PushData);
      if (path) router.push(path);
    };

    // A tap that launched the app from a killed state is not delivered to the
    // listener, so it has to be read once explicitly.
    Notifications.getLastNotificationResponseAsync().then(consume).catch(() => {});
    consume(pending.current);
    const sub = Notifications.addNotificationResponseReceivedListener(consume);
    return () => sub.remove();
  }, [ready, user, router]);
}
