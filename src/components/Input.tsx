import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, radius, spacing } from "@/src/theme";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
};

// v1.0.73 — forwardRef enables focus chaining between inputs so auth forms
// can hop from email → password on "next" and submit on "done".
export const Input = React.forwardRef<TextInput, Props>(function Input(
  { label, error, hint, style, ...rest },
  ref,
) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.onSurfaceMuted}
        {...rest}
        style={[styles.input, error ? styles.inputErr : null, style]}
      />
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.onSurface,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputErr: { borderColor: colors.error },
  err: { color: colors.error, fontSize: 12, marginTop: 4 },
  hint: { color: colors.onSurfaceMuted, fontSize: 12, marginTop: 4 },
});
