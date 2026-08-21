// v1.0.56 - deep link routing. When the user opens a shopmynest.com URL from
// another app (Messages, WhatsApp, Chrome), Android may hand the URL to us
// once App Links are verified against .well-known/assetlinks.json. This hook
// listens for those inbound URLs and pushes the appropriate screen.
//
// Supported patterns:
//   https://shopmynest.com/?p=<numeric_id>       ← product OR blog post fallback
//   https://shopmynest.com/product/<slug>        ← WooCommerce product permalink
//   https://shopmynest.com/vendors/<id>/         ← Dokan vendor page
//   https://shopmynest.com/shop                  ← general shop page (open Browse tab)
//   https://shopmynest.com/blog                  ← open the Fresh from the Nest tab
//
// The `?p=<id>` URLs resolve immediately (numeric). Slug-based product
// permalinks are resolved by calling the marketplace API's product-lookup
// endpoint by slug. If lookup fails the app opens the browse tab so the
// buyer always lands somewhere useful.
import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { nest } from "@/src/api/nest";
import { useAuth } from "@/src/context/AuthContext";

function parseNumericParam(url: URL, key: string): string | null {
  const v = url.searchParams.get(key);
  if (!v) return null;
  return /^\d+$/.test(v) ? v : null;
}

async function routeUrl(
  rawUrl: string,
  router: ReturnType<typeof useRouter>,
  adoptSessionToken: (token: string) => Promise<void>,
): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { return; }

  // v1.0.120 — signup magic link. Server-side handler at
  // /verify-signup?token=...&pending=... does the actual verification
  // and 302-redirects to thenest://auth/signup/verified?token=<jwt>.
  // When we receive that, we hydrate the auth context and drop the
  // user straight into the tabs.
  if (parsed.protocol === "thenest:" && parsed.host === "auth" && parsed.pathname.startsWith("/signup/verified")) {
    const token = parsed.searchParams.get("token") ?? "";
    if (!token) {
      router.replace("/(auth)/login");
      return;
    }
    try {
      await adoptSessionToken(token);
      router.replace("/(tabs)");
    } catch {
      router.replace("/(auth)/login");
    }
    return;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  if (host !== "shopmynest.com") return;

  const p = parseNumericParam(parsed, "p");
  const path = parsed.pathname.replace(/\/+$/, "");

  // Blog: /blog or ?p=<id> with the blog CPT slug hint.
  if (path === "/blog") {
    router.push("/(tabs)");
    return;
  }

  // Vendor: /vendors/<id>
  const vendorMatch = path.match(/^\/vendors\/(\d+)/);
  if (vendorMatch) {
    router.push(`/(tabs)/(more)/seller/${vendorMatch[1]}`);
    return;
  }

  // Product permalink: /product/<slug>
  const slugMatch = path.match(/^\/product\/([^/]+)/);
  if (slugMatch) {
    try {
      // Best-effort: resolve slug -> numeric product id. If the API doesn't
      // support slug lookup yet, fall back to the browse tab.
      const raw = await nest.getProduct(slugMatch[1] as unknown as number).catch(() => null);
      if (raw?.id) {
        router.push(`/(tabs)/(more)/product/${raw.id}`);
        return;
      }
    } catch {}
    router.push("/(tabs)/browse");
    return;
  }

  // Numeric ?p=<id> can be either a product or a blog post. Try product
  // first; if that misses, treat it as a blog post.
  if (p) {
    try {
      const raw = await nest.getProduct(p as unknown as number).catch(() => null);
      if (raw?.id) {
        router.push(`/(tabs)/(more)/product/${raw.id}`);
        return;
      }
    } catch {}
    router.push(`/(tabs)/(more)/blog/${p}`);
    return;
  }

  // /shop or anything else: open Browse.
  router.push("/(tabs)/browse");
}

export function useDeepLinkRouting(): void {
  const router = useRouter();
  const { adoptSessionToken } = useAuth();

  useEffect(() => {
    // Cold start: the URL that launched the app (if any).
    Linking.getInitialURL().then((url) => {
      if (url) void routeUrl(url, router, adoptSessionToken);
    });

    // Warm: URLs that arrive while the app is already running.
    const sub = Linking.addEventListener("url", (evt) => {
      void routeUrl(evt.url, router, adoptSessionToken);
    });
    return () => sub.remove();
  }, [router, adoptSessionToken]);
}
