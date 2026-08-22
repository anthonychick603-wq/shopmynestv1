// ⚠️  v1.0.143-test — DIAGNOSTIC PALETTE, DO NOT RELEASE ⚠️
// This palette is intentionally garish so we can visually verify that
// every screen and component reads its colors from theme.ts. Anything
// still showing warm terracotta/cream is hardcoded and must be fixed.
// Multiple pairings here fail WCAG (some below 2:1) — this build is
// unreadable by design. Revert to v1.0.142 tokens before any Play
// Store rollout.
// The Nest — design tokens (from /app/design_guidelines.json).
export const colors = {
  surface: "#ffac40",
  onSurface: "#ff2a00",
  onSurfaceMuted: "#ff7332",
  surfaceSecondary: "#fff6f6",
  surfaceTertiary: "#979695",
  brand: "#00d9ff",
  brandDark: "#2400c6",
  onBrand: "#7265ff",
  yellow: "#ffd145",
  green: "#6cab00",
  peach: "#ff8e56",
  border: "#ff00e6",
  borderStrong: "#00ffd0",
  divider: "#070400",
  error: "#e18ce3",
  success: "#80cd63",
  warning: "#fe03e9",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const;

export const radius = { sm: 8, md: 16, lg: 24, pill: 999 } as const;

// v1.0.95 — shared status color language across pills, badges, and cards.
// Historically StatusPill and RefundStatusCard picked slightly different
// amber/red tones for the same conceptual state, so a buyer looking at
// their order screen saw a "pending" pill in one hue next to a "requested"
// refund badge in another. Consuming these tokens keeps status semantics
// visually consistent everywhere.
export const statusPalette = {
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
} as const;

export type StatusTone = keyof typeof statusPalette;

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

export const type = {
  displayFamily: undefined as string | undefined, // system fonts, warm feel via weight
  textFamily: undefined as string | undefined,
  h1: { fontSize: 28, fontWeight: "800" as const, color: colors.onSurface },
  h2: { fontSize: 22, fontWeight: "800" as const, color: colors.onSurface },
  h3: { fontSize: 18, fontWeight: "700" as const, color: colors.onSurface },
  body: { fontSize: 15, color: colors.onSurface },
  bodyMuted: { fontSize: 14, color: colors.onSurfaceMuted },
  caption: { fontSize: 12, color: colors.onSurfaceMuted },
  price: { fontSize: 20, fontWeight: "800" as const, color: colors.onSurface },
};
