import React from "react";
import { Pressable, StyleSheet, TextInput, TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Input } from "./Input";
import { colors } from "@/src/theme";

type Props = Omit<TextInputProps, "secureTextEntry"> & {
  label?: string;
  error?: string;
  hint?: string;
};

// v1.0.243 — PasswordInput: a thin wrapper over Input that renders an
// eye toggle in the right accessory slot so buyers can reveal/hide the
// password while typing. Fixes the P1s where login, register, and the
// reset-password flow permanently masked their password fields with no
// way to verify what was typed — leading to failed logins, lockouts on
// freshly-created accounts, and confusing repeated password mismatches
// on reset. Secure entry stays the default and is only lifted while the
// buyer explicitly presses the eye.
export const PasswordInput = React.forwardRef<TextInput, Props>(function PasswordInput(
  props,
  ref,
) {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <Input
      ref={ref}
      {...props}
      secureTextEntry={!revealed}
      autoComplete={props.autoComplete ?? "password"}
      autoCorrect={false}
      autoCapitalize="none"
      rightAccessory={
        <Pressable
          onPress={() => setRevealed((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={revealed ? "Hide password" : "Show password"}
          style={styles.eye}
        >
          <Ionicons
            name={revealed ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={colors.onSurfaceMuted}
          />
        </Pressable>
      }
    />
  );
});

const styles = StyleSheet.create({
  eye: { padding: 4 },
});
