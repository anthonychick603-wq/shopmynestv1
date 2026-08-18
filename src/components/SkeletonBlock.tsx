import React from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";

import { colors } from "@/src/theme";

// v1.0.71 — shared pulsing block used by ProductDetailSkeleton, CartSkeleton,
// OrderDetailSkeleton (and reusable elsewhere). Mirrors the DashboardSkeleton
// pattern from the seller dashboard: native-driven opacity pulse so it's cheap
// on Android and stays smooth under 60fps.
export function useSkeletonPulse() {
  const pulse = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

export function SkeletonBlock({ style, pulse }: { style?: ViewStyle | ViewStyle[]; pulse?: Animated.Value }) {
  const local = useSkeletonPulse();
  const anim = pulse ?? local;
  return <Animated.View style={[styles.block, { opacity: anim }, style]} />;
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surfaceTertiary, borderRadius: 12 },
});
