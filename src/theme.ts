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
//
// v1.0.224 — Elite refinement pass.
//
// Zero palette changes. The seven values below stay locked so the
// remote theme plugin still owns them and every downstream import
// keeps working. What we DID do here:
//   • Introduce `card` (pure white) and `field` (white) surfaces so
//     the app stops being cream-on-cream. Screen background stays
//     cream; cards, inputs, sheets sit on top in white with a hairline
//     border. Follows the Stripe/Linear approach the user asked for.
//   • Introduce `hairline` — a warm-neutral 1px stroke used for card
//     borders, dividers, and field outlines. Warmer than pure gray so
//     it plays with the terracotta palette without visual clash.
//   • Add a proper focus ring color that isn't just the brand red so
//     inputs get a real focused state.
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
  // v1.0.224 — Refinement pass additions. All derived from existing
  // palette values so `mynest-theme` overrides on the plugin side never
  // clash with these unless the operator explicitly opts in later.
  //
  //   card         Elevated surface (pure white) — cards, sheets, modals,
  //                inputs. Sits on `surface` (cream). Gives the app a
  //                real two-layer hierarchy the design brief called for.
  //   field        Alias for card so form inputs read as surfaces.
  //   hairline     1px border for cards, fields, dividers. Warm-neutral
  //                that reads as "structure" rather than "line."
  //   hairlineStrong  Divider between distinct sections — slightly darker.
  //   focus        Border color for focused inputs. Deliberately not the
  //                same as `error` so the two states never blur together.
  //   overlay      Scrim for modals / sheets — warm dark instead of pure
  //                black, keeps the palette warm even when dimmed.
  //   badge        Neutral chip background (unread dots, count pills)
  //                that isn't the brand red — stops badges shouting.
  card: "#FFFFFF",
  field: "#FFFFFF",
  hairline: "#EFE3D6",
  hairlineStrong: "#E5D5C3",
  focus: "#C56A55",
  overlay: "rgba(62, 39, 35, 0.42)",
  badge: "#3E2723",
  onBadge: "#FFFFFF",
};

// v1.0.224 — Extended the spacing scale so screens can hit the 4/8/12/16/20/24/32/40/48
// rhythm without any 5s / 7s / 10s creeping in. Existing keys keep their prior values
// so no upstream layout shifts — we only added the missing rungs.
export const spacing: Record<string, number> = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  // v1.0.224 additions — more granular rungs for tightening padding & gaps.
  "3xs": 2,
  "2xs": 6,
  base: 10, // between sm(8) and md(12) — used inside chips / small cards
  "lg+": 20, // between lg(16) and xl(24) — useful for section gutters
};

// v1.0.224 — New radius rungs. `card` (14) is deliberately a hair tighter
// than the old md(16) so cards read as "container" rather than "pill."
// `field` (12) undercuts card so nested inputs feel contained. `chip`
// stays generous. `pill` unchanged.
export const radius: Record<string, number> = {
  sm: 8, md: 16, lg: 24, pill: 999,
  card: 14, field: 12, chip: 10,
};

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

// v1.0.224 — The Stripe/Linear treatment the user chose is:
// white fill + hairline warm-gray border + NO shadow. The existing
// `shadows.card` and `shadows.strong` stay exported because dozens of
// screens import them (Button primary, some tabbed sheets, floating
// action affordances). Refinement-pass code should prefer
// `elevation.flat` / `elevation.raised` below — those are the tokens
// that carry the new card language.
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

// v1.0.224 — Elevation vocabulary.
//
//   flat      No shadow, no elevation — the default treatment for the
//             new card system (white fill + hairline border).
//   raised    A whisper of shadow for elements that need to lift off
//             the cream (e.g. sticky headers, bottom action bars).
//   floating  Reserved for the tab-bar FAB and toasts.
//   modal     Sheet + centered modal shadow.
//
// These are OBJECT SPREADS — destructure into your `style` prop.
// Values were tuned against the actual cream surface so the shadow
// doesn't turn muddy on Android.
export const elevation = {
  flat: {
    // Deliberately empty. Use with hairline border for the Stripe look.
  },
  raised: {
    shadowColor: "#3E2723",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  floating: {
    shadowColor: "#3E2723",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  },
  modal: {
    shadowColor: "#3E2723",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
} as const;

// v1.0.224 — Type scale, rebuilt for real hierarchy.
//
// The design brief called out that the previous scale compressed —
// H1 / H2 / body all felt within a few pixels of each other and every
// header looked the same weight. This version restores real jumps:
//
//   display  32/38 800 — hero screens ('Discover shops', 'My Nest')
//   h1       24/30 800 — page titles ('Sold orders', 'Cart')
//   h2       19/26 700 — section headers ('Quick actions', 'Recent orders')
//   h3       16/22 700 — card titles, list item titles
//   bodyLg   16/22 500 — body copy in high-signal contexts
//   body     15/21 400 — default body
//   bodyMuted 14/20 400 — secondary explanatory copy
//   caption  13/18 500 — labels, timestamps, meta
//   micro    11/14 600 — uppercase eyebrow labels ('SHOPPING', 'ORDER')
//   price    22/26 800 — price displays
//
// letterSpacing tuned by role: display/h1 negative for tight elegance,
// micro positive for the uppercase eyebrow look. lineHeight lives on
// every entry so consumers don't guess.
//
// Existing `h1 h2 h3 body bodyMuted caption price` keys keep their
// prior semantics so screens that import them work unchanged; the
// numeric values shifted a little to line up with the new rhythm.
export const type: {
  displayFamily: string | undefined;
  textFamily: string | undefined;
  display: { fontSize: number; lineHeight: number; fontWeight: "800"; letterSpacing: number; color: string };
  h1: { fontSize: number; lineHeight: number; fontWeight: "800"; letterSpacing: number; color: string };
  h2: { fontSize: number; lineHeight: number; fontWeight: "700"; letterSpacing: number; color: string };
  h3: { fontSize: number; lineHeight: number; fontWeight: "700"; color: string };
  bodyLg: { fontSize: number; lineHeight: number; fontWeight: "500"; color: string };
  body: { fontSize: number; lineHeight: number; color: string };
  bodyMuted: { fontSize: number; lineHeight: number; color: string };
  caption: { fontSize: number; lineHeight: number; fontWeight: "500"; color: string };
  micro: { fontSize: number; lineHeight: number; fontWeight: "600"; letterSpacing: number; color: string };
  price: { fontSize: number; lineHeight: number; fontWeight: "800"; color: string };
} = {
  displayFamily: undefined, // system fonts, warm feel via weight
  textFamily: undefined,
  display: { fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.6, color: colors.onSurface },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.3, color: colors.onSurface },
  h2: { fontSize: 19, lineHeight: 26, fontWeight: "700", letterSpacing: -0.2, color: colors.onSurface },
  h3: { fontSize: 16, lineHeight: 22, fontWeight: "700", color: colors.onSurface },
  bodyLg: { fontSize: 16, lineHeight: 22, fontWeight: "500", color: colors.onSurface },
  body: { fontSize: 15, lineHeight: 21, color: colors.onSurface },
  bodyMuted: { fontSize: 14, lineHeight: 20, color: colors.onSurfaceMuted },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500", color: colors.onSurfaceMuted },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 0.6, color: colors.onSurfaceMuted },
  price: { fontSize: 22, lineHeight: 26, fontWeight: "800", color: colors.onSurface },
};
