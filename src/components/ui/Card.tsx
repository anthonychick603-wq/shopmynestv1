import React from "react";
import { View, ViewProps, StyleSheet, TouchableOpacity, GestureResponderEvent } from "react-native";
import { colors, radius, spacing, elevation as elev } from "@/src/theme";

type Variant = "flat" | "raised" | "quiet";
type Padding = "none" | "sm" | "md" | "lg";

type Props = ViewProps & {
  /**
   * flat   — white fill + hairline border, no shadow (Stripe/Linear).
   *          This is the default treatment across the refinement pass.
   * raised — white fill + hairline border + a whisper of shadow. Reserved
   *          for sticky action bars, floating KPI hero cards, notification
   *          banners — anything that should visually detach from the page.
   * quiet  — cream fill (inherits screen surface) + hairline border. Used
   *          when a card is nested INSIDE another card and we want a
   *          subtle secondary layer without introducing pure white again.
   */
  variant?: Variant;
  /**
   * Semantic padding. Cards default to `md` (16px) so the whole app can
   * stop hand-writing padding numbers on every card. Use `none` when you
   * need edge-to-edge content (e.g. a card that hosts a full-bleed image).
   */
  padding?: Padding;
  /**
   * When set, the whole card becomes tappable. Adds a real touch target
   * with proper haptic pattern — but we let the caller pass the haptic to
   * keep this file free of side-effects.
   */
  onPress?: (event: GestureResponderEvent) => void;
};

// v1.0.224 — The Card primitive.
//
// One component, three variants, four padding scales. Every card across
// the app now goes through this so radii, borders, and padding stop
// drifting screen by screen.
export function Card({
  variant = "flat",
  padding = "md",
  onPress,
  style,
  children,
  ...rest
}: Props) {
  const containerStyle = [
    styles.base,
    variantStyles[variant],
    paddingStyles[padding],
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        {...(rest as any)}
        style={containerStyle}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View {...rest} style={containerStyle}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    // v1.0.224 — Cards clip children so nested images / gradients stop
    // spilling past the rounded corners. Historic bug on ProductCard.
    overflow: "hidden",
  },
});

const variantStyles = StyleSheet.create({
  flat: { backgroundColor: colors.card, ...elev.flat },
  raised: { backgroundColor: colors.card, ...elev.raised },
  quiet: { backgroundColor: colors.surface, borderColor: colors.hairline },
});

const paddingStyles = StyleSheet.create({
  none: { padding: 0 },
  sm: { padding: spacing.md },
  md: { padding: spacing.lg },
  lg: { padding: spacing.xl },
});
