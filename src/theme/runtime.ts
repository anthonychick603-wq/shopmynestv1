// v1.0.206 — runtime theme loader.
//
// Contract:
//   - Baked defaults in ../theme.ts are always available. If this file
//     never runs, or the network is offline, or the plugin is missing,
//     the app still opens with a working palette.
//   - On cold launch, `loadRuntimeTheme()` reads the last cached
//     payload from AsyncStorage and applies it synchronously so the
//     very first render uses the seller's chosen colors (no flash).
//   - Then it fires a background fetch of /wp-json/mynest/v1/theme. If
//     the fetched `version` is greater than what's cached, the new
//     payload is written to cache so the NEXT cold launch picks it up.
//     We deliberately don't hot-swap mid-session: StyleSheet.create()
//     snapshots values at import time and mutating them mid-session
//     produces inconsistent styles.
//   - Font loading is a separate step: if the seller picked a Google
//     Font, we load it via expo-font before the app un-hides the
//     splash. If loading fails, we fall back to the system font and
//     never block the UI.
//
// This module deliberately has no dependency on the WP API client to
// avoid pulling auth logic, timeouts, or JSON error wrappers into a
// path that must NEVER throw. Every failure is caught and logged; the
// worst case is that the app opens with baked defaults.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Font from "expo-font";

import {
  colors as bakedColors,
  radius as bakedRadius,
  spacing as bakedSpacing,
  statusPalette as bakedStatus,
  type as bakedType,
} from "../theme";

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || "https://shopmynest.com").replace(/\/+$/, "");
const ENDPOINT = `${SITE_URL}/wp-json/mynest/v1/theme`;
const CACHE_KEY = "mynest.theme.cache.v1";
const FETCH_TIMEOUT_MS = 6000;

export type ThemePayload = {
  version: number;
  updatedAt?: string;
  colors?: Record<string, string>;
  statusPalette?: Partial<Record<"waiting" | "inMotion" | "done" | "error" | "neutral", { bg: string; fg: string }>>;
  spacing?: Record<string, number>;
  radius?: Record<string, number>;
  typography?: Record<string, string | number>;
};

// Google Font family → asset URLs for the weights the app renders.
// Only weights that actually appear in our type scale are listed here
// to keep the cold-launch download small. Adding a weight later just
// means adding it here + in the plugin's font_options() list.
//
// Font files are served by the Google Fonts static CDN. Fonts hosted
// on fonts.gstatic.com are provided free under the SIL Open Font
// License — safe to bundle at runtime.
const GOOGLE_FONT_ASSETS: Record<string, Record<string, string>> = {
  Inter: {
    "Inter-Regular":  "https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf",
    "Inter-Bold":     "https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
    "Inter-Black":    "https://fonts.gstatic.com/s/inter/v18/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf",
  },
  Poppins: {
    "Poppins-Regular": "https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecnFHGPc.ttf",
    "Poppins-Bold":    "https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLCz7Z1xlFd2JQEk.ttf",
    "Poppins-Black":   "https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLBT5Z1xlFd2JQEk.ttf",
  },
  Nunito: {
    "Nunito-Regular": "https://fonts.gstatic.com/s/nunito/v31/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshdTk3.ttf",
    "Nunito-Bold":    "https://fonts.gstatic.com/s/nunito/v31/XRXI3I6Li01BKofiOc5wtlZ2di8HDIYudTk3.ttf",
    "Nunito-Black":   "https://fonts.gstatic.com/s/nunito/v31/XRXI3I6Li01BKofiOc5wtlZ2di8HDFEsdTk3.ttf",
  },
  "Work Sans": {
    "WorkSans-Regular": "https://fonts.gstatic.com/s/worksans/v23/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nXNigDp6_cOyA.ttf",
    "WorkSans-Bold":    "https://fonts.gstatic.com/s/worksans/v23/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nXNigDp6_cOyA.ttf",
  },
  "DM Sans": {
    "DMSans-Regular": "https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAop-.ttf",
    "DMSans-Bold":    "https://fonts.gstatic.com/s/dmsans/v15/rP2Hp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAoZ2Ln.ttf",
  },
  Merriweather: {
    "Merriweather-Regular": "https://fonts.gstatic.com/s/merriweather/v31/u-4-0qyriQwlOrhSvowK_l521wRZWMf6hPvhPQ.ttf",
    "Merriweather-Bold":    "https://fonts.gstatic.com/s/merriweather/v31/u-4n0qyriQwlOrhSvowK_l521wRpX8P7bOsChTk.ttf",
  },
  "Playfair Display": {
    "PlayfairDisplay-Regular": "https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvXDQ.ttf",
    "PlayfairDisplay-Bold":    "https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd2vHDQ.ttf",
  },
  Lora: {
    "Lora-Regular": "https://fonts.gstatic.com/s/lora/v35/0QI6MX1D_JOuGQbT0gvTJPa787weuxJBkq18.ttf",
    "Lora-Bold":    "https://fonts.gstatic.com/s/lora/v35/0QI6MX1D_JOuGQbT0gvTJPa787z5vBJBkq18.ttf",
  },
};

