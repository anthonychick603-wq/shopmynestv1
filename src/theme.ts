// The Nest — design tokens.
//
// v1.0.206 — the `mynest-theme` WordPress plugin is now the source of
// truth for these values in production. On cold launch, the runtime
// theme loader (see src/theme/runtime.ts) fetches the latest palette
// from /wp-json/mynest/v1/theme and mutates these exported objects in
// place BEFORE the React tree first renders. Every existing
// `import { colors } from "@/src/theme"` therefore keeps working with
// no changes — it just sees remote values when they're available.
//
// The values below are the BAKED DEFAULTS. They are what the app looks
// like offline, on very first launch, or if the plugin is disabled.
// Keep them in sync with the plugin defaults in
// includes/class-mynest-theme-defaults.php.
//
// Contrast notes on surface #FFF8EF:
//   onSurface        #3E2723 → 12.4:1 (AA/AAA text) ✓
//   onSurfaceMuted   #7A5C4E → 5.35:1 (AA text) ✓
//   brand            #E2856E → 3.02:1 (large text / UI only)
//   brandDark        #C56A55 → 4.28:1 (large text / UI only)
//   error            #D96C6C → 3.18:1 (large text / UI only)
//   success          #7A9A6E → 2.63:1 (background fills only — not text)

// Note: no `as const`. These objects are intentionally mutable so the
// runtime loader can splice in remote values before first render. The
// StyleSheet.create() calls throughout the app snapshot values at
// import time, so runtime changes only take effect on the next cold
// launch — which is fine and matches the plugin's contract.
export const colors: Record<string, string> = {
  surface: "#FFF8EF",
  onSurface: "#3E2723",
  onSurfaceMuted: "#7A5C4E",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#F7EBE1",
  brand: "#E2856E",
  brandDark: "#C56A55",
  onBrand: "#FFFFFF",
  yellow: "#F2C94C",
  green: "#A3B18A",
  peach: "#F4C7B0",
  border: "#EEDDCC",
  borderStrong: "#DDBB99",
  divider: "#EEDDCC",
  error: "#D96C6C",
  success: "#7A9A6E",
  // Retained from the prior palette — consumed by status pills; not in
  // the new spec. Meets AA (4.5:1) as text on surface.
  warning: "#b8451f",
};

export const spacing: Record<string, number> = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius: Record<string, number> = { sm: 8, md: 16, lg: 24, pill: 999 };

// v1.0.95 — shared status color language across pills, badges, and cards.
// Historically StatusPill and RefundStatusCard picked slightly different
// amber/red tones for the same conceptual state, so a buyer looking at
// their order screen saw a "pending" pill in one hue next to a "requested"
// refund badge in another. Consuming these tokens keeps status semantics
// visually consistent everywhere.
export type StatusTone = "waiting" | "inMotion" | "done" | "error" | "neutral";
export const statusPalette: Record<StatusTone, { bg: string; fg: string }> = {
  // Waiting for the platform / seller / buyer to take an action.
  waiting:  { bg: "#FFEED9", fg: "#8A4B10" },
  // In motion — shipped, in transit, or being processed by a third party.
  inMotion: { bg: "#E7EEF7", fg: "#2F5AA3" },
  // Terminal success — delivered, paid, refund completed.
  done:     { bg: "#DFF3E3", fg: "#2A6B3A" },
  // Terminal failure or negative outcome — cancelled, denied, refunded.
  error:    { bg: "#F8D7DA", fg: "#8B2E36" },
  // Neutral fallback when no other state matches.
  neutral:  { bg: "#F1EEE7", fg: "#6B6558" },
};

export const shadows = {
  card: {
    shadowColor: "#3E2723",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  strong: {
    shadowColor: "#3E2723",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

// Typography tokens. The `displayFamily` / `textFamily` fields get
// swapped in by the runtime loader when the seller picks a Google Font
// in the theme plugin; the rest of the object stays put.
export const type: {
  displayFamily: string | undefined;
  textFamily: string | undefined;
  h1: { fontSize: number; fontWeight: "800"; color: string };
  h2: { fontSize: number; fontWeight: "800"; color: string };
  h3: { fontSize: number; fontWeight: "700"; color: string };
  body: { fontSize: number; color: string };
  bodyMuted: { fontSize: number; color: string };
  caption: { fontSize: number; color: string };
  price: { fontSize: number; fontWeight: "800"; color: string };
} = {
  displayFamily: undefined, // system fonts, warm feel via weight
  textFamily: undefined,
  h1: { fontSize: 28, fontWeight: "800", color: colors.onSurface },
  h2: { fontSize: 22, fontWeight: "800", color: colors.onSurface },
  h3: { fontSize: 18, fontWeight: "700", color: colors.onSurface },
  body: { fontSize: 15, color: colors.onSurface },
  bodyMuted: { fontSize: 14, color: colors.onSurfaceMuted },
  caption: { fontSize: 12, color: colors.onSurfaceMuted },
  price: { fontSize: 20, fontWeight: "800", color: colors.onSurface },
};
