// v1.0.69 — tiny haptics facade so the rest of the app doesn't have to think
// about the expo-haptics enum, or about it silently failing on the web build
// or on a device that has haptics disabled. Every call is swallowed so a UI
// action never blows up because a phone doesn't have a Taptic engine.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const supported = Platform.OS === "ios" || Platform.OS === "android";

function safe(run: () => Promise<unknown> | unknown): void {
  if (!supported) return;
  try {
    const p = run();
    if (p && typeof (p as Promise<unknown>).then === "function") {
      (p as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Ignore — haptics are decoration, never let them break UX.
  }
}

export const haptics = {
  /** Light tap — use on toggles, chip taps, small state changes. */
  tap(): void {
    safe(() => Haptics.selectionAsync());
  },
  /** Medium impact — primary CTAs and buttons. */
  press(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** Heavy impact — destructive confirm, publish, submit. */
  strongPress(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
  /** Positive notification — add to cart, save succeeded, checkout ok. */
  success(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** Negative notification — validation error, API failure, out of stock. */
  error(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
  /** Warning notification — irreversible action prompt. */
  warning(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
};