/**
 * Read the cached theme payload. Returns null if there is no cache or
 * if the cache is unparseable — never throws.
 */
async function readCache(): Promise<ThemePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.version === "number") return parsed as ThemePayload;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(payload: ThemePayload): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Cache is best-effort; ignore write failures.
  }
}

async function fetchTheme(): Promise<ThemePayload | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(ENDPOINT, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && typeof json.version === "number") return json as ThemePayload;
    return null;
  } catch {
    return null;
  }
}

/**
 * Apply a payload's values on top of the baked-defaults objects. Only
 * whitelisted keys are copied so a malformed payload can't overwrite
 * unrelated fields, and typing is preserved so downstream code keeps
 * seeing strings for colors, numbers for spacing, etc.
 */
function applyPayload(payload: ThemePayload): void {
  if (payload.colors) {
    for (const [k, v] of Object.entries(payload.colors)) {
      if (typeof v === "string" && v.startsWith("#")) bakedColors[k] = v;
    }
  }
  if (payload.statusPalette) {
    for (const state of ["waiting", "inMotion", "done", "error", "neutral"] as const) {
      const s = payload.statusPalette[state];
      if (s && typeof s.bg === "string" && typeof s.fg === "string") {
        bakedStatus[state] = { bg: s.bg, fg: s.fg };
      }
    }
  }
  if (payload.spacing) {
    for (const [k, v] of Object.entries(payload.spacing)) {
      if (typeof v === "number" && v >= 0 && v <= 4096) bakedSpacing[k] = v;
    }
  }
  if (payload.radius) {
    for (const [k, v] of Object.entries(payload.radius)) {
      if (typeof v === "number" && v >= 0 && v <= 4096) bakedRadius[k] = v;
    }
  }
  if (payload.typography) {
    const t = payload.typography;
    const display = typeof t.displaySize === "number" ? t.displaySize : bakedType.h1.fontSize;
    const heading = typeof t.headingSize === "number" ? t.headingSize : bakedType.h2.fontSize;
    const body    = typeof t.bodySize    === "number" ? t.bodySize    : bakedType.body.fontSize;
    const caption = typeof t.captionSize === "number" ? t.captionSize : bakedType.caption.fontSize;
    bakedType.h1.fontSize = display;
    bakedType.h2.fontSize = heading;
    bakedType.body.fontSize = body;
    bakedType.bodyMuted.fontSize = body - 1;
    bakedType.caption.fontSize = caption;
    // Font family gets applied after loadFontIfNeeded() succeeds — we
    // only touch displayFamily/textFamily when the font is actually
    // registered so a failed load falls back to the system font.
  }
}

/**
 * Load a Google Font family via expo-font. Returns the family name
 * expo-font actually registered (regular weight), or null on failure.
 * Fonts are cached by expo-font, so second launches are instant.
 */
async function loadFontIfNeeded(family: string | undefined): Promise<string | null> {
  if (!family || family === "System") return null;
  const assets = GOOGLE_FONT_ASSETS[family];
  if (!assets) return null;
  try {
    await Font.loadAsync(assets);
    const first = Object.keys(assets)[0];
    return first || null;
  } catch {
    return null;
  }
}

/**
 * Public entry point. Called from app/_layout.tsx before the splash
 * screen is dismissed. Resolves as fast as possible so the app opens
 * quickly; a slow or unreachable server never blocks longer than
 * FETCH_TIMEOUT_MS. Font loading is awaited when the seller has
 * chosen a non-system font so we don't briefly render with the wrong
 * typeface — this is the one place we accept a small first-launch
 * delay in exchange for a correct-looking first frame.
 */
export async function loadRuntimeTheme(): Promise<void> {
  // 1) Apply cached payload synchronously (as far as async allows) so
  //    first render uses the seller's palette from the last cold launch.
  const cached = await readCache();
  if (cached) applyPayload(cached);

  // 2) Await font load for whichever family the cache said to use.
  //    On very first launch there's no cache and this is a no-op.
  const cachedFontFamily = typeof cached?.typography?.fontFamily === "string" ? (cached.typography.fontFamily as string) : undefined;
  const fontRegistered = await loadFontIfNeeded(cachedFontFamily);
  if (fontRegistered && cachedFontFamily) {
    // expo-font registers each entry under the KEY, so use the first
    // asset key as the family name to pass to React Native's fontFamily.
    bakedType.displayFamily = fontRegistered;
    bakedType.textFamily = fontRegistered;
  }

  // 3) Background refresh — don't await. If the fetched version is
  //    newer than cached, persist it so the NEXT cold launch shows it.
  //    Doing this after applyPayload means a slow network never delays
  //    the initial render.
  void refreshInBackground(cached);
}

async function refreshInBackground(cached: ThemePayload | null): Promise<void> {
  const fresh = await fetchTheme();
  if (!fresh) return;
  if (cached && fresh.version <= cached.version) return;
  await writeCache(fresh);
}
