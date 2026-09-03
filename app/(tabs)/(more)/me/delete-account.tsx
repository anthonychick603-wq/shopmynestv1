import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";
import { haptics } from "@/src/utils/haptics";
import { useAuth } from "@/src/context/AuthContext";

// v1.0.211 (P0 #5) — self-serve account deletion with 14-day grace.
// Google Play's 2024 policy requires an in-app path (not a web link),
// clear consequences up front, and a cool-off window during which the
// user can cancel. This screen walks the user through both.
//
// UX contract:
//   • Explain exactly what happens now (schedule + logout) and later
//     (permanent delete on day 14).
//   • Require the user to type "DELETE" so the confirm button can't be
//     tapped by accident.
//   • On success, show the confirmation with the scheduled date, then
//     force a local sign-out and drop back to the login screen.
//   • Server also emails an undo link — mention it so the user knows
//     they have that path too.

const GRACE_DAYS = 14;

function formatDate(unixSeconds: number): string {
  try {
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

export default function DeleteAccountScreen() {
  useBackFallback("/(tabs)/account");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { logout, user } = useAuth();
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ scheduledFor: number } | null>(null);

  const canSubmit = confirm.trim().toUpperCase() === "DELETE" && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    haptics.warning();
    setSubmitting(true);
    try {
      const res = await nest.requestAccountDeletion("DELETE");
      // Server has already revoked our token; any further nest.* call
      // would 401. Force a local sign-out so the tab UI clears before
      // we bounce to the login screen.
      setDone({ scheduledFor: res.scheduled_for ?? Math.floor(Date.now() / 1000) + GRACE_DAYS * 86400 });
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "We couldn't schedule the deletion. Please try again.";
      toast.error(msg);
      setSubmitting(false);
    }
  };

  const onFinish = async () => {
    haptics.tap();
    try { await logout(); } catch { /* best effort */ }
    router.replace("/(auth)/login");
  };

  if (done) {
    const dateStr = formatDate(done.scheduledFor);
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={styles.headerTitle}>Deletion scheduled</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.doneIconWrap}>
            <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          </View>
          <Text style={styles.doneTitle}>Your account will be deleted on {dateStr || `${GRACE_DAYS} days from now`}.</Text>
          <Text style={styles.doneBody}>
            You have {GRACE_DAYS} days to change your mind. Signing in during that window will show a reminder — contact
            support or use the cancellation link we emailed to {user?.email || "your inbox"} to keep your account.
          </Text>
          <View style={styles.doneCard}>
            <Ionicons name="mail-outline" size={20} color={colors.brand} />
            <Text style={styles.doneCardText}>
              Check your email — we sent a confirmation with a one-tap link to cancel this request.
            </Text>
          </View>
          <Button title="Sign out and close" onPress={onFinish} style={{ marginTop: spacing.xl }} testID="delete-account-done" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Ionicons name="chevron-back" size={26} color={colors.onSurface} onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} testID="delete-account-back" />
        <Text style={styles.headerTitle}>Delete my account</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 44}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.warnIconWrap}>
            <Ionicons name="warning" size={40} color={colors.error} />
          </View>
          <Text style={styles.title}>Delete your My Nest account</Text>
          <Text style={styles.subtitle}>
            When you delete your account, we schedule it for permanent removal in {GRACE_DAYS} days. You'll be signed out
            immediately, and you can cancel any time before day {GRACE_DAYS} to keep everything.
          </Text>

          <View style={styles.bulletBlock}>
            <Text style={styles.bulletTitle}>What happens right away</Text>
            <Bullet text="You're signed out of every device." />
            <Bullet text="Your active listings are hidden from buyers." />
            <Bullet text="You can't sign back in until you cancel or contact support." />
          </View>

          <View style={styles.bulletBlock}>
            <Text style={styles.bulletTitle}>What happens after {GRACE_DAYS} days</Text>
            <Bullet text="Your account, profile, favorites, follows, messages, and reviews are permanently deleted." />
            <Bullet text="Order history required by law is retained but stripped of personal details." />
            <Bullet text="Any remaining seller balance must be settled before you can schedule deletion." />
          </View>

          <Text style={styles.confirmLabel}>Type DELETE to confirm</Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.confirmInput}
            placeholder="DELETE"
            placeholderTextColor={colors.onSurfaceMuted}
            testID="delete-account-confirm"
          />

          <Button
            title={submitting ? "Scheduling…" : `Schedule deletion in ${GRACE_DAYS} days`}
            onPress={onSubmit}
            disabled={!canSubmit}
            style={{ marginTop: spacing.lg, backgroundColor: colors.error, borderColor: colors.error }}
            testID="delete-account-submit"
          />
          {submitting ? <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.error} /> : null}

          <Text style={styles.footNote}>
            Changed your mind later? Open the cancellation link from the confirmation email, or reach out to support
            before the {GRACE_DAYS}-day window closes.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  body: { padding: spacing.lg },
  warnIconWrap: { alignSelf: "center", width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 },
  bulletBlock: { marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg },
  bulletTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: 6 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.onSurfaceMuted, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 13, color: colors.onSurface, lineHeight: 19 },
  confirmLabel: { marginTop: spacing.xl, fontSize: 13, fontWeight: "700", color: colors.onSurface },
  confirmInput: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16, color: colors.onSurface, backgroundColor: colors.surface, letterSpacing: 2, fontWeight: "700" },
  footNote: { fontSize: 12, color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.xl, lineHeight: 18 },
  doneIconWrap: { alignSelf: "center", marginTop: spacing.xl, marginBottom: spacing.lg },
  doneTitle: { fontSize: 20, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  doneBody: { fontSize: 14, color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  doneCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, marginTop: spacing.xl },
  doneCardText: { flex: 1, fontSize: 13, color: colors.onSurface, lineHeight: 18 },
});
