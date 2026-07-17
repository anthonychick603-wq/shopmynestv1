export const palette = {
  // The original natural palette, lifted slightly for a brighter mobile UI.
  peachtree: '#F29F82',
  forest: '#294B32',
  sunflower: '#F4C84B',
  mist: '#F6F3F0',
  stream: '#A9CDE5',
  meadow: '#B4C96F',
  blossom: '#FFD9CC',
  fern: '#6FA05A',
  earth: '#20221E',
};

export const colors = {
  ...palette,

  // App surfaces stay calm so the richer brand colors stand out.
  background: palette.mist,
  surface: '#FFFCF8',
  surfaceMuted: '#FFF0EA',
  border: '#C9D292',

  // Brand actions
  primary: palette.forest,
  primarySoft: palette.fern,
  accent: palette.sunflower,
  accentSoft: palette.meadow,
  info: palette.stream,

  // Typography
  text: palette.earth,
  muted: '#586253',
  placeholder: '#778171',

  // Semantic states
  success: '#3F7A3B',
  successSoft: '#DCE8B7',
  warning: '#8D6100',
  warningSoft: '#F9E29A',
  danger: '#A8493F',
  dangerSoft: '#F8C5B4',

  // Foreground colors
  onPrimary: '#FFFFFF',
  onAccent: palette.earth,
  onSuccess: '#FFFFFF',
  onDanger: '#FFFFFF',
  white: '#FFFFFF',
  black: palette.earth,
  overlay: 'rgba(32, 34, 30, 0.66)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};
