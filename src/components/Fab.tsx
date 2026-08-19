// v1.0.95 — shared floating-action-button. Extracted from three
// verbatim-duplicated `styles.fab` blocks in `admin/coupons.tsx`,
// `seller/coupons.tsx`, and `me/addresses.tsx`. Encapsulates the
// brand-color pill, drop shadow, safe-area bottom offset, and haptic
// tap so every list-screen add button feels the same.
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

type Props = {
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  accessibilityLabel: string;
  testID?: string;
  // Extra offset added on top of the safe-area bottom inset. Defaults to
  // 24 so the FAB clears the tab bar on gesture-nav devices — matches the
  // hand-rolled `bottom: 24 + insets.bottom` we replaced.
  bottomOffset?: number;
};

export function Fab({ icon = "add", onPress, accessibilityLabel, testID, bottomOffset = 24 }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { bottom: bottomOffset + insets.bottom }]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.btn}
        onPress={() => { haptics.tap(); onPress(); }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        activeOpacity={0.85}
      >
        <Ionicons name={icon} size={26} color={colors.onBrand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // v1.0.95 — wrapping the touchable in an absolutely-positioned View lets
  // the shadow render correctly on Android (elevation on the touchable
  // itself gets clipped by SafeAreaView on some devices).
  wrap: { position: "absolute", right: spacing.xl },
  btn: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
});
