// v1.0.192 — Shared card container for every admin row. Historically each
// admin screen defined its own `card` style with tiny differences (padding
// varying between 12 and 16, some using shadows.card and some using
// shadows.strong). AdminCard is the one card style — same padding, same
// radius, same shadow. Everything renders inside a single visual language.
//
// Composition (rather than props) is preferred for the header/body/actions
// slots so screens keep their layout flexibility. The card handles surface,
// border, radius, spacing, and pressability.
import React from "react";
import { StyleSheet, TouchableOpacity, View, type ViewProps } from "react-native";

import { colors, radius, shadows, spacing } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

export function AdminCard({
  children,
  onPress,
  style,
  testID,
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewProps["style"];
  testID?: string;
  disabled?: boolean;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return React.cloneElement(content, { testID });
  return (
    <TouchableOpacity
      onPress={() => { haptics.tap(); onPress(); }}
      activeOpacity={0.85}
      disabled={disabled}
      testID={testID}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
});
