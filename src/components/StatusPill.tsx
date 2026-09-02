import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "@/src/theme";
import { statusColors, statusLabel, type Role } from "@/src/utils/orderStatus";

// v1.0.222 — pill now renders Title-Case labels via statusLabel() instead
// of shouting the raw enum token. "AWAITING_PAYMENT" → "Payment pending"
// for buyers, "Awaiting payment" for sellers. See src/utils/orderStatus.ts
// for the canonical map.
//
// Back-compat: `statusColors` is re-exported from the util so screens that
// import it from this file keep working.

export { statusColors };

export function StatusPill({
  status,
  role = "buyer",
  style,
}: {
  status: string;
  role?: Role;
  style?: object;
}) {
  const c = statusColors(status);
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }, style]}>
      <Text style={[styles.text, { color: c.fg }]}>{statusLabel(status, role)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  // v1.0.222 — no longer all caps; label is Title Case already.
  text: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
});
