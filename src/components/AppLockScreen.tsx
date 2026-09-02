// v1.0.216 (P0 #10) — AppLockScreen: full-screen "Unlock" overlay.
//
// Rendered above every other screen while `useAppLock().locked` is true.
// On mount it fires the biometric prompt automatically; if that fails or
// the buyer cancels, an "Unlock" button lets them retry, and a low-key
// "Sign out" link is the escape hatch when biometrics are unavailable
// (buyer disabled Face ID / removed enrollment / broken fingerprint).

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppLock } from "@/src/context/AppLockContext";
import { colors, radius, spacing } from "@/src/theme";

export function AppLockScreen() {
  const { unlock, requestSignOut, capability } = useAppLock();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const promptedOnceRef = useRef(false);

  const attempt = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const kind = await unlock();
    if (kind === "cancelled") setMessage("Authentication cancelled. Tap Unlock to try again.");
    else if (kind === "unavailable") setMessage("Biometrics aren't set up on this device. Sign out and back in to use the app, or enable Face ID / fingerprint in your device settings.");
    else if (kind === "error") setMessage("Couldn't verify. Tap Unlock to try again.");
    setBusy(false);
  }, [busy, unlock]);

  // Fire the prompt automatically on first mount only — re-mounting the
  // overlay after a cancel would otherwise re-prompt in a loop.
  useEffect(() => {
    if (promptedOnceRef.current) return;
    promptedOnceRef.current = true;
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iconName: keyof typeof Ionicons.glyphMap =
    capability?.primaryType === "face" ? "scan-outline"
      : capability?.primaryType === "fingerprint" ? "finger-print"
        : "lock-closed";

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.center}>
        <View style={styles.icon}>
          <Ionicons name={iconName} size={44} color={colors.brand} />
        </View>
        <Text style={styles.title}>ShopMyNest is locked</Text>
        <Text style={styles.body}>
          Use {capability?.primaryType === "face" ? "Face ID" : capability?.primaryType === "fingerprint" ? "your fingerprint" : "your device biometrics"} to unlock the app.
        </Text>
        {message ? <Text style={styles.hint}>{message}</Text> : null}

        <TouchableOpacity
          style={styles.primary}
          onPress={attempt}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Unlock ShopMyNest"
          testID="app-lock-unlock"
        >
          {busy ? <ActivityIndicator color={colors.onBrand} /> : <Text style={styles.primaryText}>Unlock</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondary}
          onPress={requestSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          testID="app-lock-sign-out"
        >
          <Text style={styles.secondaryText}>Sign out instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    zIndex: 9999,
    elevation: 9999,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  icon: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.onSurface,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: colors.onSurfaceMuted,
    textAlign: "center",
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  hint: {
    fontSize: 13,
    color: colors.error,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  primary: {
    minWidth: 200,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  primaryText: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: "600",
  },
  secondary: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  secondaryText: {
    color: colors.onSurfaceMuted,
    fontSize: 14,
    textDecorationLine: "underline",
  },
});
