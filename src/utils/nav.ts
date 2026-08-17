// v1.0.53 — safeBack
//
// A one-liner router.back() will silently no-op when the current screen was
// opened as a router.replace() destination (no prior entry) or when the app
// was cold-started deep into a route (Play Store notification, share intent,
// share-a-link on the web build). Sellers then see the back arrow do
// nothing.
//
// safeBack(router, fallback) uses router.canGoBack() to decide between
// popping the stack and pushing the caller-provided fallback (usually the
// nearest logical parent screen — the tabs root, the seller dashboard, or
// the account tab). This keeps navigation predictable no matter how the
// user reached the current screen.
import type { Router } from "expo-router";

export function safeBack(router: Router, fallback: string = "/(tabs)") {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  // replace so the fallback becomes the new root instead of stacking on top.
  router.replace(fallback as any);
}
