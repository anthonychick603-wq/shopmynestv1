// The Nest — design tokens (from /app/design_guidelines.json).
export const colors = {
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
