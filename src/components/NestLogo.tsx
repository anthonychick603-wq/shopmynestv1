import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "@/src/theme";

type Props = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
};

export function NestLogo({ title = "My Nest", subtitle, compact }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, compact && styles.iconCompact]}>
        <Ionicons name="leaf" size={compact ? 16 : 22} color={colors.brand} />
      </View>
      <View>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center" },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  iconCompact: { width: 30, height: 30 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.onSurface,
    letterSpacing: 0.2,
  },
  titleCompact: { fontSize: 16 },
  subtitle: {
    fontSize: 11,
    color: colors.onSurfaceMuted,
  },
});
