import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { haptics } from "@/src/utils/haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { NestLogo } from "@/src/components/NestLogo";
import { useAuth } from "@/src/context/AuthContext";
import { ApiError } from "@/src/api/nest";

// v1.0.120 — Step 2 of the signup flow. Renders a 6-box code input,
// a resend button (respects the server's 5-minute cooldown), and a
// "change email" escape hatch that sends the user back to Step 1.
// Successful verify() populates the auth token and pushes to (tabs).
export default function Verify() {
  const router = useRouter();
  const { signupVerify, signupResend } = useAuth();
  const params = useLocalSearchParams<{ pendingId?: string; email?: string }>();
  const pendingId = Number(params.pendingId ?? 0);
  const email = String(params.email ?? "");

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const refs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  if (!pendingId) {
    // If somebody navigates here directly, punt back to Step 1.
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.body}>We couldn't find your signup. Please start again.</Text>
          <Button title="Back to sign up" onPress={() => router.replace("/(auth)/register")} style={{ marginTop: spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  const submit = async (fullCode: string) => {
    if (fullCode.length !== 6) return;
    setErr(null);
    setInfo(null);
    setLoading(true);
    try {
      await signupVerify({ pendingId, code: fullCode });
      router.replace("/(tabs)");
    } catch (e) {
      setDigits(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
      setErr(e instanceof ApiError ? e.friendly : "That code didn't work. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onDigit = (idx: number, val: string) => {
    // Users often paste the whole 6-digit code into the first box; split it.
    const cleaned = val.replace(/\D+/g, "");
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      chars.forEach((c, i) => { next[i] = c; });
      setDigits(next);
      const focusIdx = Math.min(chars.length, 5);
      refs.current[focusIdx]?.focus();
      if (chars.length === 6) void submit(chars.join(""));
      return;
    }
    const next = [...digits];
    next[idx] = cleaned;
    setDigits(next);
    if (cleaned && idx < 5) refs.current[idx + 1]?.focus();
    if (next.every((d) => d.length === 1)) void submit(next.join(""));
  };

  const onKey = (idx: number, key: string) => {
    if (key === "Backspace" && !digits[idx] && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const resend = async () => {
    setErr(null);
    setInfo(null);
    setResendLoading(true);
    try {
      await signupResend(pendingId);
      setInfo("New code sent. Check your email.");
      setResendCooldown(300); // matches server-side cooldown
    } catch (e) {
      if (e instanceof ApiError && e.body && typeof e.body === "object" && "message" in e.body) {
        setErr(String((e.body as { message?: string }).message ?? e.friendly));
      } else {
        setErr(e instanceof ApiError ? e.friendly : "Could not resend the code. Please try again.");
      }
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScroll contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <TouchableOpacity
              onPress={() => { haptics.tap(); router.replace("/(auth)/register"); }}
              testID="verify-change-email"
              accessibilityRole="button"
              accessibilityLabel="Change email"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
          <View style={{ alignItems: "center", marginVertical: spacing.xl }}>
            <NestLogo />
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.body}>
            We sent a 6-digit code to <Text style={styles.emailBold}>{email}</Text>. Enter it below to finish creating your account.
            You can also just tap the link in the email on this device.
          </Text>

          <View style={styles.digits}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                value={d}
                onChangeText={(v) => onDigit(i, v)}
                onKeyPress={(e) => onKey(i, e.nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={i === 0 ? 6 : 1}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                style={styles.digitBox}
                testID={`verify-digit-${i}`}
              />
            ))}
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <Button
            title={loading ? "Verifying…" : "Verify email"}
            onPress={() => submit(digits.join(""))}
            loading={loading}
            disabled={digits.join("").length !== 6}
            testID="verify-submit"
            style={{ marginTop: spacing.md }}
          />

          <TouchableOpacity
            onPress={() => { haptics.tap(); void resend(); }}
            disabled={resendLoading || resendCooldown > 0}
            style={{ marginTop: spacing.lg }}
            testID="verify-resend"
          >
            <Text style={[styles.link, (resendLoading || resendCooldown > 0) && { opacity: 0.5 }]}>
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : resendLoading ? "Sending…" : "Send a new code"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { haptics.tap(); router.replace("/(auth)/register"); }}
            style={{ marginTop: spacing.md }}
            testID="verify-restart"
          >
            <Text style={styles.linkMuted}>Wrong email? Start over</Text>
          </TouchableOpacity>
        </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { padding: spacing.lg, paddingBottom: spacing["2xl"] },
  top: { flexDirection: "row", justifyContent: "flex-start" },
  title: { fontSize: 24, fontWeight: "800", color: colors.onSurface, marginBottom: 6 },
  body: { fontSize: 14, color: colors.onSurfaceMuted, marginBottom: spacing.lg, lineHeight: 20 },
  emailBold: { color: colors.onSurface, fontWeight: "700" },
  digits: { flexDirection: "row", justifyContent: "space-between", marginVertical: spacing.md },
  digitBox: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  err: { color: colors.error, marginTop: spacing.sm },
  info: { color: colors.brand, marginTop: spacing.sm },
  link: { color: colors.brand, fontWeight: "700", textAlign: "center" },
  linkMuted: { color: colors.onSurfaceMuted, textAlign: "center" },
});
