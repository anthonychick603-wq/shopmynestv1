import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { haptics } from "@/src/utils/haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing, type as typeTokens } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { NestLogo } from "@/src/components/NestLogo";
import { useAuth } from "@/src/context/AuthContext";
import { ApiError } from "@/src/api/nest";
import { safeBack } from "@/src/utils/nav";

// v1.0.120 — the first half of the two-step signup flow.
//
// Full name and email are BOTH required, so the app can no longer be
// used to create wp_users rows with fake credentials (see the
// testuser123@example.com incident on Aug 21, 2026). This screen
// gathers the four fields, calls /auth/signup/start, and pushes to
// /(auth)/verify with the returned pending id — no user record has
// been created on the server yet at this point.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const router = useRouter();
  const { signupStart } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    setErr(null);
    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    // Client-side gate: every server error re-checks the same rules but
    // showing them here avoids a round-trip for typos.
    if (trimmedName.length < 2) return setErr("Please enter your full name");
    if (!trimmedUsername) return setErr("Username is required");
    if (!EMAIL_RE.test(trimmedEmail)) return setErr("Please enter a valid email address");
    if (password.length < 8) return setErr("Password must be at least 8 characters");
    setLoading(true);
    try {
      const { pendingId, email: sentTo } = await signupStart({
        name: trimmedName,
        username: trimmedUsername,
        email: trimmedEmail,
        password,
      });
      router.replace({
        pathname: "/(auth)/verify",
        params: { pendingId: String(pendingId), email: sentTo },
      });
    } catch (e) {
      setErr(e instanceof ApiError ? e.friendly : "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScroll contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <TouchableOpacity onPress={() => { haptics.tap(); safeBack(router, "/(tabs)"); }} testID="register-back" accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: "center", marginVertical: spacing.xl }}>
            <NestLogo />
          </View>
          <Text style={styles.title}>Create your Nest account</Text>
          <Text style={styles.body}>We'll email you a verification code to finish signing up.</Text>

          <Input
            label="Full name"
            value={name}
            onChangeText={setName}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => usernameRef.current?.focus()}
            hint="Required"
            testID="register-name"
          />
          <Input
            ref={usernameRef}
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            testID="register-username"
          />
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
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            hint="You'll get a code to verify this address"
            testID="register-email"
          />
          <Input
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            hint="At least 8 characters"
            testID="register-password"
          />
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Button title="Send verification code" onPress={submit} loading={loading} testID="register-submit" style={{ marginTop: spacing.md }} />
          <TouchableOpacity onPress={() => { haptics.tap(); router.replace("/(auth)/login"); }} style={{ marginTop: spacing.lg }} testID="register-goto-login" accessibilityRole="button">
            <Text style={styles.link}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

// v1.0.227 — Register refinement matches login. Display title, bodyLg
// intro, body link. Field spacing inherited from shared Input.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { padding: spacing.lg, paddingBottom: spacing["2xl"] },
  top: { flexDirection: "row", justifyContent: "flex-end" },
  title: { ...typeTokens.display, fontSize: 24, marginBottom: 6 },
  body: { ...typeTokens.bodyLg, color: colors.onSurfaceMuted, marginBottom: spacing.lg },
  err: { ...typeTokens.caption, color: colors.error, marginBottom: spacing.sm },
  link: { ...typeTokens.body, color: colors.brand, fontWeight: "700", textAlign: "center" },
});
