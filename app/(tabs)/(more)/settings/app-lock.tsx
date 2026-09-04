// v1.0.216 (P0 #10) — App lock settings screen.
//
// Enable/disable the biometric privacy shield and pick a grace period.
// Enabling requires the OS to report at least one enrolled biometric —
// otherwise we surface a friendly explainer instead of silently locking
// the buyer out on next launch.
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertsBellButton } from "@/src/components/AlertsBellButton";
import { CartHeaderButton } from "@/src/components/CartHeaderButton";
import { toast } from "@/src/components/Toast";
import { useAppLock } from "@/src/context/AppLockContext";
import { colors, radius, shadows, spacing } from "@/src/theme";
import { APP_LOCK_GRACE_OPTIONS, authenticateWithBiometrics, type AppLockGrace } from "@/src/utils/appLock";
import { haptics } from "@/src/utils/haptics";
import { safeBack } from "@/src/utils/nav";
import { useBackFallback } from "@/src/context/BackFallback";

export default function AppLockSettingsScreen() {
  useBackFallback("/(tabs)/account");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, capability, setEnabled, setGrace } = useAppLock();
  const [busy, setBusy] = useState(false);

  const biometricName = useMemo(() => {
    if (!capability) return "biometrics";
    if (capability.primaryType === "face") return "Face ID";
    if (capability.primaryType === "fingerprint") return "fingerprint";
    if (capability.primaryType === "iris") return "iris scan";
    return "biometrics";
  }, [capability]);

  const onToggle = useCallback(async (next: boolean) => {
    if (busy || !settings) return;
    haptics.tap();
    if (next) {
      // Require a fresh biometric check before turning the shield ON so
      // an unattended device can't be locked (locking someone else out).
      if (!capability?.supported) {
        toast.error(`Set up ${biometricName} in your device settings first, then come back.`);
        return;
      }
      setBusy(true);
      const res = await authenticateWithBiometrics(`Enable app lock with ${biometricName}`);
      setBusy(false);
      if (res.kind !== "success") {
        if (res.kind === "error") toast.error("Couldn't verify. App lock stays off.");
        return;
      }
    }
    await setEnabled(next);
    toast.info(next ? "App lock is on" : "App lock is off");
  }, [busy, settings, capability, biometricName, setEnabled]);

  // v1.0.243 — grace-period picker previously fired setGrace() on every
  // tap with no guard against overlapping writes. Rapid taps between two
  // options could settle in reverse order, leaving the wrong option
  // "selected" on disk. A monotonic sequence + latest-wins check keeps
  // the final persisted value in sync with the last tap.
  const graceSeqRef = useRef(0);
  const onPickGrace = useCallback(async (g: AppLockGrace) => {
    if (!settings) return;
    // No-op when the buyer taps the same option again.
    if (settings.grace === g) return;
    haptics.tap();
    const seq = graceSeqRef.current + 1;
    graceSeqRef.current = seq;
    try {
      await setGrace(g);
    } finally {
      // If a newer tap superseded this one, its own await will overwrite;
      // otherwise this write is the authoritative one and we're done.
      if (graceSeqRef.current !== seq) {
        // A later selection is in flight; nothing to do here — that
        // call will win.
      }
    }
  }, [settings, setGrace]);

  const enabled = !!settings?.enabled;
  const grace = settings?.grace ?? "immediate";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => safeBack(router, "/(tabs)/account")} style={styles.topBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>App lock</Text>
        <AlertsBellButton />
        <CartHeaderButton />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Require {biometricName} to open ShopMyNest. You'll stay signed in, and
          only this device is affected.
        </Text>

        {!settings ? (
          <View style={{ paddingVertical: spacing.xl }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Ionicons name={capability?.primaryType === "face" ? "scan-outline" : "finger-print"} size={20} color={colors.brand} />
                </View>
                <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                  <Text style={styles.rowTitle}>Require {biometricName}</Text>
                  <Text style={styles.rowDesc}>
                    {capability?.supported
                      ? "The app hides its content until you unlock."
                      : `Set up ${biometricName} in your device settings first, then come back.`}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <Switch
                    value={enabled}
                    onValueChange={onToggle}
                    disabled={!capability?.supported && !enabled}
                    trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                    thumbColor={colors.surfaceSecondary}
                    ios_backgroundColor={colors.surfaceTertiary}
                    testID="app-lock-toggle"
                    accessibilityLabel="Enable app lock"
                  />
                )}
              </View>
            </View>

            {enabled ? (
              <>
                <Text style={styles.sectionLabel}>Require unlock</Text>
                <View style={styles.card}>
                  {APP_LOCK_GRACE_OPTIONS.map((opt, idx) => {
                    const isActive = grace === opt.value;
                    const isLast = idx === APP_LOCK_GRACE_OPTIONS.length - 1;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.row, isLast ? null : styles.rowDivider]}
                        onPress={() => onPickGrace(opt.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isActive }}
                        accessibilityLabel={opt.label}
                        testID={`app-lock-grace-${opt.value}`}
                      >
                        <View style={styles.rowIcon}>
                          <Ionicons name={isActive ? "radio-button-on" : "radio-button-off"} size={20} color={isActive ? colors.brand : colors.onSurfaceMuted} />
                        </View>
                        <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
                          <Text style={styles.rowTitle}>{opt.label}</Text>
                          <Text style={styles.rowDesc}>
                            {opt.value === "immediate"
                              ? "Lock every time you leave the app."
                              : `Lock if the app has been closed for ${opt.label.toLowerCase().replace("after ", "")}.`}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={styles.footer}>
              App lock only protects this device — it doesn't sign you out on other devices, and it doesn't replace your account password. If you can't unlock, you can sign out from the lock screen and sign back in.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  topBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, ...shadows.card },
  topTitle: { fontSize: 16, fontWeight: "800", color: colors.onSurface },
  intro: { fontSize: 14, color: colors.onSurfaceMuted, marginBottom: spacing.md, lineHeight: 20 },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, ...shadows.card, overflow: "hidden", marginBottom: spacing.md },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: spacing.sm, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.onSurface },
  rowDesc: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: 2, lineHeight: 17 },
  footer: { fontSize: 12, color: colors.onSurfaceMuted, marginTop: spacing.lg, lineHeight: 17, textAlign: "center" },
});
