import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, radius, spacing } from "@/src/theme";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  /**
   * v1.0.224 — Optional trailing accessory (icon, unit label, clear button).
   * Rendered inside the input frame on the right, before the border.
   */
  rightAccessory?: React.ReactNode;
  /**
   * v1.0.224 — Optional leading accessory (search icon, currency symbol).
   */
  leftAccessory?: React.ReactNode;
};

// v1.0.73 — forwardRef enables focus chaining between inputs so auth forms
// can hop from email → password on "next" and submit on "done".
//
// v1.0.224 — Refinement pass. The old input used `surfaceTertiary` (peach)
// as its fill, which meant inputs were nearly invisible against the cream
// screen. The new treatment matches the Stripe/Linear card language the
// user picked:
//   • Pure white fill (`colors.field`) so the input reads as a distinct
//     interactive surface even on cream backgrounds.
//   • 1px `hairline` warm-neutral border, thickened + tinted terracotta
//     on focus (`colors.focus`), thickened red on error.
//   • Focus is tracked locally so we don't require every screen to wire
//     up onFocus / onBlur just to get a focus ring.
//   • Left / right accessory slots for inline icons, unit labels, clear
//     buttons — anything a form primitive normally has to nest awkwardly.
export const Input = React.forwardRef<TextInput, Props>(function Input(
  { label, error, hint, style, leftAccessory, rightAccessory, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.frame,
          focused ? styles.frameFocus : null,
          error ? styles.frameErr : null,
        ]}
      >
        {leftAccessory ? <View style={styles.leftSlot}>{leftAccessory}</View> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.onSurfaceMuted}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {rightAccessory ? <View style={styles.rightSlot}>{rightAccessory}</View> : null}
      </View>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.onSurface,
    marginBottom: spacing.xs,
    letterSpacing: 0.1,
  },
  frame: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.field,
    borderRadius: radius.field,
    borderWidth: 1,
    borderColor: colors.hairline,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  frameFocus: { borderColor: colors.focus, borderWidth: 1.5 },
  frameErr: { borderColor: colors.error, borderWidth: 1.5 },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 15,
    lineHeight: 21,
    color: colors.onSurface,
    // Height matches minHeight on the frame so the TextInput baseline
    // sits centered whether or not accessories are present.
  },
  leftSlot: { marginRight: spacing.sm, justifyContent: "center", alignItems: "center" },
  rightSlot: { marginLeft: spacing.sm, justifyContent: "center", alignItems: "center" },
  err: { color: colors.error, fontSize: 12, marginTop: 4 },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: 4 },
});
