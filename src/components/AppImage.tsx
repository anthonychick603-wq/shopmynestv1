// v1.0.73 — Drop-in expo-image wrapper with:
//   - subtle placeholder background (surfaceTertiary)
//   - broken-image icon fallback on load error
//   - accessibilityLabel forwarding
//
// Use this in place of `Image` from "expo-image" for any remote URL. For
// local `require("...")` assets, the plain Image is fine.
import React, { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageProps } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/src/theme";

type Props = ImageProps & {
  /** Icon shown when the URL fails to load. Defaults to a mountain/photo glyph. */
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  /** Rounded corners on the fallback tile (matches your existing radius). */
  fallbackRadius?: number;
};

export function AppImage({
  fallbackIcon = "image-outline",
  fallbackRadius,
  onError,
  style,
  ...rest
}: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View
        style={[
          styles.fallback,
          fallbackRadius != null ? { borderRadius: fallbackRadius } : null,
          // expo-image's ImageStyle is a subset of ViewStyle for the properties we forward
          // to the fallback tile (dimensions, border, margin, position). Cast through the
          // common ViewStyle instead of any.
          style as StyleProp<ViewStyle>,
        ]}
      >
        <Ionicons name={fallbackIcon} size={24} color={colors.onSurfaceMuted} />
      </View>
    );
  }

  return (
    <Image
      {...rest}
      style={style}
      placeholderContentFit="cover"
      transition={200}
      placeholder={{ blurhash: "L6PZfSjE.AyE_3t7t7Rj~qofbHay" }}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
});
