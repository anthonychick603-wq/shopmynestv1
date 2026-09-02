import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { nest, ApiError } from "@/src/api/nest";
import { colors, radius, spacing } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { toast } from "@/src/components/Toast";
import { safeBack } from "@/src/utils/nav";
import { haptics } from "@/src/utils/haptics";
import { useAuth } from "@/src/context/AuthContext";

// v1.0.219 (P0 #13) — personal data export ("email-a-ZIP").
//
// Google Play & App Store policy: give users a way to request every
// piece of data the app has stored about them, and deliver it via a
// durable channel they can access later (email). This screen sits
// under Account → Legal → "Download my data".
//
// UX contract:
//   • Explain what will be in the ZIP up front.
//   • Explain delivery ("we'll email you within 24 hours").
//   • One button — "Request my data" — that returns instantly with a
//     "we're on it" state (the actual build runs on the server via cron).
//   • If a request is already in flight or ready, show the current
//     state instead of a second button so we can't stack duplicate jobs.
//   • Server rate-limits at one active export per user; the UI mirrors
//     that so the button disables when a build is pending or ready.

type Status = "none" | "pending" | "building" | "ready" | "failed";

function formatDate(unixSeconds?: number): string {
  if (!unixSeconds) return "";
  try {
    const d = new Date(unixSeconds * 1000);
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

export default function DataExportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>("none");
  const [requestedAt, setRequestedAt] = useState<number | undefined>(undefined);
  const [readyAt, setReadyAt] = useState<number | undefined>(undefined);
  const [expiresAt, setExpiresAt] = useState<number | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const res = await nest.getDataExportStatus();
      setStatus(res.status);
      setRequestedAt(res.requested_at);
      setReadyAt(res.ready_at);
      setExpiresAt(res.expires_at);
    } catch (e) {
      // Silent — screen still works, request button will attempt anyway.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onRequest = async () => {
    haptics.tap();
    setSubmitting(true);
    try {
      const res = await nest.requestDataExport();
      setStatus((res.status as Status) || "pending");
      setRequestedAt(res.requested_at ?? Math.floor(Date.now() / 1000));
      setReadyAt(res.ready_at);
      setExpiresAt(res.expires_at);
      toast.success(res.message || "We'll email you when it's ready.");
    } catch (e) {
      const msg = e instanceof ApiError ? e.friendly : "We couldn't queue your export. Please try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const canRequest = !submitting && (status === "none" || status === "failed");
  const isPending = status === "pending" || status === "building";
  const isReady = status === "ready";

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Ionicons name="chevron-back" size={26} color={colors.onSurface} onPress={() => { haptics.tap(); safeBack(router, "/(tabs)/account"); }} testID="data-export-back" />
        <Text style={styles.headerTitle}>Download my data</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="archive-outline" size={40} color={colors.brand} />
        </View>
        <Text style={styles.title}>Get a copy of your My Nest data</Text>
        <Text style={styles.subtitle}>
          We'll build an archive of everything associated with your account and email a download link to{" "}
          <Text style={styles.subtitleEmail}>{user?.email || "your inbox"}</Text>. Most exports arrive within a few
          minutes, though on busy days it can take up to 24 hours.
        </Text>

        <View style={styles.bulletBlock}>
          <Text style={styles.bulletTitle}>What's in the archive</Text>
          <Bullet text="Your profile, addresses, and notification preferences." />
          <Bullet text="Orders you've placed and, if you sell, orders that included your products." />
          <Bullet text="Favorites, follows, saved searches, and reviews you've posted." />
          <Bullet text="Direct-message threads on your account." />
          <Bullet text="A list of devices registered for push (tokens redacted)." />
        </View>

        <View style={styles.bulletBlock}>
          <Text style={styles.bulletTitle}>Delivery and safety</Text>
          <Bullet text="The link is emailed to your account address only." />
          <Bullet text="Links stay valid for 7 days, then the archive is deleted from our servers." />
          <Bullet text="You can request a new export any time after downloading or after the link expires." />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brand} />
        ) : isPending ? (
          <View style={[styles.statusCard, styles.statusPending]}>
            <Ionicons name="time-outline" size={22} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>We're building your archive</Text>
              <Text style={styles.statusBody}>
                {requestedAt ? `Requested ${formatDate(requestedAt)}. ` : ""}
                We'll email you the download link when it's ready. You can safely close this screen.
              </Text>
            </View>
          </View>
        ) : isReady ? (
          <View style={[styles.statusCard, styles.statusReady]}>
            <Ionicons name="mail-outline" size={22} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Your archive is ready</Text>
              <Text style={styles.statusBody}>
                We emailed a download link to {user?.email || "your inbox"}
                {readyAt ? ` on ${formatDate(readyAt)}` : ""}
                {expiresAt ? `. The link expires on ${formatDate(expiresAt)}.` : "."}
              </Text>
            </View>
          </View>
        ) : status === "failed" ? (
          <View style={[styles.statusCard, styles.statusFailed]}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Last export didn't finish</Text>
              <Text style={styles.statusBody}>Tap the button below to try again.</Text>
            </View>
          </View>
        ) : null}

        {!isPending && !isReady ? (
          <Button
            title={submitting ? "Requesting…" : "Request my data"}
            onPress={onRequest}
            disabled={!canRequest}
            style={{ marginTop: spacing.xl }}
            testID="data-export-request"
          />
        ) : null}

        <Text style={styles.footNote}>
          Prefer to talk to us? Reply to any email from My Nest and we'll help.
        </Text>
      </ScrollView>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: colors.onSurface },
  body: { padding: spacing.lg },
  iconWrap: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.onSurface, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.sm, lineHeight: 20 },
  subtitleEmail: { color: colors.onSurface, fontWeight: "600" },
  bulletBlock: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
  },
  bulletTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.sm },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginTop: 6 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.onSurfaceMuted, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 13, color: colors.onSurface, lineHeight: 19 },
  statusCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xl,
    borderWidth: 1,
  },
  statusPending: { backgroundColor: colors.surfaceTertiary, borderColor: colors.divider },
  statusReady: { backgroundColor: colors.surfaceTertiary, borderColor: colors.success },
  statusFailed: { backgroundColor: colors.surfaceTertiary, borderColor: colors.error },
  statusTitle: { fontSize: 14, fontWeight: "700", color: colors.onSurface },
  statusBody: { fontSize: 13, color: colors.onSurfaceMuted, lineHeight: 18, marginTop: 4 },
  footNote: { fontSize: 12, color: colors.onSurfaceMuted, textAlign: "center", marginTop: spacing.xl, lineHeight: 18 },
});
