import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { NestLogo } from "@/src/components/NestLogo";
import { nest, ApiError } from "@/src/api/nest";
import { haptics } from "@/src/utils/haptics";

// v1.0.133 — Step 1 of the password-reset flow. Asks for the email or
// username on the account, calls /auth/password-reset/request, and
// pushes to /forgot-password/verify. The server is deliberately
// oblivious to whether the account exists (always returns sent:true)
// so we can display the same "code sent" copy either way.
export default function ForgotPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState<string>(String(params.email ?? ""));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setErr("Please enter the email on your account.");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await nest.requestPasswordReset(trimmed);
      haptics.success();
      router.push({ pathname: "/(auth)/forgot-password-verify", params: { email: trimmed } });
    } catch (e) {
      setErr(e instanceof ApiError ? e.friendly : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <TouchableOpacity
              onPress={() => { haptics.tap(); router.back(); }}
              testID="forgot-back"
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
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.body}>
            Enter the email on your account. We'll send a 6-digit code you can use to choose a new password.
          </Text>

          <Input
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={submit}
            testID="forgot-email"
          />
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Button
            title="Send reset code"
            onPress={submit}
            loading={loading}
            disabled={loading || !email.trim()}
            testID="forgot-submit"
            style={{ marginTop: spacing.md }}
          />
          <TouchableOpacity onPress={() => { haptics.tap(); router.replace("/(auth)/login"); }} style={{ marginTop: spacing.lg }} testID="forgot-goto-login">
            <Text style={styles.link}>Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { padding: spacing.lg, paddingBottom: spacing["2xl"] },
  top: { flexDirection: "row", justifyContent: "flex-start" },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginBottom: 6 },
  body: { fontSize: 14, color: colors.onSurfaceMuted, marginBottom: spacing.lg, lineHeight: 20 },
  err: { color: colors.error, marginBottom: spacing.sm },
  link: { color: colors.brand, fontWeight: "700", textAlign: "center" },
});
