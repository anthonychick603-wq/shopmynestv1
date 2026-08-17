import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { Input } from "@/src/components/Input";
import { NestLogo } from "@/src/components/NestLogo";
import { useAuth } from "@/src/context/AuthContext";
import { ApiError } from "@/src/api/nest";
import { safeBack } from "@/src/utils/nav";

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!username.trim()) return setErr("Username is required");
    if (password.length < 8) return setErr("Password must be at least 8 characters");
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim(), username.trim());
      router.replace("/(tabs)");
    } catch (e) {
      setErr(e instanceof ApiError ? e.friendly : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <TouchableOpacity onPress={() => safeBack(router, "/(tabs)")} testID="register-back">
              <Ionicons name="close" size={26} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: "center", marginVertical: spacing.xl }}>
            <NestLogo />
          </View>
          <Text style={styles.title}>Create your Nest account</Text>
          <Text style={styles.body}>Join our community of makers and shoppers.</Text>

          <Input label="Full name" value={name} onChangeText={setName} testID="register-name" />
          <Input label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} testID="register-username" />
          <Input label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" testID="register-email" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters" testID="register-password" />
          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Button title="Create account" onPress={submit} loading={loading} testID="register-submit" style={{ marginTop: spacing.md }} />
          <TouchableOpacity onPress={() => router.replace("/(auth)/login")} style={{ marginTop: spacing.lg }} testID="register-goto-login">
            <Text style={styles.link}>Already have an account? Sign in</Text>
          </TouchableOpacity>
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
});
