import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, type as typeTokens } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { PasswordInput } from "@/src/components/PasswordInput";
import { NestLogo } from "@/src/components/NestLogo";
import { useAuth } from "@/src/context/AuthContext";
import { nest, ApiError } from "@/src/api/nest";
import { haptics } from "@/src/utils/haptics";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";

// v1.0.133 — Step 3 of the password-reset flow. Collects a new
// password + confirmation, calls /auth/password-reset/confirm, and
// signs the user in with the returned token so they land straight
// on the tabs. If the server does not return a token (e.g. helper
// couldn't mint one), we send the user to /login with the email
// prefilled so they can sign in manually.
const MIN_LEN = 8;

export default function ForgotPasswordReset() {
  useBackFallback("/(auth)/forgot-password");
  const router = useRouter();
  const { adoptSessionToken } = useAuth();
  const params = useLocalSearchParams<{ email?: string; code?: string }>();
  const email = String(params.email ?? "");
  const code = String(params.code ?? "");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirmRef = useRef<TextInput>(null);

  if (!email || !code) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.body}>We couldn't find your reset request. Please start again.</Text>
          <Button title="Back to reset" onPress={() => router.replace("/(auth)/forgot-password")} style={{ marginTop: spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    setErr(null);
    if (password.length < MIN_LEN) {
      setErr(`Password must be at least ${MIN_LEN} characters.`);
      return;
    }
    if (password !== confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await nest.confirmPasswordReset({ email, code, new_password: password });
      haptics.success();
      if (res.token) {
        try {
          await adoptSessionToken(res.token);
          router.replace("/(tabs)");
          return;
        } catch {
          // Fall through to manual sign-in.
        }
      }
      // No token or adoption failed — punt to login with email prefilled.
      router.replace({ pathname: "/(auth)/login", params: { email } });
    } catch (e) {
      haptics.error();
      setErr(e instanceof ApiError ? e.friendly : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScroll contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <TouchableOpacity
              onPress={() => { haptics.tap(); safeBack(router, "/(auth)/forgot-password"); }}
              testID="forgot-reset-back"
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: "center", marginVertical: spacing.xl }}>
            <NestLogo />
          </View>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.body}>
            Set a new password for <Text style={styles.emailBold}>{email}</Text>. You'll be signed in right after.
          </Text>

          {/* v1.0.243 — reveal toggles on both new-password fields so
              buyers can verify they are entering matching values before
              committing a credential-changing action. */}
          <PasswordInput
            label="New password"
            value={password}
            onChangeText={setPassword}
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            testID="forgot-reset-password"
          />
          <PasswordInput
            ref={confirmRef}
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            testID="forgot-reset-confirm"
          />
          <Text style={styles.hint}>At least {MIN_LEN} characters.</Text>
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Button
            title="Set new password"
            onPress={submit}
            loading={loading}
            disabled={loading || !password || !confirm}
            testID="forgot-reset-submit"
            style={{ marginTop: spacing.md }}
          />
        </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { padding: spacing.lg, paddingBottom: spacing["2xl"] },
  top: { flexDirection: "row", justifyContent: "flex-start" },
  title: { ...typeTokens.display, fontSize: 24, marginBottom: 6 },
  body: { ...typeTokens.bodyLg, color: colors.onSurfaceMuted, marginBottom: spacing.lg, lineHeight: 20 },
  emailBold: { color: colors.onSurface, fontWeight: "700" },
  hint: { ...typeTokens.caption, marginTop: -spacing.xs, marginBottom: spacing.sm },
  err: { ...typeTokens.caption, color: colors.error, marginBottom: spacing.sm },
});
