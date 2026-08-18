import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

import { colors, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { NestLogo } from "@/src/components/NestLogo";
import { useAuth } from "@/src/context/AuthContext";
import { toast } from "@/src/components/Toast";
import { ApiError, SITE } from "@/src/api/nest";
import { safeBack } from "@/src/utils/nav";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    setErr(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      setErr(e instanceof ApiError ? e.friendly : "Please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <TouchableOpacity onPress={() => safeBack(router, "/(tabs)")} testID="login-back">
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: "center", marginVertical: spacing["2xl"] }}>
            <NestLogo />
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.body}>Sign in to shop, follow makers, and manage your orders.</Text>

          <Input
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
            testID="login-email"
          />
          <Input
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            testID="login-password"
          />
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <Button title="Sign in" onPress={submit} loading={loading} testID="login-submit" style={{ marginTop: spacing.md }} />
          <TouchableOpacity onPress={() => router.replace("/(auth)/register")} style={{ marginTop: spacing.lg }} testID="login-goto-register">
            <Text style={styles.link}>New here? Create an account</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(`${SITE}/wp-login.php?action=lostpassword`)} style={{ marginTop: spacing.sm }} testID="login-forgot" accessibilityLabel="Forgot password" accessibilityRole="button">
            <Text style={styles.linkMuted}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Connected to shopmynest.com</Text>
            <Text style={styles.demoLine}>Use your existing website account.</Text>
            <Text style={styles.demoLine}>Forgot password → tap the link above to reset via the website.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { padding: spacing.lg, paddingBottom: spacing["2xl"] },
  top: { flexDirection: "row", justifyContent: "flex-end" },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginBottom: 6 },
  body: { fontSize: 14, color: colors.onSurfaceMuted, marginBottom: spacing.lg },
  err: { color: colors.error, marginBottom: spacing.sm },
  link: { color: colors.brand, fontWeight: "700", textAlign: "center" },
  linkMuted: { color: colors.onSurfaceMuted, textAlign: "center" },
  demo: { marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: 12 },
  demoTitle: { fontWeight: "700", color: colors.onSurface, marginBottom: 4, fontSize: 12 },
  demoLine: { fontSize: 12, color: colors.onSurfaceMuted },
});
