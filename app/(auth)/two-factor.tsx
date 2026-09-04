// v1.0.217 (P0 #11) — Seller / admin 2FA email-code verification.
//
// Reached only from /(auth)/login when the server returned a
// `two_factor_required` challenge instead of a token. Reads the
// challenge id + masked email hint from route params (never pulled
// from storage — a stale hint would be misleading). On successful
// verify() the AuthContext seats the token and this screen replaces
// itself with (tabs). On failure the input clears and a friendly
// message explains the remaining attempts.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "@/src/api/nest";
import { Button } from "@/src/components/Button";
import { KeyboardAwareScroll } from "@/src/components/KeyboardAwareScroll";
import { NestLogo } from "@/src/components/NestLogo";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radius, spacing, type as typeTokens } from "@/src/theme";
import { haptics } from "@/src/utils/haptics";

export default function TwoFactorScreen() {
  const router = useRouter();
  const { twoFactorVerify, twoFactorResend } = useAuth();
  const params = useLocalSearchParams<{
    challenge_id?: string;
    email_hint?: string;
    expires_in?: string;
  }>();
  const challengeId = String(params.challenge_id ?? "");
  const emailHint = String(params.email_hint ?? "");
  const initialExpires = Math.max(0, Number(params.expires_in ?? 600));

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [expiresIn, setExpiresIn] = useState<number>(initialExpires);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const refs = useRef<Array<TextInput | null>>([]);

  // v1.0.243 — track outstanding redirect timers so an unmount or a
  // buyer-initiated navigation cancels the scheduled router.replace. Fixes
  // the P1 where a stale setTimeout could fire after the buyer went back
  // to /login themselves or started another auth action, hijacking the
  // navigation.
  const redirectTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const scheduleRedirect = React.useCallback((fn: () => void, ms: number) => {
    const h = setTimeout(() => {
      redirectTimersRef.current = redirectTimersRef.current.filter((x) => x !== h);
      fn();
    }, ms);
    redirectTimersRef.current.push(h);
  }, []);
  useEffect(() => {
    return () => {
      redirectTimersRef.current.forEach(clearTimeout);
      redirectTimersRef.current = [];
    };
  }, []);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  // Countdown for the expiry hint and the resend cooldown.
  useEffect(() => {
    const id = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
      setExpiresIn((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!challengeId) {
    // Direct nav lands here with nothing to verify — bounce to login.
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={{ padding: spacing.lg }}>
          <Text style={styles.body}>Your sign-in session has expired. Please sign in again.</Text>
          <Button title="Back to sign in" onPress={() => router.replace("/(auth)/login")} style={{ marginTop: spacing.md }} />
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
      await twoFactorVerify(challengeId, fullCode);
      router.replace("/(tabs)");
    } catch (e) {
      setDigits(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
      if (e instanceof ApiError) {
        // 410 Gone = challenge dead (expired / already used / user removed).
        // The best UX is to send them back to /login for a fresh attempt.
        if (e.status === 410 || e.status === 429) {
          setErr(e.friendly);
          scheduleRedirect(() => router.replace("/(auth)/login"), 1200);
        } else {
          setErr(e.friendly);
        }
      } else {
        setErr("That code didn't work. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onDigit = (idx: number, val: string) => {
    // Paste-the-whole-code path: split across boxes and auto-submit if we
    // got all six characters in one paste.
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
    if (key === "Backspace" && !digits[idx] && idx > 0) refs.current[idx - 1]?.focus();
  };

  const resend = async () => {
    setErr(null);
    setInfo(null);
    setResendLoading(true);
    try {
      const { resendsLeft } = await twoFactorResend(challengeId);
      setInfo(resendsLeft > 0 ? `New code sent. ${resendsLeft} resend${resendsLeft === 1 ? "" : "s"} left.` : "New code sent.");
      // Server enforces 3-per-challenge; cooldown here is UX friction to
      // discourage tapping repeatedly. 30s is enough for the email to arrive.
      setResendCooldown(30);
      // Fresh code resets the expiry window on the server (10 minutes).
      setExpiresIn(600);
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.friendly);
        if (e.status === 410 || e.status === 429) {
          scheduleRedirect(() => router.replace("/(auth)/login"), 1500);
        }
      } else {
        setErr("Could not resend the code. Please try again.");
      }
    } finally {
      setResendLoading(false);
    }
  };

  const expiryLine = expiresIn > 0
    ? `Code expires in ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}`
    : "Code expired. Tap \"Send a new code\" to receive a new one.";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScroll contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <TouchableOpacity
            onPress={() => { haptics.tap(); router.replace("/(auth)/login"); }}
            testID="twofa-back"
            accessibilityRole="button"
            accessibilityLabel="Back to sign in"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
        <View style={{ alignItems: "center", marginVertical: spacing.xl }}>
          <NestLogo />
        </View>
        <Text style={styles.title}>One more step</Text>
        <Text style={styles.body}>
          For your protection, seller and admin accounts need a verification
          code. We sent one to <Text style={styles.emailBold}>{emailHint || "your email"}</Text>.
        </Text>
        <Text style={styles.hint}>{expiryLine}</Text>

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
              testID={`twofa-digit-${i}`}
            />
          ))}
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}
        {info ? <Text style={styles.info}>{info}</Text> : null}

        <Button
          title={loading ? "Verifying…" : "Verify and sign in"}
          onPress={() => submit(digits.join(""))}
          loading={loading}
          disabled={digits.join("").length !== 6}
          testID="twofa-submit"
          style={{ marginTop: spacing.md }}
        />

        <TouchableOpacity
          onPress={() => { haptics.tap(); void resend(); }}
          disabled={resendLoading || resendCooldown > 0}
          style={{ marginTop: spacing.lg }}
          testID="twofa-resend"
          accessibilityRole="button"
        >
          <Text style={[styles.link, (resendLoading || resendCooldown > 0) && { opacity: 0.5 }]}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resendLoading ? "Sending…" : "Send a new code"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { haptics.tap(); router.replace("/(auth)/login"); }}
          style={{ marginTop: spacing.md }}
          testID="twofa-cancel"
          accessibilityRole="button"
        >
          <Text style={styles.linkMuted}>Cancel and sign in with a different account</Text>
        </TouchableOpacity>
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

// v1.0.227 — 2FA challenge refinement.
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  wrap: { padding: spacing.lg, paddingBottom: spacing["2xl"] },
  top: { flexDirection: "row", justifyContent: "flex-start" },
  title: { ...typeTokens.display, fontSize: 24, marginBottom: 6 },
  body: { ...typeTokens.bodyLg, color: colors.onSurfaceMuted, marginBottom: spacing.sm, lineHeight: 20 },
  hint: { ...typeTokens.caption, marginBottom: spacing.md },
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
