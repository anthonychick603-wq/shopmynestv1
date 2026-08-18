// v1.0.73 — Slim offline banner. Renders under the status bar, above every
// screen. Uses only Animated (no reanimated), so it works everywhere.
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";
import { useNetwork } from "@/src/context/NetworkContext";

export function OfflineBanner() {
  const { isOffline } = useNetwork();
  const insets = useSafeAreaInsets();
  const translate = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.spring(translate, {
      toValue: isOffline ? 0 : -80,
      useNativeDriver: true,
      damping: 15,
      stiffness: 140,
    }).start();
  }, [isOffline, translate]);

  return (
    <Animated.View
      pointerEvents={isOffline ? "auto" : "none"}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.wrap,
        { paddingTop: insets.top + spacing.xs, transform: [{ translateY: translate }] },
      ]}
    >
      <View style={styles.pill}>
        <Ionicons name="cloud-offline-outline" size={16} color={colors.onBrand} />
        <Text style={styles.text}>You're offline. Retrying…</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: spacing.xs,
    zIndex: 1000,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.warning,
  },
  text: {
    color: colors.onBrand,
    fontSize: 13,
    fontWeight: "600",
  },
});
