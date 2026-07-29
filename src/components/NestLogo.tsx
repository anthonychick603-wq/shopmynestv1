import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/src/theme";

type Props = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
};

// In-app brand lockup: the nest illustration + wordmark.
// The image asset is a transparent PNG of the nest with hangtag, exported
// from the master logo so it stays crisp at 60/120/180 densities.
export function NestLogo({ title = "ShopMyNest", subtitle, compact }: Props) {
  const iconSize = compact ? 30 : 44;
  return (
    <View style={styles.wrap}>
      <Image
        source={require("../../assets/images/nest-mark.png")}
        style={{ width: iconSize, height: iconSize, marginRight: spacing.sm }}
        resizeMode="contain"
        accessible={false}
      />
      <View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center" },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.onSurface,
    letterSpacing: 0.2,
  },
  titleCompact: { fontSize: 17 },
  subtitle: {
    fontSize: 11,
    color: colors.onSurfaceMuted,
  },
});
