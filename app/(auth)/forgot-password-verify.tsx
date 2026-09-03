import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { NestLogo } from "@/src/components/NestLogo";
import { nest, ApiError } from "@/src/api/nest";
import { haptics } from "@/src/utils/haptics";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";

// v1.0.133 — Step 2 of the password-reset flow. Six-box code input
// mirroring the signup verify screen. Verifying the code before we
// collect the new password lets us surface "code incorrect" without
// making the user re-type their new password. Successful verify
// pushes to /forgot-password-reset with the same email + code.
export default function ForgotPasswordVerify() {
  useBackFallback("/(auth)/forgot-password");
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email ?? "");

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);
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

  if (!email) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.body}>We couldn't find your reset request. Please start again.</Text>
          <Button title="Back to reset" onPress={() => router.replace("/(auth)/forgot-password")} style={{ marginTop: spacing.md }} />
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
      await nest.verifyPasswordResetCode(email, fullCode);
      haptics.success();
      router.push({ pathname: "/(auth)/forgot-password-reset", params: { email, code: fullCode } });
    } catch (e) {
      setDigits(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
      haptics.error();
      setErr(e instanceof ApiError ? e.friendly : "That code didn't work. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onDigit = (idx: number, val: string) => {
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
      await nest.requestPasswordReset(email);
      setInfo("New code sent. Check your email.");
      setResendCooldown(60); // matches server-side cooldown
    } catch (e) {
      setErr(e instanceof ApiError ? e.friendly : "Could not resend the code. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScroll contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <TouchableOpacity
              onPress={() => { haptics.tap(); safeBack(router, "/(auth)/forgot-password"); }}
              testID="forgot-verify-back"
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
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.body}>
            We sent a 6-digit code to <Text style={styles.emailBold}>{email}</Text>. Enter it below to continue.
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
                testID={`forgot-verify-digit-${i}`}
              />
            ))}
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}
          {info ? <Text style={styles.info}>{info}</Text> : null}

          <Button
            title={loading ? "Verifying…" : "Continue"}
            onPress={() => submit(digits.join(""))}
            loading={loading}
            disabled={digits.join("").length !== 6}
            testID="forgot-verify-submit"
            style={{ marginTop: spacing.md }}
          />

          <TouchableOpacity
            onPress={() => { haptics.tap(); void resend(); }}
            disabled={resendLoading || resendCooldown > 0}
            style={{ marginTop: spacing.lg }}
            testID="forgot-verify-resend"
           accessibilityRole="button">
            <Text style={[styles.link, (resendLoading || resendCooldown > 0) && { opacity: 0.5 }]}>
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : resendLoading ? "Sending…" : "Send a new code"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { haptics.tap(); router.replace("/(auth)/forgot-password"); }}
            style={{ marginTop: spacing.md }}
            testID="forgot-verify-restart"
           accessibilityRole="button">
            <Text style={styles.linkMuted}>Wrong email? Start over</Text>
          </TouchableOpacity>
        </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

// v1.0.227 — Verify-code refinement. Digit boxes use hairlineStrong
// borders on the white field surface so they read as clean input tiles.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { padding: spacing.lg, paddingBottom: spacing["2xl"] },
  top: { flexDirection: "row", justifyContent: "flex-start" },
  title: { ...typeTokens.display, fontSize: 24, marginBottom: 6 },
  body: { ...typeTokens.bodyLg, color: colors.onSurfaceMuted, marginBottom: spacing.lg, lineHeight: 20 },
  emailBold: { color: colors.onSurface, fontWeight: "700" },
  digits: { flexDirection: "row", justifyContent: "space-between", marginVertical: spacing.md },
  digitBox: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.field,
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  err: { ...typeTokens.caption, color: colors.error, marginTop: spacing.sm },
  info: { ...typeTokens.caption, color: colors.brand, marginTop: spacing.sm },
  link: { ...typeTokens.body, color: colors.brand, fontWeight: "700", textAlign: "center" },
  linkMuted: { ...typeTokens.body, color: colors.onSurfaceMuted, textAlign: "center" },
});
